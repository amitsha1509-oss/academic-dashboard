# Academic Dashboard — Session Handoff

**Date saved:** 2026-04-30 (end of session 5)
**Project root:** `C:\Users\amit shani\academic_dashboard\`
**DB file:** `academic.sqlite3` (backup at `academic.sqlite3.pre-multiuser-backup`)
**Status:** Multi-user backend + login UI working. **Session 5 added a feedback feature (table + endpoints + floating button).** Real Google OAuth setup is **paused mid-walkthrough at Cloud Console Step 1**. Render free tier ruled out for SQLite (no persistent disk). See §3 and §11.

This is the authoritative resume document. If you (or a future Claude session) come back after a break, read top to bottom and you can pick up cleanly.

---

## 1. The vision

Personal academic task tracker for Spring 2026. Specialized version of life_dashboard (Nucleus). Hebrew-only UI, RTL fixed.

- **Per-user categories.** Each user creates their own course list. (Was global until session 4.)
- **Default filter = "released and open."** Future tasks invisible until released.
- **Binary importance/urgency.** No medium.
- **Code-first classifier with AI fallback** — ~80% of inputs handled without a Gemini call.
- **Multi-user since session 4.** Google OAuth (Test mode) + per-user data isolation.

---

## 2. Current state — what works (verified live)

### Backend (FastAPI on port 8001)

- **Users table** with Google `sub` + email + name. User 1 is pre-seeded as Amit (`amitsha1509@gmail.com`).
- **All user-data tables** (categories, recurring_patterns, completions, adhoc_tasks, settings) gained a `user_id` column. Pre-existing data backfilled to user 1.
- **Every endpoint requires auth** via `Depends(auth.get_current_user)` and filters every query by `user.id`. Sub-agent code review confirmed no bypass.
- **Auth routes:**
  - `GET /auth/me` — current user or 401
  - `GET /auth/google/login` — redirects to Google with `prompt=select_account`
  - `GET /auth/google/callback` — handles Google's response, sets session cookie, redirects to `/app/`
  - `POST /auth/logout` — clears session cookie
  - `GET /auth/dev_login?user_id=N` — DEV_MODE only, sets cookie for the given user
  - `GET /auth/dev_users` — DEV_MODE only, lists all users so the picker works
- **Session cookies:** `acdash_session`, signed by `itsdangerous.TimestampSigner`. `httponly`, `samesite=lax`, 30-day max. `secure` flag auto-enabled when `BASE_URL` starts with `https://`.
- **Classifier** drops the hardcoded `Literal[CategoryName]` and accepts `user_categories` per-call. Validation done both in the prompt and at the app layer.
- **Categories CRUD:** `GET / POST / PATCH / DELETE /categories`. New users start empty and create their own.

### Frontend (`/app/`)

- **`Bootstrap` component** at the React root. Calls `GET /auth/me` on mount. If 401: shows `LoginScreen`. If 200: stashes `window.__USER_ID` and renders `App`.
- **LoginScreen:** Hebrew-only. Single primary button **"התחבר עם Google"** → redirects to `/auth/google/login`. Below it, a small **"⚙️ Dev mode"** panel appears only when `DEV_MODE=1` on the server — a dropdown of all users + a "Sign in" button. Switching accounts in dev = pick from dropdown, click Sign in.
- **Logout button** in the Tweaks panel, alongside the user's email.
- **Per-user `localStorage`** via `window.userStorage.get/set/remove`. Every key prefixed with `nucleus.u${user_id}.` — two users sharing a browser don't bleed UI prefs.
- **Empty states:**
  - Schedule view: "create a course first" if user has no categories.
  - Courses view: "+ קורס חדש" inline form for new users to create their first course.
- **All API calls** go through the `_fetch` wrapper in `claude-api.jsx`, which always sends `credentials: "include"` so the session cookie flows on every request (not only same-origin).

### DB inspection

The full DB lives in one file: `academic.sqlite3`. Three ways to view:

1. `inspect_db.py` (just run it for a quick summary):
   ```cmd
   .venv\Scripts\python.exe inspect_db.py
   ```
2. **DB Browser for SQLite** (recommended GUI) — https://sqlitebrowser.org/dl/. Open the `.sqlite3` file → Browse Data tab.
3. Direct SQL via Python:
   ```cmd
   .venv\Scripts\python.exe -c "import sqlite3; c=sqlite3.connect('academic.sqlite3'); [print(dict((c.execute('PRAGMA table_info('+t+')').fetchall(), c.execute('SELECT * FROM '+t+' LIMIT 3').fetchall()))) for t in ('users','categories')]"
   ```

The API NEVER exposes another user's data, even to you. To see everyone's data, query the file directly.

### Security audit (sub-agent, session 4)

