"""Rule-based area classifier driven by config/taxonomy.json (no API needed)."""
from __future__ import annotations

import re
from dataclasses import dataclass
from functools import lru_cache

from .. import config


@dataclass
class AreaResult:
    primary: str
    secondary: str
    score: float
    margin: float          # best - second best; low margin = ambiguous
    matched: bool


@lru_cache(maxsize=1)
def _compiled():
    tax = config.taxonomy()
    areas = [(a["primary"], a["secondary"], [(re.compile(rx, re.I), w) for rx, w in a["patterns"]]) for a in tax["areas"]]
    return areas, re.compile(tax["bankword"], re.I), tax["weights"], tax["other"]


def classify_area(text: str, rating: float | None = None) -> AreaResult:
    areas, bankword, weights, other = _compiled()
    scores: list[tuple[float, str, str]] = []
    for primary, secondary, pats in areas:
        sc = sum(w * len(rx.findall(text)) for rx, w in pats)
        for prefix, mult in weights.items():
            if secondary.startswith(prefix):
                sc *= mult
        scores.append((sc, primary, secondary))
    scores.sort(key=lambda x: -x[0])
    best, second = scores[0], scores[1]
    has_rating = rating is not None and rating == rating     # NaN check
    if best[0] <= 0:
        if has_rating:                                        # app-store review with no topical keywords
            general = next(s for s in scores if s[2].startswith("Overall app experience"))
            return AreaResult(general[1], general[2], 0.0, 0.0, False)
        return AreaResult(other["primary"], other["secondary"], 0.0, 0.0, False)
    if not has_rating and not bankword.search(text):         # forum chatter that never mentions banking
        return AreaResult(other["primary"], other["secondary"], 0.0, 0.0, False)
    return AreaResult(best[1], best[2], best[0], best[0] - second[0], True)
