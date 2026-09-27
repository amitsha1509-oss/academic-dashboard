// The pages that maintain themselves: computed from items + repeat rules, no manual upkeep.
import { AlarmClock, Check, ChevronLeft, ChevronRight, SkipForward } from "lucide-react";
import { useState } from "react";
import { TypePicker, ParentPicker } from "../components/FieldEditor";
import { ItemMeta, ItemRow, TypeIcon } from "../components/ItemRow";
import { Button, Empty, IconButton, PageHeader, Section, StatusCheck } from "../components/ui";
import { addDays, formatLongDate, formatWhen, parseDate, todayISO, weekStart, WEEKDAYS } from "../lib/dates";
import { navigate, openItem } from "../lib/router";
import { useServerData, useStore } from "../lib/store";
import type { Item, MissedData, Occurrence, ScheduleEntry, TodayData } from "../lib/types";

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "לילה טוב" : h < 12 ? "בוקר טוב" : h < 17 ? "צהריים טובים" : h < 21 ? "ערב טוב" : "לילה טוב";
}

/** A row for one occurrence of a repeating item, or a dated one-off item, with its time. */
function ScheduleRow({ entry, showDate }: { entry: ScheduleEntry | (Occurrence & { kind?: "occurrence" }); showDate?: boolean }) {
  const { itemsById, markOccurrence, updateItem } = useStore();
  const item = itemsById.get(entry.item_id);
  if (!item) return null;
  const isOcc = entry.kind !== "item";
  const done = entry.status === "done";
  const skipped = entry.status === "skipped";
  const toggle = () =>
    isOcc ? markOccurrence(item.id, entry.date, done ? null : "done") : updateItem(item.id, { status: done ? "open" : "done" });
  return (
    <div role="button" tabIndex={0} onClick={() => openItem(item.id)}
      className="group flex min-h-11 cursor-pointer items-start gap-2.5 rounded-md px-2 py-2 hover:bg-hover">
      <span className="w-12 shrink-0 pt-px text-sm text-muted tabular-nums">
        {showDate ? formatWhen(entry.date) : entry.time ?? "—"}
      </span>
      <span className="mt-[3px]"><StatusCheck done={done} onToggle={toggle} /></span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <TypeIcon item={item} />
          <span className={`truncate ${done || skipped ? "text-faint line-through" : ""}`}>{item.title}</span>
          {entry.end_time && <span className="text-xs text-faint">עד {entry.end_time}</span>}
        </div>
        <ItemMeta item={item} />
      </div>
      {isOcc && (
        <div className="flex shrink-0 items-center" onClick={(e) => e.stopPropagation()}>
          <IconButton label={skipped ? "בטל דילוג" : "דלג"} className={skipped ? "text-accent" : "md:opacity-0 md:group-hover:opacity-100"}
            onClick={() => markOccurrence(item.id, entry.date, skipped ? null : "skipped")}>
            <SkipForward size={14} />
          </IconButton>
        </div>
      )}
    </div>
  );
}

function ids(list: string[], byId: Map<string, Item>): Item[] {
  return list.map((i) => byId.get(i)).filter((i): i is Item => !!i);
}

