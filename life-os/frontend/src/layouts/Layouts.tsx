// The four ways to lay out a view's items. All take already-filtered, sorted items.
import { ChevronDown, Plus } from "lucide-react";
import { useState, type CSSProperties, type DragEvent } from "react";
import { FieldValue } from "../components/FieldValue";
import { ItemMeta, ItemRow, TypeIcon } from "../components/ItemRow";
import { StatusCheck, Tag } from "../components/ui";
import { NONE, type Bucket, type Field } from "../lib/fields";
import { openItem } from "../lib/router";
import { useStore } from "../lib/store";
import type { Item, ItemPatch } from "../lib/types";
import { groupItems } from "../lib/viewEngine";

export interface LayoutProps {
  items: Item[];
  fields: Field[];
  groupBy?: Field;
  selection: Set<string> | null;
  toggleSelect: (id: string) => void;
  /** Patch every new item created inside this view gets, so it shows up here. */
  basePatch: ItemPatch;
}

function mergePatches(...patches: ItemPatch[]): ItemPatch {
  const out: ItemPatch = {};
  for (const p of patches) {
    Object.assign(out, { ...p, props: out.props || p.props ? { ...out.props, ...p.props } : undefined });
  }
  if (!out.props) delete out.props;
  return out;
}

function QuickAdd({ patch, placeholder = "חדש…" }: { patch: ItemPatch; placeholder?: string }) {
  const { createItem } = useStore();
  const [title, setTitle] = useState("");
  const add = async () => {
    if (!title.trim()) return;
    await createItem({ ...patch, title: title.trim(), inbox: false });
    setTitle("");
  };
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 text-sm">
      <Plus size={15} className="shrink-0 text-faint" />
      <input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()}
        placeholder={placeholder} className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-faint" />
    </div>
  );
}

function GroupTitle({ bucket }: { bucket: Bucket }) {
  if (bucket.key === NONE) return <span className="text-muted">{bucket.label}</span>;
  return <Tag color={bucket.color}>{bucket.icon ? `${bucket.icon} ` : ""}{bucket.label}</Tag>;
}

// ─── List ─────────────────────────────────────────────────────────
export function ListLayout({ items, groupBy, selection, toggleSelect, basePatch }: LayoutProps) {
  const groups = groupItems(items, groupBy);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const flip = (k: string) => setCollapsed((c) => { const n = new Set(c); n.has(k) ? n.delete(k) : n.add(k); return n; });

  if (!groupBy) {
    return (
      <div>
        {items.map((i) => <ItemRow key={i.id} item={i} selected={selection?.has(i.id)} onSelect={selection ? () => toggleSelect(i.id) : undefined} />)}
        {!items.length && <div className="py-6 text-center text-sm text-faint">אין פריטים שמתאימים לתצוגה הזו.</div>}
        <QuickAdd patch={basePatch} />
      </div>
    );
  }
  return (
    <div>
      {groups.map((g) => (
        <section key={g.bucket.key} className="mb-4">
          <button type="button" onClick={() => flip(g.bucket.key)} className="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-sm hover:bg-hover">
            <ChevronDown size={15} className={`text-faint transition-transform ${collapsed.has(g.bucket.key) ? "rotate-90" : ""}`} />
            <GroupTitle bucket={g.bucket} />
            <span className="text-xs text-faint">{g.items.length}</span>
          </button>
          {!collapsed.has(g.bucket.key) && (
            <div className="ps-3">
              {g.items.map((i) => <ItemRow key={i.id} item={i} selected={selection?.has(i.id)} onSelect={selection ? () => toggleSelect(i.id) : undefined} />)}
              {groupBy.setBucket && <QuickAdd patch={mergePatches(basePatch, groupBy.setBucket(g.bucket.key))} />}
            </div>
          )}
        </section>
      ))}
      {!groups.length && <div className="py-6 text-center text-sm text-faint">אין פריטים שמתאימים לתצוגה הזו.</div>}
    </div>
  );
}

