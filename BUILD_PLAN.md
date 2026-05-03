# Build Plan — Academic Dashboard

This is a phased plan for the build session. Each phase has clear deliverables and a verification step. Don't skip phases.

The reference architecture is `C:\Users\amit shani\life_dashboard\` — read its `HANDOFF.md` first to understand the patterns we're cloning.

---

**Read also:** `BUILDING_PRINCIPLES.md` — engineering principles (modular architecture, verification loops, benchmarking, security, type safety, debugging via agents, error handling at boundaries, etc.). These hold across all phases. Re-read at the start of each phase.

---

## Stack (confirm with Amit at session start)

- **Hebrew-only UI.** No language toggle. No direction toggle. The site renders RTL with Hebrew text throughout. The RTL/language coupling bug from life_dashboard is moot here.
- **Backend:** FastAPI + SQLite (single file `academic_dashboard.db`) + Gemini 2.5 Flash (free tier)
- **Frontend:** React via Babel-in-browser, single HTML, no npm/Vite. Same pattern as life_dashboard.
- **Server:** uvicorn on `http://localhost:8001` (port 8000 reserved for life_dashboard)
- **Two UIs:** `/ui` ugly fallback + `/app/` polished. `/` redirects to `/app/`.
- **Python:** 3.10 (already installed). Reuse the same `.venv` pattern as life_dashboard.

---

## Phase 0 — Validate riskiest assumption (ABBREVIATED)

**Status: completed in abbreviated form on 2026-04-28.**

**Original goal:** prove Gemini classifies into the 9 categories without inventing a 10th.

**What was actually done:**
- Wrote `phase0_validate.py` with Pydantic `Literal[CategoryName]` constrained output.
- Tried a 30-input benchmark — blocked by Gemini free tier (5 RPM). Each run takes ~10 minutes with rate-limit retries.
- **Concluded the structural guarantee is sufficient:** the `Literal[CategoryName]` enum in `models.py` is enforced by Gemini's `response_schema` parameter. The model physically cannot return a value outside the list. Pydantic also rejects on parse if it somehow did. So "no invented categories" is guaranteed by construction, not by prompt.
- The remaining question is **classification accuracy**, which will be sanity-checked on 3–5 inputs during Phase 3 when the classifier is wired live.

**If accuracy is poor in Phase 3:** iterate the prompt, add few-shot examples, or fall back to "כללי" when confidence is low.

**The script `phase0_validate.py` is preserved** — it can be re-run later if free-tier limits relax or you want a regression baseline. Reduce sleep to 13s if running.

**Sample inputs to include:**
- "תרגיל בית בלינארית עד שלישי" → לינארית
- "ללמוד למבחן הסתברות" → יסודות ההסתברות
- "תור לרופא שיניים" → כללי
- "להכין מצגת לעבודה בערבית" → ערבית
- "לקנות חלב" → כללי
- "לסיים את הקריאה לתולדות" → תולדות העמים המוסלמים
- (you generate the rest)

**No frontend, no DB, no other backend code in this phase.** Just one script + a `.env` with the Gemini key.

---

## Phase 1 — Backend skeleton (FastAPI + SQLite)

**Goal:** running server with health-check + courses + tasks endpoints, no AI yet.

**Deliverables:**
- `app.py` — FastAPI app, CORS, static mounts placeholder
- `db.py` — SQLite schema + connection helper
- `requirements.txt` — copy life_dashboard's
- `.env.example` — template for `GOOGLE_API_KEY`
- `.gitignore` — same exclusions as life_dashboard

**Schema (SQLite) — pattern-based, see DATA_SEED.md for full rationale:**

