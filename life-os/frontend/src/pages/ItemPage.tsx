import {
  AlarmClock, ArrowRight, CalendarDays, Check, CheckSquare, ChevronLeft, Hash, Inbox, Link2, List, Plus, Repeat as RepeatIcon,
  SkipForward, Tag as TagIcon, Trash2, Type, X, CornerDownLeft, Flag, CircleDot, Calendar,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { FieldEditor } from "../components/FieldEditor";
import { ItemRow } from "../components/ItemRow";
import { Button, Divider, IconButton, MenuItem, MenuLabel, Popover, Section, StatusCheck, Empty } from "../components/ui";
import { addDays, formatWhen, todayISO } from "../lib/dates";
import { isEmpty, type Field, type FieldKind } from "../lib/fields";
import { navigate, openItem } from "../lib/router";
import { useServerData, useStore } from "../lib/store";
import type { Item, ItemPatch, Occurrence, PropType } from "../lib/types";

const KIND_ICON: Partial<Record<FieldKind, ReactNode>> = {
  status: <CircleDot size={15} />, type: <Type size={15} />, parent: <CornerDownLeft size={15} />,
  date: <Calendar size={15} />, span: <CalendarDays size={15} />, repeat: <RepeatIcon size={15} />,
  links: <Link2 size={15} />, inbox: <Inbox size={15} />, text: <List size={15} />, number: <Hash size={15} />,
  choice: <TagIcon size={15} />, multi: <TagIcon size={15} />, checkbox: <CheckSquare size={15} />, url: <Link2 size={15} />,
};

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

// These are shown elsewhere on the page or aren't editable per item.
const HIDDEN = new Set(["title", "notes", "status", "created", "inbox"]);

export function ItemPage({ id }: { id: string }) {
  const { itemsById, childrenOf, fields, types, loaded, updateItem, createItem, deleteItem } = useStore();
  const item = itemsById.get(id);
  const [extra, setExtra] = useState<string[]>([]); // fields opened by the user but still empty
  useEffect(() => setExtra([]), [id]);

  if (!loaded) return null;
  if (!item) {
    return (
      <div className="py-20 text-center text-muted">
        הפריט לא נמצא (אולי נמחק).
        <div className="mt-3"><Button variant="outline" onClick={() => navigate("/today")}>חזרה להיום</Button></div>
      </div>
    );
  }

  const type = types.find((t) => t.id === item.type_id);
  const suggested = type?.suggested ?? [];
  const visible = fields.filter((f) =>
    !HIDDEN.has(f.key) && (f.key === "type" || f.key === "parent" || !isEmpty(f.get(item)) || suggested.includes(f.key) || extra.includes(f.key)));
  const hidden = fields.filter((f) => !HIDDEN.has(f.key) && !visible.includes(f));

  const ancestors: Item[] = [];
  for (let p = item.parent_id ? itemsById.get(item.parent_id) : undefined; p && ancestors.length < 10; p = p.parent_id ? itemsById.get(p.parent_id) : undefined) {
    ancestors.unshift(p);
  }
  const children = childrenOf.get(item.id) ?? [];
  const done = item.status === "done";

  return (
    <article className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center gap-1 text-sm text-muted">
        <IconButton label="חזרה" onClick={() => history.back()}><ArrowRight size={16} /></IconButton>
        <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
          {ancestors.map((a) => (
            <span key={a.id} className="flex min-w-0 items-center gap-1">
              <button type="button" onClick={() => openItem(a.id)} className="truncate rounded px-1 hover:bg-hover hover:text-ink">
                {types.find((t) => t.id === a.type_id)?.icon} {a.title}
              </button>
              <ChevronLeft size={14} className="shrink-0 text-faint" />
            </span>
          ))}
        </nav>
        <SnoozeButton item={item} />
        <IconButton label="מחק" onClick={() => { deleteItem(item.id); history.back(); }}><Trash2 size={16} /></IconButton>
      </div>

      <div className="mb-5 flex items-start gap-3">
        <span className="mt-3"><StatusCheck done={done} size={22} onToggle={() => updateItem(item.id, { status: done ? "open" : "done" })} /></span>
        <TitleEditor key={item.id} item={item} />
      </div>

      {item.inbox && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-hover px-3 py-2 text-sm">
          <Inbox size={15} className="text-muted" />
          <span className="flex-1 text-muted">בתיבת הקליטה. תן לו סוג או שייך אותו לפריט אחר, או סמן כממוין.</span>
          <Button variant="outline" className="h-7" onClick={() => updateItem(item.id, { inbox: false })}>ממוין</Button>
        </div>
      )}

      <div className="mb-2 space-y-0.5">
        {visible.map((f) => (
          <div key={f.key} className="group flex items-start gap-2">
            <div className="flex h-8 w-32 shrink-0 items-center gap-2 px-1 text-sm text-muted md:w-40">
              <span className="text-faint">{KIND_ICON[f.kind]}</span>
              <span className="truncate">{f.label}</span>
            </div>
            <div className="min-w-0 flex-1"><FieldEditor field={f} item={item} /></div>
            {!isEmpty(f.get(item)) && f.key !== "type" && f.key !== "parent" && (
              <IconButton label={`נקה ${f.label}`} className="mt-0.5 opacity-0 group-hover:opacity-100 max-md:opacity-60"
                onClick={() => { updateItem(item.id, clearPatch(f)); setExtra((e) => e.filter((k) => k !== f.key)); }}>
                <X size={14} />
              </IconButton>
            )}
          </div>
        ))}
      </div>
      <AddPropertyMenu hidden={hidden} onAdd={(key) => setExtra((e) => [...e, key])} />

      <NotesEditor key={`n-${item.id}`} item={item} />

      {item.repeat && <OccurrencesSection item={item} />}

      <Section
        title="בתוך הפריט"
        count={children.length || undefined}
        action={children.length > 0 ? <Progress items={children} /> : undefined}
      >
        <ChildList items={children} />
        <QuickAddChild parent={item} siblings={children} create={createItem} />
      </Section>
    </article>
  );
}

