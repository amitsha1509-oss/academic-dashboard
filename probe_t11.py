import requests, json, sys, urllib.parse
sys.stdout.reconfigure(encoding='utf-8')

s = requests.Session()
s.get('http://localhost:8001/auth/dev_login?user_id=1', allow_redirects=False)

# Create a fresh category, task, mark done, delete category, check history
cat_r = s.post('http://localhost:8001/categories', json={'name': 'T11_TEST_CAT', 'color': 'ABCDEF'})
cat = cat_r.json()
cat_id = cat['id']
print('Created category id:', cat_id)

# Create task with this specific category
task_r = s.post('http://localhost:8001/tasks', json={'text': 'T11_TEST_TASK', 'category_id': cat_id})
task = task_r.json()
raw_id = task['id']
actual_cat_id = task.get('category_id')
print(f'Created task: id={raw_id}, category_id={actual_cat_id}, category_name={task.get("category_name")}')

enc = urllib.parse.quote(raw_id, safe='')

# Mark done
pr = s.patch(f'http://localhost:8001/tasks/{enc}', json={'status': 'done'})
print('Mark done:', pr.status_code)

# Delete category
dr = s.delete(f'http://localhost:8001/categories/{cat_id}')
print(f'Delete category {cat_id}:', dr.status_code)

# Check history
h = s.get('http://localhost:8001/history').json()
matched = [i for i in h if i['id'] == raw_id]
print('Found in history:', len(matched))
if matched:
    item = matched[0]
    print(f'  id={item["id"]}, category_name="{item["category_name"]}", status={item["status"]}')
else:
    print('  NOT in history (bug!)')

# Cleanup
s.post(f'http://localhost:8001/tasks/{enc}/restore')
s.delete(f'http://localhost:8001/tasks/{enc}')
print('Cleaned up')
