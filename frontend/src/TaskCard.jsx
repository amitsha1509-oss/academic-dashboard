// Task card — raw text, dimension chips, urgency edge, persistent side-steps checklist
function TaskCard({ task, onToggleDone, onDelete, onEdit, onToggleStep, onDismissNextSteps, density = "comfortable", highlighted, isFresh, fadingIds }) {
  const [hover, setHover] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [stepsOpen, setStepsOpen] = React.useState(false);
  const { t } = window.useLang();
  const done = task.status === "done";
  const fading = !!fadingIds?.[task.id];
  const rtl = window.isHebrew(task.raw_text);
  const urgColor = window.URGENCY_COLOR[task.urgency] || "transparent";
  const compact = density === "compact";

  const Check = window.Icon.Check;
  const Trash = window.Icon.Trash;
  const X = window.Icon.X;
  const ChevronDown = window.Icon.ChevronDown;
  const Sparkles = window.Icon.Sparkles;

  const steps = task.next_steps || [];
  const completedSteps = task.completed_steps || [];
  const remaining = steps.filter(s => !completedSteps.includes(s)).length;

  return (
    <div
      className={fading ? "task-fading" : ""}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setConfirming(false); }}
      onClick={(e) => {
        if (e.target.closest("[data-action]")) return;
        onEdit?.(task);
      }}
      style={{
        position: "relative",
        background: hover ? "var(--card-hover)" : "var(--card)",
        border: highlighted ? "1px solid var(--accent)" : "1px solid var(--line)",
        borderRadius: 12,
        paddingBlock: compact ? 10 : 14,
        paddingInlineStart: compact ? 18 : 22,
        paddingInlineEnd: compact ? 14 : 16,
        boxShadow: hover
          ? "0 6px 20px -4px rgba(28,27,25,.14), 0 1px 4px rgba(28,27,25,.08)"
          : (task.urgency === "high" && !done ? "0 0 0 1.5px rgba(194,74,42,.18), var(--shadow-1)" : "var(--shadow-1)"),
        transform: hover ? "translateY(-3px)" : "translateY(0)",
        transition: "all .18s cubic-bezier(.4,0,.2,1)",
        cursor: "pointer",
        opacity: done ? 0.5 : 1,
        animation: highlighted ? "pulse-soft 1.5s ease-in-out 2" : (task._isNew ? "spring-in .4s cubic-bezier(.34,1.56,.64,1)" : "none"),
      }}
    >
      {/* Urgency edge — wider for high urgency */}
      <div style={{
        position: "absolute", insetInlineStart: 0, top: 6, bottom: 6,
        width: task.urgency === "high" ? 4 : 3,
        background: urgColor, borderStartEndRadius: 3, borderEndEndRadius: 3,
        opacity: done ? 0.4 : 1,
      }}/>

      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        {/* Done checkbox */}
        <button
          data-action="done"
          onClick={() => onToggleDone?.(task.id)}
          style={{
            flexShrink: 0, marginTop: 2,
            width: 18, height: 18, borderRadius: 999,
            border: `1.5px solid ${done ? "var(--accent-2)" : "var(--line-strong)"}`,
            background: done ? "var(--accent-2)" : "transparent",
            color: "var(--card)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 0,
            transition: "all .15s ease",
          }}
          title={done ? t("markOpen") : t("markDone")}
        >
          {done && <Check size={11} stroke={3} />}
        </button>

        {/* Body */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            dir={rtl ? "rtl" : "ltr"}
            className={rtl ? "rtl" : ""}
            style={{
              fontSize: compact ? 14 : 15.5,
              fontWeight: 450,
              lineHeight: 1.45,
              color: "var(--ink)",
              textDecoration: done ? "line-through" : "none",
              wordBreak: "break-word",
            }}
          >
            {task.raw_text}
          </div>

          <div style={{
            display: "flex", flexWrap: "wrap", gap: 6,
            marginTop: compact ? 6 : 9,
            direction: "ltr",
          }}>
            <window.SubjectChip subject={task.subject} size={compact ? "sm" : "md"} />
            {task.time_value && <window.TimeChip iso={task.time_value} />}
            <window.LevelChip kind="urgency" value={task.urgency} />
            <window.LevelChip kind="importance" value={task.importance} />
          </div>

          {/* Side-steps — persistent collapsible checklist */}
          {steps.length > 0 && !done && (
            <div style={{
              marginTop: 10,
              border: "1px solid var(--line)",
              borderRadius: 10,
              background: isFresh ? "rgba(217,99,58,.06)" : "var(--paper-2)",
              overflow: "hidden",
              transition: "background .3s ease",
            }}>
              <button
                data-action="toggle-steps"
                onClick={() => setStepsOpen(o => !o)}
                style={{
                  width: "100%", border: "none", background: "transparent",
                  padding: "10px 12px",
                  display: "flex", alignItems: "center", gap: 8,
                  fontSize: 12, color: "var(--ink-2)",
                  cursor: "pointer", textAlign: "start",
                  lineHeight: 1.4,
                }}
              >
                <Sparkles size={12} stroke={2} style={{ color: "var(--accent)", flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--accent)" }}>
                  {t("sideSteps")}
                </span>
                <span style={{ color: "var(--ink-3)", fontFamily: "var(--font-mono)", fontSize: 10.5 }}>
                  {remaining}/{steps.length}
                </span>
                <span style={{
                  marginInlineStart: "auto",
                  display: "inline-flex",
                  transform: stepsOpen ? "rotate(180deg)" : "rotate(0)",
                  transition: "transform .2s ease",
                  color: "var(--ink-3)",
                }}>
                  <ChevronDown size={13} stroke={2} />
                </span>
              </button>

              {stepsOpen && (
                <div style={{
                  padding: "8px 12px 10px",
                  display: "flex", flexDirection: "column", gap: 4,
                  borderTop: "1px solid var(--line)",
                  animation: "fade-in .2s ease",
                }}>
                  {steps.map((s, i) => {
                    const sDone = completedSteps.includes(s);
                    const sRtl = window.isHebrew(s);
                    return (
                      <button
                        key={i}
                        data-action="step"
                        onClick={() => onToggleStep?.(task.id, s)}
                        style={{
                          display: "flex", alignItems: "center", gap: 9,
                          padding: "6px 4px",
                          border: "none", background: "transparent",
                          fontSize: 12.5, color: sDone ? "var(--ink-4)" : "var(--ink-2)",
                          textDecoration: sDone ? "line-through" : "none",
                          textAlign: sRtl ? "right" : "left",
                          direction: sRtl ? "rtl" : "ltr",
                          cursor: "pointer",
                          fontFamily: sRtl ? "Heebo, var(--font-sans)" : "inherit",
                        }}
                      >
                        <span style={{
                          flexShrink: 0,
                          width: 14, height: 14, borderRadius: 4,
                          border: `1.5px solid ${sDone ? "var(--accent-2)" : "var(--line-strong)"}`,
                          background: sDone ? "var(--accent-2)" : "transparent",
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          color: "var(--card)",
                        }}>
                          {sDone && <Check size={9} stroke={3} />}
                        </span>
                        <span style={{ lineHeight: 1.4 }}>{s}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Hover actions */}
        <div style={{
          display: "flex", gap: 4, flexShrink: 0,
          opacity: hover ? 1 : 0,
          transition: "opacity .15s ease",
        }}>
          {confirming ? (
            <>
              <button
                data-action="confirm"
                onClick={() => onDelete?.(task.id)}
                style={{
                  fontSize: 11, padding: "4px 9px", borderRadius: 8,
                  border: "1px solid var(--urg-high)",
                  background: "var(--urg-high)", color: "var(--paper)",
                  fontWeight: 600,
                }}
              >
                {t("delete")}
              </button>
              <button
                data-action="cancel"
                onClick={() => setConfirming(false)}
                style={{
                  fontSize: 11, padding: "4px 9px", borderRadius: 8,
                  border: "1px solid var(--line)",
                  background: "transparent", color: "var(--ink-2)",
                }}
              >
                {t("cancel")}
              </button>
            </>
          ) : (
            <button
              data-action="del"
              onClick={() => setConfirming(true)}
              style={{
                width: 28, height: 28, borderRadius: 8,
                border: "1px solid var(--line)",
                background: "transparent", color: "var(--ink-3)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
              title={t("delete")}
            >
              <Trash size={13} stroke={1.8} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

window.TaskCard = TaskCard;
