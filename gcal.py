"""
gcal.py — Google Calendar OAuth + API integration.

Separate from login OAuth (auth.py). Handles:
- OAuth flow to get Calendar access (user must already be logged in)
- Storing access token + expiry per user in the DB
- Finding or creating the "אקדמיה" calendar on first connect
- Reading events from all user calendars (shown as grey blocks)
- Creating / updating / deleting events when tasks are scheduled
"""
import os
from datetime import datetime, timezone
from typing import Optional

import httpx
from authlib.integrations.starlette_client import OAuth
from fastapi import HTTPException, Request
from fastapi.responses import RedirectResponse

import auth
import db

GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_OAUTH_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_OAUTH_CLIENT_SECRET")
BASE_URL = auth.BASE_URL

ACADEMIA_CALENDAR_NAME = "אקדמיה"
GCAL_SCOPE = "https://www.googleapis.com/auth/calendar"

# Second Authlib OAuth client — same credentials, Calendar scope only (no OIDC).
# We use explicit endpoints instead of server_metadata_url so Authlib doesn't try
# to parse an id_token that Google won't return for a pure calendar scope request.
_gcal_oauth = OAuth()
if GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET:
    _gcal_oauth.register(
        name="gcal",
        client_id=GOOGLE_CLIENT_ID,
        client_secret=GOOGLE_CLIENT_SECRET,
        authorize_url="https://accounts.google.com/o/oauth2/v2/auth",
        access_token_url="https://oauth2.googleapis.com/token",
        client_kwargs={
            "scope": GCAL_SCOPE,
            "token_endpoint_auth_method": "client_secret_post",
        },
    )


# ─── OAuth flow ────────────────────────────────────────────────────────

async def start_gcal_auth(request: Request) -> RedirectResponse:
    """Redirect logged-in user to Google to approve Calendar access."""
    if "gcal" not in _gcal_oauth._clients:
        raise HTTPException(503, "Google OAuth not configured.")
    redirect_uri = f"{BASE_URL}/gcal/callback"
    return await _gcal_oauth.gcal.authorize_redirect(request, redirect_uri)


async def handle_gcal_callback(request: Request, user: auth.User) -> RedirectResponse:
    """Handle Google redirect. Store token, find/create אקדמיה calendar."""
    if "gcal" not in _gcal_oauth._clients:
        raise HTTPException(503, "Google OAuth not configured.")
    try:
        token = await _gcal_oauth.gcal.authorize_access_token(request)
    except Exception as e:
        print(f"[gcal] OAuth exchange failed: {e!r}")
        raise HTTPException(400, "Calendar authorization failed. Please try again.")

    access_token = token.get("access_token")
    expires_at = token.get("expires_at")  # unix timestamp float

    if not access_token:
        raise HTTPException(400, "No access token received from Google.")

    with db.connect() as c:
        c.execute(
            "UPDATE users SET gcal_access_token=?, gcal_token_expiry=? WHERE id=?",
            (access_token, str(expires_at) if expires_at else None, user.id),
        )

    calendar_id = await _find_or_create_academia_calendar(access_token)

    with db.connect() as c:
        c.execute("UPDATE users SET gcal_calendar_id=? WHERE id=?", (calendar_id, user.id))

    return RedirectResponse(url="/calendar/", status_code=302)


# ─── Token helpers ─────────────────────────────────────────────────────

def get_gcal_token(user_id: int) -> Optional[str]:
    """Return stored access token if valid, None if missing/expired."""
    with db.connect() as c:
        row = c.execute(
            "SELECT gcal_access_token, gcal_token_expiry FROM users WHERE id=?",
            (user_id,),
        ).fetchone()

    if not row or not row["gcal_access_token"]:
        return None

    if row["gcal_token_expiry"]:
        try:
            if datetime.now(timezone.utc).timestamp() > float(row["gcal_token_expiry"]):
                return None  # expired — frontend will prompt reconnect
        except (ValueError, TypeError):
            pass

    return row["gcal_access_token"]


def get_gcal_status(user_id: int) -> dict:
    with db.connect() as c:
        row = c.execute(
            "SELECT gcal_access_token, gcal_token_expiry, gcal_calendar_id FROM users WHERE id=?",
            (user_id,),
        ).fetchone()

    if not row or not row["gcal_access_token"]:
        return {"connected": False}

    token_ok = get_gcal_token(user_id) is not None
    return {
        "connected": token_ok,
        "calendar_id": row["gcal_calendar_id"] if row else None,
    }


def _require_token(user_id: int) -> str:
    token = get_gcal_token(user_id)
    if not token:
        raise HTTPException(401, "Google Calendar not connected or token expired.")
    return token


def _get_calendar_id(user_id: int) -> str:
    with db.connect() as c:
        row = c.execute("SELECT gcal_calendar_id FROM users WHERE id=?", (user_id,)).fetchone()
    if not row or not row["gcal_calendar_id"]:
        raise HTTPException(400, "אקדמיה calendar not set up. Please reconnect Google Calendar.")
    return row["gcal_calendar_id"]


# ─── Calendar setup ────────────────────────────────────────────────────