Findings actioned:
- ✅ 🔴 Every API fetch now sends `credentials: "include"` (was a 401 trap waiting in production).
- ✅ 🟠 `completions` UPDATE has belt-and-suspenders `WHERE user_id=?`.
- ✅ 🟠 `compute.py` already filtered by user_id (verified).
- ✅ 🟡 `COOKIE_SECURE` auto-enables when `BASE_URL` is HTTPS.
- ✅ DEV_MODE bypass returns 404 when env unset.
- ✅ OAuth callback validates `sub` + `email`; redirect is hardcoded `/app/` (no open redirect).
- ✅ All SQL parameterized; column names spliced into f-strings have whitelists.

Deferred (acceptable for v1 friends-only):
- Settings key whitelist (self-foot-shoot only, not cross-tenant).
- `/auth/logout` no-auth (CSRF-logout = DoS, low impact).
- stdout logs contain user emails (PII for prod logs; v2 cleanup).

### Multi-user isolation: end-to-end verified

- User 2 starts with 0 categories / 0 patterns / 0 tasks.
- User 2 can create categories + patterns scoped to their account.
- User 1 cannot PATCH or DELETE user 2's pattern (404).
- User 1's data unaffected by user 2's actions.
- DB FK integrity stays clean (`PRAGMA foreign_key_check` returns 0 violations).

---

## 3. Open items YOU must do

### 🔴 1. Register a Google OAuth client

Currently runs in `DEV_MODE=1`. Real "Sign in with Google" returns 503 until OAuth is configured. Read `OAUTH_SETUP.md` (in project root). Takes ~10 minutes:

- Create OAuth client in Google Cloud Console
- Add redirect URI `http://localhost:8001/auth/google/callback`
- Add yourself + each friend as Test User
- Paste `CLIENT_ID` + `CLIENT_SECRET` into `.env`

### 🔴 2. Rotate the Gemini API key

Carried from session 2. The key in `.env` was leaked in chat. Rotate at https://aistudio.google.com/apikey. Especially important now since you're going multi-tenant.

### 🟡 3. Defender exclusion (carried from session 2)

