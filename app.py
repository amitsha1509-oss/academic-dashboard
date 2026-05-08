"""
app.py — FastAPI server. All routes + static mounts.

Per BUILDING_PRINCIPLES.md "Modular architecture":
- This module owns ROUTING only. No business logic.
- compute.py materializes recurring instances + adhoc → unified Task list.
- db.py owns persistence. classifier.py (Phase 3) owns AI.
- models.py is the boundary contract.

Run: uvicorn app:app --reload --port 8001
"""
import os
import shutil
from datetime import datetime
from pathlib import Path
from typing import Literal, Optional

from apscheduler.schedulers.background import BackgroundScheduler
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

# Load .env BEFORE importing auth (auth reads env at import time).
load_dotenv()

import auth
import classifier
import compute
import db
import keyword_classifier
import models
import groq as groq_lib


# ─── App ────────────────────────────────────────────────────────────
app = FastAPI(title="Academic Dashboard", version="0.1.0")

# SessionMiddleware backs Authlib's OAuth state across the redirect
# (stores `state` and `nonce` in a signed cookie under "session").
# Distinct from our app session cookie (auth.SESSION_COOKIE) — that one
# carries the user_id after a successful login.
app.add_middleware(
    SessionMiddleware,
    secret_key=auth.SESSION_SECRET,
    https_only=auth.COOKIE_SECURE,
    same_site="lax",
)

# Defense-in-depth (frontend served from same origin, but be explicit)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8001", "http://127.0.0.1:8001",
        # Production origin added via BASE_URL env var
        *( [auth.BASE_URL] if auth.BASE_URL and auth.BASE_URL not in
           ("http://localhost:8001", "http://127.0.0.1:8001") else [] ),
    ],
    allow_credentials=True,  # cookies must flow on cross-origin
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize DB on startup (idempotent)
db.init_db()


# ─── Daily backup ───────────────────────────────────────────────────
def _backup_db():
    if not db.DB_PATH.exists():
        return
    backup_dir = db.DB_PATH.parent / "backups"
    backup_dir.mkdir(exist_ok=True)
    name = f"academic-{datetime.now().strftime('%Y-%m-%d')}.sqlite3"
    shutil.copy2(db.DB_PATH, backup_dir / name)
    for old in sorted(backup_dir.glob("academic-*.sqlite3"))[:-7]:
        old.unlink()
    print(f"[backup] saved {name}")

_scheduler = BackgroundScheduler()
_scheduler.add_job(_backup_db, "interval", hours=24, next_run_time=datetime.now())
_scheduler.start()


# ─── Auth routes (no get_current_user dependency — these ARE auth) ──
@app.get("/auth/google/login", include_in_schema=False)
async def auth_google_login(request: Request):
    return await auth.google_login(request)


@app.get("/auth/google/callback", include_in_schema=False)
async def auth_google_callback(request: Request):
    return await auth.google_callback(request)


@app.post("/auth/logout")
def auth_logout():
    return auth.logout()


@app.get("/auth/me", response_model=auth.User)
def auth_me(user: auth.User = Depends(auth.get_current_user)):
    return user


@app.get("/auth/dev_login", include_in_schema=False)
def auth_dev_login(user_id: int = 1):
    """Only enabled when env DEV_MODE=1. Useful for local testing without
    real Google OAuth credentials."""
    return auth.dev_login(user_id)


@app.get("/auth/dev_users", include_in_schema=False)
def auth_dev_users():
    """DEV_MODE only — returns all users so the LoginScreen can show a picker."""
    return auth.dev_users()


# ─── Static UI mounts ────────────────────────────────────────────────
STATIC_DIR = Path(__file__).parent / "static"
FRONTEND_DIR = Path(__file__).parent / "frontend"
STATIC_DIR.mkdir(exist_ok=True)

class NoCacheStaticFiles(StaticFiles):
    """Serve static files with Cache-Control: no-cache so Babel-in-browser
    always re-fetches the latest JSX. Without this, edits to .jsx don't show
    until the user does a hard reload (and even that sometimes fails)."""
    async def get_response(self, path, scope):
        response = await super().get_response(path, scope)
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
        return response


if (STATIC_DIR / "index.html").exists():
    app.mount("/ui", NoCacheStaticFiles(directory=str(STATIC_DIR), html=True), name="ui")
if (FRONTEND_DIR / "index.html").exists():
    app.mount("/app", NoCacheStaticFiles(directory=str(FRONTEND_DIR), html=True), name="app")


@app.get("/", include_in_schema=False)
def root_redirect():
    """Redirect to /app/ if it exists, else /ui."""
    if (FRONTEND_DIR / "index.html").exists():
        return RedirectResponse("/app/")
    if (STATIC_DIR / "index.html").exists():
        return RedirectResponse("/ui")
    return {"hint": "no UI mounted yet — see /docs for the API"}


# ─── Health ─────────────────────────────────────────────────────────
@app.get("/healthz")
def healthz() -> dict:
    return {"ok": True, "version": app.version}


# ─── Categories ─────────────────────────────────────────────────────
_CATEGORY_FIELDS = {
    "name", "department", "mandatory", "color_dark", "color_mid", "color_light",
    "sort_order", "self_confidence", "gap_notes", "keywords",
    # default_importance/default_urgency are set by the AI re-rank in PUT /context,
    # not via PATCH /categories. Excluding them here is intentional.
}


