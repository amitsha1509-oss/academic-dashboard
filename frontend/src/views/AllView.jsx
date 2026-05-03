// All view — flat newest-first list
function AllView({ tasks, ...rest }) {
  const sorted = [...tasks].sort((a, b) => (b.id - a.id));
  if (sorted.length === 0) return <window.EmptyState onPick={rest.onExampleClick} />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {sorted.map(t => (
        <window.TaskCard key={t.id} task={t} {...rest} isFresh={!!rest.freshIds?.[t.id]} />
      ))}
    </div>
  );
}

function EmptyState({ onPick }) {
  const { t, lang } = window.useLang();
  const examples = lang === "he" ? [
    "להזכיר לי להתקשר לאמא מחר ב-6 בערב",
    "לחדש ביטוח רכב לפני שהוא פג",
    "ריצה של 30 דקות לפני שיתחמם",
  ] : [
    "send dana good luck for her test tomorrow 9am",
    "renew car insurance before it expires",
    "30 min run before it gets hot",
  ];
  return (
    <div style={{
      padding: "60px 20px",
      display: "flex", flexDirection: "column", alignItems: "center", gap: 18,
      textAlign: "center",
    }}>
      <div className="serif" style={{ fontSize: 42, fontStyle: "italic", color: "var(--ink-2)", lineHeight: 1.1 }}>
        {t("emptyTitle")}
      </div>
      <div style={{ fontSize: 15, color: "var(--ink-3)", maxWidth: 400, lineHeight: 1.5 }}>
        {t("emptySubtitle")}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8, width: "100%", maxWidth: 380 }}>
        {examples.map(e => {
          const eRtl = window.isHebrew(e);
          return (
            <button key={e} onClick={() => onPick?.(e)} dir={eRtl ? "rtl" : "ltr"} style={{
              padding: "10px 14px", borderRadius: 10, fontSize: 13.5,
              border: "1px dashed var(--line-strong)", background: "transparent",
              color: "var(--ink-2)", textAlign: eRtl ? "right" : "left",
              fontFamily: eRtl ? "Heebo, var(--font-sans)" : "inherit",
            }}>
              "{e}"
            </button>
          );
        })}
      </div>
    </div>
  );
}

window.AllView = AllView;
window.EmptyState = EmptyState;
