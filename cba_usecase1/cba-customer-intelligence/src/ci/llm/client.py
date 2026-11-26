"""Thin Claude wrapper. Swap in a fake with set_client() for tests / offline runs."""
from __future__ import annotations

import json
import os
import re
import time
from typing import Any, Protocol

from .. import config
from .prompts import load_prompt, render


class LLMClient(Protocol):
    def complete(self, system: str, user: str, *, model: str, max_tokens: int) -> str: ...


class AnthropicClient:
    def __init__(self):
        import anthropic  # lazy: optional dependency
        config.load_env()
        if not os.environ.get("ANTHROPIC_API_KEY"):
            raise RuntimeError("ANTHROPIC_API_KEY is not set (see .env.example)")
        self._c = anthropic.Anthropic()

    def complete(self, system: str, user: str, *, model: str, max_tokens: int = 4000) -> str:
        for attempt in range(4):
            try:
                r = self._c.messages.create(model=model, max_tokens=max_tokens, system=system,
                                            messages=[{"role": "user", "content": user}])
                return "".join(b.text for b in r.content if getattr(b, "type", "") == "text")
            except Exception:  # noqa: BLE001 - rate limits / transient errors
                if attempt == 3:
                    raise
                time.sleep(2 ** attempt)
        return ""


_client: LLMClient | None = None


def set_client(c: LLMClient | None) -> None:
    global _client
    _client = c


def get_client() -> LLMClient:
    global _client
    if _client is None:
        _client = AnthropicClient()
    return _client


def ask(prompt_name: str, *, model: str | None = None, max_tokens: int = 4000, **vars: Any) -> str:
    p = load_prompt(prompt_name)
    model = model or config.settings()["categorise"]["llm_model"]
    return get_client().complete(render(p.system, **vars) if p.system else "", render(p.user, **vars),
                                 model=model, max_tokens=max_tokens)


def ask_json(prompt_name: str, **kw) -> Any:
    raw = ask(prompt_name, **kw).strip()
    raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw)
    start = min([i for i in (raw.find("["), raw.find("{")) if i >= 0], default=0)
    return json.loads(raw[start:])
