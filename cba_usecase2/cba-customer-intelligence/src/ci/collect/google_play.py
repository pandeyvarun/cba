"""Google Play reviews via google-play-scraper (pip install google-play-scraper)."""
from __future__ import annotations

from datetime import date
from typing import Iterable

from ..schema import RawComment
from .base import Collector


class GooglePlayCollector(Collector):
    channel = "google_play"

    def fetch(self, since: date | None = None) -> Iterable[RawComment]:
        from google_play_scraper import Sort, reviews  # lazy import: optional dependency

        p = self.params
        token, got = None, 0
        total = int(p.get("count", 1000))
        while got < total:
            batch, token = reviews(
                p["package"], lang=p.get("lang", "en"), country=p.get("country", "au"),
                sort=Sort.NEWEST, count=min(200, total - got), continuation_token=token,
            )
            if not batch:
                break
            for r in batch:
                d = self.iso(r["at"])
                if since and d < since.isoformat():
                    return
                yield RawComment(
                    bank=self.bank, source="Google Play", channel=self.channel, date=d,
                    text=r.get("content") or "", rating=self.stars(r.get("score")),
                    id=str(r.get("reviewId", "")), author=r.get("userName", ""),
                    meta={"app_version": r.get("appVersion"), "thumbs_up": r.get("thumbsUpCount")},
                )
            got += len(batch)
            if token is None:
                break
