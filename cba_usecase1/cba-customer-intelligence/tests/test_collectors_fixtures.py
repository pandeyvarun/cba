"""Live collectors against recorded fixtures: no network, no credentials, no third-party SDKs required."""
import json
import sys
import types
from datetime import date, datetime
from pathlib import Path

import pytest

from ci.collect.app_store import AppStoreCollector
from ci.collect.google_play import GooglePlayCollector
from ci.collect.reddit import RedditCollector
from ci.collect.servicenow import ServiceNowCollector

FIX = Path(__file__).parent / "fixtures"


class FakeResp:
    def __init__(self, payload, status=200):
        self._p, self.status_code = payload, status

    def json(self):
        return self._p

    def raise_for_status(self):
        assert self.status_code < 400


def test_app_store_parses_feed_and_skips_metadata_entry(monkeypatch):
    payload = json.loads((FIX / "app_store_page1.json").read_text())
    calls = []

    def fake_get(url, timeout):
        calls.append(url)
        return FakeResp(payload if len(calls) == 1 else {"feed": {}})
    monkeypatch.setattr("ci.collect.app_store.requests.get", fake_get)
    rows = list(AppStoreCollector("Apple", "CBA", {"app_id": "310251202", "pages": 3}).fetch())
    assert [r.id for r in rows] == ["11111", "11112"]
    assert rows[0].rating == 1 and rows[0].text.startswith("Crashes on login.") and rows[0].date == "2026-11-02"
    assert len(calls) == 2            # stopped at the first empty page


def test_app_store_since_cuts_off_older_reviews(monkeypatch):
    payload = json.loads((FIX / "app_store_page1.json").read_text())
    monkeypatch.setattr("ci.collect.app_store.requests.get", lambda url, timeout: FakeResp(payload))
    rows = list(AppStoreCollector("Apple", "CBA", {"app_id": "1", "pages": 1}).fetch(since=date(2026, 11, 1)))
    assert [r.id for r in rows] == ["11111"]


def test_servicenow_builds_text_and_since_query(monkeypatch):
    payload = json.loads((FIX / "servicenow_page.json").read_text())
    seen = {}

    def fake_get(url, auth, timeout, params, headers):
        seen.update(url=url, params=params, auth=auth)
        return FakeResp(payload if params["sysparm_offset"] == 0 else {"result": []})
    monkeypatch.setattr("ci.collect.servicenow.requests.get", fake_get)
    monkeypatch.setenv("SERVICENOW_INSTANCE", "bank.service-now.com")
    monkeypatch.setenv("SERVICENOW_USER", "svc")
    monkeypatch.setenv("SERVICENOW_PASSWORD", "pw")
    params = {"table": "sn_customerservice_case", "query": "category=feedback", "text_fields": ["short_description", "description"], "limit": 1000}
    rows = list(ServiceNowCollector("SN", "CBA", params).fetch(since=date(2026, 10, 1)))
    assert seen["url"] == "https://bank.service-now.com/api/now/table/sn_customerservice_case"
    assert seen["params"]["sysparm_query"] == "category=feedback^opened_at>=2026-10-01"
    assert rows[0].text == "Cannot log in. Customer locked out after netcode failed." and rows[0].id == "CS0001"
    assert rows[1].text == "Fee dispute"


def test_google_play_paginates_and_stops_at_since(monkeypatch):
    pages = [
        ([{"reviewId": "a", "at": datetime(2026, 11, 5), "content": "Great", "score": 5, "userName": "x", "appVersion": "1", "thumbsUpCount": 0}], "tok"),
        ([{"reviewId": "b", "at": datetime(2026, 8, 1), "content": "Old", "score": 2, "userName": "y", "appVersion": "1", "thumbsUpCount": 0}], None),
    ]
    it = iter(pages)
    mod = types.ModuleType("google_play_scraper")
    mod.Sort = types.SimpleNamespace(NEWEST=1)
    mod.reviews = lambda *a, **k: next(it)
    monkeypatch.setitem(sys.modules, "google_play_scraper", mod)
    rows = list(GooglePlayCollector("GP", "CBA", {"package": "p", "count": 500}).fetch(since=date(2026, 10, 1)))
    assert [r.id for r in rows] == ["a"] and rows[0].rating == 5


