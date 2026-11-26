"""Configuration + file-path helpers shared by every stage."""
from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

ROOT = Path(os.environ.get("CI_ROOT", Path(__file__).resolve().parents[2]))
CONFIG_DIR = ROOT / "config"
PROMPT_DIR = ROOT / "prompts"


def _deep_set(d: dict, dotted: str, value: Any) -> None:
    keys = dotted.split(".")
    for k in keys[:-1]:
        d = d.setdefault(k, {})
    d[keys[-1]] = value


@lru_cache(maxsize=1)
def settings() -> dict:
    with open(CONFIG_DIR / "settings.yaml", encoding="utf-8") as f:
        return yaml.safe_load(f)


def override(pairs: list[str] | None) -> None:
    """Apply --set a.b=c overrides (values parsed as YAML scalars)."""
    s = settings()
    for p in pairs or []:
        k, _, v = p.partition("=")
        _deep_set(s, k.strip(), yaml.safe_load(v))


def load_json(name: str) -> dict:
    with open(CONFIG_DIR / name, encoding="utf-8") as f:
        return json.load(f)


@lru_cache(maxsize=1)
def taxonomy() -> dict:
    return load_json("taxonomy.json")


@lru_cache(maxsize=1)
def segments() -> dict:
    return load_json("segments.json")


@lru_cache(maxsize=1)
def playbook() -> dict:
    return load_json("playbook.json")["areas"]


@lru_cache(maxsize=1)
def sources_config() -> list[dict]:
    with open(CONFIG_DIR / "sources.yaml", encoding="utf-8") as f:
        return yaml.safe_load(f)["sources"]


def path(key: str) -> Path:
    p = ROOT / settings()["paths"][key]
    p.mkdir(parents=True, exist_ok=True)
    return p


def load_env() -> None:
    """Minimal .env loader (no extra dependency)."""
    env = ROOT / ".env"
    if not env.exists():
        return
    for line in env.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
