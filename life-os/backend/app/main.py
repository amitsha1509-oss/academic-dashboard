"""FastAPI server: JSON API under /api, and the built frontend at /.

Endpoints are `async def` on purpose: they run one at a time on the event loop,
which keeps access to the single SQLite connection serialized.
"""
import json
import re
import uuid
from datetime import date, datetime
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import backup, db, models, smart

app = FastAPI(title="Life OS")
conn = db.connect()
db.migrate(conn)
backup.daily(conn)

JSON_ITEM_FIELDS = ("repeat", "links", "props")


# ─── helpers ─────────────────────────────────────────────────────────
def now() -> str:
    return datetime.now().isoformat(timespec="seconds")


def new_id() -> str:
    return uuid.uuid4().hex[:12]


def row_to_item(r) -> dict:
    d = dict(r)
    d["repeat"] = json.loads(d["repeat"]) if d["repeat"] else None
    d["links"] = json.loads(d["links"])
    d["props"] = json.loads(d["props"])
    d["inbox"] = bool(d["inbox"])
    d["archived"] = bool(d["archived"])
    return d


def row_to_json(r, *fields) -> dict:
    d = dict(r)
    for f in fields:
        d[f] = json.loads(d[f])
    if "archived" in d:
        d["archived"] = bool(d["archived"])
    return d


def get_item(item_id: str) -> dict:
    r = conn.execute("SELECT * FROM items WHERE id=?", (item_id,)).fetchone()
    if not r:
        raise HTTPException(404, "item not found")
    return row_to_item(r)


def all_items() -> list[dict]:
    return [row_to_item(r) for r in conn.execute("SELECT * FROM items WHERE archived=0")]


def occurrence_records() -> dict[tuple[str, str], str]:
    return {(r["item_id"], r["date"]): r["status"] for r in conn.execute("SELECT * FROM occurrences")}


def parse_day(value: str | None) -> date:
    return date.fromisoformat(value) if value else date.today()


def check_refs(fields: dict, item_id: str | None = None) -> None:
    if fields.get("type_id") and not conn.execute(
            "SELECT 1 FROM types WHERE id=?", (fields["type_id"],)).fetchone():
        raise HTTPException(400, "unknown type")
    parent = fields.get("parent_id")
    if parent:
        # Walk up from the new parent; reaching item_id would create a cycle.
        seen = parent
        while seen:
            if seen == item_id:
                raise HTTPException(400, "an item cannot be inside itself")
            r = conn.execute("SELECT parent_id FROM items WHERE id=?", (seen,)).fetchone()
            if not r:
                raise HTTPException(400, "unknown parent")
            seen = r["parent_id"]


def encode(fields: dict) -> dict:
    out = {}
    for k, v in fields.items():
        if k in JSON_ITEM_FIELDS:
            out[k] = json.dumps(v, ensure_ascii=False) if v is not None else (None if k == "repeat" else ("[]" if k == "links" else "{}"))
        elif k == "inbox":
            out[k] = int(bool(v))
        else:
            out[k] = v
    return out


def apply_item_patch(item: dict, patch: models.ItemPatch) -> dict:
    fields = patch.model_dump(exclude_unset=True, mode="json")
    if "title" in fields and fields["title"] is None:
        del fields["title"]
    if "status" in fields and fields["status"] is None:
        del fields["status"]
    check_refs(fields, item["id"])

    # Moving a date later counts as postponing.
    for key in ("due_at", "when_at"):
        old, new = item.get(key), fields.get(key)
        if key in fields and old and new and new > old:
            fields["postpone_count"] = item["postpone_count"] + 1
            break
    # Giving an inbox item a type or a parent means it has been sorted.
    if item["inbox"] and "inbox" not in fields and (fields.get("type_id") or fields.get("parent_id")):
        fields["inbox"] = False
    if "status" in fields and fields["status"] != item["status"]:
        fields["completed_at"] = now() if fields["status"] == "done" else None
    if "props" in fields and fields["props"] is not None:
        # Patch props key-by-key; a null value removes that property from the item.
        merged = {**item["props"], **fields["props"]}
        fields["props"] = {k: v for k, v in merged.items() if v is not None and v != [] and v != ""}

    if not fields:
        return item
    fields = encode(fields)
    fields["updated_at"] = now()
    cols = ", ".join(f"{k}=?" for k in fields)
    conn.execute(f"UPDATE items SET {cols} WHERE id=?", (*fields.values(), item["id"]))
    return get_item(item["id"])


