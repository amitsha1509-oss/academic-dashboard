# Academic Dashboard — Start Here

**Date saved:** 2026-04-28
**Project root:** `C:\Users\amit shani\academic_dashboard\`
**Status:** planning finished, no code yet. Build in a fresh Claude session.

---

## For Amit (read me first)

You're building an academic version of `life_dashboard`. Same look (Nucleus polished UI), same building methods (FastAPI + SQLite + Gemini, React via Babel-in-browser, no npm), but specialized for university work.

**The difference from life_dashboard:**
- The categories are **closed and editable**: 8 courses + "כללי". Gemini picks from this list, never invents new ones.
- Data starts fresh from the seed in `DATA_SEED.md` (not from the Excel).
- Tasks become **visible only when they're released** (default filter: `release_at <= now`). No overwhelming "see the whole semester" view by default.
- A **Settings page** lets you edit courses, lecture times, and HW patterns. life_dashboard didn't have this.
- **Hebrew-only UI.** No language toggle, no English strings, no direction toggle. RTL is fixed. The life_dashboard bilingual bug is moot here because there's no language switching.

**How to start the build session:**
1. Open a fresh Claude Code session in `C:\Users\amit shani\academic_dashboard\`.
2. Tell it: *"Read START_HERE.md and BUILD_PLAN.md, then check with me before you start."*
3. It will confirm scope and stack with you, then build phase by phase per `BUILD_PLAN.md`.

---

## For the next Claude session (read me second)

You're picking up a project that's been planned but not built. The plan lives in `BUILD_PLAN.md`. The course data to seed the DB lives in `DATA_SEED.md`.

**Before any code:**
1. Read `BUILD_PLAN.md` end-to-end.
2. Read `DATA_SEED.md`.
3. Read the existing `life_dashboard` project at `C:\Users\amit shani\life_dashboard\` — that's the reference architecture. Specifically read `HANDOFF.md`, `app.py`, `classifier.py`, `db.py`, and `frontend/src/App.jsx` so you understand the patterns we're cloning.
4. Confirm with Amit: stack (FastAPI + SQLite + Gemini, React via Babel-in-browser), Phase 0 first (validate AI categorization with 30 test inputs before any UI), then phase by phase.

**Key principles from Amit's memory that govern this build:**
- **Maximize code, minimize AI** — only Gemini call is at the input boundary (free text → course selection + dimensions). Everything else is deterministic.
- **Validate riskiest assumption first, ugly** — before polishing, test that Gemini reliably picks from the closed category list. Phase 0 is exactly this.
- **Test UI first, polish UI second** — `/ui` ugly fallback first, then polished `/app/` from Claude Design.
- **New data = backend, new arrangement = frontend** — Eisenhower / by-place / by-course views are 100% frontend (filter+group existing data).
- **Confirm stack at session start** — ask Amit to confirm Python 3.10, openpyxl-not-needed-this-time (DB seed comes from a Python dict in code), FastAPI port 8000, Gemini 2.5 Flash.

**Memory pointers:**
- Project memory: `C:\Users\amit shani\.claude\projects\C--Users-amit-shani\memory\projects\academic_dashboard.md`
- Cross-project memory index: `C:\Users\amit shani\.claude\projects\C--Users-amit-shani\memory\MEMORY.md`

**Don't do:**
- Don't import the data from `semester_dashboard.xlsx`. That Excel was a separate tool. The seed is in `DATA_SEED.md`.
- Don't expand to 5-axis classification like life_dashboard did. We have 1 closed-list axis (course) + 4 derivable axes (place, importance, urgency, time). Keep it simple.
- Don't hardcode the course list deep in the code. It must be editable via Settings.

---

## File map (this folder)

```
academic_dashboard/
├── START_HERE.md     ← this file
├── BUILD_PLAN.md     ← phased build plan, deliverables per phase
├── DATA_SEED.md      ← course list, schedules, HW patterns, semester dates
└── (everything else gets created in session B)
```
