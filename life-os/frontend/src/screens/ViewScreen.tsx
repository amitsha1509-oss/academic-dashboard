// A saved view: filters + grouping + sort, shown as a list or as a two-property matrix.
// Everything flows top to bottom; nothing scrolls sideways.
import { MoreHorizontal, X } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { EmptyNote, QuickAdd, Row, Screen } from "../components/kit";
import { IconButton, MenuItem, MenuLabel, Popover, SearchInput, Section, Tag } from "../components/ui";
import { NONE, type Field } from "../lib/fields";
import { useNav } from "../lib/nav";
import { useStore } from "../lib/store";
import type { Filter, FilterOp, ItemPatch, ViewConfig } from "../lib/types";
import { applyView, groupItems } from "../lib/viewEngine";

export const OP_LABELS: Record<FilterOp, string> = {
  is: "הוא", is_not: "אינו", empty: "ריק", not_empty: "לא ריק", contains: "מכיל",
  before: "לפני", after: "אחרי", next_days: "בימים הקרובים",
};

const DATE_TOKENS: Record<string, string> = { today: "היום", "+7": "עוד שבוע", "-7": "לפני שבוע", "+30": "עוד חודש" };

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
  const select = "w-full rounded-xl bg-surface px-3 py-2 text-[15px]";

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

function Control({ active, onClick, children }: { active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`rounded-full px-3.5 py-1.5 text-[14px] font-medium whitespace-nowrap transition-colors ${active ? "bg-ink text-canvas" : "bg-surface hover:bg-active"}`}>
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
      {fields.map((f) => <MenuItem key={f.key} active={current === f.key} onClick={() => { onPick(f.key); close(); }}>{f.key === "parent" ? "בתוך" : f.label}</MenuItem>)}
    </>
  );
}

