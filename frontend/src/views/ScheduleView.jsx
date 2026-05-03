// Schedule view — Settings page for the weekly recurring patterns.
// Lets the user list/edit/add/delete the 29 lectures, tutorials, HW, readings
// per course, and set per-pattern default importance/urgency.
//
// Save model: debounced 600ms for text fields; immediate for dropdown / button
// changes. keepalive: true on every fetch so saves survive tab-close / SPA nav.
// Same pattern as CoursesView (gap_notes textarea) which was hardened in
// session 2 against the Defender SQLite-lock bug.

const SCHEDULE_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SCHEDULE_KINDS = ["lecture", "tutorial", "hw", "reading"];

function ScheduleView() {
  const { t } = window.useLang();
  const [patterns, setPatterns] = React.useState(null);
  const [categories, setCategories] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [adding, setAdding] = React.useState(null);      // category_id of group in "add pattern" mode
  const [addingCourse, setAddingCourse] = React.useState(false);

  const reload = React.useCallback(async () => {
    try {
      const [pats, cats] = await Promise.all([
        window.claudeAPI.listPatterns(),
        window.claudeAPI.listCategories(),
      ]);
      setPatterns(pats);
      setCategories(cats);
      setError(null);
    } catch (e) {
      setError(e.message || String(e));
    }
  }, []);

  React.useEffect(() => { reload(); }, [reload]);

  // Optimistic patch — update local state immediately, fire request in background.
  // On error: alert + reload to truth from server.
  const patchLocally = (id, fields) => {
    setPatterns(ps => ps.map(p => p.id === id ? { ...p, ...fields } : p));
  };
  const sendPatch = async (id, fields) => {
    try {
      await window.claudeAPI.patchPattern(id, fields);
    } catch (e) {
      alert(t("alertSaveFailed") + ": " + e.message);
      reload();
    }
  };

  const handleDelete = async (pattern) => {
    if (!confirm(t("schConfirmDelete"))) return;
    setPatterns(ps => ps.filter(p => p.id !== pattern.id));
    try {
      await window.claudeAPI.deletePattern(pattern.id);
    } catch (e) {
      alert(t("alertDeleteFailed") + ": " + e.message);
      reload();
    }
  };

  const handleCreate = async (payload) => {
    try {
      const created = await window.claudeAPI.createPattern(payload);
      setPatterns(ps => [...ps, created]);
      setAdding(null);
    } catch (e) {
      alert(t("alertCreateFailed") + ": " + e.message);
    }
  };

  const handleCreateCourse = async (payload) => {
    try {
      const created = await window.claudeAPI.createCategory(payload);
      setCategories(cs => [...cs, created].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)));
      setAddingCourse(false);
    } catch (e) {
      alert(t("alertCreateFailed") + ": " + e.message);
    }
  };

  const handleDeleteCourse = async (cat) => {
    if (!confirm(`למחוק את הקורס "${cat.name}"?\nכל האירועים שלו יימחקו גם כן.`)) return;
    try {
      await window.claudeAPI.deleteCategory(cat.id);
      setCategories(cs => cs.filter(c => c.id !== cat.id));
      setPatterns(ps => ps.filter(p => p.category_id !== cat.id));
    } catch (e) {
      alert("מחיקה נכשלה: " + e.message);
      reload();
    }
  };

  if (error) {
    return (
      <div style={{
        padding: 24, borderRadius: 12, color: "var(--ink-2)",
        background: "rgba(217,99,58,.08)", border: "1px solid rgba(217,99,58,.3)",
      }}>
        {t("backendOfflineTitle")}: {error}
      </div>
    );
  }
  if (!patterns || !categories) {
    return <div style={{ padding: 32, textAlign: "center", color: "var(--ink-3)" }}>טוען...</div>;
  }

  if (categories.length === 0) {
    return (
      <div style={{
        padding: 32, textAlign: "center",
        color: "var(--ink-2)", fontSize: 14, lineHeight: 1.6,
        background: "var(--paper-2)", borderRadius: "var(--r-md)",
        border: "1px dashed var(--line)",
      }}>{t("schEmptyNoCategories")}</div>
    );
  }

  // Group patterns by category_id, sorted by category sort_order.
  const sortedCats = [...categories].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const byCat = {};
  for (const p of patterns) {
    if (!byCat[p.category_id]) byCat[p.category_id] = [];
    byCat[p.category_id].push(p);
  }

  const setAll = (open) => {
    sortedCats.forEach(cat => {
      window.userStorage.set(`collapse.schedule.cat.${cat.id}`, open ? "1" : "0");
    });
    window.dispatchEvent(new Event("nucleus:collapse-changed"));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <window.CollapseAllBar onCollapseAll={() => setAll(false)} onExpandAll={() => setAll(true)} />
        {!addingCourse && (
          <button
            onClick={() => setAddingCourse(true)}
            style={{
              padding: "5px 14px", borderRadius: 999, fontSize: 11.5,
              border: "1px solid var(--line)", background: "var(--paper-2)",
              color: "var(--ink-3)", cursor: "pointer", fontFamily: "inherit",
              whiteSpace: "nowrap",
            }}
          >+ קורס חדש</button>
        )}
      </div>
      {addingCourse && (
        <window.NewCourseForm
          onCreate={handleCreateCourse}
          onCancel={() => setAddingCourse(false)}
        />
      )}
      {sortedCats.map(cat => {
        const groupPats = byCat[cat.id] || [];
        const accent = "#" + (cat.color_dark || "6B7280");
        const header = (
          <>
            <span style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 22, height: 22, borderRadius: 7,
              background: accent, color: "var(--paper)",
              fontSize: 11, fontWeight: 700,
            }}>{cat.name[0]}</span>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>
              {cat.name}
            </span>
          </>
        );
        const deleteBtn = (
          <button
            onClick={(e) => { e.stopPropagation(); handleDeleteCourse(cat); }}
            style={{
              padding: "3px 10px", borderRadius: 6, fontSize: 11.5,
              border: "1px solid var(--urg-high)", background: "transparent",
              color: "var(--urg-high)", cursor: "pointer", fontFamily: "inherit",
            }}
          >מחק</button>
        );
        return (
          <window.CollapsibleGroup
            key={cat.id}
            storageKey={`schedule.cat.${cat.id}`}
            defaultOpen={true}
            header={header}
            count={groupPats.length}
            accentColor={accent}
            trailing={deleteBtn}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {groupPats.length === 0 ? (
                <div style={{ padding: 12, fontSize: 12.5, color: "var(--ink-3)", fontStyle: "italic" }}>
                  {t("schEmpty")}
                </div>
              ) : (
                groupPats.map(p => (
                  <PatternRow
                    key={p.id}
                    pattern={p}
                    onLocalPatch={(fields) => patchLocally(p.id, fields)}
                    onSendPatch={(fields) => sendPatch(p.id, fields)}
                    onDelete={() => handleDelete(p)}
                  />
                ))
              )}
              {adding === cat.id ? (
                <NewPatternForm
                  categoryId={cat.id}
                  onCancel={() => setAdding(null)}
                  onCreate={handleCreate}
                />
              ) : (
                <button
                  onClick={() => setAdding(cat.id)}
                  style={{
                    alignSelf: "flex-start",
                    padding: "6px 14px", borderRadius: 8, fontSize: 12.5,
                    border: "1px dashed var(--line-strong)",
                    background: "transparent", color: "var(--ink-3)",
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                >{t("schAddPattern")}</button>
              )}
            </div>
          </window.CollapsibleGroup>
        );
      })}
    </div>
  );
}

