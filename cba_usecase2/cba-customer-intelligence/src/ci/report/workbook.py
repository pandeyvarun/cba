"""Build the annotated '<bank>-user-comments-analysed.xlsx' workbook from the enriched, categorised comments.

Tabs (same as the original deliverable):
    Method & Notes | Comments | Summary | Competitor Reference | Intel - Business Only |
    Intel - Business + General | Mobile App Feature Matrix

Everything numeric is computed here from the data; all narrative text comes from config/playbook.json,
config/improvement_refinements.json and config/competitor_features.json (no text is hard-wired in code except notes).
"""
from __future__ import annotations

from pathlib import Path

import pandas as pd
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

from .. import config

NAVY = "1F3864"
WRAP = Alignment(wrap_text=True, vertical="top")
COMMENT_COLS = ["Source", "UserID", "Date", "Comment", "Reply", "Rating", "Account Type", "Primary Area", "Secondary Area",
                "Sentiment", "Areas for improvement", "What competitors are offering"]
COMMENT_WIDTHS = [24, 14, 12, 100, 14, 8, 14, 18, 40, 12, 70, 90]
MOBNOTE = (" Mobile app columns come from official guides only: ANZ App FAQ and Easy Read guide, NAB app page, NAB Connect mobile app page and "
           "Quick Reference Guide (Sept 2018), and Westpac New Zealand Westpac One help index pages. The Westpac pages are New Zealand (not Westpac "
           "Australia) and list feature names only, so treat them as indicative. Suggestions are ideas to evaluate against CBA's current app, not confirmed gaps.")
COLLECTION_NOTES = [
    "Public endpoints only; no logins, no captcha or paywall bypass.",
    "Google Play: newest ~5000 reviews per app via google-play-scraper (AU storefront). Reply = developer reply when present (banks rarely reply).",
    "Apple App Store: public customer-reviews RSS feed for the AU storefront (max ~500 most recent per app; no developer responses).",
    "Reddit: reddit.com returns HTTP 403 to scripts, so data comes from the public Arctic Shift archive API (collector 'reddit_archive'): brand-subreddit posts and "
    "comments plus keyword-matched posts/comments from r/AusFinance, r/australia and others. Posts are rows with Comment = title + body.",
    "Hacker News: comments mentioning the bank via the public Algolia API. ProductReview.com.au: only the first listing page was reachable (pagination returned HTTP 403).",
    "Not reachable: Trustpilot (403), Whirlpool (403), YouTube (bot check), X/Twitter, Facebook (login required).",
    "Rating column: star rating 1-5 exactly as provided by the store/review site; blank for Reddit and Hacker News (none inferred). Dates are UTC ISO YYYY-MM-DD.",
]


def _hdr(ws, row: int, col: int, text: str) -> None:
    c = ws.cell(row=row, column=col, value=text)
    c.font = Font(name="Calibri", bold=True, color="FFFFFF")
    c.fill = PatternFill("solid", fgColor=NAVY)
    c.alignment = Alignment(wrap_text=True, vertical="center")


def _widths(ws, widths: list[int], start: int = 1) -> None:
    for j, w in enumerate(widths, start):
        ws.column_dimensions[get_column_letter(j)].width = w


def _none(v):
    return None if pd.isna(v) else v


def _pct(sub: pd.DataFrame, sent: str):
    return (sub.sentiment == sent).mean() if len(sub) else None


def _areas() -> list[tuple[str, str]]:
    """(primary, secondary) in taxonomy order, only areas that have a playbook entry."""
    play = config.playbook()
    return [(a["primary"], a["secondary"]) for a in config.taxonomy()["areas"] if a["secondary"] in play]


def _summaries(area: str, sub: pd.DataFrame, example: bool = False) -> tuple[str, str]:
    pb = config.playbook()[area]
    if len(sub) == 0:
        return "No CBA comments in this view for this area.", "No CBA comments in this view for this area."
    pn, nn = int((sub.sentiment == "Positive").sum()), int((sub.sentiment == "Negative").sum())
    p = f"{pb['positives']} [{pn} positive of {len(sub)} in this view]" if pn else f"No positive CBA comments in this view [0 of {len(sub)}]."
    n = f"{pb['negatives']} [{nn} negative of {len(sub)} in this view]" if nn else f"No negative CBA comments in this view [0 of {len(sub)}]."
    if example:
        def ex(sent):
            s = sub[(sub.sentiment == sent) & sub.text_clean.str.len().between(40, 400)]
            return str(s.text_clean.iloc[0]).replace("\n", " ")[:140] if len(s) else None
        if ex("Positive"):
            p += f' Example: "{ex("Positive")}..."'
        if ex("Negative"):
            n += f' Example: "{ex("Negative")}..."'
    return p, n


