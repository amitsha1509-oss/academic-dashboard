// Calendar view — month + week. Sunday-first (Israeli convention).
const WEEK_STARTS_SUNDAY = true;

function CalendarView({ tasks, onEdit }) {
  const [mode, setMode] = React.useState("month"); // "month" | "week"
  const [cursor, setCursor] = React.useState(new Date(window.NOW));
  const { t, lang } = window.useLang();
  const locale = lang === "he" ? "he-IL" : [];
  const Cal = window.Icon.Calendar;
  const L = window.Icon.ChevronLeft;
  const R = window.Icon.ChevronRight;

  const dated = tasks.filter(t => t.time_value);
  const undated = tasks.length - dated.length;

  const monthLabel = cursor.toLocaleDateString(locale, { month: "long", year: "numeric" });
  const goPrev = () => {
    const d = new Date(cursor);
    if (mode === "month") d.setMonth(d.getMonth() - 1);
    else d.setDate(d.getDate() - 7);
    setCursor(d);
  };
  const goNext = () => {
    const d = new Date(cursor);
    if (mode === "month") d.setMonth(d.getMonth() + 1);
    else d.setDate(d.getDate() + 7);
    setCursor(d);
  };
  const goToday = () => setCursor(new Date(window.NOW));

  return (
    <div>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        marginBottom: 16, flexWrap: "wrap",
      }}>
        <span style={{ fontSize: 20, fontWeight: 700, color: "var(--ink)", flex: 1, minWidth: 180 }}>
          {monthLabel}
        </span>
        <div style={{ display: "flex", gap: 4 }}>
          <CalBtn onClick={goPrev}><L size={14} /></CalBtn>
          <CalBtn onClick={goToday}>{t("today")}</CalBtn>
          <CalBtn onClick={goNext}><R size={14} /></CalBtn>
        </div>
        <div style={{
          display: "flex", padding: 3, gap: 2,
          background: "var(--paper-2)", border: "1px solid var(--line)", borderRadius: 10,
        }}>
          {["month", "week"].map(m => (
            <button key={m} onClick={() => setMode(m)} style={{
              padding: "4px 12px", borderRadius: 7, fontSize: 12, fontWeight: 600,
              border: "none",
              background: mode === m ? "var(--card)" : "transparent",
              boxShadow: mode === m ? "var(--shadow-1)" : "none",
              color: mode === m ? "var(--ink)" : "var(--ink-3)",
              textTransform: "capitalize",
            }}>{t(m)}</button>
          ))}
        </div>
      </div>

      {mode === "month" ? <MonthGrid cursor={cursor} tasks={dated} onEdit={onEdit} locale={locale} /> : <WeekGrid cursor={cursor} tasks={dated} onEdit={onEdit} locale={locale} />}

      {undated > 0 && (
        <div style={{
          marginTop: 14, padding: "10px 14px",
          background: "var(--paper-2)", border: "1px dashed var(--line-strong)", borderRadius: 10,
          fontSize: 12.5, color: "var(--ink-3)", display: "flex", alignItems: "center", gap: 8,
        }}>
          <Cal size={13} stroke={1.8} />
          <span><strong style={{ color: "var(--ink-2)" }}>{undated}</strong> {undated === 1 ? t("noTimeOne").replace("1 ", "") : t("noTimePrefix")}</span>
        </div>
      )}
    </div>
  );
}

function CalBtn({ children, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: "6px 10px", borderRadius: 8, fontSize: 12, fontWeight: 500,
      border: "1px solid var(--line)", background: "var(--card)", color: "var(--ink-2)",
      display: "inline-flex", alignItems: "center", gap: 4,
    }}>{children}</button>
  );
}

