"""
test_new_course_pipeline.py — integration test for new-course classification.

Verifies that a course created via the API is immediately used by the AI
classifier for new tasks — i.e. no code restart or cache flush needed.

Requirements:
  - Server running on http://127.0.0.1:8001
  - DEV_MODE=1 in .env  (uses dev_login, no real OAuth needed)
  - GOOGLE_API_KEY in .env  (Gemini is called for AI-path classification)

Run:
  .venv\\Scripts\\python.exe test_new_course_pipeline.py

Pass criteria: the task submitted with text clearly about the new course
is classified into that course (not "כללי") by the AI.
"""
import io
import sys
import json
import urllib.request
import urllib.error
import http.cookiejar

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", line_buffering=True)

BASE = "http://127.0.0.1:8001"

# ── HTTP helpers ─────────────────────────────────────────────────────────────

jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

def _req(method, path, body=None):
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json"} if data else {}
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with opener.open(req) as r:
            raw = r.read()
            return r.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            detail = json.loads(raw)
        except Exception:
            detail = raw.decode()
        return e.code, detail

def get(path):    return _req("GET", path)
def post(path, body=None): return _req("POST", path, body)
def delete(path): return _req("DELETE", path)


# ── Test ─────────────────────────────────────────────────────────────────────

def main():
    print()
    print("=" * 70)
    print("New-course pipeline integration test")
    print("=" * 70)

    # 1. Authenticate as user 1 (DEV_MODE)
    print("\n[1] Dev-login as user 1 …")
    status, _ = get("/auth/dev_login?user_id=1")
    assert status == 200, f"dev_login failed: {status}"
    print("    ✓ signed in")

    # 2. Create a fresh test course
    course_name = "קורס_בדיקה_אינטגרציה"
    print(f"\n[2] Creating test course '{course_name}' …")
    status, cat = post("/categories", {"name": course_name, "color_dark": "047857"})
    assert status == 201, f"create category failed: {status} {cat}"
    cat_id = cat["id"]
    print(f"    ✓ created, id={cat_id}")

    # 3. Verify the course appears in GET /categories
    print("\n[3] Verifying course is in the category list …")
    status, cats = get("/categories")
    assert status == 200
    names = [c["name"] for c in cats]
    assert course_name in names, f"new course not in list: {names}"
    print(f"    ✓ {len(cats)} categories total, new one present")

    # 4. Submit a task whose text unambiguously belongs to this course.
    #    The keyword classifier won't know about it → AI fallback.
    #    The AI receives the full category list and should pick the new course.
    task_text = f"להגיש תרגיל בית ב{course_name} עד סוף השבוע"
    print(f"\n[4] Submitting task: '{task_text}' …")
    status, task = post("/tasks", {"text": task_text, "client_now": "2026-05-03T12:00:00+03:00"})
    assert status in (200, 201), f"create task failed: {status} {task}"
    got_category = task.get("category_name", "")
    task_id = task.get("id", "")
    print(f"    task id={task_id}")
    print(f"    classified as: '{got_category}'")

    passed = got_category == course_name
    if passed:
        print(f"    ✓ AI correctly classified into the new course")
    else:
        print(f"    ✗ FAIL: expected '{course_name}', got '{got_category}'")
        print(f"      (If got 'כללי': AI didn't pick up the new course name.)")
        print(f"      (If got something else: possible keyword collision.)")

    # 5. Clean up — delete the test task and the test course
    print("\n[5] Cleaning up …")
    if task_id:
        s, _ = delete(f"/tasks/{urllib.parse.quote(str(task_id), safe='')}")
        print(f"    task deleted (status {s})")
    s, _ = delete(f"/categories/{cat_id}")
    print(f"    course deleted (status {s})")

    # 6. Summary
    print()
    print("=" * 70)
    result = "PASS ✓" if passed else "FAIL ✗"
    print(f"Result: {result}")
    print("=" * 70)
    print()
    return 0 if passed else 1


if __name__ == "__main__":
    import urllib.parse
    sys.exit(main())
