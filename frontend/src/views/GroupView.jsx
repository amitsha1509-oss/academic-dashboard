// Group view — grouped by subject or context, with collapsible bars
function GroupView({ tasks, groupBy, ...rest }) {
  const groups = {};
  tasks.forEach(t => {
    const key = t[groupBy];
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  });
  const order = window.DIMENSIONS[groupBy] || [];
  const orderedKeys = order.filter(k => groups[k]);

  if (tasks.length === 0) return <window.EmptyState onPick={rest.onExampleClick} />;

  const setAll = (open) => {
    orderedKeys.forEach(k => {
      window.userStorage.set(`collapse.group.${groupBy}.${k}`, open ? "1" : "0");
    });
    // force a remount so CollapsibleGroups re-read localStorage
    window.dispatchEvent(new Event("nucleus:collapse-changed"));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <window.CollapseAllBar onCollapseAll={() => setAll(false)} onExpandAll={() => setAll(true)} />
      {orderedKeys.map(key => {
        const isSubject = groupBy === "subject";
        const meta = isSubject ? window.SUBJECT_META[key] : window.CONTEXT_META[key];
        const Ico = window.Icon[meta?.icon || "Folder"];
        const accent = isSubject ? (meta?.color || "var(--ink-3)") : "var(--ink-3)";
        const header = (
          <>
            <span style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 22, height: 22, borderRadius: 7,
              background: isSubject ? (meta?.color || "var(--paper-3)") : "var(--paper-3)",
              color: isSubject ? "var(--paper)" : "var(--ink-2)",
              flexShrink: 0,
            }}>
              <Ico size={12} stroke={2.2} />
            </span>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)", letterSpacing: ".01em" }}>
              {key}
            </span>
          </>
        );
        return (
          <window.CollapsibleGroup
            key={key}
            storageKey={`group.${groupBy}.${key}`}
            defaultOpen={true}
            header={header}
            count={groups[key].length}
            accentColor={accent}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {groups[key].map(t => (
                <window.TaskCard key={t.id} task={t} {...rest} isFresh={!!rest.freshIds?.[t.id]} />
              ))}
            </div>
          </window.CollapsibleGroup>
        );
      })}
    </div>
  );
}

window.GroupView = GroupView;
