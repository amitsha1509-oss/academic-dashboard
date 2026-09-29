import { AlarmClock, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { FieldEditor } from "../components/FieldEditor";
import { Chip, EmptyNote, QuickAdd, Row, Screen } from "../components/kit";
import { Divider, IconButton, MenuItem, MenuLabel, Popover, Section, StatusCheck } from "../components/ui";
import { addDays, formatWhen, todayISO } from "../lib/dates";
import { isEmpty, type Field } from "../lib/fields";
import { openItem, useNav } from "../lib/nav";
import { useServerData, useStore } from "../lib/store";
import type { Item, ItemPatch, Occurrence, PropType } from "../lib/types";
import { isCheckable } from "../components/kit";

export const PROP_TYPE_LABELS: Record<PropType, string> = {
  text: "טקסט", number: "מספר", date: "תאריך", choice: "בחירה", multi: "בחירה מרובה", checkbox: "תיבת סימון", url: "קישור",
};

/** Patch that removes a field's value from an item. */
function clearPatch(field: Field): ItemPatch {
  switch (field.key) {
    case "type": return { type_id: null };
    case "parent": return { parent_id: null };
    case "when": return { when_at: null, when_end: null };
    case "due": return { due_at: null };
    case "span": return { span_start: null, span_end: null };
    case "snooze": return { snooze_until: null };
    case "repeat": return { repeat: null };
    case "links": return { links: [] };
    default: return field.core ? {} : { props: { [field.key]: null } };
  }
}

// Shown elsewhere on the screen, or not meant to be edited per item.
const HIDDEN = new Set(["title", "notes", "status", "created", "inbox"]);

export function ItemScreen({ id }: { id: string }) {
  const { itemsById, childrenOf, fields, types, updateItem, deleteItem } = useStore();
  const { back } = useNav();
  const item = itemsById.get(id);
  const [extra, setExtra] = useState<string[]>([]); // properties opened here but still empty
  useEffect(() => setExtra([]), [id]);

  if (!item) {
    return <Screen title="הפריט לא נמצא"><EmptyNote>ייתכן שהוא נמחק. אפשר לשחזר אותו מסל המחזור בהגדרות.</EmptyNote></Screen>;
  }

  const type = types.find((t) => t.id === item.type_id);
  const suggested = type?.suggested ?? [];
  const visible = fields.filter((f) =>
    !HIDDEN.has(f.key) && (f.key === "type" || !isEmpty(f.get(item)) || suggested.includes(f.key) || extra.includes(f.key)));
  const hidden = fields.filter((f) => !HIDDEN.has(f.key) && !visible.includes(f));
  const children = childrenOf.get(item.id) ?? [];
  const done = item.status === "done";

  const ancestors: Item[] = [];
  for (let p = item.parent_id ? itemsById.get(item.parent_id) : undefined; p && ancestors.length < 6; p = p.parent_id ? itemsById.get(p.parent_id) : undefined) {
    ancestors.unshift(p);
  }

  return (
    <Screen
      actions={<>
        <SnoozeButton item={item} />
        <IconButton label="מחק" onClick={() => { deleteItem(item.id); back(); }}><Trash2 size={18} /></IconButton>
      </>}
      titleNode={
        <div className="grid gap-2">
          {ancestors.length > 0 && (
            <nav className="flex flex-wrap items-center gap-1 text-[14px] text-muted">
              {ancestors.map((a, i) => (
                <span key={a.id} className="flex items-center gap-1">
                  {i > 0 && <span className="text-faint">‹</span>}
                  <button type="button" onClick={() => openItem(a.id)} className="font-medium hover:text-ink hover:underline">{a.title}</button>
                </span>
              ))}
            </nav>
          )}
          <div className="flex items-start gap-3">
            {isCheckable(item) && (
              <span className="pt-3"><StatusCheck done={done} size={26} onToggle={() => updateItem(item.id, { status: done ? "open" : "done" })} /></span>
            )}
            <TitleEditor key={item.id} item={item} />
          </div>
        </div>
      }
    >
      {item.inbox && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-surface px-4 py-3 text-[15px]">
          <span className="flex-1 text-muted">בתיבת הקליטה. תן לו סוג או שייך אותו לפריט, והוא ייצא משם.</span>
          <Chip primary onClick={() => updateItem(item.id, { inbox: false })}>סודר</Chip>
        </div>
      )}

      <div className="grid gap-2">
        <div className="rounded-[20px] bg-surface px-4 py-1">
          {visible.map((f, i) => (
            <div key={f.key} className={`group grid grid-cols-[96px_1fr_auto] items-center gap-2 py-2 md:grid-cols-[130px_1fr_auto] ${i ? "border-t border-line" : ""}`}>
              <span className="text-[15px] text-muted">{f.key === "parent" ? "בתוך" : f.label}</span>
              <div className="min-w-0"><FieldEditor field={f} item={item} /></div>
              {!isEmpty(f.get(item)) && f.key !== "type" ? (
                <IconButton label={`נקה ${f.label}`} className="opacity-50 group-hover:opacity-100"
                  onClick={() => { updateItem(item.id, clearPatch(f)); setExtra((e) => e.filter((k) => k !== f.key)); }}>
                  <X size={15} />
                </IconButton>
              ) : <span className="w-8" />}
            </div>
          ))}
        </div>
        <AddPropertyMenu hidden={hidden} onAdd={(key) => setExtra((e) => [...e, key])} />
      </div>

      <NotesEditor key={`n-${item.id}`} item={item} />

      {item.repeat && <OccurrencesSection item={item} />}

      <Section title="בפנים" count={children.length || undefined} action={children.length ? <Progress items={children} /> : undefined}>
        <ChildList items={children} />
        <QuickAdd placeholder="הוסף פריט בפנים…" fields={{ parent_id: item.id, type_id: commonType(children) }} />
      </Section>
    </Screen>
  );
}

