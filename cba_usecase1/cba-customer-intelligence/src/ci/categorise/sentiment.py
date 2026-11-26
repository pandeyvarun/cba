"""Sentiment: star rating when present, VADER lexicon otherwise. Mixed = text contradicts rating / long split posts."""
from __future__ import annotations

import re

from .. import config

try:
    from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
    _V = SentimentIntensityAnalyzer()
except Exception:  # noqa: BLE001
    _V = None

_POS = set("good great excellent love easy best helpful fast smooth reliable thanks amazing awesome perfect happy brilliant useful".split())
_NEG = set("bad worst terrible awful useless slow crash broken bug fail failed hate horrible poor rubbish scam blocked locked stuck error".split())


def _compound(t: str) -> float:
    if _V:
        return _V.polarity_scores(t)["compound"]
    w = re.findall(r"[a-z']+", t.lower())
    return max(-1, min(1, (sum(x in _POS for x in w) - sum(x in _NEG for x in w)) / 3))


def sentiment(text: str, rating: float | None = None) -> str:
    cfg = config.settings()["categorise"]
    c = _compound(text)
    if rating is not None and rating == rating:
        r = int(rating)
        if r >= 4 and c <= -0.45:
            return "Mixed"
        if r <= 2 and c >= 0.55:
            return "Mixed"
        if r >= 4:
            return "Positive"
        if r <= 2:
            return "Negative"
        return "Positive" if c >= 0.4 else "Negative" if c <= -0.4 else "Neutral"
    sents = [s for s in re.split(r"(?<=[.!?])\s+|\n+", text) if len(s) > 15]
    if len(sents) >= 3:
        sc = [_compound(s) for s in sents]
        if max(sc) >= 0.5 and min(sc) <= -0.5:
            return "Mixed"
    if c >= cfg["sentiment_pos_threshold"]:
        return "Positive"
    if c <= cfg["sentiment_neg_threshold"]:
        return "Negative"
    return "Neutral"
