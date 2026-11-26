"""Hybrid mode wiring with a fake Claude client (no API key, no network)."""
import json

import pandas as pd

from ci.categorise import categorise_df
from ci.llm import set_client


class FakeClient:
    def __init__(self):
        self.calls = 0

    def complete(self, system, user, *, model, max_tokens):
        self.calls += 1
        comments = json.loads(user.split("### Comments (JSON)")[1].split("### Output")[0])
        return json.dumps([{"id": c["id"], "primary": "Transaction", "secondary": "Fees, surcharges & charges",
                            "account_type": "Personal", "sentiment": "Negative", "confidence": 0.9} for c in comments])


def test_hybrid_sends_only_ambiguous_rows_and_validates():
    fake = FakeClient()
    set_client(fake)
    try:
        df = pd.DataFrame({"text_clean": ["Tap to pay with Apple Pay keeps failing at the shops",
                                          "weird charge showed up somewhere, no idea why"],
                           "rating": [1, 1], "bank": "CBA", "source": "x", "date": "2026-01-01"})
        out = categorise_df(df, "hybrid")
    finally:
        set_client(None)
    assert fake.calls >= 1
    assert out.method.tolist().count("llm") >= 1
    assert out.secondary_area.iloc[0].startswith("Card payments")        # confident rules row untouched
