"""Import any CSV / XLSX / JSON export (survey verbatims, contact-centre summaries, exports from tools)."""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from typing import Iterable

import pandas as pd

from ..config import ROOT
from ..schema import RawComment
from .base import Collector


class FileImportCollector(Collector):
    channel = "file_import"

    def fetch(self, since: date | None = None) -> Iterable[RawComment]:
        p = self.params
        path = Path(p["path"])
        path = path if path.is_absolute() else ROOT / path
        if path.suffix.lower() in (".xlsx", ".xls"):
            df = pd.read_excel(path)
        elif path.suffix.lower() == ".json":
            data = json.loads(path.read_text(encoding="utf-8"))
            df = pd.DataFrame(data if isinstance(data, list) else data.get("data", []))
        else:
            df = pd.read_csv(path)
        cols = p.get("columns", {})
        tcol = cols.get("text", "text")
        for i, r in df.iterrows():
            text = str(r.get(tcol, "") or "").strip()
            if not text:
                continue
            d = self.iso(r.get(cols.get("date", "date")))
            if since and d < since.isoformat():
                continue
            rating = r.get(cols.get("rating", "rating")) if cols.get("rating", "rating") in df.columns else None
            yield RawComment(
                bank=str(r.get(cols["bank"], self.bank)) if cols.get("bank") in df.columns else self.bank,
                source=str(r.get(cols["source"], self.name)) if cols.get("source") in df.columns else self.name,
                channel=self.channel, date=d, text=text, rating=self.stars(rating), id=f"{path.stem}-{i}",
            )
