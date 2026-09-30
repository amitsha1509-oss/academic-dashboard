// The one way to add something: a line of text, plus optional type, place, date and priority.
// With nothing chosen it lands in the inbox; choosing a type or a place files it right away.
import { Plus, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { addDays, formatWhen, parseDate, todayISO } from "../lib/dates";
import { parseQuick, stripWords } from "../lib/quickParse";
import { openItem } from "../lib/nav";
import { useStore } from "../lib/store";
import type { Item, ItemPatch } from "../lib/types";
import { MenuItem, Popover, SearchInput } from "./ui";
import { isRelevant } from "../lib/relevance";

export interface AddDefaults {
  type_id?: string | null;
  parent_id?: string | null;
  when?: "today" | null;
}

const QUICK_TYPES = ["task", "idea", "note", "event", "topic"];
const CONTAINER_TYPES = ["topic", "course", "project"];
// Types whose date means "when it happens" rather than "when it's due".
const TIMED_TYPES = new Set(["event", "exam", "lecture", "workout"]);

function Opt({ on, onClick, children, color }: { on?: boolean; onClick: () => void; children: ReactNode; color?: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={!!on}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13.5px] font-medium whitespace-nowrap transition-colors ${
        on ? "bg-ink text-canvas" : "bg-canvas hover:bg-active"}`}>
      {color && <span className="h-[7px] w-[7px] rounded-full" style={{ background: `var(--dot-${color}, var(--dot-gray))` }} />}
      {children}
    </button>
  );
}

function OptRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[56px_1fr] items-start gap-2">
      <span className="pt-1 text-[13.5px] text-muted">{label}</span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

/** The coming Saturday (end of the Israeli week); next week's if today is Saturday. */
function endOfWeek(today: string) {
  const day = parseDate(today).getDay();
  return addDays(today, day === 6 ? 7 : 6 - day);
}

export function AddPanel({ defaults = {}, autoFocus, collapsible, onSaved }: {
  defaults?: AddDefaults;
  autoFocus?: boolean;
  /** Home screen: show the options only while typing. */
  collapsible?: boolean;
  onSaved?: () => void;
}) {
  const { items, types, itemsById, childrenOf, createItem, toast } = useStore();
  const today = todayISO();
  const input = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [focused, setFocused] = useState(false);
  const [typeId, setTypeId] = useState<string | null>(defaults.type_id ?? null);
  // What was picked by tapping (undefined = not touched). Untouched options take what the text
  // says ("מחר", "#השקעות", "!"), then the screen's defaults.
  const [parentPick, setParentId] = useState<string | null | undefined>(undefined);
  const [datePick, setDate] = useState<string | null | undefined>(undefined);
  const [pickingDate, setPickingDate] = useState(false);
  const [importantPick, setImportant] = useState<boolean | undefined>(undefined);
  const [urgent, setUrgent] = useState(false);
  const [q, setQ] = useState("");
  const form = useRef<HTMLFormElement>(null);

  // Collapsible panels close when you tap elsewhere with nothing typed. (Blur isn't reliable:
  // iPhone Safari doesn't focus buttons on tap.)
  useEffect(() => {
    if (!collapsible || !focused) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!form.current?.contains(t) && !t.closest("[data-popover]") && !title.trim()) setFocused(false);
    };
    // "click" (not pointerdown) so the panel closes only after the tap did its job;
    // closing earlier shifts the page and the tap lands on the wrong thing.
    document.addEventListener("click", onDown);
    return () => document.removeEventListener("click", onDown);
  }, [collapsible, focused, title]);

  const liveTypes = types.filter((t) => !t.archived);
  const quick = QUICK_TYPES.map((id) => liveTypes.find((t) => t.id === id)).filter((t): t is NonNullable<typeof t> => !!t);
  const more = liveTypes.filter((t) => !QUICK_TYPES.includes(t.id));
  const chosenType = liveTypes.find((t) => t.id === typeId);

  // Places to put things: topics, active courses and projects, the busiest first.
  const places = useMemo(() => items
    .filter((i) => CONTAINER_TYPES.includes(i.type_id ?? "") && i.status === "open" && (!i.span_end || i.span_end >= today))
    .sort((a, b) => (childrenOf.get(b.id)?.length ?? 0) - (childrenOf.get(a.id)?.length ?? 0)), [items, childrenOf, today]);
  const containers = places.slice(0, 5);

  const parsed = useMemo(() => parseQuick(title, places, today), [title, places, today]);
  const parentId = parentPick !== undefined ? parentPick : parsed.parentId ?? defaults.parent_id ?? null;
  const date = datePick !== undefined ? datePick : parsed.date ?? (defaults.when === "today" ? today : null);
  const important = importantPick !== undefined ? importantPick : parsed.important;
  const understood = [
    datePick === undefined && parsed.date ? formatWhen(parsed.date) : null,
    parentPick === undefined && parsed.parentId ? `בתוך ${itemsById.get(parsed.parentId)?.title}` : null,
    importantPick === undefined && parsed.important ? "חשוב" : null,
  ].filter(Boolean);
  const parent = parentId ? itemsById.get(parentId) : undefined;
  const placeChips = parent && !containers.some((c) => c.id === parent.id) ? [parent, ...containers.slice(0, 4)] : containers;
  const searchResults = items.filter((i) => i.status !== "dropped" && q && i.title.includes(q)).slice(0, 20);

  const reset = () => {
    setTitle("");
    setTypeId(defaults.type_id ?? null);
    setParentId(undefined);
    setDate(undefined);
    setPickingDate(false);
    setImportant(undefined);
    setUrgent(false);
  };

  const save = async () => {
    // Words whose meaning was used come out of the title.
    const t = stripWords(title, [
      datePick === undefined ? parsed.dateText : null,
      parentPick === undefined ? parsed.parentText : null,
      importantPick === undefined ? parsed.importantText : null,
    ]);
    if (!t) { input.current?.focus(); return; }
    const body: ItemPatch & { title: string } = { title: t, type_id: typeId, parent_id: showPlace ? parentId : null };
    if (date && showDate) {
      if (typeId && TIMED_TYPES.has(typeId)) body.when_at = date;
      else body.due_at = date;
    }
    if (showPriority && (important || urgent)) body.props = { importance: important ? "high" : "low", urgency: urgent ? "high" : "low" };
    const item: Item | null = await createItem(body);
    if (!item) return;
    const where = item.inbox ? "בתיבת הקליטה" : parent ? `בתוך ${parent.title}` : "";
    toast(where ? `נשמר ${where}` : "נשמר", { label: "פתח", run: () => openItem(item.id) });
    reset();
    onSaved?.();
    input.current?.focus();
  };

  const open = !collapsible || focused || title.trim() !== "";
  const showPriority = isRelevant(typeId, "importance") && isRelevant(typeId, "urgency");
  const showDate = isRelevant(typeId, "due") || isRelevant(typeId, "when");
  const showPlace = isRelevant(typeId, "parent");

  return (
    <form ref={form} onSubmit={(e) => { e.preventDefault(); save(); }} className="grid gap-3" onFocus={() => setFocused(true)}>
      <div className="flex items-center gap-2.5 border-b-2 border-ink">
        <Plus size={22} strokeWidth={2.2} className="shrink-0" />
        <input ref={input} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus={autoFocus}
          placeholder="מה עלה לך בראש?" enterKeyHint="done" aria-label="מה להוסיף"
          className="min-w-0 flex-1 bg-transparent py-3 text-[18px] outline-none placeholder:text-faint" />
      </div>
      {open && (understood.length ? (
        <p className="-mt-1 text-[13.5px] font-medium text-accent">הבנתי: {understood.join(" · ")}</p>
      ) : (
        <p className="-mt-1 text-[13px] text-muted">אפשר לכתוב כמו שמדברים: ״להתקשר לבנק מחר #השקעות״</p>
      ))}

      {open && (
        <>
          <div className="grid gap-2.5 rounded-[18px] bg-surface p-3.5">
            <OptRow label="סוג">
              {quick.map((t) => <Opt key={t.id} on={typeId === t.id} color={t.color} onClick={() => setTypeId(typeId === t.id ? null : t.id)}>{t.name}</Opt>)}
              {chosenType && !QUICK_TYPES.includes(chosenType.id) && <Opt on color={chosenType.color} onClick={() => setTypeId(null)}>{chosenType.name}</Opt>}
              {more.length > 0 && (
                <Popover width={220} trigger={({ toggle }) => <Opt onClick={toggle}>עוד…</Opt>}>
                  {(close) => more.map((t) => (
                    <MenuItem key={t.id} active={typeId === t.id} onClick={() => { setTypeId(t.id); close(); }}>{t.name}</MenuItem>
                  ))}
                </Popover>
              )}
            </OptRow>

            {showPlace && <OptRow label="בתוך">
              {placeChips.map((c) => <Opt key={c.id} on={parentId === c.id} onClick={() => setParentId(parentId === c.id ? null : c.id)}>{c.title}</Opt>)}
              <Popover width={280} trigger={({ toggle }) => (
                <Opt onClick={toggle}><Search size={13} />{placeChips.length ? "אחר…" : "בחר נושא, קורס…"}</Opt>
              )}>
                {(close) => (
                  <>
                    <SearchInput value={q} onChange={setQ} placeholder="חפש נושא, קורס, פרויקט…" />
                    {searchResults.map((i) => (
                      <MenuItem key={i.id} active={parentId === i.id} onClick={() => { setParentId(i.id); setQ(""); close(); }}>{i.title}</MenuItem>
                    ))}
                    {q && !searchResults.length && <div className="px-2.5 py-2 text-sm text-faint">לא נמצא</div>}
                  </>
                )}
              </Popover>
            </OptRow>}

            {showDate && <OptRow label={typeId && TIMED_TYPES.has(typeId) ? "מתי" : "עד מתי"}>
              <Opt on={date === today} onClick={() => setDate(date === today ? null : today)}>היום</Opt>
              <Opt on={date === addDays(today, 1)} onClick={() => setDate(date === addDays(today, 1) ? null : addDays(today, 1))}>מחר</Opt>
              <Opt on={date === endOfWeek(today)} onClick={() => setDate(date === endOfWeek(today) ? null : endOfWeek(today))}>עד סוף השבוע</Opt>
              {pickingDate || (date && ![today, addDays(today, 1), endOfWeek(today)].includes(date)) ? (
                <input type="date" value={date ?? ""} min={today} aria-label="תאריך" onChange={(e) => setDate(e.target.value || null)}
                  className="rounded-full bg-canvas px-3 text-[13.5px]" />
              ) : <Opt onClick={() => setPickingDate(true)}>תאריך…</Opt>}
            </OptRow>}

            {showPriority && (
              <OptRow label="עדיפות">
                <Opt on={important} onClick={() => setImportant(!important)}>חשוב</Opt>
                <Opt on={urgent} onClick={() => setUrgent(!urgent)}>דחוף</Opt>
              </OptRow>
            )}
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px] leading-snug text-muted">
              {typeId || parentId
                ? `יישמר ${parent ? `בתוך ${parent.title}` : "ישר למקום"}${date ? `, ${formatWhen(date)}` : ""}.`
                : "לא חייבים לבחור כלום. בלי סוג או מקום, זה נשמר בתיבת הקליטה."}
            </span>
            <button type="submit" disabled={!title.trim()}
              className="shrink-0 rounded-full bg-ink px-5 py-2 text-[15px] font-medium text-canvas disabled:opacity-30">שמור</button>
          </div>
        </>
      )}
    </form>
  );
}

/** A bottom sheet (centered panel on wide screens) holding the add panel. */
export function AddSheet({ open, onClose, defaults }: { open: boolean; onClose: () => void; defaults: AddDefaults }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-label="הוספה"
      onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <div className="absolute inset-0 bg-black/35" onClick={onClose} />
      <div className="pb-safe relative w-full max-w-[640px] rounded-t-[26px] bg-canvas px-5 pt-3 pb-5 shadow-pop md:mb-8 md:rounded-[26px]">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line" />
        <AddPanel defaults={defaults} autoFocus onSaved={onClose} />
      </div>
    </div>
  );
}

/** The floating + button in the corner of every screen. */
export function AddButton({ defaults }: { defaults: AddDefaults }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="fixed z-30 inline-flex h-14 items-center gap-2 rounded-full bg-ink ps-5 pe-6 text-[16px] font-medium text-canvas shadow-pop transition-transform active:scale-95"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 22px)", insetInlineEnd: "max(20px, calc((100vw - 720px) / 2 + 20px))" }}>
        <Plus size={22} strokeWidth={2.4} />הוסף
      </button>
      <AddSheet open={open} onClose={() => setOpen(false)} defaults={defaults} />
    </>
  );
}
