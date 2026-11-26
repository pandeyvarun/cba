"""Hacker News comments via the public Algolia search API (no credentials)."""
from __future__ import annotations

import html
from datetime import date, datetime
from typing import Iterable

import requests

from ..schema import RawComment
from .base import Collector

URL = "https://hn.algolia.com/api/v1/search_by_date"


class HackerNewsCollector(Collector):
    channel = "hackernews"

    def fetch(self, since: date | None = None) -> Iterable[RawComment]:
        p = self.params
        extra = {}
        if since:
            extra["numericFilters"] = f"created_at_i>={int(datetime(since.year, since.month, since.day).timestamp())}"
        for page in range(int(p.get("pages", 5))):
            r = requests.get(URL, params={"query": p["query"], "tags": "comment", "hitsPerPage": 100, "page": page, **extra},
                             timeout=30, headers={"User-Agent": "cba-customer-intelligence/0.2"})
            r.raise_for_status()
            hits = r.json().get("hits", [])
            if not hits:
                break
            for h in hits:
                text = html.unescape(h.get("comment_text") or "")
                if not text.strip():
                    continue
                yield RawComment(
                    bank=self.bank, source="Hacker News", channel=self.channel, date=self.iso(h.get("created_at")),
                    text=text, id=str(h.get("objectID", "")), author=h.get("author") or "",
                    url=f"https://news.ycombinator.com/item?id={h.get('objectID', '')}",
                    meta={"story": h.get("story_title")},
                )
