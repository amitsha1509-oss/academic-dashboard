# המרכז (Life OS)

A personal app for organizing everything (studies, tasks, ideas, workouts, people) as **items** with flexible **properties**, seen through saved **views**. Hebrew UI, right-to-left. Runs on my computer. See `VISION.md` for the why.

## Run it (Windows)
Double-click **`start.cmd`**, or in PowerShell inside this folder:
```powershell
powershell -ExecutionPolicy Bypass -File .\run.ps1
```
The first run sets up Python (about a minute). The browser then opens at http://127.0.0.1:8765.
Keep the window open while you use the app; close it to stop.

Needs: Python 3.10+. Node.js is only needed to rebuild the frontend after code changes (`run.ps1 -Build`).

## Where my data lives
- `data/lifeos.sqlite3`: everything, in one file. Not in git.
- `data/backups/`: an automatic copy every day, last 14 days.
- Settings → "גיבוי וסל מחזור": download everything as JSON, restore deleted items.

## How to use it
| Screen | What it's for |
|---|---|
| **היום** (Today) | Today's schedule (including repeating lectures), overdue, due today, snoozed items that came back, the next 7 days |
| **תיבת קליטה** (Inbox) | Everything typed into the capture bar. Give it a type or a parent, or just mark it sorted, whenever convenient |
| **פספוסים ודחיות** (Missed) | Lectures/workouts not marked, overdue, things postponed repeatedly, stale inbox. Updates itself |
| **השבוע** (Week) | Week grid |
| **ציר זמן** (Timeline) | The big picture: anything with a "תקופה" (period), plus important dated items |
| **תצוגות** (Views) | Saved filter + group + sort + layout (list / board / table / Eisenhower-style grid). Create as many as you want |
| **הגדרות** (Settings) | Add, rename, recolor or change the type of properties and item types. Everything updates everywhere |

Tips:
- A course is an item. Lectures, homework and exams go **inside** it ("חלק מ" / "הוסף פריט בפנים"). Put the Drive folder link on the course.
- A weekly lecture is **one** item with a repeat rule. Mark each occurrence "בוצע" or "דלג". Unmarked past ones show up in Missed.
- Switching from semester to exams: set "עד" (until) on the lecture repeats, add a daily study-block repeat. Nothing else changes.
- Ctrl+K opens search.

## Development
```
backend/   FastAPI + SQLite     tests: backend/.venv/Scripts/python -m pytest backend/tests
frontend/  React + TypeScript   tests: cd frontend && npm test      build: npm run build
```
`frontend/dist` is committed on purpose, so running the app never requires Node. Rebuild and commit it after frontend changes.
Read `ARCHITECTURE.md` before changing code and add to `DECISIONS.md` when making a choice.
