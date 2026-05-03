# Multi-User Plan — Academic Dashboard

**Date:** 2026-04-29
**Status:** plan only, no code yet. Build in a fresh session.
**Estimated build time:** ~2–2.5 working days (≈18 hours focused).

---

## 1. Decisions locked (per session 4 conversation)

| Decision | Choice |
|---|---|
| User base v1 | (b) friends from any program — different courses each |
| User base v2 | (c) public sign-ups — added later as a hardening layer, not a rewrite |
| Categories | **Per-user.** Each user creates their own course list. |
| Auth method v1 | **Google OAuth only.** No username+password. |
| Auth method v2 | If a real friend asks, add username+password (~2 hr). Hook left in. |
| Deploy target | **Render Starter** (~$8/mo: $7 service + $1/GB disk). |
| Custom domain | **No** for v1 — use `academic-dashboard.onrender.com`. Custom domain later. |
| HTTPS | Automatic via Render. |
| Gemini key | **Shared key, paid tier.** ~$1–2/mo expected; ~80% of captures already use the code path so quota pressure is low. |
| Existing data | Becomes `user_id = 1` (Amit) via one-time migration. Nothing deleted. |
| Friends invite model | **Invite-only.** Amit maintains an `allowed_emails` table; OAuth sign-in is rejected if email not whitelisted. Prevents random Google users from creating accounts before public phase. |

---

## 2. Architecture changes

### 2.1 Database schema (additive migration in `init_db`)

**New table:**
```sql
CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY,
    email       TEXT NOT NULL UNIQUE,
    google_sub  TEXT NOT NULL UNIQUE,   -- Google's permanent user ID, never reused
    name        TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS allowed_emails (
    email      TEXT PRIMARY KEY,
    note       TEXT,
    added_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Add `user_id` column** to every user-data table:
- `categories`
- `recurring_patterns`
- `completions`
- `adhoc_tasks`
- `settings` (currently global k/v — needs to become per-user)

```sql
ALTER TABLE categories            ADD COLUMN user_id INTEGER;
ALTER TABLE recurring_patterns    ADD COLUMN user_id INTEGER;
ALTER TABLE adhoc_tasks           ADD COLUMN user_id INTEGER;
ALTER TABLE completions           ADD COLUMN user_id INTEGER;
ALTER TABLE settings              ADD COLUMN user_id INTEGER;
```

(SQLite has no `ADD COLUMN IF NOT EXISTS`, so use the `PRAGMA table_info` peek pattern from session 3.)

**Indexes:**
```sql
CREATE INDEX idx_categories_user        ON categories(user_id);
CREATE INDEX idx_patterns_user          ON recurring_patterns(user_id);
CREATE INDEX idx_adhoc_user_status      ON adhoc_tasks(user_id, status);
CREATE INDEX idx_completions_user_date  ON completions(user_id, occurrence_date);
CREATE INDEX idx_settings_user          ON settings(user_id, key);
```

**Migration step (one-time):**
1. Insert Amit's row in `users` with his Google email + sub (need his Google account info first time he signs in).
2. Bulk update all existing rows: `UPDATE categories SET user_id = 1 WHERE user_id IS NULL` (and same for the other 4 tables).
3. Add `NOT NULL` constraint on `user_id` columns (requires recreating tables in SQLite — or skip the constraint and rely on application-level checks, which is acceptable for a single-binary app).

**Rollback strategy:** keep a `.sqlite3.backup` copy made by the migration script before any DDL runs. Restore = `cp` it back.

### 2.2 Auth flow

**Endpoints (new):**
- `GET /auth/google/login` — redirects to Google's consent screen
- `GET /auth/google/callback` — Google redirects here with a code; backend trades it for ID token, looks up/creates user, sets session cookie
- `POST /auth/logout` — clears session cookie
- `GET /auth/me` — returns current user (or 401 if not signed in) — used by frontend to check auth state on page load

**Session cookie:** signed JWT or itsdangerous-signed string. `httponly`, `secure`, `samesite=lax`. ~30-day TTL. Cookie name: `acdash_session`.

**Middleware:** `get_current_user()` FastAPI dependency that reads the cookie, verifies signature, looks up user in DB. Raises 401 if missing/invalid. **Every existing endpoint gains this dependency** and filters by `current_user.id`.

**Whitelist check at signup:** in the OAuth callback, if `email NOT IN allowed_emails`, return 403 "your email isn't on the invite list — ask Amit to add it."

**Library:** `Authlib` (de facto standard for OAuth in Python). Add `python-jose[cryptography]` for JWT or `itsdangerous` for simple signed cookies.

### 2.3 Google OAuth setup (one-time, ~10 min)

1. Go to https://console.cloud.google.com → create new project "academic-dashboard"
2. APIs & Services → OAuth consent screen → External, fill required fields, add Amit's email as Test User
3. Credentials → Create OAuth client ID → Web application
4. Add authorized redirect URIs:
   - `http://localhost:8001/auth/google/callback` (dev)
   - `https://academic-dashboard.onrender.com/auth/google/callback` (prod)
