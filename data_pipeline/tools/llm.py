"""Minimal async LLM client for chat-completions style APIs (Databricks serving endpoint or OpenAI).

    client = create_client()            # provider from LLM_PROVIDER env var (default: databricks)
    text = await client.chat([{"role": "user", "content": "hello"}])

Environment variables (or .env):
  databricks: DATABRICKS_TOKEN, DATABRICKS_ENDPOINT_URL (optional)
  openai:     OPENAI_API_KEY, OPENAI_MODEL (optional, default gpt-4.1)
"""

import asyncio
import os

import httpx
from dotenv import load_dotenv

load_dotenv()

DATABRICKS_URL = (
    "https://adb-7405609252709772.12.azuredatabricks.net/serving-endpoints/"
    "model-serving-usecase4-gpt-4_1/invocations"
)


class LLMClient:
    def __init__(self, url, api_key, model=None):
        self.url, self.api_key, self.model = url, api_key, model

    async def chat(self, messages, max_tokens=None, timeout=300, retries=3):
        """Send messages and return the reply text, or None if every attempt failed."""
        payload = {"messages": messages, "temperature": 0}
        if max_tokens:
            payload["max_tokens"] = max_tokens
        if self.model:
            payload["model"] = self.model
        headers = {"Authorization": f"Bearer {self.api_key}"}

        async with httpx.AsyncClient(timeout=timeout) as http:
            for attempt in range(retries):
                try:
                    r = await http.post(self.url, headers=headers, json=payload)
                    r.raise_for_status()
                    return r.json()["choices"][0]["message"]["content"]
                except (httpx.HTTPError, KeyError, ValueError):
                    await asyncio.sleep(2 ** attempt)
        return None


def create_client(provider=None):
    """provider: 'databricks' or 'openai' (default: LLM_PROVIDER env var, then databricks)."""
    provider = (provider or os.getenv("LLM_PROVIDER") or "databricks").lower()

    if provider == "databricks":
        token = os.getenv("DATABRICKS_TOKEN")
        if not token:
            raise EnvironmentError("DATABRICKS_TOKEN is not set (env var or .env file).")
        return LLMClient(os.getenv("DATABRICKS_ENDPOINT_URL", DATABRICKS_URL), token)

    if provider == "openai":
        key = os.getenv("OPENAI_API_KEY")
        if not key:
            raise EnvironmentError("OPENAI_API_KEY is not set (env var or .env file).")
        return LLMClient("https://api.openai.com/v1/chat/completions", key,
                         model=os.getenv("OPENAI_MODEL", "gpt-4.1"))

    raise ValueError(f"Unknown LLM provider '{provider}'. Use 'databricks' or 'openai'.")
