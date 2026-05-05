export interface User {
  id: number;
  email: string;
  name: string | null;
  google_sub: string | null;
}

export interface Task {
  id: string;
  raw_text: string;
  subject: string;
  importance: 'low' | 'high';
  urgency: 'low' | 'high';
  time_value: string | null;
  status: 'open' | 'done' | 'skipped';
  created_at: string;
  _due_at: string | null;
  _release_at: string | null;
  _source: string;
  _type: string;
}

export interface Category {
  id: number;
  name: string;
  color_dark: string | null;
  sort_order: number;
  default_importance: number | null;
  default_urgency: number | null;
  self_confidence: 'excellent' | 'partial' | 'gap' | null;
  gap_notes: string | null;
  keywords: string | null;
}

export interface Pattern {
  id: number;
  category_id: number;
  category_name: string;
  kind: 'lecture' | 'tutorial' | 'hw' | 'reading';
  day_of_week: string;
  start_time: string;
  end_time: string | null;
  default_importance: number | null;
  default_urgency: number | null;
  title_override: string | null;
}

export type CreateTaskOpts = {
  importance?: number | null;
  urgency?: number | null;
  due_at?: string | null;
};
