from datetime import date

from app.recurrence import occurrence_dates


def test_weekly_on_sunday_and_tuesday():
    rule = {"freq": "weekly", "weekdays": [0, 2], "start": "2026-10-25", "until": "2026-11-05"}
    got = occurrence_dates(rule, date(2026, 10, 1), date(2026, 12, 1))
    assert [d.isoformat() for d in got] == ["2026-10-25", "2026-10-27", "2026-11-01", "2026-11-03"]


def test_every_second_week():
    rule = {"freq": "weekly", "interval": 2, "weekdays": [0], "start": "2026-10-25"}
    got = occurrence_dates(rule, date(2026, 10, 25), date(2026, 11, 22))
    assert [d.isoformat() for d in got] == ["2026-10-25", "2026-11-08", "2026-11-22"]


def test_daily_with_interval_respects_start_phase():
    rule = {"freq": "daily", "interval": 3, "start": "2026-10-01"}
    got = occurrence_dates(rule, date(2026, 10, 5), date(2026, 10, 12))
    assert [d.isoformat() for d in got] == ["2026-10-07", "2026-10-10"]


def test_monthly_skips_short_months():
    rule = {"freq": "monthly", "start": "2026-01-31"}
    got = occurrence_dates(rule, date(2026, 1, 1), date(2026, 5, 31))
    assert [d.isoformat() for d in got] == ["2026-01-31", "2026-03-31", "2026-05-31"]


def test_range_before_start_is_empty():
    rule = {"freq": "daily", "start": "2026-10-01"}
    assert occurrence_dates(rule, date(2026, 9, 1), date(2026, 9, 30)) == []
