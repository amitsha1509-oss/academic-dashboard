// Admin view — localhost only, calls Railway production API directly.
// Shows all users + their stats from the production DB.

const RAILWAY_URL = "https://academic-dashboard-production-d0d5.up.railway.app";

function AdminView() {
  const [users, setUsers]   = React.useState(null);
  const [error, setError]   = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    fetch(`${RAILWAY_URL}/admin/overview`, { credentials: "include" })
      .then(r => {
        if (!r.ok) throw new Error(`${r.status} — אין הרשאה או שהשרת לא מגיב`);
        return r.json();
      })
      .then(data => { setUsers(data); setLoading(false); })
      .catch(e  => { setError(e.message); setLoading(false); });
  }, []);

  const cell = (content, opts = {}) => (
    <td style={{
      padding: "8px 12px",
      borderBottom: "1px solid var(--line)",
      fontSize: 13,
      color: opts.dim ? "var(--ink-3)" : "var(--ink)",
      fontFamily: opts.mono ? "var(--font-mono)" : "inherit",
      whiteSpace: "nowrap",
      ...opts.style,
    }}>{content}</td>
  );

  const badge = (n, color) => (
    <span style={{
      display: "inline-block",
      padding: "2px 8px", borderRadius: 999,
      fontSize: 11, fontWeight: 600,
      background: n > 0 ? color + "22" : "var(--paper-2)",
      color: n > 0 ? color : "var(--ink-4)",
    }}>{n}</span>
  );

  if (loading) return (
    <div style={{ padding: 40, color: "var(--ink-3)", fontSize: 13 }}>טוען נתונים מ-Railway…</div>
  );

  if (error) return (
    <div style={{ padding: 40 }}>
      <div style={{ color: "var(--urg-high)", fontSize: 13, marginBottom: 8 }}>שגיאה: {error}</div>
      <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
        ודא שאתה מחובר ל-Railway (פתח קודם{" "}
        <a href={RAILWAY_URL} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
          {RAILWAY_URL}
        </a>
        {" "}ואז חזור לכאן).
      </div>
    </div>
  );

  const total = users.length;
  const withCourses = users.filter(u => u.course_count > 0).length;

  return (
    <div style={{ direction: "rtl" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "var(--ink)" }}>
          Admin — Railway DB
        </h2>
        <span style={{ fontSize: 12, color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}>
          {total} משתמשים · {withCourses} עם קורסים
        </span>
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto", borderRadius: 12, border: "1px solid var(--line)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--paper-2)" }}>
              {["#", "אימייל", "שם", "הצטרף", "קורסים", "תבניות", "משימות פתוחות", "הושלמו"].map(h => (
                <th key={h} style={{
                  padding: "10px 12px", textAlign: "right",
                  fontSize: 11, fontWeight: 600, color: "var(--ink-3)",
                  letterSpacing: ".04em", borderBottom: "1px solid var(--line)",
                  whiteSpace: "nowrap",
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u, i) => (
              <tr key={u.id} style={{ background: i % 2 === 0 ? "var(--card)" : "var(--paper)" }}>
                {cell(u.id, { dim: true, mono: true })}
                {cell(u.email, { mono: true })}
                {cell(u.name || "—", { dim: !u.name })}
                {cell(u.created_at ? u.created_at.slice(0, 10) : "—", { dim: true, mono: true })}
                {cell(badge(u.course_count,  "var(--accent)"))}
                {cell(badge(u.pattern_count, "#4F86C6"))}
                {cell(badge(u.tasks_open,    "#5BAD6F"))}
                {cell(badge(u.tasks_done,    "var(--ink-3)"))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 10, fontSize: 11, color: "var(--ink-4)", fontFamily: "var(--font-mono)" }}>
        מקור: {RAILWAY_URL}/admin/overview
      </div>
    </div>
  );
}

window.AdminView = AdminView;
