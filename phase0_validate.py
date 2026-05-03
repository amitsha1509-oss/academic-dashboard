"""
Phase 0 — validate Gemini constrained-list classification.

Goal: prove Gemini reliably picks from the 9 fixed categories (8 courses + "כללי")
without inventing new ones, on a 30-input benchmark.

Pass criteria: ≥27/30 correct.

If this fails: iterate the prompt before any Phase 1 work. The whole project's
input mechanism rests on this assumption.
"""
import io
import os
import sys
import time
from typing import Literal

# Force UTF-8 stdout so Hebrew prints correctly on Windows console.
# line_buffering=True so we see progress in real time (not block-buffered).
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', line_buffering=True)

from dotenv import load_dotenv
from pydantic import BaseModel
from google import genai
from google.genai import types
from google.genai.errors import ClientError, ServerError

# Free tier is 5 RPM. 13s/call = ~4.6/min, safely under the limit.
SLEEP_BETWEEN_CALLS = 13
MAX_RETRIES_ON_429 = 3

load_dotenv()

MODEL = "gemini-2.5-flash"

# ─── The 9 closed categories ────────────────────────────────────────────
# Same list lives in DATA_SEED.md. Will move to DB in Phase 2.
CATEGORIES = (
    "יסודות ההסתברות",
    "לינארית",
    "חדווא",
    "פייתון",
    "ערבית",
    "שער למחקר",
    "דת האסלאם",
    "תולדות העמים המוסלמים",
    "כללי",
)


class CategoryChoice(BaseModel):
    """Schema-constrained output — Gemini physically cannot return a 10th."""
    category: Literal[
        "יסודות ההסתברות",
        "לינארית",
        "חדווא",
        "פייתון",
        "ערבית",
        "שער למחקר",
        "דת האסלאם",
        "תולדות העמים המוסלמים",
        "כללי",
    ]
    reasoning: str


SYSTEM_PROMPT = """You are a strict classifier. Given a free-text task from a university student, pick the SINGLE category from the closed list that the task most likely belongs to.

The 9 categories are:
- יסודות ההסתברות  (probability foundations)
- לינארית          (linear algebra)
- חדווא            (calculus)
- פייתון           (Python programming)
- ערבית            (Arabic language)
- שער למחקר        (research methods, Middle East)
- דת האסלאם        (Religion of Islam, Middle East)
- תולדות העמים המוסלמים  (History of Muslim peoples, Middle East)
- כללי             (general — anything that does not fit any specific course)

Rules:
1. Pick EXACTLY ONE category. Never invent a new one. The list is fixed.
2. If the input mentions a course by name (or its English equivalent like "calculus", "linear algebra", "Python", "Arabic"), pick that course.
3. If the input is about course content (e.g. "eigenvalues", "Quran", "Ottoman Empire") that clearly maps to one course, pick that course.
4. If the input is too vague to identify a course (e.g. "study", "buy milk", "doctor appointment"), pick "כללי" — don't guess a course.
5. "כללי" is a legitimate first-class choice, not a fallback. Use it whenever the task is not academic or not clearly about one specific course.

Reasoning field: 1-2 sentences in the same language as the input, explaining why this category.
"""


# ─── Tight 10-input benchmark — 8 courses + 2 general/vague.
# The Literal[...] schema GUARANTEES no invented categories. This benchmark
# tests classification ACCURACY only. Pass: ≥9/10.
TEST_INPUTS: list[tuple[str, str]] = [
    # One per course (8 cases — covers each category being recognized)
    ("ללמוד למבחן בהסתברות",                          "יסודות ההסתברות"),
    ("תרגיל בית בלינארית עד יום שני",                "לינארית"),
    ("calculus problem set due Thursday",              "חדווא"),
    ("Python list comprehension exercise",             "פייתון"),
    ("ללמוד מילים חדשות בערבית",                      "ערבית"),
    ("לכתוב פרופוזל לקורס שער למחקר",                  "שער למחקר"),
    ("Quran study session for class",                  "דת האסלאם"),
    ("קריאה על האימפריה העות'מאנית",                   "תולדות העמים המוסלמים"),

    # Clearly non-academic / vague — must pick כללי
    ("תור לרופא שיניים",                              "כללי"),
    ("ללמוד",                                          "כללי"),
]


def classify_one(client: genai.Client, text: str) -> CategoryChoice:
    config = types.GenerateContentConfig(
        system_instruction=SYSTEM_PROMPT,
        response_mime_type="application/json",
        response_schema=CategoryChoice,
        temperature=0.0,
    )
    last_err = None
    for attempt in range(MAX_RETRIES_ON_429):
        try:
            response = client.models.generate_content(
                model=MODEL,
                contents=f"Task: {text}",
                config=config,
            )
            return CategoryChoice.model_validate_json(response.text)
        except (ClientError, ServerError) as e:
            last_err = e
            code = getattr(e, "code", None)
            if code in (429, 503):
                wait = 30 * (attempt + 1)
                print(f"      [retry] {code} — waiting {wait}s before retry {attempt + 1}/{MAX_RETRIES_ON_429}")
                time.sleep(wait)
                continue
            raise
    raise last_err


def main() -> int:
    api_key = os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        raise RuntimeError("GOOGLE_API_KEY not set. See .env.example.")

    client = genai.Client(api_key=api_key)

    correct = 0
    wrong: list[tuple[int, str, str, str, str]] = []

    print()
    print("=" * 72)
    print(f"Phase 0 validation — {len(TEST_INPUTS)} test inputs")
    print(f"Model: {MODEL}")
    pass_threshold = max(1, int(len(TEST_INPUTS) * 0.9))
    print(f"Pass criteria: ≥{pass_threshold}/{len(TEST_INPUTS)} correct, 0 invented categories")
    print("=" * 72)

    for i, (text, expected) in enumerate(TEST_INPUTS, 1):
        try:
            result = classify_one(client, text)
            ok = result.category == expected
            mark = "✓" if ok else "✗"
            if ok:
                correct += 1
            else:
                wrong.append((i, text, expected, result.category, result.reasoning))
            print(f'{i:2d}. {mark}  got="{result.category}"  expected="{expected}"')
            print(f'      input: {text}')
        except Exception as e:
            short_err = str(e)[:120]
            print(f"{i:2d}. !  EXCEPTION: {type(e).__name__}: {short_err}")
            print(f"      input: {text}")
            wrong.append((i, text, expected, f"ERROR: {short_err}", ""))

        # Rate-limit pacing for free tier (5 RPM)
        if i < len(TEST_INPUTS):
            time.sleep(SLEEP_BETWEEN_CALLS)

    print()
    print("=" * 72)
    print(f"Result: {correct}/{len(TEST_INPUTS)}")
    print("=" * 72)

    if wrong:
        print("\nMismatches:")
        for i, text, expected, got, why in wrong:
            print(f'  #{i}: "{text}"')
            print(f'        expected: {expected}')
            print(f'        got:      {got}')
            if why:
                print(f'        why:      {why}')

    print()
    if correct >= pass_threshold:
        print(f"✅ PASS (≥{pass_threshold}/{len(TEST_INPUTS)}). Phase 0 succeeds.")
        print("   The Literal[CategoryName] schema guarantees no invented categories.")
    else:
        print(f"❌ FAIL (<{pass_threshold}/{len(TEST_INPUTS)}). Iterate prompt before Phase 1.")

    return correct


if __name__ == "__main__":
    main()
