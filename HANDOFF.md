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
