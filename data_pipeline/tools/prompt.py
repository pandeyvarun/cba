"""Build the LLM system instruction from config/system_prompt.yaml + config/categories.yaml.

Every allowed value gets a number (its position in categories.yaml, starting at 1). The model answers
with these numbers instead of the full label names, which keeps its reply short and fast.
"""

from pathlib import Path

import yaml

CONFIG_DIR = Path(__file__).resolve().parent.parent / "config"
KEYS = ("category1", "category2")


def _load(name):
    with open(CONFIG_DIR / name, encoding="utf-8") as f:
        return yaml.safe_load(f)


def _flat(text):
    return " ".join(str(text).split())


def load_prompt():
    """Return (system_prompt, allowed, defaults).

    allowed: {"category1": [names...], "category2": [names...]} (lowercase, in yaml order).
    The model's number N means allowed[key][N - 1].
    defaults: {"category1": name, "category2": name}, used when the LLM cannot classify a row.
    """
    cfg, prompt = _load("categories.yaml"), _load("system_prompt.yaml")
    newline = chr(10)

    blocks, allowed, defaults = [], {}, {}
    for n, key in enumerate(KEYS, start=1):
        cat = cfg["categories"][key]
        allowed[key] = [v["name"].strip().lower() for v in cat["values"]]
        defaults[key] = cat["default"].strip().lower()
        if defaults[key] not in allowed[key]:
            raise ValueError(f"categories.yaml: default '{cat['default']}' is not one of the {key} values")

        lines = [f'{n}. {key} ({cat["title"]}) - {_flat(cat["description"])} Allowed values:']
        lines += [f'   [{i}] "{v["name"]}": {_flat(v["description"])}' for i, v in enumerate(cat["values"], start=1)]
        blocks.append(newline.join(lines))

    system_prompt = prompt["system_prompt"].format(
        role=_flat(cfg["role"]),
        category_definitions=(newline + newline).join(blocks),
        rules=newline.join(f"- {_flat(r)}" for r in cfg["rules"]),
        output_format="<id>|<category1 number>|<category2 number>",
    ).strip()
    return system_prompt + newline + prompt["batch_instructions"].format(), allowed, defaults