# ---------------------------------------------------------------- tabs
def _method(wb: Workbook, ours: pd.DataFrame, meta: dict) -> None:
    ws = wb.active
    ws.title = "Method & Notes"
    n_other = int(ours.primary_area.str.startswith("Other").sum())
    s = config.settings()
    p = meta.get("process") or {**s["processing"], "profile": "analysis"}
    hashed = "hashed" if p.get("hash_authors", True) else "kept as collected"
    if p.get("profile") == "archive":
        rules = "no comment was dropped or truncated for length or duplication"
    else:
        rules = f"unrated rows under {p['min_chars']} characters, exact duplicates and text beyond {p['max_chars']} characters were dropped or trimmed"
    got = f"Collected {p['raw_rows']:,} comments across all banks; " if p.get("raw_rows") else ""
    prep = f"{got}{meta['clean_rows']:,} comments after cleaning (HTML/URL stripped, {rules}, PII such as emails/phones/card numbers redacted, UserIDs {hashed}). "
    rows = [
        ("How the new columns were derived", ""),
        ("Approach", f"Every comment was tagged with transparent keyword/rule logic (no manual review of all {len(ours):,} rows). Star ratings drive sentiment where present; "
                     "unrated Reddit/Hacker News text was scored with the VADER sentiment lexicon."),
        ("Data preparation", prep + ("" if p.get("profile") == "archive" else "Figures here therefore differ slightly from raw row counts in the source files.")),
        ("Account Type", "Business if the comment has a specific business-banking cue (ABN, ACN, BAS, SMSF, BTA, Y4B, sole trader, CommBiz, NAB Connect, business account/loan/card, "
                         "merchant facility, self-employed, Cash flow tool, Appointment booking) - or, when it is not job/corporate chatter, a general cue (my/our business, small business, "
                         "business banking/customers/owners, Cash flow, Profile, Two factor/2FA/2-way sign in, Corporate). Comments about jobs, offshoring, layoffs, recruitment, salaries, "
                         "executives/profits, news articles and idioms ('take my business elsewhere', 'business days') are NOT Business; they go to Personal if they show personal-banking "
                         "cues, otherwise General. Explicitly personal comments (e.g. 'personal income') are not Business on weak keywords alone. Personal = personal-banking cues; General = everything else."),
        ("Primary Area", f"Onboarding / Statements / Transaction / Non Functional. 'Other (not classifiable)' ({n_other:,} rows, mostly Reddit/Hacker News chatter) is used where the comment names no identifiable banking area."),
        ("Secondary Area", "A more specific sub-area of the primary area (e.g. Fraud, scam & account holds; Login, authentication & lock-outs). The sub-area with the highest keyword score wins."),
        ("Sentiment", "Positive / Negative / Neutral / Mixed. Rated: 4-5 positive, 1-2 negative, 3 neutral (Mixed if the text strongly contradicts the rating). Unrated: VADER score with thresholds; long posts with strongly opposing sentences = Mixed."),
        ("Areas for improvement", "Chosen from a sub-area playbook, refined by keywords in the comment (e.g. biometric, log-out, crypto block, dark mode). Positive comments show 'None raised - strength to retain'; Neutral show 'Opportunity'. It is a synthesis, not a quote."),
        ("What competitors are offering", "Written from reading ANZ, NAB and Westpac comments for the same sub-area (all files were classified with the same rules). It reflects what customers say - anecdotal evidence from reviews and Reddit, not official product specifications. "
                                          "A per-bank evidence count (n, % positive / % negative) is appended and computed from the data. See the 'Competitor Reference' sheet for the roll-up."),
        ("Mobile app columns", "Intel tabs include 'Competitor mobile app features' and 'Mobile app suggestions for CBA', built from official ANZ, NAB and Westpac NZ guides (see Mobile App Feature Matrix). Westpac pages are New Zealand and indicative only; suggestions are ideas to test against CBA's current app."),
        ("Limitations", "Rule-based tagging will misclassify some comments (sarcasm, multi-topic posts, off-topic Reddit replies). Reddit/Hacker News replies often discuss the economy or other banks rather than the bank itself. Treat counts as directional and validate samples before client-facing use."),
        ("Reproduce", f"pipeline/01_collect.py -> 02_process.py -> 03_categorise.py -> 04_enrich.py -> 05_build_workbook.py (or pipeline/run_all.py). Reporting date {meta['asof']}; our bank = {s['our_bank']}."),
    ]
    for i, (a, b) in enumerate(rows, 1):
        ws.cell(row=i, column=1, value=a).font = Font(name="Calibri", bold=True)
        ws.cell(row=i, column=1).alignment = Alignment(vertical="top")
        ws.cell(row=i, column=2, value=b).alignment = WRAP
    _widths(ws, [30, 120])


