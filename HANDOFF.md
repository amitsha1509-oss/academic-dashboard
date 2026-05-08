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

---

## 16. Session 10 — what changed (2026-05-05)

### Production deployment on Railway — LIVE

**Production URL:** `https://academic-dashboard-production-d0d5.up.railway.app`

Railway was chosen over Render (~$25/mo with disk) because it's usage-based (~$5/mo free trial then cheap).

#### Infrastructure

| What | Where | Notes |
|------|-------|-------|
| Platform | Railway | `railway.toml` in project root |
| Builder | Custom Dockerfile | Nixpacks v1.41 had a blank-ENV bug; Dockerfile is stable |
| Persistent volume | `/var/data/` | Mounted by Railway. DB lives at `/var/data/academic.sqlite3` |
| DB_PATH env var | `/var/data/academic.sqlite3` | Set in Railway dashboard |
| PORT | Set by Railway | Dockerfile CMD uses `${PORT:-8000}` |

#### Files added this session

| File | Purpose |
|------|---------|
| `Dockerfile` | `python:3.10-slim`, pip install, COPY, uvicorn CMD |
| `railway.toml` | `builder=DOCKERFILE`, `healthcheckPath=/healthz`, `restartPolicyType=ON_FAILURE` |
| `Procfile` | Fallback for platforms that use it |
| `.railwayignore` | Prevents `.env`, `*.sqlite3`, `node_modules/` etc. from being uploaded |
| `render.yaml` | Not used (created during Render evaluation, kept for reference) |
| `runtime.txt` | Python version pin (Render fallback) |

#### How to deploy

```powershell
# From project root, after railway login:
railway up --detach
```

This uploads code directly from your machine (bypasses GitHub auto-deploy). `--detach` returns immediately after upload; build runs in Railway cloud. Build URL is printed — open it to watch logs.

**Do NOT use "Redeploy" in the Railway UI.** It reuses the old build snapshot. Always `railway up`.

#### Env vars in Railway

All set via `railway variables set "KEY=VALUE"`. Current vars:
- `DB_PATH=/var/data/academic.sqlite3`
- `BASE_URL=https://academic-dashboard-production-d0d5.up.railway.app`
- `GOOGLE_OAUTH_CLIENT_ID=...` (the real production client)
- `GOOGLE_OAUTH_CLIENT_SECRET=...`
- `SESSION_SECRET=...`
- `GROQ_API_KEY=...`
- `DEV_MODE=0` (implicit — not set = 0)
- `RESTORE_SECRET=nucleus-restore-2026` ← **DELETE THIS after uploading the DB** (see §DB upload below)

---

### Google OAuth — WORKING in production

Sign in with Google works at the production URL. Client ID set correctly via Railway CLI (not the Railway dashboard text field which adds a `%0A` newline).

**Footgun discovered:** The Railway dashboard's env var text field appends a newline (`%0A`) to pasted values. Always use `railway variables set "KEY=VALUE"` from the CLI, never paste into the dashboard.

---

### Daily automated backups — ACTIVE

`APScheduler` runs in the FastAPI process and creates `backups/academic-YYYY-MM-DD.sqlite3` every 24h (also on startup). Keeps the 7 most recent. Stored at `/var/data/backups/`.

**Admin endpoints (admin = user_id 1, i.e., Amit):**

| Endpoint | What |
|----------|------|
| `GET /admin/db-backup` | Download the live DB as a file |
| `GET /admin/backups` | List all daily backups (name + size) |
| `GET /admin/backups/{filename}` | Download a specific daily backup |

To manually download the production DB: sign in, then open `https://academic-dashboard-production-d0d5.up.railway.app/admin/db-backup` in the browser.

---

### Frontend fix — Vite frontend now served in production

**Root cause of English categories / "additional steps" bugs:** Production was serving the OLD babel frontend (`frontend/`) which had a mock English classifier (subjects: "university", "friends", "money", etc.) and a `next_steps` feature. The new Vite frontend (`frontend-vite/dist/`) was built but never wired up.

**Fix:** 1 line in `app.py` — `FRONTEND_DIR` now points to `frontend-vite/dist` if it exists, otherwise falls back to `frontend/`.

**The Vite frontend IS the production UI.** The old `frontend/` is still on disk but is ignored in production (Vite dist takes priority).

**New user UX:** When a new user adds a task before creating any courses, they now get a Hebrew error toast with a "לקורסים ←" action button that navigates them to the Courses tab. (Before: old frontend silently created English-named task subjects.)

---

### DB upload — NEEDS RE-UPLOAD ⚠️

The DB was uploaded during this session but landed in `/app/academic.sqlite3` (ephemeral) instead of `/var/data/academic.sqlite3` (persistent volume). This was a DB_PATH env var pickup issue.

**Fix deployed:** `db.py` now also checks `RAILWAY_VOLUME_MOUNT_PATH` (auto-set by Railway when a volume is attached) as a second fallback, so it will always find the persistent volume even if `DB_PATH` env var has issues.

**After the current build finishes, re-upload your DB:**

```powershell
$bytes = [System.IO.File]::ReadAllBytes("C:\Users\amit shani\academic_dashboard\academic.sqlite3")
Invoke-WebRequest `
  -Uri "https://academic-dashboard-production-d0d5.up.railway.app/admin/db-restore" `
  -Method POST `
  -Headers @{ "x-restore-secret" = "nucleus-restore-2026" } `
  -Body $bytes `
  -ContentType "application/octet-stream" `
  -UseBasicParsing
```

