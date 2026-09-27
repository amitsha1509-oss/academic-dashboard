import { CalendarDays, Flag, Link2, Repeat, AlignRight, CornerDownLeft } from "lucide-react";
import type { ReactNode } from "react";
import { formatWhen, todayISO } from "../lib/dates";
import { openItem } from "../lib/router";
import { useStore } from "../lib/store";
import type { Item } from "../lib/types";
import { StatusCheck, Tag } from "./ui";

export function TypeIcon({ item }: { item: Item }) {
  const { types } = useStore();
  const t = types.find((t) => t.id === item.type_id);
  if (!t?.icon) return null;
  return <span className="w-5 shrink-0 text-center text-[15px] leading-none">{t.icon}</span>;
}

/** Small meta chips: dates, parent, repeat, choice tags. Shared by rows and cards. */
export function ItemMeta({ item, hideParent, max = 3 }: { item: Item; hideParent?: boolean; max?: number }) {
  const { itemsById, properties, types, childrenOf } = useStore();
  const today = todayISO();
  const parent = item.parent_id ? itemsById.get(item.parent_id) : undefined;
  const parentType = parent && types.find((t) => t.id === parent.type_id);
  const childCount = (childrenOf.get(item.id) ?? []).filter((c) => c.status === "open").length;
  const chips: ReactNode[] = [];

  const due = item.due_at;
  if (due) {
    const late = item.status === "open" && due.slice(0, 10) < today;
    chips.push(
      <span key="due" className={`inline-flex items-center gap-1 ${late ? "text-danger" : ""}`}>
        <Flag size={12} />{formatWhen(due, today)}
      </span>,
    );
  }
  if (item.when_at && !item.repeat) {
    chips.push(<span key="when" className="inline-flex items-center gap-1"><CalendarDays size={12} />{formatWhen(item.when_at, today)}</span>);
  }
  if (item.span_start) {
    chips.push(
      <span key="span" className="inline-flex items-center gap-1">
        <CalendarDays size={12} />{formatWhen(item.span_start, today)}{item.span_end ? ` – ${formatWhen(item.span_end, today)}` : ""}
      </span>,
    );
  }
  if (item.repeat) chips.push(<span key="rep" className="inline-flex items-center gap-1"><Repeat size={12} />{item.repeat.time ?? "חוזר"}</span>);
  if (parent && !hideParent) {
    chips.push(
      <span key="parent" className="inline-flex max-w-40 items-center gap-1 truncate">
        {parentType?.icon ? <span className="text-[11px]">{parentType.icon}</span> : <CornerDownLeft size={12} />}
        <span className="truncate">{parent.title}</span>
      </span>,
    );
  }
  if (childCount) chips.push(<span key="kids" className="text-faint">{childCount} פתוחים</span>);
  if (item.links.length) chips.push(<Link2 key="links" size={12} />);
  if (item.notes) chips.push(<AlignRight key="notes" size={12} />);

  const tags: ReactNode[] = [];
  for (const p of properties) {
    if (p.archived || tags.length >= max) continue;
    const v = item.props[p.id];
    if (v === undefined) continue;
    if (p.type === "choice") {
      const o = p.options.find((o) => o.id === v);
      if (o) tags.push(<Tag key={p.id} color={o.color}>{o.label}</Tag>);
    } else if (p.type === "multi") {
      for (const id of v as string[]) {
        const o = p.options.find((o) => o.id === id);
        if (o && tags.length < max) tags.push(<Tag key={p.id + id} color={o.color}>{o.label}</Tag>);
      }
    }
  }

  if (!chips.length && !tags.length) return null;
  return (
    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
      {chips}
      {tags.length > 0 && <span className="flex flex-wrap gap-1">{tags}</span>}
    </div>
  );
}

export function ItemRow({ item, hideParent, actions, selected, onSelect, onClick, leading }: {
  item: Item;
  hideParent?: boolean;
  actions?: ReactNode;
  selected?: boolean;
  onSelect?: () => void;
  onClick?: () => void;
  leading?: ReactNode;
}) {
  const { updateItem } = useStore();
  const done = item.status === "done";
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick ?? (() => openItem(item.id))}
      onKeyDown={(e) => e.key === "Enter" && (onClick ?? (() => openItem(item.id)))()}
      className={`group flex min-h-11 cursor-pointer items-start gap-2.5 rounded-md px-2 py-2 transition-colors hover:bg-hover ${selected ? "bg-active" : ""}`}
    >
      {onSelect && (
        <input
          type="checkbox"
          checked={!!selected}
          onClick={(e) => e.stopPropagation()}
          onChange={onSelect}
          className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]"
          aria-label="בחר"
        />
      )}
      {leading ?? (
        <span className="mt-[3px]">
          <StatusCheck done={done} onToggle={() => updateItem(item.id, { status: done ? "open" : "done" })} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <TypeIcon item={item} />
          <span className={`min-w-0 truncate ${done ? "text-faint line-through" : ""}`}>{item.title}</span>
        </div>
        <ItemMeta item={item} hideParent={hideParent} />
      </div>
      {actions && <div className="flex shrink-0 items-center gap-0.5" onClick={(e) => e.stopPropagation()}>{actions}</div>}
    </div>
  );
}