// ─── Board ────────────────────────────────────────────────────────
function useDrop(onDrop: (itemId: string, fromKey: string | null) => void) {
  const [over, setOver] = useState(false);
  return {
    over,
    handlers: {
      onDragOver: (e: DragEvent) => { e.preventDefault(); setOver(true); },
      onDragLeave: () => setOver(false),
      onDrop: (e: DragEvent) => {
        e.preventDefault();
        setOver(false);
        const id = e.dataTransfer.getData("text/item");
        if (id) onDrop(id, e.dataTransfer.getData("text/from") || null);
      },
    },
  };
}

function Card({ item, from }: { item: Item; from?: string }) {
  const { updateItem } = useStore();
  const done = item.status === "done";
  return (
    <div
      draggable
      onDragStart={(e) => { e.dataTransfer.setData("text/item", item.id); if (from) e.dataTransfer.setData("text/from", from); }}
      onClick={() => openItem(item.id)}
      className="mb-1.5 cursor-pointer rounded-md border border-line bg-canvas p-2 text-sm shadow-[0_1px_2px_rgba(15,15,15,0.06)] hover:bg-hover"
    >
      <div className="flex items-start gap-1.5">
        <span className="mt-[2px]"><StatusCheck done={done} size={15} onToggle={() => updateItem(item.id, { status: done ? "open" : "done" })} /></span>
        <TypeIcon item={item} />
        <span className={`min-w-0 flex-1 leading-snug break-words ${done ? "text-faint line-through" : ""}`}>{item.title}</span>
      </div>
      <ItemMeta item={item} max={2} />
    </div>
  );
}

function BoardColumn({ bucket, items, field, basePatch }: { bucket: Bucket; items: Item[]; field: Field; basePatch: ItemPatch }) {
  const { itemsById, updateItem } = useStore();
  const drop = useDrop((id, from) => {
    const item = itemsById.get(id);
    if (!item || !field.setBucket || from === bucket.key) return;
    let patch = field.setBucket(bucket.key, item);
    if (field.kind === "multi" && from && from !== NONE && patch.props) {
      const list = (patch.props[field.key] as string[] | null) ?? [];
      patch = { props: { [field.key]: list.filter((k) => k !== from) } };
    }
    updateItem(id, patch);
  });
  return (
    <div {...drop.handlers}
      className={`flex w-64 shrink-0 flex-col rounded-lg p-1.5 transition-colors ${drop.over ? "bg-active" : "bg-sidebar"}`}>
      <div className="flex items-center gap-2 px-1 pb-2 text-sm">
        <GroupTitle bucket={bucket} />
        <span className="text-xs text-faint">{items.length}</span>
      </div>
      {items.map((i) => <Card key={i.id} item={i} from={bucket.key} />)}
      {field.setBucket && <QuickAdd patch={mergePatches(basePatch, field.setBucket(bucket.key))} />}
    </div>
  );
}

export function BoardLayout({ items, groupBy, fields, basePatch }: LayoutProps) {
  const field = groupBy ?? fields.find((f) => f.key === "status")!;
  const groups = groupItems(items, field, true).filter((g) => g.items.length || g.bucket.key !== NONE);
  return (
    <div className="scroll-thin -mx-4 flex gap-2 overflow-x-auto px-4 pb-4 md:-mx-10 md:px-10">
      {groups.map((g) => <BoardColumn key={g.bucket.key} bucket={g.bucket} items={g.items} field={field} basePatch={basePatch} />)}
    </div>
  );
}

