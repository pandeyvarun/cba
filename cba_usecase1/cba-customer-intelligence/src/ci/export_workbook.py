"""Export collected feedback back to the six-column workbook format used by the original data:
Source, UserID, Date, Comment, Reply, Rating (one sheet "Comments"). Round-trips with the file_import collector."""
from __future__ import annotations

from pathlib import Path

import pandas as pd


def to_workbook_frame(df: pd.DataFrame) -> pd.DataFrame:
    return pd.DataFrame({
        "Source": df["source"],
        "UserID": df["author"].fillna(""),
        "Date": df["date"],
        "Comment": df["text"],
        "Reply": "",
        "Rating": df["rating"].astype("Int64") if "rating" in df else pd.NA,
    })


def export_workbook(raw: pd.DataFrame, bank: str, out: str | Path) -> Path:
    sub = raw[raw["bank"] == bank]
    out = Path(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with pd.ExcelWriter(out, engine="openpyxl") as xw:
        to_workbook_frame(sub).to_excel(xw, sheet_name="Comments", index=False)
    print(f"[export] {len(sub)} {bank} rows -> {out}")
    return out
