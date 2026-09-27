"""The self-maintaining part: computes Today and Missed from items + occurrence records.

Pure functions over plain dicts (API-shaped items), so they are easy to test.
"""
from datetime import date, datetime, timedelta

from .recurrence import occurrence_dates

MISSED_LOOKBACK_DAYS = 60
POSTPONE_FLAG = 2
INBOX_STALE_DAYS = 3


def day_of(value: str | None) -> date | None:
    return date.fromisoformat(value[:10]) if value else None


def is_active(item: dict) -> bool:
    return not item["archived"] and item["status"] != "dropped"


def is_snoozed(item: dict, today: date) -> bool:
    d = day_of(item.get("snooze_until"))
    return d is not None and d > today


def expand(items: list[dict], records: dict[tuple[str, str], str], frm: date, to: date) -> list[dict]:
    """Occurrences of repeating items within [frm, to], with their done/skipped status."""
    out = []
    for it in items:
        rule = it.get("repeat")
        if not rule or not is_active(it):
            continue
        for d in occurrence_dates(rule, frm, to):
            key = d.isoformat()
            out.append({
                "item_id": it["id"],
                "date": key,
                "time": rule.get("time"),
                "end_time": rule.get("end_time"),
                "status": records.get((it["id"], key), "open"),
            })
    out.sort(key=lambda o: (o["date"], o["time"] or "99:99"))
    return out


def today_view(items: list[dict], records: dict, today: date) -> dict:
    live = [it for it in items if is_active(it)]
    visible = [it for it in live if not is_snoozed(it, today)]
    t = today.isoformat()

    schedule = [{"kind": "occurrence", **o} for o in expand(live, records, today, today)]
    for it in visible:
        if not it.get("repeat") and day_of(it.get("when_at")) == today:
            time = it["when_at"][11:16] or None
            schedule.append({"kind": "item", "item_id": it["id"], "date": t, "time": time,
                             "end_time": (it.get("when_end") or "")[11:16] or None,
                             "status": it["status"]})
    schedule.sort(key=lambda e: e["time"] or "99:99")

    open_ = [it for it in visible if it["status"] == "open" and not it.get("repeat")]
    due_today = [it["id"] for it in open_ if day_of(it.get("due_at")) == today]
    overdue = [it["id"] for it in open_ if (d := day_of(it.get("due_at"))) and d < today]
    returned = [it["id"] for it in live if it["status"] == "open"
                and (d := day_of(it.get("snooze_until"))) and d <= today]

    horizon = today + timedelta(days=7)
    upcoming = []
    for it in visible:
        if it.get("repeat") or it["status"] != "open":
            continue
        dates = [d for d in (day_of(it.get("when_at")), day_of(it.get("due_at")), day_of(it.get("span_start")))
                 if d and today < d <= horizon]
        if dates:
            upcoming.append((min(dates).isoformat(), it["id"]))
    upcoming.sort()

    return {
        "date": t,
        "schedule": schedule,
        "due_today": due_today,
        "overdue": overdue,
        "returned": returned,
        "upcoming": [{"date": d, "item_id": i} for d, i in upcoming],
    }


def missed_view(items: list[dict], records: dict, today: date) -> dict:
    live = [it for it in items if is_active(it)]
    yesterday = today - timedelta(days=1)
    lookback = today - timedelta(days=MISSED_LOOKBACK_DAYS)

    tracked = [it for it in live if it.get("repeat") and it["repeat"].get("track_missed", True)]
    occurrences = [o for o in expand(tracked, records, lookback, yesterday) if o["status"] == "open"]
    occurrences.sort(key=lambda o: o["date"], reverse=True)

    open_ = [it for it in live if it["status"] == "open" and not it.get("repeat")]
    overdue = [it["id"] for it in open_ if (d := day_of(it.get("due_at"))) and d < today]
    past_unmarked = [it["id"] for it in open_ if not it.get("due_at")
                     and (d := day_of(it.get("when_at"))) and d < today]
    postponed = [it["id"] for it in open_ if it.get("postpone_count", 0) >= POSTPONE_FLAG]
    stale_cutoff = datetime.combine(today - timedelta(days=INBOX_STALE_DAYS), datetime.min.time())
    stale_inbox = [it["id"] for it in open_ if it["inbox"]
                   and datetime.fromisoformat(it["created_at"]) < stale_cutoff]

    return {
        "date": today.isoformat(),
        "occurrences": occurrences,
        "overdue": overdue,
        "past_unmarked": past_unmarked,
        "postponed": postponed,
        "stale_inbox": stale_inbox,
    }