export function TodayPage() {
  const { itemsById, items } = useStore();
  const today = todayISO();
  const data = useServerData<TodayData>(`/smart/today?day=${today}`);
  const missed = useServerData<MissedData>(`/smart/missed?day=${today}`);
  const inboxCount = items.filter((i) => i.inbox && i.status === "open").length;
  const missedCount = missed ? missed.occurrences.length + missed.overdue.length + missed.past_unmarked.length : 0;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={greeting()} subtitle={formatLongDate(today)} />

      {(inboxCount > 0 || missedCount > 0) && (
        <div className="mb-6 flex flex-wrap gap-2">
          {inboxCount > 0 && (
            <button type="button" onClick={() => navigate("/inbox")} className="rounded-full border border-line px-3 py-1 text-sm hover:bg-hover">
              📥 {inboxCount} ממתינים למיון
            </button>
          )}
          {missedCount > 0 && (
            <button type="button" onClick={() => navigate("/missed")} className="rounded-full border border-line px-3 py-1 text-sm hover:bg-hover">
              ⚠️ {missedCount} פספוסים
            </button>
          )}
        </div>
      )}

      {!data ? <Empty>טוען…</Empty> : (
        <>
          <Section title="לוח הזמנים של היום" count={data.schedule.length}>
            {data.schedule.length ? data.schedule.map((e) => <ScheduleRow key={`${e.item_id}-${e.date}`} entry={e} />)
              : <Empty>אין שום דבר מתוזמן להיום.</Empty>}
          </Section>

          {data.overdue.length > 0 && (
            <Section title="באיחור" count={data.overdue.length} tone="danger">
              {ids(data.overdue, itemsById).map((i) => <ItemRow key={i.id} item={i} actions={<PostponeButton item={i} />} />)}
            </Section>
          )}

          <Section title="להיום" count={data.due_today.length}>
            {data.due_today.length ? ids(data.due_today, itemsById).map((i) => <ItemRow key={i.id} item={i} actions={<PostponeButton item={i} />} />)
              : <Empty>אין משימות עם יעד להיום.</Empty>}
          </Section>

          {data.returned.length > 0 && (
            <Section title="חזרו מדחייה" count={data.returned.length}>
              {ids(data.returned, itemsById).map((i) => <ItemRow key={i.id} item={i} actions={<ClearSnooze item={i} />} />)}
            </Section>
          )}

          <Section title="בשבוע הקרוב" count={data.upcoming.length}>
            {data.upcoming.length ? data.upcoming.map((u) => {
              const i = itemsById.get(u.item_id);
              return i ? <ItemRow key={i.id} item={i} /> : null;
            }) : <Empty>שבוע פנוי.</Empty>}
          </Section>
        </>
      )}
    </div>
  );
}

function PostponeButton({ item }: { item: Item }) {
  const { updateItem } = useStore();
  const tomorrow = addDays(todayISO(), 1);
  const postpone = () => {
    const patch = item.due_at ? { due_at: tomorrow + (item.due_at.slice(10) || "") } : { when_at: tomorrow + (item.when_at?.slice(10) || "") };
    updateItem(item.id, patch);
  };
  return <IconButton label="דחה למחר" className="md:opacity-0 md:group-hover:opacity-100" onClick={postpone}><AlarmClock size={15} /></IconButton>;
}

function ClearSnooze({ item }: { item: Item }) {
  const { updateItem } = useStore();
  return <Button className="h-7 text-xs" onClick={() => updateItem(item.id, { snooze_until: null })}>ראיתי</Button>;
}

