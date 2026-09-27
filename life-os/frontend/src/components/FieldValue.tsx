import { formatWhen } from "../lib/dates";
import { isEmpty, NONE, type Field } from "../lib/fields";
import type { Item } from "../lib/types";
import { describeRepeat } from "./FieldEditor";
import { Tag } from "./ui";

/** Read-only display of a field's value (tables, cards). */
export function FieldValue({ field, item }: { field: Field; item: Item }) {
  const v = field.get(item);
  if (isEmpty(v)) return <span className="text-faint">—</span>;
  switch (field.kind) {
    case "date":
      return <span className="whitespace-nowrap">{formatWhen(v as string)}</span>;
    case "span":
      return <span className="whitespace-nowrap">{formatWhen(item.span_start)}{item.span_end ? ` – ${formatWhen(item.span_end)}` : ""}</span>;
    case "repeat":
      return <span className="whitespace-nowrap">{describeRepeat(item.repeat!)}</span>;
    case "links":
      return <span>{item.links.length} קישורים</span>;
    case "checkbox":
    case "inbox":
      return <span>✓</span>;
    case "url":
      return <a href={String(v)} target="_blank" rel="noreferrer" dir="ltr" className="truncate underline" onClick={(e) => e.stopPropagation()}>{String(v)}</a>;
    case "text":
    case "number":
    case "title":
    case "notes":
      return <span className="truncate">{String(v)}</span>;
    default:
      return (
        <span className="flex flex-wrap gap-1">
          {field.buckets(item).filter((b) => b.key !== NONE).map((b) => (
            <Tag key={b.key} color={b.color}>{b.icon ? `${b.icon} ` : ""}{b.label}</Tag>
          ))}
        </span>
      );
  }
}