def _comments(wb: Workbook, ours: pd.DataFrame) -> None:
    ws = wb.create_sheet("Comments")
    for j, h in enumerate(COMMENT_COLS, 1):
        c = ws.cell(row=1, column=j, value=h)
        c.font = Font(name="Calibri", bold=True)
    _widths(ws, COMMENT_WIDTHS)
    o = ours.sort_values("date", ascending=False, kind="stable")
    for r, row in enumerate(o.itertuples(index=False), 2):
        vals = [row.source, row.author, row.date, row.text_clean, None, None if pd.isna(row.rating) else int(row.rating), row.account_type,
                row.primary_area, row.secondary_area, row.sentiment, row.areas_for_improvement, row.competitors_offering]
        for j, v in enumerate(vals, 1):
            ws.cell(row=r, column=j, value=_none(v) if not isinstance(v, str) else (v or None))
    ws.auto_filter.ref = f"A1:{get_column_letter(len(COMMENT_COLS))}{len(o) + 1}"
    ws.freeze_panes = "A2"


def _summary(wb: Workbook, ours: pd.DataFrame, meta: dict) -> None:
    ws = wb.create_sheet("Summary")
    for j, h in enumerate(["Source", "Rows", "Rows with star rating (1-5)"], 1):
        ws.cell(row=1, column=j, value=h).font = Font(name="Calibri", bold=True)
    g = ours.groupby("source").agg(n=("source", "size"), rated=("rating", "count")).sort_values("n", ascending=False)
    r = 2
    for src, row in g.iterrows():
        ws.cell(row=r, column=1, value=src), ws.cell(row=r, column=2, value=int(row.n)), ws.cell(row=r, column=3, value=int(row.rated))
        r += 1
    for j, v in enumerate(["TOTAL", int(g.n.sum()), int(g.rated.sum())], 1):
        ws.cell(row=r, column=j, value=v).font = Font(name="Calibri", bold=True)
    r += 2
    ws.cell(row=r, column=1, value="Notes").font = Font(name="Calibri", bold=True)
    for note in COLLECTION_NOTES + [(f"Reporting date {meta['asof']}." if (meta.get("process") or {}).get("profile") == "archive"
                                              else f"Duplicates removed on (bank, source, user, date, text). Reporting date {meta['asof']}.")]:
        r += 1
        ws.cell(row=r, column=1, value=note)
    ws.column_dimensions["A"].width = 140


def _competitor_reference(wb: Workbook, df: pd.DataFrame, ours: pd.DataFrame) -> None:
    s = config.settings()
    rivals = [b for b in s["banks"] if b != s["our_bank"]]
    heads = ["Primary Area", "Secondary Area", "CBA comments", "CBA % positive", "CBA % negative", "CBA positives (summary)", "CBA negatives (summary)"]
    for b in rivals:
        heads += [f"{b} comments", f"{b} % positive", f"{b} % negative"]
    heads.append("What competitors are offering (summary)")
    ws = wb.create_sheet("Competitor Reference")
    for j, h in enumerate(heads, 1):
        _hdr(ws, 1, j, h)
    play = config.playbook()
    for r, (p, a) in enumerate(_areas(), 2):
        cs = ours[ours.secondary_area == a]
        ws.cell(row=r, column=1, value=p), ws.cell(row=r, column=2, value=a), ws.cell(row=r, column=3, value=len(cs))
        ws.cell(row=r, column=4, value=_pct(cs, "Positive")).number_format = "0%"
        ws.cell(row=r, column=5, value=_pct(cs, "Negative")).number_format = "0%"
        pt, nt = _summaries(a, cs)
        for cc, tx in ((6, pt), (7, nt)):
            ws.cell(row=r, column=cc, value=tx).alignment = WRAP
        for k, b in enumerate(rivals):
            sub = df[(df.secondary_area == a) & (df.bank == b)]
            col = 8 + 3 * k
            ws.cell(row=r, column=col, value=len(sub))
            ws.cell(row=r, column=col + 1, value=_pct(sub, "Positive")).number_format = "0%"
            ws.cell(row=r, column=col + 2, value=_pct(sub, "Negative")).number_format = "0%"
        ws.cell(row=r, column=len(heads), value=play[a]["competitor_offer"]).alignment = WRAP
    _widths(ws, [16, 46, 10, 10, 10, 55, 55] + [10] * (3 * len(rivals)) + [110])
    ws.freeze_panes = "C2"
    ws.row_dimensions[1].height = 32


