import re

import pytest

from ci import config
from ci.llm.prompts import load_prompt, render

NAMES = [p.stem for p in config.PROMPT_DIR.glob("*.md") if p.stem != "README"]


@pytest.mark.parametrize("name", NAMES)
def test_prompt_has_declared_inputs(name):
    p = load_prompt(name)
    assert p.meta.get("name") == name and p.user
    used = set(re.findall(r"\{\{\s*([\w.]+)\s*\}\}", p.system + p.user))
    assert used <= set(p.meta["inputs"]), f"{name}: undeclared variables {used - set(p.meta['inputs'])}"


def test_render_encodes_json_and_checks_missing():
    assert '"a": 1' in render("x {{v}}", v={"a": 1})
    with pytest.raises(KeyError):
        render("{{missing}}")
