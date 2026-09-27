"""Expand a repeat rule into concrete dates. Pure functions, no database.

Rule shape (stored as JSON on the item):
    {
      "freq": "daily" | "weekly" | "monthly",
      "interval": 1,               # every N days / weeks / months
      "weekdays": [0, 2],          # weekly only; 0 = Sunday ... 6 = Saturday
      "start": "2026-10-25",
      "until": "2027-01-20",       # optional, inclusive
      "time": "10:00",             # optional
      "end_time": "11:30",         # optional
      "track_missed": true         # past occurrences not marked done count as missed
    }
"""
from datetime import date, timedelta


def sunday_weekday(d: date) -> int:
    """0 = Sunday ... 6 = Saturday (Israeli week)."""
    return (d.weekday() + 1) % 7


def week_start(d: date) -> date:
    return d - timedelta(days=sunday_weekday(d))


def occurrence_dates(rule: dict, frm: date, to: date) -> list[date]:
    """All dates in [frm, to] (inclusive) on which the rule occurs."""
    if not rule or "start" not in rule:
        return []
    start = date.fromisoformat(rule["start"])
    until = date.fromisoformat(rule["until"]) if rule.get("until") else None
    interval = max(1, int(rule.get("interval") or 1))
    freq = rule.get("freq", "weekly")

    lo = max(frm, start)
    hi = min(to, until) if until else to
    if lo > hi:
        return []

    out: list[date] = []
    if freq == "daily":
        offset = (lo - start).days % interval
        d = lo if offset == 0 else lo + timedelta(days=interval - offset)
        while d <= hi:
            out.append(d)
            d += timedelta(days=interval)
    elif freq == "weekly":
        weekdays = set(rule.get("weekdays") or [sunday_weekday(start)])
        anchor = week_start(start)
        d = lo
        while d <= hi:
            weeks = (week_start(d) - anchor).days // 7
            if weeks % interval == 0 and sunday_weekday(d) in weekdays:
                out.append(d)
            d += timedelta(days=1)
    elif freq == "monthly":
        months = 0
        while True:
            m = start.month - 1 + months
            y, m = start.year + m // 12, m % 12 + 1
            try:
                d = date(y, m, start.day)
            except ValueError:  # e.g. 31st in a 30-day month: skip that month
                d = None
            if d and d > hi:
                break
            if d and d >= lo:
                out.append(d)
            if date(y, m, 1) > hi:
                break
            months += interval
    return out
