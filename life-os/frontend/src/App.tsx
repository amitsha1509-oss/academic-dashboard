import { AlertCircle, CalendarDays, GanttChart, Inbox, Menu, Plus, Search, Settings, Sun, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Toasts } from "./components/ui";
import { todayISO } from "./lib/dates";
import { navigate, useRoute } from "./lib/router";
import { StoreProvider, useServerData, useStore } from "./lib/store";
import type { MissedData } from "./lib/types";
import { ItemPage } from "./pages/ItemPage";
import { SearchPage, TimelinePage } from "./pages/OtherPages";
import { SettingsPage } from "./pages/SettingsPage";
import { InboxPage, MissedPage, TodayPage, WeekPage } from "./pages/SmartPages";
import { createAndOpenView, ViewPage } from "./pages/ViewPage";

function useCounts() {
  const { items } = useStore();
  const missed = useServerData<MissedData>(`/smart/missed?day=${todayISO()}`);
  return {
    inbox: items.filter((i) => i.inbox && i.status === "open").length,
    missed: missed ? missed.occurrences.length + missed.overdue.length + missed.past_unmarked.length : 0,
  };
}

function NavLink({ to, icon, label, count, active, onNavigate }: {
  to: string; icon: ReactNode; label: string; count?: number; active: boolean; onNavigate?: () => void;
}) {
  return (
    <a href={`#${to}`} onClick={onNavigate}
      className={`flex h-8 items-center gap-2.5 rounded-md px-2 text-sm transition-colors ${active ? "bg-active font-medium text-ink" : "text-muted hover:bg-hover hover:text-ink"}`}>
      <span className="flex w-5 justify-center">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {!!count && <span className="text-xs text-faint">{count}</span>}
    </a>
  );
}

function Sidebar({ route, onNavigate }: { route: string[]; onNavigate?: () => void }) {
  const { views, createView } = useStore();
  const counts = useCounts();
  const at = (p: string) => route.join("/") === p;
  return (
    <nav className="flex h-full flex-col gap-0.5 p-2">
      <div className="mb-3 flex items-center gap-2 px-2 pt-2">
        <img src="/icon.svg" alt="" className="h-6 w-6" />
        <span className="font-semibold">המרכז</span>
      </div>
      <NavLink to="/search" icon={<Search size={16} />} label="חיפוש" active={at("search")} onNavigate={onNavigate} />
      <NavLink to="/today" icon={<Sun size={16} />} label="היום" active={at("today")} onNavigate={onNavigate} />
      <NavLink to="/inbox" icon={<Inbox size={16} />} label="תיבת קליטה" count={counts.inbox} active={at("inbox")} onNavigate={onNavigate} />
      <NavLink to="/missed" icon={<AlertCircle size={16} />} label="פספוסים ודחיות" count={counts.missed} active={at("missed")} onNavigate={onNavigate} />
      <NavLink to="/week" icon={<CalendarDays size={16} />} label="השבוע" active={at("week")} onNavigate={onNavigate} />
      <NavLink to="/timeline" icon={<GanttChart size={16} />} label="ציר זמן" active={at("timeline")} onNavigate={onNavigate} />

      <div className="mt-5 mb-1 flex items-center px-2 text-xs font-medium text-faint">
        <span className="flex-1">תצוגות</span>
        <button type="button" aria-label="תצוגה חדשה" title="תצוגה חדשה" onClick={() => { createAndOpenView(createView); onNavigate?.(); }}
          className="rounded p-0.5 hover:bg-hover hover:text-ink"><Plus size={15} /></button>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        {views.map((v) => (
          <NavLink key={v.id} to={`/view/${v.id}`} icon={<span className="text-[15px]">{v.icon || "📄"}</span>} label={v.name}
            active={route[0] === "view" && route[1] === v.id} onNavigate={onNavigate} />
        ))}
      </div>
      <NavLink to="/settings" icon={<Settings size={16} />} label="הגדרות" active={route[0] === "settings"} onNavigate={onNavigate} />
    </nav>
  );
}

/** One line → inbox. Sorting happens later, whenever convenient. */
function CaptureInput({ autoFocus, onDone }: { autoFocus?: boolean; onDone?: () => void }) {
  const { createItem, toast } = useStore();
  const [title, setTitle] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); navigate("/search"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const save = async () => {
    const t = title.trim();
    if (!t) return;
    setTitle("");
    const item = await createItem({ title: t });
    if (item) toast("נשמר בתיבת הקליטה", { label: "פתח", run: () => navigate(`/item/${item.id}`) });
    onDone?.();
  };
  return (
    <div className="flex items-center gap-2 rounded-lg border border-line bg-canvas px-3 transition-colors focus-within:border-accent">
      <Plus size={17} className="shrink-0 text-faint" />
      <input ref={ref} autoFocus={autoFocus} value={title} onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && save()}
        placeholder="מה על הראש? Enter שומר לתיבת הקליטה"
        enterKeyHint="done"
        className="h-10 min-w-0 flex-1 bg-transparent outline-none placeholder:text-faint" />
    </div>
  );
}

