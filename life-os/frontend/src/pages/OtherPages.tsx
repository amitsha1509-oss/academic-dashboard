import { ChevronLeft, ChevronRight, Diamond } from "lucide-react";
import { useMemo, useState } from "react";
import { ItemRow } from "../components/ItemRow";
import { Button, Empty, IconButton, PageHeader, Section } from "../components/ui";
import { addDays, daysBetween, formatWhen, MONTHS_LONG, parseDate, toISODate, todayISO } from "../lib/dates";
import { openItem } from "../lib/router";
import { useStore } from "../lib/store";
import type { Item } from "../lib/types";

// ─── Timeline: the macro view ─────────────────────────────────────
export function TimelinePage() {
  const { items, types, properties } = useStore();
  const [offset, setOffset] = useState(0); // in months
  const MONTHS = 6;
  const today = todayISO();
  const t = parseDate(today);
  const start = toISODate(new Date(t.getFullYear(), t.getMonth() - 1 + offset, 1));
  const end = addDays(toISODate(new Date(t.getFullYear(), t.getMonth() - 1 + offset + MONTHS, 1)), -1);
  const total = daysBetween(start, end) + 1;
  const pos = (d: string) => Math.min(100, Math.max(0, (daysBetween(start, d) / total) * 100));

  const months = Array.from({ length: MONTHS }, (_, i) => {
    const d = new Date(t.getFullYear(), t.getMonth() - 1 + offset + i, 1);
    const days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    return { iso: toISODate(d), label: MONTHS_LONG[d.getMonth()], year: d.getFullYear(), days };
  });

  const spans = items
    .filter((i) => i.span_start && i.status !== "dropped" && i.span_start <= end && (i.span_end ?? i.span_start) >= start)
    .sort((a, b) => a.span_start!.localeCompare(b.span_start!));

  // Milestones: important one-off dated items (exams, deadlines) in the window.
  const importance = properties.find((p) => p.id === "importance");
  // Milestones are important *events* (exams, interviews), not every deadline.
  const milestones = items.filter((i) => {
    const d = i.when_at?.slice(0, 10);
    const important = importance ? i.props.importance === "high" : false;
    return d && !i.repeat && i.status !== "dropped" && d >= start && d <= end && (important || i.type_id === "exam");
  }).sort((a, b) => a.when_at!.localeCompare(b.when_at!));

  const typeOf = (i: Item) => types.find((x) => x.id === i.type_id);

  return (
    <div>
      <PageHeader icon="🧭" title="ציר זמן" subtitle="התמונה הגדולה: תקופות, קורסים, פרויקטים ואבני דרך."
        actions={
          <>
            <IconButton label="מוקדם יותר" onClick={() => setOffset(offset - 3)}><ChevronRight size={18} /></IconButton>
            <Button variant="outline" className="h-7" onClick={() => setOffset(0)}>עכשיו</Button>
            <IconButton label="מאוחר יותר" onClick={() => setOffset(offset + 3)}><ChevronLeft size={18} /></IconButton>
          </>
        } />
      <div className="scroll-thin -mx-4 overflow-x-auto px-4 md:-mx-10 md:px-10">
        <div className="relative min-w-[720px]">
          <div className="flex border-b border-line text-xs text-muted">
            {months.map((m) => (
              <div key={m.iso} className="border-s border-line px-2 py-1.5 first:border-s-0" style={{ width: `${(m.days / total) * 100}%` }}>
                {m.label} {m.year !== t.getFullYear() ? m.year : ""}
              </div>
            ))}
          </div>

          <div className="relative py-2">
            {today >= start && today <= end && (
              <div className="pointer-events-none absolute inset-y-0 z-10 w-px bg-danger" style={{ insetInlineStart: `${pos(today)}%` }} />
            )}
            {milestones.map((m) => {
              const d = m.when_at!.slice(0, 10);
              return (
                <div key={m.id} className="relative mb-1 h-7">
                  <button type="button" onClick={() => openItem(m.id)} title={formatWhen(d)}
                    className="absolute inset-y-0 flex items-center gap-1.5 rounded-md px-1 text-sm whitespace-nowrap hover:bg-hover"
                    style={{ insetInlineStart: `calc(${pos(d)}% - 0.6rem)` }}>
                    <Diamond size={13} fill="currentColor" className="shrink-0 text-danger" />
                    {m.title} <span className="text-xs text-faint">{formatWhen(d)}</span>
                  </button>
                </div>
              );
            })}
            {spans.map((s) => {
              const a = pos(s.span_start! < start ? start : s.span_start!);
              const b = pos((s.span_end ?? s.span_start!) > end ? end : addDays(s.span_end ?? s.span_start!, 1));
              const ty = typeOf(s);
              return (
                <div key={s.id} className="relative mb-1.5 h-8">
                  <button type="button" onClick={() => openItem(s.id)}
                    className="absolute inset-y-0 flex items-center overflow-hidden rounded-md px-2 text-sm whitespace-nowrap hover:brightness-95"
                    style={{ insetInlineStart: `${a}%`, width: `max(${b - a}%, 2rem)`, background: `var(--tag-${ty?.color ?? "gray"}-bg)`, color: `var(--tag-${ty?.color ?? "gray"}-fg)` }}>
                    {ty?.icon} {s.title}
                  </button>
                </div>
              );
            })}
            {!spans.length && !milestones.length && (
              <Empty>אין כאן עדיין כלום. תן לפריט „תקופה” (למשל סמסטר, קורס, תקופת מבחנים) והוא יופיע כאן.</Empty>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Search ───────────────────────────────────────────────────────
export function SearchPage() {
  const { items, properties } = useStore();
  const [q, setQ] = useState("");
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    const labelOf = (i: Item) =>
      properties.flatMap((p) => {
        const v = i.props[p.id];
        if (p.type === "choice") return p.options.filter((o) => o.id === v).map((o) => o.label);
        if (p.type === "multi") return p.options.filter((o) => (v as string[] | undefined)?.includes(o.id)).map((o) => o.label);
        return v !== undefined ? [String(v)] : [];
      }).join(" ");
    return items
      .map((i) => {
        const inTitle = i.title.toLowerCase().includes(s);
        const hay = `${i.notes} ${i.links.map((l) => `${l.title} ${l.url}`).join(" ")} ${labelOf(i)}`.toLowerCase();
        return { i, score: inTitle ? 2 : hay.includes(s) ? 1 : 0 };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score || (a.i.status === "open" ? -1 : 1))
      .slice(0, 100)
      .map((r) => r.i);
  }, [q, items, properties]);

  return (
    <div className="mx-auto max-w-3xl">
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="חפש בכל מקום — כותרות, הערות, קישורים, תגיות…"
        className="mb-6 w-full border-b border-line bg-transparent py-3 text-xl outline-none placeholder:text-faint focus:border-accent" />
      {q && !results.length && <Empty>לא נמצא כלום.</Empty>}
      {results.map((i) => <ItemRow key={i.id} item={i} />)}
      {!q && (
        <Section title="נוצרו לאחרונה">
          {[...items].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 10).map((i) => <ItemRow key={i.id} item={i} />)}
        </Section>
      )}
    </div>
  );
}
