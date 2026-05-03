"""
time_travel_test.py — sanity-check the 'today' filter at different points in time.

Pretends 'now' is various times and prints what the today view would show.
No DB writes. No HTTP. Just compute.compute_tasks with a forced timestamp.
"""
import io
import sys
from datetime import datetime

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', line_buffering=True)

import compute


def show(label: str, now: datetime, scope: str = "today"):
    print()
    print("=" * 80)
    print(f"{label}    now = {now.strftime('%a %d/%m %H:%M')}    scope = {scope}")
    print("=" * 80)
    tasks = compute.compute_tasks(now, scope=scope, user_id=1)
    if not tasks:
        print("  (אין משימות)")
        return
    for t in tasks:
        rel = t.release_at.strftime("%a %d/%m %H:%M") if t.release_at else "—"
        due = t.due_at.strftime("%a %d/%m %H:%M") if t.due_at else "—"
        # Tag overdue
        tag = ""
        if t.due_at and t.due_at < now:
            tag = "  ⚠ OVERDUE"
        print(f"  [{t.category_name:25s}] {t.title:50s} rel={rel}  due={due}{tag}")


# Sanity scenarios
SCENARIOS = [
    ("היום (Tue 28/04 8:00 — לפני ההרצאה הראשונה)",
     datetime(2026, 4, 28, 8, 0)),
    ("היום (Tue 28/04 12:00 — צהריים)",
     datetime(2026, 4, 28, 12, 0)),
    ("היום (Tue 28/04 22:00 — ערב מאוחר)",
     datetime(2026, 4, 28, 22, 0)),

    ("מחר (Wed 29/04 09:00 — בוקר)",
     datetime(2026, 4, 29, 9, 0)),
    ("מחר (Wed 29/04 17:00 — אחרי הרצאת דת האסלאם)",
     datetime(2026, 4, 29, 17, 0)),

    ("בעוד 3 ימים (Fri 01/05 10:00)",
     datetime(2026, 5, 1, 10, 0)),

    ("בעוד שבוע (Tue 05/05 12:00 — בדיוק שבוע)",
     datetime(2026, 5, 5, 12, 0)),

    ("בעוד שבועיים (Tue 12/05 12:00)",
     datetime(2026, 5, 12, 12, 0)),

    ("סוף הסמסטר (Sun 05/07 11:00 — ההרצאה האחרונה)",
     datetime(2026, 7, 5, 11, 0)),
]

for label, now in SCENARIOS:
    show(label, now, scope="today")

print()
print("=" * 80)
print("גם נבדוק week scope על מחר:")
show("מחר week scope", datetime(2026, 4, 29, 9, 0), scope="week")
