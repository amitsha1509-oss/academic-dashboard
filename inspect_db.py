"""
inspect_db.py — print a human-readable summary of the SQLite database.

Run: .venv\\Scripts\\python.exe inspect_db.py

Shows: every user, their data counts, and the latest few rows so you can sanity-
check what's in the DB without learning SQL or installing a GUI.

For full editing / browsing, install **DB Browser for SQLite** (free):
  https://sqlitebrowser.org/dl/
Then File → Open Database → academic.sqlite3.
"""
import sqlite3
import sys
from pathlib import Path

DB = Path(__file__).parent / "academic.sqlite3"

def main():
    if not DB.exists():
        print(f"DB not found: {DB}")
        sys.exit(1)

    # Force stdout to UTF-8 so Hebrew prints correctly on Windows.
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    c = sqlite3.connect(DB)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys = ON")

    print(f"=== {DB} ===\n")

    # Users
    users = list(c.execute("SELECT * FROM users ORDER BY id"))
    print(f"USERS ({len(users)}):")
    for u in users:
        sub_status = "✓ OAuth-linked" if u["google_sub"] else "○ pre-seeded only"
        print(f"  #{u['id']}  {u['email']:30s} {u['name'] or '(no name)':15s} [{sub_status}]")
    print()

    # Per-user counts
    for u in users:
        uid = u["id"]
        cats = c.execute("SELECT COUNT(*) FROM categories WHERE user_id=?", (uid,)).fetchone()[0]
        pats = c.execute("SELECT COUNT(*) FROM recurring_patterns WHERE user_id=?", (uid,)).fetchone()[0]
        comps = c.execute("SELECT COUNT(*) FROM completions WHERE user_id=?", (uid,)).fetchone()[0]
        adhocs = c.execute("SELECT COUNT(*) FROM adhoc_tasks WHERE user_id=?", (uid,)).fetchone()[0]
        settings = c.execute("SELECT COUNT(*) FROM settings WHERE user_id=?", (uid,)).fetchone()[0]
        print(f"USER {uid} ({u['email']}):")
        print(f"  categories:        {cats}")
        print(f"  recurring patterns:{pats}")
        print(f"  completions:       {comps}")
        print(f"  adhoc tasks:       {adhocs}")
        print(f"  settings keys:     {settings}")

        if cats:
            print(f"  --- categories ---")
            for cat in c.execute(
                "SELECT id, name, self_confidence, gap_notes FROM categories "
                "WHERE user_id=? ORDER BY sort_order, id", (uid,),
            ):
                conf = cat["self_confidence"] or "—"
                gap = (cat["gap_notes"] or "")[:50]
                print(f"    [{cat['id']:3d}] {cat['name']:30s} conf={conf:10s} gap={gap}")

        if adhocs:
            print(f"  --- latest 5 adhoc tasks ---")
            for t in c.execute(
                "SELECT id, title, status, created_at FROM adhoc_tasks "
                "WHERE user_id=? ORDER BY id DESC LIMIT 5", (uid,),
            ):
                print(f"    [{t['id']:3d}] {(t['title'] or '')[:40]:40s} {t['status']:8s} {t['created_at']}")

        print()

    # FK integrity
    violations = c.execute("PRAGMA foreign_key_check").fetchall()
    print(f"FK integrity: {'CLEAN' if not violations else f'{len(violations)} VIOLATIONS'}")
    if violations:
        for v in violations[:5]:
            print("  ", tuple(v))


if __name__ == "__main__":
    main()
