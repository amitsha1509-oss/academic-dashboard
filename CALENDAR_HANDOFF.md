# Calendar Feature — Session Handoff

**Date:** 2026-05-13
**Session type:** Design / architecture (no code written)
**Next session:** Build — start with Vite mini-app scaffold

This document captures every decision made in this session. Read top to bottom before touching any code.

---

## 1. The real problem (took 30 min to find)

The user's pain was NOT "I want a calendar view."

The real pain: **"I couldn't place WHEN I want to do each task. I had to move to Google Calendar to schedule, but then I couldn't see my tasks there."**

Two sub-problems:
1. No way to assign a task a specific time slot in the app
2. No way to see non-task calendar events (classes, appointments) when deciding which slot is free

A simple weekly view of tasks alone doesn't solve it — you need to see GCal events as constraints.

---

## 2. All decisions made — final architecture

### What we're building
A **calendar view** where the user can:
- See their week (weekly grid + day view)
- See Google Calendar events as read-only grey blocks (so they know what time is taken)
- See their app tasks in a sidebar (unscheduled)
- **Drag a task from the sidebar onto a time slot** to schedule it
- When scheduled → automatically push it to Google Calendar as an event

### Sync model (critical — read carefully)
**NOT two-way sync on the same entity.** Two separate flows:

| Direction | What | How |
|---|---|---|
| GCal → App | Read existing GCal events | Fetch when calendar tab opens. Display as grey read-only blocks. No IDs stored, no conflict resolution. |
| App → GCal | Push scheduled tasks | When user drags task to a slot → create GCal event → store GCal event ID on the task in DB. |

**If the user moves/deletes a task-event in GCal directly:** the app doesn't know and doesn't care. App is source of truth.

**If the user edits/deletes a scheduled task in the app:** update or delete the corresponding GCal event using the stored event ID.

This deliberately avoids two-way sync complexity (conflict resolution, polling, webhooks).

### Google OAuth / tokens
- Request Calendar scope at **first calendar tab open**, not at login (less invasive)
- Use the access token from the current session
- No background syncing → no refresh token needed in most cases
- If token expires mid-session (rare): show a small "reconnect Google Calendar" button
- **One-time approval per user.** Not per session.
- Additional OAuth scope needed: `https://www.googleapis.com/auth/calendar.events`

### Where to build it
**Option chosen: Vite mini-app at `/calendar`**

Reason: FullCalendar's React component (`@fullcalendar/react`) requires npm. Building in the existing Babel-in-browser frontend requires hand-wiring React lifecycle imperatively — fragile, compounds as feature grows. Full migration of existing 18-file Babel app to Vite = 40-60h, too much.

The mini-app:
- Is a separate Vite project (can reuse `frontend-vite/` structure or start fresh)
- Served at `/calendar` by FastAPI
- Uses same session cookie for auth (no separate login)
- Has npm, so FullCalendar React component works cleanly
- Full page reload when navigating to it — acceptable for this use case (1-2 seconds, user expects it when clicking a nav link)
- Does NOT share components with the Babel app — talks to the same backend API

### Libraries
- **FullCalendar:** `@fullcalendar/react` + `@fullcalendar/timegrid` + `@fullcalendar/interaction`
- **Drag-and-drop:** FullCalendar's built-in `Draggable` class (no extra library needed)
- **Google Calendar API:** direct REST calls for push; FullCalendar's `@fullcalendar/google-calendar` plugin for read display

---

## 3. DB changes needed

One new column on `adhoc_tasks` (and possibly `completions` for recurring):
```sql
ALTER TABLE adhoc_tasks ADD COLUMN gcal_event_id TEXT;
```

When a task is scheduled:
- `scheduled_at` (already exists) = the time slot chosen
- `gcal_event_id` = the Google Calendar event ID returned after push

When task is deleted or unscheduled → delete the GCal event using `gcal_event_id`.

Users table needs to store the GCal access token (and optionally refresh token):
```sql
ALTER TABLE users ADD COLUMN gcal_access_token TEXT;
ALTER TABLE users ADD COLUMN gcal_token_expiry TEXT;
```

---

## 4. Backend changes needed

### New endpoints
| Endpoint | What |
|---|---|
| `GET /auth/google/calendar` | Initiate OAuth flow for Calendar scope (separate from login OAuth) |
| `GET /auth/google/calendar/callback` | Handle GCal OAuth callback, store token |
| `GET /gcal/events?start=&end=` | Fetch user's GCal events for a date range (proxy — avoids CORS) |
| `POST /tasks/{id}/schedule` | Assign a time slot to a task + push to GCal → store gcal_event_id |
| `DELETE /tasks/{id}/schedule` | Remove time slot + delete GCal event |

