"""Round-trip: collected rows -> six-column workbook -> file_import collector gives the same comments back."""
import pandas as pd

from ci import config
from ci.collect.file_import import FileImportCollector
from ci.export_workbook import export_workbook, to_workbook_frame
from ci.schema import RAW_COLUMNS


def _raw():
    return pd.DataFrame([
        {**{c: "" for c in RAW_COLUMNS}, "bank": "CBA", "source": "Google Play", "channel": "x", "date": "2026-11-01", "text": "Great app", "rating": 5, "author": "amy"},
        {**{c: "" for c in RAW_COLUMNS}, "bank": "NAB", "source": "Hacker News", "channel": "x", "date": "2026-11-02", "text": "Other bank", "rating": None, "author": ""},
        {**{c: "" for c in RAW_COLUMNS}, "bank": "CBA", "source": "Hacker News", "channel": "x", "date": "2026-11-03", "text": "Forum reply", "rating": None, "author": "bob"},
    ], columns=RAW_COLUMNS)


def test_frame_has_original_six_columns():
    f = to_workbook_frame(_raw())
    assert list(f.columns) == ["Source", "UserID", "Date", "Comment", "Reply", "Rating"]
    assert f.iloc[0]["Rating"] == 5 and pd.isna(f.iloc[2]["Rating"])


def test_round_trip_through_file_import(tmp_path):
    out = export_workbook(_raw(), "CBA", tmp_path / "cba.xlsx")
    params = {"path": str(out), "columns": {"text": "Comment", "date": "Date", "rating": "Rating", "source": "Source"}}
    rows = [r.to_row() for r in FileImportCollector("WB", "CBA", params).fetch()]
    assert [r["text"] for r in rows] == ["Great app", "Forum reply"]
    assert rows[0]["rating"] == 5 and rows[0]["source"] == "Google Play" and rows[0]["bank"] == "CBA"
