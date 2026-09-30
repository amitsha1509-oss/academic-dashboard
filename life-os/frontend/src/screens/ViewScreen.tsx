// Saved views. A view answers a few plain questions (which items, from where, in what order);
// the screen shows the answer as a sentence plus the matching items, top to bottom.
import { Trash2 } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { EmptyNote, Row, Screen } from "../components/kit";
import { MenuItem, Popover, SearchInput, Section } from "../components/ui";
import { NONE, type Field } from "../lib/fields";
import { useNav } from "../lib/nav";
import { useStore } from "../lib/store";
import type { Item, ItemPatch, ViewConfig } from "../lib/types";
import { applyView, groupItems } from "../lib/viewEngine";
import { describeView, toConfig, toSpec, type DateScope, type ViewSpec } from "../lib/viewText";
import { isDoable, relevantToAny } from "../lib/relevance";

function basePatchOf(spec: ViewSpec): ItemPatch {
  const patch: ItemPatch = {};
  if (spec.types.length === 1) patch.type_id = spec.types[0];
  if (spec.parent) patch.parent_id = spec.parent;
  return patch;
}

export function ViewScreen({ id }: { id: string }) {
  const { views, items, fields, types, properties, itemsById } = useStore();
  const { push } = useNav();
  const view = views.find((v) => v.id === id);
  const config: ViewConfig = view?.config ?? {};
  const shown = useMemo(() => applyView(items, config, fields), [items, config, fields]);
  if (!view) return <Screen title="התצוגה לא נמצאה" add={false}>{null}</Screen>;

  const spec = toSpec(config, properties);
  const base = basePatchOf(spec);
  const groupBy = config.groupBy ? fields.find((f) => f.key === config.groupBy) : undefined;

  return (
    <Screen title={view.name} subtitle={describeView(config, { types, properties, itemsById, fields })}
      add={{ type_id: base.type_id ?? null, parent_id: base.parent_id ?? null }}
      actions={<button type="button" onClick={() => push({ name: "viewEdit", arg: view.id })}
        className="rounded-full bg-ink px-4 py-1.5 text-[14.5px] font-medium text-canvas">ערוך תצוגה</button>}>
      <div className="-mt-4 text-[14px] font-medium text-faint">{shown.length} פריטים</div>
      {config.layout === "grid" ? <Matrix items={shown} fields={fields} /> : groupBy ? (
        groupItems(shown, groupBy).map((g) => (
          <Section key={g.bucket.key} title={g.bucket.label} count={g.items.length}>
            {g.items.map((i) => <Row key={i.id} item={i} />)}
          </Section>
        ))
      ) : (
        <div>
          {shown.map((i) => <Row key={i.id} item={i} />)}
          {!shown.length && <EmptyNote>אין כרגע פריטים שמתאימים לתצוגה הזו.</EmptyNote>}
        </div>
      )}
    </Screen>
  );
}

const QUADRANTS = [
  ["high", "high", "לעשות עכשיו", "חשוב ודחוף"],
  ["high", "low", "לתכנן", "חשוב, לא דחוף"],
  ["low", "high", "לקצר או להעביר", "דחוף, לא חשוב"],
  ["low", "low", "לוותר", "לא חשוב ולא דחוף"],
] as const;

function Matrix({ items, fields }: { items: Item[]; fields: Field[] }) {
  const imp = fields.find((f) => f.key === "importance");
  const urg = fields.find((f) => f.key === "urgency");
  if (!imp || !urg) return <EmptyNote>המאפיינים חשיבות ודחיפות הוסתרו בהגדרות.</EmptyNote>;
  const key = (f: Field, i: Item) => f.buckets(i)[0]?.key;
  const unsorted = items.filter((i) => key(imp, i) === NONE || key(urg, i) === NONE);
  return (
    <>
      {QUADRANTS.map(([ik, uk, title, sub]) => {
        const list = items.filter((i) => key(imp, i) === ik && key(urg, i) === uk);
        return (
          <Section key={title} title={title} sub={sub} count={list.length}>
            {list.length ? list.map((i) => <Row key={i.id} item={i} />) : <EmptyNote>ריק.</EmptyNote>}
          </Section>
        );
      })}
      {unsorted.length > 0 && (
        <Section title="עוד לא סווג" count={unsorted.length}>{unsorted.map((i) => <Row key={i.id} item={i} />)}</Section>
      )}
    </>
  );
}

// ─── Editing a view: plain questions with tappable answers ───

