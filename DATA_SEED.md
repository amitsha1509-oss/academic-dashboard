# Data Seed

This file is the single source of truth for the initial DB seed. The build session generates a Python script that reads this and populates SQLite. **Don't pull from `semester_dashboard.xlsx`** — that Excel is a separate tool, not the source of truth for this project.

---

## Semester

- **Start (week 1 Monday):** 2026-04-06
- **End (week 13 Sunday):** 2026-07-05
- **Today (planning date):** 2026-04-28 (Tuesday, week 4)
- **Week convention:** Mon–Sun. Week N starts Monday and ends Sunday.

---

## Categories (9 total)

The 8 courses below + a 9th `כללי` (general) catch-all. Gemini classifies free-text inputs into exactly one of these 9. It never invents a 10th.

The category list lives in the DB and is editable via the Settings UI.

---

## Courses

### 1. יסודות ההסתברות
- **Department:** מדעי הנתונים
- **Mandatory attendance:** No
- **Lectures:**
  - Sunday 10:30–12:00
  - Tuesday 8:30–10:00 *(added late, was missing from the original Excel)*
- **Tutorial:** Tuesday 14:30–16:00
- **HW pattern:** תרגיל בית + מבדק בית
  - Released Sunday 12:00 (after lecture)
  - Due next Sunday 10:30 (before next lecture)
- **Color:** emerald `#047857` / `#34D399` / `#D1FAE5`

### 2. לינארית
- **Department:** מדעי הנתונים
- **Mandatory attendance:** No
- **Lectures:** Monday 15:00–16:45
- **Tutorial:** Thursday 8:30–10:00
- **HW pattern:** תרגיל בית
  - Released Monday 16:45 (after lecture)
  - Due next Monday 15:00 (before next lecture)
- **Color:** blue `#1D4ED8` / `#60A5FA` / `#DBEAFE`

### 3. חדווא
- **Department:** מדעי הנתונים
- **Mandatory attendance:** No
- **Lectures:**
  - Monday 13:00–14:00
  - Wednesday 10:30–12:00
- **Tutorial:** Thursday 10:30–12:00
- **HW pattern:** תרגיל בית
  - Released Thursday 12:00 (after tutorial)
  - Due next Thursday 12:00
- **Color:** amber `#B45309` / `#F59E0B` / `#FEF3C7`

### 4. פייתון
- **Department:** מדעי הנתונים
- **Mandatory attendance:** No
- **Lectures:** Tuesday 10:30–12:00
- **Tutorial:** Tuesday 18:00–18:45
- **HW pattern:** תרגיל בית
  - Released Tuesday 12:00 (after lecture)
  - Due next Tuesday 10:30 (before next lecture)
- **Color:** violet `#6D28D9` / `#A78BFA` / `#EDE9FE`

### 5. ערבית
- **Department:** מזרח תיכון
- **Mandatory attendance:** Yes
- **Lectures (3 per week):**
  - Sunday 14:30–16:00
  - Monday 11:00–12:30
  - Thursday 12:30–14:00
- **Tutorial:** —
- **HW pattern:** תרגיל קצר אחרי כל שיעור (3 per week)
  - After Sunday: released Sunday 16:00, due Monday 11:00
  - After Monday: released Monday 12:30, due Thursday 12:30
  - After Thursday: released Thursday 14:00, due Sunday 14:30
- **Color:** pink `#BE185D` / `#F472B6` / `#FCE7F3`

### 6. שער למחקר
- **Department:** מזרח תיכון
- **Mandatory attendance:** Yes
- **Lectures:** Tuesday 12:30–14:00
- **Tutorial:** —
- **HW pattern:** TBD (not yet known)
- **Color:** slate `#334155` / `#94A3B8` / `#F1F5F9`

### 7. דת האסלאם
- **Department:** מזרח תיכון
- **Mandatory attendance:** Yes
- **Lectures:** Wednesday 16:30–18:00
- **Tutorial:** TBD (day/time unknown — placeholder rows in DB)
- **Reading materials:** Before each lecture
- **Color:** orange `#C2410C` / `#FB923C` / `#FFEDD5`

### 8. תולדות העמים המוסלמים
- **Department:** מזרח תיכון
- **Mandatory attendance:** Yes
- **Lectures (2 per week):**
  - Sunday 12:30–14:00
  - Wednesday 12:30–14:00
- **Tutorial:** Wednesday 14:30–16:00 (mandatory)
- **Reading materials:** Before each lecture (2 readings per week)
- **Color:** rose `#BE123C` / `#FB7185` / `#FFE4E6`

### 9. כללי
- **Department:** —
- **Mandatory attendance:** —
- **Purpose:** catch-all for free-text inputs that don't fit any course (e.g., "תור לרופא", "להכין ארוחת ערב", general study sessions). Gemini may legitimately pick this category — it's not a fallback or rejection.
- **Color:** gray `#6B7280` / `#9CA3AF` / `#F3F4F6`

---

## Data model — pattern-based, computed on the fly

We do NOT pre-generate ~300 task rows. Instead, recurring patterns are stored once. "Today's tasks" are computed by joining patterns × current date × completion records × adhoc tasks.

