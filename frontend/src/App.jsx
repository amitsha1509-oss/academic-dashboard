// Main app

const { useState, useEffect, useRef, useMemo } = React;

// Active views. Eisenhower driven by user-picked importance/urgency
// (binary: high vs not). Courses = self-confidence + gap notes per course.
// Context / Agenda views are still unmounted (not adapted).
const VIEWS = [
  { id: "all",        labelKey: "viewAll",        icon: "List" },
  { id: "subject",    labelKey: "viewSubject",    icon: "Layers" },
  { id: "eisenhower", labelKey: "viewEisenhower", icon: "Grid" },
  { id: "courses",    labelKey: "viewCourses",    icon: "Book" },
  { id: "schedule",   labelKey: "viewSchedule",   icon: "Calendar" },
];

// Heuristic mock classifier — handles English + Hebrew, returns next_steps for every task
function classifyMock(rawText) {
  const t = rawText.toLowerCase();
  const hebrew = window.isHebrew(rawText);

  // Subject: always use a valid course from DIMENSIONS so the task isn't orphaned
  // in GroupView. English categories ("university", "friends") don't match any
  // real course name. This fallback only runs when the backend is completely down.
  const _subjects = window.DIMENSIONS.subject || [];
  const subject = _subjects.includes("כללי") ? "כללי" : (_subjects[0] || "כללי");

  // Context — bilingual
  let context = "@anywhere";
  if (/(call|phone|text|message|sms|whatsapp)/.test(t)
      || /(להתקשר|טלפון|הודעה|סמס|וואטסאפ)/.test(rawText)) context = "@phone";
  else if (/(code|email|draft|doc|review|form|submit|computer|laptop|spreadsheet)/.test(t)
      || /(מייל|אימייל|מחשב|טופס|לכתוב|לערוך)/.test(rawText)) context = "@computer";
  else if (/(pickup|grocer|store|buy|errand|drive)/.test(t)
      || /(קניות|חנות|לקנות|לאסוף|בדרך)/.test(rawText)) context = "@errand";
  else if (/(home|house|apartment)/.test(t)
      || /(בית|דירה)/.test(rawText)) context = "@home";

  // Urgency
  const urgent = /(urgent|asap|now|today|tonight|immediately|tomorrow)/i.test(rawText)
      || /(דחוף|עכשיו|מיד|היום|הערב|מחר)/.test(rawText);
  const soonish = /(this week|next week|monday|tuesday|wednesday|thursday|friday|saturday|sunday|by friday|by monday)/i.test(rawText)
      || /(השבוע|השבוע הבא|יום ראשון|יום שני|יום שלישי|יום רביעי|יום חמישי|יום שישי|שבת|לפני)/.test(rawText);
  const urgency = urgent ? "high" : soonish ? "medium" : "low";

  // Importance
  const important = /(important|deadline|due|critical|exam|insurance|interview|surgery|wedding)/i.test(rawText)
      || /(חשוב|קריטי|מבחן|דדליין|ראיון|חתונה|ניתוח|בחינה)/.test(rawText);
  const importance = important ? "high" : (subject === "errands" || subject === "other") ? "low" : "medium";

  // Time parsing — bilingual
  let time_value = null;
  const now = new Date(window.NOW);
  const findHour = () => {
    const m = rawText.match(/(\d{1,2})\s*(am|pm)/i)
        || rawText.match(/בשעה\s*(\d{1,2})(?::(\d{2}))?/)
        || rawText.match(/\bב-?\s*(\d{1,2})(?::(\d{2}))?/);
    if (!m) return null;
    let h = parseInt(m[1], 10);
    const ampm = m[2] && /am|pm/i.test(m[2]) ? m[2].toLowerCase() : null;
    if (ampm === "pm" && h < 12) h += 12;
    if (ampm === "am" && h === 12) h = 0;
    return { h, m: m[2] && /^\d/.test(m[2]) ? parseInt(m[2], 10) : 0 };
  };
  const setOpt = (d, fallbackH = 12) => {
    const t = findHour();
    if (t) d.setHours(t.h, t.m || 0, 0, 0);
    else d.setHours(fallbackH, 0, 0, 0);
    return d;
  };
  if (/tomorrow|מחר/i.test(rawText)) {
    const d = new Date(now); d.setDate(d.getDate() + 1);
    time_value = setOpt(d, 9).toISOString();
  } else if (/today|tonight|היום|הערב/i.test(rawText)) {
    const d = new Date(now);
    const isEvening = /tonight|הערב/i.test(rawText);
    time_value = setOpt(d, isEvening ? 19 : (now.getHours() + 3)).toISOString();
  } else {
    const dayMap = {
      sunday: 0, sun: 0, "ראשון": 0,
      monday: 1, mon: 1, "שני": 1,
      tuesday: 2, tue: 2, "שלישי": 2,
      wednesday: 3, wed: 3, "רביעי": 3,
      thursday: 4, thu: 4, "חמישי": 4,
      friday: 5, fri: 5, "שישי": 5,
      saturday: 6, sat: 6, "שבת": 6,
    };
    let matchedDay = null;
    for (const [k, v] of Object.entries(dayMap)) {
      const re = new RegExp(`(^|\\s)${k}(\\s|$|,)`, "i");
      if (re.test(rawText) || (hebrew && rawText.includes(k))) { matchedDay = v; break; }
    }
    if (matchedDay !== null) {
      const d = new Date(now);
      while (d.getDay() !== matchedDay) d.setDate(d.getDate() + 1);
      time_value = setOpt(d, 17).toISOString();
    }
  }

  return { subject, context, importance, urgency, time_value, next_steps: [] };
}

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "light",
  "density": "comfortable",
  "accent": "terracotta",
  "weekStartsSunday": true,
  "language": "en",
  "direction": "auto",
  "autoDeleteDone": true
}/*EDITMODE-END*/;

