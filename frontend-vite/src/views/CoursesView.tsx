import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { ChevronDown, ChevronRight, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import * as api from '@/lib/api';
import type { Category } from '@/types';

const FEEL_GROUPS = [
  { key: 'gap',       label: 'פער גדול',      color: '#DC2626' },
  { key: 'partial',   label: 'בערך על החומר', color: '#F59E0B' },
  { key: 'excellent', label: 'מרגיש מעולה',   color: '#10B981' },
  { key: null,        label: 'טרם דורג',      color: '#9CA3AF' },
] as const;

export function CoursesView() {
  const [cats, setCats] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [groupBy, setGroupBy] = useState<'default' | 'feel'>('default');
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.listCategories();
      setCats(data.filter(c => c.name !== 'כללי').sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const patch = async (id: number, fields: Record<string, unknown>) => {
    setSavingId(id);
    try {
      await api.patchCategory(id, fields);
      setCats(cs => cs.map(c => c.id === id ? { ...c, ...fields } as Category : c));
    } catch (e) {
      toast.error('שמירה נכשלה: ' + (e as Error).message);
    } finally { setSavingId(null); }
  };

  const handleCreate = async (payload: Record<string, unknown>) => {
    try {
      const created = await api.createCategory(payload);
      setCats(cs => [...cs, created].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)));
      setAdding(false);
    } catch (e) {
      toast.error('יצירה נכשלה: ' + (e as Error).message);
    }
  };

  if (loading) return <div className="py-16 text-center text-muted-foreground text-sm">טוען...</div>;

  const renderCard = (c: Category) => (
    <CourseCard key={c.id} cat={c} onPatch={patch} saving={savingId === c.id} />
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="p-3 rounded-xl bg-card border border-border text-sm text-muted-foreground italic">
        דרג כל קורס לפי איך אתה מרגיש איתו. תוכל להרחיב על פערים ספציפיים בתיבה. הכל נשמר אוטומטית.
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>תצוגה:</span>
          {(['default', 'feel'] as const).map(k => (
            <button
              key={k}
              onClick={() => setGroupBy(k)}
              className={[
                'px-3 py-1.5 rounded-full text-[13px] border transition-all',
                groupBy === k
                  ? 'bg-foreground text-background border-transparent font-semibold'
                  : 'bg-card border-border text-muted-foreground',
              ].join(' ')}
            >{k === 'default' ? 'סדר רגיל' : 'לפי הרגשה'}</button>
          ))}
        </div>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="ms-auto text-[12.5px] px-3.5 py-1.5 rounded-lg border border-dashed border-border text-muted-foreground hover:border-foreground/40 transition-colors"
          >+ קורס חדש</button>
        )}
      </div>

      {adding && <NewCourseForm onCreate={handleCreate} onCancel={() => setAdding(false)} />}

      {cats.length === 0 && !adding && (
        <div className="p-6 text-center text-muted-foreground text-sm rounded-xl border border-dashed border-border">
          אין קורסים עדיין — הוסף קורס למעלה
        </div>
      )}

      {groupBy === 'default' && cats.map(renderCard)}

      {groupBy === 'feel' && FEEL_GROUPS.map(g => {
        const inGroup = cats.filter(c => (c.self_confidence ?? null) === g.key);
        if (inGroup.length === 0) return null;
        return (
          <div key={g.key ?? 'unrated'} className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-[13px] font-semibold" style={{ color: g.color }}>
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: g.color }} />
              {g.label}
              <span className="text-muted-foreground font-normal">({inGroup.length})</span>
            </div>
            {inGroup.map(renderCard)}
          </div>
        );
      })}
    </div>
  );
}