# ─── bootstrap / export ─────────────────────────────────────────────
@app.get("/api/bootstrap")
async def bootstrap():
    backup.daily(conn)
    return {
        "items": all_items(),
        "properties": [row_to_json(r, "options") for r in conn.execute("SELECT * FROM property_defs ORDER BY sort, name")],
        "types": [row_to_json(r, "suggested") for r in conn.execute("SELECT * FROM types ORDER BY sort, name")],
        "views": [row_to_json(r, "config") for r in conn.execute("SELECT * FROM views ORDER BY sort, name")],
    }


@app.get("/api/export")
async def export():
    tables = ("items", "property_defs", "types", "views", "occurrences")
    return {t: [dict(r) for r in conn.execute(f"SELECT * FROM {t}")] for t in tables}


@app.get("/api/healthz")
async def healthz():
    n = conn.execute("SELECT COUNT(*) FROM items").fetchone()[0]
    return {"ok": True, "items": n, "db": str(db.DB_PATH)}


# ─── items ──────────────────────────────────────────────────────────
@app.post("/api/items", status_code=201)
async def create_item(body: models.ItemCreate):
    fields = body.model_dump(exclude_unset=True, mode="json")
    check_refs(fields)
    fields.setdefault("status", "open")
    if "inbox" not in fields:
        # Anything created without a type or a parent lands in the inbox.
        fields["inbox"] = not (fields.get("type_id") or fields.get("parent_id"))
    if fields.get("props"):
        fields["props"] = {k: v for k, v in fields["props"].items() if v not in (None, "", [])}
    fields = encode(fields)
    fields.update(id=new_id(), created_at=now(), updated_at=now())
    if fields["status"] == "done":
        fields["completed_at"] = now()
    cols = ", ".join(fields)
    conn.execute(f"INSERT INTO items ({cols}) VALUES ({', '.join('?' * len(fields))})", tuple(fields.values()))
    conn.commit()
    return get_item(fields["id"])


@app.patch("/api/items/{item_id}")
async def update_item(item_id: str, patch: models.ItemPatch):
    item = apply_item_patch(get_item(item_id), patch)
    conn.commit()
    return item


@app.post("/api/items/bulk")
async def bulk_update(body: models.BulkPatch):
    out = [apply_item_patch(get_item(i), body.patch) for i in body.ids]
    conn.commit()
    return out


@app.delete("/api/items/{item_id}")
async def delete_item(item_id: str):
    """Soft delete. Children keep their parent link, so restore brings everything back."""
    get_item(item_id)
    conn.execute("UPDATE items SET archived=1, updated_at=? WHERE id=?", (now(), item_id))
    conn.commit()
    return {"ok": True}


@app.post("/api/items/{item_id}/restore")
async def restore_item(item_id: str):
    get_item(item_id)
    conn.execute("UPDATE items SET archived=0, updated_at=? WHERE id=?", (now(), item_id))
    conn.commit()
    return get_item(item_id)


@app.get("/api/trash")
async def trash():
    rows = conn.execute("SELECT * FROM items WHERE archived=1 ORDER BY updated_at DESC LIMIT 200")
    return [row_to_item(r) for r in rows]


# ─── occurrences & smart views ──────────────────────────────────────
@app.get("/api/occurrences")
async def occurrences(frm: str, to: str):
    return smart.expand(all_items(), occurrence_records(), parse_day(frm), parse_day(to))


@app.put("/api/occurrences/{item_id}/{day}")
async def mark_occurrence(item_id: str, day: str, body: models.OccurrenceMark):
    get_item(item_id)
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", day):
        raise HTTPException(400, "bad date")
    if body.status is None:
        conn.execute("DELETE FROM occurrences WHERE item_id=? AND date=?", (item_id, day))
    else:
        conn.execute("INSERT INTO occurrences (item_id, date, status) VALUES (?,?,?) "
                     "ON CONFLICT(item_id, date) DO UPDATE SET status=excluded.status",
                     (item_id, day, body.status))
    conn.commit()
    return {"item_id": item_id, "date": day, "status": body.status or "open"}


@app.get("/api/smart/today")
async def smart_today(day: str | None = None):
    return smart.today_view(all_items(), occurrence_records(), parse_day(day))


@app.get("/api/smart/missed")
async def smart_missed(day: str | None = None):
    return smart.missed_view(all_items(), occurrence_records(), parse_day(day))