/** New children get the type most of their siblings have (e.g. lectures inside a course). */
function commonType(siblings: Item[]): string | null {
  const counts = new Map<string, number>();
  for (const s of siblings) if (s.type_id) counts.set(s.type_id, (counts.get(s.type_id) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

function TitleEditor({ item }: { item: Item }) {
  const { updateItem } = useStore();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(item.title);
  useEffect(() => {
    const el = ref.current;
    if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; }
  }, [value]);
  const commit = () => {
    const v = value.trim();
    if (!v) setValue(item.title);
    else if (v !== item.title) updateItem(item.id, { title: v });
  };
  return (
    <textarea ref={ref} rows={1} value={value} aria-label="כותרת"
      onChange={(e) => setValue(e.target.value.replace(/\n/g, ""))}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), (e.target as HTMLTextAreaElement).blur())}
      className={`display w-full resize-none bg-transparent text-[34px] outline-none md:text-[40px] ${item.status === "done" ? "text-faint line-through" : ""}`} />
  );
}

function NotesEditor({ item }: { item: Item }) {
  const { updateItem } = useStore();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(item.notes);
  useEffect(() => {
    const el = ref.current;
    if (el) { el.style.height = "auto"; el.style.height = Math.max(el.scrollHeight, 56) + "px"; }
  }, [value]);
  return (
    <textarea ref={ref} value={value} onChange={(e) => setValue(e.target.value)}
      onBlur={() => value !== item.notes && updateItem(item.id, { notes: value })}
      placeholder="הערות, מחשבות, פרטים…" aria-label="הערות"
      className="w-full resize-none border-b border-line bg-transparent pb-3 text-[16px] leading-relaxed outline-none placeholder:text-faint" />
  );
}