function TitleEditor({ item }: { item: Item }) {
  const { updateItem } = useStore();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(item.title);
  const fit = () => {
    const el = ref.current;
    if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; }
  };
  useEffect(fit, [value]);
  const commit = () => {
    const v = value.trim();
    if (!v) setValue(item.title);
    else if (v !== item.title) updateItem(item.id, { title: v });
  };
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={(e) => setValue(e.target.value.replace(/\n/g, ""))}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), (e.target as HTMLTextAreaElement).blur())}
      className={`w-full resize-none bg-transparent text-[28px] leading-tight font-bold outline-none md:text-[34px] ${item.status === "done" ? "text-faint line-through" : ""}`}
      aria-label="כותרת"
    />
  );
}

function NotesEditor({ item }: { item: Item }) {
  const { updateItem } = useStore();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(item.notes);
  useEffect(() => {
    const el = ref.current;
    if (el) { el.style.height = "auto"; el.style.height = Math.max(el.scrollHeight, 60) + "px"; }
  }, [value]);
  return (
    <div className="my-6 border-t border-line pt-4">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => value !== item.notes && updateItem(item.id, { notes: value })}
        placeholder="הערות, מחשבות, פרטים…"
        className="w-full resize-none bg-transparent leading-relaxed outline-none placeholder:text-faint"
      />
    </div>
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
    <Popover width={280} trigger={({ toggle }) => (
      <button type="button" onClick={toggle} className="flex h-8 items-center gap-1.5 rounded-md px-2 text-sm text-faint hover:bg-hover hover:text-muted">
        <Plus size={15} /> הוסף מאפיין
      </button>
    )}>
      {(close) => (
        <>
          {hidden.length > 0 && <MenuLabel>מאפיינים קיימים</MenuLabel>}
          {hidden.map((f) => (
            <MenuItem key={f.key} icon={KIND_ICON[f.kind]} onClick={() => { onAdd(f.key); close(); }}>{f.label}</MenuItem>
          ))}
          <Divider />
          <MenuLabel>מאפיין חדש</MenuLabel>
          <div className="space-y-2 p-2">
            <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create(close)}
              placeholder="שם המאפיין, למשל ״מרצה״"
              className="w-full rounded-md border border-line bg-transparent px-2 py-1.5 text-sm outline-none focus:border-accent" />
            <select value={type} onChange={(e) => setType(e.target.value as PropType)}
              className="w-full rounded-md border border-line bg-popover px-2 py-1.5 text-sm">
              {Object.entries(PROP_TYPE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <Button variant="primary" className="w-full justify-center" disabled={!name.trim()} onClick={() => create(close)}>צור והוסף</Button>
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
    toast(`נדחה עד ${formatWhen(d)}`, { label: "ביטול", run: () => updateItem(item.id, { snooze_until: item.snooze_until }) });
    close();
  };
  return (
    <Popover width={220} trigger={({ toggle }) => (
      <IconButton label="דחה" onClick={toggle}><AlarmClock size={16} /></IconButton>
    )}>
      {(close) => (
        <>
          <MenuLabel>להסתיר עד…</MenuLabel>
          <MenuItem onClick={() => snooze(addDays(today, 1), close)}>מחר</MenuItem>
          <MenuItem onClick={() => snooze(addDays(today, 3), close)}>בעוד 3 ימים</MenuItem>
          <MenuItem onClick={() => snooze(addDays(today, 7), close)}>בעוד שבוע</MenuItem>
          <MenuItem onClick={() => snooze(addDays(today, 30), close)}>בעוד חודש</MenuItem>
          <div className="px-2 py-1">
            <input type="date" min={addDays(today, 1)} onChange={(e) => e.target.value && snooze(e.target.value, close)}
              className="w-full rounded-md border border-line px-1" />
          </div>
          {item.snooze_until && (
            <>
              <Divider />
              <MenuItem onClick={() => { updateItem(item.id, { snooze_until: null }); close(); }}>בטל דחייה</MenuItem>
            </>
          )}
        </>
      )}
    </Popover>
  );
}

function Progress({ items }: { items: Item[] }) {
  const live = items.filter((i) => i.status !== "dropped");
  const done = live.filter((i) => i.status === "done").length;
  if (!live.length) return null;
  return (
    <div className="flex items-center gap-2 text-xs text-muted">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-hover">
        <div className="h-full rounded-full bg-accent" style={{ width: `${(done / live.length) * 100}%` }} />
      </div>
      {done}/{live.length}
    </div>
  );
}

function ChildList({ items }: { items: Item[] }) {
  const [showDone, setShowDone] = useState(false);
  const open = items.filter((i) => i.status === "open").sort(byDate);
  const closed = items.filter((i) => i.status !== "open");
  return (
    <div>
      {open.map((c) => <ItemRow key={c.id} item={c} hideParent />)}
      {closed.length > 0 && (
        <button type="button" onClick={() => setShowDone((s) => !s)} className="mt-1 px-2 py-1 text-xs text-faint hover:text-muted">
          {showDone ? "הסתר" : "הצג"} {closed.length} שהושלמו
        </button>
      )}
      {showDone && closed.map((c) => <ItemRow key={c.id} item={c} hideParent />)}
    </div>
  );
}

function byDate(a: Item, b: Item) {
  const da = a.due_at ?? a.when_at ?? a.repeat?.start ?? "9999";
  const db = b.due_at ?? b.when_at ?? b.repeat?.start ?? "9999";
  return da.localeCompare(db) || a.created_at.localeCompare(b.created_at);
}

function QuickAddChild({ parent, siblings, create }: {
  parent: Item; siblings: Item[]; create: (b: ItemPatch & { title: string }) => Promise<Item | null>;
}) {
  const [title, setTitle] = useState("");
  // New children get the type most of their siblings have (e.g. lectures inside a course).
  const commonType = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of siblings) if (s.type_id) counts.set(s.type_id, (counts.get(s.type_id) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }, [siblings]);
  const add = async () => {
    if (!title.trim()) return;
    await create({ title: title.trim(), parent_id: parent.id, type_id: commonType });
    setTitle("");
  };
  return (
    <div className="flex items-center gap-2 px-2 py-1.5">
      <Plus size={16} className="text-faint" />
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && add()}
        placeholder="הוסף פריט בפנים…"
        className="flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
      />
    </div>
  );
}

