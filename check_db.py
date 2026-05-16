import sqlite3
import sys
sys.stdout.reconfigure(encoding='utf-8')

conn = sqlite3.connect(r'C:\Users\amit shani\academic_dashboard\academic.sqlite3')
conn.row_factory = sqlite3.Row

# Check adhoc_tasks table structure
c = conn.cursor()
c.execute("PRAGMA table_info(adhoc_tasks)")
cols = c.fetchall()
print("adhoc_tasks columns:", [col['name'] for col in cols])

# Check recent adhoc tasks
c.execute("SELECT * FROM adhoc_tasks ORDER BY id DESC LIMIT 10")
rows = c.fetchall()
for r in rows:
    print(dict(r))

# Check categories
c.execute("SELECT id, name FROM categories ORDER BY id DESC LIMIT 5")
cats = c.fetchall()
print("\nRecent categories:", [(r['id'], r['name']) for r in cats])

conn.close()
