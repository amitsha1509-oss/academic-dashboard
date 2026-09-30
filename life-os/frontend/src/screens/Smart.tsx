// Screens the app maintains by itself: Today, Inbox, Missed, and the Tasks matrix.
import { useState } from "react";
import { ParentPicker } from "../components/FieldEditor";
import { Chip, EmptyNote, EmptyState, Row, Screen } from "../components/kit";
import { AddSheet } from "../components/AddPanel";
import { MenuItem, Popover, Section, StatusCheck } from "../components/ui";
import { addDays, formatLongDate, formatWhen, todayISO } from "../lib/dates";
import { useServerData, useStore } from "../lib/store";
import type { Item, MissedData, Occurrence, ScheduleEntry, TodayData } from "../lib/types";

function pick(ids: string[], byId: Map<string, Item>): Item[] {
  return ids.map((id) => byId.get(id)).filter((i): i is Item => !!i);
}

function PostponeChip({ item }: { item: Item }) {
  const { updateItem } = useStore();
  const tomorrow = addDays(todayISO(), 1);
  return (
    <Chip onClick={() => updateItem(item.id, item.due_at
      ? { due_at: tomorrow + item.due_at.slice(10) }
      : { when_at: tomorrow + (item.when_at?.slice(10) ?? "") })}>
      למחר
    </Chip>
  );
}

function ScheduleRow({ entry }: { entry: ScheduleEntry }) {
  const { itemsById, markOccurrence, updateItem } = useStore();
  const item = itemsById.get(entry.item_id);
  if (!item) return null;
  const done = entry.status === "done";
  const toggle = () => entry.kind === "occurrence"
    ? markOccurrence(item.id, entry.date, done ? null : "done")
    : updateItem(item.id, { status: done ? "open" : "done" });
  return (
    <Row item={done ? { ...item, status: "done" } : item} hideRepeat
      lead={<span className="w-12 shrink-0 pt-0.5 text-[15px] font-semibold tabular-nums">{entry.time ?? "—"}</span>}
      actions={<StatusCheck done={done} onToggle={toggle} />} />
  );
}

export function TodayScreen() {
  const { itemsById } = useStore();
  const today = todayISO();
  const t = useServerData<TodayData>(`/smart/today?day=${today}`);
  const [adding, setAdding] = useState(false);
  if (!t) return <Screen title="היום" add={{ type_id: "task", when: "today" }}>{null}</Screen>;
  const overdue = pick(t.overdue, itemsById);
  const returned = pick(t.returned, itemsById);
  const nothing = !t.schedule.length && !overdue.length && !t.due_today.length && !returned.length && !t.upcoming.length;
  if (nothing) {
    return (
      <Screen title="היום" subtitle={formatLongDate(today)} add={{ type_id: "task", when: "today" }}>
        <EmptyState title="היום פנוי" action={{ label: "להוסיף משהו להיום", onClick: () => setAdding(true) }}
          text="כאן מופיע כל מה שקשור להיום: הרצאות ואימונים שחוזרים, משימות שצריך לסיים, ומה שבאיחור. זה מתמלא לבד מדברים שיש להם תאריך." />
        <AddSheet open={adding} onClose={() => setAdding(false)} defaults={{ type_id: "task", when: "today" }} />
      </Screen>
    );
  }
  return (
    <Screen title="היום" subtitle={formatLongDate(today)} add={{ type_id: "task", when: "today" }}>
      {!t.schedule.length && !overdue.length && !t.due_today.length && (
        <EmptyNote>להיום אין כלום מתוזמן. הנה מה שמגיע בהמשך.</EmptyNote>
      )}
      {t.schedule.length > 0 && (
        <Section title="לוח זמנים" count={t.schedule.length}>
          {t.schedule.map((e) => <ScheduleRow key={`${e.item_id}-${e.date}`} entry={e} />)}
        </Section>
      )}
      {overdue.length > 0 && (
        <Section title="באיחור" tone="danger" count={overdue.length}>
          {overdue.map((i) => <Row key={i.id} item={i} actions={<PostponeChip item={i} />} />)}
        </Section>
      )}
      {t.due_today.length > 0 && (
        <Section title="להיום" count={t.due_today.length}>
          {pick(t.due_today, itemsById).map((i) => <Row key={i.id} item={i} />)}
        </Section>
      )}
      {returned.length > 0 && (
        <Section title="חזרו מדחייה" count={returned.length}>
          {returned.map((i) => <Row key={i.id} item={i} />)}
        </Section>
      )}
      {t.upcoming.length > 0 && (
        <Section title="השבוע הקרוב" count={t.upcoming.length}>
          {t.upcoming.map((u) => {
            const i = itemsById.get(u.item_id);
            return i ? <Row key={i.id} item={i} /> : null;
          })}
        </Section>
      )}
    </Screen>
  );
}

