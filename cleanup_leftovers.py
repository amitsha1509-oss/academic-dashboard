import requests, urllib.parse, sys
sys.stdout.reconfigure(encoding='utf-8')

s = requests.Session()
s.get('http://localhost:8001/auth/dev_login?user_id=1', allow_redirects=False)

# Delete leftover test adhoc tasks (14, 15, 16 from first test run)
for task_num in [14, 15, 16]:
    raw = f'a:{task_num}'
    enc = urllib.parse.quote(raw, safe='')
    r = s.delete(f'http://localhost:8001/tasks/{enc}')
    print(f'Delete {raw}: {r.status_code}')

# Delete leftover category 16 (vdv - from previous test run)
r = s.delete('http://localhost:8001/categories/16')
print(f'Delete cat 16: {r.status_code}')

# Check history state
h = s.get('http://localhost:8001/history').json()
print(f'History items: {len(h)}')
for item in h:
    print(f'  {item["id"]} | {item["status"]} | week={item["week"]}')
