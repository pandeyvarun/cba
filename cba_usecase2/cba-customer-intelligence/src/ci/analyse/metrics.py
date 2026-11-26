"""Aggregation, competitor gap, momentum and priority scoring (same logic as the UI)."""
from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

from .. import config
from ..schema import ACCOUNT_TYPES, SENTIMENTS

SEGMENTS = {"all": ACCOUNT_TYPES, "Business": ["Business"], "Personal": ["Personal"],
            "General": ["General"], "BG": ["Business", "General"]}


def short(area: str) -> str:
    return area.split(" (")[0]


@dataclass
class Cell:
    n: int = 0
    pos: int = 0
    neg: int = 0
    neu: int = 0
    mix: int = 0

    @property
    def pp(self) -> float:
        return self.pos / self.n if self.n else 0.0

    @property
    def np(self) -> float:
        return self.neg / self.n if self.n else 0.0

    def __add__(self, o: "Cell") -> "Cell":
        return Cell(self.n + o.n, self.pos + o.pos, self.neg + o.neg, self.neu + o.neu, self.mix + o.mix)


class Metrics:
    """Wraps a categorised DataFrame with fast per-(bank, area, segment) lookups."""

    def __init__(self, df: pd.DataFrame):
        s = config.settings()
        self.cfg = s["analysis"]
        self.our = s["our_bank"]
        self.banks = s["banks"]
        self.rivals = [b for b in self.banks if b != self.our]
        self.df = df.copy()
        self.df["month"] = self.df["date"].astype(str).str[:7]
        g = self.df.groupby(["bank", "secondary_area", "account_type", "sentiment"]).size()
        self._g = g.to_dict()
        self.areas = list(dict.fromkeys(
            [(a["primary"], a["secondary"]) for a in config.taxonomy()["areas"]]))
        self.other = config.taxonomy()["other"]["secondary"]
        self.months = sorted(self.df["month"].unique())

    # ------------------------------------------------------------------
    def cell(self, bank: str, area: str, seg: str = "all") -> Cell:
        c = Cell()
        for acct in SEGMENTS[seg]:
            v = [self._g.get((bank, area, acct, s), 0) for s in SENTIMENTS]
            c = c + Cell(sum(v), *v)
        return c

    def rivals_cell(self, area: str, seg: str = "all") -> Cell:
        c = Cell()
        for b in self.rivals:
            c = c + self.cell(b, area, seg)
        return c

    def bank_total(self, bank: str, seg: str = "all", skip_other: bool = False) -> Cell:
        c = Cell()
        for _, a in self.areas:
            c = c + self.cell(bank, a, seg)
        if not skip_other:
            c = c + self.cell(bank, self.other, seg)
        return c

    # ------------------------------------------------------------------
    def area_table(self, seg: str = "all", primary: str | None = None) -> pd.DataFrame:
        rows = []
        mn = self.cfg["min_n_area"]
        for p, a in self.areas:
            if primary and p != primary:
                continue
            ours, rv = self.cell(self.our, a, seg), self.rivals_cell(a, seg)
            per = {b: self.cell(b, a, seg) for b in self.rivals}
            best = max(((b, c) for b, c in per.items() if c.n >= mn), key=lambda x: x[1].pp, default=(None, Cell()))
            gap = ours.np - rv.np if ours.n >= mn and rv.n >= mn else 0.0
            raw = ours.neg * (1 + max(0.0, gap) * self.cfg["gap_weight"]) if ours.n >= mn else 0.0
            row = {"primary_area": p, "area": a, "our_n": ours.n, "our_neg": ours.neg, "our_pos": ours.pos,
                   "our_neg_pct": round(ours.np * 100, 1), "our_pos_pct": round(ours.pp * 100, 1),
                   "rival_n": rv.n, "rival_neg_pct": round(rv.np * 100, 1), "rival_pos_pct": round(rv.pp * 100, 1),
                   "gap_pts": round(gap * 100, 1), "best_rival": best[0], "best_rival_pos_pct": round(best[1].pp * 100, 1),
                   "_raw": raw}
            for b, c in per.items():
                row[f"{b}_n"] = c.n
                row[f"{b}_neg_pct"] = round(c.np * 100, 1)
            rows.append(row)
        t = pd.DataFrame(rows)
        mx = max(1.0, t["_raw"].max()) if len(t) else 1.0
        t["priority_score"] = (t["_raw"] / mx * 100).round().astype(int) if len(t) else []
        return t.drop(columns="_raw").sort_values("priority_score", ascending=False).reset_index(drop=True)

    def momentum(self, area: str, seg: str = "all") -> dict:
        d = self.df[(self.df["secondary_area"] == area) & (self.df["bank"] == self.our) &
                    (self.df["account_type"].isin(SEGMENTS[seg]))]
        cur, prev = self.months[-3:], self.months[-6:-3]

        def f(ms):
            x = d[d["month"].isin(ms)]
            return len(x), (x["sentiment"] == "Negative").mean() if len(x) else 0.0
        (nc, pc_), (np_, pp_) = f(cur), f(prev)
        mn = self.cfg["momentum_min_n"]
        return {"cur_n": nc, "cur_neg": pc_, "prev_n": np_, "prev_neg": pp_, "delta": pc_ - pp_, "ok": nc >= mn and np_ >= mn}

    def trend(self) -> pd.DataFrame:
        d = self.df.assign(neg=self.df["sentiment"].eq("Negative"))
        t = d.groupby(["bank", "month"]).agg(n=("neg", "size"), negative=("neg", "sum")).reset_index()
        t["neg_pct"] = (t["negative"] / t["n"] * 100).round(1)
        return t