// ─── Single editable pattern row ──────────────────────────────────────
function PatternRow({ pattern, onLocalPatch, onSendPatch, onDelete }) {
  const { t } = window.useLang();
  const pendingTimer = React.useRef(null);
  const pendingFields = React.useRef({});

  // Apply locally + queue a debounced server write. Multiple text edits within
  // the window are coalesced into one PATCH.
  const debouncedPatch = (fields) => {
    onLocalPatch(fields);
    pendingFields.current = { ...pendingFields.current, ...fields };
    if (pendingTimer.current) clearTimeout(pendingTimer.current);
    pendingTimer.current = setTimeout(() => {
      const f = pendingFields.current;
      pendingFields.current = {};
      pendingTimer.current = null;
      onSendPatch(f);
    }, 600);
  };
  // Immediate variant for dropdown / button toggles.
  const immediatePatch = (fields) => {
    if (pendingTimer.current) {
      clearTimeout(pendingTimer.current);
      const merged = { ...pendingFields.current, ...fields };
      pendingFields.current = {};
      pendingTimer.current = null;
      onLocalPatch(fields);
      onSendPatch(merged);
    } else {
      onLocalPatch(fields);
      onSendPatch(fields);
    }
  };

  // Flush on unmount / tab-hide / page-unload — same belt-and-suspenders pattern
  // as CoursesView's gap_notes save (the Defender-bug fix).
  React.useEffect(() => {
    const flush = () => {
      if (pendingTimer.current) {
        clearTimeout(pendingTimer.current);
        const f = pendingFields.current;
        pendingFields.current = {};
        pendingTimer.current = null;
        onSendPatch(f);
      }
    };
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", flush);
    return () => {
      flush();
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("pagehide", flush);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isHw = pattern.kind === "hw" || pattern.kind === "reading";

  return (
    <div style={{
      padding: 12,
      border: "1px solid var(--line)",
      borderRadius: 10,
      background: "var(--paper-2)",
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
        <Field label={t("schKindLabel")}>
          <KindSelect value={pattern.kind} onChange={(v) => immediatePatch({ kind: v })} />
        </Field>
        <Field label={t("schPatternLabel")}>
          <input
            type="text"
            value={pattern.label || ""}
            onChange={(e) => debouncedPatch({ label: e.target.value })}
            style={inputStyle(180)}
          />
        </Field>
        <Field label={t("schDay")}>
          <DaySelect value={pattern.day_of_week} onChange={(v) => immediatePatch({ day_of_week: v || null })} />
        </Field>
        <Field label={t("schStartTime")}>
          <input
            type="time"
            value={pattern.start_time || ""}
            onChange={(e) => debouncedPatch({ start_time: e.target.value || null })}
            style={inputStyle(110)}
          />
        </Field>
        <Field label={t("schEndTime")}>
          <input
            type="time"
            value={pattern.end_time || ""}
            onChange={(e) => debouncedPatch({ end_time: e.target.value || null })}
            style={inputStyle(110)}
          />
        </Field>
      </div>

      {isHw && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
          <Field label={t("schHwReleaseDay")}>
            <DaySelect value={pattern.hw_release_day} onChange={(v) => immediatePatch({ hw_release_day: v || null })} />
          </Field>
          <Field label={t("schHwReleaseTime")}>
            <input
              type="time"
              value={pattern.hw_release_time || ""}
              onChange={(e) => debouncedPatch({ hw_release_time: e.target.value || null })}
              style={inputStyle(110)}
            />
          </Field>
          <Field label={t("schHwDueOffsetDays")}>
            <input
              type="number"
              min="0" max="14"
              value={pattern.hw_due_offset_days ?? ""}
              onChange={(e) => {
                const n = e.target.value === "" ? null : Math.max(0, Math.min(14, parseInt(e.target.value, 10) || 0));
                debouncedPatch({ hw_due_offset_days: n });
              }}
              style={inputStyle(80)}
            />
          </Field>
          <Field label={t("schHwDueTime")}>
            <input
              type="time"
              value={pattern.hw_due_time || ""}
              onChange={(e) => debouncedPatch({ hw_due_time: e.target.value || null })}
              style={inputStyle(110)}
            />
          </Field>
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center" }}>
        <BinaryPicker
          label={t("schImportance")}
          value={pattern.default_importance}
          highLabel={t("schImportant")}
          lowLabel={t("schNotImportant")}
          noneLabel={t("schNoOverride")}
          onChange={(v) => immediatePatch({ default_importance: v })}
        />
        <BinaryPicker
          label={t("schUrgency")}
          value={pattern.default_urgency}
          highLabel={t("schUrgent")}
          lowLabel={t("schNotUrgent")}
          noneLabel={t("schNoOverride")}
          onChange={(v) => immediatePatch({ default_urgency: v })}
        />
        <label style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          fontSize: 12, color: "var(--ink-2)", userSelect: "none",
        }}>
          <input
            type="checkbox"
            checked={!!pattern.is_required}
            onChange={(e) => immediatePatch({ is_required: e.target.checked })}
          />
          {t("schRequired")}
        </label>

        <button
          onClick={onDelete}
          style={{
            marginInlineStart: "auto",
            padding: "5px 12px", borderRadius: 8, fontSize: 12,
            border: "1px solid var(--urg-high)",
            background: "transparent", color: "var(--urg-high)",
            cursor: "pointer", fontFamily: "inherit",
          }}
        >{t("schDelete")}</button>
      </div>
    </div>
  );
}

// ─── New-pattern form (inline) ────────────────────────────────────────
function NewPatternForm({ categoryId, onCancel, onCreate }) {
  const { t } = window.useLang();
  const [draft, setDraft] = React.useState({
    category_id: categoryId,
    kind: "lecture",
    label: "",
    day_of_week: null,
    start_time: null,
    end_time: null,
    is_required: false,
    default_importance: null,
    default_urgency: null,
  });

  const isHw = draft.kind === "hw" || draft.kind === "reading";
  const set = (fields) => setDraft(d => ({ ...d, ...fields }));

  const submit = () => {
    const payload = { ...draft };
    // Strip empty strings → null so backend Pydantic Optional/null check is happy.
    for (const k of Object.keys(payload)) {
      if (payload[k] === "") payload[k] = null;
    }
    onCreate(payload);
  };

  return (
    <div style={{
      padding: 12,
      border: "1px solid var(--accent)",
      borderRadius: 10,
      background: "var(--card)",
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-2)" }}>
        {t("schAddPatternTitle")}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
        <Field label={t("schKindLabel")}>
          <KindSelect value={draft.kind} onChange={(v) => set({ kind: v })} />
        </Field>
        <Field label={t("schPatternLabel")}>
          <input
            type="text"
            value={draft.label || ""}
            onChange={(e) => set({ label: e.target.value })}
            style={inputStyle(180)}
          />
        </Field>
        <Field label={t("schDay")}>
          <DaySelect value={draft.day_of_week} onChange={(v) => set({ day_of_week: v || null })} />
        </Field>
        <Field label={t("schStartTime")}>
          <input
            type="time"
            value={draft.start_time || ""}
            onChange={(e) => set({ start_time: e.target.value || null })}
            style={inputStyle(110)}
          />
        </Field>
        <Field label={t("schEndTime")}>
          <input
            type="time"
            value={draft.end_time || ""}
            onChange={(e) => set({ end_time: e.target.value || null })}
            style={inputStyle(110)}
          />
        </Field>
      </div>

      {isHw && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
          <Field label={t("schHwReleaseDay")}>
            <DaySelect value={draft.hw_release_day} onChange={(v) => set({ hw_release_day: v || null })} />
          </Field>
          <Field label={t("schHwReleaseTime")}>
            <input
              type="time"
              value={draft.hw_release_time || ""}
              onChange={(e) => set({ hw_release_time: e.target.value || null })}
              style={inputStyle(110)}
            />
          </Field>
          <Field label={t("schHwDueOffsetDays")}>
            <input
              type="number"
              min="0" max="14"
              value={draft.hw_due_offset_days ?? ""}
              onChange={(e) => {
                const n = e.target.value === "" ? null : Math.max(0, Math.min(14, parseInt(e.target.value, 10) || 0));
                set({ hw_due_offset_days: n });
              }}
              style={inputStyle(80)}
            />
          </Field>
          <Field label={t("schHwDueTime")}>
            <input
              type="time"
              value={draft.hw_due_time || ""}
              onChange={(e) => set({ hw_due_time: e.target.value || null })}
              style={inputStyle(110)}
            />
          </Field>
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center" }}>
        <BinaryPicker
          label={t("schImportance")}
          value={draft.default_importance}
          highLabel={t("schImportant")}
          lowLabel={t("schNotImportant")}
          noneLabel={t("schNoOverride")}
          onChange={(v) => set({ default_importance: v })}
        />
        <BinaryPicker
          label={t("schUrgency")}
          value={draft.default_urgency}
          highLabel={t("schUrgent")}
          lowLabel={t("schNotUrgent")}
          noneLabel={t("schNoOverride")}
          onChange={(v) => set({ default_urgency: v })}
        />
        <label style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          fontSize: 12, color: "var(--ink-2)", userSelect: "none",
        }}>
          <input
            type="checkbox"
            checked={!!draft.is_required}
            onChange={(e) => set({ is_required: e.target.checked })}
          />
          {t("schRequired")}
        </label>
      </div>

      <div style={{ display: "flex", gap: 8, marginInlineStart: "auto" }}>
        <button
          onClick={onCancel}
          style={{
            padding: "6px 14px", borderRadius: 8, fontSize: 12,
            border: "1px solid var(--line)", background: "transparent",
            color: "var(--ink-2)", cursor: "pointer", fontFamily: "inherit",
          }}
        >{t("schCancel")}</button>
        <button
          onClick={submit}
          style={{
            padding: "6px 14px", borderRadius: 8, fontSize: 12,
            border: "none", background: "var(--ink)", color: "var(--paper)",
            fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
          }}
        >{t("schSave")}</button>
      </div>
    </div>
  );
}

// ─── Small reused atoms ───────────────────────────────────────────────
function Field({ label, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{
        fontSize: 10.5, color: "var(--ink-3)",
        textTransform: "uppercase", letterSpacing: ".05em",
      }}>{label}</span>
      {children}
    </div>
  );
}

function KindSelect({ value, onChange }) {
  const { t } = window.useLang();
  const labelOf = {
    lecture: t("schKindLecture"),
    tutorial: t("schKindTutorial"),
    hw: t("schKindHw"),
    reading: t("schKindReading"),
  };
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle(120)}>
      {SCHEDULE_KINDS.map(k => <option key={k} value={k}>{labelOf[k]}</option>)}
    </select>
  );
}

function DaySelect({ value, onChange }) {
  const { t } = window.useLang();
  const labelOf = {
    Sun: t("schDaySun"), Mon: t("schDayMon"), Tue: t("schDayTue"),
    Wed: t("schDayWed"), Thu: t("schDayThu"), Fri: t("schDayFri"),
    Sat: t("schDaySat"),
  };
  return (
    <select value={value || ""} onChange={(e) => onChange(e.target.value)} style={inputStyle(110)}>
      <option value="">{t("schDayUnset")}</option>
      {SCHEDULE_DAYS.map(d => <option key={d} value={d}>{labelOf[d]}</option>)}
    </select>
  );
}

function BinaryPicker({ label, value, highLabel, lowLabel, noneLabel, onChange }) {
  // value: null | low scale | high scale. We store 5 (high) / 1 (low) / null.
  const Btn = ({ v, txt, color }) => {
    const active = value === v || (v === null && value == null);
    return (
      <button
        onClick={() => onChange(v)}
        style={{
          padding: "4px 10px", borderRadius: 999, fontSize: 11.5,
          border: active ? "2px solid transparent" : "1.5px solid var(--line-strong)",
          background: active ? color : "var(--card)",
          color: active ? "white" : "var(--ink-2)",
          fontWeight: active ? 600 : 400,
          cursor: "pointer", fontFamily: "inherit",
        }}
      >{txt}</button>
    );
  };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      fontSize: 12, color: "var(--ink-2)",
    }}>
      {label}:
      <Btn v={null} txt={noneLabel} color="#94A3B8" />
      <Btn v={5} txt={highLabel} color="#DC2626" />
      <Btn v={1} txt={lowLabel} color="#6B7280" />
    </span>
  );
}

function inputStyle(width) {
  return {
    padding: "5px 8px", borderRadius: 7, fontSize: 12.5,
    border: "1px solid var(--line)", background: "var(--card)",
    color: "var(--ink)", outline: "none",
    width, fontFamily: "inherit",
  };
}

window.ScheduleView = ScheduleView;
