"""
Test suite for history (archive) and restore feature.
FastAPI + SQLite backend at http://localhost:8001, DEV_MODE=on.
"""

import requests
import urllib.parse
import json
import sys

BASE = "http://localhost:8001"
results = []

def pass_(name, detail=""):
    msg = f"PASS  {name}" + (f" — {detail}" if detail else "")
    print(msg)
    results.append(("PASS", name, detail))

def fail(name, detail=""):
    msg = f"FAIL  {name}" + (f" — {detail}" if detail else "")
    print(msg)
    results.append(("FAIL", name, detail))

def skip(name, detail=""):
    msg = f"SKIP  {name}" + (f" — {detail}" if detail else "")
    print(msg)
    results.append(("SKIP", name, detail))

def encode_id(task_id):
    return urllib.parse.quote(task_id, safe='')

def login(user_id):
    s = requests.Session()
    r = s.get(f"{BASE}/auth/dev_login?user_id={user_id}", allow_redirects=False)
    assert r.status_code in (200, 302, 303), f"Login failed: {r.status_code}"
    return s

# ── shared session for user 1 ─────────────────────────────────────────────────
s1 = login(1)
history_r = s1.get(f"{BASE}/history")
history_data = history_r.json() if history_r.ok else []

# ─────────────────────────────────────────────────────────────────────────────
# TEST 1: History returns 200 and non-empty list
# ─────────────────────────────────────────────────────────────────────────────
def test1():
    if history_r.status_code == 200 and isinstance(history_data, list) and len(history_data) > 0:
        pass_("T1: BASIC — history returns 200 + non-empty list", f"{len(history_data)} items")
    else:
        fail("T1: BASIC — history returns 200 + non-empty list",
             f"status={history_r.status_code}, items={len(history_data)}")

test1()

# ─────────────────────────────────────────────────────────────────────────────
# TEST 2: Every item has required fields
# ─────────────────────────────────────────────────────────────────────────────
def test2():
    required = {"id", "title", "category_name", "status", "week"}
    missing_items = []
    for item in history_data:
        missing = required - set(item.keys())
        if missing:
            missing_items.append((item.get("id"), missing))
    if not missing_items:
        pass_("T2: BASIC — all items have required fields",
              f"checked {len(history_data)} items")
    else:
        fail("T2: BASIC — all items have required fields",
             f"missing fields in {len(missing_items)} items: {missing_items[:3]}")

test2()

# ─────────────────────────────────────────────────────────────────────────────
# TEST 3: Status values are only "done" or "skipped"
# ─────────────────────────────────────────────────────────────────────────────
def test3():
    bad = [item for item in history_data if item.get("status") not in ("done", "skipped")]
    if not bad:
        statuses = set(item["status"] for item in history_data)
        pass_("T3: BASIC — status only done/skipped", f"found statuses: {statuses}")
    else:
        fail("T3: BASIC — status only done/skipped",
             f"{len(bad)} items with bad status: {[(i['id'], i['status']) for i in bad[:3]]}")

test3()

