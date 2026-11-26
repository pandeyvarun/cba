"""Claude-based categoriser (prompt: prompts/categorise_batch.md). Output is validated against the taxonomy."""
from __future__ import annotations

from .. import config
from ..llm import ask_json
from ..schema import ACCOUNT_TYPES, SENTIMENTS


def labels() -> list[str]:
    tax = config.taxonomy()
    return [f"{a['primary']} > {a['secondary']}" for a in tax["areas"]] + [f"{tax['other']['primary']} > {tax['other']['secondary']}"]


def categorise_llm(rows: list[dict]) -> dict[str, dict]:
    """rows: [{id, text, rating}] -> {id: {primary, secondary, account_type, sentiment, confidence}}"""
    cfg = config.settings()["categorise"]
    valid = set(labels())
    out: dict[str, dict] = {}
    size = cfg["llm_batch_size"]
    for i in range(0, len(rows), size):
        batch = rows[i:i + size]
        result = ask_json("categorise_batch", taxonomy=labels(), segments=ACCOUNT_TYPES, sentiments=SENTIMENTS,
                          comments=[{"id": r["id"], "text": r["text"][:700], "rating": r.get("rating")} for r in batch])
        for item in result:
            label = f"{item.get('primary')} > {item.get('secondary')}"
            if label in valid and item.get("sentiment") in SENTIMENTS and item.get("account_type") in ACCOUNT_TYPES:
                out[str(item["id"])] = {**item, "confidence": float(item.get("confidence", 0.7))}
    return out
