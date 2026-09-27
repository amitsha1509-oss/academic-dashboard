import { Archive, Download, Plus, RotateCcw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { newOptionId } from "../components/FieldEditor";
import { Button, COLORS, Empty, IconButton, MenuItem, PageHeader, Popover, Section, Tag, tagStyle } from "../components/ui";
import { api } from "../lib/api";
import { formatWhen } from "../lib/dates";
import { useStore } from "../lib/store";
import type { ChoiceOption, Item, PropertyDef, PropType } from "../lib/types";
import { PROP_TYPE_LABELS } from "./ItemPage";

const input = "min-w-0 rounded-md border border-transparent bg-transparent px-2 py-1 outline-none hover:border-line focus:border-accent";

function ColorPicker({ color, onPick }: { color: string; onPick: (c: string) => void }) {
  return (
    <Popover width={180} trigger={({ toggle }) => (
      <button type="button" onClick={toggle} aria-label="צבע" className="h-5 w-5 shrink-0 rounded" style={tagStyle(color)} />
    )}>
      {(close) => (
        <div className="grid grid-cols-5 gap-1 p-1">
          {COLORS.map((c) => (
            <button key={c} type="button" aria-label={c} onClick={() => { onPick(c); close(); }}
              className={`h-7 rounded ${c === color ? "ring-2 ring-accent" : ""}`} style={tagStyle(c)} />
          ))}
        </div>
      )}
    </Popover>
  );
}

function OptionsEditor({ prop }: { prop: PropertyDef }) {
  const { updateProperty } = useStore();
  const [label, setLabel] = useState("");
  const save = (options: ChoiceOption[]) => updateProperty(prop.id, { options });
  const add = () => {
    if (!label.trim()) return;
    save([...prop.options, { id: newOptionId(), label: label.trim(), color: COLORS[(prop.options.length + 1) % COLORS.length] }]);
    setLabel("");
  };
  return (
    <div className="mt-1 space-y-1 ps-2">
      {prop.options.map((o, i) => (
        <div key={o.id} className="group flex items-center gap-2">
          <ColorPicker color={o.color} onPick={(c) => save(prop.options.map((x, j) => (j === i ? { ...x, color: c } : x)))} />
          <input defaultValue={o.label} className={`${input} flex-1 text-sm`}
            onBlur={(e) => e.target.value.trim() && e.target.value !== o.label && save(prop.options.map((x, j) => (j === i ? { ...x, label: e.target.value.trim() } : x)))} />
          <IconButton label="מחק אפשרות" className="opacity-0 group-hover:opacity-100 max-md:opacity-60"
            onClick={() => confirm(`למחוק את „${o.label}”? הערך יוסר מכל הפריטים שמסומנים בו.`) && save(prop.options.filter((x) => x.id !== o.id))}>
            <X size={14} />
          </IconButton>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <Plus size={14} className="text-faint" />
        <input value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="אפשרות חדשה…" className={`${input} flex-1 text-sm placeholder:text-faint`} />
      </div>
    </div>
  );
}

function PropertiesTab() {
  const { properties, items, createProperty, updateProperty, convertProperty, setPropertyArchived } = useStore();
  const [name, setName] = useState("");
  const [type, setType] = useState<PropType>("choice");
  const live = properties.filter((p) => !p.archived);
  const archived = properties.filter((p) => p.archived);
  const usage = (id: string) => items.filter((i) => i.props[id] !== undefined).length;

  return (
    <>
      <p className="mb-4 text-sm text-muted">
        מאפיינים הם השדות שאפשר לתת לכל פריט. שינוי כאן משפיע מיד על כל הפריטים והתצוגות — שינוי שם, הוספת אפשרויות, או אפילו שינוי סוג (הערכים יומרו).
        בנוסף יש מאפייני ליבה קבועים שהאפליקציה מבינה: סטטוס, סוג, חלק מ, מתי, תאריך יעד, תקופה, חזרה, דחייה וקישורים.
      </p>
      {live.map((p) => (
        <div key={p.id} className="mb-3 rounded-lg border border-line p-2">
          <div className="flex flex-wrap items-center gap-2">
            <input defaultValue={p.name} className={`${input} flex-1 font-medium`}
              onBlur={(e) => e.target.value.trim() && e.target.value !== p.name && updateProperty(p.id, { name: e.target.value.trim() })} />
            <select value={p.type} className="rounded-md border border-line bg-canvas px-2 py-1 text-sm"
              onChange={(e) => {
                const t = e.target.value as PropType;
                const n = usage(p.id);
                if (!n || confirm(`לשנות את הסוג ל„${PROP_TYPE_LABELS[t]}”? ${n} פריטים יומרו; ערכים שלא ניתן להמיר יוסרו.`)) convertProperty(p.id, t);
              }}>
              {Object.entries(PROP_TYPE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <span className="text-xs text-faint">{usage(p.id)} פריטים</span>
            <IconButton label="הסתר מאפיין" onClick={() => setPropertyArchived(p.id, true)}><Archive size={15} /></IconButton>
          </div>
          {(p.type === "choice" || p.type === "multi") && <OptionsEditor prop={p} />}
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-line p-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="מאפיין חדש, למשל ״מרצה״ או ״מיקום״"
          className={`${input} flex-1`} onKeyDown={(e) => e.key === "Enter" && name.trim() && (createProperty(name.trim(), type), setName(""))} />
        <select value={type} onChange={(e) => setType(e.target.value as PropType)} className="rounded-md border border-line bg-canvas px-2 py-1 text-sm">
          {Object.entries(PROP_TYPE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <Button variant="primary" disabled={!name.trim()} onClick={() => { createProperty(name.trim(), type); setName(""); }}>הוסף</Button>
      </div>

      {archived.length > 0 && (
        <Section title="מוסתרים (הערכים נשמרו)">
          {archived.map((p) => (
            <div key={p.id} className="flex items-center gap-2 px-2 py-1">
              <span className="flex-1 text-muted">{p.name}</span>
              <Button onClick={() => setPropertyArchived(p.id, false)}><RotateCcw size={14} /> שחזר</Button>
            </div>
          ))}
        </Section>
      )}
    </>
  );
}

function TypesTab() {
  const { types, fields, items, createType, updateType, setTypeArchived } = useStore();
  const [name, setName] = useState("");
  const live = types.filter((t) => !t.archived);
  const archived = types.filter((t) => t.archived);
  const suggestable = fields.filter((f) => !["title", "notes", "status", "type", "created", "inbox"].includes(f.key));

  return (
    <>
      <p className="mb-4 text-sm text-muted">
        סוג הוא רק הצעה: אילו מאפיינים להציג כברירת מחדל. כל פריט יכול לקבל כל מאפיין, ואפשר לשנות סוג בכל רגע.
      </p>
      {live.map((t) => (
        <div key={t.id} className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-line p-2">
          <input defaultValue={t.icon} maxLength={4} aria-label="אייקון" className={`${input} w-11 text-center text-lg`}
            onBlur={(e) => e.target.value !== t.icon && updateType(t.id, { icon: e.target.value })} />
          <input defaultValue={t.name} className={`${input} w-32 font-medium`}
            onBlur={(e) => e.target.value.trim() && e.target.value !== t.name && updateType(t.id, { name: e.target.value.trim() })} />
          <ColorPicker color={t.color} onPick={(c) => updateType(t.id, { color: c })} />
          <Popover width={220} trigger={({ toggle }) => (
            <button type="button" onClick={toggle} className="flex min-w-0 flex-1 flex-wrap gap-1 rounded-md px-1 py-1 text-start hover:bg-hover">
              {t.suggested.length ? t.suggested.map((k) => {
                const f = fields.find((f) => f.key === k);
                return f ? <Tag key={k}>{f.label}</Tag> : null;
              }) : <span className="text-sm text-faint">מאפיינים מוצעים…</span>}
            </button>
          )}>
            {() => suggestable.map((f) => (
              <MenuItem key={f.key} active={t.suggested.includes(f.key)}
                onClick={() => updateType(t.id, { suggested: t.suggested.includes(f.key) ? t.suggested.filter((k) => k !== f.key) : [...t.suggested, f.key] })}>
                {f.label}
              </MenuItem>
            ))}
          </Popover>
          <span className="text-xs text-faint">{items.filter((i) => i.type_id === t.id).length}</span>
          <IconButton label="הסתר סוג" onClick={() => setTypeArchived(t.id, true)}><Archive size={15} /></IconButton>
        </div>
      ))}
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-line p-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="סוג חדש, למשל ״פרויקט״"
          className={`${input} flex-1`} onKeyDown={(e) => e.key === "Enter" && name.trim() && (createType(name.trim()), setName(""))} />
        <Button variant="primary" disabled={!name.trim()} onClick={() => { createType(name.trim()); setName(""); }}>הוסף</Button>
      </div>
      {archived.length > 0 && (
        <Section title="מוסתרים">
          {archived.map((t) => (
            <div key={t.id} className="flex items-center gap-2 px-2 py-1">
              <span className="flex-1 text-muted">{t.icon} {t.name}</span>
              <Button onClick={() => setTypeArchived(t.id, false)}><RotateCcw size={14} /> שחזר</Button>
            </div>
          ))}
        </Section>
      )}
    </>
  );
}

function DataTab() {
  const { restoreItem, version } = useStore();
  const [trash, setTrash] = useState<Item[] | null>(null);
  useEffect(() => { api.get<Item[]>("/trash").then(setTrash).catch(() => setTrash([])); }, [version]);
  return (
    <>
      <Section title="גיבוי">
        <p className="mb-3 text-sm text-muted">
          גיבוי אוטומטי נשמר כל יום בתיקייה <code dir="ltr">life-os/data/backups</code> (14 הימים האחרונים). אפשר גם להוריד עותק מלא:
        </p>
        <a href="/api/export" download="life-os-export.json">
          <Button variant="outline"><Download size={15} /> הורד את כל המידע (JSON)</Button>
        </a>
      </Section>
      <Section title="סל מחזור" count={trash?.length}>
        {!trash ? <Empty>טוען…</Empty> : !trash.length ? <Empty>ריק.</Empty> : trash.map((i) => (
          <div key={i.id} className="flex items-center gap-2 px-2 py-1.5">
            <span className="min-w-0 flex-1 truncate">{i.title}</span>
            <span className="text-xs text-faint">{formatWhen(i.updated_at.slice(0, 10))}</span>
            <Button onClick={() => restoreItem(i.id)}><RotateCcw size={14} /> שחזר</Button>
          </div>
        ))}
      </Section>
    </>
  );
}

const TABS = [
  { id: "properties", label: "מאפיינים", C: PropertiesTab },
  { id: "types", label: "סוגים", C: TypesTab },
  { id: "data", label: "גיבוי וסל מחזור", C: DataTab },
] as const;

export function SettingsPage({ tab }: { tab?: string }) {
  const current = TABS.find((t) => t.id === tab) ?? TABS[0];
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader icon="⚙️" title="הגדרות" />
      <div className="mb-5 flex gap-1 border-b border-line">
        {TABS.map((t) => (
          <a key={t.id} href={`#/settings/${t.id}`}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${t.id === current.id ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"}`}>
            {t.label}
          </a>
        ))}
      </div>
      <current.C />
    </div>
  );
}
