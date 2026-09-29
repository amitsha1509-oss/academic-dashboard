def make(client, **body):
    r = client.post("/api/items", json=body)
    assert r.status_code == 201, r.text
    return r.json()


def test_seed_is_present(client):
    data = client.get("/api/bootstrap").json()
    assert {"importance", "urgency", "effort"} <= {p["id"] for p in data["properties"]}
    assert {"course", "topic", "project", "note"} <= {t["id"] for t in data["types"]}
    assert all(t["icon"] == "" for t in data["types"])


def test_quick_capture_goes_to_inbox_and_leaves_when_sorted(client):
    it = make(client, title="להתקשר לאבא")
    assert it["inbox"] is True
    it = client.patch(f"/api/items/{it['id']}", json={"type_id": "task"}).json()
    assert it["inbox"] is False


def test_props_patch_merges_and_null_removes(client):
    it = make(client, title="x", props={"effort": "easy"})
    it = client.patch(f"/api/items/{it['id']}", json={"props": {"importance": "high"}}).json()
    assert it["props"] == {"effort": "easy", "importance": "high"}
    it = client.patch(f"/api/items/{it['id']}", json={"props": {"effort": None}}).json()
    assert it["props"] == {"importance": "high"}


def test_postponing_is_counted(client):
    it = make(client, title="להגיש", due_at="2026-10-01")
    it = client.patch(f"/api/items/{it['id']}", json={"due_at": "2026-10-03"}).json()
    it = client.patch(f"/api/items/{it['id']}", json={"due_at": "2026-10-05"}).json()
    assert it["postpone_count"] == 2
    missed = client.get("/api/smart/missed", params={"day": "2026-10-10"}).json()
    assert it["id"] in missed["postponed"] and it["id"] in missed["overdue"]


def test_parent_cycle_rejected(client):
    a = make(client, title="a")
    b = make(client, title="b", parent_id=a["id"])
    r = client.patch(f"/api/items/{a['id']}", json={"parent_id": b["id"]})
    assert r.status_code == 400


def test_missed_lectures_and_marking_watched(client):
    course = make(client, title="הסתברות", type_id="course")
    lec = make(client, title="הרצאה", type_id="lecture", parent_id=course["id"],
               repeat={"freq": "weekly", "weekdays": [0], "start": "2026-10-04", "time": "10:00"})
    missed = client.get("/api/smart/missed", params={"day": "2026-10-20"}).json()
    dates = [o["date"] for o in missed["occurrences"] if o["item_id"] == lec["id"]]
    assert dates == ["2026-10-18", "2026-10-11", "2026-10-04"]

    client.put(f"/api/occurrences/{lec['id']}/2026-10-11", json={"status": "done"})
    missed = client.get("/api/smart/missed", params={"day": "2026-10-20"}).json()
    dates = [o["date"] for o in missed["occurrences"] if o["item_id"] == lec["id"]]
    assert dates == ["2026-10-18", "2026-10-04"]

    today = client.get("/api/smart/today", params={"day": "2026-10-25"}).json()
    assert any(e["item_id"] == lec["id"] and e["time"] == "10:00" for e in today["schedule"])


def test_snooze_hides_then_returns(client):
    it = make(client, title="לחשוב על זה", type_id="task", due_at="2026-11-01", snooze_until="2026-11-05")
    before = client.get("/api/smart/today", params={"day": "2026-11-03"}).json()
    assert it["id"] not in before["overdue"]
    after = client.get("/api/smart/today", params={"day": "2026-11-05"}).json()
    assert it["id"] in after["returned"]


def test_removing_a_choice_option_clears_values(client):
    original = next(p for p in client.get("/api/bootstrap").json()["properties"] if p["id"] == "effort")
    it = make(client, title="y", props={"effort": "hard"})
    easy_only = [o for o in original["options"] if o["id"] == "easy"]
    client.patch("/api/properties/effort", json={"options": easy_only})
    item = next(i for i in client.get("/api/bootstrap").json()["items"] if i["id"] == it["id"])
    assert "effort" not in item["props"]
    client.patch("/api/properties/effort", json={"options": original["options"]})


def test_convert_text_to_choice_builds_options(client):
    p = client.post("/api/properties", json={"name": "מקום", "type": "text"}).json()
    a = make(client, title="a", props={p["id"]: "בית"})
    make(client, title="b", props={p["id"]: "ספרייה"})
    make(client, title="c", props={p["id"]: "בית"})
    res = client.post(f"/api/properties/{p['id']}/convert", json={"type": "choice"}).json()
    labels = sorted(o["label"] for o in res["property"]["options"])
    assert labels == ["בית", "ספרייה"] and res["lost"] == 0
    item = next(i for i in client.get("/api/bootstrap").json()["items"] if i["id"] == a["id"])
    assert item["props"][p["id"]] in {o["id"] for o in res["property"]["options"]}


def test_delete_and_restore_keeps_children(client):
    parent = make(client, title="קורס", type_id="course")
    child = make(client, title="תרגיל", parent_id=parent["id"])
    client.delete(f"/api/items/{parent['id']}")
    ids = {i["id"] for i in client.get("/api/bootstrap").json()["items"]}
    assert parent["id"] not in ids and child["id"] in ids
    client.post(f"/api/items/{parent['id']}/restore")
    ids = {i["id"] for i in client.get("/api/bootstrap").json()["items"]}
    assert parent["id"] in ids


def test_v2_migration_upgrades_an_old_database(tmp_path):
    import sqlite3
    from app import db
    conn = sqlite3.connect(tmp_path / "old.sqlite3")
    conn.row_factory = sqlite3.Row
    conn.executescript(db.MIGRATIONS[0])
    conn.execute("PRAGMA user_version = 1")
    conn.execute("INSERT INTO types (id, name, icon) VALUES ('task', 'משימה', '✅')")
    conn.execute("INSERT INTO views (id, name, config) VALUES ('eisenhower', 'x', '{}'), ('mine', 'y', '{}')")
    db.migrate(conn)
    types = {r["id"]: r["icon"] for r in conn.execute("SELECT id, icon FROM types")}
    assert types["task"] == "" and "topic" in types
    assert [r["id"] for r in conn.execute("SELECT id FROM views")] == ["mine"]