```sql
-- The 9 categories. Editable via Settings UI.
CREATE TABLE categories (
    id            INTEGER PRIMARY KEY,
    name          TEXT NOT NULL UNIQUE,
    department    TEXT,
    mandatory     BOOLEAN DEFAULT 0,
    color_dark    TEXT,
    color_mid     TEXT,
    color_light   TEXT,
    sort_order    INTEGER
);

-- Recurring patterns: one row per recurring slot per course.
-- Drives the "compute today's tasks" query. Editable via Settings UI.
CREATE TABLE recurring_patterns (
    id              INTEGER PRIMARY KEY,
    category_id     INTEGER NOT NULL,
    kind            TEXT NOT NULL,  -- 'lecture' | 'tutorial' | 'hw' | 'reading'
    day_of_week     TEXT,            -- 'Sun'..'Sat'
    start_time      TEXT,            -- 'HH:MM'
    end_time        TEXT,
    hw_release_day  TEXT,
    hw_release_time TEXT,
    hw_due_offset_days INTEGER,
    hw_due_time     TEXT,
    label           TEXT,            -- for HW: 'תרגיל בית' / 'מבדק בית' / etc.
    weeks_active    TEXT,            -- JSON list of int weeks, e.g. "[1,2,...,13]"
    FOREIGN KEY (category_id) REFERENCES categories(id)
);

-- Lazy completion records — only inserted when the user interacts with
-- a specific occurrence (mark done/skip, add note, schedule).
CREATE TABLE completions (
    pattern_id      INTEGER NOT NULL,
    occurrence_date DATE NOT NULL,    -- the calendar date of this occurrence
    status          TEXT,             -- 'done' | 'skipped' (NULL = open)
    notes           TEXT,
    scheduled_at    DATETIME,         -- user's manual time-block
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (pattern_id, occurrence_date),
    FOREIGN KEY (pattern_id) REFERENCES recurring_patterns(id)
);

-- Free-text-typed tasks. Stored as full rows (no recurring pattern).
CREATE TABLE adhoc_tasks (
    id            INTEGER PRIMARY KEY,
    category_id   INTEGER NOT NULL,
    title         TEXT NOT NULL,
    type          TEXT,                -- 'lecture' | 'tutorial' | 'hw' | 'reading' | 'adhoc'
    place         TEXT,
    importance    INTEGER,
    urgency       INTEGER,
    release_at    DATETIME,
    due_at        DATETIME,
    scheduled_at  DATETIME,
    notes         TEXT,
    status        TEXT DEFAULT 'open',
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id)
);

-- Global config (semester dates, etc.).
CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT
);
```

**Virtual task IDs** for REST/frontend:
- Recurring instance: `"r:{pattern_id}:{occurrence_date_iso}"` (e.g. `"r:5:2026-05-03"`)
- Adhoc task: `"a:{adhoc_id}"` (e.g. `"a:42"`)
- Backend has a tiny helper `parse_task_id()` / `format_task_id()` that frontend treats as opaque.

**Endpoints (no AI yet):**
- `GET /healthz` — `{ ok: true }`
- `GET /categories` — list all 9
- `POST /categories` — add new (admin)
- `PATCH /categories/{id}` — edit
- `GET /tasks` — query: `date=today|all`, `category_id`, `group_by=category|eisenhower|place|urgency`
- `POST /tasks` — manual create (no AI yet, payload has all fields)
- `PATCH /tasks/{id}` — edit (status, scheduled_at, etc.)
- `DELETE /tasks/{id}`
- `GET /settings` / `PATCH /settings/{key}`

**Verification:** `uvicorn app:app --reload --port 8000`, hit `/healthz` and `/categories` (empty), confirm OK.

---

## Phase 2 — Seed the DB

**Goal:** populate `categories`, `recurring_patterns`, and the carry-over `adhoc_tasks` from `DATA_SEED.md`. NO ~300 task rows are pre-generated.

**Deliverable:** `seed.py` script that:
1. Reads the canonical course data (translate `DATA_SEED.md` into a Python dict at the top of the script).
2. Creates the 9 categories with their colors.
3. Creates the `recurring_patterns` rows (~25 total). Lectures, tutorials, HW patterns, readings.
4. Inserts the specific carry-over open tasks from week 3 as `adhoc_tasks` (listed in `DATA_SEED.md`).
5. Inserts settings rows: `semester_start = 2026-04-06`, `semester_end = 2026-07-05`.

**Verification:**
- `SELECT COUNT(*) FROM categories` → 9
- `SELECT COUNT(*) FROM recurring_patterns` → ~25
- `GET /tasks?date=today` → returns the virtual instances active for planning day, computed from patterns + carry-over adhoc rows.
- Spot-check: Probability has 3 lecture/tutorial pattern rows + 2 HW pattern rows = 5 patterns. Multiplied across weeks via the compute function.

**Re-seed safety:** `seed.py` should DROP and recreate `categories`, `recurring_patterns`, `settings`. **Should NOT drop** `completions` or `adhoc_tasks` (those have user data). Warn the user explicitly that re-seeding wipes only patterns, not progress.

**The compute function (`tasks_for_today`):** lives in a new module `compute.py`. Single source of truth for the materialization logic. Tested with fixture in Phase 2.

**Regression fixture:** save the expected pattern count per course to `tests/fixtures/seed_baseline.json`. Re-run after any pattern table change.

---

## Phase 3 — Hook Gemini for free-text input

**Goal:** `POST /tasks` accepts `{text: "..."}` and uses Gemini to classify + extract details.

