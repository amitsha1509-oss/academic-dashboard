// Screens for browsing: topics, studies, the timeline, search, saved views, and the guide.
import { useMemo, useState, type ReactNode } from "react";
import { EmptyNote, Row, Screen, TypeLabel } from "../components/kit";
import { Section } from "../components/ui";
import { addDays, MONTHS_LONG, parseDate, toISODate, todayISO } from "../lib/dates";
import { openItem, useNav } from "../lib/nav";
import { useStore } from "../lib/store";
import type { Item } from "../lib/types";
import { applyView } from "../lib/viewEngine";
import { describeView } from "../lib/viewText";

function openCount(children: Item[] | undefined) {
  return (children ?? []).filter((c) => c.status === "open").length;
}

export function TopicsScreen() {
  const { items, childrenOf } = useStore();
  const topics = items.filter((i) => i.type_id === "topic" && i.status !== "dropped").sort((a, b) => a.title.localeCompare(b.title, "he"));
  return (
    <Screen title="נושאים" add={{ type_id: "topic" }} subtitle="תחומים בחיים. כל נושא אוסף את מה ששייך אליו: משימות, רעיונות, קישורים, קורסים.">
      <Section title="כל הנושאים" count={topics.length}>
        {topics.map((t) => <Row key={t.id} item={t} hideType extra={`${openCount(childrenOf.get(t.id))} פריטים פתוחים`} />)}
        {!topics.length && <EmptyNote>עוד אין נושאים. למשל: השקעות, מודיעין, בריאות. להוספה: הכפתור "הוסף" למטה.</EmptyNote>}
      </Section>
    </Screen>
  );
}

export function StudiesScreen() {
  const { items, childrenOf } = useStore();
  const today = todayISO();
  const courses = items.filter((i) => i.type_id === "course" && i.status !== "dropped");
  const active = courses.filter((c) => !c.span_end || c.span_end >= today);
  const past = courses.filter((c) => c.span_end && c.span_end < today);
  const exams = items
    .filter((i) => i.type_id === "exam" && i.status !== "dropped" && (i.when_at ?? "9999") >= today)
    .sort((a, b) => (a.when_at ?? "9999").localeCompare(b.when_at ?? "9999"));
  const tasksOf = (id: string) => (childrenOf.get(id) ?? []).filter((c) => c.type_id === "task" && c.status === "open").length;
  return (
    <Screen title="לימודים" add={{ type_id: "course" }} subtitle="קורסים, ובתוך כל קורס ההרצאות, המשימות והמבחנים שלו.">
      <Section title="קורסים" count={active.length}>
        {active.map((c) => <Row key={c.id} item={c} hideType extra={`${tasksOf(c.id)} משימות פתוחות`} />)}
        {!active.length && <EmptyNote>עוד אין קורסים. להוספה: הכפתור "הוסף" למטה.</EmptyNote>}
      </Section>
      <Section title="מבחנים קרובים" count={exams.length}>
        {exams.length ? exams.map((e) => <Row key={e.id} item={e} hideType />)
          : <EmptyNote>אין מבחנים קרובים. מוסיפים מבחן מתוך הקורס שלו.</EmptyNote>}
      </Section>
      {past.length > 0 && (
        <Section title="קורסים שהסתיימו" count={past.length}>
          {past.map((c) => <Row key={c.id} item={c} hideType />)}
        </Section>
      )}
    </Screen>
  );
}

interface Mark {
  date: string;
  item?: Item;
  label: string;
  note?: string;
  today?: boolean;
}

