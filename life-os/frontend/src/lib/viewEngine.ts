// Turns a saved view config into filtered, sorted, grouped items. Pure: no React, no API.
import { addDays, todayISO } from "./dates";
import { isEmpty, NONE, resolveDateToken, type Bucket, type Field } from "./fields";
import type { Filter, Item, ViewConfig } from "./types";

export interface Group {
  bucket: Bucket;
  items: Item[];
}

function textOf(field: Field, item: Item): string {
  const v = field.get(item);
  if (field.kind === "links") return (v as Item["links"]).map((l) => `${l.title} ${l.url}`).join(" ");
  if (field.kind === "choice" || field.kind === "multi") return field.buckets(item).map((b) => b.label).join(" ");
  return v === null || v === undefined ? "" : String(v);
}

export function matches(item: Item, filter: Filter, field: Field | undefined, today: string): boolean {
  if (!field) return true; // a filter on a deleted property is ignored, not fatal
  const v = field.get(item);
  switch (filter.op) {
    case "empty":
      return isEmpty(v);
    case "not_empty":
      return !isEmpty(v);
    case "contains":
      return textOf(field, item).toLowerCase().includes(String(filter.value ?? "").toLowerCase());
    case "is":
    case "is_not": {
      const wanted = Array.isArray(filter.value) ? (filter.value as string[]) : [String(filter.value ?? "")];
      const keys = field.buckets(item).map((b) => b.key);
      const hit = wanted.some((w) => keys.includes(w) || (w === NONE && isEmpty(v)));
      return filter.op === "is" ? hit : !hit;
    }
    case "before":
    case "after": {
      const bound = resolveDateToken(filter.value, today);
      if (!bound || typeof v !== "string" || !v) return false;
      const d = v.slice(0, 10);
      return filter.op === "before" ? d < bound : d > bound;
    }
    case "next_days": {
      if (typeof v !== "string" || !v) return false;
      const d = v.slice(0, 10);
      return d >= today && d <= addDays(today, Number(filter.value ?? 7));
    }
    default:
      return true;
  }
}

function compare(a: unknown, b: unknown): number {
  const ea = isEmpty(a), eb = isEmpty(b);
  if (ea || eb) return ea === eb ? 0 : ea ? 1 : -1; // empty values always last
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "he");
}

export function applyView(items: Item[], config: ViewConfig, fields: Field[], today = todayISO()) {
  const byKey = new Map(fields.map((f) => [f.key, f]));
  let out = items.filter((i) => !i.archived);
  if (!config.showDone && !(config.filters ?? []).some((f) => f.field === "status")) {
    out = out.filter((i) => i.status === "open");
  }
  for (const f of config.filters ?? []) out = out.filter((i) => matches(i, f, byKey.get(f.field), today));

  const sortField = config.sort ? byKey.get(config.sort.field) : undefined;
  if (sortField && config.sort) {
    const dir = config.sort.dir === "desc" ? -1 : 1;
    const orderOf = sortField.allBuckets ? new Map(sortField.allBuckets().map((b, i) => [b.key, i])) : null;
    out = [...out].sort((a, b) => {
      if (orderOf) {
        const ka = orderOf.get(sortField.buckets(a)[0]?.key) ?? 999;
        const kb = orderOf.get(sortField.buckets(b)[0]?.key) ?? 999;
        return (ka - kb) * dir;
      }
      const c = compare(sortField.get(a), sortField.get(b));
      return isEmpty(sortField.get(a)) || isEmpty(sortField.get(b)) ? c : c * dir;
    });
  } else {
    out = [...out].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  return out;
}

export function groupItems(items: Item[], field: Field | undefined, keepEmpty = false): Group[] {
  if (!field) return [{ bucket: { key: "all", label: "" }, items }];
  const groups = new Map<string, Group>();
  for (const b of field.allBuckets?.() ?? []) groups.set(b.key, { bucket: b, items: [] });
  for (const item of items) {
    for (const b of field.buckets(item)) {
      if (!groups.has(b.key)) groups.set(b.key, { bucket: b, items: [] });
      groups.get(b.key)!.items.push(item);
    }
  }
  let list = [...groups.values()];
  if (!field.allBuckets) {
    list.sort((a, b) =>
      a.bucket.key === NONE ? 1 : b.bucket.key === NONE ? -1 : a.bucket.label.localeCompare(b.bucket.label, "he"));
  }
  if (!keepEmpty) list = list.filter((g) => g.items.length > 0);
  return list;
}
