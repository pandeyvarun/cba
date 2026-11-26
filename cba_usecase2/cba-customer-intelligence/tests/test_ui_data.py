from ci import config, io
from ci.ui.export_data import export_data


def test_ui_constants_come_from_playbook(tmp_paths):
    import pandas as pd

    from ci.categorise import categorise_df
    from ci.collect.registry import build_collector
    from ci.process import process_df
    entry = next(e for e in config.sources_config() if e["collector"] == "file_import")
    cat = categorise_df(process_df(pd.DataFrame([c.to_row() for c in build_collector(entry).fetch()])), "rules")
    d = export_data(cat)
    play = config.playbook()
    assert d["titles"] == {a: p["title"] for a, p in play.items()}
    assert d["effort"] == {a: p["effort"] for a, p in play.items()}
    assert set(d["nomobile"]) == {a for a, p in play.items() if not p["mobile"]}
    js = (config.ROOT / "src/ci/ui/templates/app.js").read_text(encoding="utf-8")
    assert "const TITLES = D.titles" in js and "'Account opening & sign-up':" not in js