def test_reddit_filters_by_keyword_and_date(monkeypatch):
    C = lambda i, body, ts: types.SimpleNamespace(id=i, body=body, created_utc=ts, author="u", permalink=f"/r/x/{i}", score=1)
    comments = [C("1", "NetBank is down again", 1793000000), C("2", "unrelated pasta recipe", 1793000000), C("3", "commbank old", 1600000000)]
    praw = types.ModuleType("praw")
    praw.Reddit = lambda **k: types.SimpleNamespace(subreddit=lambda n: types.SimpleNamespace(comments=lambda limit: comments))
    monkeypatch.setitem(sys.modules, "praw", praw)
    monkeypatch.setenv("REDDIT_CLIENT_ID", "x")
    monkeypatch.setenv("REDDIT_CLIENT_SECRET", "y")
    rows = list(RedditCollector("R", "CBA", {"subreddit": "CommBank", "keywords": ["commbank", "netbank"]}).fetch(since=date(2026, 1, 1)))
    assert [r.id for r in rows] == ["1"] and rows[0].source == "Reddit r/CommBank"


def test_hackernews_unescapes_html_and_skips_empty(monkeypatch):
    from ci.collect.hackernews import HackerNewsCollector
    payload = json.loads((FIX / "hn_search.json").read_text())
    calls = []

    def fake_get(url, params, timeout, headers):
        calls.append(params)
        return FakeResp(payload if params["page"] == 0 else {"hits": []})
    monkeypatch.setattr("ci.collect.hackernews.requests.get", fake_get)
    rows = list(HackerNewsCollector("HN", "CBA", {"query": "commbank", "pages": 3}).fetch(since=date(2026, 11, 1)))
    # the date cut-off is applied server-side (numericFilters), so the mock returns it all; only empty comments are dropped here
    assert [r.id for r in rows] == ["1001", "1002"]
    assert rows[0].text == "CommBank's app locks me out every time I update & log in"
    assert rows[0].source == "Hacker News" and rows[0].date == "2026-11-03" and rows[0].bank == "CBA"
    assert calls[0]["query"] == "commbank" and calls[0]["tags"] == "comment" and "numericFilters" in calls[0]
    assert len(calls) == 2                       # stopped at the first empty page


def test_reddit_archive_retries_pages_and_filters(monkeypatch):
    from ci.collect.reddit_archive import RedditArchiveCollector
    monkeypatch.setattr("ci.collect.reddit_archive.time.sleep", lambda s: None)
    post = lambda i, t, ts: {"id": i, "title": t, "selftext": "body text", "created_utc": ts, "author": "u", "permalink": f"/r/CommBank/{i}", "score": 3}
    cm = lambda i, b, ts: {"id": i, "body": b, "created_utc": ts, "author": "u", "permalink": f"/r/CommBank/c/{i}", "score": 1}
    calls = {"posts/search": 0, "comments/search": 0}
    seen_params = []

    def fake_get(url, params, headers, timeout):
        path = url.split("/api/")[1]
        seen_params.append((path, dict(params)))
        calls[path] += 1
        if path == "posts/search":
            if calls[path] == 1:
                return FakeResp({"data": None, "error": "Timeout. Maybe slow down a bit"})      # first call times out -> retried
            return FakeResp({"data": [post("p1", "NetBank outage", 1793000000), post("p2", "Removed", 1792999000)] if calls[path] == 2 else []})
        return FakeResp({"data": [cm("c1", "commbank app crashes", 1793000100), cm("c2", "completely unrelated", 1793000050),
                                  cm("c3", "[deleted]", 1793000040)] if calls[path] == 1 else []})
    monkeypatch.setattr("ci.collect.reddit_archive.requests.get", fake_get)
    rows = list(RedditArchiveCollector("R", "CBA", {"subreddit": "CommBank", "keywords": ["commbank", "netbank"], "post_limit": 5, "comment_limit": 5}).fetch(since=date(2026, 1, 1)))
    ids = [r.id for r in rows]
    assert "t3_p1" in ids and "t1_c1" in ids                       # posts + keyword-matching comment kept
    assert "t1_c2" not in ids and "t1_c3" not in ids               # off-topic and deleted comments dropped
    assert next(r for r in rows if r.id == "t3_p1").text == "NetBank outage. body text"
    assert all(r.source == "Reddit r/CommBank" and r.channel == "reddit_archive" for r in rows)
    assert seen_params[0][1]["after"] == "2026-01-01" and seen_params[0][1]["sort"] == "desc"
    assert calls["posts/search"] >= 3                              # 1 timeout + page + empty page (per keyword: deduped by id)
