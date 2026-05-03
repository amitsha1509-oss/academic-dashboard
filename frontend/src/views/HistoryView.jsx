// HistoryView — completed/skipped tasks grouped by week.

const { useState: useStateH, useEffect: useEffectH } = React;

function HistoryView() {
  const [items, setItems] = useStateH([]);
  const [loading, setLoading] = useStateH(true);

  useEffectH(() => {
    (async () => {
      try {
        const r = await fetch("http://localhost:8001/history");
        setItems(await r.json());
      } finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <div style={{ padding: 32, textAlign: "center", color: "var(--ink-3)" }}>טוען...</div>;
  if (!items.length) return <div style={{ padding: 32, textAlign: "center", color: "var(--ink-3)" }}>עוד לא סומנו משימות כהושלמו. ✓ ב"היום" יישמר כאן.</div>;

  const byWeek = {};
  for (const t of items) (byWeek[t.week || 0] = byWeek[t.week || 0] || []).push(t);
  const weeks = Object.keys(byWeek).map(Number).sort((a, b) => b - a);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {weeks.map(w => {
        const ts = byWeek[w];
        const done = ts.filter(t => t.status === "done").length;
        const skip = ts.filter(t => t.status === "skipped").length;
        return (
          <div key={w} style={{
            background: "var(--card)", border: "1px solid var(--line)",
            borderRadius: "var(--r-lg)", overflow: "hidden",
          }}>
            <div style={{
              background: "var(--ink)", color: "var(--paper)",
              padding: "10px 16px", fontWeight: 600, fontSize: 13,
              display: "flex", justifyContent: "space-between",
            }}>
              <span>שבוע {w}</span>
              <span style={{ fontWeight: 400, opacity: 0.75, fontSize: 12 }}>
                {done} בוצעו{skip ? ` · ${skip} דולגו` : ""}
              </span>
            </div>
            {ts.map(t => {
              const color = "#" + (t.color || "6B7280");
              const icon = t.status === "done" ? "✅" : "⏭";
              const opacity = t.status === "skipped" ? 0.55 : 1;
              return (
                <div key={t.id} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 16px", borderTop: "1px solid var(--line)",
                  fontSize: 13, opacity,
                }}>
                  <span style={{ fontSize: 16 }}>{icon}</span>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
                  <span><strong>{t.category_name}</strong> · {t.title}</span>
                  <span style={{ marginInlineStart: "auto", color: "var(--ink-3)", fontSize: 11 }}>
                    {fmtHistDate(t.date)}
                  </span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function fmtHistDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const days = ["א׳","ב׳","ג׳","ד׳","ה׳","ו׳","ש׳"];
  return `${days[d.getDay()]} ${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}`;
}

window.HistoryView = HistoryView;