@app.get("/categories", response_model=list[models.Category])
def list_categories(user: auth.User = Depends(auth.get_current_user)):
    with db.connect() as c:
        rows = c.execute(
            "SELECT * FROM categories WHERE user_id=? ORDER BY sort_order, id",
            (user.id,),
        ).fetchall()
    return [models.Category.model_validate(dict(r)) for r in rows]


@app.post("/categories", response_model=models.Category, status_code=201)
def create_category(
    payload: models.CategoryCreate,
    user: auth.User = Depends(auth.get_current_user),
):
    data = payload.model_dump(exclude_unset=True)
    if "name" in data:
        data["name"] = data["name"].strip()
    if not data.get("name"):
        raise HTTPException(400, "name cannot be empty")
    data["user_id"] = user.id
    cols = list(data.keys())
    placeholders = ", ".join("?" for _ in cols)
    sets = ", ".join(cols)
    with db.connect() as c:
        try:
            cur = c.execute(
                f"INSERT INTO categories ({sets}) VALUES ({placeholders})",
                [data[k] for k in cols],
            )
        except db.sqlite3.IntegrityError as e:
            # UNIQUE (user_id, name) violation
            raise HTTPException(409, "you already have a category with this name")
        cat_id = cur.lastrowid
        row = c.execute(
            "SELECT * FROM categories WHERE id=?",
            (cat_id,),
        ).fetchone()

    # Generate keywords for the new course so the code-path classifier can
    # handle it immediately. Non-fatal: if Gemini is unavailable the course
    # still works, just uses AI for every task until keywords are populated.
    kw_str = classifier.generate_keywords(payload.name)
    # Always include the course name itself so keyword classifier matches immediately.
    kw_str = f"{payload.name},{kw_str}" if kw_str else payload.name
    with db.connect() as c:
        c.execute("UPDATE categories SET keywords=? WHERE id=?", (kw_str, cat_id))

    return models.Category.model_validate(dict(row))


@app.patch("/categories/{cat_id}", response_model=models.Category)
def update_category(
    cat_id: int,
    payload: models.CategoryUpdate,
    user: auth.User = Depends(auth.get_current_user),
):
    fields = payload.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(400, "no fields to update")
    if "name" in fields:
        fields["name"] = fields["name"].strip()
        if not fields["name"]:
            raise HTTPException(400, "name cannot be empty")
    bad = set(fields) - _CATEGORY_FIELDS
    if bad:
        raise HTTPException(400, f"unknown fields: {sorted(bad)}")
    sets = ", ".join(f"{k}=?" for k in fields)
    values = list(fields.values()) + [cat_id, user.id]
    with db.connect() as c:
        cur = c.execute(
            f"UPDATE categories SET {sets} WHERE id=? AND user_id=?",
            values,
        )
        if cur.rowcount == 0:
            raise HTTPException(404, "category not found")
        row = c.execute(
            "SELECT * FROM categories WHERE id=? AND user_id=?",
            (cat_id, user.id),
        ).fetchone()
    return models.Category.model_validate(dict(row))


@app.delete("/categories/{cat_id}", status_code=204)
def delete_category(
    cat_id: int,
    user: auth.User = Depends(auth.get_current_user),
):
    with db.connect() as c:
        cur = c.execute(
            "DELETE FROM categories WHERE id=? AND user_id=?",
            (cat_id, user.id),
        )
        if cur.rowcount == 0:
            raise HTTPException(404, "category not found")
    return


# ─── User context ──────────────────────────────────────────────────
# Free-text profile the user writes about themselves. Passed to Gemini
# on every classify so it understands the user's preferences and bias.
@app.get("/context")
def get_context(user: auth.User = Depends(auth.get_current_user)) -> dict:
    with db.connect() as c:
        row = c.execute(
            "SELECT value FROM settings WHERE user_id=? AND key='user_context'",
            (user.id,),
        ).fetchone()
    return {"text": (row["value"] if row else "") or ""}


