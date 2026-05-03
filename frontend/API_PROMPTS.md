# Claude Prompts (copy-paste ready)

These are the exact prompts the prototype uses. They've been tuned to return strict JSON. Send them with **Claude Haiku 4.5** (or Sonnet for higher quality on connections).

> **Output discipline.** Every prompt ends with a "return ONLY this JSON" instruction. Even so, the model occasionally wraps the response in ```json fences. The prototype handles this with a regex-extract-first-`{...}` fallback — do the same server-side. See `extractJSON()` in `src/claude-api.jsx`.

---

## 1. Classify a freshly-captured task

**When:** user submits the capture bar.
**Input:** `raw_text` (string), current ISO datetime, the DIMENSIONS enum.
**Output:** Task fields the frontend needs to render the card.

### Prompt template

```
You are a task classifier for a personal life-dashboard app. Classify the user's free-text task along several dimensions and propose 2-4 concrete next steps.

The user wrote ({{LANGUAGE}}):
"""
{{RAW_TEXT}}
"""

Current date/time (use this to interpret "tomorrow", "next week", etc): {{NOW_ISO}}

Pick exactly ONE value from each list — never invent new values:

subject: projects, money, university, friends, errands, health, other
context: @phone, @computer, @errand, @home, @anywhere
importance: low, medium, high
urgency: low, medium, high

Rules:
- @phone = needs a call/text. @computer = needs a laptop/browser. @errand = needs leaving the house. @home = at home, no errand. @anywhere = no constraint.
- urgency=high means today/this week, medium=this month, low=eventually.
- If the user mentions a specific date/time, output it as ISO 8601 in time_value (e.g. "2026-04-26T14:30:00"). Otherwise time_value: null.
- next_steps must be 2-4 SHORT actionable bullets in {{STEPS_LANG}}, written in the user's language. Each step ≤ 6 words. Concrete verbs.

Return ONLY a JSON object, no prose, no markdown fence:
{
  "subject": "...",
  "context": "...",
  "importance": "...",
  "urgency": "...",
  "time_value": null | "ISO string",
  "next_steps": ["...", "..."]
}
```

### Variables to substitute
- `{{LANGUAGE}}` — `"Hebrew"` or `"English"` (detect from raw_text using `/[\u0590-\u05FF]/`)
- `{{RAW_TEXT}}` — the user's input verbatim
- `{{NOW_ISO}}` — `datetime.now().isoformat()` so date references resolve correctly
- `{{STEPS_LANG}}` — same as `{{LANGUAGE}}` (next_steps should match what the user wrote)

### Sanity check the response
The model occasionally hallucinates an off-list enum. Validate every field against `DIMENSIONS` and fall back to safe defaults:

```py
def safe(v, allowed, fallback):
    return v if v in allowed else fallback

result = {
    "subject":    safe(parsed.get("subject"),    DIMENSIONS["subject"],    "other"),
    "context":    safe(parsed.get("context"),    DIMENSIONS["context"],    "@anywhere"),
    "importance": safe(parsed.get("importance"), DIMENSIONS["importance"], "medium"),
    "urgency":    safe(parsed.get("urgency"),    DIMENSIONS["urgency"],    "medium"),
    "time_value": parsed.get("time_value") or None,
    "next_steps": [s for s in (parsed.get("next_steps") or []) if isinstance(s, str)][:4],
}
```

---

## 2. Suggest new dimensions / values

**When:** user clicks "Suggest new dimensions" in the AI panel.
**Input:** the user's recent tasks (cap at 30 most recent).
**Output:** new value proposals + new dimension proposals.

### Prompt template

```
You are a thoughtful PM helping a user understand their task data. Their current dimensions are:
  subject: projects, money, university, friends, errands, health, other
  context: @phone, @computer, @errand, @home, @anywhere
  importance: low, medium, high
  urgency: low, medium, high

Here are their recent tasks:
{{TASK_LIST}}

Propose:
1. NEW VALUES to add to existing dimensions (e.g. a new context or subject) — only if multiple tasks point to a missing value.
2. NEW DIMENSIONS the data is asking for (e.g. "energy_level", "estimated_minutes") — only if you see a real pattern.

Be conservative. Only suggest things that are clearly justified by the task list. Reasons should reference specific tasks.

Return ONLY this JSON, no prose, no fence:
{
  "new_values": [
    { "dimension": "context|subject|...", "value": "...", "reason": "...", "example_task_ids": [1,2] }
  ],
  "new_dimensions": [
    { "name": "snake_case", "allowed_values": ["..."], "reason": "...", "example_task_ids": [1,2] }
  ]
}

Aim for 2-3 items in each array. Empty array if nothing strongly justified.
```

### `{{TASK_LIST}}` format
One task per line:
```
- [id:1] subject=friends context=@phone importance=low urgency=high :: send dana good luck for her test tomorrow 9am
- [id:2] subject=university context=@home importance=high urgency=medium :: study for thermo final
```

---

## 3. Suggest connections / batches

**When:** user clicks "Suggest connections" in the AI panel.
**Input:** open tasks only (status != "done"), cap at 40.
**Output:** sessions (batches that share context) + related (semantic groups).

### Prompt template

```
You are a productivity coach analyzing a user's open tasks. Find:
1. SESSIONS — groups of 2-4 tasks that share a context (e.g. all @computer money tasks) and could be batched in one sitting. Estimate total minutes.
2. RELATED — pairs/triples of tasks that have a meaningful connection (depend on each other, are about the same project/person, would benefit from being done together).

Open tasks:
{{TASK_LIST}}

Return ONLY this JSON, no prose, no fence:
{
  "sessions": [
    { "task_ids": [1,2], "label": "short batch name", "estimated_minutes": 45, "reason": "why these go together" }
  ],
  "related": [
    { "task_ids": [3,4], "kind": "depends-on|same-person|same-project|...", "reason": "..." }
  ]
}

Aim for 1-3 sessions and 1-3 related groups. Don't force connections — empty array is fine.
```

---

## Model & params

| Setting | Recommended |
|---|---|
| Model | `claude-haiku-4-5` for classify, `claude-sonnet-4-5` for suggestions |
| `max_tokens` | 1024 (classify), 2048 (suggestions) |
| `temperature` | 0.2 |
| `system` prompt | None — the user message carries everything |

For latency, classify must feel fast — Haiku is the right call. Suggestions can take 5s and the prototype already shows a thinking state for them.

---

## FastAPI sketch

```py
from anthropic import Anthropic
import re, json

client = Anthropic()  # uses ANTHROPIC_API_KEY env var

JSON_RE = re.compile(r"(\{[\s\S]*\}|\[[\s\S]*\])")

def call_claude(prompt: str, model: str = "claude-haiku-4-5", max_tokens: int = 1024):
    resp = client.messages.create(
        model=model,
        max_tokens=max_tokens,
        temperature=0.2,
        messages=[{"role": "user", "content": prompt}],
    )
    text = resp.content[0].text
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        m = JSON_RE.search(text)
        if not m:
            raise ValueError(f"no JSON in model response: {text[:200]}")
        return json.loads(m.group(0))
```
