// claude-api.jsx — backend client for the academic dashboard.
//
// The Nucleus UI was originally written for life_dashboard, which has
// 5 free dimensions. Our backend has a per-user category list + Eisenhower
// axes. This adapter translates between the two shapes.
//
// Mapping:
//   their "subject"     ↔ our "category_name"
//   their importance/urgency low/medium/high ↔ our 1..5 (binary in this app)
//   their "time_value"  ↔ our "due_at" (or scheduled_at as fallback)
//   their task id "1"   ↔ our id "r:5:2026-04-28" or "a:42" (opaque string)

// Same-origin in deployed mode; absolute for dev with separate origins.
const API_BASE = window.location.origin.startsWith("http://localhost")
  ? "http://localhost:8001"
  : "";  // relative — same-origin deploy

// ─── Helpers ──────────────────────────────────────────────

// Centralized fetch wrapper. ALWAYS includes credentials so the session
// cookie flows on every request (not only same-origin). Without this,
// cross-origin deploys (e.g. frontend on a CDN, backend on a subdomain)
// would 401 every authenticated call. Reviewed Apr 2026 in security audit.
function _fetch(path, opts = {}) {
  return fetch(`${API_BASE}${path}`, { credentials: "include", ...opts });
}

async function _json(res) {
  if (!res.ok) {
    let detail;
    try { detail = (await res.json()).detail; } catch (e) { detail = await res.text(); }
    // FastAPI 422 returns detail as an array of {loc, msg, ...}. Stringify readably.
    if (Array.isArray(detail)) {
      detail = detail.map(d => `${(d.loc || []).slice(1).join(".") || "body"}: ${d.msg}`).join("; ");
    } else if (detail && typeof detail === "object") {
      detail = JSON.stringify(detail);
    }
    throw new Error(`${res.status}: ${detail}`);
  }
  return res.json();
}

function _localIsoWithOffset() {
  const d = new Date();
  const pad = n => String(n).padStart(2, "0");
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const oh = pad(Math.floor(Math.abs(off) / 60));
  const om = pad(Math.abs(off) % 60);
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}` +
         `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
         `${sign}${oh}:${om}`;
}

// Binary mapping — UI has only "low" and "high". 3 collapses to "low" so
// existing tasks (default imp=3) don't surface a stale "medium" option in
// the EditDialog.
function _scaleToLevel(n) {
  if (n == null) return "low";
  return n >= 4 ? "high" : "low";
}
function _levelToScale(level) {
  return level === "high" ? 5 : 2;
}

// Our task → frontend's expected shape.
function _toFrontTask(t) {
  return {
    id: t.id,                              // opaque string
    raw_text: t.title,
    subject: t.category_name,
    context: t.place ? "@" + t.place : "@anywhere",
    importance: _scaleToLevel(t.importance),
    urgency: _scaleToLevel(t.urgency),
    time_value: t.due_at || t.scheduled_at || null,
    status: t.status,
    created_at: t.release_at || new Date().toISOString(),
    next_steps: [],
    ai_failed: false,
    // Pass-through extras
    _source: t.source,
    _category_id: t.category_id,
    _type: t.type,
    _due_at: t.due_at,
    _scheduled_at: t.scheduled_at,
    _notes: t.notes,
    _release_at: t.release_at,
  };
}

// PATCH payload: frontend's fields → our fields.
function _toBackPatch(fields) {
  const out = {};
  if ("status" in fields)      out.status = fields.status;
  if ("notes" in fields)       out.notes = fields.notes;
  if ("scheduled_at" in fields) out.scheduled_at = fields.scheduled_at;
  if ("context" in fields && fields.context) {
    const place = fields.context.replace(/^@/, "");
    // "@anywhere" is the UI's "no place" — backend's TaskPlace literal doesn't
    // include it. Send null so the place override clears (or stays unset).
    out.place = place === "anywhere" ? null : place;
  }
  if ("importance" in fields && fields.importance) {
    out.importance = _levelToScale(fields.importance);
  }
  if ("urgency" in fields && fields.urgency) {
    out.urgency = _levelToScale(fields.urgency);
  }
  return out;
}

// ─── Tasks ──────────────────────────────────────────────────

async function listTasks(scope = "today") {
  const r = await _fetch(`/tasks?scope=${scope}`);
  const data = await _json(r);
  return data.map(_toFrontTask);
}

