// One editor per field kind. The item page renders these for every property an item has.
import { Clock, ExternalLink, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { addDays, formatWhen, timeOf, todayISO, WEEKDAY_LETTERS } from "../lib/dates";
import type { Field } from "../lib/fields";
import { useStore } from "../lib/store";
import type { Item, ItemPatch, Link, PropertyDef, Repeat } from "../lib/types";
import { Button, COLORS, Divider, IconButton, MenuItem, Popover, SearchInput, Tag } from "./ui";

const valueBox = "flex min-h-8 w-full min-w-0 items-center rounded-md px-2 text-start hover:bg-hover";
const placeholder = <span className="text-faint">ריק</span>;

export function FieldEditor({ field, item }: { field: Field; item: Item }) {
  const { updateItem } = useStore();
  const save = (patch: ItemPatch) => updateItem(item.id, patch);

  switch (field.kind) {
    case "status":
      return <BucketPicker field={field} item={item} onPick={(k) => save(field.setBucket!(k))} />;
    case "type":
      return <TypePicker item={item} />;
    case "parent":
      return <ParentPicker item={item} onPick={(id) => save({ parent_id: id })} />;
    case "date": {
      const keyMap: Record<string, keyof Item> = { when: "when_at", due: "due_at", snooze: "snooze_until" };
      const col = keyMap[field.key];
      if (col) {
        return (
          <DateTimeInput
            value={item[col] as string | null}
            allowTime={col !== "snooze_until"}
            quick={col === "snooze_until"}
            onChange={(v) => save({ [col]: v } as ItemPatch)}
          />
        );
      }
      if (field.key === "created") return <div className={valueBox + " text-muted"}>{formatWhen(item.created_at.slice(0, 10))}</div>;
      return (
        <DateTimeInput
          value={(item.props[field.key] as string) ?? null}
          allowTime={false}
          onChange={(v) => save({ props: { [field.key]: v } })}
        />
      );
    }
    case "span":
      return <SpanEditor item={item} />;
    case "repeat":
      return <RepeatEditor item={item} />;
    case "links":
      return <LinksEditor item={item} />;
    case "inbox":
      return (
        <label className={valueBox + " cursor-pointer gap-2"}>
          <input type="checkbox" checked={item.inbox} onChange={(e) => save({ inbox: e.target.checked })} className="accent-[var(--accent)]" />
          <span className="text-sm text-muted">{item.inbox ? "ממתין למיון" : "ממוין"}</span>
        </label>
      );
    case "choice":
    case "multi":
      return <OptionPicker field={field} item={item} />;
    case "checkbox":
      return (
        <label className={valueBox + " cursor-pointer"}>
          <input
            type="checkbox"
            checked={!!item.props[field.key]}
            onChange={(e) => save({ props: { [field.key]: e.target.checked || null } })}
            className="h-4 w-4 accent-[var(--accent)]"
          />
        </label>
      );
    case "number":
    case "text":
    case "url":
      return <TextValue field={field} item={item} />;
    default:
      return null;
  }
}

function TextValue({ field, item }: { field: Field; item: Item }) {
  const { updateItem } = useStore();
  const value = item.props[field.key];
  const [draft, setDraft] = useState(value === undefined ? "" : String(value));
  const commit = () => {
    const v = draft.trim();
    const next = v === "" ? null : field.kind === "number" ? Number(v) : v;
    if (field.kind === "number" && v !== "" && Number.isNaN(next)) return;
    if (next !== (value ?? null)) updateItem(item.id, { props: { [field.key]: next } });
  };
  return (
    <div className="flex w-full items-center gap-1">
      <input
        value={draft}
        inputMode={field.kind === "number" ? "decimal" : field.kind === "url" ? "url" : undefined}
        dir={field.kind === "url" ? "ltr" : undefined}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        placeholder="ריק"
        className="min-h-8 w-full min-w-0 rounded-md bg-transparent px-2 text-start outline-none placeholder:text-faint hover:bg-hover focus:bg-hover"
      />
      {field.kind === "url" && typeof value === "string" && (
        <a href={value} target="_blank" rel="noreferrer" className="text-muted hover:text-ink" aria-label="פתח קישור">
          <ExternalLink size={14} />
        </a>
      )}
    </div>
  );
}

export function DateTimeInput({ value, onChange, allowTime = true, quick = false }: {
  value: string | null; onChange: (v: string | null) => void; allowTime?: boolean; quick?: boolean;
}) {
  const day = value?.slice(0, 10) ?? "";
  const time = timeOf(value);
  const [showTime, setShowTime] = useState(!!time);
  const today = todayISO();
  const set = (d: string, t: string | null) => onChange(d ? (t ? `${d}T${t}` : d) : null);
  return (
    <div className="flex w-full flex-wrap items-center gap-1 px-1">
      <input type="date" value={day} onChange={(e) => set(e.target.value, time)} className="rounded-md px-1 hover:bg-hover" />
      {allowTime && day && (showTime || time ? (
        <input type="time" value={time ?? ""} onChange={(e) => set(day, e.target.value || null)} className="rounded-md px-1 hover:bg-hover" />
      ) : (
        <IconButton label="הוסף שעה" onClick={() => setShowTime(true)}><Clock size={14} /></IconButton>
      ))}
      {quick && (
        <>
          <Button className="h-7 px-2 text-xs" onClick={() => onChange(addDays(today, 1))}>מחר</Button>
          <Button className="h-7 px-2 text-xs" onClick={() => onChange(addDays(today, 7))}>בעוד שבוע</Button>
        </>
      )}
      {value && <IconButton label="נקה" onClick={() => { onChange(null); setShowTime(false); }}><X size={14} /></IconButton>}
    </div>
  );
}

function BucketPicker({ field, item, onPick }: { field: Field; item: Item; onPick: (k: string) => void }) {
  const current = field.buckets(item)[0];
  return (
    <Popover width={200} trigger={({ toggle }) => (
      <button type="button" onClick={toggle} className={valueBox}><Tag color={current?.color}>{current?.label}</Tag></button>
    )}>
      {(close) => field.allBuckets!().map((b) => (
        <MenuItem key={b.key} active={b.key === current?.key} onClick={() => { onPick(b.key); close(); }}>
          <Tag color={b.color}>{b.label}</Tag>
        </MenuItem>
      ))}
    </Popover>
  );
}

export function TypePicker({ item, compact }: { item: Item; compact?: boolean }) {
  const { types, updateItem, createType } = useStore();
  const [q, setQ] = useState("");
  const current = types.find((t) => t.id === item.type_id);
  const list = types.filter((t) => !t.archived && t.name.includes(q));
  const create = async (close: () => void) => {
    const t = await createType(q.trim());
    if (t) updateItem(item.id, { type_id: t.id });
    setQ("");
    close();
  };
  return (
    <Popover width={240} trigger={({ toggle }) => (
      <button type="button" onClick={toggle} className={compact ? "rounded-md px-1.5 py-0.5 text-sm hover:bg-hover" : valueBox}>
        {current ? <Tag color={current.color}>{current.icon} {current.name}</Tag> : compact ? <span className="text-faint">סוג</span> : placeholder}
      </button>
    )}>
      {(close) => (
        <>
          <SearchInput value={q} onChange={setQ} placeholder="חפש או צור סוג…" onEnter={() => (list[0] ? (updateItem(item.id, { type_id: list[0].id }), close()) : q.trim() && create(close))} />
          {list.map((t) => (
            <MenuItem key={t.id} active={t.id === item.type_id} icon={t.icon} onClick={() => { updateItem(item.id, { type_id: t.id }); close(); }}>
              {t.name}
            </MenuItem>
          ))}
          {q.trim() && !types.some((t) => t.name === q.trim()) && (
            <MenuItem icon={<Plus size={14} />} onClick={() => create(close)}>צור סוג “{q.trim()}”</MenuItem>
          )}
          {current && (
            <>
              <Divider />
              <MenuItem icon={<X size={14} />} onClick={() => { updateItem(item.id, { type_id: null }); close(); }}>ללא סוג</MenuItem>
            </>
          )}
        </>
      )}
    </Popover>
  );
}

/** Pick another item as the parent. Excludes the item itself and its descendants (no cycles). */
export function ParentPicker({ item, onPick, compact }: { item: Item; onPick: (id: string | null) => void; compact?: boolean }) {
  const { items, itemsById, childrenOf, types } = useStore();
  const [q, setQ] = useState("");
  const parent = item.parent_id ? itemsById.get(item.parent_id) : undefined;

  const blocked = new Set<string>([item.id]);
  const stack = [item.id];
  while (stack.length) for (const c of childrenOf.get(stack.pop()!) ?? []) if (!blocked.has(c.id)) { blocked.add(c.id); stack.push(c.id); }

  const typeOf = (i: typeof item) => types.find((t) => t.id === i.type_id);
  const candidates = items
    .filter((i) => !blocked.has(i.id) && i.status !== "dropped" && i.title.includes(q))
    // Items that already contain other items (courses, projects) first.
    .sort((a, b) => (childrenOf.has(b.id) ? 1 : 0) - (childrenOf.has(a.id) ? 1 : 0) || a.title.localeCompare(b.title, "he"))
    .slice(0, 30);
  return (
    <Popover width={280} trigger={({ toggle }) => (
      <button type="button" onClick={toggle} className={compact ? "rounded-md px-1.5 py-0.5 text-sm hover:bg-hover" : valueBox}>
        {parent ? (
          <span className="truncate">{typeOf(parent)?.icon} {parent.title}</span>
        ) : compact ? <span className="text-faint">חלק מ…</span> : placeholder}
      </button>
    )}>
      {(close) => (
        <>
          <SearchInput value={q} onChange={setQ} placeholder="חפש פריט…" />
          {candidates.map((c) => (
            <MenuItem key={c.id} active={c.id === item.parent_id} icon={typeOf(c)?.icon || "·"} onClick={() => { onPick(c.id); close(); }}>
              {c.title}
            </MenuItem>
          ))}
          {!candidates.length && <div className="px-2 py-2 text-sm text-faint">לא נמצאו פריטים</div>}
          {parent && (
            <>
              <Divider />
              <MenuItem icon={<X size={14} />} onClick={() => { onPick(null); close(); }}>הסר שיוך</MenuItem>
            </>
          )}
        </>
      )}
    </Popover>
  );
}

export function newOptionId() {
  return "o_" + Math.random().toString(36).slice(2, 8);
}

export function OptionPicker({ field, item, compact }: { field: Field; item: Item; compact?: boolean }) {
  const { properties, updateItem, updateProperty } = useStore();
  const prop = properties.find((p) => p.id === field.key) as PropertyDef;
  const [q, setQ] = useState("");
  const multi = prop.type === "multi";
  const value = item.props[prop.id];
  const selected: string[] = multi ? ((value as string[]) ?? []) : value ? [value as string] : [];

  const toggle = (id: string, close: () => void) => {
    if (multi) {
      const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
      updateItem(item.id, { props: { [prop.id]: next.length ? next : null } });
    } else {
      updateItem(item.id, { props: { [prop.id]: selected[0] === id ? null : id } });
      close();
    }
  };
  const create = async (close: () => void) => {
    const label = q.trim();
    if (!label) return;
    const option = { id: newOptionId(), label, color: COLORS[(prop.options.length + 1) % COLORS.length] };
    const updated = await updateProperty(prop.id, { options: [...prop.options, option] });
    if (updated) toggle(option.id, close);
    setQ("");
  };
  const list = prop.options.filter((o) => o.label.includes(q));

  return (
    <Popover width={240} trigger={({ toggle: t }) => (
      <button type="button" onClick={t} className={compact ? "flex flex-wrap gap-1 rounded-md px-1 py-0.5 hover:bg-hover" : valueBox + " flex-wrap gap-1 py-1"}>
        {selected.length
          ? selected.map((id) => {
              const o = prop.options.find((o) => o.id === id);
              return o ? <Tag key={id} color={o.color}>{o.label}</Tag> : null;
            })
          : compact ? <span className="text-sm text-faint">{prop.name}</span> : placeholder}
      </button>
    )}>
      {(close) => (
        <>
          <SearchInput value={q} onChange={setQ} placeholder="חפש או צור אפשרות…" onEnter={() => (list[0] ? toggle(list[0].id, close) : create(close))} />
          {list.map((o) => (
            <MenuItem key={o.id} active={selected.includes(o.id)} onClick={() => toggle(o.id, close)}>
              <Tag color={o.color}>{o.label}</Tag>
            </MenuItem>
          ))}
          {q.trim() && !prop.options.some((o) => o.label === q.trim()) && (
            <MenuItem icon={<Plus size={14} />} onClick={() => create(close)}>צור “{q.trim()}”</MenuItem>
          )}
        </>
      )}
    </Popover>
  );
}

function SpanEditor({ item }: { item: Item }) {
  const { updateItem } = useStore();
  return (
    <div className="flex flex-wrap items-center gap-1 px-1">
      <input type="date" value={item.span_start ?? ""} onChange={(e) => updateItem(item.id, { span_start: e.target.value || null })} className="rounded-md px-1 hover:bg-hover" />
      <span className="text-faint">עד</span>
      <input type="date" value={item.span_end ?? ""} min={item.span_start ?? undefined} onChange={(e) => updateItem(item.id, { span_end: e.target.value || null })} className="rounded-md px-1 hover:bg-hover" />
      {(item.span_start || item.span_end) && (
        <IconButton label="נקה" onClick={() => updateItem(item.id, { span_start: null, span_end: null })}><X size={14} /></IconButton>
      )}
    </div>
  );
}

export function describeRepeat(r: Repeat): string {
  const every = r.interval > 1 ? `כל ${r.interval} ` : "כל ";
  let s: string;
  if (r.freq === "daily") s = r.interval > 1 ? `${every}ימים` : "כל יום";
  else if (r.freq === "monthly") s = r.interval > 1 ? `${every}חודשים` : "כל חודש";
  else {
    const days = [...r.weekdays].sort().map((d) => WEEKDAY_LETTERS[d]).join(", ");
    s = `${r.interval > 1 ? `${every}שבועות` : "כל שבוע"}${days ? ` · ${days}` : ""}`;
  }
  if (r.time) s += ` · ${r.time}${r.end_time ? `–${r.end_time}` : ""}`;
  if (r.until) s += ` · עד ${formatWhen(r.until)}`;
  return s;
}

function RepeatEditor({ item }: { item: Item }) {
  const { updateItem } = useStore();
  const r = item.repeat;
  const today = todayISO();
  const set = (patch: Partial<Repeat>) => {
    const base: Repeat = r ?? { freq: "weekly", interval: 1, weekdays: [new Date().getDay()], start: today, track_missed: true };
    updateItem(item.id, { repeat: { ...base, ...patch } });
  };
  const chip = "h-8 min-w-8 rounded-md border px-2 text-sm transition-colors";
  return (
    <Popover width={320} trigger={({ toggle }) => (
      <button type="button" onClick={toggle} className={valueBox}>{r ? describeRepeat(r) : placeholder}</button>
    )}>
      {() => (
        <div className="space-y-3 p-2 text-sm">
          <div className="flex gap-1">
            {(["daily", "weekly", "monthly"] as const).map((f) => (
              <button key={f} type="button" onClick={() => set({ freq: f })}
                className={`${chip} flex-1 ${r?.freq === f ? "border-accent bg-accent text-white" : "border-line hover:bg-hover"}`}>
                {{ daily: "יומי", weekly: "שבועי", monthly: "חודשי" }[f]}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2">
            <span className="w-16 text-muted">כל</span>
            <input type="number" min={1} max={52} value={r?.interval ?? 1}
              onChange={(e) => set({ interval: Math.max(1, Number(e.target.value) || 1) })}
              className="w-16 rounded-md border border-line bg-transparent px-2 py-1" />
            <span className="text-muted">{{ daily: "ימים", weekly: "שבועות", monthly: "חודשים" }[r?.freq ?? "weekly"]}</span>
          </label>
          {(r?.freq ?? "weekly") === "weekly" && (
            <div className="flex flex-wrap gap-1">
              {WEEKDAY_LETTERS.map((l, d) => {
                const on = r?.weekdays.includes(d);
                return (
                  <button key={d} type="button"
                    onClick={() => set({ weekdays: on ? r!.weekdays.filter((x) => x !== d) : [...(r?.weekdays ?? []), d] })}
                    className={`${chip} ${on ? "border-accent bg-accent text-white" : "border-line hover:bg-hover"}`}>
                    {l}
                  </button>
                );
              })}
            </div>
          )}
          <label className="flex items-center gap-2">
            <span className="w-16 text-muted">שעה</span>
            <input type="time" value={r?.time ?? ""} onChange={(e) => set({ time: e.target.value || null })} className="rounded-md border border-line px-1" />
            <span className="text-faint">–</span>
            <input type="time" value={r?.end_time ?? ""} onChange={(e) => set({ end_time: e.target.value || null })} className="rounded-md border border-line px-1" />
          </label>
          <label className="flex items-center gap-2">
            <span className="w-16 text-muted">מתאריך</span>
            <input type="date" value={r?.start ?? today} onChange={(e) => e.target.value && set({ start: e.target.value })} className="rounded-md border border-line px-1" />
          </label>
          <label className="flex items-center gap-2">
            <span className="w-16 text-muted">עד</span>
            <input type="date" value={r?.until ?? ""} onChange={(e) => set({ until: e.target.value || null })} className="rounded-md border border-line px-1" />
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={r?.track_missed ?? true} onChange={(e) => set({ track_missed: e.target.checked })} className="accent-[var(--accent)]" />
            <span>הצג מופעים שלא סומנו ב„פספוסים”</span>
          </label>
          {r && (
            <Button variant="danger" className="w-full justify-center" onClick={() => updateItem(item.id, { repeat: null })}>
              <Trash2 size={14} /> הסר חזרה
            </Button>
          )}
        </div>
      )}
    </Popover>
  );
}

function LinksEditor({ item }: { item: Item }) {
  const { updateItem } = useStore();
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const save = (links: Link[]) => updateItem(item.id, { links });
  const add = () => {
    let u = url.trim();
    if (!u) return;
    if (!/^[a-z]+:\/\//i.test(u)) u = "https://" + u;
    save([...item.links, { url: u, title: title.trim() }]);
    setUrl("");
    setTitle("");
  };
  const hostOf = (u: string) => {
    try {
      return new URL(u).hostname.replace(/^www\./, "");
    } catch {
      return u;
    }
  };
  return (
    <div className="w-full space-y-0.5">
      {item.links.map((l, i) => (
        <div key={i} className="group flex items-center gap-1 rounded-md px-2 py-1 hover:bg-hover">
          <a href={l.url} target="_blank" rel="noreferrer" className="flex min-w-0 flex-1 items-center gap-1.5 text-sm">
            <ExternalLink size={13} className="shrink-0 text-muted" />
            <span className="truncate underline decoration-line underline-offset-2">{l.title || hostOf(l.url)}</span>
          </a>
          <IconButton label="הסר קישור" className="opacity-0 group-hover:opacity-100" onClick={() => save(item.links.filter((_, j) => j !== i))}>
            <X size={13} />
          </IconButton>
        </div>
      ))}
      <Popover width={300} trigger={({ toggle }) => (
        <button type="button" onClick={toggle} className="flex h-8 items-center gap-1 rounded-md px-2 text-sm text-faint hover:bg-hover">
          <Plus size={14} /> הוסף קישור
        </button>
      )}>
        {(close) => (
          <div className="space-y-2 p-2">
            <input autoFocus dir="ltr" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://drive.google.com/…"
              className="w-full rounded-md border border-line bg-transparent px-2 py-1.5 text-sm outline-none focus:border-accent" />
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="שם (לא חובה) — למשל ״תיקייה בדרייב״"
              onKeyDown={(e) => e.key === "Enter" && (add(), close())}
              className="w-full rounded-md border border-line bg-transparent px-2 py-1.5 text-sm outline-none focus:border-accent" />
            <Button variant="primary" className="w-full justify-center" onClick={() => { add(); close(); }}>הוסף</Button>
          </div>
        )}
      </Popover>
    </div>
  );
}