def _intel_tab(wb: Workbook, name: str, ours: pd.DataFrame, rivals_df: pd.DataFrame, narrative, note: str, business: bool, supporting: bool) -> None:
    s = config.settings()
    rivals = [b for b in s["banks"] if b != s["our_bank"]]
    play = config.playbook()
    our, nr = s["our_bank"], len(rivals)
    heads = ["Primary Area", "Secondary Area", f"{our} comments", f"{our} % negative", f"{our} positives (summary)", f"{our} negatives (summary)"]
    for b in rivals:
        heads += [f"{b} comments", f"{b} % positive", f"{b} % negative"]
    heads += ["Strongest competitor (highest % positive, n>=5)", "Competitor intelligence", f"Opportunity for {our}",
              "Competitor mobile app features (official guides)", f"Mobile app suggestions for {our}"]
    c0 = 7 + 3 * nr                                          # first column after the per-rival blocks
    ws = wb.create_sheet(name)
    for j, h in enumerate(heads, 1):
        _hdr(ws, 1, j, h)
    _widths(ws, [16, 44, 10, 10, 55, 55] + [10] * (3 * nr) + [24, 110, 70, 90, 90])
    ws.row_dimensions[1].height = 45
    r = 2
    for p, a in _areas():
        pb, cs = play[a], ours[ours.secondary_area == a]
        ws.cell(row=r, column=1, value=p), ws.cell(row=r, column=2, value=a), ws.cell(row=r, column=3, value=len(cs))
        ws.cell(row=r, column=4, value=_pct(cs, "Negative")).number_format = "0%"
        pt, nt = _summaries(a, cs, example=supporting)
        for cc, tx in ((5, pt), (6, nt)):
            ws.cell(row=r, column=cc, value=tx).alignment = WRAP
        best = None
        for k, b in enumerate(rivals):
            sub = rivals_df[(rivals_df.secondary_area == a) & (rivals_df.bank == b)]
            col = 7 + 3 * k
            ws.cell(row=r, column=col, value=len(sub))
            pp = _pct(sub, "Positive")
            ws.cell(row=r, column=col + 1, value=pp).number_format = "0%"
            ws.cell(row=r, column=col + 2, value=_pct(sub, "Negative")).number_format = "0%"
            if len(sub) >= 5 and (best is None or pp > best[1]):
                best = (b, pp)
        ws.cell(row=r, column=c0, value=f"{best[0]} ({best[1]:.0%} positive)" if best else "Insufficient data (n<5 each)")
        rec = pb["mobile_recommendation"] + (" " + pb["business_recommendation"].removeprefix("BUSINESS: ") if business and pb["business_recommendation"] else "")
        for cc, tx in ((c0 + 1, narrative(a)), (c0 + 2, pb["improvement"]), (c0 + 3, pb["mobile_features"]), (c0 + 4, rec)):
            ws.cell(row=r, column=cc, value=tx).alignment = WRAP
        r += 1
    ws.cell(row=r + 1, column=1, value="Note").font = Font(name="Calibri", bold=True)
    ws.cell(row=r + 1, column=2, value=note).alignment = WRAP
    ws.merge_cells(start_row=r + 1, start_column=2, end_row=r + 1, end_column=c0 + 4)
    ws.row_dimensions[r + 1].height = 110
    ws.freeze_panes = "C2"
    if supporting:                                           # the comments behind each insight, so it can be checked
        base = c0 + 6
        for j, (h, w) in enumerate(zip(["Bank", "Source", "Date", "Rating", "Sentiment", "Secondary Area", "Comment"], [10, 22, 12, 8, 11, 36, 100])):
            _hdr(ws, 1, base + j, h)
            ws.column_dimensions[get_column_letter(base + j)].width = w
        for i, row in enumerate(rivals_df.sort_values(["secondary_area", "bank"]).itertuples(index=False), 2):
            for j, v in enumerate([row.bank, row.source, row.date, row.rating, row.sentiment, row.secondary_area, str(row.text_clean)[:600]]):
                ws.cell(row=i, column=base + j, value=_none(v))


