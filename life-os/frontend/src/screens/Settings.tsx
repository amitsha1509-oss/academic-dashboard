import { Archive, Download, Plus, RotateCcw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { newOptionId } from "../components/FieldEditor";
import { Button, COLORS, Empty, IconButton, MenuItem, Popover, Section, Tag, tagStyle } from "../components/ui";
import { Screen } from "../components/kit";
import { AreaPicker } from "../components/AreaPicker";
import { useAreas } from "../lib/areas";
import { api } from "../lib/api";
import { formatWhen } from "../lib/dates";
import { useStore } from "../lib/store";
import type { ChoiceOption, Item, PropertyDef, PropType } from "../lib/types";
import { PROP_TYPE_LABELS } from "./ItemScreen";

const input = "min-w-0 rounded-xl bg-transparent px-2 py-1.5 outline-none hover:bg-hover focus:bg-hover";

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
  const [changingType, setChangingType] = useState<string | null>(null);

  return (
    <>
      <p className="text-[15px] leading-relaxed text-muted">
        מאפיין הוא פרט שאפשר לתת לפריט, כמו חשיבות, מאמץ או מרצה. כאן משנים שם, מוסיפים אפשרויות או מסתירים מאפיין.
        תאריכים, "בתוך", חזרה וקישורים מובנים באפליקציה ולכן לא מופיעים כאן.
      </p>
      {live.map((p) => (
        <div key={p.id} className="rounded-[18px] bg-surface p-3">
          <div className="flex flex-wrap items-center gap-2">
            <input defaultValue={p.name} className={`${input} flex-1 font-medium`}
              onBlur={(e) => e.target.value.trim() && e.target.value !== p.name && updateProperty(p.id, { name: e.target.value.trim() })} />
            {changingType === p.id ? (
              <select value={p.type} autoFocus className="rounded-xl bg-canvas px-2 py-1.5 text-sm" aria-label="סוג המאפיין"
                onBlur={() => setChangingType(null)}
                onChange={(e) => {
                  const t = e.target.value as PropType;
                  const n = usage(p.id);
                  if (!n || confirm(`לשנות את הסוג ל„${PROP_TYPE_LABELS[t]}”? ${n} פריטים יומרו, וערכים שלא ניתן להמיר יוסרו.`)) convertProperty(p.id, t);
                  setChangingType(null);
                }}>
                {Object.entries(PROP_TYPE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            ) : (
              <button type="button" onClick={() => setChangingType(p.id)} title="שינוי סוג"
                className="rounded-full px-2.5 py-1 text-[13px] text-muted hover:bg-canvas hover:text-ink">{PROP_TYPE_LABELS[p.type]}</button>
            )}
            <span className="text-xs text-faint">{usage(p.id)} פריטים</span>
            <IconButton label="הסתר מאפיין" onClick={() => setPropertyArchived(p.id, true)}><Archive size={15} /></IconButton>
          </div>
          {(p.type === "choice" || p.type === "multi") && <OptionsEditor prop={p} />}
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2 rounded-[18px] border-2 border-dashed border-line p-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="מאפיין חדש, למשל ״מרצה״ או ״מיקום״"
          className={`${input} flex-1`} onKeyDown={(e) => e.key === "Enter" && name.trim() && (createProperty(name.trim(), type), setName(""))} />
        <select value={type} onChange={(e) => setType(e.target.value as PropType)} className="rounded-xl bg-canvas px-2 py-1.5 text-sm">
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
      <p className="text-[15px] leading-relaxed text-muted">
        הסוג קובע אילו פרטים יוצעו לפריט. הם לא חובה, ואפשר לשנות לפריט את הסוג בכל רגע. סוגים שכיבית ב"מה מופיע אצלי" מופיעים כאן כמוסתרים.
      </p>
      {live.map((t) => (
        <div key={t.id} className="flex flex-wrap items-center gap-2 rounded-[18px] bg-surface p-3">
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
      <div className="flex items-center gap-2 rounded-[18px] border-2 border-dashed border-line p-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="סוג חדש, למשל ״פרויקט״"
          className={`${input} flex-1`} onKeyDown={(e) => e.key === "Enter" && name.trim() && (createType(name.trim()), setName(""))} />
        <Button variant="primary" disabled={!name.trim()} onClick={() => { createType(name.trim()); setName(""); }}>הוסף</Button>
      </div>
      {archived.length > 0 && (
        <Section title="מוסתרים">
          {archived.map((t) => (
            <div key={t.id} className="flex items-center gap-2 px-2 py-1">
              <span className="flex-1 text-muted">{t.name}</span>
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
        <p className="mb-3 text-[15px] text-muted">
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

function AreasTab() {
  const { enabled, setAreas } = useAreas();
  const { toast } = useStore();
  const [selected, setSelected] = useState<string[]>([...enabled]);
  const changed = selected.length !== enabled.size || selected.some((a) => !enabled.has(a));
  return (
    <>
      <p className="text-[15px] leading-relaxed text-muted">
        מה שתבחר יופיע בעמוד הראשי ובאפשרויות ההוספה. מה שתכבה פשוט מוסתר: הפריטים שלו נשמרים וחוזרים כשמדליקים שוב.
      </p>
      <AreaPicker selected={selected} onChange={setSelected} />
      {changed && (
        <button type="button" onClick={async () => { await setAreas(selected); toast("נשמר"); }}
          className="pb-safe sticky bottom-4 justify-self-start rounded-full bg-ink px-6 py-3 text-[16px] font-medium text-canvas shadow-pop">
          שמור שינויים
        </button>
      )}
    </>
  );
}

function AdvancedTab() {
  return (
    <>
      <p className="text-[15px] leading-relaxed text-muted">
        כאן משנים את אבני הבניין: אילו סוגי פריטים יש, ואילו פרטים אפשר לתת להם. רוב האנשים לא צריכים לגעת בזה.
      </p>
      <Section title="סוגי פריטים"><div className="grid gap-2"><TypesTab /></div></Section>
      <Section title="מאפיינים"><div className="grid gap-3"><PropertiesTab /></div></Section>
    </>
  );
}

const TABS = [
  { id: "areas", label: "מה מופיע אצלי", C: AreasTab },
  { id: "data", label: "גיבוי וסל מחזור", C: DataTab },
  { id: "advanced", label: "מתקדם", C: AdvancedTab },
] as const;

export function SettingsScreen() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("areas");
  const current = TABS.find((t) => t.id === tab)!;
  return (
    <Screen title="הגדרות" add={false}>
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            className={`rounded-full px-4 py-2 text-[14.5px] font-medium ${t.id === tab ? "bg-ink text-canvas" : "bg-surface hover:bg-active"}`}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="grid gap-4"><current.C /></div>
    </Screen>
  );
}
