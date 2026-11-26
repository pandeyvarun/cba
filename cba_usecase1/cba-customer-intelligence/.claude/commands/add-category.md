---
description: Add or change a journey area in the taxonomy safely
argument-hint: "<area name and what it covers>"
---
Follow `skills/category-extraction/SKILL.md` ("Extending - add or change a category") for: $ARGUMENTS.

Update `config/taxonomy.json`, `config/playbook.json`, and the golden set. Run `make eval` before and after and report the accuracy change. Remember the UI templates carry `TITLES`/`EFFORT` constants in `src/ci/ui/templates/app.js`.
