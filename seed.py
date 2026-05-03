"""
seed.py — populate the DB with categories, recurring patterns, settings,
and the carry-over open tasks from week 3.

DROP-AND-RECREATE for categories/recurring_patterns/settings.
PRESERVES completions and adhoc_tasks (user data) by default.

Run: python seed.py
"""
import json
from datetime import datetime
from pathlib import Path

import db


# ─── Course data — single Python source for the seed ───────────────
# Patterns:
#   - lecture / tutorial: day_of_week + start_time + end_time
#   - hw:                 hw_release_day + hw_release_time + hw_due_offset_days + hw_due_time
#   - reading:            day_of_week (lecture day) + start_time (lecture start) → released 7 days prior, due lecture start

COURSES = [
    # (name, dept, mandatory, colors_dark/mid/light, patterns)
    {
        "name": "יסודות ההסתברות",
        "department": "מדעי הנתונים",
        "mandatory": False,
        "colors": ("047857", "34D399", "D1FAE5"),
        "patterns": [
            {"kind": "lecture",  "day_of_week": "Sun", "start_time": "10:30", "end_time": "12:00", "label": "הרצאה א׳"},
            {"kind": "lecture",  "day_of_week": "Tue", "start_time": "08:30", "end_time": "10:00", "label": "הרצאה ג׳"},
            {"kind": "tutorial", "day_of_week": "Tue", "start_time": "14:30", "end_time": "16:00", "label": "תרגול"},
            {"kind": "hw",       "hw_release_day": "Sun", "hw_release_time": "12:00",
             "hw_due_offset_days": 7, "hw_due_time": "10:30", "label": "תרגיל בית"},
            {"kind": "hw",       "hw_release_day": "Sun", "hw_release_time": "12:00",
             "hw_due_offset_days": 7, "hw_due_time": "10:30", "label": "מבדק בית"},
        ],
    },
    {
        "name": "לינארית",
        "department": "מדעי הנתונים",
        "mandatory": False,
        "colors": ("1D4ED8", "60A5FA", "DBEAFE"),
        "patterns": [
            {"kind": "lecture",  "day_of_week": "Mon", "start_time": "15:00", "end_time": "16:45", "label": "הרצאה"},
            {"kind": "tutorial", "day_of_week": "Thu", "start_time": "08:30", "end_time": "10:00", "label": "תרגול"},
            {"kind": "hw",       "hw_release_day": "Mon", "hw_release_time": "16:45",
             "hw_due_offset_days": 7, "hw_due_time": "15:00", "label": "תרגיל בית"},
        ],
    },
    {
        "name": "חדווא",
        "department": "מדעי הנתונים",
        "mandatory": False,
        "colors": ("B45309", "F59E0B", "FEF3C7"),
        "patterns": [
            {"kind": "lecture",  "day_of_week": "Mon", "start_time": "13:00", "end_time": "14:00", "label": "הרצאה ב׳"},
            {"kind": "lecture",  "day_of_week": "Wed", "start_time": "10:30", "end_time": "12:00", "label": "הרצאה ד׳"},
            {"kind": "tutorial", "day_of_week": "Thu", "start_time": "10:30", "end_time": "12:00", "label": "תרגול"},
            {"kind": "hw",       "hw_release_day": "Thu", "hw_release_time": "12:00",
             "hw_due_offset_days": 7, "hw_due_time": "12:00", "label": "תרגיל בית"},
        ],
    },
    {
        "name": "פייתון",
        "department": "מדעי הנתונים",
        "mandatory": False,
        "colors": ("6D28D9", "A78BFA", "EDE9FE"),
        "patterns": [
            {"kind": "lecture",  "day_of_week": "Tue", "start_time": "10:30", "end_time": "12:00", "label": "הרצאה"},
            {"kind": "tutorial", "day_of_week": "Tue", "start_time": "18:00", "end_time": "18:45", "label": "תרגול"},
            {"kind": "hw",       "hw_release_day": "Tue", "hw_release_time": "12:00",
             "hw_due_offset_days": 7, "hw_due_time": "10:30", "label": "תרגיל בית"},
        ],
    },
    {
        "name": "ערבית",
        "department": "מזרח תיכון",
        "mandatory": True,
        "colors": ("BE185D", "F472B6", "FCE7F3"),
        "patterns": [
            {"kind": "lecture",  "day_of_week": "Sun", "start_time": "14:30", "end_time": "16:00", "label": "שיעור א׳"},
            {"kind": "lecture",  "day_of_week": "Mon", "start_time": "11:00", "end_time": "12:30", "label": "שיעור ב׳"},
            {"kind": "lecture",  "day_of_week": "Thu", "start_time": "12:30", "end_time": "14:00", "label": "שיעור ה׳"},
            # HW after each lesson, due before next lesson
            {"kind": "hw", "hw_release_day": "Sun", "hw_release_time": "16:00",
             "hw_due_offset_days": 1, "hw_due_time": "11:00", "label": "תרגיל אחרי שיעור א׳"},
            {"kind": "hw", "hw_release_day": "Mon", "hw_release_time": "12:30",
             "hw_due_offset_days": 3, "hw_due_time": "12:30", "label": "תרגיל אחרי שיעור ב׳"},
            {"kind": "hw", "hw_release_day": "Thu", "hw_release_time": "14:00",
             "hw_due_offset_days": 3, "hw_due_time": "14:30", "label": "תרגיל אחרי שיעור ה׳"},
        ],
    },
    {
        "name": "שער למחקר",
        "department": "מזרח תיכון",
        "mandatory": True,
        "colors": ("334155", "94A3B8", "F1F5F9"),
        "patterns": [
            {"kind": "lecture", "day_of_week": "Tue", "start_time": "12:30", "end_time": "14:00", "label": "שיעור"},
        ],
    },
    {
        "name": "דת האסלאם",
        "department": "מזרח תיכון",
        "mandatory": True,
        "colors": ("C2410C", "FB923C", "FFEDD5"),
        "patterns": [
            {"kind": "lecture", "day_of_week": "Wed", "start_time": "16:30", "end_time": "18:00", "label": "הרצאה"},
            {"kind": "reading", "day_of_week": "Wed", "start_time": "16:30", "label": "קריאה לפני שיעור"},
        ],
    },
    {
        "name": "תולדות העמים המוסלמים",
        "department": "מזרח תיכון",
        "mandatory": True,
        "colors": ("BE123C", "FB7185", "FFE4E6"),
        "patterns": [
            {"kind": "lecture",  "day_of_week": "Sun", "start_time": "12:30", "end_time": "14:00", "label": "הרצאה א׳"},
            {"kind": "lecture",  "day_of_week": "Wed", "start_time": "12:30", "end_time": "14:00", "label": "הרצאה ד׳"},
            {"kind": "tutorial", "day_of_week": "Wed", "start_time": "14:30", "end_time": "16:00", "label": "תרגול"},
            {"kind": "reading",  "day_of_week": "Sun", "start_time": "12:30", "label": "קריאה לפני שיעור א׳"},
            {"kind": "reading",  "day_of_week": "Wed", "start_time": "12:30", "label": "קריאה לפני שיעור ד׳"},
        ],
    },
    {
        "name": "כללי",
        "department": None,
        "mandatory": False,
        "colors": ("6B7280", "9CA3AF", "F3F4F6"),
        "patterns": [],  # No recurring patterns; lives only as a category for adhoc tasks.
    },
]


