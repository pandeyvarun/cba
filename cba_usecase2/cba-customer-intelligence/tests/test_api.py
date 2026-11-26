"""API behaviour incl. the safety rails: auth, dry-run default, double opt-in for real Jira writes."""
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from ci.api import create_app
from ci.pipeline import run_downstream


@pytest.fixture
def client(tmp_paths, monkeypatch):
    from ci import config, io
    from ci.collect.registry import build_collector
    entry = next(e for e in config.sources_config() if e["collector"] == "file_import")
    io.write(pd.DataFrame([c.to_row() for c in build_collector(entry).fetch()]), config.path("raw") / "comments_2026-11-01.csv")
    run_downstream("rules", build_ui=False)
    for k in ("CI_API_KEY", "CI_ALLOW_JIRA_PUSH", "JIRA_SITE", "JIRA_EMAIL", "JIRA_API_TOKEN"):
        monkeypatch.delenv(k, raising=False)
    return TestClient(create_app())


H = {"X-API-Key": "secret"}


def test_health_and_backlog_are_open_and_read_only(client):
    assert client.get("/health").json()["mutations_enabled"] is False
    r = client.get("/backlog", params={"segment": "all", "limit": 3})
    assert r.status_code == 200 and r.json()["count"] == 3
    assert r.json()["items"][0]["priority_score"] >= r.json()["items"][-1]["priority_score"]
    assert client.get("/backlog", params={"segment": "bogus"}).status_code == 422


def test_mutations_disabled_without_server_key_and_reject_bad_key(client, monkeypatch):
    assert client.post("/jira/push", json={}).status_code == 503
    monkeypatch.setenv("CI_API_KEY", "secret")
    assert client.post("/jira/push", json={}).status_code == 401
    assert client.post("/jira/push", json={}, headers={"X-API-Key": "nope"}).status_code == 401


def test_jira_push_defaults_to_dry_run(client, monkeypatch):
    monkeypatch.setenv("CI_API_KEY", "secret")
    r = client.post("/jira/push", json={"limit": 2}, headers=H)
    assert r.status_code == 200 and r.json()["dry_run"] is True and r.json()["count"] == 2 and r.json()["created"] == []


def test_real_push_needs_second_opt_in_and_credentials(client, monkeypatch):
    monkeypatch.setenv("CI_API_KEY", "secret")
    r = client.post("/jira/push", json={"dry_run": False}, headers=H)
    assert r.status_code == 403
    monkeypatch.setenv("CI_ALLOW_JIRA_PUSH", "1")
    assert client.post("/jira/push", json={"dry_run": False}, headers=H).status_code == 400    # no JIRA_* creds


def test_real_push_calls_jira_when_fully_enabled(client, monkeypatch):
    posted = {}

    class R:
        status_code = 201

        def raise_for_status(self):
            pass

        def json(self):
            return {"issues": [{"key": "MOB-1"}, {"key": "MOB-2"}]}

    def fake_post(url, json, auth, timeout):
        posted.update(url=url, n=len(json["issueUpdates"]), auth=auth)
        return R()
    monkeypatch.setattr("ci.recommend.jira.requests.post", fake_post)
    for k, v in {"CI_API_KEY": "secret", "CI_ALLOW_JIRA_PUSH": "1", "JIRA_SITE": "https://x.atlassian.net", "JIRA_EMAIL": "a@b.c", "JIRA_API_TOKEN": "tok"}.items():
        monkeypatch.setenv(k, v)
    r = client.post("/jira/push", json={"dry_run": False, "limit": 2}, headers=H)
    assert r.status_code == 200 and r.json()["count"] == 2 and posted["url"].endswith("/rest/api/3/issue/bulk")
    assert "tok" not in r.text                                                  # token never echoed


def test_ingest_dedupes_validates_and_can_rerun_pipeline(client, monkeypatch):
    monkeypatch.setenv("CI_API_KEY", "secret")
    body = {"rows": [{"bank": "CBA", "text": "Face ID login keeps failing after the update", "date": "2026-11-20", "rating": 1}]}
    r1 = client.post("/ingest", json=body, headers=H).json()
    r2 = client.post("/ingest", json=body, headers=H).json()
    assert r1["added"] == 1 and r2["added"] == 0 and r2["duplicates_skipped"] == 1
    assert client.post("/ingest", json={"rows": [{"bank": "XYZ", "text": "hi"}]}, headers=H).status_code == 422
    r3 = client.post("/ingest", json={**body, "run_pipeline": True}, headers=H).json()
    assert r3["pipeline"]["rows"] > 100 and r3["pipeline"]["backlog_items"] > 0
