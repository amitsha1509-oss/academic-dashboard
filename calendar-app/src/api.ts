import type { User, Task, GCalEvent, GCalStatus } from './types'

const BASE = import.meta.env.DEV ? '' : ''

async function _fetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, { credentials: 'include', ...opts })
  if (!res.ok) throw Object.assign(new Error(res.statusText), { status: res.status })
  return res.json()
}

export const api = {
  me: () => _fetch<User>('/auth/me'),

  tasks: () => _fetch<Task[]>('/tasks'),

  gcalStatus: () => _fetch<GCalStatus>('/gcal/status'),

  gcalEvents: (start: string, end: string) =>
    _fetch<GCalEvent[]>(`/gcal/events?time_min=${encodeURIComponent(start)}&time_max=${encodeURIComponent(end)}`),

  scheduleTask: (taskId: number, start: string, end: string) =>
    _fetch<{ ok: boolean; gcal_event_id: string }>(`/gcal/schedule/${taskId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ start, end }),
    }),

  unscheduleTask: (taskId: number) =>
    _fetch<{ ok: boolean }>(`/gcal/schedule/${taskId}`, { method: 'DELETE' }),
}