function MonthGrid({ cursor, tasks, onEdit, locale = [] }) {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay(); // 0=Sun
  const offset = WEEK_STARTS_SUNDAY ? startWeekday : (startWeekday + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((offset + daysInMonth) / 7) * 7;

  // Localized weekday short names
  const weekStartIndex = WEEK_STARTS_SUNDAY ? 0 : 1;
  const dayHeaders = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(2024, 0, 7 + i + weekStartIndex); // 2024-01-07 was a Sunday
    return d.toLocaleDateString(locale, { weekday: "short" });
  });

  const today = window.NOW;
  const tasksByDay = {};
  tasks.forEach(t => {
    const d = new Date(t.time_value);
    if (d.getFullYear() === year && d.getMonth() === month) {
      const key = d.getDate();
      if (!tasksByDay[key]) tasksByDay[key] = [];
      tasksByDay[key].push(t);
    }
  });

  return (
    <div style={{
      background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12,
      overflow: "hidden",
    }}>
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(7, 1fr)",
        background: "var(--paper-2)", borderBottom: "1px solid var(--line)",
      }}>
        {dayHeaders.map(d => (
          <div key={d} style={{
            padding: "8px 10px", fontSize: 10.5, fontWeight: 600,
            color: "var(--ink-3)", letterSpacing: ".06em", textTransform: "uppercase",
          }}>{d}</div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
        {Array.from({ length: totalCells }).map((_, idx) => {
          const dayNum = idx - offset + 1;
          const inMonth = dayNum >= 1 && dayNum <= daysInMonth;
          const isToday = inMonth && dayNum === today.getDate() && month === today.getMonth() && year === today.getFullYear();
          const items = inMonth ? (tasksByDay[dayNum] || []) : [];
          return (
            <div key={idx} style={{
              minHeight: 92,
              padding: 6,
              borderInlineEnd: (idx % 7) !== 6 ? "1px solid var(--line)" : "none",
              borderTop: idx >= 7 ? "1px solid var(--line)" : "none",
              background: inMonth ? (isToday ? "rgba(217,99,58,.05)" : "var(--card)") : "var(--paper-2)",
              opacity: inMonth ? 1 : 0.55,
              position: "relative",
            }}>
              {inMonth && (
                <div style={{
                  fontSize: 11, fontWeight: isToday ? 700 : 500,
                  color: isToday ? "var(--accent)" : "var(--ink-3)",
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  minWidth: 18, height: 18, borderRadius: 999,
                  padding: "0 4px",
                  background: isToday ? "rgba(217,99,58,.15)" : "transparent",
                  marginBottom: 4,
                  fontFamily: "var(--font-mono)",
                }}>
                  {dayNum}
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {items.slice(0, 3).map(t => (
                  <CalPill key={t.id} task={t} onClick={() => onEdit?.(t)} />
                ))}
                {items.length > 3 && (
                  <span style={{ fontSize: 10, color: "var(--ink-3)", paddingInlineStart: 4 }}>
                    +{items.length - 3} more
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CalPill({ task, onClick }) {
  const color = window.URGENCY_COLOR[task.urgency];
  const rtl = window.isHebrew(task.raw_text);
  const text = task.raw_text.length > 25 ? task.raw_text.slice(0, 25) + "…" : task.raw_text;
  const time = new Date(task.time_value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).toLowerCase().replace(" ", "");
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      title={task.raw_text}
      style={{
        display: "flex", alignItems: "center", gap: 5,
        padding: "2px 6px 2px 7px",
        borderRadius: 5,
        background: "transparent",
        borderInlineStart: `2px solid ${color}`,
        border: "none",
        borderInlineStartStyle: "solid", borderInlineStartWidth: 2, borderInlineStartColor: color,
        textAlign: "start",
        fontSize: 10.5, lineHeight: 1.3,
        color: "var(--ink-2)",
        fontWeight: 500,
        cursor: "pointer",
        width: "100%",
        overflow: "hidden",
        whiteSpace: "nowrap",
        textOverflow: "ellipsis",
        direction: rtl ? "rtl" : "ltr",
      }}
      onMouseEnter={(e) => e.currentTarget.style.background = "var(--paper-2)"}
      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
    >
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--ink-4)", flexShrink: 0 }}>{time}</span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{text}</span>
    </button>
  );
}

function WeekGrid({ cursor, tasks, onEdit, locale = [] }) {
  // start of week
  const day = cursor.getDay();
  const offset = WEEK_STARTS_SUNDAY ? day : (day + 6) % 7;
  const start = new Date(cursor);
  start.setDate(start.getDate() - offset);
  start.setHours(0, 0, 0, 0);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
  const hours = Array.from({ length: 14 }, (_, i) => i + 7); // 7am – 8pm

  const today = window.NOW;

  return (
    <div style={{
      background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12,
      overflow: "hidden",
    }}>
      {/* Day headers */}
      <div style={{ display: "grid", gridTemplateColumns: "44px repeat(7, 1fr)", borderBottom: "1px solid var(--line)", background: "var(--paper-2)" }}>
        <div></div>
        {days.map(d => {
          const isToday = d.toDateString() === today.toDateString();
          return (
            <div key={d.toISOString()} style={{
              padding: "8px 10px", textAlign: "center",
              borderInlineStart: "1px solid var(--line)",
            }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--ink-3)", letterSpacing: ".06em", textTransform: "uppercase" }}>
                {d.toLocaleDateString(locale, { weekday: "short" })}
              </div>
              <div style={{
                fontSize: 16, fontWeight: 600, marginTop: 2,
                color: isToday ? "var(--accent)" : "var(--ink)",
                fontFamily: "var(--font-mono)",
              }}>{d.getDate()}</div>
            </div>
          );
        })}
      </div>

      {/* Hours grid */}
      <div style={{ position: "relative" }}>
        {hours.map(h => (
          <div key={h} style={{
            display: "grid", gridTemplateColumns: "44px repeat(7, 1fr)",
            borderBottom: "1px solid var(--line)",
            minHeight: 44,
          }}>
            <div style={{
              padding: "4px 8px", fontSize: 10, color: "var(--ink-4)",
              fontFamily: "var(--font-mono)",
              borderInlineEnd: "1px solid var(--line)",
            }}>
              {h % 12 || 12}{h < 12 ? "am" : "pm"}
            </div>
            {days.map((d, i) => {
              const slotTasks = tasks.filter(t => {
                const td = new Date(t.time_value);
                return td.toDateString() === d.toDateString() && td.getHours() === h;
              });
              return (
                <div key={i} style={{
                  borderInlineStart: "1px solid var(--line)",
                  padding: 3,
                  display: "flex", flexDirection: "column", gap: 2,
                }}>
                  {slotTasks.map(t => (
                    <CalPill key={t.id} task={t} onClick={() => onEdit?.(t)} />
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

window.CalendarView = CalendarView;