async def _find_or_create_academia_calendar(access_token: str) -> str:
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            "https://www.googleapis.com/calendar/v3/users/me/calendarList",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        resp.raise_for_status()
        for cal in resp.json().get("items", []):
            if cal.get("summary") == ACADEMIA_CALENDAR_NAME:
                print(f"[gcal] found existing '{ACADEMIA_CALENDAR_NAME}' calendar: {cal['id']}")
                return cal["id"]

        # Not found — create it
        create = await client.post(
            "https://www.googleapis.com/calendar/v3/calendars",
            headers={"Authorization": f"Bearer {access_token}"},
            json={"summary": ACADEMIA_CALENDAR_NAME},
        )
        create.raise_for_status()
        cal_id = create.json()["id"]
        print(f"[gcal] created '{ACADEMIA_CALENDAR_NAME}' calendar: {cal_id}")
        return cal_id


# ─── Event read ────────────────────────────────────────────────────────

async def fetch_events(user_id: int, time_min: str, time_max: str) -> list:
    """Fetch events from ALL user calendars for the given range.
    Returns list of {id, title, start, end, is_academia} dicts."""
    token = _require_token(user_id)
    academia_id = _get_calendar_id(user_id)

    async with httpx.AsyncClient(timeout=30.0) as client:
        cals_resp = await client.get(
            "https://www.googleapis.com/calendar/v3/users/me/calendarList",
            headers={"Authorization": f"Bearer {token}"},
        )
        cals_resp.raise_for_status()
        calendars = cals_resp.json().get("items", [])

        all_events = []
        for cal in calendars:
            cal_id = cal["id"]
            resp = await client.get(
                f"https://www.googleapis.com/calendar/v3/calendars/{cal_id}/events",
                headers={"Authorization": f"Bearer {token}"},
                params={
                    "timeMin": time_min,
                    "timeMax": time_max,
                    "singleEvents": "true",
                    "orderBy": "startTime",
                    "maxResults": 250,
                },
            )
            if resp.status_code != 200:
                continue
            for ev in resp.json().get("items", []):
                start = (ev.get("start") or {})
                end = (ev.get("end") or {})
                all_events.append({
                    "id": ev.get("id"),
                    "title": ev.get("summary", "(ללא כותרת)"),
                    "start": start.get("dateTime") or start.get("date"),
                    "end": end.get("dateTime") or end.get("date"),
                    "is_academia": cal_id == academia_id,
                    "calendar_name": cal.get("summary", ""),
                    "color": cal.get("backgroundColor", "#d1d5db"),
                })

    return all_events


# ─── Event write ───────────────────────────────────────────────────────

async def create_event(user_id: int, task_id: int, title: str, start: str, end: str) -> str:
    """Push a task to GCal as an event. Returns GCal event ID."""
    token = _require_token(user_id)
    calendar_id = _get_calendar_id(user_id)

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"https://www.googleapis.com/calendar/v3/calendars/{calendar_id}/events",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "summary": title,
                "start": {"dateTime": start, "timeZone": "Asia/Jerusalem"},
                "end":   {"dateTime": end,   "timeZone": "Asia/Jerusalem"},
                "description": f"academic-dashboard:task:{task_id}",
            },
        )
        if resp.status_code == 404:
            # Calendar was deleted from Google — recreate it and retry once
            new_calendar_id = await _find_or_create_academia_calendar(token)
            with db.connect() as c:
                c.execute("UPDATE users SET gcal_calendar_id=? WHERE id=?", (new_calendar_id, user_id))
            retry = await client.post(
                f"https://www.googleapis.com/calendar/v3/calendars/{new_calendar_id}/events",
                headers={"Authorization": f"Bearer {token}"},
                json={
                    "summary": title,
                    "start": {"dateTime": start, "timeZone": "Asia/Jerusalem"},
                    "end":   {"dateTime": end,   "timeZone": "Asia/Jerusalem"},
                    "description": f"academic-dashboard:task:{task_id}",
                },
            )
            retry.raise_for_status()
            return retry.json()["id"]
        resp.raise_for_status()
        return resp.json()["id"]


async def update_event(user_id: int, gcal_event_id: str, title: str, start: str, end: str) -> None:
    token = _require_token(user_id)
    calendar_id = _get_calendar_id(user_id)

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.patch(
            f"https://www.googleapis.com/calendar/v3/calendars/{calendar_id}/events/{gcal_event_id}",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "summary": title,
                "start": {"dateTime": start, "timeZone": "Asia/Jerusalem"},
                "end":   {"dateTime": end,   "timeZone": "Asia/Jerusalem"},
            },
        )
        if resp.status_code not in (200, 204, 404):
            resp.raise_for_status()


async def delete_event(user_id: int, gcal_event_id: str) -> None:
    token = get_gcal_token(user_id)
    if not token:
        return  # token gone — can't delete, not a fatal error
    try:
        calendar_id = _get_calendar_id(user_id)
    except HTTPException:
        return

    async with httpx.AsyncClient(timeout=30.0) as client:
        await client.delete(
            f"https://www.googleapis.com/calendar/v3/calendars/{calendar_id}/events/{gcal_event_id}",
            headers={"Authorization": f"Bearer {token}"},
        )
