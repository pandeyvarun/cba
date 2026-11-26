"""Dynamic insights + executive summary (rule-generated; optionally narrated by Claude)."""
from __future__ import annotations

from .. import config
from .metrics import SEGMENTS, Metrics, short

ORDER = {"lead": ["gap", "biz", "str", "pain", "mom", "adv", "mob"], "po": ["pain", "mom", "mob", "adv", "gap", "str", "biz"]}
SEG_LABEL = {"all": "all segments", "Business": "Business customers", "Personal": "Personal customers",
             "General": "General (unclassified) customers", "BG": "Business and General customers"}


def pct(x: float) -> str:
    return f"{x * 100:.0f}%"


def build_insights(m: Metrics, seg: str = "all", role: str = "lead", limit: int = 6) -> list[dict]:
    play = config.playbook()
    generic = set(m.cfg["generic_areas"])
    t = m.area_table(seg)
    real = t[~t["area"].isin(generic)]
    out: list[dict] = []
    tot_neg = max(1, sum(m.cell(m.our, a, seg).neg for _, a in m.areas))

    if len(real) and real["our_neg"].max() > 0:
        r = real.sort_values("our_neg", ascending=False).iloc[0]
        out.append({"key": "pain", "tag": "Biggest pain point", "area": r.area,
                    "title": f"{short(r.area)} drives {pct(r.our_neg / tot_neg)} of negative feedback",
                    "text": f"{r.our_neg} negative comments ({r.our_neg_pct:.0f}% of {r.our_n}). Rivals average {r.rival_neg_pct:.0f}% negative."})
    g = real[(real.our_n >= m.cfg["min_n_gap"]) & (real.rival_n >= m.cfg["min_n_gap"])].sort_values("gap_pts", ascending=False)
    if len(g) and g.iloc[0].gap_pts > 0:
        r = g.iloc[0]
        out.append({"key": "gap", "tag": "Largest competitor gap", "area": r.area,
                    "title": f"{short(r.area)}: {r.gap_pts:.0f} pts more negative than peers",
                    "text": f"{r.our_neg_pct:.0f}% negative vs {r.rival_neg_pct:.0f}% across rivals."})
    adv = real[(real.best_rival.notna()) & (real.best_rival_pos_pct > real.our_pos_pct)].assign(
        d=lambda x: x.best_rival_pos_pct - x.our_pos_pct).sort_values("d", ascending=False)
    if len(adv):
        r = adv.iloc[0]
        out.append({"key": "adv", "tag": "Competitor advantage", "area": r.area,
                    "title": f"{r.best_rival} leads on {short(r.area)}",
                    "text": f"{r.best_rival_pos_pct:.0f}% positive at {r.best_rival} vs {r.our_pos_pct:.0f}% at {m.our}."})
    s = g.assign(d=lambda x: x.our_pos_pct - x.rival_pos_pct).sort_values("d", ascending=False)
    if len(s) and s.iloc[0].d > 0:
        r = s.iloc[0]
        out.append({"key": "str", "tag": "Strength to protect", "area": r.area,
                    "title": f"{m.our} leads on {short(r.area)}",
                    "text": f"{r.our_pos_pct:.0f}% positive vs {r.rival_pos_pct:.0f}% for rivals."})
    moms = [(a, m.momentum(a, seg)) for a in real["area"] if m.momentum(a, seg)["ok"]]
    if moms:
        a, mo = max(moms, key=lambda x: x[1]["delta"])
        out.append({"key": "mom", "tag": "Rising complaints" if mo["delta"] > 0.02 else "Momentum", "area": a,
                    "title": f"{short(a)} complaints rising" if mo["delta"] > 0.02 else "No area shows a sharp rise in complaints",
                    "text": f"Negative share {pct(mo['cur_neg'])} over the last 3 months vs {pct(mo['prev_neg'])} before."})
    bt = m.area_table("Business")
    bt = bt[(bt.our_n >= 8) & ~bt.area.isin(generic)].sort_values("our_neg_pct", ascending=False)
    if len(bt):
        r = bt.iloc[0]
        out.append({"key": "biz", "tag": "Business customers", "area": r.area,
                    "title": f"Business view: {short(r.area)} is the weakest area",
                    "text": f"{r.our_neg_pct:.0f}% negative across {r.our_n} business-tagged comments."})
    mob = t[t.area.map(lambda a: play.get(a, {}).get("mobile", False))].sort_values("priority_score", ascending=False)
    if len(mob):
        r = mob.iloc[0]
        out.append({"key": "mob", "tag": "Top app opportunity", "area": r.area, "title": play[r.area]["title"],
                    "text": f"Priority score {r.priority_score}/100. {play[r.area]['mobile_recommendation'].split('. ')[0]}"})
    out.sort(key=lambda x: ORDER[role].index(x["key"]))
    return out[:limit]


def exec_summary(m: Metrics, seg: str = "all") -> str:
    ours = m.bank_total(m.our, seg)
    riv = sum((m.bank_total(b, seg) for b in m.rivals), type(ours)())
    diff = (ours.np - riv.np) * 100
    t = m.area_table(seg)
    real = t[~t.area.isin(m.cfg["generic_areas"])]
    top = real.sort_values("our_neg", ascending=False).head(3)
    ok = real[(real.our_n >= m.cfg["min_n_area"]) & (real.rival_n >= m.cfg["min_n_area"])]
    better = int((ok.gap_pts < 0).sum())
    lines = [f"Across {ours.n:,} {m.our} comments from {SEG_LABEL[seg]}, {pct(ours.np)} are negative and {pct(ours.pp)} positive. "
             f"Rivals combined are {pct(riv.np)} negative, so {m.our} is {abs(diff):.1f} pts {'more' if diff > 0 else 'less'} negative than peers overall."]
    if len(top):
        lines.append(f"The heaviest complaint themes are {', '.join(short(a) for a in top.area)}, together {int(top.our_neg.sum())} negative comments. "
                     f"{m.our} is ahead of the rival average in {better} of {len(ok)} areas with enough data.")
    return "\n\n".join(lines)
