import { describe, expect, it } from "vitest";
import { buildFields, NONE } from "./fields";
import type { Item, ItemType, PropertyDef } from "./types";
import { applyView, groupItems } from "./viewEngine";

const props: PropertyDef[] = [
  { id: "effort", name: "מאמץ", type: "choice", sort: 0, archived: false,
    options: [{ id: "easy", label: "קל", color: "green" }, { id: "hard", label: "קשה", color: "red" }] },
];
const types: ItemType[] = [{ id: "task", name: "משימה", icon: "✅", color: "blue", suggested: [], sort: 0, archived: false }];

function item(p: Partial<Item>): Item {
  return {
    id: Math.random().toString(36).slice(2), title: "x", notes: "", type_id: null, parent_id: null, status: "open",
    inbox: false, when_at: null, when_end: null, due_at: null, span_start: null, span_end: null, snooze_until: null,
    repeat: null, links: [], props: {}, postpone_count: 0, archived: false,
    created_at: "2026-09-01T10:00:00", updated_at: "2026-09-01T10:00:00", completed_at: null, ...p,
  };
}

const items = [
  item({ title: "a", props: { effort: "easy" }, due_at: "2026-09-30", type_id: "task" }),
  item({ title: "b", props: { effort: "hard" }, due_at: "2026-09-28" }),
  item({ title: "c", due_at: null }),
  item({ title: "d", status: "done", props: { effort: "easy" } }),
];
const fields = buildFields({ properties: props, types, itemsById: new Map(items.map((i) => [i.id, i])), today: "2026-09-27" });

describe("applyView", () => {
  it("hides done items unless asked", () => {
    expect(applyView(items, {}, fields, "2026-09-27").map((i) => i.title)).not.toContain("d");
    expect(applyView(items, { showDone: true }, fields, "2026-09-27").map((i) => i.title)).toContain("d");
  });

  it("filters by a choice property", () => {
    const out = applyView(items, { filters: [{ field: "effort", op: "is", value: ["easy"] }] }, fields, "2026-09-27");
    expect(out.map((i) => i.title)).toEqual(["a"]);
  });

  it("finds items missing a property", () => {
    const out = applyView(items, { filters: [{ field: "effort", op: "empty" }] }, fields, "2026-09-27");
    expect(out.map((i) => i.title)).toEqual(["c"]);
  });

  it("sorts by date with empty values last", () => {
    const out = applyView(items, { sort: { field: "due", dir: "asc" } }, fields, "2026-09-27");
    expect(out.map((i) => i.title)).toEqual(["b", "a", "c"]);
  });

  it("filters by the next N days", () => {
    const out = applyView(items, { filters: [{ field: "due", op: "next_days", value: 2 }] }, fields, "2026-09-27");
    expect(out.map((i) => i.title)).toEqual(["b"]);
  });
});

describe("groupItems", () => {
  it("groups by choice with a 'no value' bucket", () => {
    const effort = fields.find((f) => f.key === "effort")!;
    const groups = groupItems(applyView(items, {}, fields, "2026-09-27"), effort);
    expect(groups.map((g) => [g.bucket.key, g.items.length])).toEqual([["easy", 1], ["hard", 1], [NONE, 1]]);
  });
});