async function createTask(rawText, opts = {}) {
  // opts: { importance?: 1..5, urgency?: 1..5, due_at?: ISO string }
  const body = { text: rawText, client_now: _localIsoWithOffset() };
  if (opts && opts.importance != null) body.importance = opts.importance;
  if (opts && opts.urgency != null)    body.urgency = opts.urgency;
  if (opts && opts.due_at != null)     body.due_at = opts.due_at;
  const r = await _fetch(`/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const t = await _json(r);
  return _toFrontTask(t);
}

async function patchTask(id, fields) {
  const body = _toBackPatch(fields);
  const r = await _fetch(`/tasks/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  await _json(r);
  // Backend returns {id, updated:[...]} — fetch fresh task list to refresh.
  // The caller (App.jsx) typically reloads after a mutation.
  return { id, ...fields };
}

async function deleteTask(id) {
  const r = await _fetch(`/tasks/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  return _json(r);
}

// classifyTask: legacy shim. App.jsx calls it and expects the dimensions
// of the just-classified task; we create+classify in one call and return
// the dimensions for compatibility, stashing the full task on window.
async function classifyTask(rawText, _dimensions, opts) {
  const fullTask = await createTask(rawText, opts);
  window.__lastClassified = fullTask;
  return {
    subject:    fullTask.subject,
    context:    fullTask.context,
    importance: fullTask.importance,
    urgency:    fullTask.urgency,
    time_value: fullTask.time_value,
    next_steps: [],
  };
}

// ─── Suggestions (not implemented — return empty so panels don't crash) ─

async function suggestDimensions(_tasks, _dimensions) {
  return { new_values: [], new_dimensions: [] };
}

async function suggestConnections(_tasks) {
  return { sessions: [], related: [] };
}

// ─── Auth ─────────────────────────────────────────────────

async function authMe() {
  const r = await _fetch(`/auth/me`, { credentials: "include" });
  if (r.status === 401) return null;
  if (!r.ok) throw new Error(`auth/me: ${r.status}`);
  return r.json();
}

async function authLogout() {
  await _fetch(`/auth/logout`, {
    method: "POST",
    credentials: "include",
    keepalive: true,
  });
}

// ─── User context — free-text profile passed to Gemini ────

async function getUserContext() {
  const r = await _fetch(`/context`);
  if (!r.ok) return { text: "" };
  return _json(r);
}
async function setUserContext(text) {
  const r = await _fetch(`/context`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: text || "" }),
  });
  return _json(r);
}

// ─── Patterns (settings page) ──────────────────────────────

async function listPatterns() {
  const r = await _fetch(`/patterns`);
  return _json(r);
}

async function patchPattern(id, fields) {
  const r = await _fetch(`/patterns/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
    keepalive: true,  // survive tab close / SPA navigation mid-flight
  });
  return _json(r);
}

async function createPattern(payload) {
  const r = await _fetch(`/patterns`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  });
  return _json(r);
}

async function deletePattern(id) {
  const r = await _fetch(`/patterns/${id}`, {
    method: "DELETE",
    keepalive: true,
  });
  if (!r.ok) {
    let detail;
    try { detail = (await r.json()).detail; } catch { detail = await r.text(); }
    throw new Error(`${r.status}: ${detail}`);
  }
  return true;  // 204 has no body
}

async function listCategories() {
  const r = await _fetch(`/categories`);
  return _json(r);
}

async function createCategory(payload) {
  const r = await _fetch(`/categories`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  });
  const cat = await _json(r);
  if (cat && cat.name && !window.SUBJECT_META[cat.name]) {
    window.SUBJECT_META[cat.name] = {
      color: "#" + (cat.color_dark || "6B7280"),
      icon: "Book",
      label: cat.name,
      bg: "#F3F4F6",
      mid: "#9CA3AF",
    };
  }
  return cat;
}

async function deleteCategory(id) {
  const r = await _fetch(`/categories/${id}`, {
    method: "DELETE",
    keepalive: true,
  });
  if (!r.ok) {
    let detail;
    try { detail = (await r.json()).detail; } catch { detail = await r.text(); }
    throw new Error(`${r.status}: ${detail}`);
  }
  return true;
}

// ─── Feedback ─────────────────────────────────────────────

async function submitFeedback(text, page) {
  const r = await _fetch(`/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, page: page || null }),
    keepalive: true,
  });
  return _json(r);
}

window.claudeAPI = {
  classifyTask,
  suggestDimensions,
  suggestConnections,
  listTasks,
  createTask,
  patchTask,
  deleteTask,
  getUserContext,
  setUserContext,
  // academic-specific
  listPatterns,
  patchPattern,
  createPattern,
  deletePattern,
  listCategories,
  createCategory,
  deleteCategory,
  // auth
  authMe,
  authLogout,
  // feedback
  submitFeedback,
};