const QUICK_TYPES = ["task", "idea", "note", "event"];

function InboxEntry({ item }: { item: Item }) {
  const { types, updateItem } = useStore();
  const quick = QUICK_TYPES.map((id) => types.find((t) => t.id === id && !t.archived)).filter(Boolean);
  return (
    <Row item={item} hideType
      actions={<Chip primary onClick={() => updateItem(item.id, { inbox: false })}>סודר</Chip>}
      below={<>
        {quick.map((t) => (
          <Chip key={t!.id} active={item.type_id === t!.id} onClick={() => updateItem(item.id, { type_id: t!.id })}>{t!.name}</Chip>
        ))}
        <ParentPicker item={item} compact onPick={(id) => updateItem(item.id, { parent_id: id })} />
        <span className="text-[13px] text-faint">נרשם {formatWhen(item.created_at.slice(0, 10))}</span>
      </>} />
  );
}

export function InboxScreen() {
  const { items, bulkUpdate } = useStore();
  const inbox = items.filter((i) => i.inbox && i.status === "open").sort((a, b) => b.created_at.localeCompare(a.created_at));
  return (
    <Screen title="תיבת קליטה" subtitle="כל מה שרשמת בשורה אחת. בוחרים סוג או לאן זה שייך, והפריט יוצא מכאן לבד."
      actions={inbox.length > 1 ? <Chip onClick={() => bulkUpdate(inbox.map((i) => i.id), { inbox: false })}>סמן הכל כסודר</Chip> : undefined}>
      <Section title="ממתין לסידור" count={inbox.length}>
        {inbox.length ? inbox.map((i) => <InboxEntry key={i.id} item={i} />)
          : <EmptyNote>התיבה ריקה. מה שתרשום בעמוד הראשי יגיע לכאן.</EmptyNote>}
      </Section>
    </Screen>
  );
}

function MissedOccurrences({ item, occurrences }: { item: Item; occurrences: Occurrence[] }) {
  const { markOccurrence } = useStore();
  const [all, setAll] = useState(false);
  const shown = all ? occurrences : occurrences.slice(0, 3);
  return (
    <Row item={item} extra={`${occurrences.length} לא סומנו`} below={<>
      {shown.map((o) => (
        <div key={o.date} className="flex w-full items-center gap-1.5">
          <span className="flex-1 text-[15px] font-medium tabular-nums">{formatWhen(o.date)}{o.time ? `, ${o.time}` : ""}</span>
          <Chip primary onClick={() => markOccurrence(item.id, o.date, "done")}>הייתי / צפיתי</Chip>
          <Chip onClick={() => markOccurrence(item.id, o.date, "skipped")}>דלג</Chip>
        </div>
      ))}
      {occurrences.length > 3 && (
        <button type="button" onClick={() => setAll(!all)} className="text-[13.5px] font-medium text-muted hover:text-ink">
          {all ? "הצג פחות" : `ועוד ${occurrences.length - 3}`}
        </button>
      )}
    </>} />
  );
}

export function MissedScreen() {
  const { itemsById, updateItem } = useStore();
  const m = useServerData<MissedData>(`/smart/missed?day=${todayISO()}`);
  if (!m) return <Screen title="פספוסים" add={false}>{null}</Screen>;
  const groups = new Map<string, Occurrence[]>();
  for (const o of m.occurrences) groups.set(o.item_id, [...(groups.get(o.item_id) ?? []), o]);
  const total = m.occurrences.length + m.overdue.length + m.past_unmarked.length + m.postponed.length + m.stale_inbox.length;
  return (
    <Screen title="פספוסים" add={false} subtitle="מתעדכן לבד. מספיק לעבור על זה פעם בשבוע.">
      {total === 0 && <EmptyNote>שום דבר לא נשכח.</EmptyNote>}
      {groups.size > 0 && (
        <Section title="לא סומנו" count={m.occurrences.length} sub="הרצאות, אימונים וכל מה שחוזר">
          {[...groups.entries()].map(([id, occs]) => {
            const item = itemsById.get(id);
            return item ? <MissedOccurrences key={id} item={item} occurrences={occs} /> : null;
          })}
        </Section>
      )}
      {m.overdue.length > 0 && (
        <Section title="באיחור" tone="danger" count={m.overdue.length}>
          {pick(m.overdue, itemsById).map((i) => <Row key={i.id} item={i} actions={<PostponeChip item={i} />} />)}
        </Section>
      )}
      {m.past_unmarked.length > 0 && (
        <Section title="עבר ולא סומן" count={m.past_unmarked.length}>
          {pick(m.past_unmarked, itemsById).map((i) => (
            <Row key={i.id} item={i} actions={<Chip onClick={() => updateItem(i.id, { status: "dropped" })}>לא רלוונטי</Chip>} />
          ))}
        </Section>
      )}
      {m.postponed.length > 0 && (
        <Section title="נדחה שוב ושוב" count={m.postponed.length}>
          {pick(m.postponed, itemsById).map((i) => <Row key={i.id} item={i} extra={`נדחה ${i.postpone_count} פעמים`} />)}
        </Section>
      )}
      {m.stale_inbox.length > 0 && (
        <Section title="מחכה בתיבת הקליטה" count={m.stale_inbox.length} sub="יותר מ־3 ימים">
          {pick(m.stale_inbox, itemsById).map((i) => <Row key={i.id} item={i} />)}
        </Section>
      )}
    </Screen>
  );
}

