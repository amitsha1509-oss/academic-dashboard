// All dates are local ISO strings: "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM".

export const WEEKDAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
export const WEEKDAY_LETTERS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
const MONTHS = ["ינו׳", "פבר׳", "מרץ", "אפר׳", "מאי", "יוני", "יולי", "אוג׳", "ספט׳", "אוק׳", "נוב׳", "דצמ׳"];
export const MONTHS_LONG = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];

const pad = (n: number) => String(n).padStart(2, "0");

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function parseDate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, n: number): string {
  const d = parseDate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86400000);
}

export function timeOf(iso: string | null | undefined): string | null {
  return iso && iso.length > 10 ? iso.slice(11, 16) : null;
}

/** "היום", "מחר", "יום ג׳", or "12 בנוב׳". Adds the time when there is one. */
export function formatWhen(iso: string | null | undefined, today = todayISO()): string {
  if (!iso) return "";
  const day = iso.slice(0, 10);
  const diff = daysBetween(today, day);
  const d = parseDate(day);
  let label: string;
  if (diff === 0) label = "היום";
  else if (diff === 1) label = "מחר";
  else if (diff === -1) label = "אתמול";
  else if (diff > 1 && diff < 7) label = `יום ${WEEKDAY_LETTERS[d.getDay()]}`;
  else label = `${d.getDate()} ב${MONTHS[d.getMonth()]}${d.getFullYear() !== parseDate(today).getFullYear() ? ` ${d.getFullYear()}` : ""}`;
  const t = timeOf(iso);
  return t ? `${label}, ${t}` : label;
}

export function formatLongDate(iso: string): string {
  const d = parseDate(iso);
  return `יום ${WEEKDAYS[d.getDay()]}, ${d.getDate()} ב${MONTHS_LONG[d.getMonth()]}`;
}

export function weekStart(iso: string): string {
  return addDays(iso, -parseDate(iso).getDay());
}