@app.put("/context")
def set_context(
    payload: dict,
    user: auth.User = Depends(auth.get_current_user),
) -> dict:
    """Save user context AND re-rank category default priorities so existing
    tasks (which fall back to category defaults) reflect the new profile."""
    text = str(payload.get("text", "")).strip()
    with db.connect() as c:
        c.execute(
            "INSERT INTO settings(user_id, key, value) VALUES(?, 'user_context', ?) "
            "ON CONFLICT(user_id, key) DO UPDATE SET value=excluded.value",
            (user.id, text),
        )

    # Derive per-CATEGORY (course) and per-KIND priorities in one AI call.
    # Pass the user's category list so AI knows which courses to rank.
    rerank_applied = 0
    rerank_error = None
    try:
        with db.connect() as c:
            user_categories = [
                r["name"] for r in c.execute(
                    "SELECT name FROM categories WHERE user_id=?",
                    (user.id,),
                ).fetchall()
            ]
        derived = classifier.derive_priorities(text, user_categories=user_categories)
        with db.connect() as c:
            # Categories → only update this user's rows
            for s in derived.get("categories", []):
                cat_name = s.get("category_name")
                if cat_name not in user_categories:
                    continue  # AI hallucinated — skip
                cur = c.execute(
                    "UPDATE categories SET default_importance=?, default_urgency=? "
                    "WHERE user_id=? AND name=?",
                    (s.get("importance"), s.get("urgency"), user.id, cat_name),
                )
                rerank_applied += cur.rowcount
            # Kinds → store as JSON in settings under key 'kind_priorities'
            import json as _json
            kind_map = {
                k.get("kind"): {
                    "importance": k.get("importance"),
                    "urgency": k.get("urgency"),
                }
                for k in derived.get("kinds", [])
                if k.get("kind")
            }
            c.execute(
                "INSERT INTO settings(user_id, key, value) VALUES(?, 'kind_priorities', ?) "
                "ON CONFLICT(user_id, key) DO UPDATE SET value=excluded.value",
                (user.id, _json.dumps(kind_map, ensure_ascii=False)),
            )
            rerank_applied += len(kind_map)
    except (groq_lib.APIStatusError, groq_lib.APIConnectionError) as e:
        rerank_error = str(e)[:200]
    except Exception as e:
        rerank_error = f"{type(e).__name__}: {str(e)[:200]}"

    return {"text": text, "rerank_applied": rerank_applied, "rerank_error": rerank_error}


# ─── Settings ───────────────────────────────────────────────────────
@app.get("/settings")
def get_settings(user: auth.User = Depends(auth.get_current_user)) -> dict:
    with db.connect() as c:
        rows = c.execute(
            "SELECT key, value FROM settings WHERE user_id=?",
            (user.id,),
        ).fetchall()
    return {r["key"]: r["value"] for r in rows}


@app.patch("/settings/{key}")
def set_setting(
    key: str,
    payload: dict,
    user: auth.User = Depends(auth.get_current_user),
) -> dict:
    if "value" not in payload:
        raise HTTPException(400, "payload must include 'value'")
    value = str(payload["value"])
    with db.connect() as c:
        c.execute(
            "INSERT INTO settings(user_id, key, value) VALUES(?, ?, ?) "
            "ON CONFLICT(user_id, key) DO UPDATE SET value=excluded.value",
            (user.id, key, value),
        )
    return {"key": key, "value": value}


# ─── Recurring patterns (Settings) ─────────────────────────────────
@app.get("/patterns", response_model=list[models.RecurringPattern])
def list_patterns(user: auth.User = Depends(auth.get_current_user)):
    with db.connect() as c:
        rows = c.execute(
            "SELECT p.*, c.name AS category_name FROM recurring_patterns p "
            "JOIN categories c ON c.id = p.category_id "
            "WHERE p.user_id=? "
            "ORDER BY c.sort_order, p.kind, p.day_of_week",
            (user.id,),
        ).fetchall()
    return [models.RecurringPattern.model_validate(dict(r)) for r in rows]


_PATTERN_FIELDS = {
    "is_required", "label", "day_of_week", "start_time", "end_time",
    "hw_release_day", "hw_release_time", "hw_due_offset_days", "hw_due_time",
    "default_importance", "default_urgency", "weeks_active",
}


@app.patch("/patterns/{pattern_id}", response_model=models.RecurringPattern)
def update_pattern(
    pattern_id: int,
    payload: models.PatternUpdate,
    user: auth.User = Depends(auth.get_current_user),
):
    fields = payload.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(400, "no fields to update")
    bad = set(fields) - _PATTERN_FIELDS
    if bad:
        raise HTTPException(400, f"unknown fields: {sorted(bad)}")
    sets = ", ".join(f"{k}=?" for k in fields)
    vals = list(fields.values()) + [pattern_id, user.id]
    with db.connect() as c:
        cur = c.execute(
            f"UPDATE recurring_patterns SET {sets} WHERE id=? AND user_id=?",
            vals,
        )
        if cur.rowcount == 0:
            raise HTTPException(404, "pattern not found")
        row = c.execute(
            "SELECT p.*, c.name AS category_name FROM recurring_patterns p "
            "JOIN categories c ON c.id=p.category_id WHERE p.id=? AND p.user_id=?",
            (pattern_id, user.id),
        ).fetchone()
    return models.RecurringPattern.model_validate(dict(row))


@app.post("/patterns", response_model=models.RecurringPattern, status_code=201)
def create_pattern(
    payload: models.PatternCreate,
    user: auth.User = Depends(auth.get_current_user),
):
    data = payload.model_dump()
    data["user_id"] = user.id
    with db.connect() as c:
        # Category MUST belong to this user — never trust client category_id.
        if not c.execute(
            "SELECT 1 FROM categories WHERE id=? AND user_id=?",
            (data["category_id"], user.id),
        ).fetchone():
            raise HTTPException(400, "unknown category_id")
        cols = list(data.keys())
        placeholders = ", ".join("?" for _ in cols)
        sets = ", ".join(cols)
        cur = c.execute(
            f"INSERT INTO recurring_patterns ({sets}) VALUES ({placeholders})",
            [data[k] for k in cols],
        )
        new_id = cur.lastrowid
        row = c.execute(
            "SELECT p.*, c.name AS category_name FROM recurring_patterns p "
            "JOIN categories c ON c.id=p.category_id WHERE p.id=?",
            (new_id,),
        ).fetchone()
    return models.RecurringPattern.model_validate(dict(row))


