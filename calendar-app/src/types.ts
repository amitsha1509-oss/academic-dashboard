export interface User {
  id: number
  email: string
  name: string | null
}

export interface Task {
  id: string
  category_id: number
  category_name: string
  title: string
  type: string
  scheduled_at: string | null
  due_at: string | null
  importance: number | null
  urgency: number | null
  status: string
  source: 'recurring' | 'adhoc'
}

export interface GCalEvent {
  id: string
  title: string
  start: string
  end: string
  is_academia: boolean
  calendar_name: string
  color: string
}

export interface GCalStatus {
  connected: boolean
  calendar_id: string | null
}
