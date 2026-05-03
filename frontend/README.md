# Nucleus — Developer Handoff

> A warm, paper-feeling personal task dashboard with an AI-classified capture bar, multiple views (All / by subject / by context / Eisenhower matrix / Calendar / Agenda), and an AI suggestions panel. Bilingual: English + Hebrew (full RTL).

This package contains the **design prototype** plus everything a backend engineer needs to build the production version against a FastAPI service.

---

## What's in this folder

| File | Purpose |
|---|---|
| `README.md` | This file — the spec |
| `API_PROMPTS.md` | Exact prompts to send to Claude (copy-paste ready) |
| `DATA_MODEL.md` | Task schema, dimensions, seed data |
| `WIRING.md` | How the frontend currently calls AI + how to swap to your backend |
| `Life Dashboard.html` | The working prototype (open in a browser) |
| `src/` | All React components, fully commented |

---

## TL;DR for the engineer

The frontend is **already built**. It's a single HTML file + React (no build step). It currently calls a browser-side helper `window.claude.complete()` that only works in the design preview environment.

**Your job**: stand up a FastAPI backend that exposes 4 endpoints, then change one file in the frontend (`src/claude-api.jsx`) to call your backend instead of `window.claude.complete()`.

The prompts are already written and tuned. The data model is finalized. The UI is done.

---

## The 4 endpoints

```
POST /api/tasks/classify       → classify a freshly-captured task
POST /api/suggest/dimensions   → propose new dimensions/values from task list
POST /api/suggest/connections  → propose batches & related tasks

GET  /api/tasks                → list tasks
POST /api/tasks                → create task (calls classify internally)
PATCH /api/tasks/{id}          → update fields
DELETE /api/tasks/{id}         → delete
```

Full payloads in `WIRING.md`. Prompts in `API_PROMPTS.md`.

---

## Tech stack assumptions

- **Frontend** — single HTML file, React 18 via UMD, Babel standalone (works without npm). Don't change this unless you need to; it's a working prototype that already does everything.
- **Backend** — FastAPI + your DB of choice (Postgres recommended for the date queries). The model calls go to Anthropic's API server-side using your key.
- **Auth** — out of scope here. Add whatever your app already uses.

---

## Design system reference

The prototype is the source of truth for visuals. Key tokens:

| Token | Value | Use |
|---|---|---|
| `--paper` | `#F5F1EA` | Background |
| `--ink` | `#1C1B19` | Body text |
| `--accent` | `#D9633A` | Primary CTA, focus rings, urgency-now edge |
| `--accent-2` | `#2F5D50` | Health subject, secondary accents |
| `--font-serif` | Instrument Serif (italic) | Section labels, "feel" copy |
| `--font-sans` | Inter Tight | Body |
| `--font-mono` | JetBrains Mono | IDs, timestamps |

Hebrew uses **Heebo** automatically. Direction flips via `document.documentElement.dir = "rtl"` and logical CSS properties (`paddingInlineStart`, `borderInlineEnd`, etc) — already implemented.

Dark mode is also already built (`html[data-theme="dark"]` overrides). Toggleable via the Tweaks panel.

---

## What lives where

```
Life Dashboard.html        ← entry point; loads all scripts
src/
  App.jsx                  ← root component, routing, state
  CaptureBar.jsx           ← the input at top; calls classify
  TaskCard.jsx             ← single task UI with side-steps, edit, done
  EditDialog.jsx           ← modal for editing dimensions
  SuggestionsPanel.jsx     ← the AI panel (dimensions + connections)
  CollapsibleGroup.jsx     ← group bars for Subject/Context views
  data.jsx                 ← seed tasks + DIMENSIONS constant (replace with API)
  i18n.jsx                 ← all translation strings (en + he)
  atoms.jsx                ← shared utilities (relTime, isHebrew, AutoDirText)
  icons.jsx                ← inline SVG icon set
  claude-api.jsx           ← ★ THE FILE TO REWIRE — see WIRING.md
  views/
    AllView.jsx
    GroupView.jsx          ← used by Subject + Context
    EisenhowerView.jsx
    CalendarView.jsx
    AgendaView.jsx
tweaks-panel.jsx           ← starter component, dev-only
```

---

## Recommended build order

1. **Read `DATA_MODEL.md`** — understand the task shape and the `DIMENSIONS` enum.
2. **Read `API_PROMPTS.md`** — these are the exact prompts. Don't rewrite them; they're tuned.
3. **Stand up FastAPI with the 7 endpoints** in `WIRING.md`. Use a real DB.
4. **Swap `src/claude-api.jsx`** to fetch your endpoints instead of `window.claude.complete()`. ~30 lines.
5. **Replace `src/data.jsx`** seed tasks with a `GET /api/tasks` call on mount.
6. **Add auth** to taste.
7. **Ship.**

---

## Things I'd consider

- **Streaming classification.** The classify call takes 1-3s with Claude Haiku. Consider streaming the JSON back so the user sees the chips populate progressively. Not done in the prototype.
- **Caching dimension suggestions.** They don't need to be regenerated every time. Cache per-user with a "tasks added since last suggestion" trigger.
- **Embedding-based connections.** For the Connections panel at scale, an embedding store (e.g. pgvector) on `raw_text` + `next_steps` will outperform pure prompt-based grouping once the user has >100 tasks.
- **Optimistic UI.** When a task is captured, show the card immediately with a shimmer state, then let classification fill in the chips. The prototype already does this pattern (`_isNew` + `freshIds`).
