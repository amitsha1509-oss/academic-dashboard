# Google OAuth Setup

You need to do this **once** to enable real Google sign-in. Until you do, the dashboard runs in `DEV_MODE=1` only — fine for local testing, but real friends can't sign in until OAuth is configured.

Total time: ~10 minutes. No code changes needed — you just put two values into `.env`.

---

## 1. Create the OAuth client in Google Cloud Console

1. Go to **https://console.cloud.google.com**
2. Create a new project named `academic-dashboard` (or use any existing project).
3. In the sidebar, click **APIs & Services → OAuth consent screen**
4. Choose **External**, click **Create**.
5. Fill the **App information**:
   - **App name:** Academic Dashboard
   - **User support email:** your email
   - **Developer contact info:** your email
   - Skip everything else for now.
6. Click **Save and Continue**.
7. **Scopes** screen: just click **Save and Continue** (default `userinfo.email`, `userinfo.profile`, `openid` are added automatically when you use the OAuth flow).
8. **Test users** screen: click **+ Add Users** and add yourself + every friend you want to grant access to. (External / Test mode only allows these listed emails to sign in. To make it open to all Google accounts, you'd later switch to "In production" — Google requires verification for that.)
9. Click **Save and Continue** → **Back to Dashboard**.

Now create the actual credentials:

10. In the sidebar: **Credentials** → **+ Create Credentials** → **OAuth client ID**.
11. **Application type:** Web application.
12. **Name:** Academic Dashboard (anything, just a label).
13. Under **Authorized redirect URIs**, add BOTH:
    - `http://localhost:8001/auth/google/callback` ← for development this week
    - `https://YOUR-PRODUCTION-URL/auth/google/callback` ← for after you deploy (you can come back and add this later)
14. Click **Create**.
15. A modal pops up with **Client ID** and **Client secret**. Copy both. (You can re-find them later in the Credentials list.)

---

## 2. Put them in `.env`

Open `C:\Users\amit shani\academic_dashboard\.env` and add:

```env
GOOGLE_OAUTH_CLIENT_ID=<paste your client ID here>
GOOGLE_OAUTH_CLIENT_SECRET=<paste your secret here>
SESSION_SECRET=<random 64-byte string — see below>

# Local dev only. Remove or set to 0 in production.
DEV_MODE=1

# In production, set to your real URL.
BASE_URL=http://localhost:8001
```

To generate a random `SESSION_SECRET`:

```cmd
.venv\Scripts\python.exe -c "import secrets; print(secrets.token_urlsafe(64))"
```

Copy that 86-character string into the env var.

---

## 3. Restart the server

```cmd
.venv\Scripts\python.exe -m uvicorn app:app --port 8001
```

If everything's set, the startup output should NOT print `[auth] GOOGLE_OAUTH_CLIENT_ID / SECRET not set`.

---

## 4. Test it

1. Open `http://localhost:8001/` in a browser.
2. You should see the **"Sign in with Google"** screen.
3. Click the button. Google should ask for permission.
4. Approve. You should be redirected back to `/app/` and see your dashboard.

If anything fails: check the uvicorn console for an `[auth] OAuth exchange failed: ...` line. The most common error is the redirect URI mismatch — make sure step 13 above includes `/auth/google/callback` exactly (note the `/auth/google/callback` path, not `/callback`).

---

## 5. (Later) Switch from "Test" to "In production"

While in **Test** mode, only the emails you added in step 8 can sign in. Up to ~100 testers. For your friends-only PoC, this is exactly what you want — you control the list.

When you're ready to let anyone with a Google account sign in:

1. Go back to **APIs & Services → OAuth consent screen**.
2. Click **Publish App**.
3. Google will warn that your app is unverified. For "verified" status (which removes the scary "unsafe" warning that appears for non-test users) you'd need to submit for verification — only worth doing if you go fully public. For friends-only with a private URL, staying in Test is fine permanently.

---

## 6. Migration from DEV_MODE to real OAuth

Once OAuth works, your existing data is still fine:
- Your user row was pre-seeded with `email = amitsha1509@gmail.com`.
- The first time you sign in via real OAuth, the callback handler matches by email, attaches your `google_sub`, and sets the session cookie.
- All your existing categories/patterns/tasks come right back.

You can leave `DEV_MODE=1` enabled in dev for fast testing. **Make sure DEV_MODE is unset in production** — anyone hitting `/auth/dev_login` could otherwise impersonate any user.