Expected response: `{"wrote_bytes": 98304, "path": "/var/data/academic.sqlite3"}`

If path is still `/app/academic.sqlite3`: contact next Claude session to investigate why RAILWAY_VOLUME_MOUNT_PATH isn't set.

After successful upload:
1. Sign in → verify your courses appear
2. **Delete the RESTORE_SECRET env var:**
   ```powershell
   railway variables delete RESTORE_SECRET
   ```
   (Endpoint becomes permanently forbidden — no redeploy needed.)

---

### How to start locally (UPDATED)

The active local UI is still the OLD frontend at `/app/`. The Vite build is production-only.

```powershell
# Backend
cd "C:\Users\amit shani\academic_dashboard"
.venv\Scripts\python.exe -m uvicorn app:app --port 8001

# Open browser
http://localhost:8001/app
```

For Vite dev (if working on frontend code):
```powershell
cd "C:\Users\amit shani\academic_dashboard\frontend-vite"
npm run dev
# Open: http://localhost:5173
```

### Files changed (session 10)

- `app.py`
  - `+import os`
  - `FRONTEND_DIR` now points to `frontend-vite/dist` if it exists (serves Vite in production)
  - `+POST /admin/db-restore` temporary endpoint (protected by `RESTORE_SECRET` env var)
  - `+_backup_db()` + APScheduler daily backup
  - `+GET /admin/db-backup`, `+GET /admin/backups`, `+GET /admin/backups/{filename}`
- `requirements.txt` — `+apscheduler==3.10.4`
- `frontend-vite/src/App.tsx` — no-courses error toast now has "לקורסים ←" action button
- `frontend-vite/dist/` — rebuilt with the above change
- `Dockerfile`, `railway.toml`, `Procfile`, `.railwayignore` — new deploy files
- `.gitignore` — `+backups/`
- `runtime.txt` — new

### Open items after this session

- ⚠️ **Upload local DB to Railway** (see DB upload steps above) — Amit's courses/tasks not visible in production yet
- ⚠️ **Delete RESTORE_SECRET** from Railway after DB upload
- 🟡 **Rebuild Vite and redeploy if changing frontend** — the Vite build in `dist/` is what production serves; local `frontend/` changes don't affect production
- 🟢 Consider eventually migrating local dev to Vite too (currently using old `frontend/` locally)

End of session 10 handoff.

---

## 17. Session 11 — what changed (2026-05-05)

### Blank white page on local — fixed

**Root cause:** `app.py` preferred `frontend-vite/dist/` over `frontend/` whenever the dist folder existed. The Vite build's `index.html` uses absolute asset paths (`/assets/index-B8jcSqeg.js`) which 404 when served from the `/app` sub-path. Result: HTML loads, JS never loads, blank page.

**Fix:** `FRONTEND_DIR` is now hardcoded to `frontend/` (the active Babel-in-browser frontend). The Vite dist is still on disk for production deploys but is no longer auto-preferred locally.

**Also fixed:** `restart_server.ps1` has a latent bug — `$pid` is a reserved read-only variable in PowerShell 5.1. The script fails silently when run directly. Workaround: run the same logic manually using a different variable name (e.g. `$proc`).

### Three state management bugs fixed

All three were caused by hardcoded or stale global state that didn't reflect the live backend.

#### Bug 1 — New courses invisible in "לפי קורס" and EditDialog

**Root cause:** `window.DIMENSIONS.subject` was set from the hardcoded list in `data.jsx` (9 fixed courses) and never updated from the API. `GroupView` uses `window.DIMENSIONS[groupBy]` to build its ordered group list, so new courses simply never appeared. `EditDialog` uses the same global to render the subject picker.

**Fix (3 files):**
- `claude-api.jsx` `listCategories()` — now sets `window.DIMENSIONS.subject = cats.map(c => c.name)` and populates a new module-level `_catNameToId` map (`name → id`) after every fetch.
- `claude-api.jsx` `createCategory()` — also appends the new course to `window.DIMENSIONS.subject` immediately (so GroupView sees it on next tab switch without a page reload).
- `App.jsx` mount effect — also sets `window.DIMENSIONS.subject = cats.map(c => c.name)` after the parallel `listCategories` fetch, ensuring the list is correct from first render.

#### Bug 2 — Course changes not persisted after EditDialog save

**Root cause:** `_toBackPatch` in `claude-api.jsx` had no mapping for the `subject` field. Edits to a task's course were applied to local React state (`setTasks(...)`) but never sent to the backend. After a page refresh the task reverted to the original course.

**Fix (2 files):**
- `claude-api.jsx` `_toBackPatch()` — added `subject → category_id` mapping using the `_catNameToId` map (populated by `listCategories` / `createCategory` above).
- `models.py` `TaskUpdate` — added `category_id: Optional[int] = None`.
- `app.py` `_TASK_UPDATE_COLUMNS` — added `"category_id"`.

The backend PATCH handler already does a generic `UPDATE adhoc_tasks SET {fields}` so no additional backend logic was needed once the column was whitelisted.

#### Bug 3 — Task text (raw_text) not editable

**Root cause:** `EditDialog` displayed `raw_text` in a read-only `AutoDirText` block. `handleSaveEdit` in `App.jsx` explicitly stripped `raw_text` from the patch payload. Backend `TaskUpdate` had no `title` field and `_TASK_UPDATE_COLUMNS` didn't include it.

