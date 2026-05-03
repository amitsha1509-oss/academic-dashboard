"""
classifier.py — the ONE AI call. Free text → structured ClassifiedTask.

Per BUILDING_PRINCIPLES.md "Maximize code, minimize AI": Groq's only
job is to PICK from a closed list (the user's categories) and extract dates.
Everything else (DB writes, filtering, computing virtual instances,
deciding what to show today) is deterministic Python.

Switched from Gemini (20 req/day free) to Groq (1,000 req/day free) in
session 6. The prompts are identical; only the client + response parsing changed.
"""
import json
import os
from datetime import datetime, timezone
from typing import Optional

from groq import Groq

import models

MODEL = "llama-3.3-70b-versatile"


def _system_prompt(user_categories: list[str]) -> str:
    cats_listed = ", ".join(user_categories)
    if "כללי" in user_categories:
        general_rule = (
            '- "כללי" (general) is a legitimate first-class choice. Use it for non-academic tasks\n'
            "  (errands, personal, social) or tasks too vague to identify a specific course.\n"
        )
    else:
        general_rule = (
            "- If no category clearly fits, pick the closest one. Never invent a new category.\n"
        )
    return f"""You are a strict classifier for a Hebrew-speaking university student's task tracker.

Reply with ONLY a single JSON object — no prose, no backticks. Schema:
{{
  "category_name": one of [{cats_listed}],
  "title": short rephrase in the SAME language as the input,
  "type": one of [lecture, tutorial, hw, reading, adhoc],
  "place": one of [home, university, library, cafe, other] or null,
  "importance": integer 1..5,
  "urgency": integer 1..5,
  "due_at": ISO 8601 with timezone offset, or null,
  "scheduled_at": ISO 8601 with timezone offset, or null,
  "notes": string or null
}}

Rules:
- "category_name" MUST be one of the listed categories. Never invent a new one.
{general_rule}- Hebrew input → Hebrew title and notes. English input → English. Never mix.
- "due_at": parse relative phrases ("tomorrow", "Friday", "today at 9") relative to the TODAY
  anchor in the user message. Return ISO 8601 with the SAME timezone offset as TODAY.
  Day mapping is literal: "today at 9" → today's 09:00 even if 9 has already passed.
- "scheduled_at": when the user said they'll DO it (different from due_at). Null if not stated.
- "type": "hw" for assignments/tests, "lecture"/"tutorial" for class events,
  "reading" for reading tasks, "adhoc" for everything else.
- "importance"/"urgency": default 3 unless the input clearly justifies higher/lower.
"""


_client: Optional[Groq] = None


def _get_client() -> Groq:
    global _client
    if _client is None:
        api_key = os.environ.get("GROQ_API_KEY")
        if not api_key:
            raise RuntimeError(
                "GROQ_API_KEY is not set. Get a free key at "
                "https://console.groq.com and put it in .env."
            )
        _client = Groq(api_key=api_key)
    return _client


def _priorities_prompt(user_categories: list[str]) -> str:
    cats_listed = ", ".join(f'"{c}"' for c in user_categories)
    return f"""You are scoring importance/urgency the user assigns to academic tasks, based on a free-text profile they wrote.

The user can talk about TWO axes:

1. CATEGORIES — specific courses. The user's categories are:
   {cats_listed}

2. KINDS — task TYPES across all courses. 4 kinds:
   "lecture"  — הרצאות (course lectures)
   "tutorial" — תרגולים (tutorials/recitations)
   "hw"       — תרגילי בית (homework, problem sets, assignments)
   "reading"  — קריאות (readings, materials before lecture)

For each, return importance (1=trivial, 5=critical) and urgency (1=no pressure, 5=must always do now). If the profile doesn't mention an axis, return 3 (neutral) for that entry.

Reply with ONLY a single JSON object, no prose, no backticks. Schema:
{{
  "categories": [
    {{"category_name": "...", "importance": 1..5, "urgency": 1..5, "reason": "short why"}},
    ... (one entry per category in the list above)
  ],
  "kinds": [
    {{"kind": "lecture", "importance": 1..5, "urgency": 1..5, "reason": "short why"}},
    {{"kind": "tutorial", "importance": 1..5, "urgency": 1..5, "reason": "short why"}},
    {{"kind": "hw", "importance": 1..5, "urgency": 1..5, "reason": "short why"}},
    {{"kind": "reading", "importance": 1..5, "urgency": 1..5, "reason": "short why"}}
  ]
}}
"""