function AddPropertyMenu({ hidden, onAdd }: { hidden: Field[]; onAdd: (key: string) => void }) {
  const { createProperty } = useStore();
  const [name, setName] = useState("");
  const [type, setType] = useState<PropType>("text");
  const create = async (close: () => void) => {
    if (!name.trim()) return;
    const p = await createProperty(name.trim(), type);
    if (p) onAdd(p.id);
    setName("");
    close();
  };
  return (
    <Popover width={290} trigger={({ toggle }) => (
      <button type="button" onClick={toggle} className="inline-flex items-center gap-1.5 justify-self-start rounded-full px-3 py-1.5 text-[14px] font-medium text-muted hover:bg-hover hover:text-ink">
        <Plus size={16} /> הוסף מאפיין
      </button>
    )}>
      {(close) => (
        <>
          {hidden.length > 0 && <MenuLabel>מאפיינים קיימים</MenuLabel>}
          {hidden.map((f) => <MenuItem key={f.key} onClick={() => { onAdd(f.key); close(); }}>{f.key === "parent" ? "בתוך" : f.label}</MenuItem>)}
          <Divider />
          <MenuLabel>מאפיין חדש</MenuLabel>
          <div className="grid gap-2 p-2">
            <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create(close)}
              placeholder="שם, למשל ״מרצה״ או ״סכום״" className="w-full rounded-xl bg-surface px-3 py-2 text-[15px] outline-none placeholder:text-faint" />
            <select value={type} onChange={(e) => setType(e.target.value as PropType)} className="w-full rounded-xl bg-surface px-3 py-2 text-[15px]">
              {Object.entries(PROP_TYPE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <button type="button" disabled={!name.trim()} onClick={() => create(close)}
              className="rounded-full bg-ink py-2 text-[15px] font-medium text-canvas disabled:opacity-40">צור והוסף</button>
          </div>
        </>
      )}
    </Popover>
  );
}

export function SnoozeButton({ item }: { item: Item }) {
  const { updateItem, toast } = useStore();
  const today = todayISO();
  const snooze = (d: string, close: () => void) => {
    updateItem(item.id, { snooze_until: d });
    toast(`מוסתר עד ${formatWhen(d)}`, { label: "ביטול", run: () => updateItem(item.id, { snooze_until: item.snooze_until }) });
    close();
  };
  return (
    <Popover width={230} trigger={({ toggle }) => <IconButton label="דחה" onClick={toggle}><AlarmClock size={18} /></IconButton>}>
      {(close) => (
        <>
          <MenuLabel>להסתיר עד…</MenuLabel>
          <MenuItem onClick={() => snooze(addDays(today, 1), close)}>מחר</MenuItem>
          <MenuItem onClick={() => snooze(addDays(today, 3), close)}>בעוד 3 ימים</MenuItem>
          <MenuItem onClick={() => snooze(addDays(today, 7), close)}>בעוד שבוע</MenuItem>
          <MenuItem onClick={() => snooze(addDays(today, 30), close)}>בעוד חודש</MenuItem>
          <div className="px-2 py-1">
            <input type="date" min={addDays(today, 1)} aria-label="תאריך" onChange={(e) => e.target.value && snooze(e.target.value, close)}
              className="w-full rounded-xl bg-surface px-2" />
          </div>
          {item.snooze_until && (
            <><Divider /><MenuItem onClick={() => { updateItem(item.id, { snooze_until: null }); close(); }}>בטל דחייה</MenuItem></>
          )}
        </>
      )}
    </Popover>
  );
}

function Progress({ items }: { items: Item[] }) {
  const tasks = items.filter((i) => isCheckable(i) && i.status !== "dropped");
  const done = tasks.filter((i) => i.status === "done").length;
  if (!tasks.length) return null;
  return (
    <div className="flex items-center gap-2 text-[13.5px] text-muted">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-surface">
        <div className="h-full rounded-full bg-accent" style={{ width: `${(done / tasks.length) * 100}%` }} />
      </div>
      {done}/{tasks.length}
    </div>
  );
}

function byDate(a: Item, b: Item) {
  const da = a.due_at ?? a.when_at ?? a.repeat?.start ?? "9999";
  const db = b.due_at ?? b.when_at ?? b.repeat?.start ?? "9999";
  return da.localeCompare(db) || a.created_at.localeCompare(b.created_at);
}

function ChildList({ items }: { items: Item[] }) {
  const [showDone, setShowDone] = useState(false);
  const open = useMemo(() => items.filter((i) => i.status === "open").sort(byDate), [items]);
  const closed = items.filter((i) => i.status !== "open");
  return (
    <>
      {open.map((c) => <Row key={c.id} item={c} hideParent />)}
      {closed.length > 0 && (
        <button type="button" onClick={() => setShowDone((s) => !s)} className="py-2 text-[14px] font-medium text-muted hover:text-ink">
          {showDone ? "הסתר" : "הצג"} {closed.length} שהושלמו
        </button>
      )}
      {showDone && closed.map((c) => <Row key={c.id} item={c} hideParent />)}
    </>
  );
}

function OccurrencesSection({ item }: { item: Item }) {
  const { markOccurrence } = useStore();
  const today = todayISO();
  const data = useServerData<Occurrence[]>(`/occurrences?frm=${addDays(today, -42)}&to=${addDays(today, 28)}`);
  const mine = (data ?? []).filter((o) => o.item_id === item.id);
  const next = mine.filter((o) => o.date >= today).slice(0, 4);
  const past = mine.filter((o) => o.date < today).slice(-8).reverse();
  const row = (o: Occurrence) => (
    <div key={o.date} className="flex min-h-12 items-center gap-2 border-b border-line py-1.5">
      <span className={`flex-1 text-[15.5px] font-medium tabular-nums ${o.status !== "open" ? "text-faint" : ""}`}>
        {formatWhen(o.date, today)}{o.time ? `, ${o.time}` : ""}
      </span>
      {o.status === "open" && o.date < today && <span className="text-[13px] font-medium text-danger">לא סומן</span>}
      <Chip active={o.status === "done"} onClick={() => markOccurrence(item.id, o.date, o.status === "done" ? null : "done")}>בוצע</Chip>
      <Chip active={o.status === "skipped"} onClick={() => markOccurrence(item.id, o.date, o.status === "skipped" ? null : "skipped")}>דלג</Chip>
    </div>
  );
  return (
    <Section title="מופעים">
      {!data ? null : (
        <>
          {next.map(row)}
          {past.length > 0 && <div className="pt-3 pb-1 text-[13.5px] font-medium text-muted">קודמים</div>}
          {past.map(row)}
          {!mine.length && <EmptyNote>אין מופעים בטווח הקרוב.</EmptyNote>}
        </>
      )}
    </Section>
  );
}