def _intel(wb: Workbook, df: pd.DataFrame, ours: pd.DataFrame) -> None:
    s = config.settings()
    play = config.playbook()
    comp = df[df.bank != s["our_bank"]]
    bus, bg = comp[comp.account_type == "Business"], comp[comp.account_type.isin(["Business", "General"])]
    ours_bus, ours_bg = ours[ours.account_type == "Business"], ours[ours.account_type.isin(["Business", "General"])]

    def nar_bus(a: str) -> str:
        n = int((bus.secondary_area == a).sum())
        txt = (play[a]["business_intel"] or "No Business-tagged competitor comments in this area.") if n else "No Business-tagged ANZ/NAB/Westpac comments in this area."
        return f"[n={n}] {txt}"

    def nar_bg(a: str) -> str:
        b = play[a]["business_intel"]
        return play[a]["competitor_offer"] + (f"  BUSINESS-SPECIFIC SIGNAL: {b}" if b else "")

    note_bus = (f"Built only from comments tagged Account Type = Business (competitor {len(bus):,} comments, CBA {len(ours_bus):,}). Samples per area are small, so treat this as qualitative signal, not statistics. "
                "Job/corporate chatter (offshoring, layoffs, recruitment, salaries, executives, news articles) has been moved to General; a few non-business comments may still match broad keywords such as "
                "'profile' or 'two factor'. Supporting comments are listed to the right (after the blank column) so each insight can be checked.") + MOBNOTE
    note_bg = (f"Built from comments tagged Business or General (competitor {len(bg):,} comments, CBA {len(ours_bg):,}); Personal-tagged comments are excluded. General covers comments with no business or personal cue, "
               "so this view is mostly broad customer sentiment. The narrative combines the all-comment competitor summary with the business-specific signals from the Business-only tab.") + MOBNOTE
    _intel_tab(wb, "Intel - Business Only", ours_bus, bus, nar_bus, note_bus, business=True, supporting=True)
    _intel_tab(wb, "Intel - Business + General", ours_bg, bg, nar_bg, note_bg, business=True, supporting=False)


def _matrix(wb: Workbook) -> None:
    feats = config.load_json("competitor_features.json")
    ws = wb.create_sheet("Mobile App Feature Matrix")
    heads = ["Theme", "Feature", "ANZ (Australia)", "NAB (Australia)", "Westpac (New Zealand - indicative)", "Source"]
    for j, h in enumerate(heads, 1):
        _hdr(ws, 1, j, h)
    for i, row in enumerate(feats["rows"], 2):
        for j, v in enumerate(row, 1):
            ws.cell(row=i, column=j, value=v).alignment = WRAP
    r = len(feats["rows"]) + 3
    ws.cell(row=r, column=1, value="Notes").font = Font(name="Calibri", bold=True)
    for i, note in enumerate(feats.get("notes", []), 1):
        ws.cell(row=r + i, column=1, value=note)
    _widths(ws, [20, 44, 48, 48, 48, 40])
    ws.freeze_panes = "C2"


# ---------------------------------------------------------------- entry point
def build_workbook(df: pd.DataFrame, out: str | Path, process: dict | None = None) -> Path:
    """df = enriched categorised comments (all banks). Writes the xlsx and returns its path."""
    s = config.settings()
    need = {"areas_for_improvement", "competitors_offering", "secondary_area", "sentiment", "account_type", "text_clean"}
    if missing := need - set(df.columns):
        raise ValueError(f"build_workbook needs the enriched file (run pipeline/04_enrich.py first); missing columns: {sorted(missing)}")
    ours = df[df.bank == s["our_bank"]].copy()
    meta = {"process": process, "clean_rows": len(df), "asof": s["project"]["as_of"] or str(df["date"].max())}
    wb = Workbook()
    _method(wb, ours, meta)
    _comments(wb, ours)
    _summary(wb, ours, meta)
    _competitor_reference(wb, df, ours)
    _intel(wb, df, ours)
    _matrix(wb)
    out = Path(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    wb.save(out)
    print(f"[workbook] {out} ({len(ours):,} {s['our_bank']} comments, tabs: {', '.join(wb.sheetnames)})")
    return out
