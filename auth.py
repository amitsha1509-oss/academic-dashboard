"""
auth.py — Google OAuth + session cookies + per-request user resolution.

Session model: signed cookie containing the user id. We use itsdangerous's
TimestampSigner so cookies can be revoked by rotating SESSION_SECRET (all
existing cookies become invalid). 30-day max age.

OAuth model: Authlib drives the redirect → callback → token exchange. After
the callback, we look up the user by Google's stable subject identifier
(`sub`) — that's the durable Google user ID, never reused, never reassigned.
First time we see a `sub`, we create a row in users (or attach it to a
pre-seeded row that matches by email).

DEV_MODE: when DEV_MODE=1 in the environment, GET /auth/dev_login?user_id=N
issues a session cookie for that user — useful for local end-to-end testing
without configuring real Google OAuth credentials.
"""
import os
import secrets
from typing import Optional

from authlib.integrations.starlette_client import OAuth
from fastapi import Cookie, Depends, HTTPException, Request, Response
from fastapi.responses import JSONResponse, RedirectResponse
from itsdangerous import BadSignature, SignatureExpired, TimestampSigner
from pydantic import BaseModel

import db


# ─── Config from env ──────────────────────────────────────────────────
SESSION_COOKIE = "acdash_session"
SESSION_MAX_AGE = 30 * 24 * 60 * 60  # 30 days, in seconds

DEV_MODE = os.environ.get("DEV_MODE", "").strip() in ("1", "true", "yes")

# Cookies marked Secure require HTTPS. Auto-enable when BASE_URL is HTTPS
# (every reasonable deploy is HTTPS) so the operator can't forget it.
# Override explicitly via env if needed: COOKIE_SECURE=0 forces it off.
_BASE_URL_RAW = os.environ.get("BASE_URL", "http://localhost:8001")
_explicit_secure = os.environ.get("COOKIE_SECURE")
if _explicit_secure is not None:
    COOKIE_SECURE = _explicit_secure.strip() in ("1", "true", "yes")
else:
    COOKIE_SECURE = _BASE_URL_RAW.startswith("https://")

# A 64-byte URL-safe random string. MUST be set in prod. For dev convenience
# we generate an ephemeral one if missing — but that means cookies won't
# survive a server restart. Warn loudly.
SESSION_SECRET = os.environ.get("SESSION_SECRET")
if not SESSION_SECRET:
    SESSION_SECRET = secrets.token_urlsafe(64)
    print("[auth] WARNING: SESSION_SECRET not set; using ephemeral secret. "
          "Cookies will not survive restart.")

_signer = TimestampSigner(SESSION_SECRET)

GOOGLE_OAUTH_CLIENT_ID = os.environ.get("GOOGLE_OAUTH_CLIENT_ID")
GOOGLE_OAUTH_CLIENT_SECRET = os.environ.get("GOOGLE_OAUTH_CLIENT_SECRET")
BASE_URL = _BASE_URL_RAW

# Authlib's OAuth client. We register Google's OIDC endpoints via discovery.
oauth = OAuth()
if GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET:
    oauth.register(
        name="google",
        client_id=GOOGLE_OAUTH_CLIENT_ID,
        client_secret=GOOGLE_OAUTH_CLIENT_SECRET,
        server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
        client_kwargs={"scope": "openid email profile"},
    )
else:
    print("[auth] GOOGLE_OAUTH_CLIENT_ID / SECRET not set; /auth/google/* will 503. "
          "DEV_MODE=1 still works via /auth/dev_login.")


# ─── Models ────────────────────────────────────────────────────────────
class User(BaseModel):
    id: int
    email: str
    name: Optional[str] = None
    google_sub: Optional[str] = None


# ─── Cookie helpers ────────────────────────────────────────────────────
def _make_cookie_value(user_id: int) -> str:
    return _signer.sign(str(user_id).encode()).decode()


def _read_cookie_value(token: str) -> Optional[int]:
    try:
        raw = _signer.unsign(token.encode(), max_age=SESSION_MAX_AGE)
        return int(raw.decode())
    except (BadSignature, SignatureExpired, ValueError):
        return None


def _set_session_cookie(response: Response, user_id: int) -> None:
    response.set_cookie(
        key=SESSION_COOKIE,
        value=_make_cookie_value(user_id),
        max_age=SESSION_MAX_AGE,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
        path="/",
    )


def _clear_session_cookie(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE, path="/")


# ─── DB helpers ────────────────────────────────────────────────────────
def _row_to_user(row) -> User:
    return User(
        id=row["id"],
        email=row["email"],
        name=row["name"],
        google_sub=row["google_sub"],
    )


def get_user_by_id(user_id: int) -> Optional[User]:
    with db.connect() as c:
        row = c.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
        return _row_to_user(row) if row else None


