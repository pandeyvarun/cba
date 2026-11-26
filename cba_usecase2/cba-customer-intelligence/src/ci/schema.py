"""Data contract shared across stages. See docs/data-contract.md."""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any

RAW_COLUMNS = ["id", "bank", "source", "channel", "date", "rating", "text", "author", "url", "meta"]
CLEAN_COLUMNS = RAW_COLUMNS + ["text_clean", "pii_redacted"]
CAT_COLUMNS = CLEAN_COLUMNS + [
    "account_type", "primary_area", "secondary_area", "sentiment", "confidence", "method",
]

SENTIMENTS = ["Positive", "Negative", "Neutral", "Mixed"]
ACCOUNT_TYPES = ["Business", "Personal", "General"]
PRIMARY_AREAS = ["Onboarding", "Statements", "Transaction", "Non Functional"]


@dataclass
class RawComment:
    """One piece of customer feedback exactly as collected (no interpretation)."""
    bank: str
    source: str                  # e.g. "Google Play", "Reddit r/CommBank"
    channel: str                 # collector name: google_play | app_store | reddit | servicenow | file_import
    date: str                    # ISO date YYYY-MM-DD
    text: str
    rating: int | None = None    # 1-5 when the channel has stars
    id: str = ""                 # stable id from the channel when available
    author: str = ""             # hashed in processing
    url: str = ""
    meta: dict[str, Any] = field(default_factory=dict)

    def to_row(self) -> dict:
        d = asdict(self)
        d["meta"] = str(self.meta) if self.meta else ""
        return d
