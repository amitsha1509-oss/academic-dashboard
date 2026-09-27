"""Automatic daily backups of the database file, keeping the last KEEP days."""
import sqlite3
from datetime import date

from . import db

KEEP = 14


def daily(conn: sqlite3.Connection) -> None:
    folder = db.DATA_DIR / "backups"
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / f"lifeos-{date.today().isoformat()}.sqlite3"
    if target.exists():
        return
    dest = sqlite3.connect(target)
    try:
        conn.backup(dest)
    finally:
        dest.close()
    for old in sorted(folder.glob("lifeos-*.sqlite3"))[:-KEEP]:
        old.unlink()