### Existing endpoints to update
- `PATCH /tasks/{id}` — if `scheduled_at` changes, update the GCal event
- `DELETE /tasks/{id}` — if task has `gcal_event_id`, delete the GCal event first

---

## 5. Frontend (mini-app) components to build

```
calendar-app/
├── index.html
├── vite.config.ts        # proxy /api/* → localhost:8001
├── src/
│   ├── main.tsx
│   ├── App.tsx           # auth check (GET /auth/me), CalendarView
│   ├── api.ts            # typed fetch wrappers for all backend calls
│   ├── CalendarView.tsx  # FullCalendar weekly+day grid
│   ├── TaskSidebar.tsx   # unscheduled tasks, each is <Draggable>
│   └── types.ts          # Task, GCalEvent, User interfaces
```

Key FullCalendar config:
```tsx
<FullCalendar
  plugins={[timeGridPlugin, interactionPlugin]}
  initialView="timeGridWeek"
  direction="rtl"
  locale="he"
  droppable={true}
  snapDuration="00:30:00"
  eventReceive={handleTaskDropped}
  events={[...gcalEvents, ...scheduledTasks]}
/>
```

---

## 6. Known gotchas — read before coding

1. **RTL drag-and-drop coordinates** — FullCalendar's drag math can be off in RTL mode. Test drag accuracy on day 1, before building anything else on top of it.

2. **Hebrew locale** — `locale: 'he'` alone is not enough. Must import `@fullcalendar/core/locales/he` explicitly or it silently falls back to English column headers.

3. **GCal events for writing** — `@fullcalendar/google-calendar` plugin handles read display well. For writing back (push), use Google Calendar REST API directly — the plugin doesn't handle writes.

4. **Railway env vars** — `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` already exist on Railway for login OAuth. Calendar OAuth uses the same client but needs an additional scope added in Google Cloud Console. Do not create a second OAuth client.

5. **Existing OAuth footgun** — Railway dashboard's env var text field appends a newline to pasted values. Always use `railway variables set "KEY=VALUE"` from CLI.

6. **`frontend-vite/` exists but has wrong codebase** — the current `frontend-vite/` has the session 6 TypeScript/Tailwind/shadcn version that was rejected. Either clean it out or create a new folder (e.g. `calendar-app/`) to avoid confusion.

7. **ADMIN_KEY and RESTORE_SECRET** — check Railway env vars; RESTORE_SECRET should have been deleted after session 10 DB upload.

---

## 7. What to do at session start

1. Read `HANDOFF.md` (existing — covers sessions 1-20, app architecture)
2. Read this file (`CALENDAR_HANDOFF.md`)
3. Confirm with Amit: start with Vite scaffold or backend endpoints first?
4. **My recommendation:** backend first (new endpoints + DB columns), then mini-app scaffold, then wire them together. Backend is lower risk and easier to test independently.
5. Start server: `.venv\Scripts\uvicorn.exe app:app --port 8001`
6. Verify: `curl http://localhost:8001/healthz` → 200

---

## 8. Open items from HANDOFF.md still pending

These are NOT calendar-related but carry forward:
- 🔴 **Groq API key rotation** — leaked in early chat
- 🔴 **Session 20 changes not deployed** — restore feature, schema fix (ON DELETE SET NULL), LEFT JOIN archive fix
- 🟡 **Defender exclusion** for project folder
- 🟡 **מודיעין נח card layout** — empty left space on short RTL cards
- 🟡 **Eisenhower tab name** — no accepted Hebrew name yet

---

## 9. Suggested skills for next session

- **`hebrew-rtl-best-practices`** — when building the calendar UI (RTL grid, Hebrew locale)
- **`tdd`** — backend endpoints (schedule/unschedule/GCal push) are testable independently
- **`grill-with-docs`** — if any new architectural decisions come up mid-build

---

## Decision log (quick reference)

| Decision | Choice | Reason |
|---|---|---|
| Core problem | Time-blocking tasks, not just viewing | Can't plan without seeing GCal constraints |
| Sync model | Pull GCal read-only + push tasks one-way | Two-way sync on same entity = conflict hell |
| OAuth timing | Ask at first calendar open, not login | Less invasive |
| Token strategy | Access token from session, no background refresh | No background sync needed |
| Where to build | Vite mini-app at /calendar | CDN approach = fragile imperative React; full migration = 40-60h |
| Library | FullCalendar (@fullcalendar/react) | Only option with first-class RTL + external DnD + React |
| Page reload | Acceptable | 1-2s, user expects it on nav link click |
| GCal event tracking | Store gcal_event_id on task in DB | Needed for update/delete, not for sync-back |

End of handoff.
