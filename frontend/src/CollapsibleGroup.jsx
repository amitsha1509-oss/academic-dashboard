// CollapsibleGroup — reusable group bar with expand/collapse, persists to localStorage
const { useState: useStateCG, useEffect: useEffectCG } = React;
const { ChevronDown: ChevDownCG } = window.Icon;

function CollapsibleGroup({
  storageKey,             // unique key per group instance — persisted state
  defaultOpen = true,
  header,                 // node — left side of bar
  trailing,               // optional node — right side
  count,                  // number for the mono badge
  accentColor,            // optional left edge color
  emphasis = "normal",    // "normal" | "loud" — loud = more visible bar
  children,
}) {
  // Per-user prefix lives inside window.userStorage. The bare storageKey
  // is what callers pass; the helper namespaces it by user_id internally.
  const userKey = `collapse.${storageKey}`;
  const [open, setOpen] = useStateCG(() => {
    const v = window.userStorage.get(userKey);
    return v === null ? defaultOpen : v === "1";
  });
  useEffectCG(() => {
    window.userStorage.set(userKey, open ? "1" : "0");
  }, [open]);
  // Listen for collapse-all / expand-all events
  useEffectCG(() => {
    const sync = () => {
      const v = window.userStorage.get(userKey);
      if (v !== null) setOpen(v === "1");
    };
    window.addEventListener("nucleus:collapse-changed", sync);
    return () => window.removeEventListener("nucleus:collapse-changed", sync);
  }, []);

  const loud = emphasis === "loud";

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%",
          display: "flex", alignItems: "center", gap: 10,
          padding: loud ? "8px 10px" : "6px 4px",
          marginBottom: open ? 10 : 0,
          paddingBottom: loud ? 8 : 8,
          background: loud ? "var(--paper-2)" : "transparent",
          border: loud ? "1px solid var(--line)" : "none",
          borderBottom: loud ? "1px solid var(--line)" : "1px solid var(--line)",
          borderRadius: loud ? 10 : 0,
          cursor: "pointer",
          textAlign: "start",
          color: "inherit",
          transition: "background .15s ease",
          position: "relative",
        }}
        onMouseEnter={(e) => { if (!loud) e.currentTarget.style.background = "var(--paper-2)"; }}
        onMouseLeave={(e) => { if (!loud) e.currentTarget.style.background = "transparent"; }}
      >
        <span style={{
          display: "inline-flex",
          color: "var(--ink-3)",
          transform: open ? "rotate(0deg)" : "rotate(-90deg)",
          transition: "transform .18s ease",
          flexShrink: 0,
        }}>
          <ChevDownCG size={14} stroke={2.2} />
        </span>
        {accentColor && (
          <span style={{
            width: 3, alignSelf: "stretch",
            background: accentColor, borderRadius: 2,
            margin: "1px 0",
          }} />
        )}
        <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
          {header}
        </span>
        {typeof count === "number" && (
          <span style={{
            fontSize: 11, color: "var(--ink-4)",
            fontFamily: "var(--font-mono)",
            flexShrink: 0,
          }}>
            {count}
          </span>
        )}
        {trailing && <span style={{ flexShrink: 0 }}>{trailing}</span>}
      </button>
      {open && (
        <div style={{ animation: "fade-in .2s ease" }}>
          {children}
        </div>
      )}
    </div>
  );
}

window.CollapsibleGroup = CollapsibleGroup;

// Small bar with collapse-all / expand-all buttons
function CollapseAllBar({ onCollapseAll, onExpandAll }) {
  const { t } = window.useLang();
  const btn = {
    border: "1px solid var(--line)",
    background: "var(--paper-2)",
    color: "var(--ink-3)",
    fontSize: 11.5,
    padding: "5px 11px",
    borderRadius: 999,
    cursor: "pointer",
    letterSpacing: ".02em",
    transition: "all .15s ease",
  };
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginBottom: -4 }}>
      <button
        style={btn}
        onClick={onCollapseAll}
        onMouseEnter={(e) => { e.currentTarget.style.color = "var(--ink)"; e.currentTarget.style.borderColor = "var(--line-strong)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = "var(--ink-3)"; e.currentTarget.style.borderColor = "var(--line)"; }}
      >
        {t("collapseAll")}
      </button>
      <button
        style={btn}
        onClick={onExpandAll}
        onMouseEnter={(e) => { e.currentTarget.style.color = "var(--ink)"; e.currentTarget.style.borderColor = "var(--line-strong)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = "var(--ink-3)"; e.currentTarget.style.borderColor = "var(--line)"; }}
      >
        {t("expandAll")}
      </button>
    </div>
  );
}
window.CollapseAllBar = CollapseAllBar;