def find_or_create_user(email: str, google_sub: str, name: Optional[str]) -> User:
    """First match google_sub (the stable Google ID); if not found, fall back to
    email (for users pre-seeded before they OAuthed in — like Amit). If we match
    by email, populate google_sub on the existing row. Otherwise insert new."""
    with db.connect() as c:
        row = c.execute("SELECT * FROM users WHERE google_sub=?", (google_sub,)).fetchone()
        if row:
            return _row_to_user(row)

        row = c.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
        if row:
            # Pre-seeded user just OAuthed for the first time. Attach their sub.
            c.execute(
                "UPDATE users SET google_sub=?, name=COALESCE(name, ?) WHERE id=?",
                (google_sub, name, row["id"]),
            )
            row = c.execute("SELECT * FROM users WHERE id=?", (row["id"],)).fetchone()
            return _row_to_user(row)

        # Brand-new user.
        cur = c.execute(
            "INSERT INTO users(email, google_sub, name) VALUES(?, ?, ?)",
            (email, google_sub, name),
        )
        new_id = cur.lastrowid
        # Auto-create "כללי" so the app is usable immediately after sign-up.
        c.execute(
            "INSERT INTO categories(user_id, name, color_dark, color_mid, color_light, sort_order) "
            "VALUES(?, ?, ?, ?, ?, ?)",
            (new_id, "כללי", "6B7280", "9CA3AF", "F3F4F6", 0),
        )
        row = c.execute("SELECT * FROM users WHERE id=?", (new_id,)).fetchone()
        return _row_to_user(row)


# ─── FastAPI dependency ────────────────────────────────────────────────
def get_current_user(
    acdash_session: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE),
) -> User:
    """FastAPI dependency. Apply to every endpoint that touches user data.
    401 if no session cookie or signature is invalid."""
    if not acdash_session:
        raise HTTPException(401, "not signed in")
    user_id = _read_cookie_value(acdash_session)
    if user_id is None:
        raise HTTPException(401, "session expired")
    user = get_user_by_id(user_id)
    if user is None:
        # Cookie was valid but user was deleted from DB. Defense in depth.
        raise HTTPException(401, "user not found")
    return user


# ─── Route handlers ────────────────────────────────────────────────────
async def google_login(request: Request) -> Response:
    if "google" not in oauth._clients:
        raise HTTPException(503, "Google OAuth not configured on this server.")
    redirect_uri = f"{BASE_URL}/auth/google/callback"
    # `prompt=select_account` forces Google to show the account chooser even
    # when the user's already signed in. Without this, switching accounts means
    # going to accounts.google.com first, which is a confusing extra step.
    return await oauth.google.authorize_redirect(
        request, redirect_uri, prompt="select_account",
    )


async def google_callback(request: Request) -> Response:
    if "google" not in oauth._clients:
        raise HTTPException(503, "Google OAuth not configured on this server.")
    try:
        token = await oauth.google.authorize_access_token(request)
    except Exception as e:
        # Don't leak internal details. Log internally.
        print(f"[auth] OAuth exchange failed: {e!r}")
        raise HTTPException(400, "OAuth sign-in failed; please try again.")

    info = token.get("userinfo") or {}
    sub = info.get("sub")
    email = info.get("email")
    name = info.get("name")
    if not sub or not email:
        raise HTTPException(400, "Google did not return required identity claims.")

    user = find_or_create_user(email=email, google_sub=sub, name=name)

    response = RedirectResponse(url="/app/", status_code=302)
    _set_session_cookie(response, user.id)
    return response


def logout() -> Response:
    response = JSONResponse({"ok": True})
    _clear_session_cookie(response)
    return response


def me(user: User = Depends(get_current_user)) -> User:
    return user


def dev_login(user_id: int = 1) -> Response:
    """DEV_MODE only — issues a session cookie for the given user id with no
    OAuth round-trip. Lets you test all auth-protected endpoints locally
    before configuring real Google credentials."""
    if not DEV_MODE:
        raise HTTPException(404, "not found")
    user = get_user_by_id(user_id)
    if not user:
        raise HTTPException(404, f"user {user_id} not found in DB")
    response = JSONResponse({"ok": True, "user": user.model_dump()})
    _set_session_cookie(response, user.id)
    return response


def dev_users() -> list[dict]:
    """DEV_MODE only — list all users so the LoginScreen can show a picker.
    Otherwise switching accounts in dev would require manually editing URLs."""
    if not DEV_MODE:
        raise HTTPException(404, "not found")
    with db.connect() as c:
        rows = c.execute("SELECT id, email, name FROM users ORDER BY id").fetchall()
    return [{"id": r["id"], "email": r["email"], "name": r["name"]} for r in rows]
