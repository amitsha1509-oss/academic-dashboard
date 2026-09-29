"""SQLite storage: connection, schema migrations and first-run seed.

All dates are stored as local ISO strings: "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM".
Flexible data (custom property values, repeat rules, view configs) is JSON text.
"""
import json
import os
import sqlite3
from pathlib import Path

DATA_DIR = Path(os.environ.get("LIFEOS_DATA_DIR", Path(__file__).resolve().parents[2] / "data"))
DB_PATH = DATA_DIR / "lifeos.sqlite3"

# Starter item types: (id, name, icon, color, suggested fields). Colors are names from the UI palette.
STARTER_TYPES = [
    ("task", "משימה", "", "blue", ["due", "importance", "urgency", "effort", "parent"]),
    ("topic", "נושא", "", "purple", ["links"]),
    ("project", "פרויקט", "", "teal", ["span", "due", "parent"]),
    ("course", "קורס", "", "green", ["span", "links", "parent"]),
    ("lecture", "הרצאה", "", "orange", ["repeat", "parent"]),
    ("exam", "מבחן", "", "red", ["when", "parent", "importance"]),
    ("event", "אירוע", "", "yellow", ["when"]),
    ("idea", "רעיון", "", "pink", ["parent", "tags"]),
    ("note", "פתק", "", "gray", ["parent"]),
    ("person", "אדם", "", "brown", ["links"]),
    ("workout", "אימון", "", "teal", ["repeat", "parent"]),
    ("link", "קישור", "", "gray", ["links", "parent"]),
]


def _v2_calm_redesign(conn: sqlite3.Connection) -> None:
    """Redesign: no emoji icons, topic/project/note types, and built-in screens replace some views."""
    conn.execute("UPDATE types SET icon = ''")
    conn.execute("UPDATE views SET icon = ''")
    for i, (tid, name, icon, color, suggested) in enumerate(STARTER_TYPES):
        conn.execute("INSERT OR IGNORE INTO types (id, name, icon, color, suggested, sort) VALUES (?,?,?,?,?,?)",
                     (tid, name, icon, color, json.dumps(suggested), 100 + i))
    # The importance x urgency matrix and the by-type board are now built-in screens.
    conn.execute("DELETE FROM views WHERE id IN ('eisenhower', 'by-type')")


# Each entry runs once, in order. Never edit an entry that has shipped: append a new one.
MIGRATIONS = [
    """
    CREATE TABLE property_defs (
        id        TEXT PRIMARY KEY,
        name      TEXT NOT NULL,
        type      TEXT NOT NULL,          -- text | number | date | choice | multi | checkbox | url
        options   TEXT NOT NULL DEFAULT '[]',  -- choice/multi: [{"id","label","color"}]
        sort      INTEGER NOT NULL DEFAULT 0,
        archived  INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE types (
        id        TEXT PRIMARY KEY,
        name      TEXT NOT NULL,
        icon      TEXT NOT NULL DEFAULT '',
        color     TEXT NOT NULL DEFAULT 'gray',
        suggested TEXT NOT NULL DEFAULT '[]',  -- field keys offered first on items of this type
        sort      INTEGER NOT NULL DEFAULT 0,
        archived  INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE items (
        id             TEXT PRIMARY KEY,
        title          TEXT NOT NULL,
        notes          TEXT NOT NULL DEFAULT '',
        type_id        TEXT REFERENCES types(id),
        parent_id      TEXT REFERENCES items(id),
        status         TEXT NOT NULL DEFAULT 'open',  -- open | done | dropped
        inbox          INTEGER NOT NULL DEFAULT 0,
        when_at        TEXT,
        when_end       TEXT,
        due_at         TEXT,
        span_start     TEXT,
        span_end       TEXT,
        snooze_until   TEXT,
        repeat         TEXT,              -- JSON rule or NULL
        links          TEXT NOT NULL DEFAULT '[]',
        props          TEXT NOT NULL DEFAULT '{}',  -- {property_def_id: value}
        postpone_count INTEGER NOT NULL DEFAULT 0,
        archived       INTEGER NOT NULL DEFAULT 0,
        created_at     TEXT NOT NULL,
        updated_at     TEXT NOT NULL,
        completed_at   TEXT
    );
    CREATE INDEX idx_items_parent ON items(parent_id);
    CREATE TABLE occurrences (
        item_id  TEXT NOT NULL REFERENCES items(id),
        date     TEXT NOT NULL,
        status   TEXT NOT NULL,           -- done | skipped
        PRIMARY KEY (item_id, date)
    );
    CREATE TABLE views (
        id      TEXT PRIMARY KEY,
        name    TEXT NOT NULL,
        icon    TEXT NOT NULL DEFAULT '',
        config  TEXT NOT NULL DEFAULT '{}',
        sort    INTEGER NOT NULL DEFAULT 0
    );
    """,
    _v2_calm_redesign,
]


def connect(path: Path | None = None) -> sqlite3.Connection:
    path = path or DB_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def migrate(conn: sqlite3.Connection) -> None:
    version = conn.execute("PRAGMA user_version").fetchone()[0]
    fresh = version == 0
    for i, step in enumerate(MIGRATIONS[version:], start=version + 1):
        step(conn) if callable(step) else conn.executescript(step)
        conn.execute(f"PRAGMA user_version = {i}")
    if fresh:
        seed(conn)
    conn.commit()


def seed(conn: sqlite3.Connection) -> None:
    """Starter setup. Everything here is ordinary data the user can rename or delete."""
    props = [
        ("importance", "חשיבות", "choice", [
            {"id": "high", "label": "חשוב", "color": "red"},
            {"id": "low", "label": "לא חשוב", "color": "gray"}]),
        ("urgency", "דחיפות", "choice", [
            {"id": "high", "label": "דחוף", "color": "orange"},
            {"id": "low", "label": "לא דחוף", "color": "gray"}]),
        ("effort", "מאמץ", "choice", [
            {"id": "easy", "label": "קל", "color": "green"},
            {"id": "hard", "label": "קשה", "color": "purple"}]),
        ("tags", "תגיות", "multi", []),
    ]
    for i, (pid, name, ptype, options) in enumerate(props):
        conn.execute("INSERT INTO property_defs (id, name, type, options, sort) VALUES (?,?,?,?,?)",
                     (pid, name, ptype, json.dumps(options, ensure_ascii=False), i))

    types = STARTER_TYPES
    for i, (tid, name, icon, color, suggested) in enumerate(types):
        conn.execute("INSERT OR IGNORE INTO types (id, name, icon, color, suggested, sort) VALUES (?,?,?,?,?,?)",
                     (tid, name, icon, color, json.dumps(suggested), i))

    # Today, Inbox, Missed, Tasks (importance x urgency), Topics, Studies and Timeline are built-in
    # screens. Views are the user's own extra lists; these are examples to start from.
    views = [
        ("easy", "משימות קלות", "", {
            "sort": {"field": "due", "dir": "asc"},
            "filters": [{"field": "type", "op": "is", "value": ["task"]},
                        {"field": "effort", "op": "is", "value": ["easy"]}]}),
        ("ideas", "כל הרעיונות", "", {
            "groupBy": "parent",
            "filters": [{"field": "type", "op": "is", "value": ["idea"]}]}),
    ]
    for i, (vid, name, icon, config) in enumerate(views):
        conn.execute("INSERT OR IGNORE INTO views (id, name, icon, config, sort) VALUES (?,?,?,?,?)",
                     (vid, name, icon, json.dumps(config, ensure_ascii=False), i))
