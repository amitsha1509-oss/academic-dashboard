// Plain-language version of a view: the builder's simple questions <-> the stored filters,
// and a one-sentence description shown on the view itself.
import type { Field } from "./fields";
import type { Filter, Item, ItemType, PropertyDef, ViewConfig } from "./types";

export type DateScope = "all" | "late" | "week" | "none";

export interface ViewSpec {
  types: string[];
  parent: string | null;
  choices: Record<string, string[]>; // property id -> allowed option ids
  date: DateScope;
  showDone: boolean;
  sort: "due" | "when" | "title" | "created";
  group: string | null;
  matrix: boolean;
  /** Filters the simple questions don't cover; kept as they are. */
  other: Filter[];
}

const asList = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : v === undefined ? [] : [String(v)]);

export function toSpec(config: ViewConfig, properties: PropertyDef[]): ViewSpec {
  const spec: ViewSpec = {
    types: [], parent: null, choices: {}, date: "all", showDone: !!config.showDone,
    sort: (config.sort?.field as ViewSpec["sort"]) ?? "created", group: config.groupBy ?? null,
    matrix: config.layout === "grid", other: [],
  };
  if (!["due", "when", "title", "created"].includes(spec.sort)) spec.sort = "created";
  const choiceIds = new Set(properties.filter((p) => p.type === "choice" || p.type === "multi").map((p) => p.id));
  for (const f of config.filters ?? []) {
    if (f.field === "type" && f.op === "is") spec.types = asList(f.value);
    else if (f.field === "parent" && f.op === "is") spec.parent = asList(f.value)[0] ?? null;
    else if (choiceIds.has(f.field) && f.op === "is") spec.choices[f.field] = asList(f.value);
    else if (f.field === "due" && f.op === "before" && f.value === "today") spec.date = "late";
    else if (f.field === "due" && f.op === "next_days") spec.date = "week";
    else if (f.field === "due" && f.op === "empty") spec.date = "none";
    else spec.other.push(f);
  }
  return spec;
}

export function toConfig(spec: ViewSpec): ViewConfig {
  const filters: Filter[] = [];
  if (spec.types.length) filters.push({ field: "type", op: "is", value: spec.types });
  if (spec.parent) filters.push({ field: "parent", op: "is", value: [spec.parent] });
  for (const [prop, opts] of Object.entries(spec.choices)) if (opts.length) filters.push({ field: prop, op: "is", value: opts });
  if (spec.date === "late") filters.push({ field: "due", op: "before", value: "today" });
  if (spec.date === "week") filters.push({ field: "due", op: "next_days", value: 7 });
  if (spec.date === "none") filters.push({ field: "due", op: "empty" });
  filters.push(...spec.other);
  return {
    filters,
    showDone: spec.showDone,
    sort: spec.sort === "created" ? null : { field: spec.sort, dir: "asc" },
    groupBy: spec.matrix ? null : spec.group,
    layout: spec.matrix ? "grid" : "list",
    grid: spec.matrix ? { x: "urgency", y: "importance" } : undefined,
  };
}

const SORT_TEXT: Record<ViewSpec["sort"], string> = {
  due: "לפי תאריך יעד", when: "לפי מתי", title: "לפי שם", created: "החדשים קודם",
};
const DATE_TEXT: Record<DateScope, string> = {
  all: "", late: "שעבר להם התאריך", week: "שצריך לסיים בשבוע הקרוב", none: "בלי תאריך יעד",
};

/** "משימות בתוך השקעות, מאמץ: קל, שצריך לסיים בשבוע הקרוב. לפי תאריך יעד." */
export function describeView(config: ViewConfig, ctx: { types: ItemType[]; properties: PropertyDef[]; itemsById: Map<string, Item>; fields: Field[] }): string {
  const spec = toSpec(config, ctx.properties);
  const typeNames = spec.types.map((id) => ctx.types.find((t) => t.id === id)?.name).filter(Boolean);
  let s = typeNames.length ? typeNames.join(", ") : "כל הפריטים";
  if (spec.parent) s += ` בתוך ${ctx.itemsById.get(spec.parent)?.title ?? "פריט שנמחק"}`;
  for (const [prop, opts] of Object.entries(spec.choices)) {
    const p = ctx.properties.find((x) => x.id === prop);
    if (p && opts.length) s += `, ${p.name}: ${opts.map((o) => p.options.find((x) => x.id === o)?.label ?? o).join(" או ")}`;
  }
  if (spec.date !== "all") s += `, ${DATE_TEXT[spec.date]}`;
  s += spec.showDone ? " (כולל שהושלמו)" : "";
  s += ". ";
  if (spec.matrix) s += "מסודר לפי חשיבות ודחיפות.";
  else {
    s += `${SORT_TEXT[spec.sort]}`;
    const g = spec.group ? ctx.fields.find((f) => f.key === spec.group) : undefined;
    if (g) s += `, מקובץ לפי ${g.key === "parent" ? "מה שהם בתוכו" : g.label}`;
    s += ".";
  }
  if (spec.other.length) s += " יש עוד סינונים מתקדמים.";
  return s;
}