const QUADRANTS = [
  { imp: "high", urg: "high", title: "לעשות עכשיו", sub: "חשוב ודחוף" },
  { imp: "high", urg: "low", title: "לתכנן", sub: "חשוב, לא דחוף" },
  { imp: "low", urg: "high", title: "לקצר או להעביר", sub: "דחוף, לא חשוב" },
  { imp: "low", urg: "low", title: "לוותר", sub: "לא חשוב ולא דחוף" },
] as const;

function ClassifyChip({ item }: { item: Item }) {
  const { updateItem } = useStore();
  return (
    <Popover width={240} trigger={({ toggle }) => <Chip onClick={toggle}>סווג</Chip>}>
      {(close) => QUADRANTS.map((q) => (
        <MenuItem key={q.title} onClick={() => { updateItem(item.id, { props: { importance: q.imp, urgency: q.urg } }); close(); }}>
          <span className="font-medium">{q.title}</span> <span className="text-muted">· {q.sub}</span>
        </MenuItem>
      ))}
    </Popover>
  );
}

export function TasksScreen() {
  const { items, properties } = useStore();
  const [adding, setAdding] = useState(false);
  const tasks = items
    .filter((i) => i.type_id === "task" && i.status === "open" && !i.repeat)
    .sort((a, b) => (a.due_at ?? "9999").localeCompare(b.due_at ?? "9999"));
  const hasMatrix = ["importance", "urgency"].every((id) => properties.some((p) => p.id === id && !p.archived));
  if (!hasMatrix) {
    return (
      <Screen title="משימות" subtitle="כל המשימות הפתוחות." add={{ type_id: "task" }}>
        <Section title="פתוחות" count={tasks.length}>
          {tasks.length ? tasks.map((i) => <Row key={i.id} item={i} hideType />) : <EmptyNote>אין משימות פתוחות.</EmptyNote>}
        </Section>
      </Screen>
    );
  }
  const unsorted = tasks.filter((i) => !i.props.importance || !i.props.urgency);
  if (!tasks.length) {
    return (
      <Screen title="משימות" add={{ type_id: "task" }}>
        <EmptyState title="אין משימות פתוחות" action={{ label: "להוסיף משימה", onClick: () => setAdding(true) }}
          text="כאן רואים את המשימות שלך מחולקות לארבע: מה לעשות עכשיו, מה לתכנן, מה לקצר ומה אפשר לוותר. מסמנים לכל משימה אם היא חשובה ואם היא דחופה." />
        <AddSheet open={adding} onClose={() => setAdding(false)} defaults={{ type_id: "task" }} />
      </Screen>
    );
  }
  return (
    <Screen title="משימות" subtitle="רק משימות פתוחות, לפי חשיבות ודחיפות. קורסים, נושאים והרצאות לא מופיעים כאן." add={{ type_id: "task" }}>
      {QUADRANTS.map((q) => {
        const list = tasks.filter((i) => i.props.importance === q.imp && i.props.urgency === q.urg);
        return (
          <Section key={q.title} title={q.title} sub={q.sub} count={list.length}>
            {list.length ? list.map((i) => <Row key={i.id} item={i} hideType />) : <EmptyNote>ריק.</EmptyNote>}
          </Section>
        );
      })}
      {unsorted.length > 0 && (
        <Section title="עוד לא סווג" count={unsorted.length} sub="חסרה חשיבות או דחיפות">
          {unsorted.map((i) => <Row key={i.id} item={i} hideType actions={<ClassifyChip item={i} />} />)}
        </Section>
      )}
    </Screen>
  );
}