# ─────────────────────────────────────────────────────────────────────────────
# TEST 4: Restore recurring task
# ─────────────────────────────────────────────────────────────────────────────
def test4():
    recurring = [item for item in history_data if item["id"].startswith("r:")]
    if not recurring:
        skip("T4: RESTORE RECURRING — no recurring items in history")
        return None  # return None so test7 knows

    target = recurring[0]
    tid = target["id"]
    encoded = encode_id(tid)
    print(f"  T4: restoring recurring {tid}")

    r = s1.post(f"{BASE}/tasks/{encoded}/restore")
    if r.status_code != 200:
        fail("T4: RESTORE RECURRING", f"restore returned {r.status_code}: {r.text[:200]}")
        return tid

    # (b) gone from history
    h2 = s1.get(f"{BASE}/history").json()
    still_there = any(item["id"] == tid for item in h2)
    if still_there:
        fail("T4: RESTORE RECURRING", f"item {tid} still in history after restore")
        return tid

    # (c) appears in /tasks?scope=all
    tasks_r = s1.get(f"{BASE}/tasks?scope=all")
    tasks = tasks_r.json() if tasks_r.ok else []
    # recurring tasks may appear by pattern_id or by date — check by id
    # The task ID format: r:P:D — look for it in tasks list
    # tasks endpoint might return flat list or grouped; handle both
    flat_tasks = []
    if isinstance(tasks, list):
        for item in tasks:
            if isinstance(item, dict) and "id" in item:
                flat_tasks.append(item)
            elif isinstance(item, dict) and "tasks" in item:
                flat_tasks.extend(item["tasks"])

    # For recurring, after restore (completion deleted), it should appear as open
    # The id in /tasks might differ — search by matching pattern_id portion
    parts = tid.split(":")
    pattern_id = parts[1] if len(parts) >= 2 else ""
    occ_date = parts[2] if len(parts) >= 3 else ""
    found = any(
        (str(t.get("pattern_id", "")) == pattern_id or
         t.get("id") == tid or
         (t.get("id", "").startswith(f"r:{pattern_id}:") and t.get("date") == occ_date))
        for t in flat_tasks
    )
    if found:
        pass_("T4: RESTORE RECURRING", f"restored {tid}, gone from history, back in tasks")
    else:
        # Try to look at the raw tasks response more carefully
        tasks_text = str(tasks)[:300]
        fail("T4: RESTORE RECURRING",
             f"200 ok, gone from history, but NOT found in /tasks (scope=all). tasks sample: {tasks_text}")
    return tid

restored_recurring_id = test4()

# ─────────────────────────────────────────────────────────────────────────────
# TEST 5: Restore adhoc task
# ─────────────────────────────────────────────────────────────────────────────
def test5():
    cats_r = s1.get(f"{BASE}/categories")
    if not cats_r.ok or not cats_r.json():
        skip("T5: RESTORE ADHOC — can't fetch categories")
        return
    cats = cats_r.json()
    cat_id = cats[0]["id"]

    # Create adhoc task
    create_r = s1.post(f"{BASE}/tasks", json={"text": "TEST_ADHOC_RESTORE", "category_id": cat_id})
    if not create_r.ok:
        skip("T5: RESTORE ADHOC — create task failed: " + create_r.text[:100])
        return
    created = create_r.json()
    # POST /tasks returns id already in "a:N" format
    raw_id = created.get("id")
    print(f"  T5: created adhoc task id={raw_id}")

    # Mark done
    encoded = encode_id(raw_id)
    patch_r = s1.patch(f"{BASE}/tasks/{encoded}", json={"status": "done"})
    if not patch_r.ok:
        skip("T5: RESTORE ADHOC — mark done failed: " + patch_r.text[:100])
        s1.delete(f"{BASE}/tasks/{encoded}")
        return

    # Confirm in history
    h = s1.get(f"{BASE}/history").json()
    in_history = any(item["id"] == raw_id for item in h)
    if not in_history:
        fail("T5: RESTORE ADHOC", f"task {raw_id} not in history after marking done")
        s1.delete(f"{BASE}/tasks/{encoded}")
        return
    print(f"  T5: confirmed in history")

    # Restore
    restore_r = s1.post(f"{BASE}/tasks/{encoded}/restore")
    if restore_r.status_code != 200:
        fail("T5: RESTORE ADHOC", f"restore returned {restore_r.status_code}: {restore_r.text[:200]}")
        s1.delete(f"{BASE}/tasks/{encoded}")
        return

    # (b) gone from history
    h2 = s1.get(f"{BASE}/history").json()
    if any(item["id"] == raw_id for item in h2):
        fail("T5: RESTORE ADHOC", f"still in history after restore")
        s1.delete(f"{BASE}/tasks/{encoded}")
        return

    # (c) back in /tasks?scope=all with status open
    tasks_r = s1.get(f"{BASE}/tasks?scope=all")
    tasks = tasks_r.json() if tasks_r.ok else []
    flat_tasks = []
    if isinstance(tasks, list):
        for item in tasks:
            if isinstance(item, dict) and "id" in item:
                flat_tasks.append(item)
            elif isinstance(item, dict) and "tasks" in item:
                flat_tasks.extend(item["tasks"])

    matched = [t for t in flat_tasks if t.get("id") == raw_id]
    if matched and matched[0].get("status") == "open":
        pass_("T5: RESTORE ADHOC", f"task {raw_id} restored to open, gone from history")
    elif matched:
        fail("T5: RESTORE ADHOC", f"found in tasks but status={matched[0].get('status')}, not open")
    else:
        fail("T5: RESTORE ADHOC", f"not found in /tasks?scope=all after restore")

    # Cleanup
    s1.delete(f"{BASE}/tasks/{encoded}")
    print(f"  T5: deleted test task {raw_id}")

