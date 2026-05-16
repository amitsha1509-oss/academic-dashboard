# Calendar Feature — Handoff (Sessions 1–2, Complete)

**Date:** 2026-05-13
**Status:** Feature complete and working locally. NOT yet deployed to Railway.

---

## What was built

A Google Calendar integration as a Vite mini-app served at `/calendar/`.

### What it does
- Fetches the user's Google Calendar events and shows them as **solid colored blocks** using each calendar's own color — with a 🔒 icon indicating read-only
- Shows **unscheduled adhoc tasks** in a sidebar — drag any task onto a time slot to schedule it
- Scheduled tasks appear as **solid colored blocks** (category color) — click → popup → "הסר מהלוח" to unschedule and return to sidebar
- Navigating weeks reloads GCal events for that range automatically
- All-day GCal events are filtered out (no time = can't show in time grid)
- "📅 לוח שנה" link in the main dashboard tab bar

### Visual language
- **Solid block + 🔒** = GCal event, read-only, colored by Google Calendar
- **Solid block, no lock** = task you placed, click to delete
- Tasks colored by category; GCal events colored by their Google calendar — always visually distinct

---

## Architecture

### New files
| File | What it is |
|------|-----------|
| `gcal.py` | Google Calendar OAuth + API: token storage, find/create "אקדמיה" calendar, CRUD events |
| `calendar-app/` | Vite mini-app: the full calendar UI |
| `CALENDAR_HANDOFF.md` | This file |

### Modified files
| File | What changed |
|------|-------------|
| `db.py` | Migration: `gcal_access_token`, `gcal_token_expiry`, `gcal_calendar_id` on `users`; `gcal_event_id` on `adhoc_tasks` |
| `models.py` | Added `ScheduleTaskPayload` |
| `app.py` | All `/gcal/*` routes, calendar static mount at `/calendar/` |
| `frontend/src/App.jsx` | "📅 לוח שנה" link at end of ViewSwitcher tab bar |

### calendar-app structure
```
calendar-app/
  index.html          — RTL Hebrew, Google Fonts Assistant, lang="he" dir="rtl"
  vite.config.ts      — base=/calendar/, port 5174, proxy to :8001
  src/
    types.ts          — User, Task, GCalEvent, GCalStatus interfaces
    api.ts            — typed fetch wrappers for all backend endpoints
    App.tsx           — auth gate (401→/app/) → gcal gate → CalendarView
    CalendarView.tsx  — main component
    index.css         — spin animation, FullCalendar RTL overrides
```

### API endpoints added
| Method | Path | What it does |
|--------|------|-------------|
| GET | `/gcal/auth` | Redirect to Google for calendar scope |
| GET | `/gcal/callback` | Handle Google redirect, store token, create "אקדמיה" calendar |
| GET | `/gcal/status` | `{connected: bool, calendar_id: str\|null}` |
| GET | `/gcal/events?time_min=&time_max=` | Fetch all GCal events for a date range |
| POST | `/gcal/schedule/{task_id}` | Create/update GCal event, store scheduled_at |
| DELETE | `/gcal/schedule/{task_id}` | Delete GCal event, clear scheduled_at |

### Google Cloud Console (already configured)
- Google Calendar API enabled
- OAuth consent screen: Calendar scope added, amitsha1509@gmail.com as test user
- Authorized JavaScript origins: `http://localhost:8001`, `https://academic-dashboard-production-d0d5.up.railway.app`
- Authorized redirect URIs: `http://localhost:8001/gcal/callback`, `https://academic-dashboard-production-d0d5.up.railway.app/gcal/callback`

---

## Key design decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Sync direction | Pull GCal read-only, push tasks one-way | Two-way sync on the same entity causes conflicts |
| Dedicated calendar | "אקדמיה" created automatically on first connect | User wanted tasks separated from personal calendar |
| Refresh tokens | Not stored — access token only | App operations happen while user is in-session; reconnect button for expiry |
| Architecture | Vite mini-app at `/calendar/` | Migration of main app = 40-60h, not worth it; CDN FullCalendar = anti-pattern |
| Task duration | Always 1 hour | `due_at` as end caused multi-day blocks |
| Calendar embed | Deferred — currently separate page | User asked, agreed to defer; iframe approach (~2h) is the path when ready |

---

## Bugs fixed during build

| Bug | Root cause | Fix |
|-----|-----------|-----|
| `EventReceiveArg` TS error | Wrong import — it's in `@fullcalendar/interaction` not `core` | Moved import |
| `httpx.ReadTimeout` on calendar creation | Default 5s timeout too short | Set `timeout=30.0` on all `httpx.AsyncClient()` calls |
| OAuth callback 500 | Authlib OIDC discovery tried to parse missing `id_token` | Switched to explicit OAuth2 endpoints (no `server_metadata_url`) |
| GCal events not showing on week navigation | Race condition: `useEffect` and `datesSet` both called `loadGcalEvents`, overwriting each other | Removed manual call from `useEffect`; `datesSet` handles all loading |
| Task blocks appeared as multi-day events | `due_at` used as end time | Fixed to `start + 1 hour` always |
| 401 on `scheduleTask` not handled | Only `loadGcalEvents` had 401 → `onDisconnect` handling | Added same handling to `handleEventReceive` |

---

## What still needs work (do these next session)

### 🔴 Critical before real users

**1. Groq API key rotation**
Key was leaked in an early chat session. Still not rotated. Do this before any new users touch the app.

**2. Deploy to Railway**
`calendar-app/dist/` is built locally but not committed. Steps:
```
# Option A — commit the dist (quick, works now)
git add calendar-app/dist
git commit -m "add calendar-app dist"
git push  # Railway auto-deploys

# Option B (better long-term) — add build step to railway.toml
# In railway.toml, change build command to:
# cd calendar-app && npm install && npm run build && cd ..
```
After deploy, test the full OAuth flow on the production URL.

### 🔴 Overall quality — the feature is buggy and the UI looks unprofessional

**The calendar works as a proof of concept but is NOT ready to show anyone.** Amit explicitly flagged this at end of session. It needs a full polish pass before it's presentable. Specific problems:

- **Bugs not fully tested** — drag-to-schedule reported an error mid-session, never confirmed fixed. Delete popup positions poorly near screen edges. Week navigation worked after a fix but wasn't regression-tested across many weeks.
- **UI looks rough** — FullCalendar's default Hebrew RTL styling is unpolished. The sidebar task cards are functional but plain. The event blocks have no consistent visual hierarchy between GCal events and placed tasks. The "connect GCal" screen is basic. Nothing has been QA'd against a real populated calendar.
- **No empty states** — if GCal returns no events, nothing communicates that to the user. If the task list is long, the sidebar has no scroll affordance. 
- **Mobile is broken** — the layout is desktop-only. Not a priority, but worth knowing.

Treat next session's calendar work as: **bug hunt first, then UI polish pass**, before considering it shippable.

---

### 🟡 Specific bugs and gaps

**3. Drag error not confirmed fixed**
User reported a drag error mid-session but moved on without sharing details. Next session: test drag-to-schedule, watch uvicorn logs for 500s.

**4. "אקדמיה" calendar events showing on calendar**
Currently `gcalEvents.filter(e => !e.is_academia)` hides the "אקדמיה" calendar events — this is intentional since those are tasks we pushed, but it means the user can't see their scheduled tasks coming FROM GCal. This might be confusing. Decision needed: show or hide?

**5. No loading indicator when switching weeks**
When the user navigates to a different week, GCal events disappear for a moment while fetching. Should add a subtle loading spinner or keep stale events visible during load.

**6. Token expiry UX**
If the access token expires mid-session, the next `loadGcalEvents` call returns 401 → `onDisconnect()` → user sees the connect screen. But any pending `scheduleTask` calls will fail with a 500 (not 401), showing the generic error. Should normalize all 401s from GCal to trigger `onDisconnect`.

### 🟢 Nice to have

**7. Embed calendar in main dashboard**
User asked about this. Easiest path: add a "calendar" view to the dashboard that renders `/calendar/` in an `<iframe>`. ~2 hours. Deferred by user.

**8. Add hover state to calendar link in tab bar**
The "📅 לוח שנה" link in the dashboard has no hover style. Add `onMouseEnter`/`onMouseLeave` or a CSS class.

---

## How to run locally

```powershell
# Backend (from project root)
.\.venv\Scripts\uvicorn.exe app:app --port 8001 --reload

# Calendar at http://localhost:8001/calendar/

# Dev server with hot reload (optional)
cd calendar-app
npm run dev  # → http://localhost:5174
```

## How to rebuild after changes to calendar-app

```powershell
cd "C:\Users\amit shani\academic_dashboard\calendar-app"
npm run build
# Hard refresh in browser: Ctrl+Shift+R
```
