// Capture bar — sticky top, rotating placeholder, "thinking" state

function CaptureBar({ onCreate, onStartManual, classifying, seedRef }) {
  const [val, setVal] = React.useState("");
  const [focused, setFocused] = React.useState(false);
  const [pickedImp, setPickedImp] = React.useState(null);  // 5=high, 2=low, null=let system decide
  const [pickedUrg, setPickedUrg] = React.useState(null);
  const [pickedDue, setPickedDue] = React.useState("");    // ISO datetime-local string
  const [showDuePicker, setShowDuePicker] = React.useState(false);
  const inputRef = React.useRef(null);
  const { t } = window.useLang();

  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);

  React.useEffect(() => {
    if (seedRef) {
      seedRef.current = (txt) => {
        setVal(txt);
        setTimeout(() => inputRef.current?.focus(), 50);
      };
    }
    return () => { if (seedRef) seedRef.current = null; };
  }, [seedRef]);

  const rtl = window.isHebrew(val) || val === "";
  // Convert datetime-local string "2026-05-04T14:00" → ISO with local offset
  const _toIso = (local) => {
    if (!local) return null;
    const d = new Date(local);
    const pad = n => String(n).padStart(2, "0");
    const off = -d.getTimezoneOffset();
    const sign = off >= 0 ? "+" : "-";
    const oh = pad(Math.floor(Math.abs(off) / 60));
    const om = pad(Math.abs(off) % 60);
    return `${local}:00${sign}${oh}:${om}`;
  };

  const submit = () => {
    if (!val.trim() || classifying) return;
    onCreate(val.trim(), {
      importance: pickedImp,
      urgency: pickedUrg,
      due_at: pickedDue ? _toIso(pickedDue) : null,
    });
    setVal("");
    setPickedImp(null);
    setPickedUrg(null);
    setPickedDue("");
    setShowDuePicker(false);
  };

  const PriBtn = ({ axis, level, label }) => {
    const picked = axis === "imp" ? pickedImp : pickedUrg;
    const setter = axis === "imp" ? setPickedImp : setPickedUrg;
    const active = picked === level;
    return (
      <button
        type="button"
        onClick={() => setter(active ? null : level)}
        style={{
          padding: "3px 11px",
          borderRadius: 999,
          border: active ? "2px solid transparent" : "1.5px solid var(--line-strong)",
          background: active ? (level === 5 ? "#DC2626" : "#6B7280") : "var(--card)",
          color: active ? "white" : "var(--ink-2)",
          fontWeight: active ? 600 : 400,
          fontSize: 11.5,
          cursor: "pointer",
          fontFamily: "inherit",
          transition: "all 0.12s",
        }}
      >{label}</button>
    );
  };

  const Send = window.Icon.Send;
  const Sparkles = window.Icon.Sparkles;

  return (
    <div style={{
      position: "sticky", top: 0, zIndex: 20,
      background: "linear-gradient(to bottom, var(--paper) 70%, rgba(245,241,234,0))",
      paddingTop: 24, paddingBottom: 28,
    }}>
      <div style={{
        position: "relative",
        background: classifying ? "var(--card-hover)" : "var(--card)",
        border: "1px solid var(--line)",
        borderRadius: 18,
        boxShadow: focused ? "0 0 0 4px rgba(217,99,58,.08), var(--shadow-2)" : "var(--shadow-1)",
        transition: "all .25s cubic-bezier(.4,0,.2,1)",
        overflow: "hidden",
      }}>
        {/* Thinking shimmer */}
        {classifying && (
          <div style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(90deg, transparent 0%, rgba(217,99,58,.08) 30%, rgba(217,99,58,.16) 50%, rgba(217,99,58,.08) 70%, transparent 100%)",
            backgroundSize: "200% 100%",
            animation: "shimmer-stripe 1.4s linear infinite",
            pointerEvents: "none",
          }}/>
        )}

        <div style={{ display: "flex", alignItems: "center", paddingBlock: 4, paddingInlineStart: 18, paddingInlineEnd: 4, gap: 10, position: "relative" }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 28, height: 28, flexShrink: 0,
            color: classifying ? "var(--accent)" : "var(--ink-3)",
            animation: classifying ? "pulse-soft 1.2s ease-in-out infinite" : "none",
          }}>
            <Sparkles size={18} stroke={1.7} />
          </div>

          <input
            ref={inputRef}
            value={val}
            data-capture
            dir={rtl ? "rtl" : "ltr"}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="הוסף משימה..."
            disabled={classifying}
            style={{
              flex: 1,
              border: "none", outline: "none", background: "transparent",
              fontSize: 18, fontWeight: 400,
              color: "var(--ink)",
              padding: "16px 0",
              fontFamily: rtl ? "Heebo, var(--font-sans)" : "var(--font-sans)",
              direction: rtl ? "rtl" : "ltr",
              textAlign: rtl ? "right" : "left",
              minWidth: 0,
            }}
          />

          {classifying && (
            <div style={{ display: "flex", gap: 4, padding: "0 12px", color: "var(--accent)" }}>
              {[0,1,2].map(i => (
                <span key={i} style={{
                  display: "block", width: 6, height: 6, borderRadius: 999, background: "currentColor",
                  animation: `thinking-dot 1.2s ease-in-out infinite ${i * 0.16}s`,
                }}/>
              ))}
            </div>
          )}

          {/* Due date button */}
          <button
            type="button"
            onClick={() => setShowDuePicker(s => !s)}
            disabled={classifying}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 38, height: 38, borderRadius: 12,
              border: pickedDue ? "2px solid var(--accent)" : "1px solid var(--line)",
              background: pickedDue ? "rgba(217,99,58,.08)" : "transparent",
              color: pickedDue ? "var(--accent)" : (classifying ? "var(--ink-4)" : "var(--ink-2)"),
              cursor: classifying ? "default" : "pointer",
              transition: "all .15s ease",
              flexShrink: 0,
              fontSize: 15,
              marginInlineEnd: 2,
            }}
            title="בחר תאריך יעד"
          >
            📅
          </button>

          {/* Manual-entry button: skip AI, set dimensions yourself. */}
          {onStartManual && (
            <button
              onClick={() => { if (val.trim() && !classifying) { onStartManual(val.trim()); setVal(""); } }}
              disabled={!val.trim() || classifying}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 38, height: 38, borderRadius: 12,
                border: "1px solid var(--line)",
                background: "transparent",
                color: val.trim() && !classifying ? "var(--ink-2)" : "var(--ink-4)",
                cursor: val.trim() && !classifying ? "pointer" : "default",
                transition: "all .15s ease",
                flexShrink: 0,
                fontSize: 11, fontWeight: 600,
                letterSpacing: ".02em",
                marginInlineEnd: 4,
              }}
              title={t("manualEntryTitle")}
            >
              ✎
            </button>
          )}

          <button
            onClick={submit}
            disabled={!val.trim() || classifying}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 44, height: 44, borderRadius: 14,
              border: "none",
              background: val.trim() && !classifying ? "var(--ink)" : "var(--paper-3)",
              color: val.trim() && !classifying ? "var(--paper)" : "var(--ink-4)",
              transition: "all .18s ease",
              flexShrink: 0,
            }}
            title={t("add") + " (↵)"}
          >
            <Send size={17} stroke={2} />
          </button>
        </div>

        {/* Due date picker — shown when user clicks the calendar button */}
        {showDuePicker && (
          <div style={{
            padding: "6px 18px 10px",
            display: "flex", alignItems: "center", gap: 10,
            borderTop: "1px solid var(--line)",
          }}>
            <span style={{ fontSize: 12, color: "var(--ink-3)", flexShrink: 0 }}>תאריך יעד:</span>
            <input
              type="datetime-local"
              value={pickedDue}
              onChange={e => setPickedDue(e.target.value)}
              style={{
                border: "1px solid var(--line-strong)",
                borderRadius: 8,
                padding: "4px 8px",
                fontSize: 12.5,
                color: "var(--ink)",
                background: "var(--card)",
                fontFamily: "inherit",
                cursor: "pointer",
              }}
            />
            {pickedDue && (
              <button
                type="button"
                onClick={() => setPickedDue("")}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  color: "var(--ink-3)", fontSize: 14, padding: "2px 4px",
                }}
                title="נקה תאריך"
              >✕</button>
            )}
          </div>
        )}

        {/* Importance / urgency selectors — user choice wins over AI guess */}
        <div style={{
          padding: "0 18px 12px",
          display: "flex",
          gap: 14,
          flexWrap: "wrap",
          alignItems: "center",
          fontSize: 12,
          color: "var(--ink-3)",
        }}>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            חשיבות:
            <PriBtn axis="imp" level={5} label="חשוב" />
            <PriBtn axis="imp" level={2} label="לא חשוב" />
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            דחיפות:
            <PriBtn axis="urg" level={5} label="דחוף" />
            <PriBtn axis="urg" level={2} label="לא דחוף" />
          </span>
          <span style={{ color: "var(--ink-4)", fontStyle: "italic", fontSize: 11 }}>
            (לא תבחר ⇒ ייקבע לפי הפרופיל שלך)
          </span>
        </div>

        {classifying && (
          <div style={{
            padding: "0 22px 14px",
            fontSize: 12.5, color: "var(--ink-3)",
            display: "flex", alignItems: "center", gap: 8,
            fontStyle: "italic",
          }}>
            <span className="serif" style={{ fontSize: 14 }}>{t("thinking")}</span>
            <span style={{ color: "var(--ink-4)" }}>· {t("classifying")}</span>
          </div>
        )}
      </div>
    </div>
  );
}

window.CaptureBar = CaptureBar;