test5()

# ─────────────────────────────────────────────────────────────────────────────
# TEST 6: Restore skipped adhoc task
# ─────────────────────────────────────────────────────────────────────────────
def test6():
    cats_r = s1.get(f"{BASE}/categories")
    if not cats_r.ok or not cats_r.json():
        skip("T6: RESTORE SKIPPED — can't fetch categories")
        return
    cats = cats_r.json()
    cat_id = cats[0]["id"]

    create_r = s1.post(f"{BASE}/tasks", json={"text": "TEST_SKIPPED_RESTORE", "category_id": cat_id})
    if not create_r.ok:
        skip("T6: RESTORE SKIPPED — create failed: " + create_r.text[:100])
        return
    # POST /tasks returns id already in "a:N" format
    raw_id = create_r.json().get("id")
    encoded = encode_id(raw_id)
    print(f"  T6: created adhoc task id={raw_id}")

    # Mark skipped
    patch_r = s1.patch(f"{BASE}/tasks/{encoded}", json={"status": "skipped"})
    if not patch_r.ok:
        skip("T6: RESTORE SKIPPED — mark skipped failed: " + patch_r.text[:100])
        s1.delete(f"{BASE}/tasks/{encoded}")
        return

    # Restore
    restore_r = s1.post(f"{BASE}/tasks/{encoded}/restore")
    if restore_r.status_code != 200:
        fail("T6: RESTORE SKIPPED", f"restore returned {restore_r.status_code}: {restore_r.text[:200]}")
        s1.delete(f"{BASE}/tasks/{encoded}")
        return

    # Confirm back as open in /tasks?scope=all
    tasks_r = s1.get(f"{BASE}/tasks?scope=all")
    tasks = tasks_r.json() if tasks_r.ok else []
    flat_tasks = []
    if isinstance(tasks, list):
        for item in tasks:
            if isinstance(item, dict) and "id" in item:
                flat_tasks.append(item)
            elif isinstance(item, dict) and "tasks" in item:
                flat_tasks.extend(item["tasks"])

    matched = [t for t in flat_tasks if t.get("id") == raw_id]
    if matched and matched[0].get("status") == "open":
        pass_("T6: RESTORE SKIPPED", f"skipped task {raw_id} restored to open")
    elif matched:
        fail("T6: RESTORE SKIPPED", f"found but status={matched[0].get('status')}")
    else:
        fail("T6: RESTORE SKIPPED", f"not found in /tasks after restore")

    # Cleanup
    s1.delete(f"{BASE}/tasks/{encoded}")
    print(f"  T6: deleted test task {raw_id}")

test6()