Add `C:\Users\amit shani\academic_dashboard\` to Windows Defender exclusions. Otherwise the SQLite-lock rabbit hole can recur.

### 🟢 4. (Next week, when money lands) Deploy

Read `DEPLOY.md` (project root). Two paths:
- **Fly.io ~$2-5/mo** — Docker + persistent volume.
- **Hetzner CX22 $5/mo** — VPS + Caddy.

Either way: copy your local `academic.sqlite3` to the deploy target so your data is preserved.

### 🟢 5. In production: ensure `DEV_MODE` is unset

In production `.env`: omit `DEV_MODE` or set `DEV_MODE=0`. Otherwise anyone hitting `/auth/dev_login?user_id=N` can impersonate any user.

### 🟢 6. First git commit + private GitHub push

Project is ~3500 lines of frontend + working backend + 4 docs. Version control is overdue.

---

## 4. File map

```
academic_dashboard/
├── auth.py                     ★ session 4 NEW — OAuth, sessions, get_current_user, dev_users
├── db.py                       ★ users table + user_id columns + FK migration dance
├── app.py                      ★ every route gets Depends(get_current_user); /auth/* routes
├── classifier.py               ★ Literal removed; user_categories per-call
├── compute.py                  ★ filtered by user_id
├── seed.py                     ★ user-aware (per-user reset)
├── models.py                   ★ CategoryName Literal dropped; CategoryCreate added
├── keyword_classifier.py       (unchanged — Amit-specific keywords; non-Amit users hit AI fallback)
├── inspect_db.py               ★ session 4 NEW — pretty-print users + counts
├── requirements.txt            ★ +authlib, itsdangerous, httpx
├── .env                        SESSION_SECRET (persisted, session 4) + DEV_MODE=1 + GOOGLE_API_KEY
├── academic.sqlite3                      current multi-user DB
├── academic.sqlite3.pre-multiuser-backup ← restore from this if migration breaks
│
├── OAUTH_SETUP.md              ★ session 4 NEW — Google Cloud Console steps
├── DEPLOY.md                   ★ session 4 NEW — Fly.io + Hetzner deploy guides
├── MULTIUSER_PLAN.md           ★ session 4 NEW — the plan we built from
├── BUILD_PLAN.md, BUILDING_PRINCIPLES.md, DATA_SEED.md, START_HERE.md  (still authoritative)
├── HANDOFF.md                  ← this file
│
├── frontend/
│   ├── index.html
│   ├── tweaks-panel.jsx
│   └── src/
│       ├── App.jsx                 ★ Bootstrap login gate; LoginScreen with dev-mode picker
│       ├── claude-api.jsx          ★ _fetch wrapper, authMe, authLogout, createCategory
│       ├── atoms.jsx               ★ window.userStorage helper (per-user prefix)
│       ├── CollapsibleGroup.jsx    ★ uses userStorage
│       ├── CaptureBar.jsx, EditDialog.jsx, TaskCard.jsx, data.jsx, i18n.jsx, icons.jsx
│       └── views/
│           ├── AllView.jsx
│           ├── GroupView.jsx
│           ├── EisenhowerView.jsx
│           ├── CoursesView.jsx     ★ "+ קורס חדש" inline form
│           ├── ScheduleView.jsx    ★ empty-state for users with no categories
│           ├── HistoryView.jsx
│           ├── AgendaView.jsx, CalendarView.jsx (not in VIEWS array)
│
└── static/index.html           (the /ui ugly fallback, still served at /ui)
```

★ = changed in session 4.

---

## 5. How to run

### Start the server (DEV_MODE)

```cmd
cd C:\Users\amit shani\academic_dashboard
.venv\Scripts\python.exe -m uvicorn app:app --port 8001
```

The `.env` already sets `DEV_MODE=1` and a persistent `SESSION_SECRET`. Cookies survive restarts.

For a one-click launcher, save this as `run.bat` next to `app.py`:

```bat
@echo off
cd /d "%~dp0"
.venv\Scripts\python.exe -m uvicorn app:app --port 8001
```

### Sign in (DEV_MODE)

1. Open `http://localhost:8001/`
2. Login screen appears.
3. Either:
   - Click "התחבר עם Google" — only works after OAuth setup (currently 503).
   - Or use the **⚙️ Dev mode** picker: dropdown → pick a user → "Sign in".
4. You're on `/app/` with that user's data.

### Switch to a different user

1. Click "התנתק" in the Tweaks panel.
2. Pick a different user from the dropdown on the login screen.
3. Click Sign in.

### Inspect the DB

```cmd
.venv\Scripts\python.exe inspect_db.py
```

For interactive editing, use **DB Browser for SQLite** — https://sqlitebrowser.org/dl/

### Reset DB (DESTRUCTIVE — wipes user 1's data, not other users')

```cmd
.venv\Scripts\python.exe seed.py
```

This calls `seed(user_id=1)` which deletes user 1's categories/patterns/settings and re-seeds them from `seed.py`'s hardcoded data. **Doesn't touch other users.** To wipe all users + everything, delete `academic.sqlite3` and run `python db.py` then `python seed.py`.

---

## 6. Known footguns

### A. localStorage staleness when changing UI defaults (session 3)

Bumping a `defaultOpen` or other localStorage-backed default in code does NOT take effect for users whose browser already cached the old default. Bump the storage key (`schedule.cat.${id}` → `schedule.cat.v2.${id}`) when changing defaults. Lesson: `~/.claude/.../lessons/localstorage_default_staleness.md`.

### B. SQLite FK CASCADE during table rebuilds (session 4)

Renaming a parent table (`ALTER TABLE x RENAME TO x_old`) and then DROPping it cascades through ON DELETE CASCADE FKs in child tables, even if you've recreated the parent with the same data — because SQLite's `RENAME` updates child FK references to point at the new name. Standard mitigation: `PRAGMA foreign_keys = OFF` during rebuild + use the `create-temp → copy → drop-old → rename-temp-to-old-name` order. After the rebuild, run `PRAGMA foreign_key_check` as a tripwire. If you ever script a similar migration: remember `sqlite3.connect()` does NOT enable FKs by default — `db.connect()` does. Standalone scripts must `PRAGMA foreign_keys = ON` themselves.

### C. Windows Defender silently locks SQLite files (session 2)

Symptom: `attempt to write a readonly database` even though file permissions look fine. Defender / Search Indexer is holding the file. Quick fix: rename the .db file. Real fix: add the project folder to Defender exclusions. Lesson: `~/.claude/.../lessons/windows_defender_sqlite_lock.md`.

### D. Per-user keyword classifier limitation

`keyword_classifier.py` only knows Amit's specific Hebrew keywords (probability, lin alg, calc, Python, Arabic, etc.). New users with different course lists fall through to AI for everything — works correctly, but costs more Gemini calls per capture. If keyword coverage matters for non-Amit users later, refactor `KEYWORDS` into per-user data.

### E. SESSION_SECRET regeneration

If you delete `SESSION_SECRET` from `.env` (or it's missing in production), the server generates an ephemeral one at startup. **Every restart invalidates all existing cookies** and forces re-login. The startup logs `[auth] WARNING: SESSION_SECRET not set; using ephemeral secret` when this happens.

---

## 7. Cost summary at production scale

| Item | Frequency | Notes |
|---|---|---|
| Render / Fly / Hetzner | $2-7/mo | Pick from DEPLOY.md |
| Persistent disk | $0-1/mo | Built into VPS or +$0.15/GB on Fly |
| HTTPS | $0 | Free via Let's Encrypt or platform |
| Domain (optional) | $10/yr | Skip for v1, use platform subdomain |
| Gemini paid tier | $1-2/mo | ~80% of captures use code path; only ~20% hit Gemini |
| Google OAuth | $0 | Free in any GCP project |
| **Total v1** | **~$3-9/mo** | Whichever deploy you pick |

---

## 8. Suggested next-session focus

In rough priority:

1. **You: register OAuth client + rotate Gemini key + Defender exclusion** (the 3 things blocking real friends-only use).
2. **First daily-use period.** Use it solo for a week. Note pain points.
3. **Invite 1-2 friends for soft launch.** Confirm OAuth signup works for them, isolation feels right.
4. **First git commit + private GitHub push.** Project is large; version control is overdue.
5. **Deploy when money lands** (DEPLOY.md).
6. **v2 hardening for public sign-ups** (rate limit + CAPTCHA + email verify + ToS) — only if you decide to go beyond friends.
7. **Apply category defaults in keyword classifier path** (carried from session 3, ~30 min — makes About Me actually affect simple captures).
8. **Verify kind-priorities AI re-rank works end-to-end** (carried from session 3, was wired but never observed live).

---

## 9. Quick start for the next session

1. Read this HANDOFF.md.
2. Read `BUILDING_PRINCIPLES.md` (still authoritative).
3. Confirm with Amit which item from §8 to tackle first.
4. Start the server: `.venv\Scripts\python.exe -m uvicorn app:app --port 8001`
5. Verify it works: `curl http://localhost:8001/healthz` → 200.
6. Verify auth: `curl http://localhost:8001/categories` → 401 (correct, requires auth).
7. Verify dev_login: `curl -c /tmp/c.txt http://localhost:8001/auth/dev_login` then `curl -b /tmp/c.txt http://localhost:8001/categories` → 9 categories.
8. Inspect DB: `.venv\Scripts\python.exe inspect_db.py`.

---

## 10. Memory pointers

- **Project memory:** `~/.claude/projects/.../memory/projects/academic_dashboard.md`
- **Cross-project lessons** (relevant ones):
  - `lessons/localstorage_default_staleness.md` — bump localStorage keys when changing UI defaults.
  - `lessons/windows_defender_sqlite_lock.md` — Defender holds SQLite files readonly.
  - `lessons/literal_for_closed_ai_outputs.md` — Pydantic Literal for closed AI outputs (session 4 relaxed it for multi-user).
  - `lessons/code_first_then_ai_fallback.md` — build the deterministic code path first.
  - `lessons/multi_axis_priorities.md` — categories AND kinds are independent priority axes.
  - `lessons/todo_vs_event_per_kind.md` — distinguish TODOs from events.
  - `lessons/claude_design_thin_adapter.md` — wrap Claude Design UI in a thin adapter.

End of session 4 handoff.

---

## 11. Session 5 — what changed (2026-04-30)

### New feature: in-app feedback (shipped, verified end-to-end)

Users hit a small floating "💬 משוב" pill at the bottom corner of the dashboard, type Hebrew text, click שלח. Amit reads everything via a single admin endpoint.

**Backend:**
- `db.py` — new `feedback` table: `id`, `user_id` (FK→users ON DELETE CASCADE), `text`, `page`, `created_at`. Index on `created_at DESC`. Idempotent `CREATE IF NOT EXISTS` — existing DBs auto-migrate on next startup. Added `feedback` to `reset_db()` allowed-tables.
- `app.py` — `POST /feedback` (any signed-in user, 4000-char cap, captures `page`) and `GET /admin/feedback` (gated to `user_id == db.OWNER_USER_ID == 1`, JOINs `users` for `email + name`, newest first).

**Frontend:**
- `claude-api.jsx` — `submitFeedback(text, page)` exposed on `window.claudeAPI`. Uses `_fetch` wrapper + `keepalive: true`.
- `App.jsx` — new `FeedbackButton` component rendered as a sibling to `TweaksHost`. Floating pill at `bottom: 20, insetInlineEnd: 20` (visual bottom-LEFT in RTL — opposite the Tweaks cog). Modal with Hebrew textarea, autoFocus, busy/sent/error states, auto-closes on success. Captures `window.location.pathname + window.location.hash` as `page`.

**Verified:** dev-login → POST → GET cycle returns the rows; Hebrew preserved through UTF-8.

**How Amit reads feedback:**
1. Sign in as user 1.
2. Open `http://127.0.0.1:8001/admin/feedback` (or curl with the session cookie).
3. JSON list, newest first, each row has `email`, `name`, `text`, `page`, `created_at`.

### Deploy planning — Render free tier ruled out

Discussed deploy options before publishing. **Render free tier has no persistent disk** — the filesystem is wiped on every spin-down (which happens after 15 min idle). For a SQLite app this means losing all data constantly. Real options remain those in `DEPLOY.md`:
- Path A — Fly.io (~$3-4/mo with 1GB volume).
- Path B — Hetzner CX22 (~$5/mo).
- Or Render Starter w/ disk (~$8/mo) — not in `DEPLOY.md`, but the same shape: `DB_PATH=/var/data/academic.sqlite3`, persistent disk, env vars.
- Oracle Cloud Always Free is the only legit $0 path (real Linux VM with persistent storage; setup work matches Path B).

Migration between hosts later: ~1-2 hr (copy the `.sqlite3` file, set ~6 env vars, add the new redirect URI in Cloud Console). The app is portable Python + SQLite. No vendor lock-in.

### OAuth walkthrough — paused at Step 1

Started walking Amit through Google Cloud Console for the OAuth client. We're paused right at **Step 1**: open https://console.cloud.google.com → New Project → name it `academic-dashboard` → Create → make sure project is selected. Next session: pick up from Step 2.

Confirmed before pausing:
- Amit wants **public sign-in** (anyone with a Google account, not friends-only). So consent screen will be **External + Published**, accepting the "unverified app" yellow warning rather than going through Google's verification process.
- The `allowed_emails` whitelist from `MULTIUSER_PLAN.md` was **never built** — and won't be, given public sign-in. Cost defense becomes a Gemini billing alert (recommended $5/mo cap) instead of a whitelist.
- Redirect URIs can be added to the OAuth client at any time — no need to decide the deploy host before completing Cloud Console. Just register `http://localhost:8001/auth/google/callback` for now and add the prod URL later.

### Carried forward (still pending — confirm at next session start)

- 🔴 **Gemini API key rotation** — still pending from session 2 (key was leaked in chat earlier). Rotate at https://aistudio.google.com/apikey before publish.
- 🔴 **OAuth client registration** — Cloud Console walkthrough paused at Step 1. Resume by reading `OAUTH_SETUP.md` or asking next-session Claude to continue from Step 2.
- 🟡 **Defender exclusion** for `C:\Users\amit shani\academic_dashboard\` — still pending from session 2.
- 🟢 **Deploy host pick** — Fly / Hetzner / Render-paid / Oracle Free. Decide when ready.
- 🟢 **First git commit + private GitHub push** — overdue.

### Server state at end of session

Uvicorn is running locally on `127.0.0.1:8001` from this session. If next session sees the port already bound, kill the listener first:

```bash
PID=$(netstat -ano -p tcp | awk '/127\.0\.0\.1:8001.*LISTENING/ {print $5; exit}')
[ -n "$PID" ] && powershell -Command "Stop-Process -Id $PID -Force"
```

Then restart with the standard command (§5).

### Files changed (session 5)

- `db.py` — `+feedback` table, `+idx_feedback_created`, `+feedback` in `reset_db()`.
- `app.py` — `+POST /feedback`, `+GET /admin/feedback`, `+ADMIN_USER_ID` constant.
- `frontend/src/claude-api.jsx` — `+submitFeedback`, exported on `window.claudeAPI`.
- `frontend/src/App.jsx` — `+FeedbackButton` component, mounted next to `TweaksHost`.

End of session 5 handoff.

---

## 12. Session 6 — what changed (2026-05-04)

### Vite frontend migration — COMPLETE

The old frontend (`frontend/`) served static files from FastAPI with no build step, no HMR, and aggressive browser caching that made changes invisible even in incognito mode. The fix was a full migration to a proper build tool.

**New frontend lives at:** `frontend-vite/`
**Dev server:** `cd frontend-vite && npm run dev` → **http://localhost:5173**
**The old `/app/` endpoint is deprecated.** Use `:5173` for dev going forward.

#### Stack
- **Vite** (build tool + dev server with HMR — changes appear instantly, zero cache issues)
- **React + TypeScript** (strict typed)
- **Tailwind CSS v4** (CSS-first, `@import "tailwindcss"` in `index.css`, no `tailwind.config.js`)
- **shadcn/ui v4** (component library — button, card, badge, input, textarea, dialog, tabs, sonner)
- **Sonner** (toast notifications — replaces the old custom toast)
- **Lucide React** (icons)

#### All components written this session

| File | Description |
|------|-------------|
| `src/App.tsx` | Bootstrap auth gate, LoginScreen (Google + dev picker), main App, SubjectView, EisenhowerView, EmptyState |
| `src/types.ts` | TypeScript interfaces: Task, Category, Pattern, User, CreateTaskOpts |
| `src/lib/api.ts` | Full typed API client (all endpoints) |
| `src/components/CaptureBar.tsx` | Task input — importance/urgency on ONE ROW (the bug from old frontend), due-date picker, classifying shimmer |
| `src/components/TaskCard.tsx` | Task card — done toggle, delete with confirm, edit click, urgency color edge |
| `src/components/EditDialog.tsx` | Importance/urgency override dialog |
| `src/components/FeedbackButton.tsx` | Floating feedback button + modal |
| `src/views/CoursesView.tsx` | Course cards — confidence rating, gap notes debounced save, **keyword editor** (expand → view chips → add/delete) |
| `src/views/ScheduleView.tsx` | Schedule — collapsible course groups, pattern rows (kind/day/time/importance/urgency), add/delete with two-click confirm |
| `src/components/ui/` | shadcn components: button, badge, card, input, textarea, dialog, tabs, separator, sonner |

#### Key config files
- `vite.config.ts` — Tailwind v4 plugin + `@/` path alias + proxy all API paths to `:8001`
- `tsconfig.json` + `tsconfig.app.json` — path alias configured, `ignoreDeprecations: "6.0"` for baseUrl
- `src/index.css` — shadcn CSS variables theme (light/dark), Tailwind v4 import

#### API proxy
All fetch calls in the Vite app go to relative paths (`/tasks`, `/auth/me`, etc.). Vite proxies them to `http://localhost:8001` in dev. In production, the built static files are served by FastAPI directly, so no proxy is needed.

### Bug fixes from previous session

Three bugs were fixed before the Vite migration began:

1. **CaptureBar layout** — importance/urgency buttons were wrapping to two rows. Fixed with `flex-wrap: nowrap` + `flex-shrink: 0` on each axis span. The Vite version has this correct by design.

2. **New-course pipeline** (`test_new_course_pipeline.py`) — classifier returned "כללי" for newly created courses because the course name wasn't in the keyword list yet. Fixed in `app.py`: when a category is created, the course name is prepended to the generated keywords immediately.
   ```python
   kw_str = classifier.generate_keywords(payload.name)
   base_kw = payload.name
   kw_str = f"{base_kw},{kw_str}" if kw_str else base_kw
   # then UPDATE categories SET keywords=? WHERE id=?
   ```

3. **time_travel_test.py** — broke after multi-user refactor because `compute_tasks()` now requires `user_id`. Fixed: `compute.compute_tasks(now, scope=scope, user_id=1)`.

4. **Typo recovery** — "דתס" was classified as "כללי" instead of falling to AI. Root cause: 0 keyword matches returned "כללי" directly, skipping AI. Fix: added `_levenshtein()` + `_fuzzy_course_hit()` to `keyword_classifier.py`. Edit-distance ≤ 1 against course NAME words triggers `return None` (AI fallback) instead of "כללי". "דתס" is edit-distance 1 from "דת" → AI correctly identifies as "דת האסלאם".

5. **Keyword editor** — added to `CoursesView` (both old and new frontend). Users can expand a section on each course card to view, add, and delete the keywords driving the classifier.

### Why you couldn't see changes in the old frontend

The old `frontend/` served JavaScript files via `NoCacheStaticFiles` in FastAPI. In theory this should disable caching. In practice, Chrome's service worker, disk cache, and HTTP/1.1 conditional GET all conspired to serve stale files even in incognito. This is a known class of problem with "vanilla static files with no content hash in filename." The Vite solution is permanent: every build asset has a content hash in the filename (`index-BxK2j9aM.js`), so the browser always fetches the new file.

### Three tasks before deployment

#### 1. Google OAuth (required for real users)
See `OAUTH_SETUP.md`. Paused at Cloud Console Step 1 in session 5. Steps:
- Create OAuth client → add redirect URI `http://localhost:8001/auth/google/callback` for dev, `https://yourdomain.com/auth/google/callback` for prod
- Set `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` in `.env`
- Set `DEV_MODE=0` in production

#### 2. Frontend: build for production
```bash
cd frontend-vite
npm run build   # outputs to frontend-vite/dist/
```

Then in `app.py`, add a mount to serve the Vite dist at the root:
```python
from fastapi.staticfiles import StaticFiles
# Add AFTER all API routes so API routes take precedence:
app.mount("/", StaticFiles(directory="frontend-vite/dist", html=True), name="frontend")
```

The Vite build uses relative paths (`/tasks`, `/auth/me`) which FastAPI already handles — no proxy needed in production.

#### 3. Database: SQLite persistence on deploy
SQLite works fine for low concurrency. Requirement: **persistent disk** at deploy target (not ephemeral). See `DEPLOY.md`. Copy `academic.sqlite3` to the server as part of first deploy.

### How to start dev (updated)

```bash
# Terminal 1 — backend
cd C:\Users\amit shani\academic_dashboard
.venv\Scripts\python.exe -m uvicorn app:app --port 8001

# Terminal 2 — frontend (NEW)
cd C:\Users\amit shani\academic_dashboard\frontend-vite
npm run dev
# Open: http://localhost:5173
```

### Files changed (session 6)

**Backend fixes:**
- `app.py` — prepend course name to keywords on `createCategory`; added "keywords" to `_CATEGORY_FIELDS` PATCH whitelist
- `keyword_classifier.py` — added `_levenshtein()`, `_fuzzy_course_hit()`, fuzzy check before "כללי" fallback
- `models.py` — added `keywords: Optional[str]` to `Category` and `CategoryUpdate`
- `time_travel_test.py` — fixed `compute_tasks(user_id=1)` call

**New Vite frontend (all new):**
- `frontend-vite/` — entire directory, see file table above

End of session 6 handoff.

---

## 13. Session 7 — what changed (2026-05-04)

### Current working state

**The old frontend at http://localhost:8001/app IS the active UI.** The Vite migration (`frontend-vite/`) was built and compiles cleanly but was rejected by the user as too different from the original — missing features, less polished. The Vite project stays for future use but is NOT the primary UI.

### Root cause of "can't see changes" — FIXED

The old frontend uses `@babel/standalone` which compiles JSX in the browser and caches the compiled output in `localStorage` with keys prefixed `babel-`. When the server sends a new `.jsx` file, the browser sometimes served an old HTTP-cached response, Babel saw the same content hash, and returned the old compiled version from localStorage.

**Fix applied to `frontend/index.html`:** Added one inline script that runs before Babel loads, clearing all `babel-*` keys from localStorage on every page load:

```html
<script>Object.keys(localStorage).filter(k=>k.startsWith('babel-')).forEach(k=>localStorage.removeItem(k));</script>
```

This means every reload now gets freshly compiled code. No more cache issues.

Also removed the leftover `?v=2` and `?v=4` query strings from script tags (they were part of a failed cache-busting attempt that created double query strings like `?v=4?ts=...`).

### Features added to old frontend this session

1. **Keyword editor on course cards** (`frontend/src/views/CoursesView.jsx`):
   - Each course card has an expandable keyword section (open by default, `showKw=true`)
   - Shows current keyword chips, each with a × delete button
   - Add new keywords via input + Enter or "הוסף" button
   - Saves to backend immediately on add/delete via PATCH `/categories/{id}`
   - Toggle button styled as a bordered pill, not invisible grey text

2. **CaptureBar one-row layout** (`frontend/src/CaptureBar.jsx`):
   - Importance/urgency buttons stay on one row with `flexWrap: "nowrap"`

3. **Typo recovery** (`keyword_classifier.py`):
   - "דתס" → edit-distance 1 from "דת" → falls to AI, not "כללי"

### What NOT to do next session

- Don't restart the server with `--reload` and no port; use `.venv\Scripts\uvicorn app:app --port 8001`
- Don't add `?v=N` query strings to script tags in index.html — the babel-clear script handles it now
- Don't use the Vite project (`frontend-vite/`) as the active UI without a deliberate decision to redesign

### How to start

```bash
# Backend
cd C:\Users\amit shani\academic_dashboard
.venv\Scripts\uvicorn app:app --port 8001

# Open browser
http://localhost:8001/app
```

The `babel-` cache clear is in `index.html` — no browser tricks needed to see changes.

End of session 7 handoff.

---

## 14. Session 8 — what changed (2026-05-04)

### Root cause fixed: blank page on launch

The app was rendering a blank white page. Root cause: `SubjectChip` in `atoms.jsx` fell back to `window.SUBJECT_META.other` (an English key from the original life_dashboard codebase). That key doesn't exist — this dashboard uses Hebrew course name keys only. Any task whose `category_name` wasn't in the hardcoded `SUBJECT_META` (e.g., a user-created course like "מודיעין נח") caused a React render crash.

**Two-part fix:**

1. `atoms.jsx` — fallback chain: `SUBJECT_META[subject]` → `SUBJECT_META["כללי"]` → generic grey chip with the actual name as label. Unknown courses no longer crash.
2. `App.jsx` + `claude-api.jsx` — on mount, `listTasks` and `listCategories` are fetched in parallel. Each category is registered in `window.SUBJECT_META` (using its `color_dark` field) before tasks render. `createCategory` also registers the new course immediately so no page refresh is needed.

### Hardening session — 6 bugs fixed, benchmarks restored to 28/28

Spawned parallel research agents (backend + frontend) to audit all edge cases. Fixed everything they found.

#### Backend fixes

| File | Line | Bug | Fix |
|------|------|-----|-----|
| `keyword_classifier.py` | 108 | `"את"` (2-char Hebrew direct-object marker) fuzzy-matched `"דת"` with edit-distance 1 → false AI fallback → benchmark 27/28 | Changed input-word min length from 2 → 3. Ref-word min stays at 2 so `"דתס"` → `"דת"` typo detection still works. |
| `compute.py` | 126 | `datetime.fromisoformat(s)` on a malformed DB timestamp crashed `compute_tasks()` → 500 on task load | Wrapped in `try/except (ValueError, TypeError)`, returns `None` on bad value |

#### Frontend fixes

| File | Bug | Fix |
|------|-----|-----|
| `views/HistoryView.jsx` | Hardcoded `http://localhost:8001/history` — breaks on any deployed host; also missing `credentials: "include"` | Dynamic `_HIST_BASE` constant (same pattern as `claude-api.jsx`) + `credentials: "include"` |
| `views/GroupView.jsx` | `meta.color` accessed after `meta?.icon` optional chain — crashes when task category isn't in `SUBJECT_META` (e.g. user-created course) | `meta?.color` with fallback to `"var(--paper-3)"` / `"var(--ink-3)"` |
| `TaskCard.jsx` | `URGENCY_COLOR[task.urgency]` is `undefined` when `urgency` is null → CSS background renders the literal string `"undefined"` | Fallback: `|| "transparent"` |
| `views/CoursesView.jsx` | `saveKeywords` fetch missing `credentials: "include"` — would silently 401 on any cross-origin deploy | Added `credentials: "include"` |

### Benchmark results after fixes

```
benchmark_classifier.py:   28/28  (100%)   ← was 27/28
test_new_course_pipeline.py: PASS
time_travel_test.py:         PASS
```

### Files changed (session 8)

**Backend:**
- `keyword_classifier.py` — fuzzy input-word min length 2 → 3
- `compute.py` — try/except around `fromisoformat`

**Frontend:**
- `frontend/src/atoms.jsx` — `SubjectChip` fallback chain (no `.other`, use `"כללי"` then generic)
- `frontend/src/App.jsx` — parallel `listTasks` + `listCategories` on mount; register categories into `SUBJECT_META`
- `frontend/src/claude-api.jsx` — `createCategory` registers new course in `SUBJECT_META` immediately
- `frontend/src/TaskCard.jsx` — null-safe `urgColor`
- `frontend/src/views/HistoryView.jsx` — dynamic base URL + credentials
- `frontend/src/views/GroupView.jsx` — null-safe `meta.color`
- `frontend/src/views/CoursesView.jsx` — `credentials: "include"` in `saveKeywords`

### How to start (unchanged)

```bash
# Backend
cd C:\Users\amit shani\academic_dashboard
.venv\Scripts\uvicorn app:app --port 8001

# Open browser
http://localhost:8001/app
```

End of session 8 handoff.

---

## 15. Session 9 — what changed (2026-05-05)

### Hebrew onboarding tutorial (new feature)

First-time users now see a 7-step Hebrew modal automatically after tasks load. Returning users get a persistent `?` button at `bottom: 70, insetInlineEnd: 20` (above the Feedback button).

**Implementation:**
- `TUTORIAL_STEPS` constant + `TutorialModal` + `TutorialButton` components in `App.jsx` (after `FeedbackButton`)
- Seen-state tracked via `window.userStorage.get/set("tutorial.v1.seen")` (per-user localStorage, cleared on logout)
- Mount effect checks the flag after tasks load — auto-opens only if unset
- `closeTutorial()` sets the flag and closes; triggered by "דלג" (skip), "סיום" (finish), or backdrop click
- Step dots + "הבא"/"הקודם" navigation; final step shows "סיום"

**Tutorial step order** (intentional — validated by sub-agent):
1. Welcome
2. Courses first (add keywords — without this all tasks land in "כללי" and stay orphaned)
3. Schedule — set up weekly recurring patterns per course
4. Add tasks — now classification works
5. Views — explore different angles
6. Edit tasks — fix misclassifications
7. Done — directs user to "לדשבורד הראשי" (not "לכאן" which was ambiguous)

Icons used: `Book`, `Pencil`, `Layers`, `Calendar`, `Sparkles` — all from the existing `window.Icon` bundle.

### Keyword collapse bars — default closed

`CoursesView.jsx` — `useState(true)` → `useState(false)` for `showKw`. Keyword sections now start collapsed; user expands per course when needed.

### CaptureBar improvements

- **Calendar button** — was a small borderless icon that blended into the bar. Now a pill-shaped button (`var(--paper-2)` background, `var(--line-strong)` border) showing only the icon when no date is set, expanding to show the formatted date (e.g., "5 מאי") with an accent border once a date is picked.
- **`datetime-local` input** — was completely unstyled (raw browser default). Now has matching padding, rounded border, `var(--paper-2)` background, and `colorScheme` that respects light/dark theme.

### UI hardening (agent-driven audit)

5 bugs/issues found and fixed across the codebase:

| File | Issue | Fix |
|------|-------|-----|
| `App.jsx` ~line 999 | **Bug:** Duplicate `style` prop on "פתח היסטוריה" button — second prop silently overwrote border + padding from first | Merged into single `style` object |
| `App.jsx` brand bar | `paddingTop: 32` created excessive top whitespace | `32 → 20`, `paddingBottom: 18 → 14` |
| `App.jsx` footer | Keyboard shortcut bar always rendered, even with zero tasks | Wrapped in `{tasks.length > 0 && ...}` |
| `TaskCard.jsx` step list | Top padding `2px` vs bottom `10px` — lopsided gap between header and first step | `"2px 12px 10px" → "8px 12px 10px"` |
| `CoursesView.jsx` | "אין מילות מפתח" rendered even when keyword section was collapsed | Added `&& showKw` guard |

### Files changed (session 9)

- `frontend/src/App.jsx` — tutorial state + components, `closeTutorial`, history button style fix, brand bar padding, footer conditional
- `frontend/src/views/CoursesView.jsx` — `showKw` default `false`, "אין מילות מפתח" conditional on `showKw`
- `frontend/src/CaptureBar.jsx` — calendar button redesign, `datetime-local` input styling
- `frontend/src/TaskCard.jsx` — steps list top padding fix

### How to start (unchanged)

```bash
# Backend
cd C:\Users\amit shani\academic_dashboard
.venv\Scripts\uvicorn app:app --port 8001

# Open browser
http://localhost:8001/app
```

End of session 9 handoff.