function OccurrencesSection({ item }: { item: Item }) {
  const { markOccurrence } = useStore();
  const today = todayISO();
  const data = useServerData<Occurrence[]>(`/occurrences?frm=${addDays(today, -42)}&to=${addDays(today, 28)}`);
  const mine = (data ?? []).filter((o) => o.item_id === item.id);
  const past = mine.filter((o) => o.date < today).slice(-8).reverse();
  const next = mine.filter((o) => o.date >= today).slice(0, 4);
  const row = (o: Occurrence) => (
    <div key={o.date} className="flex min-h-10 items-center gap-2 rounded-md px-2 hover:bg-hover">
      <span className={`flex-1 text-sm ${o.status !== "open" ? "text-faint" : ""}`}>
        {formatWhen(o.date, today)}{o.time ? `, ${o.time}` : ""}
      </span>
      {o.status === "open" && o.date < today && <Flag size={13} className="text-danger" />}
      <Button className={`h-7 px-2 text-xs ${o.status === "done" ? "text-accent" : ""}`}
        onClick={() => markOccurrence(item.id, o.date, o.status === "done" ? null : "done")}>
        <Check size={13} /> בוצע
      </Button>
      <Button className={`h-7 px-2 text-xs ${o.status === "skipped" ? "text-accent" : ""}`}
        onClick={() => markOccurrence(item.id, o.date, o.status === "skipped" ? null : "skipped")}>
        <SkipForward size={13} /> דלג
      </Button>
    </div>
  );
  return (
    <Section title="מופעים">
      {!data ? <Empty>טוען…</Empty> : (
        <>
          {next.length > 0 && <div className="mb-2">{next.map(row)}</div>}
          {past.length > 0 && <><div className="px-2 pt-2 text-xs text-faint">קודמים</div>{past.map(row)}</>}
          {!mine.length && <Empty>אין מופעים בטווח הקרוב.</Empty>}
        </>
      )}
    </Section>
  );
}
