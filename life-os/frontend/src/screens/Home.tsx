import { CalendarRange, CircleAlert, Folder, GraduationCap, Inbox, Layers, ListChecks, Search, Settings, Sun, type LucideIcon } from "lucide-react";
import { AddPanel } from "../components/AddPanel";
import { useAreas } from "../lib/areas";
import { daysBetween, formatLongDate, formatWhen, todayISO } from "../lib/dates";
import { openItem, useNav, type ScreenName } from "../lib/nav";
import { useServerData, useStore } from "../lib/store";
import type { Item, MissedData, TodayData } from "../lib/types";

export function missedTotal(m: MissedData | null) {
  return m ? m.occurrences.length + m.overdue.length + m.past_unmarked.length : 0;
}

function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** The single most relevant thing right now: the next scheduled thing today, else the nearest deadline. */
function useNextUp(today: TodayData | null): { item: Item; label: string } | null {
  const { itemsById } = useStore();
  if (!today) return null;
  const now = nowHHMM();
  const sched = today.schedule.find((e) => e.status === "open" && (!e.time || e.time >= now) && itemsById.has(e.item_id));
  if (sched) return { item: itemsById.get(sched.item_id)!, label: sched.time ? `היום ב־${sched.time}` : "היום" };
  const late = today.overdue.map((id) => itemsById.get(id)).find(Boolean);
  if (late) return { item: late, label: `באיחור · היה עד ${formatWhen(late.due_at)}` };
  const due = today.due_today.map((id) => itemsById.get(id)).find(Boolean);
  if (due) return { item: due, label: "עד היום" };
  const soon = today.upcoming.find((u) => itemsById.has(u.item_id));
  if (soon) return { item: itemsById.get(soon.item_id)!, label: formatWhen(soon.date) };
  return null;
}

function Tile({ to, icon: Icon, name, count, hint, warn }: {
  to: ScreenName; icon: LucideIcon; name: string; count?: string | number; hint: string; warn?: boolean;
}) {
  const { push } = useNav();
  return (
    <button type="button" onClick={() => push({ name: to })}
      className="grid content-start gap-2.5 rounded-[20px] bg-surface p-4 pb-[18px] text-start transition-transform hover:bg-active active:scale-[0.97]">
      <span className="flex items-center justify-between">
        <Icon size={23} strokeWidth={1.75} />
        {count !== undefined && count !== 0 && (
          <span className={`display text-[32px] leading-none tabular-nums ${warn ? "text-danger" : ""}`}>{count}</span>
        )}
      </span>
      <span className="display text-[17px] font-bold">{name}</span>
      <span className="-mt-1.5 text-[13px] leading-snug text-muted">{hint}</span>
    </button>
  );
}