const ACCENT_PRESETS = {
  terracotta: { accent: "#D9633A", accent2: "#2F5D50", accent3: "#2B4A6F" },
  cobalt:     { accent: "#3B5BDB", accent2: "#2F5D50", accent3: "#1E3A8A" },
  moss:       { accent: "#5A6B2C", accent2: "#2F5D50", accent3: "#3D4A1F" },
  plum:       { accent: "#6B3B7A", accent2: "#2F5D50", accent3: "#4A2855" },
};

function App({ user }) {
  const { t } = window.useLang();
  const [tasks, setTasks] = useState(window.SEED_TASKS || []);
  const [view, setView] = useState("all");
  const [classifying, setClassifying] = useState(false);
  const [editing, setEditing] = useState(null);
  const [freshIds, setFreshIds] = useState({});
  const [highlightedId, setHighlightedId] = useState(null);
  const [fadingIds, setFadingIds] = useState({});
  const [tw, setTw] = useState(TWEAK_DEFAULTS);
  const [loadError, setLoadError] = useState(null);
  const [showTutorial, setShowTutorial] = useState(false);
  const [noCourses, setNoCourses] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showScheduleTip, setShowScheduleTip] = useState(false);
  const captureSeedRef = useRef(null);

  // Load tasks + categories. Called on mount and whenever the tab becomes
  // visible again (catches stale state after switching apps on mobile).
  const loadData = React.useCallback(async () => {
    try {
      const [fromApi, cats] = await Promise.all([
        window.claudeAPI.listTasks(),
        window.claudeAPI.listCategories(),
      ]);
      cats.forEach(cat => {
        if (!window.SUBJECT_META[cat.name]) {
          window.SUBJECT_META[cat.name] = {
            color: "#" + (cat.color_dark || "6B7280"),
            icon: "Book",
            label: cat.name,
            bg: "#F3F4F6",
            mid: "#9CA3AF",
          };
        }
      });
      window.DIMENSIONS.subject = cats.map(c => c.name);
      setNoCourses(cats.length === 0);
      setTasks(fromApi);
      if (cats.length === 0) {
        setShowOnboarding(true);
      } else if (!window.userStorage.get("tutorial.v1.seen")) {
        setShowTutorial(true);
      }
    } catch (e) {
      console.error("Failed to load tasks from backend:", e);
      setLoadError(String(e.message || e));
    }
  }, []);

  useEffect(() => {
    loadData();
    const onVisible = () => { if (document.visibilityState === "visible") loadData(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [loadData]);

  // Apply theme + accent
  useEffect(() => {
    document.documentElement.dataset.theme = tw.theme;
    const preset = ACCENT_PRESETS[tw.accent] || ACCENT_PRESETS.terracotta;
    document.documentElement.style.setProperty("--accent", preset.accent);
    document.documentElement.style.setProperty("--accent-2", preset.accent2);
    document.documentElement.style.setProperty("--accent-3", preset.accent3);
  }, [tw.theme, tw.accent]);
  useEffect(() => {
    if (tw.language && tw.language !== window.getLang()) window.setLang(tw.language);
  }, [tw.language]);
  // Direction is independent of language: "auto" follows the language;
  // "ltr"/"rtl" override regardless of language.
  useEffect(() => {
    if (tw.direction && tw.direction !== window.getDir()) window.setDir(tw.direction);
  }, [tw.direction]);

  const handleCreate = async (raw, opts) => {
    setClassifying(true);
    let guess, serverTask;
    try {
      // classifyTask (shim) actually creates+persists on the backend and
      // stashes the full server-side task on window.__lastClassified.
      // opts may contain {importance, urgency} from CaptureBar — user-picked.
      guess = await window.claudeAPI.classifyTask(raw, window.DIMENSIONS, opts);
      serverTask = window.__lastClassified;
    } catch (e) {
      console.warn("Backend classify failed, using local heuristic:", e);
      guess = classifyMock(raw);
      serverTask = null;
    }
    {
      const newTask = serverTask ? {
        ...serverTask,
        next_steps: guess.next_steps || [],
        completed_steps: [],
        _isNew: true,
      } : {
        // Offline / heuristic fallback: keep a client-only task.
        id: "offline:" + Date.now(),
        raw_text: raw,
        subject: guess.subject,
        context: guess.context,
        importance: guess.importance,
        urgency: guess.urgency,
        time_value: guess.time_value,
        status: "open",
        created_at: new Date(window.NOW).toISOString().slice(0, 19).replace("T", " "),
        next_steps: guess.next_steps,
        completed_steps: [],
        _isNew: true,
      };
      setTasks(t => [newTask, ...t]);
      // After 3rd task entry: nudge about recurring schedule feature
      if (!window.userStorage.get("tips.scheduleTip.dismissed")) {
        const n = parseInt(window.userStorage.get("tips.taskCount") || "0", 10) + 1;
        window.userStorage.set("tips.taskCount", n);
        if (n === 3) setShowScheduleTip(true);
      }
      if (guess.next_steps && guess.next_steps.length) {
        setFreshIds(m => ({ ...m, [newTask.id]: true }));
        setTimeout(() => {
          setFreshIds(m => { const c = { ...m }; delete c[newTask.id]; return c; });
        }, 8000);
      }
      setClassifying(false);
    }
  };

  const handleToggleDone = (id) => {
    const cur = tasks.find(x => x.id === id);
    const nowDone = cur && cur.status !== "done";
    const nextStatus = nowDone ? "done" : "open";
    const prevStatus = cur ? cur.status : "open";
    setTasks(ts => ts.map(x => x.id === id ? { ...x, status: nextStatus } : x));
    window.claudeAPI.patchTask(id, { status: nextStatus }).catch(e => {
      console.warn(`patch status failed for ${id}:`, e.message);
      // Rollback optimistic update and tell the user.
      setTasks(ts => ts.map(x => x.id === id ? { ...x, status: prevStatus } : x));
      alert("לא הצלחנו לשמור — נסה שוב (" + e.message + ")");
    });
    if (tw.autoDeleteDone && nowDone) {
      // start fade after a brief delay so user sees the check
      setTimeout(() => {
        setFadingIds(m => ({ ...m, [id]: true }));
        setTimeout(() => {
          setTasks(ts => ts.filter(x => x.id !== id));
          setFadingIds(m => { const c = { ...m }; delete c[id]; return c; });
          // Auto-delete on the server too — keeps the DB in sync.
          // Skip recurring tasks: they 400 on DELETE by design (use status=skipped).
          if (!String(id).startsWith("r:")) {
            window.claudeAPI.deleteTask(id).catch(e =>
              console.warn(`auto-delete failed for ${id}:`, e.message)
            );
          }
        }, 700);
      }, 550);
    }
  };
  const handleDelete = (id) => {
    const removed = tasks.find(t => t.id === id);
    setTasks(ts => ts.filter(t => t.id !== id));
    window.claudeAPI.deleteTask(id).catch(e => {
      console.warn(`delete failed for ${id}:`, e.message);
      if (removed) setTasks(ts => [removed, ...ts]);
      alert("לא הצלחנו למחוק — נסה שוב (" + e.message + ")");
    });
  };
  const handleEdit = (t) => setEditing(t);
  // Open the edit dialog with a blank draft — used by "manual entry" path.
  // The draft has no id; handleSaveEdit detects this and routes to create.
  const handleStartManual = (rawText) => {
    if (!rawText || !rawText.trim()) return;
    const _subs = window.DIMENSIONS.subject || [];
    const defaultSubject = _subs.includes("כללי") ? "כללי" : (_subs[0] || "כללי");
    setEditing({
      // No id yet — signals "create with manual fields, skip AI"
      raw_text: rawText.trim(),
      subject: defaultSubject,
      context: "@anywhere",
      importance: "low",
      urgency: "low",
      time_value: null,
      status: "open",
    });
  };
  const handleSaveEdit = async (draft) => {
    if (draft.id == null) {
      // Manual create path: POST with all dims, backend skips AI.
      try {
        const created = await window.claudeAPI.createTask(draft.raw_text, {
          subject:    draft.subject,
          context:    draft.context,
          importance: draft.importance,
          urgency:    draft.urgency,
          time_value: draft.time_value,
        });
        setTasks(ts => [{ ...created, _isNew: true, completed_steps: [] }, ...ts]);
        if (!window.userStorage.get("tips.scheduleTip.dismissed")) {
          const n = parseInt(window.userStorage.get("tips.taskCount") || "0", 10) + 1;
          window.userStorage.set("tips.taskCount", n);
          if (n === 3) setShowScheduleTip(true);
        }
      } catch (e) {
        console.warn("manual create failed:", e.message);
        alert(window.t("alertCreateFailed") + ": " + e.message);
      }
      setEditing(null);
      return;
    }
    // Edit path: persist the changed dimension fields. Strip client-only.
    const { id, status, created_at, next_steps, completed_steps, _isNew, ...editable } = draft;
    // Recurring tasks: title/category_id live on the pattern and can't change
    // per-occurrence — strip them so the backend doesn't reject with 400.
    if (draft._source === "recurring") {
      delete editable.raw_text;
      delete editable.subject;
    }
    // Persist FIRST, then update local state on success — avoids "looks saved
    // but isn't" if the backend rejects the change.
    try {
      await window.claudeAPI.patchTask(draft.id, editable);
      setTasks(ts => ts.map(t => t.id === draft.id ? { ...t, ...draft } : t));
      setEditing(null);
    } catch (e) {
      console.warn(`save edit failed for ${draft.id}:`, e.message);
      alert("שגיאה בשמירה: " + e.message);
    }
  };
  const handleToggleStep = (id, step) => {
    setTasks(ts => ts.map(t => {
      if (t.id !== id) return t;
      const cs = t.completed_steps || [];
      const next = cs.includes(step) ? cs.filter(s => s !== step) : [...cs, step];
      return { ...t, completed_steps: next };
    }));
  };

  const closeTutorial = () => {
    window.userStorage.set("tutorial.v1.seen", true);
    setShowTutorial(false);
  };

  const onScrollToTask = (id) => {
    setView("all");
    setHighlightedId(id);
    setTimeout(() => {
      const el = document.querySelector(`[data-task-id="${id}"]`);
      if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 50);
    setTimeout(() => setHighlightedId(null), 3000);
  };

  // Tasks counter by view
  const openCount = tasks.filter(t => t.status === "open").length;
  const doneCount = tasks.filter(t => t.status === "done").length;

  const cardCommonProps = {
    onToggleDone: handleToggleDone,
    onDelete: handleDelete,
    onEdit: handleEdit,
    onToggleStep: handleToggleStep,
    freshIds,
    fadingIds,
    density: tw.density,
    onExampleClick: (txt) => { captureSeedRef.current?.(txt); },
  };

  const renderView = () => {
    switch (view) {
      case "all":        return <AllWrap key={view} highlightedId={highlightedId} tasks={tasks} {...cardCommonProps} />;
      case "subject":    return <window.GroupView tasks={tasks} groupBy="subject" {...cardCommonProps} />;
      case "context":    return <window.GroupView tasks={tasks} groupBy="context" {...cardCommonProps} />;
      case "eisenhower": return <window.EisenhowerView tasks={tasks} {...cardCommonProps} />;
      case "courses":    return <window.CoursesView onCoursesChanged={() => setNoCourses(false)} />;
      case "schedule":   return <window.ScheduleView onCoursesChanged={() => setNoCourses(false)} />;
      case "history":    return <window.HistoryView />;
      case "agenda":     return <window.AgendaView tasks={tasks} {...cardCommonProps} />;
    }
  };

  // Keyboard: ⌘K / Ctrl+K focuses capture; 1–6 switches views
  useEffect(() => {
    const onKey = (e) => {
      const inField = ["INPUT","TEXTAREA"].includes(document.activeElement?.tagName);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        document.querySelector("input[data-capture]")?.focus();
        return;
      }
      if (inField || editing) return;
      const idx = parseInt(e.key, 10);
      if (idx >= 1 && idx <= VIEWS.length) setView(VIEWS[idx-1].id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing]);

  return (
    <div style={{ minHeight: "100vh", paddingBottom: 80 }}>
      <div style={{ maxWidth: 920, margin: "0 auto", padding: "0 28px" }}>
        {/* Brand bar */}
        <div style={{
          display: "flex", alignItems: "center", gap: 14,
          paddingTop: 20, paddingBottom: 14,
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: "var(--ink)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "var(--paper)", fontSize: 14, fontWeight: 700,
          }}>N</div>
          <span style={{ fontSize: 24, fontWeight: 700, color: "var(--ink)", letterSpacing: "-.015em" }}>
            {t("brand")}
          </span>
          <span style={{
            padding: "3px 9px", borderRadius: 999, fontSize: 11,
            background: "var(--paper-2)", border: "1px solid var(--line)",
            color: "var(--ink-3)", fontFamily: "var(--font-mono)", fontWeight: 500,
          }}>
            {t("counter", openCount, doneCount)}
          </span>
          <span style={{ marginInlineStart: "auto", fontSize: 12, color: "var(--ink-3)" }}>
            {new Date(window.NOW).toLocaleDateString(window.getLang() === "he" ? "he-IL" : [], { weekday: "long", month: "long", day: "numeric" })}
          </span>
        </div>

        {loadError && (
          <div style={{
            margin: "12px 0",
            padding: "10px 14px",
            background: "rgba(217,99,58,.08)",
            border: "1px solid rgba(217,99,58,.3)",
            borderRadius: 10,
            color: "var(--ink-2)",
            fontSize: 13,
            display: "flex", justifyContent: "space-between", alignItems: "center",
            gap: 8,
          }}>
            <span><b>{t("backendOfflineTitle")}:</b> {loadError}. {t("backendOfflineBody")}</span>
            <button
              onClick={() => location.reload()}
              style={{
                padding: "5px 12px", borderRadius: 6, fontSize: 12,
                border: "1px solid var(--line)", background: "var(--card)",
                color: "var(--ink-2)", cursor: "pointer", whiteSpace: "nowrap",
              }}
            >{t("reload")}</button>
          </div>
        )}

        <div data-tutorial-id="capture">
          <CaptureBarHost
            onCreate={handleCreate}
            onStartManual={handleStartManual}
            classifying={classifying}
            captureSeedRef={captureSeedRef}
            noCourses={noCourses}
          />
        </div>

        <ViewSwitcher view={view} onChange={setView} tasks={tasks} />

        <div key={view} style={{ marginTop: 24, animation: "fade-in .35s ease" }}>
          {renderView()}
        </div>

        {/* SuggestionsPanel removed — academic dashboard uses a closed
            category list, no AI suggestions for new dimensions. */}

        {tasks.length > 0 && <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          marginTop: 48, paddingTop: 24,
          borderTop: "1px solid var(--line)",
          fontSize: 11, color: "var(--ink-4)",
        }}>
          <span style={{ fontSize: 12.5, color: "var(--ink-4)" }}>{t("tagline")}</span>
          <span style={{ display: "flex", gap: 10, fontFamily: "var(--font-mono)" }}>
            <Kbd>⌘K</Kbd>{t("kbdCapture")}
            <Kbd>1</Kbd>–<Kbd>6</Kbd>{t("kbdViews")}
            <Kbd>↵</Kbd>{t("kbdSend")}
          </span>
        </div>}
      </div>

      {editing && <window.EditDialog task={editing} onClose={() => setEditing(null)} onSave={handleSaveEdit} />}
      <TweaksHost tw={tw} setTw={setTw} user={user} onOpenHistory={() => setView("history")}
        onOpenOnboarding={() => {
          window.userStorage.set("onboarding.v1.done", "");
          setShowOnboarding(true);
        }}
      />
      <TutorialButton onOpen={() => setShowTutorial(true)} />
      <FeedbackButton />
      {showTutorial && <TutorialModal onClose={closeTutorial} />}
      {showScheduleTip && !showTutorial && !showOnboarding && (
        <ScheduleTip
          onClose={() => { window.userStorage.set("tips.scheduleTip.dismissed", "1"); setShowScheduleTip(false); }}
          onGoToSchedule={() => { setView("schedule"); window.userStorage.set("tips.scheduleTip.dismissed", "1"); setShowScheduleTip(false); }}
        />
      )}
      {showOnboarding && (
        <window.OnboardingWizard onComplete={() => {
          setShowOnboarding(false);
          setShowTutorial(true);
          window.claudeAPI.listCategories().then(cats => {
            cats.forEach(cat => {
              if (!window.SUBJECT_META[cat.name]) {
                window.SUBJECT_META[cat.name] = {
                  color: "#" + (cat.color_dark || "6B7280"),
                  icon: "Book", label: cat.name, bg: "#F3F4F6", mid: "#9CA3AF",
                };
              }
            });
            window.DIMENSIONS.subject = cats.map(c => c.name);
            setNoCourses(cats.length === 0);
          }).catch(() => {});
        }} />
      )}
    </div>
  );
}

function FeedbackButton() {
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState("");

  const close = () => {
    setOpen(false);
    setText("");
    setError("");
    setSent(false);
  };

  const send = async () => {
    const t = text.trim();
    if (!t) return;
    setBusy(true);
    setError("");
    try {
      await window.claudeAPI.submitFeedback(t, window.location.pathname + window.location.hash);
      setSent(true);
      setText("");
      setTimeout(close, 1500);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="שלח משוב"
        style={{
          position: "fixed",
          bottom: 20,
          insetInlineEnd: 20,
          zIndex: 100,
          padding: "10px 16px",
          borderRadius: 999,
          border: "1px solid var(--line)",
          background: "var(--card)",
          color: "var(--ink-2)",
          fontSize: 13,
          fontFamily: "inherit",
          fontWeight: 500,
          cursor: "pointer",
          boxShadow: "var(--shadow-2)",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <window.Icon.MessageCircle size={14} stroke={2} /> משוב
      </button>

      {open && (
        <div
          onClick={close}
          style={{
            position: "fixed", inset: 0, zIndex: 200,
            background: "rgba(0,0,0,.35)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 480, width: "100%",
              background: "var(--card)",
              border: "1px solid var(--line)",
              borderRadius: 14,
              boxShadow: "var(--shadow-2)",
              padding: 22,
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 600, color: "var(--ink)", marginBottom: 6 }}>
              שלח משוב
            </div>
            <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginBottom: 12 }}>
              מה היית רוצה לשפר? באג? רעיון? עמית יקרא את כל ההודעות.
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              autoFocus
              disabled={busy || sent}
              rows={5}
              maxLength={4000}
              placeholder="כתוב כאן..."
              style={{
                width: "100%", boxSizing: "border-box",
                padding: "10px 12px", fontSize: 14, fontFamily: "inherit",
                border: "1px solid var(--line)", borderRadius: 8,
                background: "var(--paper)", color: "var(--ink)",
                resize: "vertical", outline: "none",
              }}
            />
            {error && (
              <div style={{
                marginTop: 10, padding: "8px 12px", borderRadius: 8,
                background: "rgba(217,99,58,.08)", color: "var(--ink-2)",
                fontSize: 12.5,
              }}>{error}</div>
            )}
            {sent && (
              <div style={{
                marginTop: 10, padding: "8px 12px", borderRadius: 8,
                background: "rgba(80,160,90,.10)", color: "var(--ink-2)",
                fontSize: 12.5,
              }}>תודה! נשלח ✓</div>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
              <button
                onClick={close}
                disabled={busy}
                style={{
                  padding: "7px 14px", borderRadius: 8, fontSize: 13,
                  border: "1px solid var(--line)", background: "var(--card)",
                  color: "var(--ink-2)", cursor: busy ? "default" : "pointer",
                  fontFamily: "inherit",
                }}
              >ביטול</button>
              <button
                onClick={send}
                disabled={busy || sent || !text.trim()}
                style={{
                  padding: "7px 16px", borderRadius: 8, fontSize: 13,
                  border: "none", background: "var(--ink)", color: "var(--paper)",
                  cursor: (busy || sent || !text.trim()) ? "default" : "pointer",
                  fontFamily: "inherit", fontWeight: 600,
                  opacity: (busy || sent || !text.trim()) ? 0.5 : 1,
                }}
              >{busy ? "שולח..." : "שלח"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const TUTORIAL_STEPS = [
  {
    title: "ברוכים הבאים 👋",
    body: "שלושה דברים קצרים — ואז המערכת עובדת לבד.",
    icon: "Sparkles",
  },
  {
    title: "1 — הגדרת קורסים",
    body: "בלשונית 🎯 קורסים מוסיפים קורסים, עורכים צבעים ומוסיפים מילות מפתח (שם מרצה, קיצורים) — כדי שה-AI יסווג נכון.",
    icon: "Book",
    target: "courses",
  },
  {
    title: "2 — מערכת שעות",
    body: "הרצאות ותרגולים שחוזרים כל שבוע? מגדירים אותם פעם אחת — ומכאן הם מופיעים לבד מדי שבוע.",
    icon: "Calendar",
    target: "schedule",
  },
  {
    title: "3 — משימות חד-פעמיות",
    body: "כאן כותבים משימות שמופיעות פעם אחת: \"תרגיל 3 סטטיסטיקה עד שישי\". הרצאות ותרגולים קבועים שייכים למערכת שעות.",
    icon: "Pencil",
    target: "capture",
  },
];

function TutorialModal({ onClose }) {
  const [step, setStep] = React.useState(0);
  const total = TUTORIAL_STEPS.length;
  const cur = TUTORIAL_STEPS[step];
  const Ico = window.Icon[cur.icon] || window.Icon.Book;
  const isLast = step === total - 1;

  // Highlight the target UI element for the current step
  React.useEffect(() => {
    if (!cur.target) return;
    const el = document.querySelector(`[data-tutorial-id="${cur.target}"]`);
    if (!el) return;
    el.classList.add("tutorial-glow");
    return () => el.classList.remove("tutorial-glow");
  }, [step]);

  return (
    <div style={{
      position: "fixed",
      bottom: 80,
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: 300,
      maxWidth: 420,
      width: "calc(100vw - 32px)",
      background: "var(--card)",
      border: "1px solid var(--line)",
      borderRadius: 18,
      boxShadow: "var(--shadow-3)",
      padding: "18px 22px 16px",
      direction: "rtl",
      textAlign: "start",
      animation: "spring-in .35s cubic-bezier(.34,1.56,.64,1)",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontSize: 11, color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}>
          {step + 1}/{total}
        </span>
        <button
          onClick={onClose}
          style={{
            border: "none", background: "transparent",
            color: "var(--ink-3)", fontSize: 12,
            cursor: "pointer", padding: "2px 8px", borderRadius: 6,
            fontFamily: "inherit",
          }}
        >סגור</button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10, flexShrink: 0,
          background: "rgba(217,99,58,.1)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Ico size={18} stroke={1.5} style={{ color: "var(--accent)" }} />
        </div>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--ink)", lineHeight: 1.3 }}>
          {cur.title}
        </h2>
      </div>

      <p style={{
        margin: "0 0 14px",
        fontSize: 13, lineHeight: 1.65,
        color: "var(--ink-2)",
      }}>{cur.body}</p>

      {/* Footer: הקודם first → lands on the right in RTL; הבא second → left; dots opposite side */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 6 }}>
          {step > 0 && (
            <button
              onClick={() => setStep(s => s - 1)}
              style={{
                padding: "6px 14px", borderRadius: 8, fontSize: 12,
                border: "1px solid var(--line)", background: "var(--card)",
                color: "var(--ink-2)", cursor: "pointer", fontFamily: "inherit",
              }}
            >הקודם</button>
          )}
          <button
            onClick={() => isLast ? onClose() : setStep(s => s + 1)}
            style={{
              padding: "6px 18px", borderRadius: 8, fontSize: 12,
              border: "none", background: "var(--ink)", color: "var(--paper)",
              fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
            }}
          >{isLast ? "סיום" : "הבא"}</button>
        </div>
        <div style={{ display: "flex", gap: 5 }}>
          {TUTORIAL_STEPS.map((_, i) => (
            <div key={i} style={{
              width: i === step ? 16 : 5, height: 5, borderRadius: 999,
              background: i === step ? "var(--accent)" : "var(--line)",
              transition: "all .2s ease",
            }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ScheduleTip({ onClose, onGoToSchedule }) {
  return (
    <div style={{
      position: "fixed",
      bottom: 120,
      insetInlineEnd: 20,
      zIndex: 200,
      maxWidth: 290,
      background: "var(--card)",
      border: "1px solid var(--line)",
      borderRadius: 14,
      boxShadow: "var(--shadow-3)",
      padding: "14px 16px",
      direction: "rtl",
      textAlign: "start",
      animation: "spring-in .35s cubic-bezier(.34,1.56,.64,1)",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", marginBottom: 4, letterSpacing: ".05em", textTransform: "uppercase" }}>טיפ</div>
          <div style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.6 }}>
            יש לך הרצאות קבועות? הגדר אותן פעם אחת — המשימות ייווצרו לבד כל שבוע.
          </div>
        </div>
        <button onClick={onClose} style={{ border: "none", background: "transparent", color: "var(--ink-4)", fontSize: 18, cursor: "pointer", padding: 0, lineHeight: 1, flexShrink: 0 }}>×</button>
      </div>
      <button
        onClick={onGoToSchedule}
        style={{ padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, border: "none", background: "var(--ink)", color: "var(--paper)", cursor: "pointer", fontFamily: "inherit" }}
      >
        למערכת שעות ←
      </button>
    </div>
  );
}

function TutorialButton({ onOpen }) {
  return (
    <button
      onClick={onOpen}
      title="מדריך למשתמש"
      style={{
        position: "fixed",
        bottom: 70,
        insetInlineEnd: 20,
        zIndex: 100,
        width: 36, height: 36,
        borderRadius: 999,
        border: "1px solid var(--line)",
        background: "var(--card)",
        color: "var(--ink-3)",
        fontSize: 16, fontWeight: 700,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        boxShadow: "var(--shadow-2)",
        fontFamily: "var(--font-sans)",
      }}
    >?</button>
  );
}

function Kbd({ children }) {
  return (
    <kbd style={{
      display: "inline-block", padding: "1px 5px", borderRadius: 4,
      background: "var(--paper-2)", border: "1px solid var(--line)",
      fontSize: 10, color: "var(--ink-3)", fontFamily: "var(--font-mono)",
      lineHeight: 1.4,
    }}>{children}</kbd>
  );
}

// Wrap to give "All" view task highlighting + data-task-id refs
function AllWrap({ tasks, highlightedId, ...rest }) {
  const sorted = [...tasks].sort((a, b) => b.id - a.id);
  if (sorted.length === 0) return <window.EmptyState onPick={rest.onExampleClick} />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {sorted.map(t => (
        <div key={t.id} data-task-id={t.id}>
          <window.TaskCard task={t} {...rest} isFresh={!!rest.freshIds?.[t.id]} highlighted={highlightedId === t.id} />
        </div>
      ))}
    </div>
  );
}

function CaptureBarHost({ onCreate, onStartManual, classifying, captureSeedRef, noCourses }) {
  return <window.CaptureBar
    onCreate={onCreate}
    onStartManual={onStartManual}
    classifying={classifying}
    seedRef={captureSeedRef}
    noCourses={noCourses}
  />;
}

function ViewSwitcher({ view, onChange, tasks }) {
  const { t } = window.useLang();
  const visibleViews = VIEWS;
  return (
    <div style={{
      display: "flex", gap: 2, padding: 4,
      background: "var(--paper-2)",
      border: "1px solid var(--line)",
      borderRadius: 12,
      overflowX: "auto",
    }}>
      {visibleViews.map((v, i) => {
        const Ico = window.Icon[v.icon];
        const active = view === v.id;
        const label = t(v.labelKey);
        return (
          <button key={v.id} data-tutorial-id={v.id} onClick={() => onChange(v.id)} style={{
            display: "inline-flex", alignItems: "center", gap: 7,
            padding: "8px 14px", borderRadius: 9,
            border: "none",
            background: active ? "var(--card)" : "transparent",
            color: active ? "var(--ink)" : "var(--ink-3)",
            fontSize: 13, fontWeight: active ? 600 : 500,
            boxShadow: active ? "var(--shadow-1)" : "none",
            transition: "all .15s ease",
            whiteSpace: "nowrap",
            flexShrink: 0,
            position: "relative",
          }}
          title={`${label} (${i+1})`}>
            <Ico size={14} stroke={2} />
            {label}
          </button>
        );
      })}
    </div>
  );
}

function AboutMeEditor() {
  const { t } = window.useLang();
  const [text, setText] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved

  useEffect(() => {
    window.claudeAPI.getUserContext()
      .then(d => { setText(d.text || ""); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []);

  const save = async () => {
    setSaveState("saving");
    try {
      await window.claudeAPI.setUserContext(text);
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 1800);
    } catch (e) {
      console.warn("setUserContext failed:", e.message);
      setSaveState("idle");
      alert(window.t("alertSaveFailed") + ": " + e.message);
    }
  };

  const isHebrew = window.isHebrew(text);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <p style={{ fontSize: 12, color: "var(--ink-3)", margin: 0, lineHeight: 1.45 }}>
        {t("tweaksAboutMeSub")}
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t("tweaksAboutMePlaceholder")}
        disabled={!loaded}
        rows={5}
        dir={isHebrew ? "rtl" : "ltr"}
        style={{
          width: "100%", padding: "10px 12px", borderRadius: 10,
          border: "1px solid var(--line)", background: "var(--paper-2)",
          color: "var(--ink)", fontSize: 13, lineHeight: 1.5,
          fontFamily: isHebrew ? "Heebo, var(--font-sans)" : "var(--font-sans)",
          resize: "vertical", outline: "none",
        }}
      />
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button
          onClick={save}
          disabled={!loaded || saveState === "saving"}
          style={{
            padding: "6px 14px", borderRadius: 8, fontSize: 12,
            border: "none", background: "var(--ink)", color: "var(--paper)",
            fontWeight: 600, cursor: "pointer",
          }}
        >
          {saveState === "saving" ? t("tweaksSaving") : t("tweaksSave")}
        </button>
        {saveState === "saved" && (
          <span style={{ fontSize: 12, color: "var(--ink-3)" }}>✓ {t("tweaksSaved")}</span>
        )}
      </div>
    </div>
  );
}

function TweaksHost({ tw, setTw, user, onOpenHistory, onOpenOnboarding }) {
  const { t } = window.useLang();
  const TP = window.TweaksPanel;
  const TS = window.TweakSection;
  const TT = window.TweakToggle;
  if (!TP) return null;

  const doLogout = async () => {
    await window.claudeAPI.authLogout();
    location.reload();
  };

  return (
    <TP title={t("tweaksTitle")}>
      {user && (
        <TS label={user.name || user.email}>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            fontSize: 12, color: "var(--ink-3)",
          }}>
            <span style={{ fontFamily: "var(--font-mono)" }}>{user.email}</span>
            <button
              onClick={doLogout}
              style={{
                padding: "5px 12px", borderRadius: 8, fontSize: 12,
                border: "1px solid var(--line)", background: "var(--card)",
                color: "var(--ink-2)", cursor: "pointer", fontFamily: "inherit",
              }}
            >{t("logout")}</button>
          </div>
        </TS>
      )}
      <TS label="ארכיון">
        <button
          onClick={onOpenHistory}
          style={{
            padding: "6px 14px", borderRadius: 8, fontSize: 12,
            border: "1px solid var(--line)", background: "var(--card)",
            color: "var(--ink-2)", cursor: "pointer", fontFamily: "inherit",
            display: "inline-flex", alignItems: "center", gap: 6,
          }}
        ><window.Icon.Book size={13} stroke={1.8} /> פתח ארכיון</button>
      </TS>
      <TS label="קורסים ומערכת שעות">
        <p style={{ margin: "0 0 8px", fontSize: 11, color: "var(--ink-3)", lineHeight: 1.4 }}>
          הגדרת קורסים, מועדים ומערכת שעות שבועית
        </p>
        <button
          onClick={onOpenOnboarding}
          style={{
            padding: "6px 14px", borderRadius: 8, fontSize: 12,
            border: "1px solid var(--line)", background: "var(--card)",
            color: "var(--ink-2)", cursor: "pointer", fontFamily: "inherit",
            display: "inline-flex", alignItems: "center", gap: 6,
          }}
        >🎓 הגדרה מחדש</button>
      </TS>
      <TS label={t("tweaksAboutMe")}>
        <AboutMeEditor />
      </TS>
      <TS label={t("tweaksLayout")}>
        <TT
          label={t("tweaksAutoDelete")}
          value={!!tw.autoDeleteDone}
          onChange={(v) => setTw(s => ({ ...s, autoDeleteDone: v }))}
        />
      </TS>
    </TP>
  );
}

// ─── Auth gate: fetch /auth/me, then mount the right tree ────────────
//
// /auth/me returns the current user (200) or 401. We use this single call
// to decide whether to render the dashboard or a "Sign in" screen. It also
// stashes window.__USER_ID, which the per-user localStorage helper reads
// to namespace UI preferences (so two users sharing a browser don't bleed).

function LoginScreen({ error }) {
  const { t } = window.useLang();
  const [busy, setBusy] = React.useState(false);
  const [showError, setShowError] = React.useState(error || "");
  const [devUsers, setDevUsers] = React.useState(null);  // null=unknown, []=not dev
  const [pickedUserId, setPickedUserId] = React.useState(1);
  const apiBase = window.location.origin.startsWith("http://localhost")
    ? "http://localhost:8001" : "";

  // On mount, probe /auth/dev_users — but only when running on localhost.
  // Even if DEV_MODE=1 is accidentally left on in production, the picker
  // will never appear for anyone visiting the deployed URL.
  React.useEffect(() => {
    const onLocalhost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
    if (!onLocalhost) { setDevUsers([]); return; }
    fetch(`${apiBase}/auth/dev_users`, { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then(users => setDevUsers(users))
      .catch(() => setDevUsers([]));
  }, []);

  const isDevMode = Array.isArray(devUsers) && devUsers.length > 0;

  // Production sign-in: redirect to Google OAuth.
  const signInWithGoogle = (e) => {
    e.preventDefault();
    window.location.replace(`${apiBase}/auth/google/login`);
  };

  // Dev sign-in as the picked user.
  const signInAsDevUser = async (e) => {
    e.preventDefault();
    setBusy(true);
    setShowError("");
    try {
      const r = await fetch(`${apiBase}/auth/dev_login?user_id=${pickedUserId}`,
                            { credentials: "include" });
      if (r.ok) {
        window.location.replace("/app/");
        return;
      }
      const detail = await r.text();
      setShowError(`Login failed: ${r.status} ${detail}`);
      setBusy(false);
    } catch (e2) {
      setShowError(e2.message || "התחברות נכשלה. נסה שוב.");
      setBusy(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20, fontFamily: "var(--font-sans)",
    }}>
      <div style={{
        maxWidth: 420, width: "100%",
        background: "var(--card)",
        border: "1px solid var(--line)",
        borderRadius: 18,
        boxShadow: "var(--shadow-2)",
        padding: 32,
        textAlign: "center",
      }}>
        <h1 style={{
          fontSize: 28, fontWeight: 700, color: "var(--ink)",
          margin: 0, marginBottom: 8,
        }}>{t("loginTitle")}</h1>
        <p style={{ color: "var(--ink-3)", fontSize: 14, lineHeight: 1.5, margin: "0 0 24px" }}>
          {t("loginSubtitle")}
        </p>
        <button
          onClick={signInWithGoogle}
          disabled={busy}
          style={{
            display: "inline-flex", alignItems: "center", gap: 10,
            padding: "10px 20px", borderRadius: 10,
            border: "none", cursor: busy ? "default" : "pointer",
            background: "var(--ink)", color: "var(--paper)",
            fontWeight: 600, fontSize: 14, fontFamily: "inherit",
            opacity: busy ? 0.6 : 1,
          }}
        >
          <span>G</span>
          <span>{busy ? t("schSaving") : t("loginButton")}</span>
        </button>

        {isDevMode && (
          <div style={{
            marginTop: 24, padding: "12px 14px",
            background: "var(--paper-2)", borderRadius: 10,
            border: "1px dashed var(--line-strong)",
            textAlign: "start", fontSize: 12,
          }}>
            <div style={{ color: "var(--ink-3)", marginBottom: 8, fontWeight: 600 }}>
              Dev mode — pick a user (no Google needed)
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <select
                value={pickedUserId}
                onChange={(e) => setPickedUserId(parseInt(e.target.value, 10))}
                style={{
                  flex: 1, minWidth: 0,
                  padding: "5px 8px", borderRadius: 7, fontSize: 12.5,
                  border: "1px solid var(--line)", background: "var(--card)",
                  color: "var(--ink)", outline: "none", fontFamily: "inherit",
                }}
              >
                {devUsers.map(u => (
                  <option key={u.id} value={u.id}>
                    #{u.id} · {u.name || u.email}
                  </option>
                ))}
              </select>
              <button
                onClick={signInAsDevUser}
                disabled={busy}
                style={{
                  padding: "6px 14px", borderRadius: 7, fontSize: 12,
                  border: "1px solid var(--line)",
                  background: "var(--card)", color: "var(--ink-2)",
                  cursor: busy ? "default" : "pointer", fontFamily: "inherit",
                  opacity: busy ? 0.6 : 1,
                }}
              >Sign in</button>
            </div>
          </div>
        )}

        {showError && (
          <div style={{
            marginTop: 18, padding: "10px 14px", borderRadius: 8,
            background: "rgba(217,99,58,.08)", color: "var(--ink-2)",
            fontSize: 13, textAlign: "start",
          }}>{showError}</div>
        )}
      </div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div style={{
      minHeight: "100vh",
      display: "flex", alignItems: "center", justifyContent: "center",
      color: "var(--ink-3)", fontSize: 14,
    }}>טוען...</div>
  );
}

function Bootstrap() {
  const [authState, setAuthState] = React.useState({ status: "loading" });

  React.useEffect(() => {
    let cancelled = false;
    window.claudeAPI.authMe()
      .then(user => {
        if (cancelled) return;
        if (user) {
          window.__USER_ID = user.id;
          window.__USER = user;
          setAuthState({ status: "signed-in", user });
        } else {
          setAuthState({ status: "signed-out" });
        }
      })
      .catch(e => {
        if (cancelled) return;
        setAuthState({ status: "signed-out", error: e.message });
      });
    return () => { cancelled = true; };
  }, []);

  if (authState.status === "loading") return <LoadingScreen />;
  if (authState.status === "signed-out") return <LoginScreen error={authState.error} />;
  return <App user={authState.user} />;
}

ReactDOM.createRoot(document.getElementById("root")).render(<Bootstrap />);
