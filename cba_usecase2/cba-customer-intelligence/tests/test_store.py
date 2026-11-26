import pandas as pd

from ci.collect import store
from ci.schema import RAW_COLUMNS


def rows(*specs):
    return pd.DataFrame([{**{c: "" for c in RAW_COLUMNS}, "bank": "CBA", "source": "S", "channel": "x", **s} for s in specs], columns=RAW_COLUMNS)


def test_merge_dedupes_by_id_and_by_text_hash():
    old = rows({"id": "1", "date": "2026-11-01", "text": "a"}, {"id": "", "date": "2026-11-01", "text": "No id here"})
    new = rows({"id": "1", "date": "2026-11-01", "text": "a"},                      # same id -> skipped
               {"id": "", "date": "2026-11-01", "text": "  no ID here "},            # same text (case/space) -> skipped
               {"id": "2", "date": "2026-11-05", "text": "b"},
               {"id": "2", "date": "2026-11-05", "text": "b"})                       # duplicate inside the new batch
    merged, added = store.merge(old, new)
    assert added == 1 and len(merged) == 3


def test_merge_into_empty_store():
    merged, added = store.merge(None, rows({"id": "1", "date": "2026-11-01", "text": "a"}))
    assert added == 1 and len(merged) == 1


def test_since_uses_overlap(monkeypatch):
    df = rows({"id": "1", "date": "2026-11-10", "text": "a"}, {"id": "2", "date": "2026-11-05", "text": "b"})
    assert store.since_from_store(df, overlap_days=3).isoformat() == "2026-11-07"
    assert store.since_from_store(None) is None


def test_incremental_collect_is_idempotent(tmp_paths):
    from ci import cli
    src = ["File drop (CSV/XLSX/JSON)"]
    cli.main(["collect", "--source", *src, "--incremental"])
    n1 = len(store.load_store())
    cli.main(["collect", "--source", *src, "--incremental"])       # nothing new -> same size
    assert len(store.load_store()) == n1 > 100