**Fix (4 files):**
- `EditDialog.jsx` — replaced the `<window.AutoDirText>` block with an editable `<textarea>` that updates `draft.raw_text` on change.
- `App.jsx` `handleSaveEdit` — removed `raw_text` from the destructuring exclusion list so it flows through to `patchTask`.
- `claude-api.jsx` `_toBackPatch()` — added `raw_text → title` mapping.
- `models.py` `TaskUpdate` — added `title: Optional[str] = None`.
- `app.py` `_TASK_UPDATE_COLUMNS` — added `"title"`.

#### What is NOT a bug (keyword re-classification)

Adding a keyword to a course does not re-classify existing tasks. Classification runs once at task creation. This is by design. If you want existing "כללי" tasks to be re-classified after adding keywords, a "re-classify all" button would be needed — that's a new feature, not something in scope yet.

### How to start locally (unchanged)

```powershell
# Start backend (kills old process on 8001 first):
$proc = (Get-NetTCPConnection -LocalPort 8001 -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess
if ($proc) { Stop-Process -Id $proc -Force; Start-Sleep -Seconds 1 }
$uvicorn = "C:\Users\amit shani\academic_dashboard\.venv\Scripts\uvicorn.exe"
Start-Process -FilePath $uvicorn -ArgumentList "app:app","--reload","--port","8001" -WorkingDirectory "C:\Users\amit shani\academic_dashboard" -WindowStyle Hidden
Start-Sleep -Seconds 4
(Invoke-WebRequest -Uri "http://localhost:8001/healthz" -UseBasicParsing).Content
# Open browser → http://localhost:8001/app
```

(Do NOT use `restart_server.ps1` directly — it uses `$pid` which is read-only in PowerShell 5.1.)

### Files changed (session 11)

- `app.py` — `FRONTEND_DIR` hardcoded to `frontend/`; `_TASK_UPDATE_COLUMNS` + `"title"` + `"category_id"`
- `models.py` — `TaskUpdate` + `title: Optional[str]` + `category_id: Optional[int]`
- `frontend/src/claude-api.jsx` — `_catNameToId` map; `listCategories` populates map + `DIMENSIONS.subject`; `createCategory` updates both; `_toBackPatch` handles `raw_text → title` and `subject → category_id`
- `frontend/src/App.jsx` — mount effect sets `window.DIMENSIONS.subject`; `handleSaveEdit` no longer strips `raw_text`
- `frontend/src/EditDialog.jsx` — `raw_text` now an editable textarea

### Open items (carry forward)

- ⚠️ **Upload local DB to Railway** (from session 10 — if not done yet)
- ⚠️ **Delete RESTORE_SECRET** from Railway after DB upload
- 🔴 **Gemini/Groq API key rotation** — key was leaked in early chat. Rotate before real users.
- 🔴 **`restart_server.ps1` has a bug** — `$pid` is reserved in PowerShell 5.1. Either fix it (rename variable) or stop using it.
- 🟡 **Defender exclusion** for project folder — SQLite lock risk on Windows.
- 🟢 **Re-classify feature** — "re-classify all tasks using current keywords" button in CoursesView.

End of session 11 handoff.

---

## 18. Session 12 — what changed (2026-05-06)

### How to start locally (unchanged)

```powershell
$proc = (Get-NetTCPConnection -LocalPort 8001 -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess
if ($proc) { Stop-Process -Id $proc -Force; Start-Sleep -Seconds 1 }
$uvicorn = "C:\Users\amit shani\academic_dashboard\.venv\Scripts\uvicorn.exe"
Start-Process -FilePath $uvicorn -ArgumentList "app:app","--reload","--port","8001" -WorkingDirectory "C:\Users\amit shani\academic_dashboard" -WindowStyle Hidden
Start-Sleep -Seconds 4
(Invoke-WebRequest -Uri "http://localhost:8001/healthz" -UseBasicParsing).Content
# Open browser → http://localhost:8001/app
```

### All session 8–12 changes are uncommitted

Everything since "initial commit - deploy ready" (git HEAD, May 5 11:35) lives only in the working tree. No new commit has been made. Run `git status` to see the full list (18 modified files + 1 deleted).

---

### Additional hardening not explicitly listed in sessions 8–11

These changes exist in the working tree but were not called out in the session notes:

#### auth.py — auto-create "כללי" for new users
`find_or_create_user()` now inserts a "כללי" category immediately after creating a new account. Users can capture tasks on day 1 without going to Courses first.

#### classifier.py — malformed Groq JSON handled gracefully
- `classify()`: malformed JSON raises `RuntimeError` (caught in `app.py` as 502) instead of crashing the process.
- `derive_priorities()`: malformed JSON returns `{"categories": [], "kinds": []}` instead of raising.

#### app.py — category name validation + category fallback
- `create_category`: strips whitespace from name, rejects empty string (400).
- `capture_task`: if Groq hallucinates a category not in the user's list, falls back to the user's first category + prints a `[WARN]` log instead of 500-ing.
- `capture_task`: `RuntimeError` from `classifier.classify()` is now caught and returned as 502.

#### app.py — recurring task PATCH hardened
- New `_COMPLETION_UPDATE_COLUMNS` constant (subset without `title`/`category_id`).
- Recurring task PATCH now correctly routes: completion-level fields go to `completions`, pattern-level fields (title/category_id) are rejected with a 400 explaining they can't be changed per-occurrence.
- `_parse_task_id` now wraps the int cast in try/except so a malformed id returns a clean 400.

