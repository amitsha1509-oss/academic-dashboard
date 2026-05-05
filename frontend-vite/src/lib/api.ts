import type { Task, Category, Pattern, User, CreateTaskOpts } from '../types';

function apiFetch(path: string, opts: RequestInit = {}) {
  return fetch(path, { credentials: 'include', ...opts });
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail: string;
    try {
      const body = await res.json();
      detail = Array.isArray(body.detail)
        ? body.detail.map((d: { loc?: string[]; msg: string }) =>
            `${(d.loc ?? []).slice(1).join('.') || 'body'}: ${d.msg}`).join('; ')
        : String(body.detail ?? body);
    } catch {
      detail = await res.text();
    }
    throw new Error(`${res.status}: ${detail}`);
  }
  return res.json();
}

function localIso() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const oh = pad(Math.floor(Math.abs(off) / 60));
  const om = pad(Math.abs(off) % 60);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${oh}:${om}`;
}

function scaleToLevel(n: number | null | undefined): 'low' | 'high' {
  return n != null && n >= 4 ? 'high' : 'low';
}

function fromBackend(t: Record<string, unknown>): Task {
  return {
    id: t.id as string,
    raw_text: t.title as string,
    subject: t.category_name as string,
    importance: scaleToLevel(t.importance as number),
    urgency: scaleToLevel(t.urgency as number),
    time_value: (t.due_at ?? t.scheduled_at ?? null) as string | null,
    status: t.status as Task['status'],
    created_at: (t.release_at ?? new Date().toISOString()) as string,
    _due_at: t.due_at as string | null,
    _release_at: t.release_at as string | null,
    _source: t.source as string,
    _type: t.type as string,
  };
}

// ── Tasks ─────────────────────────────────────────────────────────────

export async function listTasks(scope = 'today'): Promise<Task[]> {
  const r = await apiFetch(`/tasks?scope=${scope}`);
  const data = await json<Record<string, unknown>[]>(r);
  return data.map(fromBackend);
}

export async function createTask(text: string, opts: CreateTaskOpts = {}): Promise<Task> {
  const body: Record<string, unknown> = { text, client_now: localIso() };
  if (opts.importance != null) body.importance = opts.importance;
  if (opts.urgency != null)    body.urgency = opts.urgency;
  if (opts.due_at != null)     body.due_at = opts.due_at;
  const r = await apiFetch('/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return fromBackend(await json<Record<string, unknown>>(r));
}

export async function patchTask(id: string, fields: Record<string, unknown>) {
  const body: Record<string, unknown> = {};
  if ('status' in fields) body.status = fields.status;
  if ('importance' in fields && fields.importance) {
    body.importance = fields.importance === 'high' ? 5 : 2;
  }
  if ('urgency' in fields && fields.urgency) {
    body.urgency = fields.urgency === 'high' ? 5 : 2;
  }
  const r = await apiFetch(`/tasks/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return json(r);
}

export async function deleteTask(id: string) {
  const r = await apiFetch(`/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' });
  return json(r);
}

// ── Categories ────────────────────────────────────────────────────────

export async function listCategories(): Promise<Category[]> {
  const r = await apiFetch('/categories');
  return json<Category[]>(r);
}

export async function createCategory(payload: Record<string, unknown>): Promise<Category> {
  const r = await apiFetch('/categories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  });
  return json<Category>(r);
}

export async function patchCategory(id: number, fields: Record<string, unknown>) {
  const r = await apiFetch(`/categories/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
    keepalive: true,
  });
  return json<Category>(r);
}

export async function deleteCategory(id: number) {
  const r = await apiFetch(`/categories/${id}`, { method: 'DELETE', keepalive: true });
  if (!r.ok) throw new Error(`${r.status}`);
  return true;
}

// ── Patterns ──────────────────────────────────────────────────────────

export async function listPatterns(): Promise<Pattern[]> {
  const r = await apiFetch('/patterns');
  return json<Pattern[]>(r);
}

export async function createPattern(payload: Record<string, unknown>): Promise<Pattern> {
  const r = await apiFetch('/patterns', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  });
  return json<Pattern>(r);
}

export async function patchPattern(id: number, fields: Record<string, unknown>) {
  const r = await apiFetch(`/patterns/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
    keepalive: true,
  });
  return json(r);
}

export async function deletePattern(id: number) {
  const r = await apiFetch(`/patterns/${id}`, { method: 'DELETE', keepalive: true });
  if (!r.ok) throw new Error(`${r.status}`);
  return true;
}

// ── Auth ──────────────────────────────────────────────────────────────

export async function authMe(): Promise<User | null> {
  const r = await apiFetch('/auth/me');
  if (r.status === 401) return null;
  if (!r.ok) throw new Error(`auth/me: ${r.status}`);
  return r.json();
}

export async function authLogout() {
  await apiFetch('/auth/logout', { method: 'POST', keepalive: true });
}

// ── Context ───────────────────────────────────────────────────────────

export async function getUserContext(): Promise<{ text: string }> {
  const r = await apiFetch('/context');
  if (!r.ok) return { text: '' };
  return json(r);
}

export async function setUserContext(text: string) {
  const r = await apiFetch('/context', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: text || '' }),
  });
  return json(r);
}

// ── Feedback ──────────────────────────────────────────────────────────

export async function submitFeedback(text: string, page: string) {
  const r = await apiFetch('/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, page: page || null }),
    keepalive: true,
  });
  return json(r);
}
