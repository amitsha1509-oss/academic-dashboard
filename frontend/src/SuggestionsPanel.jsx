// AI suggestions panel — two slow buttons, results as cards
function SuggestionsPanel({ onScrollToTask, tasks }) {
  const [open, setOpen] = React.useState(false);
  const [tab, setTab] = React.useState(null); // "dims" | "conns"
  const [loading, setLoading] = React.useState(false);
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState(null);
  const { t } = window.useLang();

  const fetch = async (which) => {
    setOpen(true);
    setTab(which);
    setLoading(true);
    setData(null);
    setError(null);
    try {
      const result = which === "dims"
        ? await window.claudeAPI.suggestDimensions(tasks || [], window.DIMENSIONS)
        : await window.claudeAPI.suggestConnections(tasks || []);
      setData(result);
    } catch (e) {
      console.warn("Claude suggestion failed:", e);
      setError(String(e?.message || e));
      setData(which === "dims" ? window.SUGG_DIMS : window.SUGG_CONNS);
    }
    setLoading(false);
  };

  const Brain = window.Icon.Brain;
  const Link = window.Icon.Link;
  const X = window.Icon.X;
  const Sparkles = window.Icon.Sparkles;

  return (
    <div style={{ marginTop: 32 }}>
      <div style={{
        display: "flex", gap: 10, flexWrap: "wrap",
        padding: "20px 0",
        borderTop: "1px solid var(--line)",
      }}>
        <SuggBtn onClick={() => fetch("dims")} icon={<Brain size={14} stroke={1.8} />} label={t("suggestNewDimensions")} hint={t("suggestNewDimensionsSub")} />
        <SuggBtn onClick={() => fetch("conns")} icon={<Link size={14} stroke={1.8} />} label={t("suggestConnections")} hint={t("suggestConnectionsSub")} />
      </div>

      {open && (
        <div style={{
          background: "var(--card)", border: "1px solid var(--line)",
          borderRadius: 14, padding: 18,
          marginTop: 4,
          animation: "spring-in .3s cubic-bezier(.34,1.56,.64,1)",
          position: "relative",
        }}>
          <button onClick={() => setOpen(false)} style={{
            position: "absolute", top: 12, insetInlineEnd: 12,
            border: "none", background: "transparent", color: "var(--ink-3)",
            display: "flex", padding: 4, borderRadius: 8,
          }}>
            <X size={16} stroke={2} />
          </button>

          <div className="serif" style={{ fontSize: 22, fontStyle: "italic", color: "var(--ink-2)", marginBottom: 4 }}>
            {tab === "dims" ? t("suggestNewDimensions") : t("suggestConnections")}
          </div>

          {loading && <SuggLoading kind={tab} loadingText={t("loadingSlow")} />}

          {!loading && data && tab === "dims" && (
            <DimsResults data={data} onScrollToTask={onScrollToTask} />
          )}
          {!loading && data && tab === "conns" && (
            <ConnsResults data={data} onScrollToTask={onScrollToTask} />
          )}
        </div>
      )}
    </div>
  );
}

function SuggBtn({ onClick, icon, label, hint }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "12px 16px",
        borderRadius: 12,
        border: "1px solid var(--line)",
        background: "var(--card)",
        textAlign: "start",
        display: "flex", flexDirection: "column", gap: 2,
        flex: "1 1 240px",
        transition: "all .15s ease",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--ink-4)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--line)"; e.currentTarget.style.transform = "translateY(0)"; }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>
        <span style={{ color: "var(--accent)" }}>{icon}</span>
        {label}
      </span>
      <span style={{ fontSize: 11.5, color: "var(--ink-3)", fontStyle: "italic" }} className="serif">
        {hint}
      </span>
    </button>
  );
}

function SuggLoading({ kind, loadingText }) {
  return (
    <div style={{
      padding: "32px 0",
      display: "flex", flexDirection: "column", alignItems: "center", gap: 14,
      color: "var(--ink-3)",
    }}>
      <div style={{ display: "flex", gap: 6 }}>
        {[0,1,2].map(i => (
          <span key={i} style={{
            width: 8, height: 8, borderRadius: 999, background: "var(--accent)",
            animation: `thinking-dot 1.4s ease-in-out infinite ${i * 0.2}s`,
          }}/>
        ))}
      </div>
      <span style={{ fontSize: 12.5 }}>{loadingText || "this takes 3–8 seconds — calling the model"}</span>
    </div>
  );
}

