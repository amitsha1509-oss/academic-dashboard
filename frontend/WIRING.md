# Wiring the Frontend to a Real Backend

## Current state

The prototype calls Claude through a browser-side helper:

```js
// src/claude-api.jsx
const text = await window.claude.complete(prompt);
```

This **only works in the design preview environment**. In production, this call must go through your FastAPI server (which holds the API key).

## What to change

Exactly one file: **`src/claude-api.jsx`**. Replace its three functions to call your backend instead.

### Before

```js
async function classifyTask(rawText, dimensions) {
  // ... build prompt ...
  const text = await window.claude.complete(prompt);
  const parsed = extractJSON(text);
  // ... validate enums ...
  return parsed;
}
```

### After

```js
async function classifyTask(rawText) {
  const r = await fetch("/api/tasks/classify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ raw_text: rawText }),
  });
  if (!r.ok) throw new Error(`classify failed: ${r.status}`);
  return await r.json();
}

async function suggestDimensions(tasks) {
  const r = await fetch("/api/suggest/dimensions", { method: "POST" });
  if (!r.ok) throw new Error(`suggest dims failed: ${r.status}`);
  return await r.json();
}

async function suggestConnections(tasks) {
  const r = await fetch("/api/suggest/connections", { method: "POST" });
  if (!r.ok) throw new Error(`suggest conns failed: ${r.status}`);
  return await r.json();
}
```

The backend reads tasks from the DB by user, so the frontend doesn't need to send them.

---

## Endpoints

### `POST /api/tasks/classify`
Quick classification only — does NOT persist. Frontend uses this to show chips before saving.

**Request**
```json
{ "raw_text": "send dana good luck tomorrow 9am" }
```

**Response** (200)
```json
{
  "subject": "friends",
  "context": "@phone",
  "importance": "low",
  "urgency": "high",
  "time_value": "2026-04-26T09:00:00",
  "next_steps": ["draft message", "set reminder for 8:30"]
}
```

### `POST /api/tasks`
Create + classify + persist in one call.

**Request**
```json
{ "raw_text": "..." }
```

**Response** (201) — full Task object including server-assigned `id` and `created_at`.

### `GET /api/tasks`
Returns the user's tasks, ordered by `created_at` desc.

**Response** (200)
```json
[ { "id": 1, "raw_text": "...", ... } ]
```

### `PATCH /api/tasks/{id}`
Partial update. Used by the edit dialog and by toggle-done.

**Request** (any subset)
```json
{ "subject": "money", "status": "done", "completed_steps": ["draft message"] }
```

**Response** (200) — updated Task.

### `DELETE /api/tasks/{id}`
204 on success.

### `POST /api/suggest/dimensions`
No body. Backend pulls the user's recent 30 tasks, builds the prompt, calls Claude, returns the parsed result. See `DATA_MODEL.md` for the response shape.

### `POST /api/suggest/connections`
No body. Backend pulls user's open tasks, calls Claude, returns the parsed result.

---

## Frontend hooks to update

After rewiring `claude-api.jsx`, two more places need to switch from local state to the API:

### `src/App.jsx` — load tasks from API
Replace:
```js
const [tasks, setTasks] = useState(window.SEED_TASKS);
```
with:
```js
const [tasks, setTasks] = useState([]);
useEffect(() => {
  fetch("/api/tasks").then(r => r.json()).then(setTasks);
}, []);
```

### Persist mutations
Currently mutations only update local state. After each `setTasks(...)` call in App.jsx, fire the corresponding PATCH/DELETE/POST. The places that need this:

- `handleCreate` — POST `/api/tasks` (response is the full new Task with server id)
- `handleToggleDone` — PATCH `/api/tasks/{id}` with `{status}`
- `handleDelete` — DELETE `/api/tasks/{id}`
- `handleSaveEdit` — PATCH `/api/tasks/{id}` with the changed fields
- `toggleStep` (in TaskCard) — PATCH `/api/tasks/{id}` with `{completed_steps}`

Use optimistic updates: update local state first, fire the request, roll back on error.

---

## CORS

If the FastAPI server is on a different origin than the static HTML:
```py
from fastapi.middleware.cors import CORSMiddleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://your-frontend.com"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

For dev, point the frontend's fetch URLs at `http://localhost:8000` (or use a Vite proxy if you migrate to a build setup).

---

## DB schema sketch (Postgres)

```sql
CREATE TABLE tasks (
  id              SERIAL PRIMARY KEY,
  user_id         UUID NOT NULL,
  raw_text        TEXT NOT NULL,
  subject         TEXT NOT NULL,
  context         TEXT NOT NULL,
  importance      TEXT NOT NULL,
  urgency         TEXT NOT NULL,
  time_value      TIMESTAMPTZ NULL,
  status          TEXT NOT NULL DEFAULT 'open',
  next_steps      JSONB NOT NULL DEFAULT '[]',
  completed_steps JSONB NOT NULL DEFAULT '[]',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tasks_user_created  ON tasks (user_id, created_at DESC);
CREATE INDEX idx_tasks_user_time     ON tasks (user_id, time_value) WHERE time_value IS NOT NULL;
CREATE INDEX idx_tasks_user_status   ON tasks (user_id, status);

-- Optional: enums as CHECK constraints
ALTER TABLE tasks ADD CONSTRAINT chk_subject    CHECK (subject IN ('projects','money','university','friends','errands','health','other'));
ALTER TABLE tasks ADD CONSTRAINT chk_context    CHECK (context IN ('@phone','@computer','@errand','@home','@anywhere'));
ALTER TABLE tasks ADD CONSTRAINT chk_importance CHECK (importance IN ('low','medium','high'));
ALTER TABLE tasks ADD CONSTRAINT chk_urgency    CHECK (urgency IN ('low','medium','high'));
ALTER TABLE tasks ADD CONSTRAINT chk_status     CHECK (status IN ('open','done'));
```
