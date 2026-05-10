// Onboarding wizard — shown to new users (no courses yet) after OAuth login.
// Collects courses + recurring schedule in one flow so the dashboard is ready
// from day one. Stores completion in userStorage so it only shows once.

const PRESET_COLORS = [
  "#4F86C6", "#E07B54", "#5BAD6F", "#9B6BC8",
  "#D4875A", "#4AABB8", "#C95F7A", "#7A9E5F",
];

const KIND_OPTIONS = [
  { v: "lecture",  label: "הרצאה" },
  { v: "tutorial", label: "תרגול" },
  { v: "hw",       label: "שיעורי בית" },
  { v: "reading",  label: "קריאה" },
];

const DAY_OPTIONS = [
  { v: "Sun", label: "ראשון" },
  { v: "Mon", label: "שני" },
  { v: "Tue", label: "שלישי" },
  { v: "Wed", label: "רביעי" },
  { v: "Thu", label: "חמישי" },
  { v: "Fri", label: "שישי" },
];

let _colorIdx = 0;
function nextColor() {
  return PRESET_COLORS[_colorIdx++ % PRESET_COLORS.length];
}

function newCourse()  { return { id: Math.random(), name: "", color: nextColor() }; }
function newPattern() { return { id: Math.random(), courseIdx: 0, kind: "lecture", day_of_week: null, start_time: "", end_time: "" }; }

// ─── shared style tokens ────────────────────────────────────────────────
const inputSt = (w) => ({
  padding: "6px 10px", borderRadius: 8, fontSize: 13,
  border: "1px solid var(--line)", background: "var(--paper)",
  color: "var(--ink)", fontFamily: "inherit", width: w || "auto",
  outline: "none",
});
const selectSt = (w) => ({
  ...inputSt(w), appearance: "none", cursor: "pointer", paddingInlineEnd: 24,
  backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23888'/%3E%3C/svg%3E\")",
  backgroundRepeat: "no-repeat",
  backgroundPosition: "left 8px center",
});
const btnPrimary = {
  padding: "9px 24px", borderRadius: 10, fontSize: 13, fontWeight: 700,
  border: "none", background: "var(--ink)", color: "var(--paper)",
  cursor: "pointer", fontFamily: "inherit",
};
const btnSecondary = {
  padding: "9px 18px", borderRadius: 10, fontSize: 13,
  border: "1px solid var(--line)", background: "transparent",
  color: "var(--ink-2)", cursor: "pointer", fontFamily: "inherit",
};

// ─── Step 1: Courses ────────────────────────────────────────────────────
function CoursesStep({ courses, setCourses }) {
  const add    = () => setCourses(cs => [...cs, newCourse()]);
  const remove = (id) => setCourses(cs => cs.filter(c => c.id !== id));
  const patch  = (id, field, val) =>
    setCourses(cs => cs.map(c => c.id === id ? { ...c, [field]: val } : c));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {courses.map((c, i) => (
        <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="color"
            value={c.color}
            onChange={e => patch(c.id, "color", e.target.value)}
            style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid var(--line)", padding: 2, cursor: "pointer", background: "none" }}
          />
          <input
            type="text"
            placeholder={`קורס ${i + 1}`}
            value={c.name}
            onChange={e => patch(c.id, "name", e.target.value)}
            style={{ ...inputSt(null), flex: 1 }}
            autoFocus={i === 0}
          />
          {courses.length > 1 && (
            <button
              onClick={() => remove(c.id)}
              style={{ border: "none", background: "transparent", color: "var(--ink-4)", fontSize: 18, cursor: "pointer", lineHeight: 1, padding: "0 4px" }}
            >×</button>
          )}
        </div>
      ))}
      <button onClick={add} style={{ ...btnSecondary, alignSelf: "flex-start", fontSize: 12, padding: "6px 14px" }}>
        + הוסף קורס
      </button>
    </div>
  );
}