@app.delete("/patterns/{pattern_id}", status_code=204)
def delete_pattern(
    pattern_id: int,
    user: auth.User = Depends(auth.get_current_user),
):
    with db.connect() as c:
        cur = c.execute(
            "DELETE FROM recurring_patterns WHERE id=? AND user_id=?",
            (pattern_id, user.id),
        )
        if cur.rowcount == 0:
            raise HTTPException(404, "pattern not found")
    return


# ─── Tasks ─────────────────────────────────────────────────────────
@app.post("/tasks", response_model=models.Task)
def capture_task(
    payload: models.CaptureRequest,
    user: auth.User = Depends(auth.get_current_user),
):
    """Free-text capture. Code-first classification, AI fallback. Insert into
    adhoc_tasks owned by the current user."""
    if not payload.text.strip():
        raise HTTPException(400, "text is empty")

    # Load user's categories — needed for both keyword-classifier validation
    # and AI prompt grounding (multi-tenant: classifier must pick from THIS
    # user's category list, not a global hardcoded one).
    with db.connect() as c:
        user_cat_rows = c.execute(
            "SELECT id, name, keywords FROM categories WHERE user_id=?",
            (user.id,),
        ).fetchall()
    if not user_cat_rows:
        raise HTTPException(400, "אין קורסים מוגדרים. צור קורס לפני הוספת משימות.")
    user_cat_names = [r["name"] for r in user_cat_rows]
    user_cat_by_name = {r["name"]: r["id"] for r in user_cat_rows}

    # Build per-user keyword dict from DB. Categories with no stored keywords
    # are omitted — keyword_classifier falls back to its hardcoded dict when
    # user_keywords is empty (backward-compat for Amit's courses pre-migration).
    user_keywords = {
        r["name"]: [k.strip() for k in (r["keywords"] or "").split(",") if k.strip()]
        for r in user_cat_rows
        if r["keywords"]
    }

    # ── Try code-first classification. AI only as fallback. ──
    code_category = keyword_classifier.classify(payload.text, user_keywords=user_keywords or None)
    # If keyword classifier returned a category the user doesn't have (e.g. a
    # friend without "פייתון"), fall through to AI.
    if code_category and code_category not in user_cat_names:
        code_category = None

    if code_category is not None:
        category_name = code_category
        title = payload.text.strip()
        ttype = "adhoc"
        place = None
        importance = payload.importance if payload.importance is not None else 3
        urgency = payload.urgency if payload.urgency is not None else 3
        due_at = None
        scheduled_at = None
        notes = None
    else:
        # Fall back to AI. Load user_context (per-user) for the prompt.
        with db.connect() as c:
            ctx_row = c.execute(
                "SELECT value FROM settings WHERE user_id=? AND key='user_context'",
                (user.id,),
            ).fetchone()
        user_context = (ctx_row["value"] if ctx_row else "") or ""

        try:
            classified = classifier.classify(
                payload.text,
                client_now=payload.client_now,
                user_context=user_context,
                user_categories=user_cat_names,
            )
        except groq_lib.InternalServerError:
            raise HTTPException(
                503,
                "המערכת זמנית עמוסה. נסה שוב בעוד כמה רגעים, או הוסף את המשימה עם מילת מפתח ברורה.",
            )
        except groq_lib.RateLimitError:
            raise HTTPException(
                429,
                "מכסת הזיהוי האוטומטי היומית הסתיימה. תוכל להוסיף משימות עם מילת מפתח ברורה. זיהוי חופשי יחזור מחר.",
            )
        except groq_lib.APIStatusError:
            raise HTTPException(
                502,
                "תקלה בזיהוי המשימה. נסה לנסח אחרת או להוסיף מילת מפתח ברורה.",
            )
        except RuntimeError:
            raise HTTPException(
                502,
                "תקלה בזיהוי המשימה. נסה לנסח אחרת או להוסיף מילת מפתח ברורה.",
            )

        category_name = classified.category_name
        # Defense-in-depth: AI may hallucinate a category the user doesn't have.
        if category_name not in user_cat_names:
            print(f"[WARN] AI returned unknown category {category_name!r} for user {user.id}; "
                  f"falling back to first user category.")
            category_name = user_cat_names[0]
        title = classified.title
        ttype = classified.type
        place = classified.place
        importance = payload.importance if payload.importance is not None else classified.importance
        urgency = payload.urgency if payload.urgency is not None else classified.urgency
        due_at = classified.due_at.replace(tzinfo=None) if classified.due_at else None
        scheduled_at = (
            classified.scheduled_at.replace(tzinfo=None) if classified.scheduled_at else None
        )
        notes = classified.notes

    # User-picked due_at overrides AI-computed value (and keyword-classifier's null).
    if payload.due_at:
        try:
            override = datetime.fromisoformat(payload.due_at)
            due_at = override.replace(tzinfo=None)
        except ValueError:
            pass  # malformed ISO string — keep whatever AI set

    cat_id = user_cat_by_name.get(category_name)
    if cat_id is None:
        print(f"[WARN] category {category_name!r} not in user {user.id}'s map; falling back")
        category_name = user_cat_names[0]
        cat_id = user_cat_by_name[category_name]
    with db.connect() as c:
        cur = c.execute(
            """INSERT INTO adhoc_tasks(
                user_id, category_id, title, type, place,
                importance, urgency, due_at, scheduled_at, notes, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')""",
            (
                user.id, cat_id, title, ttype, place,
                importance, urgency,
                due_at.isoformat() if due_at else None,
                scheduled_at.isoformat() if scheduled_at else None,
                notes,
            ),
        )
        new_id = cur.lastrowid

    return models.Task(
        id=f"a:{new_id}",
        category_id=cat_id,
        category_name=category_name,
        title=title,
        type=ttype,
        release_at=datetime.now(),
        due_at=due_at,
        scheduled_at=scheduled_at,
        place=place,
        importance=importance,
        urgency=urgency,
        notes=notes,
        status="open",
        source="adhoc",
    )


