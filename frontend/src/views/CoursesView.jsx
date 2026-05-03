// CoursesView — self-confidence + gap notes per course.
// Uses claudeAPI.listCategories / patchCategory directly (categories are
// outside the task model, not in the tasks list).

const { useState, useEffect } = React;

// Order in which confidence groups appear in the "by feeling" view.
// Gap first because that's where attention should go; unrated last.
const FEEL_GROUPS = [
  { key: "gap",       label: "פער גדול",       color: "#DC2626" },
  { key: "partial",   label: "בערך על החומר",  color: "#F59E0B" },
  { key: "excellent", label: "מרגיש מעולה",    color: "#10B981" },
  { key: null,        label: "טרם דורג",       color: "#9CA3AF" },
];

// API base must match claude-api.jsx logic so deployed (same-origin) and
// dev (localhost:8001) both work. Centralizing this would be cleaner.
const _CATAPI = window.location.origin.startsWith("http://localhost")
  ? "http://localhost:8001" : "";

function CoursesView() {
  const { t } = window.useLang();
  const [cats, setCats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [groupBy, setGroupBy] = useState("default"); // "default" | "feel"
  const [adding, setAdding] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const data = await window.claudeAPI.listCategories();
      // Skip the "כללי" catch-all in this view — it's not a real course.
      setCats(data.filter(c => c.name !== "כללי")
                  .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)));
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const patch = async (id, fields) => {
    // Persist FIRST, then update local state on success only.
    setSavingId(id);
    try {
      const r = await fetch(`${_CATAPI}/categories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
        credentials: "include",
        keepalive: true,
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setCats(cs => cs.map(c => c.id === id ? { ...c, ...fields } : c));
    } catch (e) {
      window.showToast(t("alertSaveFailed"));
    } finally { setSavingId(null); }
  };

  const handleCreate = async (payload) => {
    try {
      const created = await window.claudeAPI.createCategory(payload);
      setCats(cs => [...cs, created].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)));
      setAdding(false);
    } catch (e) {
      window.showToast(t("alertCreateFailed") + ": " + e.message);
    }
  };

  if (loading) {
    return <div style={{ padding: 32, textAlign: "center", color: "var(--ink-3)" }}>טוען...</div>;
  }

  const renderCard = (c) => (
    <CourseCard key={c.id} cat={c} onPatch={patch} saving={savingId === c.id} />
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{
        background: "var(--card)",
        border: "1px solid var(--line)",
        borderRadius: "var(--r-md)",
        padding: "12px 16px",
        fontSize: 13,
        color: "var(--ink-2)",
        fontStyle: "italic",
      }}>
        דרג כל קורס לפי איך אתה מרגיש איתו. תוכל להרחיב על פערים ספציפיים בתיבה. הכל נשמר אוטומטית.
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <GroupToggle value={groupBy} onChange={setGroupBy} />
        {!adding ? (
          <button
            onClick={() => setAdding(true)}
            style={{
              padding: "6px 14px", borderRadius: 8, fontSize: 12.5,
              border: "1px dashed var(--line-strong)",
              background: "transparent", color: "var(--ink-3)",
              cursor: "pointer", fontFamily: "inherit", marginInlineStart: "auto",
            }}
          >{t("addCourseButton")}</button>
        ) : null}
      </div>

      {adding && <NewCourseForm onCreate={handleCreate} onCancel={() => setAdding(false)} />}

      {cats.length === 0 && !adding && (
        <div style={{
          padding: 24, textAlign: "center",
          color: "var(--ink-3)", fontSize: 13, lineHeight: 1.6,
          background: "var(--paper-2)", borderRadius: "var(--r-md)",
          border: "1px dashed var(--line)",
        }}>{t("coursesEmpty")}</div>
      )}

      {groupBy === "default" && cats.map(renderCard)}

      {groupBy === "feel" && FEEL_GROUPS.map(g => {
        const inGroup = cats.filter(c => (c.self_confidence || null) === g.key);
        if (inGroup.length === 0) return null;
        return (
          <div key={g.key || "unrated"} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 7,
              fontSize: 13, fontWeight: 600, color: g.color,
              padding: "4px 0 0",
            }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: g.color, flexShrink: 0 }} />
              {g.label} <span style={{ color: "var(--ink-4)", fontWeight: 400 }}>({inGroup.length})</span>
            </div>
            {inGroup.map(renderCard)}
          </div>
        );
      })}
    </div>
  );
}

function GroupToggle({ value, onChange }) {
  const Opt = ({ k, label }) => {
    const active = value === k;
    return (
      <button
        onClick={() => onChange(k)}
        style={{
          padding: "6px 14px",
          borderRadius: 999,
          border: active ? "1.5px solid var(--ink)" : "1.5px solid var(--line-strong)",
          background: active ? "var(--ink)" : "var(--card)",
          color: active ? "var(--paper)" : "var(--ink-2)",
          fontWeight: active ? 600 : 400,
          fontSize: 13,
          cursor: "pointer",
          fontFamily: "inherit",
          transition: "all 0.15s",
        }}
      >{label}</button>
    );
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--ink-3)" }}>
      <span>תצוגה:</span>
      <Opt k="default" label="סדר רגיל" />
      <Opt k="feel"    label="לפי הרגשה" />
    </div>
  );
}

function CourseCard({ cat, onPatch, saving }) {
  const [notes, setNotes] = useState(cat.gap_notes || "");
  const [showKw, setShowKw] = useState(false);
  const [kwList, setKwList] = useState(
    (cat.keywords || "").split(",").map(k => k.trim()).filter(Boolean)
  );
  const [newKw, setNewKw] = useState("");
  // Direct save state — bypasses onPatch indirection so unmount cleanup
  // doesn't depend on parent component still being alive.
  const pendingTimer = React.useRef(null);
  const latestNotes = React.useRef(notes);
  const color = "#" + (cat.color_dark || "6B7280");
  const conf = cat.self_confidence;

  const saveKeywords = (list) => {
    fetch(`${_CATAPI}/categories/${cat.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keywords: list.join(",") }),
      keepalive: true,
    }).catch(() => {});
  };

  const removeKw = (kw) => {
    const next = kwList.filter(k => k !== kw);
    setKwList(next);
    saveKeywords(next);
  };

  const addKw = () => {
    const v = newKw.trim();
    if (!v || kwList.includes(v)) { setNewKw(""); return; }
    const next = [...kwList, v];
    setKwList(next);
    setNewKw("");
    saveKeywords(next);
  };

  const saveNow = (text) => {
    fetch(`${_CATAPI}/categories/${cat.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gap_notes: text }),
      keepalive: true,  // survive page unload / SPA navigation
    }).catch(() => { /* swallow — best effort */ });
  };

  const onChangeNotes = (e) => {
    const v = e.target.value;
    setNotes(v);
    latestNotes.current = v;
    if (pendingTimer.current) clearTimeout(pendingTimer.current);
    pendingTimer.current = setTimeout(() => {
      saveNow(latestNotes.current);
      pendingTimer.current = null;
    }, 600);
  };

  // On unmount: if a debounced save is still pending, fire it now.
  React.useEffect(() => {
    return () => {
      if (pendingTimer.current) {
        clearTimeout(pendingTimer.current);
        saveNow(latestNotes.current);
        pendingTimer.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Belt-and-suspenders: also save when the tab becomes hidden / page unloads.
  React.useEffect(() => {
    const flush = () => {
      if (pendingTimer.current) {
        clearTimeout(pendingTimer.current);
        saveNow(latestNotes.current);
        pendingTimer.current = null;
      }
    };
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("pagehide", flush);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setConf = (newConf) => {
    onPatch(cat.id, { self_confidence: newConf === conf ? null : newConf });
  };

  const Btn = ({ value, label, dotColor }) => {
    const active = conf === value;
    return (
      <button
        onClick={() => setConf(value)}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "5px 13px",
          borderRadius: 999,
          border: active ? `2px solid ${dotColor}` : "1.5px solid var(--line-strong)",
          background: active ? `${dotColor}18` : "var(--card)",
          color: active ? dotColor : "var(--ink-2)",
          fontWeight: active ? 600 : 400,
          fontSize: 12.5,
          cursor: "pointer",
          fontFamily: "inherit",
          transition: "all 0.15s",
        }}
      >
        <span style={{ width: 7, height: 7, borderRadius: 999, background: dotColor, flexShrink: 0, opacity: active ? 1 : 0.45 }} />
        {label}
      </button>
    );
  };

  return (
    <div style={{
      background: "var(--card)",
      borderRadius: "var(--r-lg)",
      border: "1px solid var(--line)",
      borderRight: `4px solid ${color}`,
      padding: "14px 18px",
      boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      transition: "box-shadow .18s ease",
    }}>
      <div style={{
        fontSize: 15.5,
        fontWeight: 600,
        color: "var(--ink)",
        marginBottom: 10,
        fontFamily: "var(--font-display)",
      }}>{cat.name}</div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 13, color: "var(--ink-3)", flexWrap: "wrap" }}>
        <span>איך אני מרגיש:</span>
        <Btn value="excellent" label="מרגיש מעולה"    dotColor="#10B981" />
        <Btn value="partial"   label="בערך על החומר"  dotColor="#F59E0B" />
        <Btn value="gap"       label="פער גדול"       dotColor="#DC2626" />
      </div>

      <textarea
        value={notes}
        placeholder="פערים ספציפיים, נושאים שצריך לחזור עליהם, וכל מה שעוזר לך לזכור..."
        onChange={onChangeNotes}
        style={{
          width: "100%",
          padding: "10px 12px",
          border: "1px solid var(--line-strong)",
          borderRadius: "var(--r-sm)",
          fontFamily: "inherit",
          fontSize: 13,
          resize: "vertical",
          minHeight: 60,
          background: "var(--paper)",
          color: "var(--ink)",
        }}
      />
      {saving && <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 4, fontStyle: "italic" }}>שומר...</div>}

      {/* Keywords section — hidden by default */}
      <div style={{ marginTop: 10 }}>
        <button
          onClick={() => setShowKw(s => !s)}
          style={{
            background: "none", border: "none", padding: 0,
            fontSize: 11.5, color: "var(--ink-4)", cursor: "pointer",
            fontFamily: "inherit", display: "flex", alignItems: "center", gap: 4,
          }}
        >
          <span style={{ fontSize: 10 }}>{showKw ? "▾" : "▸"}</span>
          מילות מפתח ({kwList.length})
        </button>

        {showKw && (
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {kwList.map(kw => (
                <span key={kw} style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  padding: "3px 9px", borderRadius: 999,
                  background: "var(--paper-2)", border: "1px solid var(--line-strong)",
                  fontSize: 12, color: "var(--ink-2)",
                  fontFamily: "var(--font-mono)",
                }}>
                  {kw}
                  <button
                    onClick={() => removeKw(kw)}
                    style={{
                      background: "none", border: "none", padding: "0 0 0 2px",
                      cursor: "pointer", color: "var(--ink-4)", fontSize: 13,
                      lineHeight: 1, display: "flex", alignItems: "center",
                    }}
                    title="מחק מילת מפתח"
                  >×</button>
                </span>
              ))}
              {kwList.length === 0 && (
                <span style={{ fontSize: 12, color: "var(--ink-4)", fontStyle: "italic" }}>אין מילות מפתח</span>
              )}
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                value={newKw}
                onChange={e => setNewKw(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") addKw(); else if (e.key === "Escape") setNewKw(""); }}
                placeholder="הוסף מילת מפתח..."
                style={{
                  padding: "4px 10px", borderRadius: 8, fontSize: 12.5,
                  border: "1px solid var(--line-strong)", background: "var(--paper)",
                  color: "var(--ink)", outline: "none", fontFamily: "var(--font-mono)",
                  width: 160,
                }}
              />
              <button
                onClick={addKw}
                disabled={!newKw.trim()}
                style={{
                  padding: "4px 12px", borderRadius: 8, fontSize: 12,
                  border: "none",
                  background: newKw.trim() ? "var(--ink)" : "var(--paper-3)",
                  color: newKw.trim() ? "var(--paper)" : "var(--ink-4)",
                  fontWeight: 600, cursor: newKw.trim() ? "pointer" : "default",
                  fontFamily: "inherit",
                }}
              >הוסף</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


// ─── New course inline form ──────────────────────────────────
function NewCourseForm({ onCreate, onCancel }) {
  const { t } = window.useLang();
  const [name, setName] = useState("");
  const [color, setColor] = useState("#6B7280");

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    // color is always a valid #rrggbb from <input type="color">
    onCreate({ name: trimmed, color_dark: color.replace("#", "") });
  };

  return (
    <div style={{
      padding: 16,
      border: "1px solid var(--accent)",
      borderRadius: "var(--r-lg)",
      background: "var(--card)",
      display: "flex", flexDirection: "column", gap: 12,
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-2)", fontFamily: "var(--font-display)" }}>
        {t("addCourseTitle")}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 11, color: "var(--ink-3)", fontWeight: 500 }}>{t("addCourseName")}</span>
        <input
          autoFocus
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); else if (e.key === "Escape") onCancel(); }}
          style={{
            padding: "8px 12px", borderRadius: "var(--r-md)", fontSize: 14,
            border: "1px solid var(--line-strong)", background: "var(--paper)",
            color: "var(--ink)", outline: "none", fontFamily: "inherit",
          }}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontSize: 11, color: "var(--ink-3)", fontWeight: 500 }}>{t("addCourseColor")}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            style={{ width: 40, height: 36 }}
          />
          <span style={{
            fontSize: 12, color: "var(--ink-3)",
            fontFamily: "var(--font-mono)",
            padding: "4px 8px", borderRadius: 6,
            background: "var(--paper-2)", border: "1px solid var(--line)",
          }}>{color}</span>
          <span style={{ fontSize: 12, color: "var(--ink-4)" }}>← לחץ לבחור צבע</span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginInlineStart: "auto", marginTop: 2 }}>
        <button
          onClick={onCancel}
          style={{
            padding: "7px 16px", borderRadius: "var(--r-md)", fontSize: 13,
            border: "1px solid var(--line)", background: "transparent",
            color: "var(--ink-2)", cursor: "pointer", fontFamily: "inherit",
          }}
        >{t("addCourseCancel")}</button>
        <button
          onClick={submit}
          disabled={!name.trim()}
          style={{
            padding: "7px 16px", borderRadius: "var(--r-md)", fontSize: 13,
            border: "none",
            background: name.trim() ? "var(--ink)" : "var(--paper-3)",
            color: name.trim() ? "var(--paper)" : "var(--ink-4)",
            fontWeight: 600, cursor: name.trim() ? "pointer" : "default",
            fontFamily: "inherit", transition: "all .15s ease",
          }}
        >{t("addCourseSave")}</button>
      </div>
    </div>
  );
}

window.CoursesView = CoursesView;
window.NewCourseForm = NewCourseForm;