# ─── property definitions ───────────────────────────────────────────
def get_prop(prop_id: str) -> dict:
    r = conn.execute("SELECT * FROM property_defs WHERE id=?", (prop_id,)).fetchone()
    if not r:
        raise HTTPException(404, "property not found")
    return row_to_json(r, "options")


def rewrite_values(prop_id: str, fn) -> int:
    """Apply fn(value) to this property on every item. fn returns None to remove. Returns items changed."""
    changed = 0
    for r in conn.execute("SELECT id, props FROM items").fetchall():
        props = json.loads(r["props"])
        if prop_id not in props:
            continue
        new = fn(props[prop_id])
        if new in (None, "", []):
            del props[prop_id]
        elif new == props[prop_id]:
            continue
        else:
            props[prop_id] = new
        conn.execute("UPDATE items SET props=?, updated_at=? WHERE id=?",
                     (json.dumps(props, ensure_ascii=False), now(), r["id"]))
        changed += 1
    return changed


@app.post("/api/properties", status_code=201)
async def create_property(body: models.PropertyCreate):
    pid = "p_" + new_id()
    sort = conn.execute("SELECT COALESCE(MAX(sort), 0) + 1 FROM property_defs").fetchone()[0]
    conn.execute("INSERT INTO property_defs (id, name, type, options, sort) VALUES (?,?,?,?,?)",
                 (pid, body.name, body.type,
                  json.dumps([o.model_dump() for o in body.options], ensure_ascii=False), sort))
    conn.commit()
    return get_prop(pid)


@app.patch("/api/properties/{prop_id}")
async def update_property(prop_id: str, body: models.PropertyPatch):
    prop = get_prop(prop_id)
    fields = body.model_dump(exclude_unset=True)
    if "options" in fields:
        kept = {o["id"] for o in fields["options"]}
        # Values pointing at a removed option are removed from items.
        if prop["type"] == "choice":
            rewrite_values(prop_id, lambda v: v if v in kept else None)
        elif prop["type"] == "multi":
            rewrite_values(prop_id, lambda v: [x for x in v if x in kept])
        fields["options"] = json.dumps(fields["options"], ensure_ascii=False)
    if fields:
        cols = ", ".join(f"{k}=?" for k in fields)
        conn.execute(f"UPDATE property_defs SET {cols} WHERE id=?", (*fields.values(), prop_id))
    conn.commit()
    return get_prop(prop_id)