function MobileNav({ route, onMenu, onCapture }: { route: string[]; onMenu: () => void; onCapture: () => void }) {
  const counts = useCounts();
  const tab = (to: string, icon: ReactNode, label: string, count?: number) => (
    <a href={`#${to}`} className={`relative flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[11px] ${route[0] === to.slice(1) ? "text-ink" : "text-faint"}`}>
      {icon}{label}
      {!!count && <span className="absolute top-0.5 start-[calc(50%+6px)] rounded-full bg-danger px-1 text-[10px] leading-4 text-white">{count}</span>}
    </a>
  );
  return (
    <div className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-canvas/95 backdrop-blur md:hidden">
      <div className="flex items-center">
        {tab("/today", <Sun size={20} />, "היום")}
        {tab("/inbox", <Inbox size={20} />, "קליטה", counts.inbox)}
        <button type="button" onClick={onCapture} aria-label="רשום משהו"
          className="mx-2 -mt-5 flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-ink text-canvas shadow-pop">
          <Plus size={24} />
        </button>
        {tab("/missed", <AlertCircle size={20} />, "פספוסים", counts.missed)}
        <button type="button" onClick={onMenu} className="flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[11px] text-faint">
          <Menu size={20} />עוד
        </button>
      </div>
    </div>
  );
}

function Sheet({ open, onClose, side, children }: { open: boolean; onClose: () => void; side: "bottom" | "start"; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className={side === "bottom"
        ? "pb-safe absolute inset-x-0 bottom-0 rounded-t-2xl bg-canvas p-4 shadow-pop"
        : "absolute inset-y-0 start-0 w-72 max-w-[85vw] bg-sidebar shadow-pop"}>
        {side === "start" && (
          <button type="button" aria-label="סגור" onClick={onClose} className="absolute top-3 end-3 rounded p-1 text-muted hover:bg-hover"><X size={18} /></button>
        )}
        {children}
      </div>
    </div>
  );
}

function Routes({ route }: { route: string[] }) {
  const { views, loaded } = useStore();
  const [page, id] = route;
  switch (page) {
    case "inbox": return <InboxPage />;
    case "missed": return <MissedPage />;
    case "week": return <WeekPage />;
    case "timeline": return <TimelinePage />;
    case "search": return <SearchPage />;
    case "settings": return <SettingsPage tab={id} />;
    case "item": return <ItemPage id={id} />;
    case "view": {
      const v = views.find((v) => v.id === id);
      if (v) return <ViewPage key={v.id} view={v} />;
      return loaded ? <div className="py-20 text-center text-muted">התצוגה לא נמצאה.</div> : null;
    }
    default: return <TodayPage />;
  }
}

function Shell() {
  const { loaded, error, reload } = useStore();
  const route = useRoute();
  const [menu, setMenu] = useState(false);
  const [capture, setCapture] = useState(false);

  if (error && !loaded) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="text-4xl">🔌</div>
        <div>אין חיבור לשרת. ודא שהחלון של השרת עדיין פתוח.</div>
        <button type="button" onClick={reload} className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-hover">נסה שוב</button>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-e border-line bg-sidebar md:block">
        <Sidebar route={route} />
      </aside>
      <main className="min-w-0 flex-1">
        <div className="sticky top-0 z-20 hidden bg-canvas/90 px-10 pt-4 pb-3 backdrop-blur md:block">
          <div className="mx-auto max-w-3xl"><CaptureInput /></div>
        </div>
        <div className="px-4 pt-6 pb-28 md:px-10 md:pt-4 md:pb-16">
          {loaded ? <Routes route={route} /> : <div className="py-20 text-center text-faint">טוען…</div>}
        </div>
      </main>
      <MobileNav route={route} onMenu={() => setMenu(true)} onCapture={() => setCapture(true)} />
      <Sheet open={menu} onClose={() => setMenu(false)} side="start">
        <Sidebar route={route} onNavigate={() => setMenu(false)} />
      </Sheet>
      <Sheet open={capture} onClose={() => setCapture(false)} side="bottom">
        <div className="mb-2 text-sm font-medium text-muted">רשום משהו</div>
        <CaptureInput autoFocus onDone={() => setCapture(false)} />
      </Sheet>
      <Toasts />
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
