"""ServiceNow Table API collector (use a read-only service account; credentials via env)."""
from __future__ import annotations

import os
from datetime import date
from typing import Iterable

import requests

from ..schema import RawComment
from .base import Collector


class ServiceNowCollector(Collector):
    channel = "servicenow"

    def fetch(self, since: date | None = None) -> Iterable[RawComment]:
        p = self.params
        inst = os.environ["SERVICENOW_INSTANCE"]
        auth = (os.environ["SERVICENOW_USER"], os.environ["SERVICENOW_PASSWORD"])
        fields = list(p.get("text_fields", ["short_description", "description"])) + [p.get("date_field", "opened_at"), "number"]
        query = p.get("query", "")
        if since:
            query += f"^{p.get('date_field', 'opened_at')}>={since.isoformat()}"
        offset, page = 0, 500
        while offset < int(p.get("limit", 5000)):
            r = requests.get(
                f"https://{inst}/api/now/table/{p['table']}", auth=auth, timeout=60,
                params={"sysparm_query": query, "sysparm_fields": ",".join(fields), "sysparm_limit": page,
                        "sysparm_offset": offset, "sysparm_display_value": "true"},
                headers={"Accept": "application/json"},
            )
            r.raise_for_status()
            rows = r.json().get("result", [])
            if not rows:
                break
            for row in rows:
                text = ". ".join(row.get(f, "") for f in p.get("text_fields", []) if row.get(f))
                yield RawComment(
                    bank=self.bank, source="ServiceNow", channel=self.channel,
                    date=self.iso(row.get(p.get("date_field", "opened_at"))), text=text,
                    id=row.get("number", ""),
                )
            offset += page
