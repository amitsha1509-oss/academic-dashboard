// Shared atoms: chips, helpers, RTL detection, time formatting

const HEBREW_RE = /[\u0590-\u05FF]/;
const isHebrew = (s) => !!s && HEBREW_RE.test(s);

// \u2500\u2500\u2500 Per-user localStorage helper \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// Different users on the same browser keep their own UI preferences. The
// prefix is applied at write time, so previously-stored unprefixed keys
// are simply ignored on next mount (acceptable \u2014 they're UI prefs, not data).
window.userStorage = {
  _key(k) { return `nucleus.u${window.__USER_ID || 0}.${k}`; },
  get(k)         { try { return localStorage.getItem(this._key(k)); } catch { return null; } },
  set(k, v)      { try { localStorage.setItem(this._key(k), v); } catch {} },
  remove(k)      { try { localStorage.removeItem(this._key(k)); } catch {} },
};

// Format a time_value (ISO) relative to NOW. Hebrew-only app, so render in Hebrew.
function relTime(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  const now = window.NOW;
  const diffMs = d - now;
  const diffMin = Math.round(diffMs / 60000);
  const diffDays = Math.round(diffMs / 86400000);

  const sameDay = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();
  const yest = new Date(now); yest.setDate(yest.getDate() - 1);
  const isYesterday = d.toDateString() === yest.toDateString();

  const time = d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });

  if (sameDay) {
    if (Math.abs(diffMin) < 60) {
      return diffMin >= 0 ? `בעוד ${diffMin} דק׳` : `לפני ${-diffMin} דק׳`;
    }
    return `היום ${time}`;
  }
  if (isTomorrow) return `מחר ${time}`;
  if (isYesterday) return `אתמול ${time}`;
  if (diffDays > 0 && diffDays < 7) {
    return `${d.toLocaleDateString("he-IL", { weekday: "long" })} ${time}`;
  }
  if (diffDays >= 7 && diffDays < 30) return `בעוד ${Math.round(diffDays / 7)} שב׳`;
  return d.toLocaleDateString("he-IL", { month: "short", day: "numeric" });
}

function absTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("he-IL", {
    weekday: "long", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// Bucket a date into Today / Tomorrow / This Week / Later / No Date
function timeBucket(iso) {
  if (!iso) return "No date";
  const d = new Date(iso);
  const now = window.NOW;
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return "Today";
  const tom = new Date(now); tom.setDate(tom.getDate() + 1);
  if (d.toDateString() === tom.toDateString()) return "Tomorrow";
  const diffDays = (d - now) / 86400000;
  if (diffDays > 0 && diffDays < 7) return "This week";
  if (diffDays < 0) return "Overdue";
  return "Later";
}

const URGENCY_COLOR = { high: "var(--urg-high)", medium: "var(--urg-med)", low: "var(--urg-low)" };
const IMPORTANCE_COLOR = { high: "var(--imp-high)", medium: "var(--imp-med)", low: "var(--imp-low)" };

// ─── Subject chip ───────────────────────────────────────────
function SubjectChip({ subject, size = "md" }) {
  const meta = window.SUBJECT_META[subject] || window.SUBJECT_META.other;
  const Ico = window.Icon[meta.icon];
  const small = size === "sm";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: small ? "2px 7px" : "3px 9px 3px 7px",
      borderRadius: 999,
      background: meta.color,
      color: "#FFFCF5",
      fontSize: small ? 10.5 : 11.5,
      fontWeight: 600,
      letterSpacing: ".01em",
      lineHeight: 1.2,
      whiteSpace: "nowrap",
    }}>
      <Ico size={small ? 10 : 11} stroke={2.2} />
      {meta.label}
    </span>
  );
}

// ─── Context chip (subtle) ──────────────────────────────────
function ContextChip({ context }) {
  const meta = window.CONTEXT_META[context] || { icon: "Globe" };
  const Ico = window.Icon[meta.icon];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 7px",
      borderRadius: 999,
      background: "transparent",
      border: "1px solid var(--line)",
      color: "var(--ink-3)",
      fontSize: 11,
      fontWeight: 500,
      lineHeight: 1.2,
      fontFamily: "var(--font-mono)",
    }}>
      <Ico size={10} stroke={2} />
      {context.replace("@", "")}
    </span>
  );
}

// ─── Level chip (importance / urgency) ──────────────────────
const KIND_HE = { urgency: "דחיפות", importance: "חשיבות" };
const LEVEL_HE = { low: "נמוך", medium: "בינוני", high: "גבוה" };
const KIND_SHORT_HE = { urgency: "ד", importance: "ח" };
const LEVEL_SHORT_HE = { low: "נמוך", medium: "בינוני", high: "גבוה" };

function LevelChip({ kind, value }) {
  if (!value) return null;
  const color = (kind === "urgency" ? URGENCY_COLOR : IMPORTANCE_COLOR)[value];
  const dots = value === "high" ? 3 : value === "medium" ? 2 : 1;
  return (
    <span title={`${KIND_HE[kind]}: ${LEVEL_HE[value]}`} style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "2px 7px",
      borderRadius: 999,
      background: "transparent",
      border: "1px solid var(--line)",
      color: "var(--ink-3)",
      fontSize: 10.5,
      fontWeight: 500,
      lineHeight: 1.2,
      letterSpacing: ".02em",
    }}>
      <span style={{ display: "inline-flex", gap: 1.5 }}>
        {[0,1,2].map(i => (
          <span key={i} style={{
            width: 4, height: 4, borderRadius: 999,
            background: i < dots ? color : "var(--line-strong)",
          }}/>
        ))}
      </span>
      {KIND_SHORT_HE[kind]} · {LEVEL_SHORT_HE[value]}
    </span>
  );
}

// ─── Time chip ──────────────────────────────────────────────
function TimeChip({ iso, urgent = false }) {
  if (!iso) return null;
  const Clock = window.Icon.Clock;
  const past = new Date(iso) < window.NOW;
  return (
    <span title={absTime(iso)} style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 7px",
      borderRadius: 999,
      background: past ? "rgba(194,74,42,.08)" : "transparent",
      border: `1px solid ${past ? "rgba(194,74,42,.25)" : "var(--line)"}`,
      color: past ? "var(--urg-high)" : "var(--ink-2)",
      fontSize: 11,
      fontWeight: 500,
      lineHeight: 1.2,
    }}>
      <Clock size={10} stroke={2} />
      {relTime(iso)}
    </span>
  );
}

// ─── Auto-direction text ────────────────────────────────────
function AutoDirText({ children, as: Tag = "span", style, className, ...rest }) {
  const rtl = typeof children === "string" && isHebrew(children);
  return (
    <Tag
      dir={rtl ? "rtl" : "ltr"}
      className={(className || "") + (rtl ? " rtl" : "")}
      style={style}
      {...rest}
    >
      {children}
    </Tag>
  );
}

window.isHebrew = isHebrew;
window.relTime = relTime;
window.absTime = absTime;
window.timeBucket = timeBucket;
window.URGENCY_COLOR = URGENCY_COLOR;
window.IMPORTANCE_COLOR = IMPORTANCE_COLOR;
window.SubjectChip = SubjectChip;
window.ContextChip = ContextChip;
window.LevelChip = LevelChip;
window.TimeChip = TimeChip;
window.AutoDirText = AutoDirText;
