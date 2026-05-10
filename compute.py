"""
compute.py — materialization logic. The heart of the system.

Given the current time and a scope, computes the list of virtual task
instances by joining recurring_patterns × occurrence dates × completions
and merging adhoc_tasks.

Per BUILDING_PRINCIPLES.md, this is the ONLY module that knows how to
turn a pattern into concrete task instances. It's tested in isolation
(no FastAPI / no AI dependencies).
"""
import json
from datetime import date, datetime, time, timedelta
from typing import Iterable, Literal, Optional

import db
import models


# Day-of-week names (English) → Python weekday() codes (Mon=0)
DAY_OFFSET = {"Mon": 0, "Tue": 1, "Wed": 2, "Thu": 3, "Fri": 4, "Sat": 5, "Sun": 6}

# Hebrew day labels — for title rendering
HE_DAY = {"Mon": "ב׳", "Tue": "ג׳", "Wed": "ד׳", "Thu": "ה׳", "Fri": "ו׳", "Sat": "ש׳", "Sun": "א׳"}
HE_DAY_BY_WEEKDAY = {0: "ב׳", 1: "ג׳", 2: "ד׳", 3: "ה׳", 4: "ו׳", 5: "ש׳", 6: "א׳"}


def week_number(semester_start: date, d: date) -> int:
    """Which semester week does date `d` fall in? Week 1 = semester_start week."""
    return ((d - semester_start).days // 7) + 1


# Defaults when the user hasn't overridden importance/urgency on an instance.
# By kind. The user can override per-instance via PATCH (stored in completions).
DEFAULT_IMPORTANCE = {"hw": 4, "reading": 3, "lecture": 3, "tutorial": 2}
DEFAULT_URGENCY    = {"hw": 4, "reading": 3, "lecture": 3, "tutorial": 2}
DEFAULT_PLACE      = {"hw": "home", "reading": "home", "lecture": "university", "tutorial": "university"}


def date_in_week(semester_start: date, week: int, day_of_week: str) -> date:
    """Return the date of the given weekday in the given semester week.
    `semester_start` is week 1 Monday.
    """
    monday = semester_start + timedelta(weeks=week - 1)
    return monday + timedelta(days=DAY_OFFSET[day_of_week])


def parse_time(hhmm: Optional[str]) -> time:
    """'HH:MM' → time. None or empty → 00:00."""
    if not hhmm:
        return time(0, 0)
    h, m = map(int, hhmm.split(":"))
    return time(h, m)


def materialize_pattern(
    pattern: dict,
    occurrence_date: date,
) -> tuple[Optional[datetime], Optional[datetime]]:
    """Compute (release_at, due_at) for a specific occurrence of a pattern.

    Rules:
    - lecture/tutorial: release_at = occurrence_date at start_time.
                        due_at = occurrence_date + 7d at end_time
                        (allow ~1 week to watch recording / catch up).
    - hw:               release_at = occurrence_date at hw_release_time.
                        due_at = occurrence_date + hw_due_offset_days at hw_due_time.
    - reading:          release_at = occurrence_date - 7d at 00:00.
                        due_at = occurrence_date at start_time (lecture start).
    """
    kind = pattern["kind"]

    if kind in ("lecture", "tutorial"):
        # Lectures/tutorials are time-of-day events. They appear on their
        # day and disappear the next day. No artificial multi-day "due".
        rel = datetime.combine(occurrence_date, parse_time(pattern["start_time"]))
        due = datetime.combine(occurrence_date,
                               parse_time(pattern.get("end_time") or pattern["start_time"]))
        return rel, due

    if kind == "hw":
        rel = datetime.combine(occurrence_date, parse_time(pattern["hw_release_time"]))
        due = datetime.combine(
            occurrence_date + timedelta(days=pattern["hw_due_offset_days"] or 7),
            parse_time(pattern["hw_due_time"]),
        )
        return rel, due

    if kind == "reading":
        # Released on the day of the lecture itself (morning).
        # Earlier release isn't useful — the user sees it days before the prof
        # actually uploads anything.
        rel = datetime.combine(occurrence_date, time(7, 0))
        due = datetime.combine(occurrence_date, parse_time(pattern["start_time"]))
        return rel, due

    raise ValueError(f"unknown pattern kind: {kind}")


def occurrence_dates(pattern: dict, semester_start: date, semester_end: date) -> Iterable[date]:
    """Yield each calendar date this pattern fires on."""
    weeks = json.loads(pattern.get("weeks_active") or "[]")
    if pattern["kind"] == "hw":
        # HW occurrence is keyed off hw_release_day
        day_name = pattern["hw_release_day"]
    else:
        day_name = pattern["day_of_week"]

    if not day_name:
        return

    for week in weeks:
        d = date_in_week(semester_start, week, day_name)
        if semester_start <= d <= semester_end:
            yield d


def _to_dt(s) -> Optional[datetime]:
    """Parse a datetime, always returning offset-naive (drop tz info).
    The whole app uses naive datetimes (server is in user's timezone)."""
    if not s:
        return None
    if isinstance(s, datetime):
        dt = s
    else:
        try:
            dt = datetime.fromisoformat(s)
        except (ValueError, TypeError):
            return None
    return dt.replace(tzinfo=None) if dt.tzinfo else dt


def compute_tasks(
    now: datetime,
    scope: Literal["today", "week", "all"] = "today",
    *,
    user_id: int,
) -> list[models.Task]:
    """Materialize all task instances visible at `now` for the given scope,
    scoped to the given user_id.

    scope:
        "today" — release_at <= now AND status != done/skipped
                  AND due_at >= now - 14d (don't surface ancient overdue)
        "week"  — release_at <= now + 7d AND status != done/skipped
        "all"   — every instance + every adhoc, regardless of status

    Result is sorted by due_at ascending (no due_at → at end).
    """
    out: list[models.Task] = []

    with db.connect() as c:
        patterns = [dict(r) for r in c.execute(
            "SELECT * FROM recurring_patterns WHERE user_id=?",
            (user_id,),
        )]
        cats = {r["id"]: dict(r) for r in c.execute(
            "SELECT * FROM categories WHERE user_id=?",
            (user_id,),
        )}
        completions = {}
        for r in c.execute(
            "SELECT * FROM completions WHERE user_id=?",
            (user_id,),
        ):
            od = r["occurrence_date"]
            if hasattr(od, "isoformat"):
                od = od.isoformat()
            completions[(r["pattern_id"], od)] = dict(r)
        adhoc = [dict(r) for r in c.execute(
            "SELECT * FROM adhoc_tasks WHERE user_id=?",
            (user_id,),
        )]
        settings = {
            r["key"]: r["value"]
            for r in c.execute(
                "SELECT key, value FROM settings WHERE user_id=?",
                (user_id,),
            )
        }

    sem_start = date.fromisoformat(settings.get("semester_start", "2026-04-06"))
    sem_end = date.fromisoformat(settings.get("semester_end", "2026-07-05"))
    # Don't materialize occurrences before this date.
    dashboard_start = date.fromisoformat(
        settings.get("dashboard_start_date", sem_start.isoformat())
    )
    # Per-kind priorities derived from user_context (if set).
    # JSON: {"lecture": {"importance": 4, "urgency": 5}, ...}
    kind_pri = json.loads(settings.get("kind_priorities") or "{}")

    # ── Recurring instances ──
    # Today scope rule: anything released and not done/skipped stays visible.
    # No "overdue window" — undone tasks just stay until user marks them.

    for p in patterns:
        cat = cats.get(p["category_id"])
        if not cat:
            continue
        for occ_date in occurrence_dates(p, sem_start, sem_end):
            # Skip occurrences before the dashboard start date entirely.
            if occ_date < dashboard_start:
                continue

            rel_at, due_at = materialize_pattern(p, occ_date)

            # Look up completion
            comp = completions.get((p["id"], occ_date.isoformat()))
            status = (comp["status"] if comp else None) or "open"

            is_required = bool(p.get("is_required"))

            # Apply scope filter
            if scope == "today":
                if rel_at and rel_at.date() > now.date():
                    continue  # release on a future day → not yet
                if status in ("done", "skipped"):
                    continue
                if not is_required:
                    # Informational task — show only on its day
                    if not rel_at or rel_at.date() != now.date():
                        continue
                # else (is_required): show until done — past undone stays
            elif scope == "week":
                # Release in current 7-day window OR due in current 7-day window
                # Excludes far-future and far-past
                week_start = now - timedelta(days=1)
                week_end = now + timedelta(days=7)
                rel_in_week = rel_at and week_start <= rel_at <= week_end
                due_in_week = due_at and week_start <= due_at <= week_end
                if not (rel_in_week or due_in_week):
                    continue
                if rel_at and rel_at.date() > now.date():
                    continue  # release is on a future day
                if status in ("done", "skipped"):
                    continue
            # else "all" → no filter

            label = p.get("label") or p["kind"]
            wn = week_number(sem_start, occ_date)
            day_he = HE_DAY_BY_WEEKDAY[occ_date.weekday()]
            title = f"{label} — יום {day_he} {occ_date.strftime('%d/%m')} · שבוע {wn}"

            # Priority order for importance/urgency (most → least specific):
            #   1. Per-instance completion override (user touched this exact task)
            #   2. Pattern override (Settings → Schedule, applies to every instance of this pattern)
            #   3. max(category default, kind override from user_context AI)
            #   4. Hardcoded kind default (HW=4, lecture=3, etc.)
            comp_dict = comp or {}
            pat_imp = p.get("default_importance")
            pat_urg = p.get("default_urgency")
            cat_imp = cat.get("default_importance")
            cat_urg = cat.get("default_urgency")
            k = kind_pri.get(p["kind"]) or {}
            kind_ai_imp = k.get("importance")
            kind_ai_urg = k.get("urgency")

            ai_imp_max = max([v for v in (cat_imp, kind_ai_imp) if v], default=None)
            ai_urg_max = max([v for v in (cat_urg, kind_ai_urg) if v], default=None)

            importance = (
                comp_dict.get("importance")
                or pat_imp
                or ai_imp_max
                or DEFAULT_IMPORTANCE.get(p["kind"], 3)
            )
            urgency = (
                comp_dict.get("urgency")
                or pat_urg
                or ai_urg_max
                or DEFAULT_URGENCY.get(p["kind"], 3)
            )
            place = comp_dict.get("place") or DEFAULT_PLACE.get(p["kind"])

            # Due-date escalation: anything due today or tomorrow → escalate to urgent.
            # Skipped when the user has explicitly set urgency for this occurrence —
            # their override wins. Only applies when urgency came from the default chain.
            if comp_dict.get("urgency") is None and due_at and due_at.date() <= (now + timedelta(days=1)).date():
                urgency = 5

            out.append(models.Task(
                id=f"r:{p['id']}:{occ_date.isoformat()}",
                category_id=p["category_id"],
                category_name=cat["name"],
                title=title,
                type=p["kind"],
                release_at=rel_at,
                due_at=due_at,
                scheduled_at=_to_dt(comp_dict.get("scheduled_at")),
                place=place,
                importance=importance,
                urgency=urgency,
                notes=comp_dict.get("notes"),
                status=status,
                source="recurring",
            ))

    # ── Adhoc tasks ──
    for a in adhoc:
        rel = _to_dt(a.get("release_at"))
        due = _to_dt(a.get("due_at"))
        status = a.get("status") or "open"

        if scope == "today":
            # Same simple rule as recurring: released and not done/skipped.
            if rel and rel.date() > now.date():
                continue
            if status in ("done", "skipped"):
                continue
        elif scope == "week":
            week_start = now - timedelta(days=1)
            week_end = now + timedelta(days=7)
            rel_in_week = rel and week_start <= rel <= week_end
            due_in_week = due and week_start <= due <= week_end
            if not (rel_in_week or due_in_week):
                continue
            if rel and rel.date() > now.date():
                continue
            if status in ("done", "skipped"):
                continue

        cat = cats.get(a["category_id"])
        if not cat:
            continue

        urgency = a.get("urgency")
        # Due-date escalation: anything due today or tomorrow → escalate to urgent.
        # Only when the user hasn't explicitly set urgency (same guard as recurring tasks).
        if a.get("urgency") is None and due and due.date() <= (now + timedelta(days=1)).date():
            urgency = 5

        out.append(models.Task(
            id=f"a:{a['id']}",
            category_id=a["category_id"],
            category_name=cat["name"],
            title=a["title"],
            type=a.get("type") or "adhoc",
            release_at=rel,
            due_at=due,
            scheduled_at=_to_dt(a.get("scheduled_at")),
            place=a.get("place"),
            importance=a.get("importance"),
            urgency=urgency,
            notes=a.get("notes"),
            status=status,
            source="adhoc",
        ))

    out.sort(key=lambda t: (t.due_at or datetime.max))
    return out
