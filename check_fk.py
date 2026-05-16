import sqlite3
import sys
sys.stdout.reconfigure(encoding='utf-8')

conn = sqlite3.connect(r'C:\Users\amit shani\academic_dashboard\academic.sqlite3')
conn.row_factory = sqlite3.Row
c = conn.cursor()

# Check foreign key constraints on adhoc_tasks
c.execute("PRAGMA foreign_keys")
fk_enabled = c.fetchone()[0]
print("Foreign keys enabled:", fk_enabled)

# Get create statement for adhoc_tasks to see ON DELETE behavior
c.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='adhoc_tasks'")
row = c.fetchone()
print("\nadhoc_tasks CREATE:")
print(row['sql'])

# Also check categories
c.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='categories'")
row = c.fetchone()
print("\ncategories CREATE:")
print(row['sql'])

conn.close()