#### claude-api.jsx — `deleteCategory` cleanup
`deleteCategory()` now immediately removes the deleted course from `_catNameToId` and `window.DIMENSIONS.subject` so stale entries can't corrupt future PATCHes or appear in EditDialog.

#### claude-api.jsx — `_levelToScale` change
`_levelToScale("medium")` now returns 3 (was 2). This only affects the offline heuristic fallback — the backend always stores the real importance/urgency.

#### App.jsx — offline task id
Offline (backend-down) task ids now use the string `"offline:" + Date.now()` instead of `Math.max(...) + 1`, which could collide with real server ids.

#### SuggestionsPanel.jsx — deleted
The 272-line AI suggestions panel ("suggest new dimensions", "suggest connections") was removed. These were life_dashboard leftovers that don't apply to the academic dashboard's closed-category model. `suggestDimensions` and `suggestConnections` stubs remain in `claude-api.jsx` (return empty) but are no longer exported on `window.claudeAPI` and the panel is gone from `App.jsx` (replaced with a comment).

#### db.py — RAILWAY_VOLUME_MOUNT_PATH fallback
`DB_PATH` now also checks `RAILWAY_VOLUME_MOUNT_PATH` (auto-set by Railway when a volume is attached) as a second fallback so the DB always lands on the persistent volume even if `DB_PATH` env var is missing.

---

### In-progress feature: bi-weekly recurring patterns

**Goal:** let a user mark a recurring pattern as "every week" / "bi-weekly A (odd weeks)" / "bi-weekly B (even weeks)".

#### What's already done

| Layer | Status |
|-------|--------|
| DB: `weeks_active TEXT DEFAULT '[1,2,3,4,5,6,7,8,9,10,11,12,13]'` in `recurring_patterns` | ✅ committed in initial commit |
| `compute.py`: `occurrence_dates()` reads `weeks_active` JSON and only yields weeks in the list | ✅ |
| `models.py`: `PatternUpdate.weeks_active: Optional[str]` and `PatternCreate.weeks_active: str` | ✅ uncommitted |
| `app.py`: `weeks_active` in `_PATTERN_FIELDS` PATCH whitelist | ✅ uncommitted |
| `ScheduleView.jsx`: `FrequencyPicker` component, `_detectFreq`, `_ALL_WEEKS`/`_ODD_WEEKS`/`_EVEN_WEEKS` constants | ✅ uncommitted |
| `i18n.jsx`: `schFrequency`, `schEveryWeek`, `schBiweeklyA`, `schBiweeklyB` (Hebrew only) | ✅ uncommitted |

#### What's still missing (the thing we stopped in the middle of)

1. **`PatternRow`** — `FrequencyPicker` is not rendered. The bottom row (importance / urgency / is_required / delete) needs a `<FrequencyPicker>` that calls `immediatePatch({ weeks_active: json })`.
2. **`NewPatternForm`** — draft state has no `weeks_active` field (defaults to the backend default `_ALL_WEEKS` = every week). The form needs `weeks_active: _ALL_WEEKS` in initial `useState` and a `<FrequencyPicker>` in the bottom row.

Both changes are in `frontend/src/views/ScheduleView.jsx` only. No backend changes needed.

#### Exact wiring needed

**In `PatternRow`** — inside the bottom `<div>` that holds BinaryPicker + is_required + delete, add:
```jsx
<FrequencyPicker
  weeksActive={pattern.weeks_active}
  onChange={(json) => immediatePatch({ weeks_active: json })}
/>
```

**In `NewPatternForm`** — add `weeks_active: _ALL_WEEKS` to initial `useState`, then in the bottom `<div>`:
```jsx
<FrequencyPicker
  weeksActive={draft.weeks_active}
  onChange={(json) => set({ weeks_active: json })}
/>
```

---

### Files changed (session 12 — uncommitted)

Beyond what sessions 8–11 described, the working tree additionally contains:

- `auth.py` — auto-create "כללי" on new user signup
- `classifier.py` — malformed JSON error handling in `classify()` and `derive_priorities()`
- `app.py` — category name validation, category fallback in capture_task, RuntimeError catch, `_COMPLETION_UPDATE_COLUMNS`, improved `_parse_task_id`
- `db.py` — `RAILWAY_VOLUME_MOUNT_PATH` fallback for DB_PATH
- `frontend/src/App.jsx` — `noCourses` state, DIMENSIONS.subject set on mount, offline id fix, SuggestionsPanel comment
- `frontend/src/claude-api.jsx` — `_catNameToId`, improved `listCategories`/`createCategory`/`deleteCategory`, `_levelToScale` fix, `_toBackPatch` handles raw_text/subject, suggestDimensions/suggestConnections removed from window.claudeAPI
- `frontend/src/i18n.jsx` — suggestions strings removed, subject/context translations removed, frequency picker strings added
- `frontend/src/views/ScheduleView.jsx` — `FrequencyPicker` component + constants (NOT YET wired into PatternRow / NewPatternForm)
- `frontend/src/data.jsx` — hardcoded English categories removed
- `frontend/src/SuggestionsPanel.jsx` — **DELETED**
- `models.py` — `PatternUpdate.weeks_active`, `PatternCreate.weeks_active`, `TaskUpdate.title`, `TaskUpdate.category_id`
- `HANDOFF.md` — this file (sessions 8–12)

