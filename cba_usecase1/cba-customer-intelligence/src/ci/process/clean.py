"""Text cleaning, PII redaction and de-duplication. Pure functions - easy to unit test."""
from __future__ import annotations

import hashlib
import html
import re

import pandas as pd

_TAG = re.compile(r"<[^>]+>")
_URL = re.compile(r"https?://\S+")
_WS = re.compile(r"\s+")

# PII patterns (Australian banking context). Order matters: longest/most specific first.
PII_PATTERNS = [
    ("EMAIL", re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")),
    ("CARD", re.compile(r"\b(?:\d[ -]?){13,19}\b")),
    ("BSB_ACC", re.compile(r"\b\d{3}-?\d{3}\s*(?:acc(?:ount)?\.?\s*(?:no\.?|number|#)?:?\s*)?\d{6,10}\b", re.I)),
    ("TFN", re.compile(r"\b\d{3}\s?\d{3}\s?\d{3}\b")),
    ("PHONE", re.compile(r"(?<!\d)(?:\+?61|0)[\s-]?[2-478](?:[\s-]?\d){8}(?!\d)")),
    ("CRN", re.compile(r"\b(?:CRN|customer registration number)\D{0,5}\d{6,}\b", re.I)),
]


def normalise(text: str) -> str:
    t = html.unescape(str(text or ""))
    t = _TAG.sub(" ", t)
    t = _URL.sub("", t)
    t = t.replace("\u2019", "'").replace("\u2018", "'").replace("\u201c", '"').replace("\u201d", '"')
    return _WS.sub(" ", t).strip()


def redact(text: str) -> tuple[str, bool]:
    hit = False
    for label, rx in PII_PATTERNS:
        text, n = rx.subn(f"[{label}]", text)
        hit = hit or n > 0
    return text, hit


def hash_author(a: str, salt: str = "ci") -> str:
    return hashlib.sha256(f"{salt}:{a}".encode()).hexdigest()[:10] if a else ""


def dedupe_key(row) -> str:
    # same bank + source + user + day + text = the same review scraped twice; different users saying "Great app" are kept
    base = f"{row['bank']}|{row['source']}|{row.get('author', '')}|{str(row['date'])[:10]}|{row['text_clean'][:200].lower()}"
    return hashlib.md5(base.encode()).hexdigest()


def clean_frame(df: pd.DataFrame, *, min_chars=12, max_chars=1200, redact_pii=True,
                drop_duplicates=True, hash_authors=True, min_chars_rated=1) -> pd.DataFrame:
    """min_chars applies to unrated text (Reddit/HN/tickets, where very short replies are noise); a star-rated review
    is signal at any length ("Love it", 5 stars), so it only needs `min_chars_rated` characters."""
    out = df.copy()
    out["text_clean"] = out["text"].map(normalise)
    red = out["text_clean"].map(redact) if redact_pii else out["text_clean"].map(lambda t: (t, False))
    out["text_clean"] = red.map(lambda x: x[0])
    out["pii_redacted"] = red.map(lambda x: x[1])
    n = out["text_clean"].str.len()
    rated = pd.to_numeric(out["rating"], errors="coerce").notna() if "rating" in out else pd.Series(False, index=out.index)
    out = out[(n >= min_chars) | (rated & (n >= min_chars_rated))].copy()
    out["text_clean"] = out["text_clean"].str.slice(0, max_chars)
    out["date"] = pd.to_datetime(out["date"], errors="coerce").dt.strftime("%Y-%m-%d")
    out = out.dropna(subset=["date"])
    if hash_authors and len(out):
        out["author"] = out["author"].astype(object).where(out["author"].notna(), "").map(hash_author)
    if drop_duplicates and len(out):
        out["_k"] = out.apply(dedupe_key, axis=1)
        out = out.drop_duplicates("_k").drop(columns="_k")
    out["rating"] = pd.to_numeric(out["rating"], errors="coerce")
    return out.reset_index(drop=True)