export function TimelineScreen() {
  const { items, types } = useStore();
  const [range, setRange] = useState(0); // extra months shown past the default window
  const today = todayISO();
  const t = parseDate(today);
  const from = toISODate(new Date(t.getFullYear(), t.getMonth() - 2, 1));
  const to = addDays(toISODate(new Date(t.getFullYear(), t.getMonth() + 9 + range, 1)), -1);

  const marks = useMemo(() => {
    const out: Mark[] = [{ date: today, label: "היום", today: true }];
    const inRange = (d: string | null | undefined) => !!d && d >= from && d <= to;
    for (const i of items) {
      if (i.status === "dropped" || i.repeat) continue;
      if (inRange(i.span_start)) out.push({ date: i.span_start!, item: i, label: i.title, note: "מתחיל" });
      if (inRange(i.span_end)) out.push({ date: i.span_end!, item: i, label: i.title, note: "מסתיים" });
      const important = i.type_id === "exam" || i.props.importance === "high" && i.type_id === "event";
      if (important && inRange(i.when_at?.slice(0, 10))) out.push({ date: i.when_at!.slice(0, 10), item: i, label: i.title });
    }
    return out.sort((a, b) => a.date.localeCompare(b.date) || (a.today ? -1 : 1));
  }, [items, today, from, to]);

  const months = new Map<string, Mark[]>();
  for (const m of marks) months.set(m.date.slice(0, 7), [...(months.get(m.date.slice(0, 7)) ?? []), m]);

  return (
    <Screen title="ציר זמן" add={false} subtitle="התמונה הגדולה: תקופות, קורסים, פרויקטים ומבחנים. מלמעלה למטה.">
      {[...months.entries()].map(([ym, list]) => {
        const d = parseDate(`${ym}-01`);
        return (
          <section key={ym} className="grid gap-0.5">
            <h2 className="display pb-1 text-[22px]">
              {MONTHS_LONG[d.getMonth()]}{d.getFullYear() !== t.getFullYear() ? ` ${d.getFullYear()}` : ""}
            </h2>
            {list.map((m, idx) => m.today ? (
              <div key="today" className="flex items-center gap-3.5 rounded-2xl bg-accent px-4 py-3 text-white">
                <span className="w-12 text-[15px] font-semibold tabular-nums">{parseDate(m.date).getDate()}.{parseDate(m.date).getMonth() + 1}</span>
                <span className="display text-[17px]">היום</span>
              </div>
            ) : (
              <button key={`${m.item!.id}-${idx}`} type="button" onClick={() => openItem(m.item!.id)}
                className="group flex items-start gap-3.5 border-b border-line py-3 text-start">
                <span className="w-12 shrink-0 text-[15px] font-semibold tabular-nums">{parseDate(m.date).getDate()}.{parseDate(m.date).getMonth() + 1}</span>
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="text-[16.5px] font-medium group-hover:underline group-hover:decoration-faint group-hover:underline-offset-4">
                    {m.note ? `${m.note}: ` : ""}{m.label}
                  </span>
                  <span className="text-[13.5px] text-muted"><TypeLabel typeId={m.item!.type_id} /></span>
                </span>
              </button>
            ))}
          </section>
        );
      })}
      {marks.length === 1 && (
        <EmptyNote>
          כדי שדברים יופיעו כאן, תן לפריט "תקופה" (סמסטר, קורס, פרויקט) או צור {types.some((x) => x.id === "exam") ? "מבחן" : "אירוע חשוב"} עם תאריך.
        </EmptyNote>
      )}
      <button type="button" onClick={() => setRange(range + 6)} className="justify-self-start rounded-full bg-surface px-4 py-2 text-sm font-medium hover:bg-active">
        הצג עוד חצי שנה
      </button>
    </Screen>
  );
}

export function SearchScreen() {
  const { items, properties } = useStore();
  const [q, setQ] = useState("");
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    const labels = (i: Item) => properties.flatMap((p) => {
      const v = i.props[p.id];
      if (p.type === "choice") return p.options.filter((o) => o.id === v).map((o) => o.label);
      if (p.type === "multi") return p.options.filter((o) => (v as string[] | undefined)?.includes(o.id)).map((o) => o.label);
      return v !== undefined ? [String(v)] : [];
    }).join(" ");
    return items
      .map((i) => {
        const inTitle = i.title.toLowerCase().includes(s);
        const hay = `${i.notes} ${i.links.map((l) => `${l.title} ${l.url}`).join(" ")} ${labels(i)}`.toLowerCase();
        return { i, score: inTitle ? 2 : hay.includes(s) ? 1 : 0 };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score || (a.i.status === "open" ? -1 : 1))
      .slice(0, 80)
      .map((r) => r.i);
  }, [q, items, properties]);
  return (
    <Screen add={false} titleNode={
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש בכל מקום…" aria-label="חיפוש"
        className="display w-full border-b-2 border-ink bg-transparent pb-2 text-[32px] outline-none placeholder:text-faint" />
    } subtitle="כותרות, הערות, קישורים ותגיות.">
      {q && !results.length && <EmptyNote>לא נמצא כלום.</EmptyNote>}
      {results.length > 0 && <Section title="תוצאות" count={results.length}>{results.map((i) => <Row key={i.id} item={i} />)}</Section>}
    </Screen>
  );
}

