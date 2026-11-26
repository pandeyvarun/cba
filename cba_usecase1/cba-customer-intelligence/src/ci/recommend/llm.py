"""Optional: let Claude rewrite backlog items into well-formed stories (prompt: prompts/jira_story.md)."""
from __future__ import annotations

from ..llm import ask_json


def refine(items: list[dict]) -> list[dict]:
    out = []
    for it in items:
        try:
            r = ask_json("jira_story", item=it)
            it = {**it, "summary": r.get("summary", it["summary"]), "problem": r.get("problem", it["problem"]),
                  "acceptance_criteria": r.get("acceptance_criteria", it["acceptance_criteria"])}
        except Exception as e:  # noqa: BLE001 - keep deterministic item on any LLM failure
            print(f"[recommend] LLM refine skipped for '{it['title']}': {e!r}")
        out.append(it)
    return out
