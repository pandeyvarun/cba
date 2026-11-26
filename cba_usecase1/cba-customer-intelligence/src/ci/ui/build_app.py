"""Assemble a single self-contained HTML app from templates + data bundle (dist/index.html)."""
from __future__ import annotations

from pathlib import Path

import pandas as pd

from .. import config
from .export_data import export_data, to_json

TPL = Path(__file__).parent / "templates"
VENDOR = Path(__file__).parent / "vendor"

# (file in ui/vendor, CDN fallback URL). Vendored copies make dist/index.html work offline / air-gapped.
LIBS = [("chart.umd.min.js", "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"),
        ("xlsx.full.min.js", "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js")]


def _libs(vendor: bool) -> str:
    """Inline vendored JS when available (ui.vendor_assets), else reference the CDN."""
    tags = []
    for name, url in LIBS:
        f = VENDOR / name
        if vendor and f.exists():
            tags.append("<script>" + f.read_text(encoding="utf-8").replace("</script", "<\\/script") + "</script>")
        else:
            tags.append(f'<script src="{url}"></script>')
    return "\n".join(tags)

PAGE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Customer Intelligence Hub</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap">
<style>{css}</style></head><body>
{body}
<script type="application/json" id="data">{data}</script>
{libs}
<script>
{js}
</script></body></html>"""


def build_ui(df: pd.DataFrame, out: str | Path | None = None, cdn: bool = False) -> Path:
    data = export_data(df)
    html = PAGE.format(css=(TPL / "app.css").read_text(encoding="utf-8"), body=(TPL / "app_body.html").read_text(encoding="utf-8"),
                       data=to_json(data), libs=_libs(config.settings().get("ui", {}).get("vendor_assets", True) and not cdn), js=(TPL / "app.js").read_text(encoding="utf-8"))
    out = Path(out) if out else config.path("dist") / "index.html"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding="utf-8")
    print(f"[ui] wrote {out} ({len(html) / 1e6:.1f} MB, {len(data['cba']):,} CBA comments)")
    return out