export function InboxPage() {
  const { items, updateItem, bulkUpdate } = useStore();
  const inbox = items.filter((i) => i.inbox && i.status === "open").sort((a, b) => b.created_at.localeCompare(a.created_at));
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader icon="📥" title="תיבת קליטה"
        subtitle="כל מה שנרשם במהירות. תן סוג, שייך לפריט, או פשוט סמן כממוין — מתי שנוח."
        actions={inbox.length > 1 ? <Button variant="outline" onClick={() => bulkUpdate(inbox.map((i) => i.id), { inbox: false })}>סמן הכל כממוין</Button> : undefined} />
      {inbox.length === 0 ? (
        <div className="py-16 text-center text-muted">
          <div className="mb-2 text-4xl">✨</div>
          התיבה ריקה. כל מה שתרשום בשורת הקליטה יגיע לכאן.
        </div>
      ) : inbox.map((i) => (
        <div key={i.id} className="border-b border-line py-1 last:border-0">
          <ItemRow item={i} actions={
            <Button className="h-7 text-xs" onClick={() => updateItem(i.id, { inbox: false })}><Check size={13} /> ממוין</Button>
          } />
          <div className="flex flex-wrap items-center gap-1 ps-9 pb-1.5 text-sm">
            <TypePicker item={i} compact />
            <ParentPicker item={i} compact onPick={(id) => updateItem(i.id, { parent_id: id })} />
            <span className="text-xs text-faint">· {formatWhen(i.created_at.slice(0, 10))}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function MissedPage() {
  const { itemsById, updateItem } = useStore();
  const today = todayISO();
  const data = useServerData<MissedData>(`/smart/missed?day=${today}`);
  if (!data) return <Empty>טוען…</Empty>;
  const total = data.occurrences.length + data.overdue.length + data.past_unmarked.length + data.postponed.length + data.stale_inbox.length;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader icon="🔍" title="פספוסים ודחיות" subtitle="כל מה שעלול ליפול בין הכיסאות — מתעדכן לבד." />
      {total === 0 && (
        <div className="py-16 text-center text-muted"><div className="mb-2 text-4xl">🎉</div>שום דבר לא נשכח. כל הכבוד.</div>
      )}

      {data.occurrences.length > 0 && (
        <Section title="מופעים שלא סומנו (הרצאות, אימונים…)" count={data.occurrences.length}>
          {groupByItem(data.occurrences).map(([itemId, occs]) => {
            const item = itemsById.get(itemId);
            return item ? <MissedOccurrences key={itemId} item={item} occurrences={occs} /> : null;
          })}
        </Section>
      )}

      {data.overdue.length > 0 && (
        <Section title="עבר תאריך היעד" count={data.overdue.length} tone="danger">
          {ids(data.overdue, itemsById).map((i) => <ItemRow key={i.id} item={i} actions={<PostponeButton item={i} />} />)}
        </Section>
      )}

      {data.past_unmarked.length > 0 && (
        <Section title="עבר ולא סומן" count={data.past_unmarked.length}>
          {ids(data.past_unmarked, itemsById).map((i) => (
            <ItemRow key={i.id} item={i} actions={<Button className="h-7 text-xs" onClick={() => updateItem(i.id, { status: "dropped" })}>לא רלוונטי</Button>} />
          ))}
        </Section>
      )}

      {data.postponed.length > 0 && (
        <Section title="נדחה שוב ושוב" count={data.postponed.length}>
          {ids(data.postponed, itemsById).map((i) => (
            <ItemRow key={i.id} item={i} actions={<span className="text-xs text-faint">נדחה {i.postpone_count} פעמים</span>} />
          ))}
        </Section>
      )}

      {data.stale_inbox.length > 0 && (
        <Section title="ממתין בתיבת הקליטה יותר מ-3 ימים" count={data.stale_inbox.length}>
          {ids(data.stale_inbox, itemsById).map((i) => <ItemRow key={i.id} item={i} />)}
        </Section>
      )}
    </div>
  );
}

function groupByItem(occs: Occurrence[]): [string, Occurrence[]][] {
  const m = new Map<string, Occurrence[]>();
  for (const o of occs) m.set(o.item_id, [...(m.get(o.item_id) ?? []), o]);
  return [...m.entries()];
}

/** One repeating item with its unmarked past dates, newest first. */
function MissedOccurrences({ item, occurrences }: { item: Item; occurrences: Occurrence[] }) {
  const { markOccurrence } = useStore();
  const [all, setAll] = useState(false);
  const today = todayISO();
  const shown = all ? occurrences : occurrences.slice(0, 3);
  return (
    <div className="border-b border-line py-2 last:border-0">
      <div role="button" tabIndex={0} onClick={() => openItem(item.id)} className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1 hover:bg-hover">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5"><TypeIcon item={item} /><span className="truncate font-medium">{item.title}</span></div>
          <ItemMeta item={item} />
        </div>
        <span className="shrink-0 rounded-full bg-hover px-2 text-xs leading-5 text-muted">{occurrences.length}</span>
      </div>
      {shown.map((o) => (
        <div key={o.date} className="flex min-h-9 items-center gap-1 ps-9 pe-2 text-sm">
          <span className="flex-1 text-muted">{formatWhen(o.date, today)}{o.time ? `, ${o.time}` : ""}</span>
          <Button className="h-7 px-2 text-xs" onClick={() => markOccurrence(item.id, o.date, "done")}><Check size={13} /> בוצע</Button>
          <Button className="h-7 px-2 text-xs" onClick={() => markOccurrence(item.id, o.date, "skipped")}><SkipForward size={13} /> דלג</Button>
        </div>
      ))}
      {occurrences.length > 3 && (
        <button type="button" onClick={() => setAll(!all)} className="ps-9 text-xs text-faint hover:text-muted">
          {all ? "הצג פחות" : `ועוד ${occurrences.length - 3}…`}
        </button>
      )}
    </div>
  );
}

export function WeekPage() {
  const { items } = useStore();
  const [start, setStart] = useState(() => weekStart(todayISO()));
  const end = addDays(start, 6);
  const today = todayISO();
  const occ = useServerData<Occurrence[]>(`/occurrences?frm=${start}&to=${end}`);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));

  const entriesFor = (day: string): ScheduleEntry[] => {
    const list: ScheduleEntry[] = (occ ?? []).filter((o) => o.date === day).map((o) => ({ ...o, kind: "occurrence" }));
    for (const i of items) {
      if (i.status === "dropped" || i.repeat) continue;
      const when = i.when_at?.slice(0, 10) === day;
      const due = i.due_at?.slice(0, 10) === day;
      if (when || due) {
        const at = when ? i.when_at! : i.due_at!;
        list.push({ kind: "item", item_id: i.id, date: day, time: at.slice(11, 16) || null, end_time: null, status: i.status === "done" ? "done" : "open" });
      }
    }
    return list.sort((a, b) => (a.time ?? "99").localeCompare(b.time ?? "99"));
  };
  const s = parseDate(start), e = parseDate(end);

  return (
    <div>
      <PageHeader icon="🗓️" title="השבוע"
        subtitle={`${s.getDate()}.${s.getMonth() + 1} – ${e.getDate()}.${e.getMonth() + 1}`}
        actions={
          <>
            <IconButton label="שבוע קודם" onClick={() => setStart(addDays(start, -7))}><ChevronRight size={18} /></IconButton>
            <Button variant="outline" className="h-7" onClick={() => setStart(weekStart(today))}>היום</Button>
            <IconButton label="שבוע הבא" onClick={() => setStart(addDays(start, 7))}><ChevronLeft size={18} /></IconButton>
          </>
        } />
      <div className="grid gap-4 lg:grid-cols-7 lg:gap-2">
        {days.map((d) => {
          const entries = entriesFor(d);
          const isToday = d === today;
          return (
            <div key={d} className={`min-w-0 rounded-lg lg:min-h-64 lg:border lg:border-line lg:p-1.5 ${isToday ? "lg:bg-hover" : ""}`}>
              <div className={`mb-1 flex items-baseline gap-2 border-b border-line px-1 pb-1 lg:border-0 ${isToday ? "text-accent" : "text-muted"}`}>
                <span className="text-sm font-semibold">{WEEKDAYS[parseDate(d).getDay()]}</span>
                <span className="text-xs">{parseDate(d).getDate()}</span>
              </div>
              {entries.length ? entries.map((en) => <WeekEntry key={`${en.item_id}-${en.date}`} entry={en} />) : <div className="px-1 py-1 text-xs text-faint lg:hidden">—</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekEntry({ entry }: { entry: ScheduleEntry }) {
  const { itemsById, types } = useStore();
  const item = itemsById.get(entry.item_id);
  if (!item) return null;
  const t = types.find((t) => t.id === item.type_id);
  const done = entry.status !== "open";
  return (
    <button type="button" onClick={() => openItem(item.id)}
      className="mb-1 flex w-full items-start gap-1.5 rounded-md px-1.5 py-1 text-start text-sm hover:bg-active"
      style={{ borderInlineStart: `3px solid var(--tag-${t?.color ?? "gray"}-bg)` }}>
      {entry.time && <span className="shrink-0 text-xs text-muted tabular-nums">{entry.time}</span>}
      <span className={`min-w-0 flex-1 leading-snug break-words ${done ? "text-faint line-through" : ""}`}>{t?.icon} {item.title}</span>
    </button>
  );
}
