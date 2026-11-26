"""Small HTTP backend for the web app: backlog, ingest and (guarded) Jira push. Run: `ci serve`."""
from .app import create_app

__all__ = ["create_app"]