// ─── Step 2: Schedule ───────────────────────────────────────────────────
function ScheduleStep({ patterns, setPatterns, courses }) {
  const validCourses = courses.filter(c => c.name.trim());
  const add    = () => setPatterns(ps => [...ps, newPattern()]);
  const remove = (id) => setPatterns(ps => ps.filter(p => p.id !== id));
  const patch  = (id, field, val) =>
    setPatterns(ps => ps.map(p => p.id === id ? { ...p, [field]: val } : p));

  if (validCourses.length === 0) {
    return <div style={{ color: "var(--ink-3)", fontSize: 13 }}>אין קורסים — חזור לשלב הקודם.</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {patterns.length === 0 && (
        <div style={{ fontSize: 13, color: "var(--ink-3)", padding: "6px 0" }}>
          לא חובה — אפשר להוסיף מאוחר יותר ממערכת שעות.
        </div>
      )}
      {patterns.map((p) => (
        <div key={p.id} style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", padding: "8px 10px", background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 10 }}>
          <select
            value={p.courseIdx}
            onChange={e => patch(p.id, "courseIdx", Number(e.target.value))}
            style={selectSt(120)}
          >
            {validCourses.map((c, i) => (
              <option key={i} value={i}>{c.name}</option>
            ))}
          </select>
          <select
            value={p.kind}
            onChange={e => patch(p.id, "kind", e.target.value)}
            style={selectSt(110)}
          >
            {KIND_OPTIONS.map(k => <option key={k.v} value={k.v}>{k.label}</option>)}
          </select>
          <select
            value={p.day_of_week ?? ""}
            onChange={e => patch(p.id, "day_of_week", e.target.value || null)}
            style={selectSt(90)}
          >
            <option value="">יום</option>
            {DAY_OPTIONS.map(d => <option key={d.v} value={d.v}>{d.label}</option>)}
          </select>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 11, color: "var(--ink-3)", whiteSpace: "nowrap" }}>התחלה</span>
            <input
              type="time"
              value={p.start_time}
              onChange={e => patch(p.id, "start_time", e.target.value)}
              style={inputSt(96)}
            />
          </div>
          {(p.kind === "lecture" || p.kind === "tutorial") && (
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 11, color: "var(--ink-3)", whiteSpace: "nowrap" }}>סיום</span>
              <input
                type="time"
                value={p.end_time}
                onChange={e => patch(p.id, "end_time", e.target.value)}
                style={inputSt(96)}
              />
            </div>
          )}
          <button
            onClick={() => remove(p.id)}
            style={{ border: "none", background: "transparent", color: "var(--ink-4)", fontSize: 18, cursor: "pointer", lineHeight: 1, padding: "0 4px", marginInlineStart: "auto" }}
          >×</button>
        </div>
      ))}
      <button onClick={add} style={{ ...btnSecondary, alignSelf: "flex-start", fontSize: 12, padding: "6px 14px" }}>
        + הוסף שיעור חוזר
      </button>
    </div>
  );
}

