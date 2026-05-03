// Eisenhower 2×2 matrix
function EisenhowerView({ tasks, ...rest }) {
  const { t } = window.useLang();
  const QUADS = [
    { imp: "high", urg: "high", titleKey: "quadDoFirst",  subKey: "quadDoFirstSub",  accent: "var(--urg-high)" },
    { imp: "high", urg: "low",  titleKey: "quadSchedule", subKey: "quadScheduleSub", accent: "var(--accent-3)" },
    { imp: "low",  urg: "high", titleKey: "quadDelegate", subKey: "quadDelegateSub", accent: "var(--urg-med)" },
    { imp: "low",  urg: "low",  titleKey: "quadDontDo",   subKey: "quadDontDoSub",   accent: "var(--ink-3)" },
  ];

  const open = tasks.filter(t => t.status === "open");
  const inQuad = (q) => open.filter(t => {
    const i = t.importance === "high" ? "high" : "low";
    const u = t.urgency === "high" ? "high" : "low";
    return i === q.imp && u === q.urg;
  });

  return (
    <div style={{
      display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14,
      position: "relative",
    }}>
      {/* Axis labels */}
      <div style={{
        position: "absolute", top: -22, insetInlineStart: "25%", transform: "translateX(-50%)",
        fontSize: 10.5, color: "var(--ink-3)", letterSpacing: ".1em", textTransform: "uppercase", fontWeight: 600,
      }}>{t("axisUrgent")}</div>
      <div style={{
        position: "absolute", top: -22, insetInlineEnd: "25%", transform: "translateX(50%)",
        fontSize: 10.5, color: "var(--ink-3)", letterSpacing: ".1em", textTransform: "uppercase", fontWeight: 600,
      }}>{t("axisNotUrgent")}</div>

      {QUADS.map(q => {
        const items = inQuad(q);
        return (
          <div key={q.titleKey} style={{
            background: "var(--card)",
            border: "1px solid var(--line)",
            borderRadius: 14,
            padding: 14,
            minHeight: 220,
            position: "relative",
          }}>
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span className="serif" style={{ fontSize: 22, fontStyle: "italic", color: q.accent, whiteSpace: "nowrap", flexShrink: 0, lineHeight: 1.2 }}>
                  {t(q.titleKey)}
                </span>
                <span style={{ fontSize: 11, color: "var(--ink-4)", fontFamily: "var(--font-mono)" }}>
                  {items.length}
                </span>
              </div>
              <div style={{ fontSize: 10.5, color: "var(--ink-3)", letterSpacing: ".04em", marginTop: 2 }}>
                {t(q.subKey)}
              </div>
            </div>

            {items.length === 0 ? (
              <div style={{
                fontSize: 12.5, color: "var(--ink-4)", fontStyle: "italic",
                padding: "30px 0", textAlign: "center",
              }}>
                {t("empty")}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {items.map(t => (
                  <window.TaskCard key={t.id} task={t} density="compact" {...rest} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

window.EisenhowerView = EisenhowerView;
