"""Collector interface. Add a channel = subclass Collector + register it."""
from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import date, datetime, timezone
from typing import Iterable

from ..schema import RawComment


class Collector(ABC):
    channel: str = "base"

    def __init__(self, name: str, bank: str, params: dict):
        self.name, self.bank, self.params = name, bank, params

    @abstractmethod
    def fetch(self, since: date | None = None) -> Iterable[RawComment]:
        """Yield RawComment objects. Must not interpret or filter content."""

    # helpers -----------------------------------------------------------
    @staticmethod
    def iso(value) -> str:
        if value is None or value == "":
            return date.today().isoformat()
        if isinstance(value, (int, float)):
            return datetime.fromtimestamp(float(value), tz=timezone.utc).date().isoformat()
        if isinstance(value, datetime):
            return value.date().isoformat()
        s = str(value)
        try:
            return datetime.fromisoformat(s.replace("Z", "+00:00")).date().isoformat()
        except ValueError:
            return s[:10]

    @staticmethod
    def stars(value) -> int | None:
        try:
            v = round(float(value))
            return v if 1 <= v <= 5 else None
        except (TypeError, ValueError):
            return None
