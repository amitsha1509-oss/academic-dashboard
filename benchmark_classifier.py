"""
benchmark_classifier.py — evaluate the code-first classifier.

For each input we record:
  expected_category — the right answer
  expected_mode     — "code" if code should answer; "ai" if code should fallback
  code_answer       — what classify() returned (None = fallback)

We pass when:
  expected_mode=="code" AND code_answer==expected_category
  expected_mode=="ai"   AND code_answer is None
"""
import io
import sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", line_buffering=True)

import keyword_classifier


# (input, expected_category, expected_mode)
# expected_mode: "code" → code should categorize correctly.
#                "ai"   → code should return None (delegate to AI).
CASES: list[tuple[str, str, str]] = [
    # ── Clear single keyword (code should handle) ──
    ("תרגיל בית בלינארית עד יום שני",     "לינארית",                 "code"),
    ("ללמוד למבחן בהסתברות",              "יסודות ההסתברות",         "code"),
    ("להגיש תרגיל בחדווא",                "חדווא",                   "code"),
    ("homework in Python class",            "פייתון",                  "code"),
    ("ללמוד מילים חדשות בערבית",          "ערבית",                   "code"),
    ("לכתוב פרופוזל לקורס שער למחקר",      "שער למחקר",               "code"),
    ("Quran study session for class",       "דת האסלאם",               "code"),
    ("קריאה על האימפריה העות'מאנית",       "תולדות העמים המוסלמים",   "code"),
    ("calculus problem set due Thursday",   "חדווא",                   "code"),
    ("linear algebra eigenvalues",          "לינארית",                 "code"),
    ("Python list comprehension exercise",  "פייתון",                  "code"),
    ("חדווא — נגזרת",                      "חדווא",                   "code"),
    ("מטריצה הפיכה",                       "לינארית",                 "code"),

    # ── Clearly non-academic (code → 'כללי') ──
    ("תור לרופא שיניים",                  "כללי",                    "code"),
    ("ללמוד",                              "כללי",                    "code"),
    ("לקנות חלב",                          "כללי",                    "code"),
    ("ארוחת ערב עם דנה",                   "כללי",                    "code"),
    ("buy birthday gift",                   "כללי",                    "code"),
    ("go to the gym",                       "כללי",                    "code"),
    ("אימון ריצה",                          "כללי",                    "code"),

    # ── Ambiguous: code should give up, AI handles ──
    # (keyword + ambiguous word like "אימון" / "פגישה" / "תור" near a course)
    ("אימון ביסודות ההסתברות",            "כללי",                    "ai"),    # workout vs study
    ("תור עם המרצה בלינארית",              "לינארית",                 "ai"),    # office hours
    ("פגישה עם המרצה בפייתון",             "פייתון",                  "ai"),
    # multiple categories present
    ("ללמוד פייתון אחרי השיעור בערבית",   "פייתון",                  "ai"),

    # ── New / dynamically-created courses (not in KEYWORDS) ──
    # A course added via the UI has no entry in KEYWORDS yet, so the code
    # classifier can't recognise it. The expected outcome is:
    #   - input has ONLY the new course's name  → code returns "כללי" (no match)
    #     This is WRONG for the user, but correct current behaviour.
    #     Once per-course keywords are stored in the DB (planned), these
    #     cases should flip to "code" with the right category.
    #   - input has BOTH the new course name AND a known keyword → AI handles
    #     (unchanged: ambiguous multi-match or the known keyword wins).
    #
    # The cases below use "קורס חדש" as a placeholder for any newly created
    # course.  They document the current contract; update them when the
    # dynamic-keyword feature lands.
    ("שיעור בקורס חדש שנוסף",             "כללי",                    "code"),  # unknown → כללי
    ("לסיים תרגיל בקורס חדש עד יום שלישי","כללי",                    "code"),  # unknown → כללי
    ("קורס חדש — לקרוא את הפרק הראשון",   "כללי",                    "code"),  # unknown → כללי
    # once a new course IS in KEYWORDS, ambiguous inputs should fall to AI:
    # (these verify that the ambiguity logic generalises — using פגישה + חדווא
    #  as a stand-in for a known keyword next to a new course name)
    ("פגישה על חדווא וקורס חדש",           "חדווא",                   "ai"),   # two matches → AI
]


def main() -> int:
    print()
    print("=" * 80)
    print(f"Code classifier benchmark — {len(CASES)} cases")
    print("=" * 80)

    code_correct = 0
    code_wrong = 0
    fallback_correct = 0   # code returned None where AI was expected
    fallback_unexpected = 0  # code returned None where code should have answered
    code_when_ai_expected = 0  # code answered when AI was expected (premature)

    rows = []
    for text, expected_cat, expected_mode in CASES:
        got = keyword_classifier.classify(text)

        if expected_mode == "code":
            if got is None:
                tag = "✗ MISS (code fell to AI)"
                fallback_unexpected += 1
            elif got == expected_cat:
                tag = "✓ code correct"
                code_correct += 1
            else:
                tag = f"✗ code WRONG (got {got!r})"
                code_wrong += 1
        else:  # expected ai
            if got is None:
                tag = "✓ correctly handed to AI"
                fallback_correct += 1
            else:
                tag = f"⚠ code answered (got {got!r}) — premature"
                code_when_ai_expected += 1

        rows.append((text, expected_cat, expected_mode, got, tag))

    # Print rows
    for text, exp_cat, exp_mode, got, tag in rows:
        got_str = got if got else "→ AI"
        print(f"  [{exp_mode:4}] expected={exp_cat:25s}  got={got_str!s:25s}  {tag}")
        print(f"         input: {text}")

    total = len(CASES)
    code_cases = sum(1 for c in CASES if c[2] == "code")
    ai_cases = total - code_cases

    print()
    print("=" * 80)
    print(f"Results")
    print("=" * 80)
    print(f"  Code-expected cases:  {code_cases}")
    print(f"    correct:            {code_correct}/{code_cases}  ({100*code_correct/code_cases:.0f}%)")
    print(f"    wrong:              {code_wrong}")
    print(f"    fell to AI early:   {fallback_unexpected}")
    print(f"  AI-expected cases:    {ai_cases}")
    print(f"    handed to AI ✓:     {fallback_correct}/{ai_cases}  ({100*fallback_correct/ai_cases:.0f}%)")
    print(f"    code answered (✗):  {code_when_ai_expected}")
    print()
    overall_correct = code_correct + fallback_correct
    print(f"  Overall pass: {overall_correct}/{total}  ({100*overall_correct/total:.0f}%)")
    print()
    print(f"  Code coverage: {(code_correct + code_when_ai_expected + code_wrong + (sum(1 for r in rows if r[3] is not None))) / total:.0%} of inputs handled without AI")

    return overall_correct


if __name__ == "__main__":
    main()