@app.get("/history")
def get_history(user: auth.User = Depends(auth.get_current_user)):
    """Completed and skipped tasks, with the semester week in which each occurred.

    Grouping by week is left to the frontend. We return a flat list sorted
    descending by completion date.
    """
    from datetime import date

    with db.connect() as c:
        sem_row = c.execute(
            "SELECT value FROM settings WHERE user_id=? AND key='semester_start'",
            (user.id,),
        ).fetchone()
        sem_start = date.fromisoformat(
            sem_row["value"] if sem_row else "2026-04-06"
        )

        recurring = c.execute(
            """
            SELECT comp.pattern_id, comp.occurrence_date, comp.status,
                   comp.notes, comp.updated_at,
                   p.kind, p.label,
                   cat.name AS category_name, cat.color_dark
            FROM completions comp
            JOIN recurring_patterns p ON p.id = comp.pattern_id
            JOIN categories cat ON cat.id = p.category_id
            WHERE comp.user_id=? AND comp.status IN ('done', 'skipped')
            ORDER BY comp.occurrence_date DESC
            """,
            (user.id,),
        ).fetchall()

        adhocs = c.execute(
            """
            SELECT t.id, t.title, t.type, t.status, t.created_at, t.due_at, t.notes,
                   cat.name AS category_name, cat.color_dark
            FROM adhoc_tasks t
            JOIN categories cat ON cat.id = t.category_id
            WHERE t.user_id=? AND t.status IN ('done', 'skipped')
            ORDER BY t.created_at DESC
            """,
            (user.id,),
        ).fetchall()

    def _week_of(iso_or_date) -> int:
        if iso_or_date is None:
            return 0
        d = (
            iso_or_date if hasattr(iso_or_date, "year")
            else date.fromisoformat(str(iso_or_date)[:10])
        )
        return ((d - sem_start).days // 7) + 1

    out = []
    for r in recurring:
        d = r["occurrence_date"]
        out.append({
            "id": f"r:{r['pattern_id']}:{d.isoformat() if hasattr(d, 'isoformat') else d}",
            "category_name": r["category_name"],
            "color": r["color_dark"],
            "title": r["label"] or r["kind"],
            "kind": r["kind"],
            "date": str(d)[:10],
            "week": _week_of(d),
            "status": r["status"],
            "notes": r["notes"],
            "completed_at": r["updated_at"],
            "source": "recurring",
        })
    for r in adhocs:
        out.append({
            "id": f"a:{r['id']}",
            "category_name": r["category_name"],
            "color": r["color_dark"],
            "title": r["title"],
            "kind": r["type"] or "adhoc",
            "date": str(r["due_at"] or r["created_at"])[:10],
            "week": _week_of(r["due_at"] or r["created_at"]),
            "status": r["status"],
            "notes": r["notes"],
            "completed_at": r["created_at"],
            "source": "adhoc",
        })
    out.sort(key=lambda x: x["completed_at"] or "", reverse=True)
    return out


@app.get("/tasks", response_model=list[models.Task])
def list_tasks(
    scope: Literal["today", "week", "all"] = "today",
    user: auth.User = Depends(auth.get_current_user),
):
    """Return tasks visible at the current moment.

    scope:
        today (default) — released-and-open with deadline within ~1d grace
        week            — released or releasing within next 7 days
        all             — everything (recurring + adhoc, regardless of status)
    """
    return compute.compute_tasks(datetime.now(), scope=scope, user_id=user.id)


def _parse_task_id(task_id: str) -> tuple[str, ...]:
    """'r:5:2026-04-28' → ('r', 5, date(2026,4,28))
       'a:42'           → ('a', 42)"""
    parts = task_id.split(":")
    try:
        if len(parts) == 3 and parts[0] == "r":
            return ("r", int(parts[1]), parts[2])  # keep date as ISO string for SQL
        if len(parts) == 2 and parts[0] == "a":
            return ("a", int(parts[1]))
    except ValueError:
        pass
    raise HTTPException(400, f"invalid task id: {task_id}")


_TASK_UPDATE_COLUMNS = {"status", "notes", "scheduled_at", "importance", "urgency", "place", "title", "category_id"}
# completions table has no title/category_id — filter these out for recurring tasks
_COMPLETION_UPDATE_COLUMNS = {"status", "notes", "scheduled_at", "importance", "urgency", "place"}


@app.patch("/tasks/{task_id}")
def update_task(
    task_id: str,
    payload: models.TaskUpdate,
    user: auth.User = Depends(auth.get_current_user),
) -> dict:
    """Update status / notes / scheduled_at / etc on a task.

    For recurring tasks (id="r:pattern:date"), updates completions table
    (insert if missing, update if present). The pattern MUST belong to the
    requesting user — verified before any write.
    For adhoc tasks (id="a:N"), updates adhoc_tasks row, scoped by user_id.
    """
    parts = _parse_task_id(task_id)
    fields = payload.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(400, "no fields to update")
    bad = set(fields) - _TASK_UPDATE_COLUMNS
    if bad:
        raise HTTPException(400, f"unknown fields: {sorted(bad)}")

    if parts[0] == "r":
        _, pattern_id, occ_date = parts
        # completions only stores occurrence-level overrides — title/category_id
        # live on the pattern itself and can't be changed per-occurrence.
        completion_fields = {k: v for k, v in fields.items() if k in _COMPLETION_UPDATE_COLUMNS}
        unsupported = {k for k in fields if k not in _COMPLETION_UPDATE_COLUMNS}
        if unsupported:
            raise HTTPException(
                400,
                f"fields {sorted(unsupported)} cannot be changed on recurring tasks; "
                "use status / notes / importance / urgency / place / scheduled_at",
            )
        with db.connect() as c:
            # Authorization: pattern must belong to this user.
            pat = c.execute(
                "SELECT 1 FROM recurring_patterns WHERE id=? AND user_id=?",
                (pattern_id, user.id),
            ).fetchone()
            if not pat:
                raise HTTPException(404, "task not found")

            if completion_fields:
                existing = c.execute(
                    "SELECT 1 FROM completions WHERE pattern_id=? AND occurrence_date=? AND user_id=?",
                    (pattern_id, occ_date, user.id),
                ).fetchone()
                if existing:
                    sets = ", ".join(f"{k}=?" for k in completion_fields)
                    vals = list(completion_fields.values()) + [pattern_id, occ_date, user.id]
                    c.execute(
                        f"UPDATE completions SET {sets}, updated_at=CURRENT_TIMESTAMP "
                        "WHERE pattern_id=? AND occurrence_date=? AND user_id=?",
                        vals,
                    )
                else:
                    cols = ["user_id", "pattern_id", "occurrence_date"] + list(completion_fields.keys())
                    placeholders = ", ".join("?" * len(cols))
                    vals = [user.id, pattern_id, occ_date] + list(completion_fields.values())
                    c.execute(
                        f"INSERT INTO completions({', '.join(cols)}) VALUES({placeholders})",
                        vals,
                    )
        return {"id": task_id, "updated": list(completion_fields.keys())}

    # adhoc
    _, adhoc_id = parts
    sets = ", ".join(f"{k}=?" for k in fields)
    vals = list(fields.values()) + [adhoc_id, user.id]
    with db.connect() as c:
        if "category_id" in fields and fields["category_id"] is not None:
            exists = c.execute(
                "SELECT 1 FROM categories WHERE id=? AND user_id=?",
                (fields["category_id"], user.id),
            ).fetchone()
            if not exists:
                raise HTTPException(422, "invalid category_id")
        cur = c.execute(
            f"UPDATE adhoc_tasks SET {sets} WHERE id=? AND user_id=?",
            vals,
        )
        if cur.rowcount == 0:
            raise HTTPException(404, "task not found")
    return {"id": task_id, "updated": list(fields.keys())}


@app.delete("/tasks/{task_id}")
def delete_task(
    task_id: str,
    user: auth.User = Depends(auth.get_current_user),
) -> dict:
    """Delete a task. Only adhoc tasks can be deleted; recurring are
    suppressed via status='skipped' instead."""
    parts = _parse_task_id(task_id)
    if parts[0] == "r":
        raise HTTPException(
            400, "cannot delete recurring task — use PATCH with status='skipped'"
        )
    _, adhoc_id = parts
    with db.connect() as c:
        cur = c.execute(
            "DELETE FROM adhoc_tasks WHERE id=? AND user_id=?",
            (adhoc_id, user.id),
        )
        if cur.rowcount == 0:
            raise HTTPException(404, "task not found")
    return {"id": task_id, "deleted": True}


# ─── Admin auth ────────────────────────────────────────────────────
# Admin access via EITHER:
#   1. Session cookie (signed in as user 1 via OAuth)
#   2. ?key=ADMIN_KEY query param (set ADMIN_KEY env var on Railway)
ADMIN_USER_ID = db.OWNER_USER_ID


def _is_admin(request: Request) -> bool:
    """Return True if the request is from the admin — via ?key= OR session cookie."""
    key = request.query_params.get("key", "")
    admin_key = os.environ.get("ADMIN_KEY", "")
    if admin_key and key == admin_key:
        return True
    # Verify session cookie directly (can't call get_current_user — it uses Cookie injection)
    cookie = request.cookies.get(auth.SESSION_COOKIE)
    if cookie:
        user_id = auth._read_cookie_value(cookie)
        if user_id == ADMIN_USER_ID:
            return True
    return False


@app.post("/feedback", status_code=201)
def submit_feedback(
    payload: dict,
    user: auth.User = Depends(auth.get_current_user),
) -> dict:
    text = str(payload.get("text", "")).strip()
    if not text:
        raise HTTPException(400, "text is empty")
    if len(text) > 4000:
        raise HTTPException(400, "text too long (max 4000 chars)")
    page = payload.get("page")
    if page is not None:
        page = str(page)[:200]
    with db.connect() as c:
        cur = c.execute(
            "INSERT INTO feedback(user_id, text, page) VALUES(?, ?, ?)",
            (user.id, text, page),
        )
    return {"id": cur.lastrowid, "ok": True}


@app.post("/admin/db-restore")
async def admin_db_restore(request: Request):
    """One-time DB upload. Protected by RESTORE_SECRET env var (not session auth).
    Delete the env var after use — endpoint becomes permanently forbidden."""
    secret = request.headers.get("x-restore-secret", "")
    expected = os.environ.get("RESTORE_SECRET", "")
    if not expected or secret != expected:
        raise HTTPException(403, "forbidden")
    data = await request.body()
    if len(data) < 1024:
        raise HTTPException(400, "body too small — not a valid SQLite file")
    tmp = db.DB_PATH.parent / "academic_restore_tmp.sqlite3"
    tmp.write_bytes(data)
    tmp.rename(db.DB_PATH)
    return {"wrote_bytes": len(data), "path": str(db.DB_PATH)}


@app.get("/admin/db-backup")
def admin_db_backup(user: auth.User = Depends(auth.get_current_user)):
    from fastapi.responses import FileResponse
    if user.id != ADMIN_USER_ID:
        raise HTTPException(403, "admin only")
    filename = f"academic-backup-{datetime.now().strftime('%Y%m%d-%H%M')}.sqlite3"
    return FileResponse(path=str(db.DB_PATH), filename=filename, media_type="application/octet-stream")


@app.get("/admin/backups")
def admin_list_backups(user: auth.User = Depends(auth.get_current_user)):
    if user.id != ADMIN_USER_ID:
        raise HTTPException(403, "admin only")
    backup_dir = db.DB_PATH.parent / "backups"
    if not backup_dir.exists():
        return []
    files = sorted(backup_dir.glob("academic-*.sqlite3"), reverse=True)
    return [{"name": f.name, "size_kb": round(f.stat().st_size / 1024)} for f in files]


@app.get("/admin/backups/{filename}")
def admin_download_backup(
    filename: str,
    user: auth.User = Depends(auth.get_current_user),
):
    from fastapi.responses import FileResponse
    if user.id != ADMIN_USER_ID:
        raise HTTPException(403, "admin only")
    if "/" in filename or "\\" in filename or not filename.endswith(".sqlite3"):
        raise HTTPException(400, "invalid filename")
    path = db.DB_PATH.parent / "backups" / filename
    if not path.exists():
        raise HTTPException(404, "backup not found")
    return FileResponse(path=str(path), filename=filename, media_type="application/octet-stream")


@app.get("/admin/feedback")
def admin_list_feedback(user: auth.User = Depends(auth.get_current_user)):
    if user.id != ADMIN_USER_ID:
        raise HTTPException(403, "admin only")
    with db.connect() as c:
        rows = c.execute(
            "SELECT f.id, f.text, f.page, f.created_at, "
            "       u.id AS user_id, u.email, u.name "
            "FROM feedback f JOIN users u ON u.id = f.user_id "
            "ORDER BY f.created_at DESC, f.id DESC"
        ).fetchall()
    return [dict(r) for r in rows]


@app.get("/admin/overview")
def admin_overview(request: Request):
    """All users with aggregate stats. Admin only (session or ?key=)."""
    if not _is_admin(request):
        raise HTTPException(403, "admin only")
    with db.connect() as c:
        rows = c.execute("""
            SELECT u.id, u.email, u.name, u.created_at,
                   COUNT(DISTINCT cat.id)                                          AS course_count,
                   COUNT(DISTINCT p.id)                                            AS pattern_count,
                   COUNT(DISTINCT CASE WHEN t.status='open' THEN t.id END)        AS tasks_open,
                   COUNT(DISTINCT CASE WHEN t.status='done' THEN t.id END)        AS tasks_done
            FROM users u
            LEFT JOIN categories cat ON cat.user_id = u.id
            LEFT JOIN recurring_patterns p  ON p.user_id  = u.id
            LEFT JOIN adhoc_tasks t         ON t.user_id  = u.id
            GROUP BY u.id
            ORDER BY u.created_at DESC
        """).fetchall()
    return [dict(r) for r in rows]


@app.post("/admin/users/{target_id}/reset")
def admin_reset_user(target_id: int, request: Request):
    """Wipe all data for target_id. Keeps the user row so they can log back in. Admin only."""
    if not _is_admin(request):
        raise HTTPException(403, "admin only")
    if target_id == ADMIN_USER_ID:
        raise HTTPException(400, "cannot reset admin account")
    with db.connect() as c:
        exists = c.execute("SELECT 1 FROM users WHERE id=?", (target_id,)).fetchone()
        if not exists:
            raise HTTPException(404, f"user {target_id} not found")

        c.execute("DELETE FROM adhoc_tasks       WHERE user_id=?", (target_id,))
        c.execute("DELETE FROM completions        WHERE user_id=?", (target_id,))
        c.execute("DELETE FROM recurring_patterns WHERE user_id=?", (target_id,))
        c.execute("DELETE FROM categories         WHERE user_id=?", (target_id,))
        c.execute("DELETE FROM settings           WHERE user_id=?", (target_id,))
        # Recreate the default "כללי" catch-all so the user isn't stuck on first load
        c.execute(
            "INSERT INTO categories(user_id, name, sort_order) VALUES (?,?,?)",
            (target_id, "כללי", 0),
        )
    print(f"[admin] user {target_id} reset")
    return {"ok": True, "user_id": target_id}


_ADMIN_PANEL_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Admin Panel — Academic Dashboard</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:system-ui,sans-serif;background:#f4f4f5;padding:32px;color:#18181b}
  h2{margin-bottom:20px;font-size:20px}
  #wrap{background:white;border-radius:10px;box-shadow:0 1px 6px rgba(0,0,0,.1);overflow:hidden}
  table{width:100%;border-collapse:collapse}
  th,td{padding:10px 16px;text-align:left;border-bottom:1px solid #f1f5f9;font-size:13.5px}
  th{background:#1e293b;color:#f8fafc;font-weight:600;font-size:12.5px;letter-spacing:.03em}
  tr:last-child td{border-bottom:none}
  tr:hover td{background:#f8fafc}
  .reset-btn{padding:4px 12px;border-radius:5px;border:none;cursor:pointer;font-size:12px;
    background:#dc2626;color:white;font-weight:600}
  .reset-btn:hover{background:#b91c1c}
  #msg{margin-top:14px;padding:10px 16px;border-radius:6px;font-size:13.5px;display:none}
  .ok{background:#dcfce7;color:#15803d} .err{background:#fee2e2;color:#dc2626}
  #reload{margin-bottom:16px;padding:6px 14px;border-radius:6px;border:1px solid #cbd5e1;
    background:white;cursor:pointer;font-size:13px}
</style>
</head>
<body>
<h2>&#127891; Admin Panel</h2>
<button id="reload" onclick="load()">&#8635; Refresh</button>
<div id="wrap"><em style="padding:16px;display:block">Loading…</em></div>
<div id="msg"></div>
<script>
const KP='__KEY_PARAM__';
async function load(){
  const wrap=document.getElementById('wrap');
  wrap.innerHTML='<em style="padding:16px;display:block">Loading…</em>';
  const r=await fetch('/admin/overview'+KP,{credentials:'include'});
  if(!r.ok){wrap.innerHTML='<b style="padding:16px;display:block;color:red">Error '+r.status+'</b>';return;}
  const data=await r.json();
  if(!data.length){wrap.innerHTML='<em style="padding:16px;display:block">No users yet.</em>';return;}
  let h='<table><tr><th>ID</th><th>Email</th><th>Name</th><th>Joined</th><th>Courses</th><th>Patterns</th><th>Tasks open/done</th><th></th></tr>';
  for(const u of data){
    const joined=(u.created_at||'').slice(0,10);
    const reset=u.id!==1?`<button class="reset-btn" onclick="resetUser(${u.id},'${(u.name||u.email||'user').replace(/'/g,'')}')">Reset</button>`:'<em style="color:#94a3b8;font-size:12px">admin</em>';
    h+=`<tr><td>${u.id}</td><td>${u.email||''}</td><td>${u.name||''}</td><td>${joined}</td><td>${u.course_count}</td><td>${u.pattern_count}</td><td>${u.tasks_open} / ${u.tasks_done}</td><td>${reset}</td></tr>`;
  }
  h+='</table>';
  wrap.innerHTML=h;
}
async function resetUser(id,name){
  if(!confirm('Reset '+name+'?\\nDeletes ALL their tasks, courses, and schedule.\\nThey can log back in and start fresh.'))return;
  const msg=document.getElementById('msg');
  msg.style.display='none';
  const r=await fetch('/admin/users/'+id+'/reset'+KP,{method:'POST',credentials:'include'});
  msg.style.display='block';
  if(r.ok){msg.className='ok';msg.textContent=name+' reset successfully.';load();}
  else{msg.className='err';msg.textContent='Error '+r.status;}
}
load();
</script>
</body>
</html>"""


@app.get("/admin", response_class=HTMLResponse, include_in_schema=False)
def admin_panel(request: Request):
    """Admin panel — access via ?key=ADMIN_KEY (no login needed) or session cookie."""
    if not _is_admin(request):
        return HTMLResponse(
            "<h2 style='font-family:system-ui;padding:32px'>Access denied."
            " Add <code>?key=YOUR_ADMIN_KEY</code> to the URL.</h2>",
            status_code=403,
        )
    key = request.query_params.get("key", "")
    key_param = f"?key={key}" if key else ""
    html = _ADMIN_PANEL_HTML.replace("__KEY_PARAM__", key_param)
    return HTMLResponse(html)