export function ViewScreen({ id }: { id: string }) {
  const { views, items, fields, itemsById, updateView, deleteView, createView } = useStore();
  const { back, push } = useNav();
  const view = views.find((v) => v.id === id);
  const config: ViewConfig = view?.config ?? {};
  const shown = useMemo(() => applyView(items, config, fields), [items, config, fields]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  if (!view) return <Screen title="התצוגה לא נמצאה">{null}</Screen>;

  const set = (patch: Partial<ViewConfig>) => updateView(view.id, { config: { ...config, ...patch } });
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const filters = config.filters ?? [];
  const groupable = fields.filter((f) => !["title", "notes", "links"].includes(f.key));
  const axisFields = fields.filter((f) => f.allBuckets && f.setBucket);
  const matrix = config.layout === "grid";
  const groupBy = config.groupBy ? byKey.get(config.groupBy) : undefined;

  // New items created inside the view get its filter values, so they show up here.
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

  return (
    <Screen
      actions={
        <Popover width={220} trigger={({ toggle }) => <IconButton label="עוד" onClick={toggle}><MoreHorizontal size={20} /></IconButton>}>
          {(close) => (
            <>
              <MenuItem onClick={async () => {
                close();
                const v = await createView(`${view.name} (עותק)`, "", config);
                if (v) push({ name: "view", arg: v.id });
              }}>שכפל תצוגה</MenuItem>
              <MenuItem danger onClick={() => { close(); setConfirmDelete(true); }}>מחק תצוגה</MenuItem>
            </>
          )}
        </Popover>
      }
      titleNode={
        <input value={view.name} onChange={(e) => updateView(view.id, { name: e.target.value })} aria-label="שם התצוגה"
          className="display w-full bg-transparent text-[36px] outline-none md:text-[42px]" />
      }
    >
      {confirmDelete && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-danger-soft px-4 py-3">
          <span className="flex-1 text-[15px]">למחוק את התצוגה? הפריטים עצמם לא יימחקו.</span>
          <Control onClick={() => setConfirmDelete(false)}>ביטול</Control>
          <button type="button" onClick={() => { deleteView(view.id); back(); }} className="rounded-full bg-danger px-3.5 py-1.5 text-[14px] font-medium text-white">מחק</button>
        </div>
      )}

      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {filters.map((f, i) => {
            const field = byKey.get(f.field);
            return (
              <Popover key={i} width={300} trigger={({ toggle }) => (
                <span className="inline-flex items-center rounded-full bg-accent-soft text-[14px] font-medium text-accent">
                  <button type="button" onClick={toggle} className="py-1.5 ps-3.5 pe-1">
                    {field ? (field.key === "parent" ? "בתוך" : field.label) : "?"} {OP_LABELS[f.op]} {valueLabel(field, f, itemsById)}
                  </button>
                  <button type="button" aria-label="הסר סינון" onClick={() => set({ filters: filters.filter((_, j) => j !== i) })} className="pe-2.5 opacity-70 hover:opacity-100">
                    <X size={14} />
                  </button>
                </span>
              )}>
                {() => <FilterForm filter={f} fields={fields} onChange={(nf) => setFilter(i, nf)} />}
              </Popover>
            );
          })}
          <Popover width={240} trigger={({ toggle }) => <Control onClick={toggle}>+ סינון</Control>}>
            {(close) => (
              <>
                <MenuLabel>סנן לפי</MenuLabel>
                <FieldMenu fields={fields.filter((f) => f.ops.length)} close={close}
                  onPick={(k) => { const f = byKey.get(k!)!; set({ filters: [...filters, { field: f.key, op: f.ops[0] as FilterOp }] }); }} />
              </>
            )}
          </Popover>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Control active={!matrix} onClick={() => set({ layout: "list" })}>רשימה</Control>
          <Control active={matrix} onClick={() => set({ layout: "grid", grid: config.grid ?? { x: "urgency", y: "importance" } })}>מטריצה</Control>
          <span className="mx-1 h-5 w-px bg-line" />
          {!matrix && (
            <Popover width={220} trigger={({ toggle }) => <Control active={!!groupBy} onClick={toggle}>{groupBy ? `קיבוץ: ${groupBy.key === "parent" ? "בתוך" : groupBy.label}` : "קיבוץ"}</Control>}>
              {(close) => <FieldMenu fields={groupable} current={config.groupBy} noneLabel="בלי קיבוץ" close={close} onPick={(k) => set({ groupBy: k })} />}
            </Popover>
          )}
          {matrix && (["y", "x"] as const).map((axis) => (
            <Popover key={axis} width={220} trigger={({ toggle }) => (
              <Control onClick={toggle}>{axis === "y" ? "קודם לפי" : "ואז לפי"}: {byKey.get(config.grid?.[axis] ?? "")?.label ?? "בחר"}</Control>
            )}>
              {(close) => <FieldMenu fields={axisFields} current={config.grid?.[axis]} close={close}
                onPick={(k) => set({ grid: { x: config.grid?.x ?? "urgency", y: config.grid?.y ?? "importance", [axis]: k! } })} />}
            </Popover>
          ))}
          <Popover width={220} trigger={({ toggle }) => (
            <Control active={!!config.sort} onClick={toggle}>{config.sort ? `מיון: ${byKey.get(config.sort.field)?.label ?? ""}` : "מיון"}</Control>
          )}>
            {(close) => (
              <>
                {config.sort && (
                  <div className="flex gap-1 p-1">
                    {(["asc", "desc"] as const).map((d) => (
                      <Control key={d} active={config.sort!.dir === d} onClick={() => set({ sort: { ...config.sort!, dir: d } })}>{d === "asc" ? "עולה" : "יורד"}</Control>
                    ))}
                  </div>
                )}
                <FieldMenu fields={groupable} current={config.sort?.field} noneLabel="לפי תאריך יצירה" close={close}
                  onPick={(k) => set({ sort: k ? { field: k, dir: config.sort?.dir ?? "asc" } : null })} />
              </>
            )}
          </Popover>
          <Control active={config.showDone} onClick={() => set({ showDone: !config.showDone })}>{config.showDone ? "כולל שהושלמו" : "רק פתוחים"}</Control>
          <span className="ms-auto text-[14px] font-medium text-faint">{shown.length} פריטים</span>
        </div>
      </div>

      {matrix ? <MatrixLayout config={config} fields={fields} items={shown} basePatch={basePatch} /> : (
        groupBy ? groupItems(shown, groupBy).map((g) => (
          <Section key={g.bucket.key} title={g.bucket.label} count={g.items.length}>
            {g.items.map((i) => <Row key={i.id} item={i} />)}
          </Section>
        )) : (
          <div>
            {shown.map((i) => <Row key={i.id} item={i} />)}
            {!shown.length && <EmptyNote>אין פריטים שמתאימים לתצוגה הזו.</EmptyNote>}
            <QuickAdd placeholder="פריט חדש בתצוגה הזו…" fields={basePatch} />
          </div>
        )
      )}
    </Screen>
  );
}

function MatrixLayout({ config, fields, items, basePatch }: { config: ViewConfig; fields: Field[]; items: ReturnType<typeof applyView>; basePatch: ItemPatch }) {
  const x = fields.find((f) => f.key === config.grid?.x);
  const y = fields.find((f) => f.key === config.grid?.y);
  if (!x?.allBuckets || !y?.allBuckets || !x.setBucket || !y.setBucket) return <EmptyNote>בחר שני מאפייני בחירה.</EmptyNote>;
  const xs = x.allBuckets().filter((b) => b.key !== NONE);
  const ys = y.allBuckets().filter((b) => b.key !== NONE);
  const unsorted = items.filter((i) => x.buckets(i)[0]?.key === NONE || y.buckets(i)[0]?.key === NONE);
  return (
    <>
      {ys.flatMap((yb) => xs.map((xb) => {
        const list = items.filter((i) => y.buckets(i).some((b) => b.key === yb.key) && x.buckets(i).some((b) => b.key === xb.key));
        const patch = { ...basePatch, props: { ...basePatch.props, ...y.setBucket!(yb.key).props, ...x.setBucket!(xb.key).props } };
        return (
          <Section key={`${yb.key}|${xb.key}`} title={`${yb.label} · ${xb.label}`} count={list.length}>
            {list.map((i) => <Row key={i.id} item={i} />)}
            <QuickAdd placeholder="חדש…" fields={patch} />
          </Section>
        );
      }))}
      {unsorted.length > 0 && (
        <Section title="לא מסווג" count={unsorted.length} sub={`חסר ${y.label} או ${x.label}`}>
          {unsorted.map((i) => <Row key={i.id} item={i} />)}
        </Section>
      )}
    </>
  );
}