@app.post("/api/properties/{prop_id}/convert")
async def convert_property(prop_id: str, body: models.PropertyConvert):
    """Change a property's type, converting existing values where it makes sense."""
    prop = get_prop(prop_id)
    old, new = prop["type"], body.type
    options = prop["options"]
    label_of = {o["id"]: o["label"] for o in options}

    def as_text(v):
        if old == "choice":
            return label_of.get(v)
        if old == "multi":
            return ", ".join(label_of.get(x, "") for x in v) or None
        if old == "checkbox":
            return "כן" if v else None
        return str(v)

    if new in ("choice", "multi"):
        # Build options from the distinct existing values.
        by_label = {o["label"]: o["id"] for o in options}
        texts = []
        for r in conn.execute("SELECT props FROM items"):
            v = json.loads(r["props"]).get(prop_id)
            if v is None:
                continue
            vals = v if old == "multi" else [v]
            texts += [label_of.get(x, x) if old in ("choice", "multi") else as_text(x) for x in vals]
        for t in texts:
            if t and t not in by_label:
                oid = "o_" + new_id()[:6]
                by_label[t] = oid
                options.append({"id": oid, "label": t, "color": "gray"})

        def conv(v):
            vals = v if old == "multi" else [v]
            ids = [by_label.get(label_of.get(x, x) if old in ("choice", "multi") else as_text(x)) for x in vals]
            ids = [i for i in ids if i]
            return ids if new == "multi" else (ids[0] if ids else None)
    elif new == "text" or new == "url":
        conv = as_text
    elif new == "number":
        def conv(v):
            try:
                return float(as_text(v))
            except (TypeError, ValueError):
                return None
    elif new == "checkbox":
        conv = lambda v: bool(v) or None
    elif new == "date":
        conv = lambda v: v if isinstance(v, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", v) else None
    else:
        conv = lambda v: None

    kept_before = sum(1 for r in conn.execute("SELECT props FROM items") if prop_id in json.loads(r["props"]))
    changed = rewrite_values(prop_id, conv)
    kept_after = sum(1 for r in conn.execute("SELECT props FROM items") if prop_id in json.loads(r["props"]))
    conn.execute("UPDATE property_defs SET type=?, options=? WHERE id=?",
                 (new, json.dumps(options if new in ("choice", "multi") else [], ensure_ascii=False), prop_id))
    conn.commit()
    return {"property": get_prop(prop_id), "converted": changed, "lost": kept_before - kept_after}


@app.delete("/api/properties/{prop_id}")
async def archive_property(prop_id: str):
    """Hide a property. Values stay on items, so restoring brings them back."""
    get_prop(prop_id)
    conn.execute("UPDATE property_defs SET archived=1 WHERE id=?", (prop_id,))
    conn.commit()
    return {"ok": True}


@app.post("/api/properties/{prop_id}/restore")
async def restore_property(prop_id: str):
    get_prop(prop_id)
    conn.execute("UPDATE property_defs SET archived=0 WHERE id=?", (prop_id,))
    conn.commit()
    return get_prop(prop_id)


# ─── types ──────────────────────────────────────────────────────────
def get_type(type_id: str) -> dict:
    r = conn.execute("SELECT * FROM types WHERE id=?", (type_id,)).fetchone()
    if not r:
        raise HTTPException(404, "type not found")
    return row_to_json(r, "suggested")


@app.post("/api/types", status_code=201)
async def create_type(body: models.TypeCreate):
    tid = "t_" + new_id()
    sort = conn.execute("SELECT COALESCE(MAX(sort), 0) + 1 FROM types").fetchone()[0]
    conn.execute("INSERT INTO types (id, name, icon, color, suggested, sort) VALUES (?,?,?,?,?,?)",
                 (tid, body.name, body.icon, body.color, json.dumps(body.suggested), sort))
    conn.commit()
    return get_type(tid)


@app.patch("/api/types/{type_id}")
async def update_type(type_id: str, body: models.TypePatch):
    get_type(type_id)
    fields = body.model_dump(exclude_unset=True)
    if "suggested" in fields:
        fields["suggested"] = json.dumps(fields["suggested"])
    if fields:
        cols = ", ".join(f"{k}=?" for k in fields)
        conn.execute(f"UPDATE types SET {cols} WHERE id=?", (*fields.values(), type_id))
    conn.commit()
    return get_type(type_id)


@app.delete("/api/types/{type_id}")
async def archive_type(type_id: str):
    get_type(type_id)
    conn.execute("UPDATE types SET archived=1 WHERE id=?", (type_id,))
    conn.commit()
    return {"ok": True}


@app.post("/api/types/{type_id}/restore")
async def restore_type(type_id: str):
    get_type(type_id)
    conn.execute("UPDATE types SET archived=0 WHERE id=?", (type_id,))
    conn.commit()
    return get_type(type_id)


# ─── views ──────────────────────────────────────────────────────────
def get_view(view_id: str) -> dict:
    r = conn.execute("SELECT * FROM views WHERE id=?", (view_id,)).fetchone()
    if not r:
        raise HTTPException(404, "view not found")
    return row_to_json(r, "config")


@app.post("/api/views", status_code=201)
async def create_view(body: models.ViewCreate):
    vid = "v_" + new_id()
    sort = conn.execute("SELECT COALESCE(MAX(sort), 0) + 1 FROM views").fetchone()[0]
    conn.execute("INSERT INTO views (id, name, icon, config, sort) VALUES (?,?,?,?,?)",
                 (vid, body.name, body.icon, json.dumps(body.config, ensure_ascii=False), sort))
    conn.commit()
    return get_view(vid)


@app.patch("/api/views/{view_id}")
async def update_view(view_id: str, body: models.ViewPatch):
    get_view(view_id)
    fields = body.model_dump(exclude_unset=True)
    if "config" in fields:
        fields["config"] = json.dumps(fields["config"], ensure_ascii=False)
    if fields:
        cols = ", ".join(f"{k}=?" for k in fields)
        conn.execute(f"UPDATE views SET {cols} WHERE id=?", (*fields.values(), view_id))
    conn.commit()
    return get_view(view_id)


@app.delete("/api/views/{view_id}")
async def delete_view(view_id: str):
    get_view(view_id)
    conn.execute("DELETE FROM views WHERE id=?", (view_id,))
    conn.commit()
    return {"ok": True}


# ─── frontend ───────────────────────────────────────────────────────
DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"

if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    async def spa(path: str):
        target = (DIST / path).resolve()
        if path and target.is_file() and DIST in target.parents:
            return FileResponse(target)
        return FileResponse(DIST / "index.html", headers={"Cache-Control": "no-store"})
