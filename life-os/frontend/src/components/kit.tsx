// The building blocks every screen is made of: the screen frame, item rows, type labels.
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { formatWhen, todayISO } from "../lib/dates";
import { openItem, useNav } from "../lib/nav";
import { useStore } from "../lib/store";
import type { Item } from "../lib/types";
import { describeRepeat } from "./FieldEditor";
import { StatusCheck } from "./ui";
import { AddButton, type AddDefaults } from "./AddPanel";

/** A full screen: back button, big title, and content flowing top to bottom. */
export function Screen({ title, subtitle, actions, children, titleNode, add = {} }: {
  title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; titleNode?: ReactNode;
  /** What the floating + prefills on this screen (false hides it). */
  add?: AddDefaults | false;
}) {
  const { back, home, stack } = useNav();
  return (
    <div className="mx-auto max-w-[720px]">
      <div className="pt-safe sticky top-0 z-10 bg-canvas/90 backdrop-blur-md">
        <div className="flex items-center gap-2 px-5 pt-3.5 pb-2.5">
          <button type="button" onClick={back}
            className="inline-flex items-center gap-1 rounded-full bg-surface py-1.5 ps-2 pe-3.5 text-[15px] font-medium hover:bg-active">
            <ChevronRight size={18} />חזרה
          </button>
          <div className="flex-1" />
          {actions}
          {stack.length > 2 && (
            <button type="button" onClick={home} className="display px-1 text-[15px] text-faint hover:text-ink">המרכז</button>
          )}
        </div>
      </div>
      <div className="grid gap-8 px-5 pt-2 pb-32">
        {(title || titleNode) && (
          <header className="grid gap-1.5">
            {titleNode ?? <h1 className="display text-[36px] md:text-[42px]">{title}</h1>}
            {subtitle && <p className="text-[15.5px] text-muted">{subtitle}</p>}
          </header>
        )}
        {children}
      </div>
      {add !== false && <AddButton defaults={add} />}
    </div>
  );
}

export function TypeLabel({ typeId }: { typeId: string | null }) {
  const { types } = useStore();
  const t = types.find((t) => t.id === typeId);
  if (!t) return null;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: `var(--dot-${t.color}, var(--dot-gray))` }} />
      {t.name}
    </span>
  );
}

/** Things you tick off: tasks, and not-yet-typed quick captures. */
export function isCheckable(item: Item) {
  return !item.repeat && (item.type_id === "task" || item.type_id === null);
}

export function Row({ item, lead, extra, actions, hideType, hideParent, hideRepeat, onClick, below }: {
  hideRepeat?: boolean;
  item: Item;
  /** Controls under the title (chips, pickers); clicks there don't open the item. */
  below?: ReactNode;
  lead?: ReactNode;
  extra?: ReactNode;
  actions?: ReactNode;
  hideType?: boolean;
  hideParent?: boolean;
  onClick?: () => void;
}) {
  const { itemsById, updateItem } = useStore();
  const today = todayISO();
  const done = item.status === "done";
  const parent = item.parent_id ? itemsById.get(item.parent_id) : undefined;
  const late = item.status === "open" && !!item.due_at && item.due_at.slice(0, 10) < today;
  const open = onClick ?? (() => openItem(item.id));

  const meta: ReactNode[] = [];
  if (!hideType && item.type_id) meta.push(<TypeLabel key="t" typeId={item.type_id} />);
  if (item.due_at) meta.push(<span key="d" className={late ? "font-medium text-danger" : ""}>{late ? "באיחור · " : "עד "}{formatWhen(item.due_at, today)}</span>);
  if (item.when_at && !item.repeat) meta.push(<span key="w">{formatWhen(item.when_at, today)}</span>);
  if (item.repeat && !hideRepeat) meta.push(<span key="r">{describeRepeat(item.repeat, true)}</span>);
  if (parent && !hideParent) meta.push(<span key="p" className="max-w-48 truncate">{parent.title}</span>);
  if (extra) meta.push(<span key="x">{extra}</span>);

  return (
    <div role="button" tabIndex={0} onClick={open} onKeyDown={(e) => e.key === "Enter" && open()}
      className="group flex cursor-pointer items-start gap-3 border-b border-line py-3">
      {lead ?? (isCheckable(item) && (
        <span className="pt-0.5"><StatusCheck done={done} onToggle={() => updateItem(item.id, { status: done ? "open" : "done" })} /></span>
      ))}
      <div className="grid min-w-0 flex-1 gap-0.5">
        <span className={`text-[16.5px] font-medium break-words group-hover:underline group-hover:decoration-faint group-hover:underline-offset-4 ${done ? "text-faint line-through" : ""}`}>
          {item.title}
        </span>
        {meta.length > 0 && <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-[13.5px] text-muted">{meta}</span>}
        {below && <div className="flex flex-wrap items-center gap-1.5 pt-2" onClick={(e) => e.stopPropagation()}>{below}</div>}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-1.5 self-center" onClick={(e) => e.stopPropagation()}>{actions}</div>
      ) : (
        <ChevronLeft size={18} className="mt-1 shrink-0 text-faint" />
      )}
    </div>
  );
}

export function Chip({ children, onClick, primary, active }: { children: ReactNode; onClick: () => void; primary?: boolean; active?: boolean }) {
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`rounded-full px-3 py-1 text-[13.5px] font-medium whitespace-nowrap transition-colors ${
        primary ? "bg-ink text-canvas hover:opacity-90" : active ? "bg-accent text-white" : "bg-surface hover:bg-active"}`}>
      {children}
    </button>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <div className="border-b border-line py-3 text-[15px] text-faint">{children}</div>;
}