### Tables

| Table | Purpose | Approx initial size |
|---|---|---|
| `categories` | The 9 categories (8 courses + כללי). Editable via Settings UI. | 9 |
| `recurring_patterns` | "Probability lecture: every Sunday 10:30–12:00, weeks 1–13" | ~25 |
| `completions` | Which (pattern_id, occurrence_date) the user marked ✅ / ⏭ / has notes for | starts empty |
| `adhoc_tasks` | Free-text tasks the user typed in. Stored as full rows. | starts empty |
| `settings` | Semester start/end, current week, etc. | ~5 |

### Recurring pattern shape

```
(id, category_id, kind, day_of_week, start_time, end_time,
 hw_release_day, hw_release_time, hw_due_offset_days, hw_due_time,
 label, weeks_active)
```

- `kind ∈ {lecture, tutorial, hw, reading}`
- `weeks_active`: a list/range of weeks this pattern fires in. Default 1–13.
- `hw_*` fields apply only when `kind == 'hw'` or `kind == 'reading'`.

### Completions table

```
(pattern_id, occurrence_date, status, notes, scheduled_at, updated_at)
```

PRIMARY KEY = `(pattern_id, occurrence_date)`. Inserted lazily — only when the user actually interacts (marks done, adds note, schedules).

### Adhoc tasks table

For free-text inputs (POST /tasks with `{text: "..."}`). Full Pydantic-typed rows: category_id, title, type, place, importance, urgency, release_at, due_at, scheduled_at, status, notes.

### How "today's tasks" is computed

```python
def tasks_for_today(today_dt) -> list[VirtualTask]:
    instances = []
    for pattern in db.fetch_recurring_patterns():
        for occurrence_date in pattern.occurrences_between(today_dt - 14d, today_dt + 1d):
            release_at, due_at = pattern.materialize(occurrence_date)
            if release_at > today_dt:
                continue  # not yet released → invisible
            completion = db.get_completion(pattern.id, occurrence_date)
            if completion and completion.status in ('done', 'skipped'):
                continue
            instances.append(VirtualTask(pattern=pattern, occurrence_date=occurrence_date,
                                         release_at=release_at, due_at=due_at,
                                         completion=completion))
    instances += db.fetch_adhoc_tasks_active_at(today_dt)
    return sorted(instances, key=lambda t: t.due_at)
```

### Stable IDs for the frontend

Virtual instances need a frontend-stable ID. Use a composite string: `f"{pattern_id}:{occurrence_date.isoformat()}"`. The frontend treats this as opaque. Backend parses it on PATCH/DELETE.

### What goes where

| User action | Backend operation |
|---|---|
| Open dashboard | Compute `tasks_for_today()` |
| Mark ✅ on a recurring instance | INSERT/UPDATE `completions(pattern_id, date, status='done')` |
| Add a note to a recurring instance | INSERT/UPDATE `completions(...)` with `notes` set |
| Schedule a recurring instance (drag to time slot) | INSERT/UPDATE `completions(...)` with `scheduled_at` |
| Type free-text "תור לרופא יום ה׳" | Gemini classify → INSERT into `adhoc_tasks` |
| Mark ✅ on an adhoc | UPDATE `adhoc_tasks SET status='done'` |
| Edit course schedule in Settings | UPDATE `recurring_patterns` row |

### Carry-over open tasks from week 3

Insert as **adhoc_tasks** during initial seeding (since they're individual past-released instances we want to track explicitly):

- Probability HW + מבדק: released Sun 2026-04-26 12:00, due Sun 2026-05-03 10:30
- Linear HW: released Mon 2026-04-20 16:45, due Mon 2026-04-27 15:00 *(possibly already missed)*
- Calculus HW: released Thu 2026-04-23 12:00, due Thu 2026-04-30 12:00
- Python HW: released Tue 2026-04-21 12:00, due Tue 2026-04-28 10:30
- Arabic Sun HW: released Sun 2026-04-26 16:00, due Mon 2026-04-27 11:00 *(possibly already missed)*

### Default filter behavior

The home view returns only what's `release_at <= now AND status not in ('done', 'skipped')`. This is the "auto-updating" behavior. Future occurrences are invisible by default — even though the pattern row exists.

### Trade-offs (acknowledged)

The materialized-rows model would be simpler in some places: stable integer IDs, single CRUD-row UPDATE semantics, easier debugging via raw SELECT. We accept the extra query logic for these wins:
- Editing a course schedule is one row, no regeneration ritual.
- DB starts tiny and grows only with real activity.
- Semester extension is automatic.
- Single source of truth for the recurring pattern.

The composite-ID complexity is contained in one helper function (`materialize_id` / `parse_id`) — frontend treats it as opaque.

---

## Default filter behavior

The home view filters to:
```
release_at <= NOW() AND status NOT IN ('done', 'skipped')
```

This is the "auto-updating" behavior Amit explicitly requested. Future tasks that haven't been released yet are invisible by default. A toggle can show "all upcoming" — but it's NOT the default.