### Open items (carry forward)

- 🔴 **NEXT: wire FrequencyPicker into PatternRow + NewPatternForm** (ScheduleView.jsx only — see exact wiring above)
- ⚠️ **Upload local DB to Railway** (from session 10 — confirm if done)
- ⚠️ **Delete RESTORE_SECRET** from Railway env vars if not already done
- 🔴 **Groq API key rotation** — key was leaked in early chat. Rotate before real users.
- 🟡 **Defender exclusion** for `C:\Users\amit shani\academic_dashboard\` — SQLite lock risk on Windows.
- 🟢 **Commit all uncommitted changes** — 18 files, all sessions since "initial commit - deploy ready".
- 🟢 **Re-classify feature** — "re-classify all tasks using current keywords" button in CoursesView.

End of session 12 handoff.

---

## Session 13 — Font / UI polish + Onboarding wizard + Admin view

### What was done

#### UI polish (local only)
- **Font**: Added "Assistant" to Google Fonts + CSS font stack (LTR and RTL). May look similar to Heebo — verify in browser computed styles.
- **De-italicized** the entire UI: removed `fontStyle: "italic"` from App.jsx (brand, date, tagline), EditDialog title, AgendaView bucket headers, EisenhowerView quadrant titles, CalendarView month label, AllView empty state, TaskCard side-steps, CoursesView description, ScheduleView empty state, CaptureBar thinking indicator, login title.
- **Tutorial redesign**: 7 steps → 4 steps. Non-blocking floating card (no full-screen overlay). Each step highlights the relevant UI element via `data-tutorial-id` + `.tutorial-glow` CSS class (pulsing accent ring). Step 3 clearly distinguishes one-time tasks (capture bar) vs recurring (מערכת שעות). Tutorial auto-skipped after onboarding completes.
- **ScheduleView HW fields**: Applied the "📅 מתי מתפרסם / ⏰ מתי להגיש" two-row layout to **both** `PatternRow` and `NewPatternForm` (PatternRow was done in session 12; NewPatternForm was the remaining piece).
- **FrequencyPicker**: Already wired in session 12 — confirmed done.
- **CoursesView**: "✏️ ערוך שם וצבע" edit panel added to CourseCard (done in session 12, confirmed).

#### Onboarding wizard — `frontend/src/OnboardingWizard.jsx` (new file)
Multi-step wizard shown to new users (no courses, `onboarding.v1.done` not set in userStorage) immediately after OAuth login.

**Flow:** Welcome (marketing copy) → Add Courses (name + color picker) → Add Recurring Schedule (course + kind + day + time) → Save → Dashboard.

**Key implementation details:**
- Triggered in `App.jsx`: `cats.length === 0 && !window.userStorage.get("onboarding.v1.done")` → `setShowOnboarding(true)`.
- On complete/skip: sets `onboarding.v1.done = true` AND `tutorial.v1.seen = true` (so tutorial doesn't auto-open right after).
- `onComplete` callback in App.jsx refreshes `listCategories()` and updates `SUBJECT_META` + `DIMENSIONS.subject`.
- Days use `DayOfWeek` strings (`"Sun"`, `"Mon"` etc.) — NOT integers. This was a bug found and fixed.
- Patterns: only `category_id`, `kind`, `label`, `day_of_week`, `start_time`, `is_required` are sent (no extra null fields).
- "🎓 הגדרה מחדש" button added to TweaksHost (settings panel) so user can re-open onboarding without clearing localStorage manually.

**Known issues / NOT hardened:**
- ⚠️ **No validation** on courses step: user can advance with a course name that is just whitespace (filtered in `validCourses` but UX doesn't warn).
- ⚠️ **No error recovery UI** on the courses step (only on save step). If `createCategory` fails mid-loop, partial courses are created and the user sees a generic error.
- ⚠️ **"הגדרה מחדש" button placement** is awkward — sits next to the logout button in the user section of settings. Should be a separate section or labeled more clearly (e.g. "הגדרת קורסים").
- ⚠️ **Onboarding re-open is not clean**: clicking "הגדרה מחדש" when user already has courses will show the wizard but saving will try to re-create courses that already exist → likely 409 conflict from backend. Needs a guard (check if name already exists, skip or patch instead).
- ⚠️ **No loading skeleton** — wizard shows blank during auth check before `showOnboarding` is set.

#### Admin view — `frontend/src/views/AdminView.jsx` (new file)
Localhost-only tab ("⚙️ Admin") that calls Railway production API directly to show all users + stats.

**Backend**: `GET /admin/overview` added to `app.py`, protected by `ADMIN_USER_ID` (user_id=1). Returns all users with `course_count`, `pattern_count`, `tasks_open`, `tasks_done`.

**Frontend**: calls `https://academic-dashboard-production-d0d5.up.railway.app/admin/overview` with `credentials: "include"`. Tab only visible when `_IS_LOCAL` (localhost/127.0.0.1).

