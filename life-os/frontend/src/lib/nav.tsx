// Screen-stack navigation. Opening something slides a new screen in from the left
// (forward in RTL); going back slides it out. The browser/phone back button works too.
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

export type ScreenName =
  | "home" | "today" | "inbox" | "missed" | "tasks" | "topics" | "studies"
  | "timeline" | "views" | "view" | "viewEdit" | "item" | "search" | "settings" | "guide";

export interface Route {
  name: ScreenName;
  arg?: string;
}

interface Entry {
  key: number;
  route: Route;
  scroll: number;
}

type Transition = { kind: "push" | "pop"; other: Entry } | null;

interface Nav {
  stack: Entry[];
  push: (route: Route) => void;
  back: () => void;
  home: () => void;
}

const NavContext = createContext<Nav | null>(null);

/** For code outside React components (e.g. a row's click handler built in a helper). */
export const nav = {
  push: (_route: Route) => {},
  back: () => {},
};

export const openItem = (id: string) => nav.push({ name: "item", arg: id });

const DURATION = 360;
let nextKey = 1;

export function NavProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<Entry[]>([{ key: 0, route: { name: "home" }, scroll: 0 }]);
  const [transition, setTransition] = useState<Transition>(null);
  const scrollers = useRef(new Map<number, HTMLElement>());
  const timer = useRef<number | undefined>(undefined);

  const settle = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setTransition(null), DURATION);
  };

  // Kept in a ref so navigation handlers read the current stack without side effects in state updaters.
  const stackRef = useRef(stack);
  const commit = (next: Entry[], t: Transition) => {
    stackRef.current = next;
    setStack(next);
    setTransition(t);
    settle();
  };

  const push = useCallback((route: Route) => {
    const s = stackRef.current;
    const top = s[s.length - 1];
    if (top.route.name === route.name && top.route.arg === route.arg) return;
    const saved = { ...top, scroll: scrollers.current.get(top.key)?.scrollTop ?? 0 };
    const next = [...s.slice(0, -1), saved, { key: nextKey++, route, scroll: 0 }];
    history.pushState({ lifeos: next.length - 1 }, "");
    commit(next, { kind: "push", other: saved });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Every "back" (our button, the browser's, a phone gesture) arrives here as a popstate.
  useEffect(() => {
    history.replaceState({ lifeos: 0 }, "");
    const onPop = (e: PopStateEvent) => {
      const s = stackRef.current;
      const depth = typeof e.state?.lifeos === "number" ? e.state.lifeos : 0;
      if (depth >= s.length - 1) return;
      commit(s.slice(0, depth + 1), { kind: "pop", other: s[s.length - 1] });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const back = useCallback(() => history.back(), []);
  const home = useCallback(() => {
    const n = stackRef.current.length - 1;
    if (n > 0) history.go(-n);
  }, []);

  useEffect(() => {
    nav.push = push;
    nav.back = back;
  }, [push, back]);

  const top = stack[stack.length - 1];
  const layers: { entry: Entry; cls: string }[] = [];
  if (transition?.kind === "push") {
    layers.push({ entry: transition.other, cls: "push-out" }, { entry: top, cls: "push-in is-front" });
  } else if (transition?.kind === "pop") {
    layers.push({ entry: top, cls: "pop-in" }, { entry: transition.other, cls: "pop-out is-front" });
  } else {
    layers.push({ entry: top, cls: "" });
  }

  return (
    <NavContext.Provider value={{ stack, push, back, home }}>
      <div className="stage">
        {layers.map(({ entry, cls }) => (
          <ScreenLayer key={entry.key} entry={entry} cls={cls} register={(el) => {
            if (el) scrollers.current.set(entry.key, el);
            else scrollers.current.delete(entry.key);
          }}>
            {children}
          </ScreenLayer>
        ))}
      </div>
    </NavContext.Provider>
  );
}

const RouteContext = createContext<Route>({ name: "home" });
export const useRoute = () => useContext(RouteContext);

function ScreenLayer({ entry, cls, register, children }: {
  entry: Entry; cls: string; register: (el: HTMLElement | null) => void; children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    register(ref.current);
    if (ref.current && entry.scroll) ref.current.scrollTop = entry.scroll;
    return () => register(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div ref={ref} className={`screen ${cls}`} aria-hidden={cls.includes("out") || undefined}>
      <RouteContext.Provider value={entry.route}>{children}</RouteContext.Provider>
    </div>
  );
}

export function useNav(): Nav {
  const n = useContext(NavContext);
  if (!n) throw new Error("useNav outside NavProvider");
  return n;
}
