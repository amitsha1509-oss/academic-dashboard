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
On first launch the app asks which areas you want (tasks, studies, topics…); only those appear. Change it any time in Settings → "מה מופיע אצלי".

Everything starts at the **main page (העמוד הראשי)**: an add line (write naturally: "להתקשר לבנק מחר #השקעות !"), "the next thing", and a tile for each chosen area.
Tapping a tile slides its screen in from the left. **חזרה** (or the phone/browser back) slides it back.
The full walkthrough is inside the app: "איך זה עובד? מדריך קצר" on the main page.

| Tile | What it's for |
|---|---|
| **היום** (Today) | Today's schedule (including repeating lectures), overdue, due today, snoozed items that came back, the coming week |
| **תיבת קליטה** (Inbox) | Everything typed in the capture line. Pick a type or where it belongs and it leaves the inbox |
| **פספוסים** (Missed) | Lectures/workouts not marked, overdue, things postponed again and again. Updates itself |
| **משימות** (Tasks) | Open tasks only, by importance and urgency |
| **נושאים** (Topics) | Life areas (investments, intelligence, health…); each collects what's inside it |
| **לימודים** (Studies) | Courses and upcoming exams |
| **ציר זמן** (Timeline) | The big picture, month by month, top to bottom |
| **רשימות משלי** (My lists) | Optional. Lists you build by answering a few questions |
| Search / Settings | Icons at the top of the main page. Settings: what appears, backup and trash, advanced (types and properties) |

## Development
```
backend/   FastAPI + SQLite     tests: backend/.venv/Scripts/python -m pytest backend/tests
frontend/  React + TypeScript   tests: cd frontend && npm test      build: npm run build
```
`frontend/dist` is committed on purpose, so running the app never requires Node. Rebuild and commit it after frontend changes.
Read `ARCHITECTURE.md` before changing code and add to `DECISIONS.md` when making a choice.
