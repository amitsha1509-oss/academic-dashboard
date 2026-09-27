// The field registry: one uniform description of every property an item can have,
// core (status, dates, parent...) and user-defined alike. Views, filters, grouping,
// sorting and editors all go through this, so a new property works everywhere at once.
import { addDays, daysBetween, todayISO } from "./dates";
import type { Item, ItemPatch, ItemType, PropertyDef } from "./types";

export type FieldKind =
  | "title" | "notes" | "status" | "type" | "parent" | "inbox"
  | "date" | "span" | "repeat" | "links"
  | "text" | "number" | "choice" | "multi" | "checkbox" | "url";

export interface Bucket {
  key: string;
  label: string;
  color?: string;
  icon?: string;
}

export interface Field {
  key: string;
  label: string;
  kind: FieldKind;
  core: boolean;
  /** Raw value used for empty checks, filters and sorting. */
  get(item: Item): unknown;
  /** Group(s) an item belongs to. Multi-value fields can return several. */
  buckets(item: Item): Bucket[];
  /** All groups in display order, including empty ones, when the set is known. */
  allBuckets?(): Bucket[];
  /** Patch that puts an item into a bucket (drag & drop, bulk edit). */
  setBucket?(key: string | null, item?: Item): ItemPatch;
  /** Filter operators that make sense for this field. */
  ops: string[];
}

export const NONE = "__none__";

export interface FieldContext {
  properties: PropertyDef[];
  types: ItemType[];
  itemsById: Map<string, Item>;
  today?: string;
}

const STATUS_BUCKETS: Bucket[] = [
  { key: "open", label: "פתוח", color: "blue" },
  { key: "done", label: "בוצע", color: "green" },
  { key: "dropped", label: "בוטל", color: "gray" },
];

const DATE_BUCKETS: Bucket[] = [
  { key: "past", label: "עבר", color: "red" },
  { key: "today", label: "היום", color: "orange" },
  { key: "tomorrow", label: "מחר", color: "yellow" },
  { key: "week", label: "השבוע הקרוב", color: "blue" },
  { key: "later", label: "בהמשך", color: "gray" },
];

function dateBucket(value: string | null | undefined, today: string): Bucket[] {
  if (!value) return [{ key: NONE, label: "ללא תאריך" }];
  const diff = daysBetween(today, value.slice(0, 10));
  const key = diff < 0 ? "past" : diff === 0 ? "today" : diff === 1 ? "tomorrow" : diff <= 7 ? "week" : "later";
  return [DATE_BUCKETS.find((b) => b.key === key)!];
}

export function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || v === "" || v === false || (Array.isArray(v) && v.length === 0);
}

const TEXT_OPS = ["contains", "is", "empty", "not_empty"];
const DATE_OPS = ["before", "after", "next_days", "empty", "not_empty"];
const SET_OPS = ["is", "is_not", "empty", "not_empty"];

