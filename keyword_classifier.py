"""
keyword_classifier.py — code-first task classification.

The principle: every decision code can make deterministically, code makes.
AI is only called when code returns None (genuine ambiguity).

Returns:
    str  — the category name if classification is confident
    None — code couldn't decide, caller should fall back to AI
"""
import re
from typing import Optional

# ─── Category keywords ──────────────────────────────────────
# Each list: substrings to look for. Hebrew + English aliases.
# Order matters only for documentation; matching is by substring.
KEYWORDS: dict[str, list[str]] = {
    "יסודות ההסתברות": [
        "הסתברות",
        "probability",
    ],
    "לינארית": [
        "לינארית",
        "אלגברה לינארית",
        "linear algebra",
        "eigenvalue",
        "ערכים עצמיים",
        "מטריצה", "מטריצות",
        "matrix", "matrices",
        "vector space", "מרחב וקטורי",
    ],
    "חדווא": [
        "חדווא",
        "calculus",
        "חשבון אינפיניטסימלי",
        "אינטגרל", "אינטגרלים",
        "נגזרת", "נגזרות",
        "integral", "derivative",
        "לימיט", "limit ",
    ],
    "פייתון": [
        "פייתון",
        "python",
        "list comprehension",
        "numpy", "pandas",
    ],
    "ערבית": [
        "ערבית",
        "arabic",
        "اللغة العربية",
    ],
    "שער למחקר": [
        "שער למחקר",
        "פרופוזל",  # course-specific term
        "research methods",
    ],
    "דת האסלאם": [
        "אסלאם",
        "islam",
        "קוראן", "קור'אן",
        "quran", "qur'an",
        "המוחמד", "מוחמד",
        "muhammad", "mohammed",
    ],
    "תולדות העמים המוסלמים": [
        "תולדות",
        "אימפריה עות'מאנית", "עות'מאנית", "עות'מאני",
        "ottoman",
        "muslim peoples", "העמים המוסלמים",
    ],
}

# Ambiguous standalone words — when found NEXT to a course keyword,
# trigger AI fallback. Alone (no course keyword), they default to "כללי".
AMBIGUOUS_WORDS = [
    "אימון",     # workout vs practice
    "תור",       # appointment vs (in) class
    "פגישה",     # meeting vs class meeting
    "יציאה",     # going out vs leaving (tutorial)
]


def _normalize(text: str) -> str:
    """Lowercase + strip. Keep Hebrew as-is."""
    return text.lower().strip()


def _find_categories(text: str, keywords: dict) -> list[str]:
    """Return all categories whose keywords appear in text."""
    t = _normalize(text)
    hits = []
    for cat, kws in keywords.items():
        for kw in kws:
            if kw.lower() in t:
                hits.append(cat)
                break  # one match per category is enough
    return hits


def _has_ambiguous_word(text: str) -> bool:
    t = _normalize(text)
    return any(w in t for w in AMBIGUOUS_WORDS)


def classify(text: str, user_keywords: Optional[dict] = None) -> Optional[str]:
    """Try to classify by keywords.

    user_keywords: per-user keyword dict loaded from DB
                   {category_name: [kw1, kw2, ...]}
                   If None or empty, falls back to the hardcoded KEYWORDS dict.

    Returns category name if confident, or None if AI should handle this.

    Decision tree:
      0 course keywords → 'כללי'                     (high confidence)
      1 course keyword + no ambiguous word → that category
      1 course keyword + ambiguous word → None       (fall to AI)
      2+ course keywords → None                       (fall to AI)
    """
    if not text or not text.strip():
        return None

    effective_keywords = user_keywords if user_keywords else KEYWORDS
    matches = _find_categories(text, effective_keywords)
    has_ambig = _has_ambiguous_word(text)

    if len(matches) == 0:
        # No course keyword. If ambiguous standalone word, lean general.
        # E.g. "תור לרופא" → general. "אימון ריצה" → general.
        return "כללי"

    if len(matches) == 1:
        if has_ambig:
            # E.g. "אימון ביסודות ההסתברות" — AI to disambiguate.
            return None
        return matches[0]

    # Multiple categories matched — let AI pick.
    return None


# ─── Module CLI: quick smoke test ────────────────────────
if __name__ == "__main__":
    import io, sys
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
    samples = [
        "תרגיל פייתון מחר",
        "אימון ריצה",
        "אימון ביסודות ההסתברות",
        "תור לרופא",
        "ללמוד למבחן",
        "Python list comprehension",
        "calculus problem set",
    ]
    for s in samples:
        print(f"{s!r:60s} → {classify(s)}")