export function ViewsScreen() {
  const { views, items, fields, types, properties, itemsById } = useStore();
  const { push } = useNav();
  return (
    <Screen title="רשימות משלי" add={false}
      subtitle="תצוגה היא רשימה ששמרת: בוחרים אילו פריטים להראות ובאיזה סדר, והיא מתעדכנת לבד. למשל: משימות קלות לערב, או כל הרעיונות בנושא השקעות.">
      <Section title="תצוגות" count={views.length}>
        {views.map((v) => (
          <button key={v.id} type="button" onClick={() => push({ name: "view", arg: v.id })}
            className="group flex w-full items-start gap-3 border-b border-line py-3.5 text-start">
            <span className="grid min-w-0 flex-1 gap-0.5">
              <span className="text-[16.5px] font-medium group-hover:underline group-hover:decoration-faint group-hover:underline-offset-4">{v.name}</span>
              <span className="text-[13.5px] text-muted">{describeView(v.config, { types, properties, itemsById, fields })}</span>
            </span>
            <span className="shrink-0 pt-0.5 text-[14px] font-medium text-faint">{applyView(items, v.config, fields).length}</span>
          </button>
        ))}
        {!views.length && <EmptyNote>עוד אין תצוגות.</EmptyNote>}
      </Section>
      <button type="button" onClick={() => push({ name: "viewEdit", arg: "new" })}
        className="justify-self-start rounded-full bg-ink px-5 py-2.5 text-[15px] font-medium text-canvas">
        + תצוגה חדשה
      </button>
    </Screen>
  );
}

function Step({ n, title, children }: { n?: number; title: string; children: ReactNode }) {
  return (
    <div className="flex gap-3.5 border-b border-line py-3.5">
      {n !== undefined && <span className="display w-6 shrink-0 text-[20px] text-accent">{n}</span>}
      <div className="grid gap-1">
        <span className="display text-[18px] font-bold">{title}</span>
        <p className="text-[15.5px] leading-relaxed text-muted">{children}</p>
      </div>
    </div>
  );
}

export function GuideScreen() {
  const { home } = useNav();
  return (
    <Screen title="איך זה עובד" add={false} subtitle="שתי דקות, ואפשר להתחיל.">
      <Section title="שלושה דברים לדעת">
        <Step n={1} title="מוסיפים דבר אחד בכל פעם">
          כותבים בשורה שבעמוד הראשי, או לוחצים "הוסף" בכל מסך. אפשר לכתוב כמו שמדברים: "להתקשר לבנק מחר #השקעות !" והאפליקציה תבין תאריך, נושא וחשיבות.
          אם לא בחרת כלום, זה נשמר בתיבת הקליטה ומסדרים אחר כך.
        </Step>
        <Step n={2} title="דברים נכנסים לתוך דברים">
          נושא (למשל השקעות) או קורס מכילים משימות, רעיונות ופתקים. בתוך פריט יש שני כפתורים:
          "פרט לפריט הזה" משנה אותו (תאריך, חשיבות), ו"פריט חדש בתוך" מוסיף לתוכו משהו חדש.
        </Step>
        <Step n={3} title="המסכים מתעדכנים לבד">
          היום מראה מה יש היום, משימות מסודרות לפי חשיבות ודחיפות, ופספוסים אוסף מה שנשכח. אין צורך לעדכן אותם ידנית.
        </Step>
      </Section>
      <Section title="הרגל של דקה">
        <Step title="בבוקר">פותחים את היום.</Step>
        <Step title="פעם ביום">עוברים על תיבת הקליטה ונותנים לכל דבר סוג או מקום.</Step>
        <Step title="פעם בשבוע">עוברים על פספוסים: מה צפית, מה לדחות ומה כבר לא חשוב.</Step>
      </Section>
      <Section title="כשצריך יותר">
        <Step title="לשנות מה מופיע">בהגדרות, "מה מופיע אצלי": מדליקים ומכבים אזורים כמו לימודים או אימונים. שום דבר לא נמחק.</Step>
        <Step title="רשימות משלך">"רשימות משלי" בונים בשאלות פשוטות: אילו פריטים, מאיפה ובאיזה סדר.</Step>
      </Section>
      <button type="button" onClick={home} className="justify-self-start rounded-full bg-ink px-5 py-2.5 text-[15px] font-medium text-canvas">
        הבנתי, לעמוד הראשי
      </button>
    </Screen>
  );
}
