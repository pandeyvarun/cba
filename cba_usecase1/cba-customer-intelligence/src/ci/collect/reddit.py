"""Reddit comments/posts via PRAW. Needs REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET."""
from __future__ import annotations

import os
import re
from datetime import date
from typing import Iterable

from ..schema import RawComment
from .base import Collector


class RedditCollector(Collector):
    channel = "reddit"

    def fetch(self, since: date | None = None) -> Iterable[RawComment]:
        import praw  # lazy import: optional dependency

        p = self.params
        reddit = praw.Reddit(
            client_id=os.environ["REDDIT_CLIENT_ID"], client_secret=os.environ["REDDIT_CLIENT_SECRET"],
            user_agent=os.environ.get("REDDIT_USER_AGENT", "voc-research/0.1"),
        )
        sub = reddit.subreddit(p["subreddit"])
        kw = re.compile("|".join(re.escape(k) for k in p.get("keywords", [])) or ".", re.I)
        limit = int(p.get("limit", 1000))
        for c in sub.comments(limit=limit):
            d = self.iso(c.created_utc)
            if since and d < since.isoformat():
                continue
            if not kw.search(c.body or ""):
                continue
            yield RawComment(
                bank=self.bank, source=f"Reddit r/{p['subreddit']}", channel=self.channel, date=d,
                text=c.body, id=c.id, author=str(c.author or ""), url=f"https://reddit.com{c.permalink}",
                meta={"score": c.score},
            )
