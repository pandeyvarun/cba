# Skills specification

Each folder is one **skill**: a self-contained, reusable capability described in a `SKILL.md` that
Claude Code (or any agent) can follow end to end. Skills are *specifications* - the code lives in `src/ci/`.

```
skills/
  _template/SKILL.md          copy this to add a skill
  pipeline-orchestrator/      run everything, in order, with gates
  data-collection/            pull feedback from channels
  data-processing/            clean, redact PII, de-duplicate
  category-extraction/        area + segment + sentiment (rules / Claude / hybrid)
  analysis/                   scorecards, competitor gaps, trends, insights
  recommendations/            backlog items + Jira export
  ui-builder/                 build the interactive web app
```

## Use with Claude Code

Claude Code discovers skills in `.claude/skills/`. Link this folder once:

```bash
make link-skills        # = ln -s ../skills .claude/skills
```

Then ask in plain language ("collect last month's Google Play reviews and rebuild the dashboard") or
invoke the slash commands in `.claude/commands/`. Claude reads the matching `SKILL.md` and follows it.

## SKILL.md format

```markdown
---
name: kebab-case-name
description: One sentence saying WHEN to use it (this is what triggers the skill).
---
# Title
## Purpose            why the skill exists
## Inputs             files / settings / env vars it needs
## Outputs            files it writes + schema pointer
## Procedure          numbered steps with exact commands
## Quality gates      checks that must pass before moving on
## Prompts used       templates in /prompts
## Failure modes      what goes wrong and what to do
## Extending          how to add a channel / label / rule
```

## Conventions
- Stages communicate **only through files** (`data/raw` -> `interim` -> `processed` -> `reports` -> `dist`).
- Every skill must be runnable offline with `make demo` data; LLM and live collectors are optional.
- Statistics are computed in code, never by an LLM. LLMs label, summarise and draft; humans approve.
- No PII leaves `data/raw`; never commit `.env`, `data/raw`, or credentials.