def derive_priorities(user_context: str, user_categories: list[str] = None) -> dict:
    """One AI call. Given user's free-text profile, return per-category and per-kind importance/urgency."""
    user_categories = user_categories or []
    if not user_context.strip():
        return {
            "categories": [
                {"category_name": c, "importance": 3, "urgency": 3, "reason": ""}
                for c in user_categories
            ],
            "kinds": [
                {"kind": k, "importance": 3, "urgency": 3, "reason": ""}
                for k in ("lecture", "tutorial", "hw", "reading")
            ],
        }

    client = _get_client()
    response = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": _priorities_prompt(user_categories)},
            {"role": "user", "content": f"User profile:\n{user_context.strip()}"},
        ],
        response_format={"type": "json_object"},
        temperature=0.0,
    )
    data = json.loads(response.choices[0].message.content)
    return {
        "categories": data.get("categories", []),
        "kinds": data.get("kinds", []),
    }


derive_category_priorities = derive_priorities


def generate_keywords(course_name: str) -> str:
    """Generate classification keywords for a newly created course.

    Called once at course-creation time. Returns a comma-separated string of
    Hebrew + English terms stored in categories.keywords. The keyword classifier
    loads these per-user on each classify() call so new courses are handled by
    the code path immediately — no AI call needed for future tasks.

    Returns "" on failure (safe: classify() falls back to AI for that course).
    """
    client = _get_client()
    prompt = (
        f'Generate 10-15 classification keywords for a university course named "{course_name}".\n'
        "These keywords will be matched against Hebrew student task descriptions to identify "
        "which course a task belongs to.\n"
        "Return ONLY a JSON array of strings. Include: the course name itself, common "
        "abbreviations, key technical terms in Hebrew and English. "
        "Exclude generic words like מבחן/תרגיל/לקרוא that apply to every course.\n"
        f'Example for "לינארית": ["לינארית","linear algebra","מטריצה","matrix","eigenvalue","ערך עצמי"]'
    )
    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.0,
        )
        # Groq wraps arrays in a json_object — unwrap if needed
        raw = json.loads(response.choices[0].message.content)
        if isinstance(raw, list):
            keywords = raw
        elif isinstance(raw, dict):
            # Model may wrap: {"keywords": [...]} or {"words": [...]}
            keywords = next((v for v in raw.values() if isinstance(v, list)), [])
        else:
            keywords = []
        return ",".join(str(k).strip() for k in keywords if str(k).strip())
    except Exception as e:
        print(f"[keywords] generate_keywords failed for '{course_name}': {e}")
    return ""


def classify(
    text: str,
    client_now: Optional[str] = None,
    user_context: str = "",
    user_categories: list[str] = None,
) -> models.ClassifiedTask:
    """Single AI call. Returns a Pydantic-validated ClassifiedTask."""
    user_categories = user_categories or []
    if not user_categories:
        raise RuntimeError("classify() called without user_categories — caller bug.")

    client = _get_client()
    today = (
        client_now.strip() if client_now
        else datetime.now(timezone.utc).isoformat(timespec="seconds")
    )
    parts = [
        f"TODAY: {today}",
        "Important: TODAY's offset is the user's local timezone. Interpret all "
        "relative time phrases in THIS timezone. Return due_at and scheduled_at "
        "as ISO 8601 with the SAME offset, never convert to UTC.",
    ]
    if user_context.strip():
        parts.append(
            "USER PROFILE — preferences and facts the user has told you about "
            "themselves. Apply them when classifying. They take precedence over "
            "default rules wherever they conflict.\n\n" + user_context.strip()
        )
    parts.append(f"Task: {text}")
    user_message = "\n\n".join(parts)

    response = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": _system_prompt(user_categories)},
            {"role": "user", "content": user_message},
        ],
        response_format={"type": "json_object"},
        temperature=0.0,
    )
    return models.ClassifiedTask.model_validate_json(response.choices[0].message.content)
