"""Jira export: CSV import file, bulk-create JSON (REST v2/v3) and an optional guarded push."""
from __future__ import annotations

import csv
import io
import json
import os

import requests

from .. import config


def _desc_sections(it: dict) -> list[tuple[str, list[str]]]:
    ev = it["evidence"]
    return [
        ("Problem", [it["problem"]]),
        ("Evidence", [f"{ev['comments']} comments, {ev['negative_pct']}% negative vs rivals {ev['rival_negative_pct']}% "
                      f"(gap {ev['gap_pts']} pts). Priority score {it['priority_score']}/100."] + [f"Customer: \u201c{c}\u201d" for c in it["customer_voice"]]),
        ("Competitor benchmark", [b for b in it["competitor_benchmark"] if b]),
        ("Recommendation", [it["recommendation"]]),
        ("Acceptance criteria (draft)", it["acceptance_criteria"]),
    ]


def adf(it: dict) -> dict:
    content = []
    for h, ps in _desc_sections(it):
        content.append({"type": "heading", "attrs": {"level": 3}, "content": [{"type": "text", "text": h}]})
        content.append({"type": "bulletList", "content": [
            {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": p}]}]} for p in ps]})
    return {"type": "doc", "version": 1, "content": content}


def wiki(it: dict) -> str:
    return "\n\n".join(f"h3. {h}\n" + "\n".join(f"* {p}" for p in ps) for h, ps in _desc_sections(it))


def bulk_payload(items: list[dict]) -> dict:
    j = config.settings()["jira"]
    updates = []
    for it in items:
        f = {"project": {"key": j["project_key"]}, "summary": it["summary"], "issuetype": {"name": j["issue_type"]},
             "labels": sorted(set(it["labels"] + j.get("labels", []))), "priority": {"name": it["priority"]},
             "description": adf(it) if str(j["api_version"]) == "3" else wiki(it)}
        if j.get("component"):
            f["components"] = [{"name": j["component"]}]
        if j.get("parent_key"):
            f["parent"] = {"key": j["parent_key"]}
        updates.append({"fields": f})
    return {"issueUpdates": updates}


def to_csv(items: list[dict]) -> str:
    j = config.settings()["jira"]
    L = 6
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Summary", "Description", "Issue Type", "Priority", *["Labels"] * L, "Component/s", "Parent", "Project Key"])
    for it in items:
        labels = sorted(set(it["labels"] + j.get("labels", [])))
        desc = "\n\n".join(f"{h}\n" + "\n".join(f"- {p}" for p in ps) for h, ps in _desc_sections(it))
        w.writerow([it["summary"], desc, j["issue_type"], it["priority"], *[(labels[k] if k < len(labels) else "") for k in range(L)],
                    j.get("component") or "", j.get("parent_key") or "", j["project_key"]])
    return buf.getvalue()


def write_exports(items: list[dict]) -> None:
    out = config.path("reports")
    (out / "jira_import.csv").write_text(to_csv(items), encoding="utf-8")
    (out / "jira_bulk.json").write_text(json.dumps(bulk_payload(items), indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"[recommend] Jira exports -> {out}/jira_import.csv, jira_bulk.json")


def push(items: list[dict], dry_run: bool | None = None) -> dict:
    """POST to /rest/api/<v>/issue/bulk in chunks of 50. Dry-run by default (settings.jira.dry_run).

    Returns {"dry_run": bool, "count": n, "created": [issue dicts]}.
    """
    config.load_env()
    j = config.settings()["jira"]
    dry = j["dry_run"] if dry_run is None else dry_run
    payload = bulk_payload(items)
    if dry:
        print(f"[jira] DRY RUN - would create {len(items)} issues in {j['project_key']}. Pass --push to send.")
        return {"dry_run": True, "count": len(items), "created": [], "project": j["project_key"]}
    site, auth = os.environ["JIRA_SITE"].rstrip("/"), (os.environ["JIRA_EMAIL"], os.environ["JIRA_API_TOKEN"])
    created: list[dict] = []
    for i in range(0, len(payload["issueUpdates"]), 50):
        chunk = {"issueUpdates": payload["issueUpdates"][i:i + 50]}
        r = requests.post(f"{site}/rest/api/{j['api_version']}/issue/bulk", json=chunk, auth=auth, timeout=60)
        r.raise_for_status()
        issues = r.json().get("issues", [])
        created.extend(issues)
        print(f"[jira] created {len(issues)} issues")
    return {"dry_run": False, "count": len(created), "created": created, "project": j["project_key"]}
