"""Add category1 / category2 to a DataFrame by sending comments to an LLM in batches (async)."""

import asyncio
import json
import re

from .prompt import load_prompt

MAX_RUNS = 5                  # maximum number of passes over the rows that still have no prediction
MAX_COMMENT_CHARS = 1000      # long comments are cut to keep each request small
ANSWER_LINE = re.compile(r"^\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*$", re.MULTILINE)  # e.g. "12|2|5"


async def _classify_batch(comments, system_prompt, allowed, client):
    """One LLM request. Returns a list with (category1, category2) per comment, or None if missed."""
    items = [{"id": i, "comment": c[:MAX_COMMENT_CHARS]} for i, c in enumerate(comments)]
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": json.dumps(items, ensure_ascii=False)},
    ]
    results = [None] * len(comments)

    reply = await client.chat(messages, max_tokens=min(30000, 15 * len(comments) + 200))
    for i, n1, n2 in ANSWER_LINE.findall(reply or ""):
        i, n1, n2 = int(i), int(n1), int(n2)
        if i < len(results) and 1 <= n1 <= len(allowed["category1"]) and 1 <= n2 <= len(allowed["category2"]):
            results[i] = (allowed["category1"][n1 - 1], allowed["category2"][n2 - 1])
    return results


async def add_categories(df, comment_column, client, batch_size=500, max_workers=4):
    """Return a copy of df with category1 and category2 columns (empty for rows the model did not answer).

    Comments go to the LLM in batches, `max_workers` requests at a time. After each run, the rows
    without a prediction are collected and classified again with the same batch size, up to MAX_RUNS runs.
    """
    system_prompt, allowed, _ = load_prompt()
    comments = [c if c.strip() else "(empty comment)" for c in df[comment_column].fillna("").astype(str)]
    results = {}  # row number -> (category1, category2)
    limit = asyncio.Semaphore(max_workers)

    async def classify(rows, label):
        async with limit:
            answers = await _classify_batch([comments[i] for i in rows], system_prompt, allowed, client)
        for i, answer in zip(rows, answers):
            if answer:
                results[i] = answer
        print(f"  {label} completed ({sum(a is not None for a in answers)}/{len(rows)} rows classified)")

    todo = list(range(len(comments)))
    for run_number in range(1, MAX_RUNS + 1):  # each run sends the rows still without a prediction
        todo = [i for i in todo if i not in results]
        if not todo:
            break
        batches = [todo[k:k + batch_size] for k in range(0, len(todo), batch_size)]
        print(f"Run {run_number}/{MAX_RUNS}: classifying {len(todo)} comments in {len(batches)} batches of up to {batch_size}")
        await asyncio.gather(*(
            classify(rows, f"Run {run_number} batch {n}/{len(batches)}") for n, rows in enumerate(batches, start=1)
        ))

    df = df.copy()
    df["category1"] = [results.get(i, (None, None))[0] for i in range(len(df))]
    df["category2"] = [results.get(i, (None, None))[1] for i in range(len(df))]
    print(f"✓ Classified {len(results)}/{len(df)} rows")
    return df
