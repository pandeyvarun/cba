"""Prompt templates live in /prompts/*.md.

Format:
    ---
    name: ...            (frontmatter: name, description, inputs, output)
    ---
    ## system
    ...
    ## user
    ... {{variable}} ...
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from functools import lru_cache

import yaml

from .. import config


@dataclass
class Prompt:
    name: str
    meta: dict
    system: str
    user: str


@lru_cache(maxsize=None)
def load_prompt(name: str) -> Prompt:
    text = (config.PROMPT_DIR / f"{name}.md").read_text(encoding="utf-8")
    m = re.match(r"^---\n(.*?)\n---\n(.*)$", text, re.S)
    meta, body = (yaml.safe_load(m.group(1)), m.group(2)) if m else ({}, text)
    parts = re.split(r"^## (system|user)\s*$", body, flags=re.M)
    sections = {parts[i]: parts[i + 1].strip() for i in range(1, len(parts) - 1, 2)}
    return Prompt(name, meta, sections.get("system", ""), sections.get("user", body.strip()))


def render(template: str, **vars) -> str:
    def sub(m):
        k = m.group(1).strip()
        if k not in vars:
            raise KeyError(f"prompt variable '{k}' not supplied")
        v = vars[k]
        return v if isinstance(v, str) else json.dumps(v, ensure_ascii=False, indent=2)
    return re.sub(r"\{\{\s*([\w.]+)\s*\}\}", sub, template)