function TaskPill({ id, onClick }) {
  return (
    <button onClick={() => onClick?.(id)} style={{
      padding: "2px 8px", borderRadius: 999,
      border: "1px solid var(--line)", background: "var(--paper-2)",
      fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 500,
      color: "var(--ink-2)",
    }}
    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--accent)"; e.currentTarget.style.color = "var(--paper)"; e.currentTarget.style.borderColor = "var(--accent)"; }}
    onMouseLeave={(e) => { e.currentTarget.style.background = "var(--paper-2)"; e.currentTarget.style.color = "var(--ink-2)"; e.currentTarget.style.borderColor = "var(--line)"; }}>
      #{id}
    </button>
  );
}

function DimsResults({ data, onScrollToTask }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 14 }}>
      {data.new_dimensions.length > 0 && (
        <div>
          <SectionLabel>new dimension proposals</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {data.new_dimensions.map((d, i) => (
              <div key={i} style={{
                background: "var(--paper-2)", border: "1px solid var(--line)",
                borderRadius: 10, padding: 12,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                  <code style={{
                    fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600,
                    background: "var(--ink)", color: "var(--paper)",
                    padding: "2px 8px", borderRadius: 6,
                  }}>{d.name}</code>
                  <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>values:</span>
                  {d.allowed_values.map(v => (
                    <code key={v} style={{
                      fontFamily: "var(--font-mono)", fontSize: 11,
                      background: "var(--card)", color: "var(--ink-2)",
                      padding: "1px 6px", borderRadius: 4, border: "1px solid var(--line)",
                    }}>{v}</code>
                  ))}
                </div>
                <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5 }}>{d.reason}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
                  {d.example_task_ids.map(id => <TaskPill key={id} id={id} onClick={onScrollToTask} />)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.new_values.length > 0 && (
        <div>
          <SectionLabel>new value proposals</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {data.new_values.map((v, i) => (
              <div key={i} style={{
                background: "var(--paper-2)", border: "1px solid var(--line)",
                borderRadius: 10, padding: 12,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: "var(--ink-3)" }}>add</span>
                  <code style={{
                    fontFamily: "var(--font-mono)", fontSize: 12.5, fontWeight: 600,
                    background: "var(--accent)", color: "var(--paper)",
                    padding: "2px 8px", borderRadius: 6,
                  }}>{v.value}</code>
                  <span style={{ fontSize: 12, color: "var(--ink-3)" }}>to</span>
                  <code style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink-2)" }}>{v.dimension}</code>
                </div>
                <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5 }}>{v.reason}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
                  {v.example_task_ids.map(id => <TaskPill key={id} id={id} onClick={onScrollToTask} />)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ConnsResults({ data, onScrollToTask }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 14 }}>
      {data.sessions.length > 0 && (
        <div>
          <SectionLabel>batch sessions</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {data.sessions.map((s, i) => (
              <div key={i} style={{
                background: "var(--paper-2)", border: "1px solid var(--line)",
                borderRadius: 10, padding: 12,
              }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                  <span className="serif" style={{ fontSize: 17, fontStyle: "italic", color: "var(--ink)" }}>{s.label}</span>
                  <span style={{ fontSize: 11, color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}>~{s.estimated_minutes}min</span>
                </div>
                <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5 }}>{s.reason}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
                  {s.task_ids.map(id => <TaskPill key={id} id={id} onClick={onScrollToTask} />)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {data.related.length > 0 && (
        <div>
          <SectionLabel>related tasks</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {data.related.map((r, i) => (
              <div key={i} style={{
                background: "var(--paper-2)", border: "1px solid var(--line)",
                borderRadius: 10, padding: 12,
              }}>
                <div style={{ marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: "var(--ink-3)" }}>shared: </span>
                  <span style={{ fontSize: 13, color: "var(--ink), fontWeight: 600" }}><em>{r.shared}</em></span>
                </div>
                <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5 }}>{r.reason}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
                  {r.task_ids.map(id => <TaskPill key={id} id={id} onClick={onScrollToTask} />)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 10.5, fontWeight: 600, color: "var(--ink-3)",
      textTransform: "uppercase", letterSpacing: ".08em",
      marginBottom: 8,
    }}>{children}</div>
  );
}

window.SuggestionsPanel = SuggestionsPanel;