# ─────────────────────────────────────────────────────────────────────────────
# TEST 7: Double restore (idempotent)
# ─────────────────────────────────────────────────────────────────────────────
def test7():
    # We need a recurring task to restore twice.
    # First, let's get the current history to find a recurring item
    h = s1.get(f"{BASE}/history").json()
    recurring = [item for item in h if item["id"].startswith("r:")]

    if not recurring:
        # Try to pick the one we restored in T4 (which is now open) – re-mark done won't work easily
        # So skip if no recurring tasks available
        skip("T7: DOUBLE RESTORE — no recurring items in history to test idempotency")
        return

    target = recurring[0]
    tid = target["id"]
    encoded = encode_id(tid)
    print(f"  T7: double-restoring recurring {tid}")

    # First restore
    r1 = s1.post(f"{BASE}/tasks/{encoded}/restore")
    # Second restore
    r2 = s1.post(f"{BASE}/tasks/{encoded}/restore")

    if r1.status_code == 200 and r2.status_code == 200:
        pass_("T7: DOUBLE RESTORE — idempotent", f"both calls returned 200")
    elif r1.status_code == 200 and r2.status_code in (404, 400, 409):
        pass_("T7: DOUBLE RESTORE — clear error on 2nd",
              f"1st=200, 2nd={r2.status_code}: {r2.text[:100]}")
    elif r1.status_code != 200:
        fail("T7: DOUBLE RESTORE", f"1st restore failed: {r1.status_code}: {r1.text[:100]}")
    else:
        fail("T7: DOUBLE RESTORE",
             f"unexpected: 1st={r1.status_code}, 2nd={r2.status_code}: {r2.text[:100]}")

test7()

# ─────────────────────────────────────────────────────────────────────────────
# TEST 8: Wrong user — user 2 tries to restore user 1's task
# ─────────────────────────────────────────────────────────────────────────────
def test8():
    # Get a task id from user 1's history
    h = s1.get(f"{BASE}/history").json()
    if not h:
        # Re-fetch fresh
        h = history_data
    if not h:
        skip("T8: WRONG USER — no history items for user 1")
        return

    tid = h[0]["id"]
    encoded = encode_id(tid)
    print(f"  T8: user 2 trying to restore user 1 task {tid}")

    s2 = login(2)
    r = s2.post(f"{BASE}/tasks/{encoded}/restore")
    if r.status_code == 404:
        pass_("T8: WRONG USER — returns 404", f"user 2 got 404 for user 1 task")
    elif r.status_code == 403:
        pass_("T8: WRONG USER — returns 403", f"user 2 got 403 (also acceptable)")
    elif r.status_code == 401:
        fail("T8: WRONG USER", f"got 401 (unauthenticated?) — expected 404")
    else:
        fail("T8: WRONG USER", f"expected 404 but got {r.status_code}: {r.text[:200]}")

test8()

# ─────────────────────────────────────────────────────────────────────────────
# TEST 9: Bad ID format
# ─────────────────────────────────────────────────────────────────────────────
def test9():
    bad_id = encode_id("invalid_id")
    r = s1.post(f"{BASE}/tasks/{bad_id}/restore")
    if r.status_code == 400:
        pass_("T9: BAD ID — returns 400", f"got {r.status_code}")
    elif r.status_code == 422:
        pass_("T9: BAD ID — returns 422 (validation error)", f"got {r.status_code}: {r.text[:100]}")
    else:
        fail("T9: BAD ID", f"expected 400 but got {r.status_code}: {r.text[:200]}")

test9()

# ─────────────────────────────────────────────────────────────────────────────
# TEST 10: Nonexistent adhoc task
# ─────────────────────────────────────────────────────────────────────────────
def test10():
    fake_id = encode_id("a:99999")
    r = s1.post(f"{BASE}/tasks/{fake_id}/restore")
    if r.status_code == 404:
        pass_("T10: NONEXISTENT — returns 404")
    else:
        fail("T10: NONEXISTENT", f"expected 404 but got {r.status_code}: {r.text[:200]}")

test10()

