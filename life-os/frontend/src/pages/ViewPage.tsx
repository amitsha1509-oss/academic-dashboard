import {
  ArrowDownUp, Check, CheckSquare, Columns3, Copy, Eye, EyeOff, Filter as FilterIcon, Grid2x2, Layers, List, MoreHorizontal,
  Table2, Trash2, X,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { BoardLayout, GridLayout, ListLayout, TableLayout } from "../layouts/Layouts";
import { Button, Divider, IconButton, MenuItem, MenuLabel, Popover, SearchInput, Tag } from "../components/ui";
import { NONE, type Field } from "../lib/fields";
import { navigate } from "../lib/router";
import { useStore } from "../lib/store";
import type { Filter, FilterOp, ItemPatch, Layout, View, ViewConfig } from "../lib/types";
import { applyView } from "../lib/viewEngine";

export const OP_LABELS: Record<FilterOp, string> = {
  is: "הוא", is_not: "אינו", empty: "ריק", not_empty: "לא ריק", contains: "מכיל",
  before: "לפני", after: "אחרי", next_days: "בימים הקרובים",
};

const DATE_TOKENS: Record<string, string> = { today: "היום", "+7": "עוד שבוע", "-7": "לפני שבוע", "+30": "עוד חודש" };

const LAYOUTS: { id: Layout; label: string; icon: ReactNode }[] = [
  { id: "list", label: "רשימה", icon: <List size={15} /> },
  { id: "board", label: "לוח", icon: <Columns3 size={15} /> },
  { id: "table", label: "טבלה", icon: <Table2 size={15} /> },
  { id: "grid", label: "מטריצה", icon: <Grid2x2 size={15} /> },
];

function valueLabel(field: Field | undefined, f: Filter, byId: Map<string, { title: string }>): string {
  if (!field || f.op === "empty" || f.op === "not_empty") return "";
  if (f.op === "next_days") return `${f.value ?? 7} ימים`;
  if (f.op === "before" || f.op === "after") return DATE_TOKENS[String(f.value)] ?? String(f.value ?? "");
  const vals = Array.isArray(f.value) ? (f.value as string[]) : f.value !== undefined ? [String(f.value)] : [];
  if (field.kind === "parent") return vals.map((v) => byId.get(v)?.title ?? "?").join(", ");
  const buckets = field.allBuckets?.() ?? [];
  return vals.map((v) => buckets.find((b) => b.key === v)?.label ?? v).join(", ");
}

function FilterForm({ filter, fields, onChange }: { filter: Filter; fields: Field[]; onChange: (f: Filter) => void }) {
  const { items, childrenOf } = useStore();
  const [q, setQ] = useState("");
  const field = fields.find((f) => f.key === filter.field);
  if (!field) return null;
  const vals = Array.isArray(filter.value) ? (filter.value as string[]) : filter.value !== undefined ? [String(filter.value)] : [];
  const toggle = (k: string) => onChange({ ...filter, value: vals.includes(k) ? vals.filter((v) => v !== k) : [...vals, k] });
  const select = "w-full rounded-md border border-line bg-popover px-2 py-1.5 text-sm";

  let editor: ReactNode = null;
  if (filter.op === "is" || filter.op === "is_not") {
    if (field.kind === "parent") {
      const list = items.filter((i) => childrenOf.has(i.id) && i.title.includes(q)).slice(0, 25);
      editor = (
        <>
          <SearchInput value={q} onChange={setQ} autoFocus={false} placeholder="חפש פריט…" />
          {list.map((i) => <MenuItem key={i.id} active={vals.includes(i.id)} onClick={() => toggle(i.id)}>{i.title}</MenuItem>)}
        </>
      );
    } else if (field.allBuckets) {
      editor = field.allBuckets().map((b) => (
        <MenuItem key={b.key} active={vals.includes(b.key)} onClick={() => toggle(b.key)}>
          {b.key === NONE ? <span className="text-muted">{b.label}</span> : <Tag color={b.color}>{b.icon ? `${b.icon} ` : ""}{b.label}</Tag>}
        </MenuItem>
      ));
    } else {
      editor = <input autoFocus value={String(filter.value ?? "")} onChange={(e) => onChange({ ...filter, value: e.target.value })} className={select} />;
    }
  } else if (filter.op === "contains") {
    editor = <input autoFocus value={String(filter.value ?? "")} onChange={(e) => onChange({ ...filter, value: e.target.value })} placeholder="טקסט…" className={select} />;
  } else if (filter.op === "before" || filter.op === "after") {
    const v = String(filter.value ?? "today");
    editor = (
      <div className="space-y-2">
        <select value={DATE_TOKENS[v] ? v : "custom"} onChange={(e) => onChange({ ...filter, value: e.target.value === "custom" ? "" : e.target.value })} className={select}>
          {Object.entries(DATE_TOKENS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          <option value="custom">תאריך מסוים…</option>
        </select>
        {!DATE_TOKENS[v] && <input type="date" value={v} onChange={(e) => onChange({ ...filter, value: e.target.value })} className={select} />}
      </div>
    );
  } else if (filter.op === "next_days") {
    editor = (
      <label className="flex items-center gap-2 text-sm">
        <input type="number" min={1} value={Number(filter.value ?? 7)} onChange={(e) => onChange({ ...filter, value: Number(e.target.value) || 7 })} className={`${select} w-20`} />
        ימים
      </label>
    );
  }

  return (
    <div className="space-y-2 p-1.5">
      <div className="flex gap-1.5">
        <select value={filter.field} onChange={(e) => {
          const nf = fields.find((f) => f.key === e.target.value)!;
          onChange({ field: nf.key, op: nf.ops[0] as FilterOp });
        }} className={select}>
          {fields.filter((f) => f.ops.length).map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>
        <select value={filter.op} onChange={(e) => onChange({ field: filter.field, op: e.target.value as FilterOp })} className={select}>
          {field.ops.map((op) => <option key={op} value={op}>{OP_LABELS[op as FilterOp]}</option>)}
        </select>
      </div>
      {editor && <div className="max-h-56 overflow-y-auto">{editor}</div>}
    </div>
  );
}

function ToolbarButton({ active, onClick, children }: { active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-sm whitespace-nowrap transition-colors ${active ? "bg-active text-ink" : "text-muted hover:bg-hover hover:text-ink"}`}>
      {children}
    </button>
  );
}

function FieldMenu({ fields, current, onPick, noneLabel, close }: {
  fields: Field[]; current?: string | null; onPick: (k: string | null) => void; noneLabel?: string; close: () => void;
}) {
  return (
    <>
      {noneLabel && <MenuItem active={!current} onClick={() => { onPick(null); close(); }}>{noneLabel}</MenuItem>}
      {fields.map((f) => <MenuItem key={f.key} active={current === f.key} onClick={() => { onPick(f.key); close(); }}>{f.label}</MenuItem>)}
    </>
  );
}

export function ViewPage({ view }: { view: View }) {
  const { items, fields, itemsById, updateView, deleteView, createView, bulkUpdate, deleteItem } = useStore();
  const config = view.config;
  const layout = config.layout ?? "list";
  const set = (patch: Partial<ViewConfig>) => updateView(view.id, { config: { ...config, ...patch } });
  const [selection, setSelection] = useState<Set<string> | null>(null);

  const shown = useMemo(() => applyView(items, config, fields), [items, config, fields]);
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const groupBy = config.groupBy ? byKey.get(config.groupBy) : undefined;
  const groupable = fields.filter((f) => !["title", "notes", "links"].includes(f.key));
  const axisFields = fields.filter((f) => f.allBuckets && f.setBucket);
  const filters = config.filters ?? [];
  const columns = config.columns ?? ["type", "parent", "due", ...fields.filter((f) => !f.core).slice(0, 3).map((f) => f.key)];

  // New items created inside the view get the filter values, so they appear here.
  const basePatch: ItemPatch = {};
  for (const f of filters) {
    const field = byKey.get(f.field);
    const vals = Array.isArray(f.value) ? f.value : f.value !== undefined ? [f.value] : [];
    if (f.op === "is" && field?.setBucket && vals.length === 1) {
      const p = field.setBucket(String(vals[0]));
      Object.assign(basePatch, { ...p, props: basePatch.props || p.props ? { ...basePatch.props, ...p.props } : undefined });
    }
  }
  if (!basePatch.props) delete basePatch.props;

  const setFilter = (i: number, f: Filter) => set({ filters: filters.map((x, j) => (j === i ? f : x)) });
  const toggleSelect = (id: string) =>
    setSelection((s) => { const n = new Set(s ?? []); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className={layout === "list" ? "mx-auto max-w-3xl" : ""}>
      <header className="mb-4 flex items-center gap-2">
        <input value={view.icon} onChange={(e) => updateView(view.id, { icon: e.target.value.slice(0, 4) })}
          className="w-10 rounded-md bg-transparent text-center text-[26px] outline-none hover:bg-hover" aria-label="אייקון" />
        <input value={view.name} onChange={(e) => updateView(view.id, { name: e.target.value })}
          className="min-w-0 flex-1 rounded-md bg-transparent text-[28px] font-bold outline-none md:text-[32px]" aria-label="שם התצוגה" />
        <Popover width={200} trigger={({ toggle }) => <IconButton label="עוד" onClick={toggle}><MoreHorizontal size={18} /></IconButton>}>
          {(close) => (
            <>
              <MenuItem icon={<Copy size={14} />} onClick={async () => {
                close();
                const v = await createView(`${view.name} (עותק)`, view.icon, config);
                if (v) navigate(`/view/${v.id}`);
              }}>שכפל תצוגה</MenuItem>
              <MenuItem danger icon={<Trash2 size={14} />} onClick={() => {
                close();
                if (confirm(`למחוק את התצוגה „${view.name}”? הפריטים עצמם לא יימחקו.`)) { deleteView(view.id); navigate("/today"); }
              }}>מחק תצוגה</MenuItem>
            </>
          )}
        </Popover>
      </header>

      <div className="scroll-thin mb-4 flex items-center gap-1 overflow-x-auto border-b border-line pb-2">
        <div className="flex shrink-0 rounded-md bg-hover p-0.5">
          {LAYOUTS.map((l) => (
            <button key={l.id} type="button" title={l.label} aria-label={l.label} onClick={() => set({ layout: l.id })}
              className={`inline-flex h-6 items-center gap-1 rounded px-2 text-sm ${layout === l.id ? "bg-canvas text-ink shadow-sm" : "text-muted"}`}>
              {l.icon}<span className="max-md:hidden">{l.label}</span>
            </button>
          ))}
        </div>
        <div className="mx-1 h-5 w-px shrink-0 bg-line" />

        {filters.map((f, i) => {
          const field = byKey.get(f.field);
          return (
            <Popover key={i} width={300} trigger={({ toggle }) => (
              <span className="inline-flex h-7 shrink-0 items-center rounded-md border border-accent/40 bg-accent/10 text-sm text-accent">
                <button type="button" onClick={toggle} className="px-2 whitespace-nowrap">
                  {field?.label ?? "?"} {OP_LABELS[f.op]} {valueLabel(field, f, itemsById)}
                </button>
                <button type="button" aria-label="הסר סינון" onClick={() => set({ filters: filters.filter((_, j) => j !== i) })} className="pe-1.5 opacity-60 hover:opacity-100">
                  <X size={13} />
                </button>
              </span>
            )}>
              {() => <FilterForm filter={f} fields={fields} onChange={(nf) => setFilter(i, nf)} />}
            </Popover>
          );
        })}
        <Popover width={240} trigger={({ toggle }) => <ToolbarButton onClick={toggle}><FilterIcon size={14} /> סינון</ToolbarButton>}>
          {(close) => (
            <>
              <MenuLabel>סנן לפי</MenuLabel>
              <FieldMenu fields={fields.filter((f) => f.ops.length)} close={close}
                onPick={(k) => { const f = byKey.get(k!)!; set({ filters: [...filters, { field: f.key, op: f.ops[0] as FilterOp }] }); }} />
            </>
          )}
        </Popover>

        {layout !== "grid" && (
          <Popover width={220} trigger={({ toggle }) => (
            <ToolbarButton active={!!groupBy} onClick={toggle}><Layers size={14} /> {groupBy ? `קיבוץ: ${groupBy.label}` : "קיבוץ"}</ToolbarButton>
          )}>
            {(close) => <FieldMenu fields={groupable} current={config.groupBy} noneLabel="ללא קיבוץ" close={close} onPick={(k) => set({ groupBy: k })} />}
          </Popover>
        )}

        <Popover width={220} trigger={({ toggle }) => (
          <ToolbarButton active={!!config.sort} onClick={toggle}>
            <ArrowDownUp size={14} /> {config.sort ? `מיון: ${byKey.get(config.sort.field)?.label ?? ""}` : "מיון"}
          </ToolbarButton>
        )}>
          {(close) => (
            <>
              {config.sort && (
                <div className="flex gap-1 p-1">
                  {(["asc", "desc"] as const).map((d) => (
                    <Button key={d} variant={config.sort!.dir === d ? "outline" : "ghost"} className="h-7 flex-1 justify-center text-xs"
                      onClick={() => set({ sort: { ...config.sort!, dir: d } })}>{d === "asc" ? "עולה" : "יורד"}</Button>
                  ))}
                </div>
              )}
              <FieldMenu fields={groupable} current={config.sort?.field} noneLabel="לפי תאריך יצירה" close={close}
                onPick={(k) => set({ sort: k ? { field: k, dir: config.sort?.dir ?? "asc" } : null })} />
            </>
          )}
        </Popover>

        {layout === "grid" && (["y", "x"] as const).map((axis) => (
          <Popover key={axis} width={220} trigger={({ toggle }) => (
            <ToolbarButton onClick={toggle}>{axis === "y" ? "שורות" : "עמודות"}: {byKey.get(config.grid?.[axis] ?? "")?.label ?? "בחר"}</ToolbarButton>
          )}>
            {(close) => <FieldMenu fields={axisFields} current={config.grid?.[axis]} close={close}
              onPick={(k) => set({ grid: { x: config.grid?.x ?? "urgency", y: config.grid?.y ?? "importance", [axis]: k! } })} />}
          </Popover>
        ))}

        {layout === "table" && (
          <Popover width={220} trigger={({ toggle }) => <ToolbarButton onClick={toggle}><Columns3 size={14} /> עמודות</ToolbarButton>}>
            {() => groupable.map((f) => (
              <MenuItem key={f.key} active={columns.includes(f.key)}
                onClick={() => set({ columns: columns.includes(f.key) ? columns.filter((c) => c !== f.key) : [...columns, f.key] })}>{f.label}</MenuItem>
            ))}
          </Popover>
        )}

        <ToolbarButton active={config.showDone} onClick={() => set({ showDone: !config.showDone })}>
          {config.showDone ? <Eye size={14} /> : <EyeOff size={14} />} שהושלמו
        </ToolbarButton>
        {(layout === "list" || layout === "table") && (
          <ToolbarButton active={!!selection} onClick={() => setSelection((s) => (s ? null : new Set()))}>
            <CheckSquare size={14} /> בחירה
          </ToolbarButton>
        )}
        <div className="flex-1" />
        <span className="shrink-0 px-1 text-xs text-faint">{shown.length}</span>
      </div>

      {layout === "list" && <ListLayout items={shown} fields={fields} groupBy={groupBy} selection={selection} toggleSelect={toggleSelect} basePatch={basePatch} />}
      {layout === "board" && <BoardLayout items={shown} fields={fields} groupBy={groupBy} selection={null} toggleSelect={toggleSelect} basePatch={basePatch} />}
      {layout === "table" && <TableLayout items={shown} fields={fields} columns={columns} selection={selection} toggleSelect={toggleSelect} basePatch={basePatch} />}
      {layout === "grid" && <GridLayout items={shown} fields={fields} grid={config.grid ?? { x: "urgency", y: "importance" }} selection={null} toggleSelect={toggleSelect} basePatch={basePatch} />}

      {selection && (
        <BulkBar
          count={selection.size}
          fields={fields}
          onSelectAll={() => setSelection(new Set(shown.map((i) => i.id)))}
          onClose={() => setSelection(null)}
          onApply={(patch) => { bulkUpdate([...selection], patch); setSelection(new Set()); }}
          onDelete={() => { if (confirm(`למחוק ${selection.size} פריטים?`)) { selection.forEach((id) => deleteItem(id)); setSelection(new Set()); } }}
        />
      )}
    </div>
  );
}

function BulkBar({ count, fields, onApply, onDelete, onClose, onSelectAll }: {
  count: number; fields: Field[]; onApply: (p: ItemPatch) => void; onDelete: () => void; onClose: () => void; onSelectAll: () => void;
}) {
  const [field, setField] = useState<Field | null>(null);
  const settable = fields.filter((f) => f.setBucket && f.allBuckets);
  const dateCols: Record<string, keyof ItemPatch> = { due: "due_at", when: "when_at", snooze: "snooze_until" };
  const dateFields = fields.filter((f) => dateCols[f.key]);
  return (
    <div className="fixed inset-x-0 bottom-16 z-40 flex justify-center px-3 md:bottom-6">
      <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-xl bg-popover p-1.5 shadow-pop">
        <span className="px-2 text-sm font-medium whitespace-nowrap">{count} נבחרו</span>
        <Button onClick={onSelectAll}>הכל</Button>
        <Popover width={240} trigger={({ toggle }) => <Button disabled={!count} onClick={() => { setField(null); toggle(); }}>קבע…</Button>}>
          {(close) => field ? (
            <>
              <MenuLabel>{field.label}</MenuLabel>
              {dateCols[field.key] ? (
                <div className="p-2">
                  <input type="date" autoFocus onChange={(e) => { onApply({ [dateCols[field.key]]: e.target.value || null } as ItemPatch); close(); }}
                    className="w-full rounded-md border border-line px-1" />
                </div>
              ) : field.allBuckets!().map((b) => (
                <MenuItem key={b.key} onClick={() => { onApply(field.setBucket!(b.key)); close(); }}>
                  {b.key === NONE ? <span className="text-muted">{b.label}</span> : <Tag color={b.color}>{b.icon ? `${b.icon} ` : ""}{b.label}</Tag>}
                </MenuItem>
              ))}
            </>
          ) : (
            <>
              {[...settable, ...dateFields].map((f) => <MenuItem key={f.key} onClick={() => setField(f)}>{f.label}</MenuItem>)}
              <Divider />
              <MenuItem onClick={() => { onApply({ parent_id: null }); close(); }}>הסר שיוך לפריט-אב</MenuItem>
            </>
          )}
        </Popover>
        <Button disabled={!count} onClick={() => onApply({ status: "done" })}><Check size={14} /> בוצע</Button>
        <Button variant="danger" disabled={!count} onClick={onDelete}><Trash2 size={14} /></Button>
        <IconButton label="סגור בחירה" onClick={onClose}><X size={16} /></IconButton>
      </div>
    </div>
  );
}

/** Creates a new empty view and opens it. */
export async function createAndOpenView(create: ReturnType<typeof useStore>["createView"]) {
  const v = await create("תצוגה חדשה", "📄", { layout: "list", filters: [] });
  if (v) navigate(`/view/${v.id}`);
}