**Known issues — Admin view does NOT work yet:**
- ⚠️ **CORS / cookie mismatch**: the Railway session cookie is `SameSite=Lax` on the Railway domain. A cross-origin fetch from `localhost:8001` to the Railway URL may not send the cookie correctly, causing a 401/403. Needs testing. Fix: either (a) open Railway URL first to ensure cookie exists and browser sends it cross-origin, or (b) add a proxy endpoint on the local backend that forwards to Railway.
- ⚠️ **User must be logged in to Railway** (not just localhost) for the cookie to be valid. If local and Railway use different Google OAuth client IDs, the sessions are separate — local login ≠ Railway login.
- ⚠️ **`Settings` icon** was used as fallback after `Shield` icon crashed the app (Shield doesn't exist in `frontend/src/icons.jsx`). Verify the icon looks acceptable.
- ⚠️ **No drill-down**: only aggregate stats. No way to see individual user's tasks/courses from the admin view.

### Files changed this session
- `frontend/index.html` — Assistant font, tutorial-glow keyframes, AdminView + OnboardingWizard script tags
- `frontend/src/App.jsx` — de-italic, admin tab, `_IS_LOCAL`, `showOnboarding` state, `onOpenOnboarding` prop, TweaksHost "הגדרה מחדש" button, tutorial 4 steps, AdminView in renderView
- `frontend/src/i18n.jsx` — `viewAdmin` string added
- `frontend/src/OnboardingWizard.jsx` — **NEW** (full onboarding wizard)
- `frontend/src/views/AdminView.jsx` — **NEW** (admin table)
- `frontend/src/EditDialog.jsx` — de-italic
- `frontend/src/TaskCard.jsx` — de-italic
- `frontend/src/CaptureBar.jsx` — de-italic
- `frontend/src/views/AgendaView.jsx` — de-italic
- `frontend/src/views/AllView.jsx` — de-italic
- `frontend/src/views/CalendarView.jsx` — de-italic
- `frontend/src/views/CoursesView.jsx` — de-italic
- `frontend/src/views/EisenhowerView.jsx` — de-italic
- `frontend/src/views/ScheduleView.jsx` — NewPatternForm HW fields restructured
- `app.py` — `GET /admin/overview` endpoint added

### Open items (carry forward)
- 🔴 **Admin view broken** — CORS/cookie issue when calling Railway from localhost. See known issues above.
- 🔴 **Onboarding "הגדרה מחדש" + existing courses** — re-opening wizard when courses exist will fail on save (duplicate name). Need to skip already-existing courses or show a different flow.
- 🟡 **Onboarding UX hardening** — add input validation, better error messages, handle partial failures.
- 🟡 **"הגדרה מחדש" button placement** — move out of user section, label more clearly.
- 🔴 **Groq API key rotation** — leaked in early chat. Rotate before real users.
- 🟡 **Commit all uncommitted changes** — 24+ files since "initial commit - deploy ready".
- 🟢 **Re-classify feature** — "re-classify all tasks using current keywords" button in CoursesView.
- 🟡 **Defender exclusion** for project folder — SQLite lock risk on Windows.

End of session 13 handoff.

---

## Session 14 — Bug fixes + known issues documented (2026-05-08)

### 4 bugs fixed

#### Fix 1 — EditDialog: free-form course creation removed

**File:** `frontend/src/EditDialog.jsx`

`extensible = (dim === "subject")` → `extensible = false`.

The `+ חדש` button in the subject field let users type an arbitrary course name into a task's subject. The string was stored in React state but could never be persisted — `_toBackPatch` needs a category_id which only exists for courses that were properly created. Saving with a free-form subject silently dropped the change after the API call.

**Fix:** Closed the field entirely. Subject editing is now limited to the existing course list (same as importance/urgency).

---

#### Fix 2 — OnboardingWizard: skip createCategory for already-existing courses

**File:** `frontend/src/OnboardingWizard.jsx`

**Problem:** Clicking "🎓 הגדרה מחדש" opened the wizard; pressing Save called `createCategory` for every course even if it already existed → 409 conflict → wizard showed generic save error and left courses in a half-created state.

**Fix:** At the start of `save()`, call `listCategories()` and build an `existingByName` map (name.toLowerCase() → id). In the course loop, skip `createCategory` and reuse the existing id if the name is already there.

Also improved the error message: `409` in the error string → shows "קורס עם שם זה כבר קיים" instead of a raw fetch error.

---

#### Fix 3 — ScheduleView: new course created here unlocks CaptureBar

**Files:** `frontend/src/views/ScheduleView.jsx`, `frontend/src/App.jsx`

**Problem:** Adding a course via the ScheduleView's "+ קורס חדש" form did not call back to App.jsx, so `noCourses` stayed `true` and the CaptureBar remained locked even though the backend already had the course.

**Fix:**
- `ScheduleView` function signature: `function ScheduleView({ onCoursesChanged } = {})`
- `handleCreateCourse`: calls `onCoursesChanged?.()` after `setAddingCourse(false)` on success
- `App.jsx` schedule case: `<window.ScheduleView onCoursesChanged={() => setNoCourses(false)} />`

---

### Known issues NOT fixed this session (documented for next session)

#### Issue A — Stale `_catNameToId` after course rename

**Where:** `frontend/src/claude-api.jsx`, `frontend/src/views/CoursesView.jsx`

`_catNameToId` is a module-level map (name → id). It's populated by `listCategories()` and `createCategory()`. Course rename is handled by `CoursesView`'s `handleNameSave`, which PATCHes the backend but never updates `_catNameToId`. If a user renames a course and then edits a task's subject field, the EditDialog still shows the old name as an option (from `window.DIMENSIONS.subject`), and `_toBackPatch` would look up the old name which no longer maps to anything → category_id = undefined → PATCH silently fails.

**When does it trigger:** Only after a course rename. In current usage this is rare, but it's a correctness hole.

**Suggested fix:** In `CoursesView.jsx` `handleNameSave`, after a successful PATCH:
1. Remove old name from `_catNameToId` (need to expose a `window.claudeAPI.renameCategoryLocal(oldName, newName, id)` helper, or just call `listCategories()` to refresh the whole map).
2. Update `window.DIMENSIONS.subject` to replace the old name with the new name.

Easiest safe fix: call `window.claudeAPI.listCategories()` after each successful name PATCH — it refreshes both `_catNameToId` and `DIMENSIONS.subject` atomically.

---

#### Issue B — Admin view CORS/cookie problem

**Where:** `frontend/src/views/AdminView.jsx`

The admin view calls `https://academic-dashboard-production-d0d5.up.railway.app/admin/overview` from localhost. This is a cross-origin fetch. The Railway session cookie (`SameSite=Lax`) is NOT sent on cross-origin requests to a different domain, causing a 401.

**Fix options (pick one):**
1. **Proxy approach (recommended):** Add a `/admin/proxy-overview` endpoint to the local FastAPI server that reads the Railway URL and `RAILWAY_ADMIN_TOKEN` from env, makes a server-side HTTP call to Railway with an auth header, and returns the result. No cookie issues.
2. **Same-origin approach:** Navigate to the Railway production URL in the browser, sign in there, then the session cookie is scoped to that domain and the request works — but this means the admin tab only works from the Railway URL, not localhost.

---

#### Issue C — Classifier: same-keyword edge case

**Where:** `keyword_classifier.py`

If two courses share the same keyword (e.g. both "חשבון" and "אנליזה" have the keyword "גבולות"), the classifier returns the first course that matches, not necessarily the correct one. There is no disambiguation.

**Suggested hardening:**
1. **At keyword creation time** (when user adds a keyword to a course): check all other courses for the same keyword and warn in the UI.
2. **At classify time:** when multiple courses match with equal keyword-hit counts, fall through to AI with the candidate list provided as context.

---

#### Issue D — AI classifier: give it the closed course list

**Where:** `classifier.py` → `classify()`

The Groq AI fallback currently gets the user's category list as valid options, but the prompt does not strongly enforce the closed-list constraint. Result: the AI occasionally invents a category not in the list. `app.py` catches this and falls back to the first category, but the wrong fallback is silent.

**Suggested fix:** In `classify()`, validate the returned `category` against `user_categories` *inside* `classifier.py` (before returning) and raise `ValueError` if it's not in the list. The caller in `app.py` can then retry once with a stricter prompt or fall to first category.

---

### Open items (updated)

- 🔴 **Admin view broken** — CORS/cookie issue. Use proxy approach (Issue B above).
- 🔴 **Stale `_catNameToId` after rename** — call `listCategories()` in CoursesView after name PATCH (Issue A above).
- 🟡 **Classifier: same-keyword edge case** — warn on duplicate keyword add (Issue C above).
- 🟡 **Classifier: AI not strictly respecting closed list** — validate + retry in classifier.py (Issue D above).
- 🔴 **Groq API key rotation** — leaked in early chat. Rotate before real users.
- 🟡 **Commit all uncommitted changes** — 26+ files since initial commit.
- 🟡 **Defender exclusion** for project folder — SQLite lock risk on Windows.
- 🟢 **Re-classify feature** — "re-classify all tasks using current keywords" button in CoursesView.

End of session 14 handoff.

---

## Session 15 — Key-based admin panel + bug fixes (2026-05-08)

### Summary

This session fixed all 4 bugs from session 14, solved issues A–D, added a key-based admin panel, and deployed to Railway. Three follow-up bugs were found and fixed after the initial deploy.

---

### All issues fixed this session

#### Fix 1 — EditDialog: free-form course creation blocked
`extensible = (dim === "subject")` → `extensible = false`.
Users can no longer type arbitrary course names into the subject field. (Was already noted in session 14 — confirmed shipped.)

#### Fix 2 — OnboardingWizard: skip existing courses on re-save
`save()` now calls `listCategories()` first and skips `createCategory` for any course name that already exists. Error message on 409 changed to "קורס עם שם זה כבר קיים". Save button disabled when `validCourses.length === 0`. `keywords` field changed from `[]` to `""` (backend expects a string).

#### Fix 3 — ScheduleView: new course unlocks CaptureBar
`ScheduleView` now accepts an `onCoursesChanged` prop. `handleCreateCourse` calls `onCoursesChanged?.()` on success. `App.jsx` passes `onCoursesChanged={() => setNoCourses(false)}`.

#### Fix A — Stale `_catNameToId` after course rename
`CoursesView.jsx` `handleNameSave` now calls `window.claudeAPI.listCategories()` after each successful name PATCH. This atomically refreshes both `_catNameToId` and `window.DIMENSIONS.subject`.

#### Fix C — Same-keyword conflict warning
`CoursesView.jsx` `addKw()` now checks all other categories for the same keyword before saving. If found: shows a toast "X קיים גם ב-Y — כשיהיה ספק, ה-AI יחליט" and saves anyway (user is warned, not blocked). `allCats` prop is now passed to `CourseCard`.

#### Fix D — AI classifier enforces closed list
`classifier.py`: after AI returns a category, validates it against `user_categories`. If invalid: retries once with an explicit constraint appended ("CRITICAL CORRECTION: category_name MUST be exactly one of: …"). If still invalid after retry: falls back to `user_categories[0]`.

---

### New feature: key-based admin panel

**Problem:** the old admin view required logging in as user 1 via OAuth and used cross-origin cookies (broken from localhost). The user also couldn't easily see or reset other users' accounts.

**Solution:** Secret-key URL. Set `ADMIN_KEY` env var on Railway; visit `/admin?key=ADMIN_KEY`.

#### How it works

- `_is_admin(request: Request) -> bool` helper in `app.py` — checks `?key=` param against `ADMIN_KEY` env var OR session cookie (user_id == 1). **Does NOT use FastAPI `Cookie()` injection** (that requires `Depends`, can't be called directly).
- `/admin` — HTML panel, gated by `_is_admin`. Injects `?key=VALUE` into all JS fetch calls via `__KEY_PARAM__` placeholder (replaced at render time). Returns 403 HTML with instructions if no key.
- `/admin/overview` — JSON, gated by `_is_admin`. Returns all users with stats.
- `/admin/users/{id}/reset` — POST, gated by `_is_admin`. Wipes all data for target user (adhoc_tasks, completions, recurring_patterns, categories, settings), then recreates a "כללי" catch-all so they're not stuck. Returns 404 for unknown user. Blocks resetting user 1 (admin).

#### How to access

```
https://academic-dashboard-production-d0d5.up.railway.app/admin?key=YOUR_KEY
```

Set the key:
```powershell
railway variables set "ADMIN_KEY=your-secret-here"
```

Or via Railway dashboard → Variables tab → New Variable: `ADMIN_KEY`.

---

### Admin panel bugs fixed post-deploy

#### Bug 1 — Reset crashed with 500
`admin_reset_user` referenced `user.id` in a print statement after the endpoint was refactored to not use `Depends(get_current_user)`. `user` was undefined → NameError → 500.
**Fix:** `print(f"[admin] user {target_id} reset by admin {user.id}")` → `print(f"[admin] user {target_id} reset")`.

#### Bug 2 — Task counts only showed adhoc tasks (showed "4" when user had many more)
The overview query joined only `adhoc_tasks`. Most tasks are "virtual" — computed from `recurring_patterns` at request time with no DB row until they're marked done. Open recurring tasks have NO row in the DB — they can't be counted without computing the full semester window.

**Fix:** Query now returns 4 columns instead of 2:
- `adhoc_open` — adhoc tasks with status='open'
- `adhoc_done` — adhoc tasks with status in ('done','skipped')
- `recurring_done` — completions with status='done' (recurring tasks user marked done)
- `recurring_skipped` — completions with status='skipped'

**Known limitation (still open):** "Open recurring tasks" — i.e., lectures/HWs sitting there unchecked — are genuinely impossible to count from the DB alone. You'd need to run the same semester-window computation as `GET /tasks`. The admin panel now correctly shows what CAN be counted; it does not claim to show total open tasks.

---

### Git versions

| Tag | Commit | Description |
|-----|--------|-------------|
| `v1` | `40f289a` | Last Railway deploy before this session (backup) |
| `v2` | `eaa2a29` | All session 14 fixes + multi-user hardening |
| — | `a687729` | Key-based admin panel |
| — | `fbbc866` | Fix admin reset NameError |
| — | `fd89e0a` | Fix admin task counts (adhoc vs recurring split) |

---

### Open items (updated)

- 🔴 **Railway has a warning** — user noticed a warning in the Railway dashboard. Not yet investigated. Check Railway service → Deployments tab for the warning message.
- 🟡 **Admin DB counts incomplete** — open recurring tasks are virtual and can't be counted from DB without semester-window computation. Current counts (adhoc + completions) are accurate for what they claim, but don't reflect total workload.
- 🔴 **Groq API key rotation** — leaked in early chat. Rotate before real users.
- 🟡 **Defender exclusion** for project folder — SQLite lock risk on Windows.
- 🟢 **Re-classify feature** — "re-classify all tasks using current keywords" button in CoursesView.
- 🟢 **Onboarding "הגדרה מחדש" UX** — wizard re-open now works (existing courses skipped), but placement of button in settings panel is still awkward.

### Files changed (session 15)

**Backend:**
- `app.py` — `_is_admin()` helper; `/admin`, `/admin/overview`, `/admin/users/{id}/reset` use `_is_admin`; `__KEY_PARAM__` injection in HTML; admin task counts split into 4 columns; reset NameError fixed
- `classifier.py` — AI closed-list retry logic

**Frontend:**
- `frontend/src/EditDialog.jsx` — `extensible = false` (free-form course blocked); null-safe `labelFor` for importance/urgency
- `frontend/src/OnboardingWizard.jsx` — duplicate course skip; save button disabled; `keywords: ""`; 409 error message
- `frontend/src/views/ScheduleView.jsx` — `onCoursesChanged` prop; `_SEM_START` timezone fix (noon UTC)
- `frontend/src/App.jsx` — `onCoursesChanged` passed to ScheduleView
- `frontend/src/claude-api.jsx` — `listCategories()` updates `SUBJECT_META` for all categories
- `frontend/src/views/CoursesView.jsx` — `allCats` prop to CourseCard; duplicate keyword warning
- `frontend/src/views/GroupView.jsx` — `window.DIMENSIONS[groupBy] || []` null guard

End of session 15 handoff.
