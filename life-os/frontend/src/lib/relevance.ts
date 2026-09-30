// Which properties make sense for which item type, so screens only offer what fits.
// A topic has no due date or urgency; an idea has no repeat rule. Properties the user
// creates are always offered. Values already on an item are always shown, never hidden.

const KNOWN = new Set(["parent", "when", "due", "span", "repeat", "links", "importance", "urgency", "effort", "tags"]);

const RELEVANT: Record<string, string[]> = {
  task: ["parent", "due", "when", "repeat", "importance", "urgency", "effort", "links", "tags"],
  topic: ["parent", "links", "tags"],
  project: ["parent", "span", "due", "importance", "links", "tags"],
  course: ["parent", "span", "links", "tags"],
  lecture: ["parent", "repeat", "when", "links"],
  exam: ["parent", "when", "importance", "links"],
  event: ["parent", "when", "importance", "links", "tags"],
  idea: ["parent", "links", "tags"],
  note: ["parent", "links", "tags"],
  person: ["links", "tags"],
  workout: ["parent", "repeat", "when"],
  link: ["parent", "links", "tags"],
};

/** Untyped items (fresh captures) and user-made types get everything. */
export function isRelevant(typeId: string | null | undefined, fieldKey: string): boolean {
  if (!KNOWN.has(fieldKey)) return true;
  const list = typeId ? RELEVANT[typeId] : undefined;
  return !list || list.includes(fieldKey);
}

/** True if the field fits at least one of the types (or no types are chosen). */
export function relevantToAny(typeIds: string[], fieldKey: string): boolean {
  return !typeIds.length || typeIds.some((t) => isRelevant(t, fieldKey));
}

/** Tasks and plain captures are things you tick off. */
export const isDoable = (typeId: string | null | undefined) => !typeId || typeId === "task";
