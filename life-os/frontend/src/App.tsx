import { Toasts } from "./components/ui";
import { Onboarding } from "./components/AreaPicker";
import { useAreas } from "./lib/areas";
import { NavProvider, useRoute } from "./lib/nav";
import { StoreProvider, useStore } from "./lib/store";
import { SearchScreen, GuideScreen, StudiesScreen, TimelineScreen, TopicsScreen, ViewsScreen } from "./screens/Browse";
import { HomeScreen } from "./screens/Home";
import { ItemScreen } from "./screens/ItemScreen";
import { SettingsScreen } from "./screens/Settings";
import { InboxScreen, MissedScreen, TasksScreen, TodayScreen } from "./screens/Smart";
import { ViewEditScreen, ViewScreen } from "./screens/ViewScreen";

function CurrentScreen() {
  const route = useRoute();
  switch (route.name) {
    case "today": return <TodayScreen />;
    case "inbox": return <InboxScreen />;
    case "missed": return <MissedScreen />;
    case "tasks": return <TasksScreen />;
    case "topics": return <TopicsScreen />;
    case "studies": return <StudiesScreen />;
    case "timeline": return <TimelineScreen />;
    case "views": return <ViewsScreen />;
    case "view": return <ViewScreen id={route.arg!} />;
    case "viewEdit": return <ViewEditScreen id={route.arg ?? "new"} />;
    case "item": return <ItemScreen id={route.arg!} />;
    case "search": return <SearchScreen />;
    case "settings": return <SettingsScreen />;
    case "guide": return <GuideScreen />;
    default: return <HomeScreen />;
  }
}

function Shell() {
  const { loaded, error, reload } = useStore();
  const { needsSetup } = useAreas();
  if (!loaded) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        {error ? (
          <>
            <h1 className="display text-[28px]">אין חיבור לשרת</h1>
            <p className="max-w-sm text-muted">ודא שהחלון השחור של המרכז עדיין פתוח, ונסה שוב.</p>
            <button type="button" onClick={reload} className="rounded-full bg-ink px-5 py-2.5 font-medium text-canvas">נסה שוב</button>
          </>
        ) : <span className="display text-[28px] text-faint">המרכז</span>}
      </div>
    );
  }
  if (needsSetup) return <><Onboarding /><Toasts /></>;
  return (
    <>
      <NavProvider><CurrentScreen /></NavProvider>
      <Toasts />
    </>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