# Carry-over open tasks were originally seeded here for week 3 instances
# the user might still need to deal with. Removed because the user did
# week 3 already — they were creating "false overdue" alerts.
# If you have specific past tasks you want to track, add them via the UI
# capture bar (POST /tasks).
CARRY_OVER_ADHOC: list[tuple] = []


SETTINGS = {
    "semester_start":       "2026-04-06",
    "semester_end":         "2026-07-05",
    "current_week":         "4",
    # Dashboard ignores task occurrences before this date.
    # User adds anything from before manually via the capture bar.
    "dashboard_start_date": "2026-04-28",
}

# Which weeks the recurring patterns are active in.
# Weeks 1–3 are past — instances from those weeks are NOT auto-generated.
# Specific past tasks still actionable are seeded as adhoc (CARRY_OVER_ADHOC below).
ACTIVE_WEEKS_JSON = json.dumps(list(range(4, 14)))  # [4, 5, …, 13]


def seed(reset: bool = True, user_id: int = db.OWNER_USER_ID):
    """Populate the DB for the given user (default: Amit, user 1).
    By default DROPS and recreates non-user tables FOR THIS USER ONLY.
    Other users' data is unaffected.
    """
    if reset:
        # Drop and recreate categories/recurring_patterns/settings for this user.
        # Preserve completions and adhoc_tasks (user data) — NOT wiped here.
        with db.connect() as c:
            # Cascade order: patterns → completions auto-cascades on FK delete.
            c.execute("DELETE FROM recurring_patterns WHERE user_id=?", (user_id,))
            c.execute("DELETE FROM categories WHERE user_id=?", (user_id,))
            c.execute("DELETE FROM settings WHERE user_id=?", (user_id,))

    with db.connect() as c:
        # Settings
        for k, v in SETTINGS.items():
            c.execute(
                "INSERT INTO settings(user_id, key, value) VALUES(?, ?, ?) "
                "ON CONFLICT(user_id, key) DO UPDATE SET value=excluded.value",
                (user_id, k, v),
            )

        # Categories
        cat_ids: dict[str, int] = {}
        for i, course in enumerate(COURSES, 1):
            dark, mid, light = course["colors"]
            cur = c.execute(
                "INSERT INTO categories(user_id, name, department, mandatory, "
                "color_dark, color_mid, color_light, sort_order) "
                "VALUES(?, ?, ?, ?, ?, ?, ?, ?)",
                (user_id, course["name"], course["department"], int(course["mandatory"]),
                 dark, mid, light, i),
            )
            cat_ids[course["name"]] = cur.lastrowid

        # Default `is_required` per kind:
        #   HW/reading  → 1 (must complete; accumulates overdue)
        #   lecture/tut → 0 (informational; gone after its day unless user pins it)
        DEFAULT_IS_REQUIRED = {"hw": 1, "reading": 1, "lecture": 0, "tutorial": 0}

        # Recurring patterns
        for course in COURSES:
            cat_id = cat_ids[course["name"]]
            for p in course["patterns"]:
                is_required = p.get("is_required", DEFAULT_IS_REQUIRED.get(p["kind"], 0))
                c.execute(
                    """INSERT INTO recurring_patterns(
                        user_id, category_id, kind, day_of_week, start_time, end_time,
                        hw_release_day, hw_release_time, hw_due_offset_days,
                        hw_due_time, label, weeks_active, is_required
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (user_id, cat_id, p["kind"],
                     p.get("day_of_week"), p.get("start_time"), p.get("end_time"),
                     p.get("hw_release_day"), p.get("hw_release_time"),
                     p.get("hw_due_offset_days"), p.get("hw_due_time"),
                     p.get("label"),
                     p.get("weeks_active", ACTIVE_WEEKS_JSON),
                     is_required),
                )

        # Carry-over adhoc tasks (only insert if not already present)
        for cat_name, title, ttype, rel_at, due_at in CARRY_OVER_ADHOC:
            existing = c.execute(
                "SELECT 1 FROM adhoc_tasks WHERE title=? AND release_at=?",
                (title, rel_at),
            ).fetchone()
            if existing:
                continue
            c.execute(
                """INSERT INTO adhoc_tasks(
                    category_id, title, type, release_at, due_at,
                    importance, urgency, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 'open')""",
                (cat_ids[cat_name], title, ttype, rel_at, due_at, 3, 4),
            )


def report():
    """Print quick counts after seeding."""
    with db.connect() as c:
        n_cats = c.execute("SELECT COUNT(*) FROM categories").fetchone()[0]
        n_patterns = c.execute("SELECT COUNT(*) FROM recurring_patterns").fetchone()[0]
        n_adhoc = c.execute("SELECT COUNT(*) FROM adhoc_tasks").fetchone()[0]
        n_completions = c.execute("SELECT COUNT(*) FROM completions").fetchone()[0]
        n_settings = c.execute("SELECT COUNT(*) FROM settings").fetchone()[0]

    print(f"categories:         {n_cats}")
    print(f"recurring_patterns: {n_patterns}")
    print(f"adhoc_tasks:        {n_adhoc}")
    print(f"completions:        {n_completions}")
    print(f"settings:           {n_settings}")


if __name__ == "__main__":
    db.init_db()
    seed()
    print("Seed complete.")
    report()