export function buildFields(ctx: FieldContext): Field[] {
  const today = ctx.today ?? todayISO();
  const types = ctx.types.filter((t) => !t.archived);
  const noneBucket = (label = "ללא"): Bucket => ({ key: NONE, label });

  const dateField = (key: string, label: string, get: (i: Item) => string | null): Field => ({
    key, label, kind: "date", core: true, get,
    buckets: (i) => dateBucket(get(i), today),
    allBuckets: () => [...DATE_BUCKETS, noneBucket("ללא תאריך")],
    ops: DATE_OPS,
  });

  const core: Field[] = [
    {
      key: "title", label: "כותרת", kind: "title", core: true, get: (i) => i.title,
      buckets: (i) => [{ key: i.title, label: i.title }], ops: ["contains"],
    },
    {
      key: "status", label: "סטטוס", kind: "status", core: true, get: (i) => i.status,
      buckets: (i) => [STATUS_BUCKETS.find((b) => b.key === i.status)!],
      allBuckets: () => STATUS_BUCKETS,
      setBucket: (k) => ({ status: (k ?? "open") as Item["status"] }),
      ops: ["is", "is_not"],
    },
    {
      key: "type", label: "סוג", kind: "type", core: true, get: (i) => i.type_id,
      buckets: (i) => {
        const t = ctx.types.find((t) => t.id === i.type_id);
        return [t ? { key: t.id, label: t.name, color: t.color, icon: t.icon } : noneBucket("ללא סוג")];
      },
      allBuckets: () => [...types.map((t) => ({ key: t.id, label: t.name, color: t.color, icon: t.icon })), noneBucket("ללא סוג")],
      setBucket: (k) => ({ type_id: k === NONE ? null : k }),
      ops: SET_OPS,
    },
    {
      key: "parent", label: "חלק מ", kind: "parent", core: true,
      get: (i) => (i.parent_id && ctx.itemsById.has(i.parent_id) ? i.parent_id : null),
      buckets: (i) => {
        const p = i.parent_id ? ctx.itemsById.get(i.parent_id) : undefined;
        if (!p) return [noneBucket()];
        const t = ctx.types.find((t) => t.id === p.type_id);
        return [{ key: p.id, label: p.title, icon: t?.icon, color: t?.color }];
      },
      setBucket: (k) => ({ parent_id: k === NONE ? null : k }),
      ops: SET_OPS,
    },
    dateField("when", "מתי", (i) => i.when_at),
    dateField("due", "תאריך יעד", (i) => i.due_at),
    { ...dateField("span", "תקופה", (i) => i.span_start), kind: "span" },
    dateField("snooze", "נדחה עד", (i) => i.snooze_until),
    {
      key: "repeat", label: "חזרה", kind: "repeat", core: true, get: (i) => i.repeat,
      buckets: (i) => [i.repeat ? { key: "yes", label: "חוזר" } : { key: NONE, label: "חד־פעמי" }],
      ops: ["empty", "not_empty"],
    },
    {
      key: "inbox", label: "בתיבת הקליטה", kind: "inbox", core: true, get: (i) => i.inbox,
      buckets: (i) => [i.inbox ? { key: "yes", label: "בתיבת הקליטה" } : { key: NONE, label: "ממוין" }],
      setBucket: (k) => ({ inbox: k === "yes" }),
      ops: ["empty", "not_empty"],
    },
    {
      key: "links", label: "קישורים", kind: "links", core: true, get: (i) => i.links,
      buckets: (i) => [i.links.length ? { key: "yes", label: "עם קישורים" } : noneBucket("ללא קישורים")],
      ops: ["contains", "empty", "not_empty"],
    },
    {
      key: "notes", label: "הערות", kind: "notes", core: true, get: (i) => i.notes,
      buckets: (i) => [i.notes ? { key: "yes", label: "עם הערות" } : noneBucket("ללא הערות")],
      ops: ["contains", "empty", "not_empty"],
    },
    dateField("created", "נוצר", (i) => i.created_at.slice(0, 10)),
  ];

  const custom: Field[] = ctx.properties.filter((p) => !p.archived).map((p): Field => {
    const get = (i: Item) => i.props[p.id];
    const setProp = (v: unknown): ItemPatch => ({ props: { [p.id]: v } });
    const optionBucket = (id: string): Bucket => {
      const o = p.options.find((o) => o.id === id);
      return o ? { key: o.id, label: o.label, color: o.color } : { key: id, label: id };
    };
    const base = { key: p.id, label: p.name, core: false, get };
    switch (p.type) {
      case "choice":
        return {
          ...base, kind: "choice", ops: SET_OPS,
          buckets: (i) => (isEmpty(get(i)) ? [noneBucket("ללא ערך")] : [optionBucket(get(i) as string)]),
          allBuckets: () => [...p.options.map((o) => optionBucket(o.id)), noneBucket("ללא ערך")],
          setBucket: (k) => setProp(k === NONE ? null : k),
        };
      case "multi":
        return {
          ...base, kind: "multi", ops: SET_OPS,
          buckets: (i) => {
            const v = (get(i) as string[] | undefined) ?? [];
            return v.length ? v.map(optionBucket) : [noneBucket("ללא ערך")];
          },
          allBuckets: () => [...p.options.map((o) => optionBucket(o.id)), noneBucket("ללא ערך")],
          setBucket: (k, item) => {
            if (k === NONE) return setProp(null);
            const cur = ((item && (item.props[p.id] as string[])) || []).filter((x) => x !== k);
            return setProp([...cur, k]);
          },
        };
      case "checkbox":
        return {
          ...base, kind: "checkbox", ops: ["empty", "not_empty"],
          buckets: (i) => [get(i) ? { key: "yes", label: "כן", color: "green" } : noneBucket("לא")],
          allBuckets: () => [{ key: "yes", label: "כן", color: "green" }, noneBucket("לא")],
          setBucket: (k) => setProp(k === "yes" ? true : null),
        };
      case "date":
        return {
          ...base, kind: "date", ops: DATE_OPS,
          buckets: (i) => dateBucket(get(i) as string | undefined, today),
          allBuckets: () => [...DATE_BUCKETS, noneBucket("ללא תאריך")],
        };
      default:
        return {
          ...base, kind: p.type, ops: TEXT_OPS,
          buckets: (i) => (isEmpty(get(i)) ? [noneBucket("ללא ערך")] : [{ key: String(get(i)), label: String(get(i)) }]),
        };
    }
  });

  return [...core, ...custom];
}

/** Resolve "today" / "+7" style tokens used in date filters. */
export function resolveDateToken(v: unknown, today: string): string | null {
  if (typeof v !== "string" || !v) return null;
  if (v === "today") return today;
  if (/^[+-]\d+$/.test(v)) return addDays(today, Number(v));
  return v.slice(0, 10);
}
