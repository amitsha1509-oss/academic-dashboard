export type Status = "open" | "done" | "dropped";
export type PropType = "text" | "number" | "date" | "choice" | "multi" | "checkbox" | "url";

export interface Repeat {
  freq: "daily" | "weekly" | "monthly";
  interval: number;
  weekdays: number[]; // 0 = Sunday
  start: string;
  until?: string | null;
  time?: string | null;
  end_time?: string | null;
  track_missed: boolean;
}

export interface Link {
  title: string;
  url: string;
}

export interface Item {
  id: string;
  title: string;
  notes: string;
  type_id: string | null;
  parent_id: string | null;
  status: Status;
  inbox: boolean;
  when_at: string | null;
  when_end: string | null;
  due_at: string | null;
  span_start: string | null;
  span_end: string | null;
  snooze_until: string | null;
  repeat: Repeat | null;
  links: Link[];
  props: Record<string, unknown>;
  postpone_count: number;
  archived: boolean;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export type ItemPatch = Partial<Omit<Item, "id" | "archived" | "created_at" | "updated_at" | "completed_at" | "postpone_count">>;

export interface ChoiceOption {
  id: string;
  label: string;
  color: string;
}

export interface PropertyDef {
  id: string;
  name: string;
  type: PropType;
  options: ChoiceOption[];
  sort: number;
  archived: boolean;
}

export interface ItemType {
  id: string;
  name: string;
  icon: string;
  color: string;
  suggested: string[];
  sort: number;
  archived: boolean;
}

export type Layout = "list" | "board" | "table" | "grid";

export type FilterOp = "is" | "is_not" | "empty" | "not_empty" | "contains" | "before" | "after" | "next_days";

export interface Filter {
  field: string;
  op: FilterOp;
  value?: unknown;
}

export interface ViewConfig {
  layout?: Layout;
  filters?: Filter[];
  groupBy?: string | null;
  sort?: { field: string; dir: "asc" | "desc" } | null;
  grid?: { x: string; y: string };
  columns?: string[];
  showDone?: boolean;
}

export interface View {
  id: string;
  name: string;
  icon: string;
  config: ViewConfig;
  sort: number;
}

export interface Occurrence {
  item_id: string;
  date: string;
  time: string | null;
  end_time: string | null;
  status: "open" | "done" | "skipped";
}

export interface ScheduleEntry extends Occurrence {
  kind: "occurrence" | "item";
}

export interface TodayData {
  date: string;
  schedule: ScheduleEntry[];
  due_today: string[];
  overdue: string[];
  returned: string[];
  upcoming: { date: string; item_id: string }[];
}

export interface MissedData {
  date: string;
  occurrences: Occurrence[];
  overdue: string[];
  past_unmarked: string[];
  postponed: string[];
  stale_inbox: string[];
}
