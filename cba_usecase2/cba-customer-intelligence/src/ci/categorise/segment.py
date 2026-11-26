"""Account-type (segment) rules: Business > Personal > General. Job/corporate chatter is never Business."""
from __future__ import annotations

import re
from functools import lru_cache

from .. import config

_NAMES = ["BIZ_NEG", "BIZ_IDIOM", "BIZ_TITLES", "SPECIFIC", "GENERIC_STRONG", "OTHER_KW",
          "JOB_CHATTER", "PERSONAL_EXPLICIT", "PERSONAL_KW"]


@lru_cache(maxsize=1)
def _rx() -> dict[str, re.Pattern]:
    seg = config.segments()
    return {k: re.compile(seg[k], re.I) for k in _NAMES}


def account_type(text: str) -> str:
    r = _rx()
    t = r["BIZ_NEG"].sub("", text or "")
    t2 = r["BIZ_TITLES"].sub(" ", r["BIZ_IDIOM"].sub(" ", t))
    job = bool(r["JOB_CHATTER"].search(t))
    if r["SPECIFIC"].search(t2):
        return "Business"
    if not job and (r["GENERIC_STRONG"].search(t2) or (r["OTHER_KW"].search(t2) and not r["PERSONAL_EXPLICIT"].search(t2))):
        return "Business"
    if r["PERSONAL_KW"].search(t):
        return "Personal"
    return "General"
