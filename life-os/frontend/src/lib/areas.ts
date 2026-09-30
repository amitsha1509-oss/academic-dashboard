// Areas: the parts of the app a person chooses to use. Each area brings its item types and
// its tiles on the main page; turning one off hides them without deleting anything.
import { useCallback } from "react";
import { useStore } from "./store";
import type { ScreenName } from "./nav";

export interface Area {
  id: string;
  name: string;
  desc: string;
  types: string[];
  tiles: ScreenName[];
}

export const AREAS: Area[] = [
  { id: "tasks", name: "משימות", desc: "דברים לעשות, מסודרים לפי חשיבות ודחיפות.", types: ["task"], tiles: ["tasks"] },
  { id: "studies", name: "לימודים", desc: "קורסים, הרצאות שחוזרות כל שבוע ומבחנים. הרצאה שלא סימנת תופיע בפספוסים.", types: ["course", "lecture", "exam"], tiles: ["studies", "timeline"] },
  { id: "topics", name: "נושאים ורעיונות", desc: "תחומים כמו השקעות או מודיעין, ובתוכם רעיונות, פתקים וקישורים.", types: ["topic", "idea", "note", "link"], tiles: ["topics"] },
  { id: "projects", name: "פרויקטים", desc: "דברים עם התחלה וסוף, על ציר זמן.", types: ["project"], tiles: ["timeline"] },
  { id: "habits", name: "אימונים והרגלים", desc: "דברים שחוזרים באופן קבוע. מה שדילגת עליו יופיע בפספוסים.", types: ["workout"], tiles: [] },
  { id: "events", name: "אירועים ואנשים", desc: "פגישות, ימי הולדת ואנשים שחשוב לזכור.", types: ["event", "person"], tiles: [] },
  { id: "views", name: "רשימות משלי", desc: "מתקדם: רשימות שאתה מרכיב בעצמך, למשל כל המשימות הקלות בנושא מסוים.", types: [], tiles: ["views"] },
];

/** Always on: they only show what the chosen areas put in them. */
export const CORE_TILES: ScreenName[] = ["today", "inbox", "missed"];

export function useAreas() {
  const { settings, items, types, setSetting, setTypeArchived } = useStore();
  const saved = Array.isArray(settings.areas) ? (settings.areas as string[]) : null;
  // People who used the app before areas existed keep everything on.
  const enabled = new Set(saved ?? (items.length ? AREAS.map((a) => a.id) : []));
  const needsSetup = saved === null && items.length === 0;

  const setAreas = useCallback(async (ids: string[]) => {
    for (const area of AREAS) {
      const on = ids.includes(area.id);
      for (const tid of area.types) {
        const t = types.find((x) => x.id === tid);
        if (t && t.archived === on) await setTypeArchived(tid, !on, { quiet: true });
      }
    }
    await setSetting("areas", ids);
  }, [types, setSetting, setTypeArchived]);

  const tileOn = (tile: ScreenName) =>
    CORE_TILES.includes(tile) || AREAS.some((a) => enabled.has(a.id) && a.tiles.includes(tile));

  return { enabled, needsSetup, setAreas, tileOn };
}