**Deliverable:** `classifier.py` (mirror life_dashboard's), called from `app.py`.

**Output schema:**
```python
class ClassifiedTask(BaseModel):
    category_name: Literal["יסודות ההסתברות", "לינארית", "חדווא", "פייתון",
                            "ערבית", "שער למחקר", "דת האסלאם",
                            "תולדות העמים המוסלמים", "כללי"]
    title: str
    type: Literal["lecture", "tutorial", "hw", "reading", "adhoc"]
    place: Optional[Literal["home", "university", "library", "cafe", "other"]]
    importance: int = Field(ge=1, le=5)
    urgency: int = Field(ge=1, le=5)
    due_at: Optional[datetime]   # if user mentioned a deadline
    scheduled_at: Optional[datetime]   # if user mentioned when they'll do it
    notes: Optional[str]
```

**Critical: `Literal[...]` enforces closed-list output.** Gemini physically cannot return a 10th category.

**Date anchoring:** like life_dashboard — pass current date to the prompt so "tomorrow" / "Friday" resolve correctly.

**Verification:** POST 5–10 free-text inputs via `/docs`, verify each returns a valid ClassifiedTask and gets inserted into `tasks`.

---

## Phase 4 — Ugly `/ui` fallback frontend

**Goal:** working single-HTML test UI before any polish work. Per memory: "Test UI first, polish UI second."

**Deliverable:** `static/index.html` mounted at `/ui`. Vanilla JS + fetch. Sections:
- **Top input bar:** free-text → POST /tasks → refresh list
- **Today list:** GET /tasks?date=today, render with category color, due time, status checkbox
- **Settings (link to a second page):** edit course list + schedules

Use the colors from `DATA_SEED.md`. Keep it brutally simple — no CSS framework.

**Verification:** Amit clicks around for 5 minutes, marks tasks done, adds free-text, edits a course time. Everything persists across reload.

**Pass criteria:** Amit confirms the data model and flow feel right. If something needs to change, change the backend NOW before building the polished UI.

---

## Phase 5 — Polished `/app/` frontend (Claude Design handoff)

**Goal:** clone the life_dashboard Nucleus look, adapted for academic.

**Approach:**
1. Write `PROMPT_FOR_CLAUDE_DESIGN.md` — describe the academic dashboard with views (by-course, Eisenhower, by-place, by-urgency, Today, Calendar). Reference the life_dashboard Nucleus UI as the visual style. Explicitly note: language and direction must be **independent toggles** (the bug from life_dashboard).
2. Amit pastes that prompt into claude.ai/design, gets back single-file React HTML.
3. Drop into `frontend/` and rewire `claude-api.jsx` to call our backend. Same pattern as the life_dashboard rewire.

**Key UI requirements:**
- **Hebrew only.** All labels, buttons, placeholders, error messages in Hebrew. No EN strings. No language toggle.
- **RTL by default** at the document level (`<html dir="rtl" lang="he">`). No direction toggle.
- Default view: היום (Today) — filtered to released-and-not-done.
- Tab navigation: היום / לפי קורס / Eisenhower / לפי מקום / לפי דחיפות / לוח שנה / סדר יום / הגדרות.
- Settings page (הגדרות): edit categories, course schedules, semester dates.
- Free-text input bar (תיבת לכידה): prominent at top, like life_dashboard's CaptureBar.

**Verification:** Open `http://localhost:8000/app/`, walk all views, add task via free-text, mark done. Confirm direction toggle works without flipping language.

---

## Phase 6 — Settings UI (admin)

**Goal:** Amit can add/remove/rename courses, edit lecture and HW patterns, change semester dates — all from the UI, no SQL.

**Deliverable:** Settings page in `/app/`. Edit forms for:
- Categories: name, color, mandatory, dept
- Course schedule rows: kind, day, time, HW pattern
- Semester dates

When a course's schedule changes, **don't auto-regenerate concrete tasks** — that would surprise Amit. Just save the new pattern. Add a "Re-generate future tasks for this course" button that does the regeneration explicitly.

**Verification:** Amit adds a 10th category, renames one, edits a lecture time. Reloads. Changes persist.

---

## Phase 7 — Polish, lessons, memory

- First git commit + push to private GitHub if Amit wants version history.
- Save lessons to memory: anything new about the academic-vs-life_dashboard differences, anything new about Claude Design rewiring on a constrained-category project.
- Decide: keep `/ui` ugly fallback, or delete? (life_dashboard kept it.)

---

## What NOT to do

- ❌ Don't import data from `semester_dashboard.xlsx`. The seed is in `DATA_SEED.md`. The Excel was a separate tool.
- ❌ Don't add a 5-axis classifier like life_dashboard. We have ONE closed-list axis (category), and 4 derivable/optional ones (place, importance, urgency, time).
- ❌ Don't hardcode the 9 categories anywhere outside `seed.py` and the Pydantic schema. They live in the DB and are editable.
- ❌ Don't add a language toggle or English UI. Hebrew only. RTL fixed at the document level. The life_dashboard direction-coupling bug doesn't apply because there's no language switch.
- ❌ Don't show the user the whole semester by default. Default filter is "released and open." Future tasks invisible until released.