function Opt({ on, onClick, children, color }: { on?: boolean; onClick: () => void; children: ReactNode; color?: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={!!on}
      className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[14px] font-medium whitespace-nowrap transition-colors ${
        on ? "bg-ink text-canvas" : "bg-canvas hover:bg-active"}`}>
      {color && <span className="h-2 w-2 rounded-full" style={{ background: `var(--dot-${color}, var(--dot-gray))` }} />}
      {children}
    </button>
  );
}

function Question({ q, hint, children }: { q: string; hint?: string; children: ReactNode }) {
  return (
    <section className="grid gap-2.5 rounded-[20px] bg-surface p-4">
      <div className="grid gap-0.5">
        <h2 className="display text-[18px] font-bold">{q}</h2>
        {hint && <p className="text-[13.5px] text-muted">{hint}</p>}
      </div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </section>
  );
}

const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

export function ViewEditScreen({ id }: { id: string }) {
  const { views, items, fields, types, properties, itemsById, childrenOf, createView, updateView, deleteView, toast } = useStore();
  const { back, home, push } = useNav();
  const existing = id === "new" ? undefined : views.find((v) => v.id === id);
  const [name, setName] = useState(existing?.name ?? "");
  const [spec, setSpec] = useState<ViewSpec>(() => toSpec(existing?.config ?? {}, properties));
  const [q, setQ] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (patch: Partial<ViewSpec>) => setSpec((s) => ({ ...s, ...patch }));

  // Only ask what fits the chosen types; answers that stop fitting are dropped.
  const fits = (key: string) => relevantToAny(spec.types, key);
  const doable = !spec.types.length || spec.types.some(isDoable);
  const matrixFits = spec.types.length === 1 && spec.types[0] === "task";
  const effective: ViewSpec = {
    ...spec,
    parent: fits("parent") ? spec.parent : null,
    choices: Object.fromEntries(Object.entries(spec.choices).filter(([k]) => fits(k))),
    date: fits("due") ? spec.date : "all",
    showDone: doable ? spec.showDone : true,
    matrix: matrixFits && spec.matrix,
    sort: spec.sort === "due" && !fits("due") ? "created" : spec.sort === "when" && !fits("when") ? "created" : spec.sort,
  };
  const config = toConfig(effective);
  const preview = useMemo(() => applyView(items, config, fields), [items, config, fields]);
  const liveTypes = types.filter((t) => !t.archived);
  const choiceProps = properties.filter((p) => !p.archived && (p.type === "choice" || p.type === "multi") && p.options.length);
  const containers = items
    .filter((i) => ["topic", "course", "project"].includes(i.type_id ?? "") && i.status !== "dropped")
    .sort((a, b) => (childrenOf.get(b.id)?.length ?? 0) - (childrenOf.get(a.id)?.length ?? 0))
    .slice(0, 6);
  const parent = spec.parent ? itemsById.get(spec.parent) : undefined;
  const placeChips = parent && !containers.includes(parent) ? [parent, ...containers.slice(0, 5)] : containers;
  const groupOptions: { key: string | null; label: string }[] = [
    { key: null, label: "בלי" }, { key: "type", label: "סוג" }, { key: "parent", label: "מה שהם בתוכו" },
    ...choiceProps.filter((p) => relevantToAny(spec.types, p.id)).map((p) => ({ key: p.id, label: p.name })),
  ];

  const save = async () => {
    const finalName = name.trim() || "תצוגה בלי שם";
    if (existing) {
      await updateView(existing.id, { name: finalName, config });
      back();
    } else {
      const v = await createView(finalName, "", config);
      if (v) { back(); setTimeout(() => push({ name: "view", arg: v.id }), 420); }
    }
    toast("התצוגה נשמרה");
  };

  return (
    <Screen add={false} title={existing ? "עריכת תצוגה" : "תצוגה חדשה"}
      subtitle="תענה על השאלות. כל תשובה לא חובה, ובתחתית רואים מה ייכנס.">
      <section className="grid gap-2">
        <h2 className="display text-[18px] font-bold">איך לקרוא לה?</h2>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="למשל: משימות קלות לערב"
          className="border-b-2 border-ink bg-transparent py-2 text-[20px] outline-none placeholder:text-faint" />
      </section>

      <Question q="אילו פריטים?" hint="בלי בחירה, כל הסוגים.">
        {liveTypes.map((t) => <Opt key={t.id} color={t.color} on={spec.types.includes(t.id)} onClick={() => set({ types: toggle(spec.types, t.id) })}>{t.name}</Opt>)}
      </Question>

      {fits("parent") && <Question q="רק מתוך נושא, קורס או פרויקט?" hint="בלי בחירה, מכל מקום.">
        {placeChips.map((c) => <Opt key={c.id} on={spec.parent === c.id} onClick={() => set({ parent: spec.parent === c.id ? null : c.id })}>{c.title}</Opt>)}
        <Popover width={280} trigger={({ toggle: t }) => <Opt onClick={t}>אחר…</Opt>}>
          {(close) => (
            <>
              <SearchInput value={q} onChange={setQ} placeholder="חפש…" />
              {items.filter((i) => q && i.title.includes(q)).slice(0, 20).map((i) => (
                <MenuItem key={i.id} onClick={() => { set({ parent: i.id }); setQ(""); close(); }}>{i.title}</MenuItem>
              ))}
            </>
          )}
        </Popover>
      </Question>}

      {choiceProps.filter((p) => fits(p.id)).map((p) => (
        <Question key={p.id} q={`${p.name}?`} hint="בלי בחירה, לא משנה.">
          {p.options.map((o) => (
            <Opt key={o.id} color={o.color} on={(spec.choices[p.id] ?? []).includes(o.id)}
              onClick={() => set({ choices: { ...spec.choices, [p.id]: toggle(spec.choices[p.id] ?? [], o.id) } })}>{o.label}</Opt>
          ))}
        </Question>
      ))}

      {fits("due") && <Question q="תאריך יעד?">
        {([["all", "לא משנה"], ["late", "באיחור"], ["week", "בשבוע הקרוב"], ["none", "בלי תאריך"]] as [DateScope, string][]).map(([k, l]) => (
          <Opt key={k} on={spec.date === k} onClick={() => set({ date: k })}>{l}</Opt>
        ))}
      </Question>}

      {doable && <Question q="גם דברים שהושלמו?">
        <Opt on={!spec.showDone} onClick={() => set({ showDone: false })}>רק פתוחים</Opt>
        <Opt on={spec.showDone} onClick={() => set({ showDone: true })}>גם שהושלמו</Opt>
      </Question>}

      {matrixFits && <Question q="איך להציג?">
        <Opt on={!spec.matrix} onClick={() => set({ matrix: false })}>רשימה</Opt>
        <Opt on={spec.matrix} onClick={() => set({ matrix: true })}>לפי חשיבות ודחיפות</Opt>
      </Question>}

      {!effective.matrix && (
        <>
          <Question q="באיזה סדר?">
            {([["created", "החדשים קודם"], ["due", "תאריך יעד"], ["when", "מתי"], ["title", "שם"]] as [ViewSpec["sort"], string][])
              .filter(([k]) => k === "created" || k === "title" || fits(k)).map(([k, l]) => (
              <Opt key={k} on={effective.sort === k} onClick={() => set({ sort: k })}>{l}</Opt>
            ))}
          </Question>
          <Question q="לחלק לקבוצות?">
            {groupOptions.map((g) => <Opt key={g.key ?? "none"} on={spec.group === g.key} onClick={() => set({ group: g.key })}>{g.label}</Opt>)}
          </Question>
        </>
      )}

      <section className="grid gap-1">
        <div className="flex items-baseline gap-2">
          <h2 className="display text-[20px]">ייכנסו {preview.length} פריטים</h2>
        </div>
        <p className="text-[14px] text-muted">{describeView(config, { types, properties, itemsById, fields })}</p>
        <div className="pt-1">
          {preview.slice(0, 5).map((i) => <div key={i.id} className="border-b border-line py-2 text-[15px]">{i.title}</div>)}
          {preview.length > 5 && <div className="py-2 text-[14px] text-faint">ועוד {preview.length - 5}</div>}
        </div>
      </section>

      {confirmDelete && existing && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-danger-soft px-4 py-3">
          <span className="flex-1 text-[15px]">למחוק את התצוגה? הפריטים עצמם לא יימחקו.</span>
          <Opt onClick={() => setConfirmDelete(false)}>ביטול</Opt>
          <button type="button" onClick={() => { deleteView(existing.id); home(); }} className="rounded-full bg-danger px-3.5 py-1.5 text-[14px] font-medium text-white">מחק</button>
        </div>
      )}
      <div className="flex items-center gap-2">
        <button type="button" onClick={save} className="rounded-full bg-ink px-6 py-2.5 text-[16px] font-medium text-canvas">שמור תצוגה</button>
        <button type="button" onClick={back} className="rounded-full bg-surface px-5 py-2.5 text-[15px] font-medium">ביטול</button>
        <div className="flex-1" />
        {existing && (
          <button type="button" onClick={() => setConfirmDelete(true)} aria-label="מחק תצוגה" className="rounded-full p-2.5 text-danger hover:bg-danger-soft"><Trash2 size={18} /></button>
        )}
      </div>
    </Screen>
  );
}
