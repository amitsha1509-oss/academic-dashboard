// Understands a few plain Hebrew words in a quick-add line, like Todoist's quick add:
//   "להתקשר לבנק מחר #השקעות !"  →  title "להתקשר לבנק", due tomorrow, inside השקעות, important.
// Recognized words are removed from the title only when their meaning is used.
import { addDays, parseDate, toISODate } from "./dates";

const DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

export interface Place {
  id: string;
  title: string;
}

export interface Parsed {
  date: string | null;
  dateText: string | null; // the words that set the date, e.g. "ביום שלישי"
  parentId: string | null;
  parentText: string | null; // e.g. "#השקעות"
  important: boolean;
  importantText: string | null;
}

function nextWeekday(today: string, day: number) {
  const diff = (day - parseDate(today).getDay() + 7) % 7 || 7;
  return addDays(today, diff);
}

export function parseQuick(text: string, places: Place[], today: string): Parsed {
  const out: Parsed = { date: null, dateText: null, parentId: null, parentText: null, important: false, importantText: null };

  // "#place": the longest place title that follows a #.
  const hash = text.indexOf("#");
  if (hash >= 0) {
    const after = text.slice(hash + 1);
    const match = places
      .filter((p) => after.startsWith(p.title) || (after.split(/\s/)[0] && p.title.startsWith(after.split(/\s/)[0])))
      .sort((a, b) => b.title.length - a.title.length)[0];
    if (match) {
      out.parentId = match.id;
      const typed = after.startsWith(match.title) ? match.title : after.split(/\s/)[0];
      out.parentText = `#${typed}`;
    }
  }

  const rules: [RegExp, (m: RegExpMatchArray) => string | null][] = [
    [/(^|\s)(מחרתיים)(?=\s|$)/, () => addDays(today, 2)],
    [/(^|\s)(מחר)(?=\s|$)/, () => addDays(today, 1)],
    [/(^|\s)(היום)(?=\s|$)/, () => today],
    [/(^|\s)(בשבוע הבא)(?=\s|$)/, () => addDays(today, 7)],
    [new RegExp(`(^|\\s)((?:ב|ב־|ב-)?יום (${DAYS.join("|")}))(?=\\s|$)`), (m) => nextWeekday(today, DAYS.indexOf(m[3]))],
    [/(^|\s)((?:ב|ב־|ב-)?(\d{1,2})[./](\d{1,2}))(?=\s|$)/, (m) => {
      const t = parseDate(today);
      const d = new Date(t.getFullYear(), Number(m[4]) - 1, Number(m[3]));
      if (d.getMonth() !== Number(m[4]) - 1) return null; // e.g. 31.2
      if (toISODate(d) < today) d.setFullYear(d.getFullYear() + 1);
      return toISODate(d);
    }],
  ];
  for (const [re, fn] of rules) {
    const m = text.match(re);
    const d = m && fn(m);
    if (m && d) {
      out.date = d;
      out.dateText = m[2];
      break;
    }
  }

  const bang = text.match(/(^|\s)(!+)(?=\s|$)/);
  if (bang) {
    out.important = true;
    out.importantText = bang[2];
  }
  return out;
}

/** The title without the words whose meaning was used. */
export function stripWords(text: string, words: (string | null)[]): string {
  let t = text;
  for (const w of words) if (w) t = t.replace(w, " ");
  return t.replace(/\s+/g, " ").trim();
}