5. Copy `client_id` and `client_secret` → store in `.env` as `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET`

### 2.4 API changes (every existing endpoint)

Every endpoint that touches user data gains:
```python
@app.get("/tasks")
def list_tasks(scope: str = "today", user: User = Depends(get_current_user)):
    # all queries filter by user.id
```

Same for: `GET/POST/PATCH/DELETE /tasks`, `/categories`, `/patterns`, `/context`, `/settings`, `/history`. ~15 endpoints to update.

### 2.5 Frontend changes

- **Login gate:** on app load, call `GET /auth/me`. If 401, render a single "Sign in with Google" button instead of the dashboard. If 200, render dashboard.
- **Logout button** in the tweaks panel — calls `POST /auth/logout`, then refreshes page.
- **User identity indicator:** small avatar / initial in the header showing who's signed in. Click → menu → logout.
- **Empty state for new users:** new users have zero categories, zero patterns, no About Me. The first-load UX needs:
  - "Add your first course" prompt (links to Schedule view)
  - About Me empty state (already handled)
  - Eisenhower / All views show empty state (already handled)
- **Per-user localStorage keys:** prefix all localStorage keys with the user's id, e.g. `nucleus.collapse.schedule.cat.1` → `nucleus.u${userId}.collapse.schedule.cat.1`. Otherwise switching accounts on the same browser carries UI state across users.

### 2.6 Deploy to Render

**Files to add to repo:**
- `Dockerfile` (optional — Render's Python buildpack handles FastAPI natively without one)
- `render.yaml` (optional but recommended — declares service config in code)
- `start.sh` — `python -m uvicorn app:app --host 0.0.0.0 --port $PORT`

**Render setup steps:**
1. Push repo to GitHub (private). First git commit = this milestone.
2. Render → New → Web Service → Connect GitHub repo
3. Build command: `pip install -r requirements.txt`
4. Start command: `python -m uvicorn app:app --host 0.0.0.0 --port $PORT`
5. Plan: **Starter** ($7/mo)
6. Add Disk: `/var/data`, 1 GB
7. Environment variables (Render dashboard):
   - `GOOGLE_API_KEY` — Gemini key
   - `GOOGLE_OAUTH_CLIENT_ID`
   - `GOOGLE_OAUTH_CLIENT_SECRET`
   - `SESSION_SECRET` — random 64-byte string for signing cookies (generate via `python -c "import secrets; print(secrets.token_urlsafe(64))"`)
   - `DB_PATH=/var/data/academic.sqlite3`
   - `BASE_URL=https://academic-dashboard.onrender.com`
8. Update `db.py` to read `DB_PATH` from env, falling back to local `./academic.sqlite3` for dev.
9. Update CORS origins to include the Render subdomain.
10. Deploy. First boot will create the empty DB on the volume; run `python seed.py` via Render's shell to seed initial data — but **only if Amit wants the seed** (a fresh user starts empty per §2.5).

### 2.7 Gemini quota considerations

Shared key, paid tier. At paid pricing (Gemini 2.5 Flash): ~$0.10 per 1M input tokens. A typical capture is ~200 input tokens + 200 output. With ~5 friends × ~10 AI captures/day each = ~50 calls/day = ~20K tokens/day = $0.06/month. Realistically: $1–2/mo cap.

**Set a billing alert** at $5/mo in Google Cloud Console as a safety net.

---

## 3. Phase breakdown for the build session

| Phase | What | Hours | Verification |
|---|---|---|---|
| **A** | Schema migration: users, allowed_emails, user_id columns + indexes. Backfill Amit as user_id=1. | 4 | `PRAGMA table_info` shows new columns; `SELECT COUNT(*) FROM categories WHERE user_id IS NULL` = 0. |
| **B** | Auth: Google OAuth, session middleware, `get_current_user`, whitelist check. | 4 | curl /auth/me without cookie → 401; sign in via browser → 200 with email. |
| **C** | API: add `user_id` filter to every existing endpoint. | 2 | curl /patterns without auth → 401; with cookie → only Amit's patterns. |
| **D** | Frontend: login gate, logout button, user indicator, per-user localStorage prefix. | 3 | Sign out → see login screen; sign in as different user → empty data. |
| **E** | Empty-state UX for new users + "add first course" flow. | 1 | Brand-new account loads cleanly with onboarding hint. |
| **F** | Render deploy: requirements + start command + disk mount + env vars + OAuth redirect URI. | 3 | Production URL serves /healthz, OAuth flow completes, data persists across redeploy. |
| **G** | Smoke test: invite a real friend's email, have them sign in, confirm isolation. Verify Amit's data still works post-migration. | 1 | Two distinct accounts on prod each see their own data; Amit's old patterns intact. |

**Total: ~18 hours.** Spread across 2-3 sessions for sanity.

---

## 4. What to NOT do in v1

- ❌ Don't add username/password auth. Wait for a real request.
- ❌ Don't build a custom signup form. The OAuth flow IS the signup form.
- ❌ Don't build an admin UI for `allowed_emails` — Amit edits it via SQLite directly or a tiny CLI. UI is v2.
- ❌ Don't add password reset, email verification, or 2FA — Google handles all of that.
- ❌ Don't implement rate limiting. Friends-only via whitelist makes abuse impossible.
- ❌ Don't add analytics, error tracking, monitoring, or logging frameworks. Render's logs are enough for v1.
- ❌ Don't pre-seed new users with anything. They start empty.
- ❌ Don't migrate to Postgres yet. SQLite + persistent disk is fine at this scale (it'll handle thousands of users on a single Render instance).