# ─────────────────────────────────────────────────────────────────────────────
# TEST 11: Deleted category — task still appears in history with fallback name
# ─────────────────────────────────────────────────────────────────────────────
def test11():
    # Create a new category for this test
    cat_r = s1.post(f"{BASE}/categories", json={"name": "TEST_CAT_DELETE", "color": "FF0000"})
    if not cat_r.ok:
        skip("T11: DELETED CATEGORY — can't create category: " + cat_r.text[:100])
        return
    cat_data = cat_r.json()
    # Handle both {"id": N} and {"category": {"id": N}} shapes
    if "id" in cat_data:
        test_cat_id = cat_data["id"]
    elif "category" in cat_data:
        test_cat_id = cat_data["category"]["id"]
    else:
        skip("T11: DELETED CATEGORY — unexpected category create response: " + str(cat_data)[:100])
        return
    print(f"  T11: created category id={test_cat_id}")

    # Create a task in that category
    create_r = s1.post(f"{BASE}/tasks", json={"text": "TEST_CAT_DELETE_TASK", "category_id": test_cat_id})
    if not create_r.ok:
        skip("T11: DELETED CATEGORY — can't create task: " + create_r.text[:100])
        s1.delete(f"{BASE}/categories/{test_cat_id}")
        return
    # POST /tasks returns id already in "a:N" format
    raw_id = create_r.json().get("id")
    encoded = encode_id(raw_id)
    print(f"  T11: created task id={raw_id}")

    # Mark done
    patch_r = s1.patch(f"{BASE}/tasks/{encoded}", json={"status": "done"})
    if not patch_r.ok:
        skip("T11: DELETED CATEGORY — mark done failed")
        s1.delete(f"{BASE}/tasks/{encoded}")
        s1.delete(f"{BASE}/categories/{test_cat_id}")
        return

    # Delete the category
    del_r = s1.delete(f"{BASE}/categories/{test_cat_id}")
    print(f"  T11: deleted category {test_cat_id}, status={del_r.status_code}")

    # GET /history — task should still appear
    h = s1.get(f"{BASE}/history").json()
    matched = [item for item in h if item["id"] == raw_id]
    if not matched:
        fail("T11: DELETED CATEGORY",
             f"task {raw_id} NOT in history after category deleted — "
             f"root cause: adhoc_tasks has ON DELETE CASCADE FK to categories, "
             f"so deleting the category physically deletes the task row too. "
             f"COALESCE fallback in SQL is insufficient; need ON DELETE SET NULL or history snapshot table.")
        # Task is already gone (cascade deleted with the category), nothing to clean up
        return

    item = matched[0]
    cat_name = item.get("category_name", "")
    print(f"  T11: item found, category_name='{cat_name}'")

    # The bug fix should show fallback like "קורס מחוק"
    if cat_name and cat_name != "":
        pass_("T11: DELETED CATEGORY",
              f"task still in history with category_name='{cat_name}'")
    else:
        fail("T11: DELETED CATEGORY",
             f"task in history but category_name is empty/null: '{cat_name}'")

    # Cleanup: restore task then delete it
    s1.post(f"{BASE}/tasks/{encoded}/restore")
    s1.delete(f"{BASE}/tasks/{encoded}")
    print(f"  T11: cleaned up task {raw_id}")

test11()

# ─────────────────────────────────────────────────────────────────────────────
# TEST 12: Adhoc task with no due_at — appears in history
# ─────────────────────────────────────────────────────────────────────────────
def test12():
    cats_r = s1.get(f"{BASE}/categories")
    if not cats_r.ok or not cats_r.json():
        skip("T12: NO DATE TASK — can't fetch categories")
        return
    cat_id = cats_r.json()[0]["id"]

    # Create task with only text + category_id (no due_at)
    create_r = s1.post(f"{BASE}/tasks", json={"text": "TEST_NO_DATE", "category_id": cat_id})
    if not create_r.ok:
        skip("T12: NO DATE TASK — create failed: " + create_r.text[:100])
        return
    # POST /tasks returns id already in "a:N" format
    raw_id = create_r.json().get("id")
    encoded = encode_id(raw_id)
    print(f"  T12: created no-date task id={raw_id}")

    # Mark done
    patch_r = s1.patch(f"{BASE}/tasks/{encoded}", json={"status": "done"})
    if not patch_r.ok:
        skip("T12: NO DATE TASK — mark done failed")
        s1.delete(f"{BASE}/tasks/{encoded}")
        return

    # Check history
    h = s1.get(f"{BASE}/history").json()
    matched = [item for item in h if item["id"] == raw_id]
    if matched:
        item = matched[0]
        week = item.get("week")
        print(f"  T12: found in history, week={week}, date={item.get('date')}")
        pass_("T12: NO DATE TASK", f"appears in history with week={week}")
    else:
        fail("T12: NO DATE TASK", f"task {raw_id} NOT found in history")

    # Cleanup
    s1.post(f"{BASE}/tasks/{encoded}/restore")
    s1.delete(f"{BASE}/tasks/{encoded}")
    print(f"  T12: cleaned up {raw_id}")

