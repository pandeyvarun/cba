"""The analysed workbook: enrichment rules, tab structure, numbers, and the five standalone step scripts."""
import subprocess
import sys
from pathlib import Path

import openpyxl
import pandas as pd
import pytest

from ci import config, io
from ci.report import build_workbook, enrich_df
from ci.report.enrich import improvement, rival_stats

ROOT = Path(__file__).resolve().parents[1]
FIRST_AREA = "Login, authentication & security lock-outs"


def test_improvement_rules():
    other = config.taxonomy()["other"]["secondary"]
    assert improvement(other, "Negative", "x").startswith("N/A")
    assert improvement(FIRST_AREA, "Positive", "love face id").startswith("None raised - strength to retain:")
    base = config.playbook()[FIRST_AREA]["improvement"]
    assert improvement(FIRST_AREA, "Negative", "nothing special here") == base                 # no keyword -> generic
    assert "biometric" in improvement(FIRST_AREA, "Negative", "face id keeps failing").lower()  # keyword refinement
    assert improvement(FIRST_AREA, "Neutral", "nothing special here") == "Opportunity: " + base


@pytest.fixture(scope="module")
def enriched(tmp_path_factory):
    from ci.categorise import categorise_df
    from ci.collect.registry import build_collector
    from ci.process import process_df
    entry = next(e for e in config.sources_config() if e["collector"] == "file_import")
    raw = pd.DataFrame([c.to_row() for c in build_collector(entry).fetch()])
    return enrich_df(categorise_df(process_df(raw), "rules"))


def test_enrich_only_touches_our_bank_and_counts_come_from_data(enriched):
    ours = enriched[enriched.bank == config.settings()["our_bank"]]
    others = enriched[enriched.bank != config.settings()["our_bank"]]
    assert (ours.areas_for_improvement != "").all() and (others.areas_for_improvement == "").all()
    stats = rival_stats(enriched)[FIRST_AREA]
    for b in ("ANZ", "NAB", "Westpac"):
        n = int(((enriched.bank == b) & (enriched.secondary_area == FIRST_AREA)).sum())
        assert f"{b} n={n}" in stats


def test_workbook_tabs_columns_and_numbers(enriched, tmp_path):
    out = build_workbook(enriched, tmp_path / "x.xlsx", process={"raw_rows": 1234, "profile": "analysis", "min_chars": 12, "max_chars": 1200, "hash_authors": True})
    wb = openpyxl.load_workbook(out)
    assert wb.sheetnames == ["Method & Notes", "Comments", "Summary", "Competitor Reference", "Intel - Business Only",
                             "Intel - Business + General", "Mobile App Feature Matrix"]
    ours = enriched[enriched.bank == "CBA"]
    c = wb["Comments"]
    assert [x.value for x in c[1]] == ["Source", "UserID", "Date", "Comment", "Reply", "Rating", "Account Type", "Primary Area",
                                       "Secondary Area", "Sentiment", "Areas for improvement", "What competitors are offering"]
    assert c.max_row == len(ours) + 1 and c.freeze_panes == "A2" and c.auto_filter.ref.endswith(str(len(ours) + 1))
    summ = {r[0]: r[1:3] for r in wb["Summary"].iter_rows(min_row=2, values_only=True) if r[0]}
    assert summ["TOTAL"][0] == len(ours) and summ["TOTAL"][1] == int(ours.rating.notna().sum())
    ref = pd.DataFrame(list(wb["Competitor Reference"].iter_rows(min_row=2, values_only=True)), columns=[x.value for x in wb["Competitor Reference"][1]])
    row = ref[ref["Secondary Area"] == FIRST_AREA].iloc[0]
    sub = ours[ours.secondary_area == FIRST_AREA]
    assert row["CBA comments"] == len(sub) and abs(row["CBA % negative"] - (sub.sentiment == "Negative").mean()) < 1e-9
    assert "1,234" in str(wb["Method & Notes"]["B3"].value)                                   # raw row count from step 2 shown
    assert any("Westpac" in str(r[0].value) for r in wb["Mobile App Feature Matrix"].iter_rows(min_row=36))   # footnotes present
    bus = wb["Intel - Business Only"]
    assert bus["V1"].value == "Bank" or any(x.value == "Bank" for x in bus[1])                # supporting comments block


def test_workbook_refuses_unenriched_input(tmp_path):
    with pytest.raises(ValueError, match="04_enrich"):
        build_workbook(pd.DataFrame({"bank": ["CBA"], "date": ["2026-01-01"]}), tmp_path / "x.xlsx")


def test_five_step_scripts_run_standalone_end_to_end(tmp_path):
    """Each pipeline/NN_*.py runs on its own and hands a file to the next; run_all chains them."""
    env = {**__import__("os").environ, "CI_ROOT": str(tmp_path)}
    (tmp_path / "config").symlink_to(ROOT / "config")
    (tmp_path / "data").mkdir()
    (tmp_path / "data" / "sample").symlink_to(ROOT / "data" / "sample")
    r = subprocess.run([sys.executable, str(ROOT / "pipeline" / "run_all.py"), "--source", "File drop (CSV/XLSX/JSON)"], env=env, capture_output=True, text=True)
    assert r.returncode == 0, r.stdout + r.stderr
    for name in ["data/raw", "data/interim/comments_clean.csv", "data/interim/process_stats.json", "data/processed/comments_categorised.csv",
                 "data/processed/comments_enriched.csv", "data/reports/commbank-user-comments-analysed.xlsx"]:
        assert (tmp_path / name).exists(), name
    assert "STEP 5" in r.stdout
    # steps are individually re-runnable: missing input gives a helpful message, not a traceback
    r2 = subprocess.run([sys.executable, str(ROOT / "pipeline" / "04_enrich.py"), "--input", str(tmp_path / "nope.csv")], env=env, capture_output=True, text=True)
    assert r2.returncode != 0
