"""Reddit posts + comments from the public Arctic Shift archive API (no credentials).

This is how the original dataset was gathered when reddit.com itself returned HTTP 403. Posts become rows with
text = title + body; comments become rows with text = body. `keywords` filters rows by regex (and drives the
post search); set `all_comments: true` to keep every comment in a brand subreddit.
"""
from __future__ import annotations

import re
import time
from datetime import date, datetime, timezone
from typing import Iterable

import requests

from ..schema import RawComment
from .base import Collector

BASE = "https://arctic-shift.photon-reddit.com/api"
UA = {"User-Agent": "cba-customer-intelligence/0.2 (research)"}


class RedditArchiveCollector(Collector):
    channel = "reddit_archive"

    # -- http -----------------------------------------------------------
    def _get(self, path: str, params: dict) -> list[dict]:
        """GET with retry/backoff: the archive answers 'Timeout. Maybe slow down' under load."""
        delay = float(self.params.get("backoff", 2.0))
        for attempt in range(int(self.params.get("retries", 4))):
            r = requests.get(f"{BASE}/{path}", params=params, headers=UA, timeout=60)
            body = r.json() if r.status_code == 200 else {}
            if body.get("data") is not None:
                return body["data"]
            if attempt < int(self.params.get("retries", 4)) - 1:
                time.sleep(delay)
                delay *= 2
        raise RuntimeError(f"Arctic Shift {path} failed after retries: {body.get('error') or r.status_code}")

    def _pages(self, path: str, base: dict, limit: int, after: str | None) -> Iterable[dict]:
        """Newest-first paging: each page asks for items older than the oldest one seen."""
        got, before = 0, None
        while got < limit:
            q = {**base, "limit": min(100, limit - got), "sort": "desc"}
            if after:
                q["after"] = after
            if before:
                q["before"] = before
            data = self._get(path, q)
            if not data:
                return
            yield from data
            got += len(data)
            oldest = min(int(d["created_utc"]) for d in data)
            before = datetime.fromtimestamp(oldest, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
            if len(data) < q["limit"]:
                return

    # -- collector ------------------------------------------------------
    def fetch(self, since: date | None = None) -> Iterable[RawComment]:
        p = self.params
        sub = p["subreddit"]
        after = since.isoformat() if since else p.get("after")
        kws = p.get("keywords", [])
        kw_rx = re.compile("|".join(re.escape(k) for k in kws), re.I) if kws else None
        seen: set[str] = set()
        src = f"Reddit r/{sub}"

        # posts: one keyword search per keyword (or the whole subreddit when no keywords)
        for kw in (kws or [None]):
            base = {"subreddit": sub, **({"query": kw} if kw else {})}
            for d in self._pages("posts/search", base, int(p.get("post_limit", 500)), after):
                if d["id"] in seen:
                    continue
                seen.add(d["id"])
                text = f"{d.get('title', '')}. {d.get('selftext', '')}".strip(" .")
                if text.strip() and d.get("selftext") not in ("[removed]", "[deleted]"):
                    yield RawComment(bank=self.bank, source=src, channel=self.channel, date=self.iso(d["created_utc"]), text=text,
                                     id=f"t3_{d['id']}", author=d.get("author") or "", url=f"https://reddit.com{d.get('permalink', '')}",
                                     meta={"score": d.get("score")})

        # comments: whole-subreddit stream, filtered by keyword unless all_comments
        if int(p.get("comment_limit", 1000)) > 0:
            for d in self._pages("comments/search", {"subreddit": sub}, int(p.get("comment_limit", 1000)), after):
                body = d.get("body") or ""
                if d["id"] in seen or body in ("[removed]", "[deleted]") or not body.strip():
                    continue
                if kw_rx and not p.get("all_comments") and not kw_rx.search(body):
                    continue
                seen.add(d["id"])
                yield RawComment(bank=self.bank, source=src, channel=self.channel, date=self.iso(d["created_utc"]), text=body,
                                 id=f"t1_{d['id']}", author=d.get("author") or "", url=f"https://reddit.com{d.get('permalink', '')}",
                                 meta={"score": d.get("score")})