---

## 5. Open items to confirm before building

1. **Custom domain?** Plan assumes `academic-dashboard.onrender.com`. If Amit owns a domain, add a §2.6.5 step.
2. **Friends list to whitelist:** Amit needs to give 5-10 emails in the build session.
3. **Per-user theme/density preferences:** these currently live in localStorage. Per-user-prefix solves it. But: should switching users in the same browser keep your own theme? Plan says yes (prefix per user-id). Confirm.
4. **First-launch onboarding tour:** plan currently says just "empty state with 'add a course' button." If Amit wants a guided tour for new users, add ~2 hours.

---

## 6. Cost summary

| Cost | Frequency | Notes |
|---|---|---|
| Render Starter | $7/mo | Web service, no sleep |
| Render Disk (1GB) | $1/mo | Persistent SQLite |
| Gemini (paid tier) | ~$1–2/mo | Set $5 billing alert |
| Google OAuth | $0 | Free for any project |
| Domain (optional, later) | $10/yr | If ever |
| **Total v1** | **~$9/mo** | |

Compared to your phone bill or coffee budget, this is rounding error. Stop optimizing the cost; ship.

---

## 7. Migration strategy v1 → v2 (public sign-ups)

When Amit decides to open it up:

1. Drop the `allowed_emails` whitelist check (or keep it as an opt-in admin toggle).
2. Add rate limiting on `/auth/google/callback` and `/tasks` (Redis or in-memory; `slowapi` package).
3. Add a CAPTCHA on first sign-in (hCaptcha or Google reCAPTCHA, free tier).
4. Add a Privacy Policy + Terms of Service page (boilerplate is fine for a personal tool).
5. Switch Google OAuth consent screen from "External / Test" to "External / In production" (requires brief Google verification).

Expected effort: ~6 hours. No DB changes, no auth-flow changes.

---

## 8. References

- `HANDOFF.md` — current state of academic_dashboard at end of session 3
- `BUILDING_PRINCIPLES.md` — engineering rules (still authoritative)
- Authlib FastAPI guide: https://docs.authlib.org/en/latest/client/fastapi.html
- Render Python docs: https://render.com/docs/deploy-fastapi
- Google OAuth setup: https://developers.google.com/identity/protocols/oauth2/web-server

---

End of plan. Ready for build session B.
