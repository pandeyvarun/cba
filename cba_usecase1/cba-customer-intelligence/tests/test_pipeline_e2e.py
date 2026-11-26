"""Offline end-to-end: sample file -> process -> categorise -> analyse -> recommend -> UI (no network, no API key)."""
import json

import pandas as pd

from ci import config, io
from ci.analyse import analyse_df
from ci.analyse.metrics import Metrics
from ci.categorise import categorise_df
from ci.collect.registry import build_collector
from ci.process import process_df
from ci.recommend import jira
from ci.recommend.backlog import build_backlog
from ci.ui.build_app import build_ui


def test_end_to_end(tmp_path, monkeypatch):
    for k in ("raw", "interim", "processed", "reports", "dist"):
        monkeypatch.setitem(config.settings()["paths"], k, str(tmp_path / k))
    entry = next(e for e in config.sources_config() if e["collector"] == "file_import")
    raw = pd.DataFrame([c.to_row() for c in build_collector(entry).fetch()])
    assert len(raw) > 100 and {"bank", "source", "date", "text"} <= set(raw.columns)

    clean = process_df(raw)
    assert len(clean) >= 0.9 * len(raw) and "text_clean" in clean

    cat = categorise_df(clean, "rules")
    assert {"primary_area", "secondary_area", "account_type", "sentiment"} <= set(cat.columns)
    assert set(cat.sentiment) <= {"Positive", "Negative", "Neutral", "Mixed"}

    res = analyse_df(cat)
    assert res["summary"]["all"] and res["insights"]["all"]["lead"]

    items = build_backlog(Metrics(cat), "all")
    assert items and items[0]["priority_score"] >= items[-1]["priority_score"]
    payload = jira.bulk_payload(items)
    assert payload["issueUpdates"][0]["fields"]["summary"].startswith("[CBA App]")
    assert "Summary,Description" in jira.to_csv(items)

    out = build_ui(cat)
    html = out.read_text(encoding="utf-8")
    assert "Customer Intelligence" in html and '"agg":' in html
    json.loads(html.split('id="data">')[1].split("</script>")[0])      # embedded data is valid JSON