// ─── Table ────────────────────────────────────────────────────────
export function TableLayout({ items, fields, columns, selection, toggleSelect, basePatch }: LayoutProps & { columns: string[] }) {
  const cols = columns.map((k) => fields.find((f) => f.key === k)).filter((f): f is Field => !!f);
  return (
    <div className="scroll-thin -mx-4 overflow-x-auto px-4 md:-mx-10 md:px-10">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-start text-xs text-muted">
            {selection && <th className="w-8" />}
            <th className="py-2 pe-3 text-start font-medium">כותרת</th>
            {cols.map((c) => <th key={c.key} className="px-3 py-2 text-start font-medium whitespace-nowrap">{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id} onClick={() => openItem(i.id)} className={`cursor-pointer border-b border-line hover:bg-hover ${selection?.has(i.id) ? "bg-active" : ""}`}>
              {selection && (
                <td className="px-1" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={selection.has(i.id)} onChange={() => toggleSelect(i.id)} className="accent-[var(--accent)]" />
                </td>
              )}
              <td className="max-w-72 py-2 pe-3">
                <span className="flex items-center gap-1.5"><TypeIcon item={i} /><span className={`truncate ${i.status === "done" ? "text-faint line-through" : ""}`}>{i.title}</span></span>
              </td>
              {cols.map((c) => <td key={c.key} className="max-w-60 px-3 py-2"><FieldValue field={c} item={i} /></td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {!items.length && <div className="py-6 text-center text-sm text-faint">אין פריטים שמתאימים לתצוגה הזו.</div>}
      <QuickAdd patch={basePatch} />
    </div>
  );
}

// ─── Grid (Eisenhower and any 2 properties) ───────────────────────
const EISENHOWER: Record<string, string> = {
  "high|high": "עשה עכשיו", "high|low": "תכנן", "low|high": "האצל או קצר", "low|low": "ותר",
};

function GridCell({ x, y, xb, yb, items, basePatch, hint }: {
  x: Field; y: Field; xb: Bucket; yb: Bucket; items: Item[]; basePatch: ItemPatch; hint?: string;
}) {
  const { itemsById, updateItem } = useStore();
  const patch = mergePatches(basePatch, x.setBucket!(xb.key), y.setBucket!(yb.key));
  const drop = useDrop((id) => {
    const item = itemsById.get(id);
    if (item) updateItem(id, mergePatches(x.setBucket!(xb.key, item), y.setBucket!(yb.key, item)));
  });
  return (
    <div {...drop.handlers} className={`flex min-h-44 flex-col rounded-lg border border-line p-2 transition-colors ${drop.over ? "bg-active" : ""}`}>
      <div className="mb-2 flex flex-wrap items-center gap-1 text-xs">
        {hint && <span className="me-1 font-semibold text-ink">{hint}</span>}
        <Tag color={yb.color}>{yb.label}</Tag><Tag color={xb.color}>{xb.label}</Tag>
        <span className="text-faint">{items.length}</span>
      </div>
      <div className="flex-1">{items.map((i) => <Card key={i.id} item={i} />)}</div>
      <QuickAdd patch={patch} />
    </div>
  );
}

export function GridLayout({ items, fields, grid, basePatch }: LayoutProps & { grid: { x: string; y: string } }) {
  const x = fields.find((f) => f.key === grid.x);
  const y = fields.find((f) => f.key === grid.y);
  if (!x?.allBuckets || !y?.allBuckets || !x.setBucket || !y.setBucket) {
    return <div className="py-6 text-center text-sm text-faint">בחר שני מאפייני בחירה לצירים (בסרגל למעלה).</div>;
  }
  const xs = x.allBuckets().filter((b) => b.key !== NONE);
  const ys = y.allBuckets().filter((b) => b.key !== NONE);
  const cell = (xb: Bucket, yb: Bucket) =>
    items.filter((i) => x.buckets(i).some((b) => b.key === xb.key) && y.buckets(i).some((b) => b.key === yb.key));
  const unsorted = items.filter((i) => x.buckets(i)[0]?.key === NONE || y.buckets(i)[0]?.key === NONE);
  const isEisenhower = x.key === "urgency" && y.key === "importance";

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <div className="grid flex-1 grid-cols-1 gap-2 md:grid-cols-[repeat(var(--cols),minmax(0,1fr))]" style={{ "--cols": xs.length } as CSSProperties}>
        {ys.flatMap((yb) => xs.map((xb) => (
          <GridCell key={`${yb.key}|${xb.key}`} x={x} y={y} xb={xb} yb={yb} items={cell(xb, yb)} basePatch={basePatch}
            hint={isEisenhower ? EISENHOWER[`${yb.key}|${xb.key}`] : undefined} />
        )))}
      </div>
      {unsorted.length > 0 && (
        <aside className="shrink-0 rounded-lg bg-sidebar p-2 lg:w-60">
          <div className="mb-2 text-xs font-semibold text-muted">לא מסווג · {unsorted.length}</div>
          <p className="mb-2 text-xs text-faint">גרור לתא כדי לסווג</p>
          {unsorted.map((i) => <Card key={i.id} item={i} />)}
        </aside>
      )}
    </div>
  );
}
