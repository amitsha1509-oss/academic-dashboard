// App-wide data: everything is loaded once, kept in memory, and every write goes to the
// server first-and-optimistically, rolling back with a message if the server refuses.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "./api";
import { buildFields, type Field } from "./fields";
import type { Item, ItemPatch, ItemType, PropertyDef, PropType, View, ViewConfig, ChoiceOption } from "./types";

interface Toast {
  id: number;
  message: string;
  action?: { label: string; run: () => void };
}

interface Bootstrap {
  items: Item[];
  properties: PropertyDef[];
  types: ItemType[];
  views: View[];
}

function mergePatch(item: Item, patch: ItemPatch): Item {
  const next = { ...item, ...patch } as Item;
  if (patch.props) {
    const props = { ...item.props, ...patch.props };
    for (const k of Object.keys(props)) {
      const v = props[k];
      if (v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) delete props[k];
    }
    next.props = props;
  }
  return next;
}

function useStoreValue() {
  const [data, setData] = useState<Bootstrap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0); // bumps on every write; smart pages refetch on change
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  const toast = useCallback((message: string, action?: Toast["action"]) => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, message, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), action ? 6000 : 3500);
  }, []);
  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const reload = useCallback(async () => {
    try {
      setData(await api.get<Bootstrap>("/bootstrap"));
      setError(null);
      setVersion((v) => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    reload();
    const onVisible = () => document.visibilityState === "visible" && reload();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [reload]);

  const fail = useCallback((e: unknown) => {
    toast(`השמירה נכשלה: ${e instanceof Error ? e.message : e}`);
  }, [toast]);

  const setItems = (fn: (items: Item[]) => Item[]) => setData((d) => (d ? { ...d, items: fn(d.items) } : d));
  const upsert = (item: Item) =>
    setItems((items) => (items.some((i) => i.id === item.id) ? items.map((i) => (i.id === item.id ? item : i)) : [...items, item]));
  const bump = () => setVersion((v) => v + 1);

  // ─── items ───
  const createItem = useCallback(async (body: ItemPatch & { title: string }) => {
    try {
      const item = await api.post<Item>("/items", body);
      upsert(item);
      bump();
      return item;
    } catch (e) {
      fail(e);
      return null;
    }
  }, [fail]);

  const updateItem = useCallback(async (id: string, patch: ItemPatch) => {
    let before: Item | undefined;
    setItems((items) => items.map((i) => {
      if (i.id !== id) return i;
      before = i;
      return mergePatch(i, patch);
    }));
    try {
      upsert(await api.patch<Item>(`/items/${id}`, patch));
      bump();
    } catch (e) {
      if (before) upsert(before);
      fail(e);
    }
  }, [fail]);

  const bulkUpdate = useCallback(async (ids: string[], patch: ItemPatch) => {
    try {
      const updated = await api.post<Item[]>("/items/bulk", { ids, patch });
      const byId = new Map(updated.map((i) => [i.id, i]));
      setItems((items) => items.map((i) => byId.get(i.id) ?? i));
      bump();
      toast(`עודכנו ${updated.length} פריטים`);
    } catch (e) {
      fail(e);
    }
  }, [fail, toast]);

  const restoreItem = useCallback(async (id: string) => {
    try {
      upsert(await api.post<Item>(`/items/${id}/restore`));
      bump();
    } catch (e) {
      fail(e);
    }
  }, [fail]);

  const deleteItem = useCallback(async (id: string) => {
    try {
      await api.del(`/items/${id}`);
      setItems((items) => items.filter((i) => i.id !== id));
      bump();
      toast("הפריט נמחק", { label: "ביטול", run: () => restoreItem(id) });
    } catch (e) {
      fail(e);
    }
  }, [fail, toast, restoreItem]);

  const markOccurrence = useCallback(async (itemId: string, date: string, status: "done" | "skipped" | null) => {
    try {
      await api.put(`/occurrences/${itemId}/${date}`, { status });
      bump();
    } catch (e) {
      fail(e);
    }
  }, [fail]);

  // ─── properties / types / views ───
  const setList = <K extends "properties" | "types" | "views">(key: K, fn: (l: Bootstrap[K]) => Bootstrap[K]) =>
    setData((d) => (d ? { ...d, [key]: fn(d[key]) } : d));
  const replaceIn = <T extends { id: string }>(list: T[], x: T) =>
    list.some((i) => i.id === x.id) ? list.map((i) => (i.id === x.id ? x : i)) : [...list, x];

  const createProperty = useCallback(async (name: string, type: PropType, options: ChoiceOption[] = []) => {
    try {
      const p = await api.post<PropertyDef>("/properties", { name, type, options });
      setList("properties", (l) => [...l, p]);
      return p;
    } catch (e) {
      fail(e);
      return null;
    }
  }, [fail]);

  const updateProperty = useCallback(async (id: string, patch: Partial<Pick<PropertyDef, "name" | "options" | "sort">>) => {
    try {
      const p = await api.patch<PropertyDef>(`/properties/${id}`, patch);
      setList("properties", (l) => replaceIn(l, p));
      if (patch.options) await reload(); // removed options may have cleared values on items
      return p;
    } catch (e) {
      fail(e);
      return null;
    }
  }, [fail, reload]);

  const convertProperty = useCallback(async (id: string, type: PropType) => {
    try {
      const res = await api.post<{ property: PropertyDef; converted: number; lost: number }>(`/properties/${id}/convert`, { type });
      await reload();
      toast(res.lost ? `הסוג שונה. ${res.lost} ערכים לא ניתנו להמרה והוסרו.` : "הסוג שונה וכל הערכים הומרו");
    } catch (e) {
      fail(e);
    }
  }, [fail, reload, toast]);

  const setPropertyArchived = useCallback(async (id: string, archived: boolean) => {
    try {
      if (archived) await api.del(`/properties/${id}`);
      else await api.post(`/properties/${id}/restore`);
      setList("properties", (l) => l.map((p) => (p.id === id ? { ...p, archived } : p)));
      if (archived) toast("המאפיין הוסתר. הערכים נשמרו.", { label: "ביטול", run: () => setPropertyArchived(id, false) });
    } catch (e) {
      fail(e);
    }
  }, [fail, toast]);

  const createType = useCallback(async (name: string, icon = "", color = "gray") => {
    try {
      const t = await api.post<ItemType>("/types", { name, icon, color });
      setList("types", (l) => [...l, t]);
      return t;
    } catch (e) {
      fail(e);
      return null;
    }
  }, [fail]);

  const updateType = useCallback(async (id: string, patch: Partial<Pick<ItemType, "name" | "icon" | "color" | "suggested" | "sort">>) => {
    try {
      const t = await api.patch<ItemType>(`/types/${id}`, patch);
      setList("types", (l) => replaceIn(l, t));
    } catch (e) {
      fail(e);
    }
  }, [fail]);

  const setTypeArchived = useCallback(async (id: string, archived: boolean) => {
    try {
      if (archived) await api.del(`/types/${id}`);
      else await api.post(`/types/${id}/restore`);
      setList("types", (l) => l.map((t) => (t.id === id ? { ...t, archived } : t)));
      if (archived) toast("הסוג הוסתר", { label: "ביטול", run: () => setTypeArchived(id, false) });
    } catch (e) {
      fail(e);
    }
  }, [fail, toast]);

  const createView = useCallback(async (name: string, icon: string, config: ViewConfig) => {
    try {
      const v = await api.post<View>("/views", { name, icon, config });
      setList("views", (l) => [...l, v]);
      return v;
    } catch (e) {
      fail(e);
      return null;
    }
  }, [fail]);

  const updateView = useCallback(async (id: string, patch: Partial<Pick<View, "name" | "icon" | "config" | "sort">>) => {
    setList("views", (l) => l.map((v) => (v.id === id ? { ...v, ...patch } : v)));
    try {
      await api.patch<View>(`/views/${id}`, patch);
    } catch (e) {
      fail(e);
      reload();
    }
  }, [fail, reload]);

  const deleteView = useCallback(async (id: string) => {
    try {
      await api.del(`/views/${id}`);
      setList("views", (l) => l.filter((v) => v.id !== id));
    } catch (e) {
      fail(e);
    }
  }, [fail]);

  const items = useMemo(() => data?.items ?? [], [data]);
  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const childrenOf = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const i of items) if (i.parent_id) m.set(i.parent_id, [...(m.get(i.parent_id) ?? []), i]);
    return m;
  }, [items]);
  const fields: Field[] = useMemo(
    () => (data ? buildFields({ properties: data.properties, types: data.types, itemsById }) : []),
    [data, itemsById],
  );

  return {
    loaded: data !== null,
    error,
    version,
    items,
    itemsById,
    childrenOf,
    properties: data?.properties ?? [],
    types: data?.types ?? [],
    views: data?.views ?? [],
    fields,
    toasts,
    toast,
    dismissToast,
    reload,
    createItem,
    updateItem,
    bulkUpdate,
    deleteItem,
    restoreItem,
    markOccurrence,
    createProperty,
    updateProperty,
    convertProperty,
    setPropertyArchived,
    createType,
    updateType,
    setTypeArchived,
    createView,
    updateView,
    deleteView,
  };
}

export type Store = ReturnType<typeof useStoreValue>;
const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const value = useStoreValue();
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const s = useContext(StoreContext);
  if (!s) throw new Error("useStore outside StoreProvider");
  return s;
}

/** Fetch server-computed data (Today, Missed...) and refetch after every write. */
export function useServerData<T>(path: string): T | null {
  const { version } = useStore();
  const [value, setValue] = useState<T | null>(null);
  useEffect(() => {
    let alive = true;
    api.get<T>(path).then((v) => alive && setValue(v)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [path, version]);
  return value;
}