export function HomeScreen() {
  const { items, views } = useStore();
  const { tileOn } = useAreas();
  const { push } = useNav();
  const today = todayISO();
  const t = useServerData<TodayData>(`/smart/today?day=${today}`);
  const m = useServerData<MissedData>(`/smart/missed?day=${today}`);
  const next = useNextUp(t);

  const live = items.filter((i) => i.status !== "dropped");
  const byType = (id: string) => live.filter((i) => i.type_id === id);
  const inbox = live.filter((i) => i.inbox && i.status === "open");
  const tasks = byType("task").filter((i) => i.status === "open");
  const topics = byType("topic");
  const courses = byType("course").filter((c) => !c.span_end || c.span_end >= today);
  const todayCount = t ? t.schedule.filter((e) => e.status === "open").length + t.due_today.length + t.overdue.length : undefined;
  const missed = missedTotal(m);
  const nextExam = byType("exam").map((e) => e.when_at?.slice(0, 10)).filter((d): d is string => !!d && d >= today).sort()[0];
  const firstRun = items.length === 0;

  return (
    <div className="mx-auto grid max-w-[720px] gap-7 px-5 pb-16">
      <header className="pt-safe grid gap-1">
        <div className="flex items-center justify-end gap-1 pt-3">
          <button type="button" aria-label="חיפוש" onClick={() => push({ name: "search" })} className="rounded-full p-2 text-muted hover:bg-hover hover:text-ink"><Search size={20} /></button>
          <button type="button" aria-label="הגדרות" onClick={() => push({ name: "settings" })} className="rounded-full p-2 text-muted hover:bg-hover hover:text-ink"><Settings size={20} /></button>
        </div>
        <span className="text-[15px] font-medium text-muted">{formatLongDate(today)}</span>
        <h1 className="display text-[48px] leading-none">המרכז</h1>
      </header>

      <AddPanel collapsible />

      {firstRun ? (
        <button type="button" onClick={() => push({ name: "guide" })}
          className="grid gap-1 rounded-[22px] bg-accent p-5 text-start text-white active:scale-[0.99]">
          <span className="text-[13px] font-medium opacity-80">ברוך הבא</span>
          <span className="display text-[25px]">מתחילים כאן: איך זה עובד</span>
          <span className="text-[14.5px] opacity-85">שתי דקות קריאה, ואז אפשר להתחיל לרשום.</span>
        </button>
      ) : next ? (
        <button type="button" onClick={() => openItem(next.item.id)}
          className="grid gap-1 rounded-[22px] bg-accent p-5 text-start text-white transition-transform active:scale-[0.99]">
          <span className="text-[13px] font-medium opacity-80">הדבר הבא · {next.label}</span>
          <span className="display text-[25px]">{next.item.title}</span>
          {next.item.parent_id && <ParentName id={next.item.parent_id} />}
        </button>
      ) : (
        <div className="grid gap-1 rounded-[22px] bg-surface p-5">
          <span className="text-[13px] font-medium text-muted">הדבר הבא</span>
          <span className="display text-[22px]">{inbox.length ? "שום דבר לא מתוזמן. זמן טוב לסדר את תיבת הקליטה." : "שום דבר לא מתוזמן כרגע."}</span>
        </div>
      )}

      <nav aria-label="אזורים" className="grid grid-cols-2 gap-2.5 max-sm:[&>*:last-child:nth-child(odd)]:col-span-2 sm:grid-cols-3 md:grid-cols-4">
        <Tile to="today" icon={Sun} name="היום" count={todayCount}
          hint={t?.schedule[0] ? `ראשון ב־${t.schedule[0].time ?? "היום"}` : todayCount ? "מה יש לך היום" : "אין כלום להיום"} />
        <Tile to="inbox" icon={Inbox} name="תיבת קליטה" count={inbox.length} hint={inbox.length ? "ממתינים לסידור" : "ריקה"} />
        <Tile to="missed" icon={CircleAlert} name="פספוסים" count={missed} warn={missed > 0} hint={missed ? "דברים שלא סומנו" : "שום דבר לא נשכח"} />
        {tileOn("tasks") && <Tile to="tasks" icon={ListChecks} name="משימות" count={tasks.length} hint={tasks.length ? "לפי חשיבות ודחיפות" : "עוד אין משימות"} />}
        {tileOn("topics") && <Tile to="topics" icon={Folder} name="נושאים" count={topics.length} hint={topics.slice(0, 3).map((x) => x.title).join(", ") || "למשל השקעות, בריאות"} />}
        {tileOn("studies") && <Tile to="studies" icon={GraduationCap} name="לימודים" count={courses.length} hint={courses.length ? "קורסים, הרצאות ומבחנים" : "עוד אין קורסים"} />}
        {tileOn("timeline") && <Tile to="timeline" icon={CalendarRange} name="ציר זמן" count={nextExam ? daysBetween(today, nextExam) : undefined}
          hint={nextExam ? "ימים למבחן הקרוב" : "התמונה הגדולה"} />}
        {tileOn("views") && <Tile to="views" icon={Layers} name="רשימות משלי" count={views.length} hint={views.slice(0, 2).map((v) => v.name).join(", ") || "רשימות שאתה מרכיב"} />}
      </nav>
      <div className="-mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[14px] font-medium text-muted">
        <button type="button" onClick={() => push({ name: "settings" })} className="underline-offset-4 hover:text-ink hover:underline">לשנות מה מופיע כאן</button>
        <button type="button" onClick={() => push({ name: "guide" })} className="underline-offset-4 hover:text-ink hover:underline">איך זה עובד?</button>
      </div>
    </div>
  );
}

function ParentName({ id }: { id: string }) {
  const { itemsById } = useStore();
  const p = itemsById.get(id);
  return p ? <span className="text-[14.5px] opacity-85">{p.title}</span> : null;
}