function CourseCard({ cat, onPatch, saving }: { cat: Category; onPatch: (id: number, f: Record<string, unknown>) => void; saving: boolean }) {
  const [notes, setNotes] = useState(cat.gap_notes ?? '');
  const [showKw, setShowKw] = useState(false);
  const [kwList, setKwList] = useState(
    (cat.keywords ?? '').split(',').map(k => k.trim()).filter(Boolean)
  );
  const [newKw, setNewKw] = useState('');
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestNotes = useRef(notes);
  const color = '#' + (cat.color_dark ?? '6B7280');
  const conf = cat.self_confidence;

  const saveNotes = (text: string) => {
    fetch(`/categories/${cat.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gap_notes: text }),
      credentials: 'include',
      keepalive: true,
    }).catch(() => {});
  };

  const saveKeywords = (list: string[]) => {
    fetch(`/categories/${cat.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keywords: list.join(',') }),
      credentials: 'include',
      keepalive: true,
    }).catch(() => {});
  };

  const onChangeNotes = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    setNotes(v);
    latestNotes.current = v;
    if (pendingTimer.current) clearTimeout(pendingTimer.current);
    pendingTimer.current = setTimeout(() => { saveNotes(latestNotes.current); pendingTimer.current = null; }, 600);
  };

  useEffect(() => {
    return () => {
      if (pendingTimer.current) { clearTimeout(pendingTimer.current); saveNotes(latestNotes.current); }
    };
  }, []);

  useEffect(() => {
    const flush = () => {
      if (pendingTimer.current) { clearTimeout(pendingTimer.current); saveNotes(latestNotes.current); pendingTimer.current = null; }
    };
    document.addEventListener('visibilitychange', flush);
    window.addEventListener('pagehide', flush);
    return () => { document.removeEventListener('visibilitychange', flush); window.removeEventListener('pagehide', flush); };
  }, []);

  const removeKw = (kw: string) => {
    const next = kwList.filter(k => k !== kw);
    setKwList(next);
    saveKeywords(next);
  };

  const addKw = () => {
    const v = newKw.trim();
    if (!v || kwList.includes(v)) { setNewKw(''); return; }
    const next = [...kwList, v];
    setKwList(next);
    setNewKw('');
    saveKeywords(next);
  };

  const setConf = (newConf: Category['self_confidence']) => {
    onPatch(cat.id, { self_confidence: newConf === conf ? null : newConf });
  };

  const ConfBtn = ({ value, label, dotColor }: { value: NonNullable<Category['self_confidence']>; label: string; dotColor: string }) => {
    const active = conf === value;
    return (
      <button
        onClick={() => setConf(value)}
        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12.5px] border transition-all"
        style={{
          border: active ? `2px solid ${dotColor}` : '1.5px solid var(--border)',
          background: active ? `${dotColor}18` : 'transparent',
          color: active ? dotColor : undefined,
          fontWeight: active ? 600 : 400,
        }}
      >
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: dotColor, opacity: active ? 1 : 0.45 }} />
        {label}
      </button>
    );
  };

  return (
    <div
      className="bg-card rounded-xl border border-border p-4 shadow-sm"
      style={{ borderInlineStart: `4px solid ${color}` }}
    >
      <div className="text-[15px] font-semibold text-foreground mb-2.5">{cat.name}</div>

      <div className="flex items-center gap-2 mb-2.5 flex-wrap text-[13px] text-muted-foreground">
        <span>איך אני מרגיש:</span>
        <ConfBtn value="excellent" label="מרגיש מעולה"   dotColor="#10B981" />
        <ConfBtn value="partial"   label="בערך על החומר" dotColor="#F59E0B" />
        <ConfBtn value="gap"       label="פער גדול"      dotColor="#DC2626" />
      </div>

      <Textarea
        dir="rtl"
        value={notes}
        onChange={onChangeNotes}
        placeholder="פערים ספציפיים, נושאים שצריך לחזור עליהם..."
        className="text-[13px] min-h-[60px] resize-y"
      />
      {saving && <div className="text-[11px] text-muted-foreground mt-1 italic">שומר...</div>}

      {/* Keywords */}
      <div className="mt-2.5">
        <button
          onClick={() => setShowKw(s => !s)}
          className="flex items-center gap-1 text-[11.5px] text-muted-foreground/70 hover:text-muted-foreground transition-colors"
        >
          {showKw ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          מילות מפתח ({kwList.length})
        </button>

        {showKw && (
          <div className="mt-2 flex flex-col gap-2">
            <div className="flex flex-wrap gap-1.5">
              {kwList.map(kw => (
                <span key={kw} className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-muted border border-border text-[12px] text-muted-foreground font-mono">
                  {kw}
                  <button onClick={() => removeKw(kw)} className="text-muted-foreground/60 hover:text-destructive ml-0.5" title="מחק">
                    <X size={11} />
                  </button>
                </span>
              ))}
              {kwList.length === 0 && <span className="text-[12px] text-muted-foreground/60 italic">אין מילות מפתח</span>}
            </div>
            <div className="flex gap-2 items-center">
              <input
                value={newKw}
                onChange={e => setNewKw(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addKw(); else if (e.key === 'Escape') setNewKw(''); }}
                placeholder="הוסף מילת מפתח..."
                className="px-2.5 py-1 rounded-lg border border-border bg-background text-[12.5px] font-mono text-foreground outline-none w-40"
              />
              <Button size="sm" variant="outline" onClick={addKw} disabled={!newKw.trim()} className="text-xs h-7">
                <Plus size={12} className="me-1" />הוסף
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function NewCourseForm({ onCreate, onCancel }: { onCreate: (p: Record<string, unknown>) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#6B7280');

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onCreate({ name: trimmed, color_dark: color.replace('#', '') });
  };

  return (
    <div className="p-4 border border-orange-400/60 rounded-xl bg-card flex flex-col gap-3">
      <div className="text-[13px] font-semibold text-foreground">קורס חדש</div>

      <div className="flex flex-col gap-1">
        <span className="text-[11px] text-muted-foreground font-medium">שם הקורס</span>
        <input
          autoFocus
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); else if (e.key === 'Escape') onCancel(); }}
          dir="rtl"
          className="px-3 py-2 rounded-lg border border-border bg-background text-[14px] text-foreground outline-none"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] text-muted-foreground font-medium">צבע</span>
        <div className="flex items-center gap-2.5">
          <input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-10 h-9 rounded cursor-pointer border-0" />
          <span className="text-[12px] text-muted-foreground font-mono px-2 py-1 rounded-md bg-muted border border-border">{color}</span>
        </div>
      </div>

      <div className="flex gap-2 ms-auto">
        <Button variant="outline" size="sm" onClick={onCancel}>ביטול</Button>
        <Button size="sm" onClick={submit} disabled={!name.trim()}>שמור</Button>
      </div>
    </div>
  );
}
