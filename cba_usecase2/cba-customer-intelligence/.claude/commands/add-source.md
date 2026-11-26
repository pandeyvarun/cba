---
description: Add a new feedback channel (collector + config + test)
argument-hint: "<channel name, e.g. trustpilot>"
---
Follow `skills/data-collection/SKILL.md` ("Extending - add a channel") to add: $ARGUMENTS.

Create the collector in `src/ci/collect/`, register it, add a disabled entry to `config/sources.yaml`, and add a test with a recorded fixture (no network in tests). Do not enable it or request credentials without asking me.
