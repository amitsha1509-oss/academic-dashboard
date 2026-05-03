// Edit dialog — fix any classification dimension
function EditDialog({ task, onClose, onSave }) {
  const [draft, setDraft] = React.useState(task);
  const { t } = window.useLang();
  React.useEffect(() => setDraft(task), [task?.id]);
  if (!task) return null;

  const D = window.DIMENSIONS;
  const X = window.Icon.X;

  // Translate dim values where we have keys for them.
  // For "subject" our values ARE the Hebrew display names (course list in DIMENSIONS),
  // so no t() lookup is needed — the i18n bundle has stale subj_* keys from
  // life_dashboard that don't match our Hebrew course names.
  const labelFor = (dim, v) => {
    if (dim === "subject") return v;
    if (dim === "importance" || dim === "urgency") {
      return t("level" + v[0].toUpperCase() + v.slice(1));
    }
    return v;
  };

  const Field = ({ label, dim, value }) => {
    const canonical = D[dim] || [];
    // If the task's current value is custom (not in canonical), still show it.
    const all = (value && !canonical.includes(value)) ? [...canonical, value] : canonical;
    // subject is user-extensible; importance/urgency stay fixed.
    const extensible = (dim === "subject");
    const [adding, setAdding] = React.useState(false);
    const [newVal, setNewVal] = React.useState("");

    const commitNew = () => {
      let v = newVal.trim();
      if (!v) return;
      setDraft(d => ({ ...d, [dim]: v }));
      setAdding(false);
      setNewVal("");
    };

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 600 }}>
          {label}
        </label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center" }}>
          {all.map(v => {
            const sel = value === v;
            const isCustom = !canonical.includes(v);
            return (
              <button
                key={v}
                onClick={() => setDraft(d => ({ ...d, [dim]: v }))}
                style={{
                  padding: "5px 10px", borderRadius: 8, fontSize: 12.5,
                  border: `1px solid ${sel ? "var(--ink)" : isCustom ? "var(--accent)" : "var(--line)"}`,
                  background: sel ? "var(--ink)" : "transparent",
                  color: sel ? "var(--paper)" : isCustom ? "var(--accent)" : "var(--ink-2)",
                  fontWeight: sel ? 600 : 500,
                  transition: "all .12s",
                }}
                title={isCustom ? t("editCustomValueTitle") : ""}
              >
                {isCustom ? v : labelFor(dim, v)}
              </button>
            );
          })}
          {extensible && !adding && (
            <button
              onClick={() => setAdding(true)}
              style={{
                padding: "5px 10px", borderRadius: 8, fontSize: 12.5,
                border: "1px dashed var(--line-strong)",
                background: "transparent",
                color: "var(--ink-3)",
                fontWeight: 500,
                fontStyle: "italic",
              }}
              title={t("editAddCustomTitle")}
            >+ {t("editNew")}</button>
          )}
          {extensible && adding && (
            <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
              <input
                autoFocus
                value={newVal}
                onChange={(e) => setNewVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitNew();
                  else if (e.key === "Escape") { setAdding(false); setNewVal(""); }
                }}
                placeholder={t("editNewPlaceholder")}
                style={{
                  padding: "5px 8px", borderRadius: 8, fontSize: 12.5,
                  border: "1px solid var(--accent)", background: "var(--card)",
                  color: "var(--ink)", outline: "none",
                  width: 110,
                }}
              />
              <button
                onClick={commitNew}
                style={{
                  padding: "5px 9px", borderRadius: 8, fontSize: 12,
                  border: "none", background: "var(--ink)", color: "var(--paper)",
                  fontWeight: 600,
                }}
              >{t("editAdd")}</button>
              <button
                onClick={() => { setAdding(false); setNewVal(""); }}
                style={{
                  padding: "5px 8px", borderRadius: 8, fontSize: 12,
                  border: "none", background: "transparent", color: "var(--ink-3)",
                }}
              >×</button>
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 60,
        background: "rgba(28,27,25,.32)",
        backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
        animation: "fade-in .15s ease",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 520,
          background: "var(--card)",
          border: "1px solid var(--line)",
          borderRadius: 18,
          boxShadow: "var(--shadow-3)",
          overflow: "hidden",
          animation: "spring-in .25s cubic-bezier(.34,1.56,.64,1)",
        }}
      >
        <div style={{
          padding: "16px 20px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          borderBottom: "1px solid var(--line)",
        }}>
          <span className="serif" style={{ fontSize: 22, fontStyle: "italic", color: "var(--ink-2)" }}>{t("editTask")}</span>
          <button onClick={onClose} style={{
            border: "none", background: "transparent", color: "var(--ink-3)",
            display: "flex", padding: 4,
          }}>
            <X size={18} stroke={2} />
          </button>
        </div>

        <div style={{ padding: "18px 20px 22px", display: "flex", flexDirection: "column", gap: 18 }}>
          <window.AutoDirText
            style={{
              display: "block",
              fontSize: 16, color: "var(--ink)", lineHeight: 1.45,
              padding: "10px 14px",
              background: "var(--paper-2)", border: "1px solid var(--line)",
              borderRadius: 10,
            }}
          >
            {draft.raw_text}
          </window.AutoDirText>

          <Field label={t("subject")} dim="subject" value={draft.subject} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
            <Field label={t("importance")} dim="importance" value={draft.importance} />
            <Field label={t("urgency")} dim="urgency" value={draft.urgency} />
          </div>
        </div>

        <div style={{
          padding: "14px 20px",
          display: "flex", justifyContent: "flex-end", gap: 8,
          borderTop: "1px solid var(--line)",
          background: "var(--paper-2)",
        }}>
          <button onClick={onClose} style={{
            padding: "8px 14px", borderRadius: 10, fontSize: 13,
            border: "1px solid var(--line)", background: "transparent", color: "var(--ink-2)",
            fontWeight: 500,
          }}>{t("cancel")}</button>
          <button onClick={() => onSave(draft)} style={{
            padding: "8px 14px", borderRadius: 10, fontSize: 13,
            border: "none", background: "var(--ink)", color: "var(--paper)",
            fontWeight: 600,
          }}>{t("saveChanges")}</button>
        </div>
      </div>
    </div>
  );
}

window.EditDialog = EditDialog;