// ─── Main wizard ────────────────────────────────────────────────────────
function OnboardingWizard({ onComplete }) {
  const [step, setStep]       = React.useState(0);  // 0=welcome 1=courses 2=saving
  const [courses, setCourses] = React.useState([newCourse()]);
  const [error, setError]     = React.useState(null);

  const validCourses = courses.filter(c => c.name.trim());

  const skip = () => {
    window.userStorage.set("onboarding.v1.done", true);
    onComplete();
  };

  const save = async () => {
    setStep(2);
    setError(null);
    try {
      const existingCats = await window.claudeAPI.listCategories();
      const existingByName = {};
      existingCats.forEach(c => { existingByName[c.name.trim().toLowerCase()] = c.id; });

      for (const c of validCourses) {
        const name = c.name.trim();
        if (existingByName[name.toLowerCase()]) continue;
        await window.claudeAPI.createCategory({
          name,
          color_dark: c.color.replace("#", ""),
          keywords: "",
        });
      }
      window.userStorage.set("onboarding.v1.done", true);
      onComplete();
    } catch (e) {
      const msg = e?.message || String(e);
      setError("שגיאה בשמירה — " + (msg.includes("409") ? "קורס עם שם זה כבר קיים" : msg));
      setStep(1);
    }
  };

  const STEPS = [
    {
      title: "ברוכים הבאים לאקדמיה 🎓",
      sub: "שאלה קצרה אחת — ואפשר להתחיל מיד.",
    },
    {
      title: "אילו קורסים יש לך?",
      sub: "שם וצבע לכל קורס — ה-AI יסווג לפיהם את המשימות אוטומטית.",
    },
  ];

  const cur = STEPS[step] || STEPS[0];

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 400,
      background: "var(--paper)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20,
    }}>
      <div style={{
        maxWidth: 520, width: "100%",
        background: "var(--card)",
        border: "1px solid var(--line)",
        borderRadius: 20,
        boxShadow: "var(--shadow-3)",
        padding: "28px 28px 24px",
        direction: "rtl", textAlign: "start",
        animation: "spring-in .35s cubic-bezier(.34,1.56,.64,1)",
        maxHeight: "90vh",
        overflowY: "auto",
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <div style={{ display: "flex", gap: 5 }}>
            {[0, 1].map(i => (
              <div key={i} style={{
                width: i === step ? 18 : 6, height: 6, borderRadius: 999,
                background: i === step ? "var(--accent)" : i < step ? "var(--ink-3)" : "var(--line)",
                transition: "all .2s",
              }} />
            ))}
          </div>
          {step < 2 && (
            <button onClick={skip} style={{ border: "none", background: "transparent", color: "var(--ink-4)", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
              דלג
            </button>
          )}
        </div>

        {/* Title */}
        <h2 style={{ margin: "14px 0 6px", fontSize: 22, fontWeight: 700, color: "var(--ink)" }}>
          {step === 2 ? "שומר…" : cur.title}
        </h2>
        {step !== 2 && (
          <p style={{ margin: "0 0 20px", fontSize: 13, color: "var(--ink-3)", lineHeight: 1.6 }}>
            {cur.sub}
          </p>
        )}

        {/* Step content */}
        {step === 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.6 }}>
              כותבים משימה — ה-AI מסווג אותה לקורס הנכון לבד. כך נראה הלוח:
            </div>
            {/* Mini dashboard preview */}
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {[
                { color: "#4F86C6", title: "תרגיל 3 — להגיש עד יום ראשון", tag: "חשבון", urgency: null },
                { color: "#E07B54", title: "לקרוא פרק 4 לפני ההרצאה", tag: "פיזיקה", urgency: null },
                { color: "#5BAD6F", title: "לסכם הרצאה מהשבוע", tag: "כלכלה", urgency: null },
              ].map((task, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  background: "var(--paper)", borderRadius: 8,
                  padding: "8px 10px",
                  border: "1px solid var(--line)",
                  borderInlineStart: `3px solid ${task.color}`,
                }}>
                  <div style={{ flex: 1, fontSize: 12.5, color: "var(--ink)" }}>{task.title}</div>
                  <span style={{ fontSize: 11, color: "white", background: task.color, borderRadius: 4, padding: "1px 7px", whiteSpace: "nowrap" }}>{task.tag}</span>
                  {task.urgency && <span style={{ fontSize: 11, color: "var(--urg-high)", fontWeight: 600 }}>{task.urgency}</span>}
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
              כל מה שצריך — שם וצבע לכל קורס. השאר קורה לבד.
            </div>
          </div>
        )}
        {step === 1 && (
          <CoursesStep courses={courses} setCourses={setCourses} />
        )}
        {step === 2 && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--ink-3)", fontSize: 13, padding: "10px 0" }}>
            <div style={{ width: 18, height: 18, borderRadius: 999, border: "2px solid var(--accent)", borderTopColor: "transparent", animation: "thinking-dot 1s linear infinite" }} />
            שומר קורסים…
          </div>
        )}

        {error && (
          <div style={{ color: "var(--urg-high)", fontSize: 12, marginTop: 8 }}>{error}</div>
        )}

        {/* Footer: הקודם first → lands on the right in RTL; primary second → left */}
        {step < 2 && (
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-start", marginTop: 22 }}>
            {step > 0 && (
              <button onClick={() => setStep(s => s - 1)} style={btnSecondary}>הקודם</button>
            )}
            {step === 0 && (
              <button onClick={() => setStep(1)} style={btnPrimary}>בואו נתחיל ←</button>
            )}
            {step === 1 && (
              <button
                onClick={save}
                disabled={validCourses.length === 0}
                style={{ ...btnPrimary, opacity: validCourses.length === 0 ? 0.4 : 1 }}
              >
                {validCourses.length > 0 ? `שמור והתחל (${validCourses.length} קורסים)` : "שמור והתחל"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

window.OnboardingWizard = OnboardingWizard;
