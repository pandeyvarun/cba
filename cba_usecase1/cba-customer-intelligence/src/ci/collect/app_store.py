"""Apple App Store reviews from the public customer-reviews RSS (JSON) feed."""
from __future__ import annotations

from datetime import date
from typing import Iterable

import requests

from ..schema import RawComment
from .base import Collector

URL = "https://itunes.apple.com/{country}/rss/customerreviews/page={page}/id={app_id}/sortBy=mostRecent/json"


class AppStoreCollector(Collector):
    channel = "app_store"

    def fetch(self, since: date | None = None) -> Iterable[RawComment]:
        p = self.params
        for page in range(1, int(p.get("pages", 10)) + 1):
            r = requests.get(URL.format(country=p.get("country", "au"), page=page, app_id=p["app_id"]), timeout=30)
            if r.status_code != 200:
                break
            entries = r.json().get("feed", {}).get("entry", [])
            if isinstance(entries, dict):
                entries = [entries]
            reviews = [e for e in entries if "im:rating" in e]     # first entry is app metadata
            if not reviews:
                break
            for e in reviews:
                d = self.iso(e["updated"]["label"])
                if since and d < since.isoformat():
                    return
                title, body = e["title"]["label"], e["content"]["label"]
                yield RawComment(
                    bank=self.bank, source="Apple App Store", channel=self.channel, date=d,
                    text=f"{title}. {body}".strip(), rating=self.stars(e["im:rating"]["label"]),
                    id=e["id"]["label"], author=e["author"]["name"]["label"],
                    meta={"version": e.get("im:version", {}).get("label")},
                )
