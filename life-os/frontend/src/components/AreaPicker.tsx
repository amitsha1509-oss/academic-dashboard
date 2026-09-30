import { Check } from "lucide-react";
import { useState } from "react";
import { AREAS, useAreas } from "../lib/areas";

/** Tappable cards, one per area. Used on first launch and in Settings. */
export function AreaPicker({ selected, onChange }: { selected: string[]; onChange: (ids: string[]) => void }) {
  return (
    <div className="grid gap-2.5">
      {AREAS.map((a) => {
        const on = selected.includes(a.id);
        return (
          <button key={a.id} type="button" aria-pressed={on}
            onClick={() => onChange(on ? selected.filter((x) => x !== a.id) : [...selected, a.id])}
            className={`flex items-start gap-3.5 rounded-[20px] border-2 p-4 text-start transition-colors ${
              on ? "border-ink bg-canvas" : "border-transparent bg-surface hover:bg-active"}`}>
            <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition-colors ${
              on ? "border-ink bg-ink text-canvas" : "border-faint"}`}>
              {on && <Check size={14} strokeWidth={3.5} />}
            </span>
            <span className="grid gap-0.5">
              <span className="display text-[18px] font-bold">{a.name}</span>
              <span className="text-[14px] leading-snug text-muted">{a.desc}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** First launch: one question, then the app shows only what was chosen. */
export function Onboarding() {
  const { setAreas } = useAreas();
  const [selected, setSelected] = useState<string[]>(["tasks"]);
  const [saving, setSaving] = useState(false);
  return (
    <div className="h-full overflow-y-auto">
      <div className="pt-safe mx-auto grid max-w-[640px] gap-7 px-5 pb-36">
        <header className="grid gap-2 pt-10">
          <span className="text-[14px] font-medium text-accent">ברוך הבא למרכז</span>
          <h1 className="display text-[40px]">מה תרצה לנהל כאן?</h1>
          <p className="text-[16px] leading-relaxed text-muted">
            בוחרים רק מה שרלוונטי לך, ורק זה יופיע. אפשר לשנות בכל רגע בהגדרות, ושום דבר לא נמחק.
          </p>
        </header>
        <AreaPicker selected={selected} onChange={setSelected} />
        <p className="text-[14px] text-muted">
          תמיד יש: <b className="font-medium text-ink">היום</b>, <b className="font-medium text-ink">תיבת קליטה</b> ו<b className="font-medium text-ink">פספוסים</b>.
        </p>
      </div>
      <div className="pb-safe fixed inset-x-0 bottom-0 bg-gradient-to-t from-canvas via-canvas to-transparent pt-8">
        <div className="mx-auto max-w-[640px] px-5 pb-5">
          <button type="button" disabled={saving}
            onClick={async () => { setSaving(true); await setAreas(selected); }}
            className="w-full rounded-full bg-ink py-4 text-[17px] font-medium text-canvas disabled:opacity-50">
            {selected.length ? "להתחיל" : "להתחיל בלי כלום מזה"}
          </button>
        </div>
      </div>
    </div>
  );
}
