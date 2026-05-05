import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import * as api from '@/lib/api';
import type { Category, Pattern } from '@/types';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const DAY_LABELS: Record<string, string> = { Sun: 'ראשון', Mon: 'שני', Tue: 'שלישי', Wed: 'רביעי', Thu: 'חמישי', Fri: 'שישי', Sat: 'שבת' };
const KINDS = ['lecture', 'tutorial', 'hw', 'reading'] as const;
const KIND_LABELS: Record<string, string> = { lecture: 'הרצאה', tutorial: 'תרגול', hw: 'שיעורי בית', reading: 'קריאה' };

export function ScheduleView() {
  const [patterns, setPatterns] = useState<Pattern[] | null>(null);
  const [cats, setCats] = useState<Category[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<number | null>(null);
  const [addingCourse, setAddingCourse] = useState(false);
  const [confirmPattern, setConfirmPattern] = useState<number | null>(null);
  const [confirmCourse, setConfirmCourse] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});

  const reload = useCallback(async () => {
    try {
      const [pats, categories] = await Promise.all([api.listPatterns(), api.listCategories()]);
      setPatterns(pats);
      setCats(categories);
      setError(null);
    } catch (e) { setError((e as Error).message); }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const patchPattern = async (id: number, fields: Record<string, unknown>) => {
    setPatterns(ps => ps!.map(p => p.id === id ? { ...p, ...fields } as Pattern : p));
    try { await api.patchPattern(id, fields); }
    catch (e) { toast.error('שמירה נכשלה: ' + (e as Error).message); void reload(); }
  };

  const deletePattern = async (p: Pattern) => {
    if (confirmPattern !== p.id) {
      setConfirmPattern(p.id);
      setTimeout(() => setConfirmPattern(null), 3000);
      return;
    }
    setConfirmPattern(null);
    setPatterns(ps => ps!.filter(x => x.id !== p.id));
    try { await api.deletePattern(p.id); }
    catch (e) { toast.error('מחיקה נכשלה: ' + (e as Error).message); void reload(); }
  };

  const createPattern = async (payload: Record<string, unknown>) => {
    try {
      const created = await api.createPattern(payload);
      setPatterns(ps => [...ps!, created]);
      setAdding(null);
    } catch (e) { toast.error('יצירה נכשלה: ' + (e as Error).message); }
  };

  const createCourse = async (payload: Record<string, unknown>) => {
    try {
      const created = await api.createCategory(payload);
      setCats(cs => [...cs!, created].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)));
      setAddingCourse(false);
    } catch (e) { toast.error('יצירה נכשלה: ' + (e as Error).message); }
  };

  const deleteCourse = async (cat: Category) => {
    if (confirmCourse !== cat.id) {
      setConfirmCourse(cat.id);
      setTimeout(() => setConfirmCourse(null), 3000);
      return;
    }
    setConfirmCourse(null);
    try {
      await api.deleteCategory(cat.id);
      setCats(cs => cs!.filter(c => c.id !== cat.id));
      setPatterns(ps => ps!.filter(p => p.category_id !== cat.id));
    } catch (e) { toast.error('מחיקה נכשלה: ' + (e as Error).message); void reload(); }
  };

  if (error) return (
    <div className="p-5 rounded-xl bg-destructive/10 border border-destructive/20 text-sm text-muted-foreground">
      שגיאה בטעינה: {error}
    </div>
  );
  if (!patterns || !cats) return <div className="py-16 text-center text-muted-foreground text-sm">טוען...</div>;

  const sortedCats = [...cats].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const byCat: Record<number, Pattern[]> = {};
  for (const p of patterns) {
    if (!byCat[p.category_id]) byCat[p.category_id] = [];
    byCat[p.category_id].push(p);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <div className="flex gap-1.5">
          <button onClick={() => setCollapsed({})} className="text-[11.5px] px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-muted">פתח הכל</button>
          <button onClick={() => { const m: Record<number, boolean> = {}; sortedCats.forEach(c => { m[c.id] = true; }); setCollapsed(m); }} className="text-[11.5px] px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-muted">סגור הכל</button>
        </div>
        {!addingCourse && (
          <button onClick={() => setAddingCourse(true)} className="ms-auto text-[11.5px] px-3 py-1.5 rounded-full border border-border text-muted-foreground hover:bg-muted whitespace-nowrap">+ קורס חדש</button>
        )}
      </div>

      {addingCourse && <NewCourseInline onCreate={createCourse} onCancel={() => setAddingCourse(false)} />}

      {sortedCats.map(cat => {
        const groupPats = byCat[cat.id] ?? [];
        const accent = '#' + (cat.color_dark ?? '6B7280');
        const isCollapsed = !!collapsed[cat.id];

        return (
          <div key={cat.id} className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
            <button
              onClick={() => setCollapsed(m => ({ ...m, [cat.id]: !m[cat.id] }))}
              className="w-full flex items-center gap-2 px-4 py-3 text-start hover:bg-muted/40 transition-colors"
            >
              <span className="w-6 h-6 rounded-lg flex items-center justify-center text-white text-[11px] font-bold shrink-0" style={{ background: accent }}>
                {cat.name[0]}
              </span>
              <span className="text-[13.5px] font-semibold text-foreground flex-1">{cat.name}</span>
              <span className="text-[12px] text-muted-foreground">{groupPats.length}</span>
              <button
                onClick={e => { e.stopPropagation(); void deleteCourse(cat); }}
                className={[
                  'text-[11.5px] px-2.5 py-1 rounded-md border transition-all ms-1',
                  confirmCourse === cat.id
                    ? 'bg-red-600 text-white border-transparent font-semibold'
                    : 'border-red-400/60 text-red-500 bg-transparent',
                ].join(' ')}
              >{confirmCourse === cat.id ? 'בטוח?' : 'מחק'}</button>
              {isCollapsed ? <ChevronRight size={14} className="text-muted-foreground shrink-0" /> : <ChevronDown size={14} className="text-muted-foreground shrink-0" />}
            </button>

            {!isCollapsed && (
              <div className="px-4 pb-4 flex flex-col gap-2 border-t border-border">
                {groupPats.length === 0 && (
                  <div className="py-3 text-[12.5px] text-muted-foreground italic">אין תבניות עדיין</div>
                )}
                {groupPats.map(p => (
                  <PatternRow
                    key={p.id}
                    pattern={p}
                    onPatch={(fields) => void patchPattern(p.id, fields)}
                    onDelete={() => void deletePattern(p)}
                    confirming={confirmPattern === p.id}
                  />
                ))}
                {adding === cat.id ? (
                  <NewPatternForm categoryId={cat.id} onCancel={() => setAdding(null)} onCreate={createPattern} />
                ) : (
                  <button
                    onClick={() => setAdding(cat.id)}
                    className="self-start text-[12.5px] px-3 py-1.5 rounded-lg border border-dashed border-border text-muted-foreground hover:border-foreground/40 transition-colors"
                  >+ הוסף תבנית</button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PatternRow({ pattern, onPatch, onDelete, confirming }: {
  pattern: Pattern;
  onPatch: (f: Record<string, unknown>) => void;
  onDelete: () => void;
  confirming: boolean;
}) {
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingFields = useRef<Record<string, unknown>>({});

  const debounce = (fields: Record<string, unknown>) => {
    onPatch(fields);
    pendingFields.current = { ...pendingFields.current, ...fields };
    if (pendingTimer.current) clearTimeout(pendingTimer.current);
    pendingTimer.current = setTimeout(() => {
      pendingFields.current = {};
      pendingTimer.current = null;
    }, 600);
  };

  const immediate = (fields: Record<string, unknown>) => {
    if (pendingTimer.current) { clearTimeout(pendingTimer.current); pendingTimer.current = null; }
    onPatch({ ...pendingFields.current, ...fields });
    pendingFields.current = {};
  };

  useEffect(() => {
    return () => { if (pendingTimer.current) clearTimeout(pendingTimer.current); };
  }, []);

  const sel ='px-1.5 py-1 rounded-lg border border-border bg-background text-foreground text-[12.5px] outline-none';

  return (
    <div className="p-3 rounded-xl border border-border bg-muted/30 flex flex-col gap-2.5">
      <div className="flex flex-wrap gap-2 items-end">
        <Field label="סוג">
          <select value={pattern.kind} onChange={e => immediate({ kind: e.target.value })} className={sel} style={{ width: 110 }}>
            {KINDS.map(k => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
          </select>
        </Field>
        <Field label="יום">
          <select value={pattern.day_of_week ?? ''} onChange={e => immediate({ day_of_week: e.target.value || null })} className={sel} style={{ width: 100 }}>
            <option value="">—</option>
            {DAYS.map(d => <option key={d} value={d}>{DAY_LABELS[d]}</option>)}
          </select>
        </Field>
        <Field label="שעת התחלה">
          <input type="time" value={pattern.start_time ?? ''} onChange={e => debounce({ start_time: e.target.value || null })} className={sel} style={{ width: 100 }} />
        </Field>
        <Field label="שעת סיום">
          <input type="time" value={pattern.end_time ?? ''} onChange={e => debounce({ end_time: e.target.value || null })} className={sel} style={{ width: 100 }} />
        </Field>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <BinaryPicker label="חשיבות" value={pattern.default_importance} highLabel="חשוב" lowLabel="לא חשוב" onChange={v => immediate({ default_importance: v })} />
        <BinaryPicker label="דחיפות" value={pattern.default_urgency} highLabel="דחוף" lowLabel="לא דחוף" onChange={v => immediate({ default_urgency: v })} />
        <button
          onClick={onDelete}
          className={[
            'ms-auto text-[12px] px-2.5 py-1 rounded-lg border transition-all',
            confirming ? 'bg-red-600 text-white border-transparent font-semibold' : 'border-red-400/60 text-red-500 bg-transparent',
          ].join(' ')}
        >{confirming ? 'בטוח?' : 'מחק'}</button>
      </div>
    </div>
  );
}

function NewPatternForm({ categoryId, onCancel, onCreate }: { categoryId: number; onCancel: () => void; onCreate: (p: Record<string, unknown>) => void }) {
  const [draft, setDraft] = useState({
    category_id: categoryId, kind: 'lecture', day_of_week: '', start_time: '', end_time: '',
    default_importance: null as number | null, default_urgency: null as number | null,
  });
  const set = (f: Partial<typeof draft>) => setDraft(d => ({ ...d, ...f }));
  const submit = () => {
    const payload = { ...draft };
    for (const k of Object.keys(payload) as (keyof typeof payload)[]) {
      if (payload[k] === '') (payload as Record<string, unknown>)[k] = null;
    }
    onCreate(payload as Record<string, unknown>);
  };
  const sel = 'px-1.5 py-1 rounded-lg border border-border bg-background text-foreground text-[12.5px] outline-none';
  return (
    <div className="p-3 rounded-xl border border-orange-400/60 bg-card flex flex-col gap-2.5">
      <div className="text-[12px] font-semibold text-foreground">תבנית חדשה</div>
      <div className="flex flex-wrap gap-2 items-end">
        <Field label="סוג">
          <select value={draft.kind} onChange={e => set({ kind: e.target.value })} className={sel} style={{ width: 110 }}>
            {KINDS.map(k => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
          </select>
        </Field>
        <Field label="יום">
          <select value={draft.day_of_week} onChange={e => set({ day_of_week: e.target.value })} className={sel} style={{ width: 100 }}>
            <option value="">—</option>
            {DAYS.map(d => <option key={d} value={d}>{DAY_LABELS[d]}</option>)}
          </select>
        </Field>
        <Field label="שעת התחלה">
          <input type="time" value={draft.start_time} onChange={e => set({ start_time: e.target.value })} className={sel} style={{ width: 100 }} />
        </Field>
        <Field label="שעת סיום">
          <input type="time" value={draft.end_time} onChange={e => set({ end_time: e.target.value })} className={sel} style={{ width: 100 }} />
        </Field>
      </div>
      <div className="flex flex-wrap gap-3 items-center">
        <BinaryPicker label="חשיבות" value={draft.default_importance} highLabel="חשוב" lowLabel="לא חשוב" onChange={v => set({ default_importance: v })} />
        <BinaryPicker label="דחיפות" value={draft.default_urgency} highLabel="דחוף" lowLabel="לא דחוף" onChange={v => set({ default_urgency: v })} />
      </div>
      <div className="flex gap-2 ms-auto">
        <Button variant="outline" size="sm" onClick={onCancel}>ביטול</Button>
        <Button size="sm" onClick={submit}>שמור</Button>
      </div>
    </div>
  );
}

function NewCourseInline({ onCreate, onCancel }: { onCreate: (p: Record<string, unknown>) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#6B7280');
  return (
    <div className="p-4 rounded-xl border border-orange-400/60 bg-card flex flex-col gap-3">
      <div className="text-[13px] font-semibold">קורס חדש</div>
      <input autoFocus dir="rtl" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') onCreate({ name: name.trim(), color_dark: color.replace('#', '') }); else if (e.key === 'Escape') onCancel(); }} placeholder="שם הקורס" className="px-3 py-2 rounded-lg border border-border bg-background text-[14px] outline-none" />
      <div className="flex items-center gap-2.5">
        <input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-10 h-9 rounded border-0 cursor-pointer" />
        <span className="text-[12px] font-mono text-muted-foreground">{color}</span>
      </div>
      <div className="flex gap-2 ms-auto">
        <Button variant="outline" size="sm" onClick={onCancel}>ביטול</Button>
        <Button size="sm" disabled={!name.trim()} onClick={() => onCreate({ name: name.trim(), color_dark: color.replace('#', '') })}>שמור</Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function BinaryPicker({ label, value, highLabel, lowLabel, onChange }: {
  label: string; value: number | null; highLabel: string; lowLabel: string; onChange: (v: number | null) => void;
}) {
  const Btn = ({ v, txt, color }: { v: number | null; txt: string; color: string }) => {
    const active = v === null ? value == null : value === v;
    return (
      <button
        onClick={() => onChange(v)}
        className="px-2.5 py-0.5 rounded-full text-[11.5px] border transition-all"
        style={{
          border: active ? '2px solid transparent' : undefined,
          background: active ? color : undefined,
          color: active ? 'white' : undefined,
          fontWeight: active ? 600 : undefined,
        }}
      >{txt}</button>
    );
  };
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
      {label}:
      <Btn v={null} txt="—" color="#94A3B8" />
      <Btn v={5} txt={highLabel} color="#DC2626" />
      <Btn v={1} txt={lowLabel} color="#6B7280" />
    </span>
  );
}