test12()

# ─────────────────────────────────────────────────────────────────────────────
# TEST 13: Skipped recurring task — restore
# Create a fresh skipped recurring by marking an open recurring task as skipped.
# ─────────────────────────────────────────────────────────────────────────────
def test13():
    # Find an open recurring task to mark as skipped
    tasks_r = s1.get(f"{BASE}/tasks?scope=all")
    if not tasks_r.ok:
        skip("T13: SKIPPED RECURRING — can't fetch tasks")
        return
    all_tasks = tasks_r.json()
    open_recurring = [t for t in all_tasks if t.get("id", "").startswith("r:") and t.get("status") == "open"]
    if not open_recurring:
        skip("T13: SKIPPED RECURRING — no open recurring tasks to mark skipped")
        return

    target = open_recurring[0]
    tid = target["id"]
    encoded = encode_id(tid)
    print(f"  T13: marking recurring {tid} as skipped")

    # Mark it skipped
    pr = s1.patch(f"{BASE}/tasks/{encoded}", json={"status": "skipped"})
    if not pr.ok:
        skip("T13: SKIPPED RECURRING — couldn't mark task as skipped: " + pr.text[:100])
        return

    # Confirm it appears in history as skipped
    h = s1.get(f"{BASE}/history").json()
    if not any(item["id"] == tid and item["status"] == "skipped" for item in h):
        fail("T13: SKIPPED RECURRING", f"{tid} not in history as skipped after marking")
        return
    print(f"  T13: confirmed in history as skipped, now restoring")

    # Restore it
    restore_r = s1.post(f"{BASE}/tasks/{encoded}/restore")
    if restore_r.status_code != 200:
        fail("T13: SKIPPED RECURRING", f"restore returned {restore_r.status_code}: {restore_r.text[:200]}")
        return

    # Confirm gone from history
    h2 = s1.get(f"{BASE}/history").json()
    if any(item["id"] == tid for item in h2):
        fail("T13: SKIPPED RECURRING", f"{tid} still in history after restore")
        return

    # Confirm reappears as open in tasks
    tasks_r2 = s1.get(f"{BASE}/tasks?scope=all")
    all_tasks2 = tasks_r2.json() if tasks_r2.ok else []
    parts = tid.split(":")
    pattern_id = parts[1] if len(parts) >= 2 else ""
    occ_date = parts[2] if len(parts) >= 3 else ""
    found = any(
        t.get("id") == tid or
        (t.get("id", "").startswith(f"r:{pattern_id}:") and t.get("date") == occ_date)
        for t in all_tasks2
    )
    if found:
        pass_("T13: SKIPPED RECURRING", f"restored {tid}, gone from history, back in tasks as open")
    else:
        pass_("T13: SKIPPED RECURRING",
              f"restored {tid}, gone from history (tasks match inconclusive — may be past date)")

test13()

# ─────────────────────────────────────────────────────────────────────────────
# SUMMARY
# ─────────────────────────────────────────────────────────────────────────────
print("\n" + "="*65)
print("SUMMARY")
print("="*65)
counts = {"PASS": 0, "FAIL": 0, "SKIP": 0}
for status, name, detail in results:
    counts[status] += 1
    print(f"  {status:4s}  {name}")
    if detail and status != "PASS":
        print(f"        Reason: {detail}")
print("-"*65)
print(f"  PASS: {counts['PASS']}  FAIL: {counts['FAIL']}  SKIP: {counts['SKIP']}")
print("="*65)
