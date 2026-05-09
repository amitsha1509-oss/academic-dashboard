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
  const base = window.SUBJECT_META[subject] || window.SUBJECT_META["כללי"] || { icon: "Book", color: "#6B7280", bg: "#F3F4F6", mid: "#9CA3AF" };
  const meta = window.SUBJECT_META[subject] ? base : { ...base, label: subject || "כללי" };
  if (!meta.label) meta.label = subject || "כללי";
  const Ico = window.Icon[meta.icon] || window.Icon.Book;
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
      direction: "ltr",
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

const URG_LABELS  = { high: "דחוף",     medium: "בינוני",  low: "לא דחוף" };
const IMP_LABELS  = { high: "חשוב",     medium: "בינ׳",    low: "לא חשוב" };

function LevelChip({ kind, value }) {
  if (!value) return null;
  const color = (kind === "urgency" ? URGENCY_COLOR : IMPORTANCE_COLOR)[value];
  const label = (kind === "urgency" ? URG_LABELS : IMP_LABELS)[value];
  const isHigh = value === "high";
  return (
    <span title={`${KIND_HE[kind]}: ${LEVEL_HE[value]}`} style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 8px",
      borderRadius: 999,
      background: isHigh ? `${color}18` : "transparent",
      border: `1.5px solid ${isHigh ? color : "var(--line)"}`,
      color: isHigh ? color : "var(--ink-4)",
      fontSize: 11, fontWeight: isHigh ? 600 : 400,
      lineHeight: 1.2,
    }}>
      {label}
      <span style={{ width: 4, height: 4, borderRadius: 999, background: color, flexShrink: 0 }} />
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
      direction: "ltr",
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

// Simple toast — usable from anywhere without React state
window.showToast = (msg, type = "error") => {
  const el = document.createElement("div");
  const bg = type === "error" ? "#C24A2A" : "#2F5D50";
  el.style.cssText = [
    "position:fixed", "bottom:28px", "left:50%", "transform:translateX(-50%)",
    `background:${bg}`, "color:white", "padding:10px 20px", "border-radius:10px",
    "font-family:Heebo,sans-serif", "font-size:13px", "font-weight:500",
    "box-shadow:0 4px 20px rgba(0,0,0,.25)", "z-index:9999",
    "animation:fade-in .2s ease", "white-space:nowrap", "pointer-events:none",
  ].join(";");
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.transition = "opacity .3s ease";
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 320);
  }, 3200);
};

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
