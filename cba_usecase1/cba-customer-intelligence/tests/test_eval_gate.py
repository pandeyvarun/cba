"""Quality gate from skills/category-extraction: golden accuracy must not regress."""
from ci.categorise.evaluate import run


def test_golden_set_is_big_enough_and_accurate():
    import json

    from ci import config
    n = sum(1 for l in (config.ROOT / "evals" / "classification_golden.jsonl").read_text(encoding="utf-8").splitlines() if l.strip())
    assert n >= 100
    acc = run("rules")
    assert acc["area"] >= 0.90 and acc["primary"] >= 0.90
    assert acc["sentiment"] >= 0.85 and acc["segment"] >= 0.80
