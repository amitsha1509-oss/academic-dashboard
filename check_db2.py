import sqlite3
import sys
sys.stdout.reconfigure(encoding='utf-8')

conn = sqlite3.connect(r'C:\Users\amit shani\academic_dashboard\academic.sqlite3')
conn.row_factory = sqlite3.Row
c = conn.cursor()

# Check done/skipped adhoc tasks
c.execute("SELECT * FROM adhoc_tasks WHERE status IN ('done', 'skipped') AND user_id=1 ORDER BY id DESC")
rows = c.fetchall()
print("Done/skipped adhoc tasks:")
for r in rows:
    print(dict(r))

# Check categories table
c.execute("SELECT id, name FROM categories WHERE user_id=1 ORDER BY id")
cats = c.fetchall()
print("\nAll categories for user 1:", [(r['id'], r['name']) for r in cats])

# Check completions
c.execute("SELECT * FROM completions WHERE user_id=1 ORDER BY updated_at DESC LIMIT 10")
rows = c.fetchall()
print("\nRecent completions for user 1:")
for r in rows:
    print(dict(r))

conn.close()
