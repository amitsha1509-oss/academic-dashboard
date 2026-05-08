// Agenda view — bucketed by time, with collapsible bars
function AgendaView({ tasks, ...rest }) {
  const { t } = window.useLang();
  const BUCKET_LABEL = {
    "Overdue":   t("bucketOverdue"),
    "Today":     t("bucketToday"),
    "Tomorrow":  t("bucketTomorrow"),
    "This week": t("bucketThisWeek"),
    "Later":     t("bucketLater"),
    "No date":   t("bucketNoDate"),
  };
  const ORDER = ["Overdue", "Today", "Tomorrow", "This week", "Later", "No date"];
  const buckets = {};
  tasks.forEach(t => {
    const b = window.timeBucket(t.time_value);
    if (!buckets[b]) buckets[b] = [];
    buckets[b].push(t);
  });

  if (tasks.length === 0) return <window.EmptyState onPick={rest.onExampleClick} />;

  // Default: collapse "Later" and "No date" since they're noisy
  const defaultOpenFor = (b) => !(b === "Later" || b === "No date");

  const visible = ORDER.filter(b => buckets[b]);
  const setAll = (open) => {
    visible.forEach(b => {
      window.userStorage.set(`collapse.agenda.${b}`, open ? "1" : "0");
    });
    window.dispatchEvent(new Event("nucleus:collapse-changed"));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <window.CollapseAllBar onCollapseAll={() => setAll(false)} onExpandAll={() => setAll(true)} />
      {visible.map(b => {
        const accent = b === "Overdue" ? "var(--urg-high)"
                     : b === "Today"   ? "var(--accent)"
                     : b === "Tomorrow"? "var(--accent-3)"
                     : "var(--line-strong)";
        const header = (
          <span style={{
            fontSize: 16, fontWeight: 700,
            color: b === "Overdue" ? "var(--urg-high)" : b === "Today" ? "var(--accent)" : "var(--ink)",
            lineHeight: 1.2,
          }}>
            {BUCKET_LABEL[b] || b}
          </span>
        );
        return (
          <window.CollapsibleGroup
            key={b}
            storageKey={`agenda.${b}`}
            defaultOpen={defaultOpenFor(b)}
            header={header}
            count={buckets[b].length}
            accentColor={accent}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {buckets[b].sort((a, b) => {
                if (!a.time_value) return 1;
                if (!b.time_value) return -1;
                return new Date(a.time_value) - new Date(b.time_value);
              }).map(t => (
                <window.TaskCard key={t.id} task={t} {...rest} isFresh={!!rest.freshIds?.[t.id]} />
              ))}
            </div>
          </window.CollapsibleGroup>
        );
      })}
    </div>
  );
}

window.AgendaView = AgendaView;
