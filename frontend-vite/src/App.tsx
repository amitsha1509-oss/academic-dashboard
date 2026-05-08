import { useState, useEffect, useRef, useCallback } from 'react';
import { Toaster, toast } from 'sonner';
import { List, Layers, Grid2X2, BookOpen, Calendar, LogOut, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import * as api from '@/lib/api';
import type { Task, User } from '@/types';
import { CaptureBar } from '@/components/CaptureBar';
import { TaskCard, type TaskCardProps } from '@/components/TaskCard';
import { EditDialog } from '@/components/EditDialog';
import { CoursesView } from '@/views/CoursesView';
import { ScheduleView } from '@/views/ScheduleView';
import { FeedbackButton } from '@/components/FeedbackButton';

export { isHebrew } from '@/lib/utils';

const VIEWS = [
  { id: 'all',        label: 'הכל',         Icon: List },
  { id: 'subject',    label: 'לפי קורס',    Icon: Layers },
  { id: 'eisenhower', label: 'מטריצה',      Icon: Grid2X2 },
  { id: 'courses',    label: 'קורסים',      Icon: BookOpen },
  { id: 'schedule',   label: 'מערכת שעות',  Icon: Calendar },
] as const;
type ViewId = typeof VIEWS[number]['id'];

function EmptyState() {
  return (
    <div className="text-center py-16 text-muted-foreground">
      <div className="text-5xl mb-4">✓</div>
      <div className="text-base font-medium mb-1">אין משימות פתוחות</div>
      <div className="text-sm">הוסף משימה למעלה</div>
    </div>
  );
}

type CardSharedProps = Omit<TaskCardProps, 'task'>;

function SubjectView({ tasks, ...rest }: { tasks: Task[] } & CardSharedProps) {
  const groups = tasks.filter(t => t.status === 'open').reduce<Record<string, Task[]>>((acc, t) => {
    (acc[t.subject] ??= []).push(t);
    return acc;
  }, {});
  const subjects = Object.keys(groups).sort();
  if (subjects.length === 0) return <EmptyState />;
  return (
    <div className="flex flex-col gap-6">
      {subjects.map(s => (
        <div key={s}>
          <div className="text-sm font-semibold text-muted-foreground mb-2">{s} <span className="font-normal">({groups[s].length})</span></div>
          <div className="flex flex-col gap-2">{groups[s].map(t => <TaskCard key={t.id} task={t} {...rest} />)}</div>
        </div>
      ))}
    </div>
  );
}

function EisenhowerView({ tasks, ...rest }: { tasks: Task[] } & CardSharedProps) {
  const q = [
    { imp: 'high', urg: 'high', label: 'חשוב + דחוף',      cls: 'border-red-400' },
    { imp: 'high', urg: 'low',  label: 'חשוב + לא דחוף',   cls: 'border-amber-400' },
    { imp: 'low',  urg: 'high', label: 'לא חשוב + דחוף',   cls: 'border-sky-400' },
    { imp: 'low',  urg: 'low',  label: 'לא חשוב + לא דחוף', cls: 'border-gray-300' },
  ] as const;
  return (
    <div className="grid grid-cols-2 gap-3">
      {q.map(({ imp, urg, label, cls }) => {
        const group = tasks.filter(t => t.importance === imp && t.urgency === urg && t.status === 'open');
        return (
          <div key={label} className={`border-2 ${cls} rounded-xl p-3 flex flex-col gap-2`}>
            <div className="text-xs font-semibold text-muted-foreground pb-1 border-b">{label} ({group.length})</div>
            {group.map(t => <TaskCard key={t.id} task={t} {...rest} />)}
            {group.length === 0 && <div className="text-xs text-muted-foreground italic text-center py-3">ריק</div>}
          </div>
        );
      })}
    </div>
  );
}

function App({ user }: { user: User }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [view, setView] = useState<ViewId>('all');
  const [classifying, setClassifying] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [fadingIds, setFadingIds] = useState<Record<string, boolean>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const captureRef = useRef<((txt: string) => void) | null>(null);

  const reload = useCallback(async () => {
    try {
      setTasks(await api.listTasks('all'));
      setLoadError(null);
    } catch (e) { setLoadError(String((e as Error).message)); }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inField = ['INPUT', 'TEXTAREA'].includes((document.activeElement as HTMLElement)?.tagName ?? '');
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        (document.querySelector('[data-capture]') as HTMLInputElement)?.focus();
        return;
      }
      if (inField || editing) return;
      const idx = parseInt(e.key, 10);
      if (idx >= 1 && idx <= VIEWS.length) setView(VIEWS[idx - 1].id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editing]);

  const handleCreate = async (raw: string, opts: { importance?: number | null; urgency?: number | null; due_at?: string | null }) => {
    setClassifying(true);
    try {
      const task = await api.createTask(raw, opts);
      setTasks(ts => [task, ...ts]);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes('קורסים')) {
        toast.error('אין קורסים מוגדרים', {
          description: 'צור קורס לפני הוספת משימות',
          action: { label: 'לקורסים ←', onClick: () => setView('courses') },
        });
      } else {
        toast.error('שגיאה ביצירת משימה: ' + msg);
      }
    }
    finally { setClassifying(false); }
  };

  const handleToggleDone = (id: string) => {
    const cur = tasks.find(t => t.id === id);
    const nowDone = cur?.status !== 'done';
    const next = nowDone ? 'done' : 'open';
    setTasks(ts => ts.map(t => t.id === id ? { ...t, status: next } : t));
    void api.patchTask(id, { status: next }).catch(e => console.warn('patch failed', e));
    if (nowDone) {
      setTimeout(() => {
        setFadingIds(m => ({ ...m, [id]: true }));
        setTimeout(() => {
          setTasks(ts => ts.filter(t => t.id !== id));
          setFadingIds(m => { const c = { ...m }; delete c[id]; return c; });
          void api.deleteTask(id).catch(() => {});
        }, 700);
      }, 550);
    }
  };

  const handleDelete = (id: string) => {
    setTasks(ts => ts.filter(t => t.id !== id));
    void api.deleteTask(id).catch(e => console.warn('delete failed', e));
  };

  const handleSaveEdit = async (draft: Task) => {
    try {
      await api.patchTask(draft.id, { importance: draft.importance, urgency: draft.urgency });
      setTasks(ts => ts.map(t => t.id === draft.id ? { ...t, ...draft } : t));
      setEditing(null);
    } catch (e) { toast.error('שגיאה בשמירה: ' + (e as Error).message); }
  };

  const openCount = tasks.filter(t => t.status === 'open').length;
  const cardProps = { onToggleDone: handleToggleDone, onDelete: handleDelete, onEdit: (t: Task) => setEditing(t), fadingIds };
  const openTasks = tasks.filter(t => t.status === 'open');

  const renderView = () => {
    switch (view) {
      case 'all':        return openTasks.length === 0 ? <EmptyState /> :
        <div className="flex flex-col gap-2">{openTasks.map(t => <TaskCard key={t.id} task={t} {...cardProps} />)}</div>;
      case 'subject':    return <SubjectView tasks={tasks} {...cardProps} />;
      case 'eisenhower': return <EisenhowerView tasks={tasks} {...cardProps} />;
      case 'courses':    return <CoursesView />;
      case 'schedule':   return <ScheduleView />;
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20" dir="rtl">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">

        <div className="flex items-center gap-3 pt-8 pb-5">
          <div className="w-8 h-8 rounded-xl bg-foreground text-background flex items-center justify-center text-sm font-bold italic shrink-0">N</div>
          <span className="text-xl font-semibold tracking-tight">Nucleus</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-mono">{openCount} פתוחות</span>
          <span className="ms-auto text-xs text-muted-foreground hidden sm:block">
            {new Date().toLocaleDateString('he-IL', { weekday: 'long', month: 'long', day: 'numeric' })}
          </span>
          <Button variant="ghost" size="sm" className="text-muted-foreground gap-1.5 text-xs"
            onClick={async () => { await api.authLogout(); location.reload(); }}>
            <LogOut size={13} />{user.name ?? user.email}
          </Button>
        </div>

        {loadError && (
          <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">שגיאה בטעינה: {loadError}</span>
            <Button variant="outline" size="sm" onClick={() => void reload()}><RefreshCw size={12} className="me-1" />טען מחדש</Button>
          </div>
        )}

        <div className="sticky top-0 z-20 pt-2 pb-4 bg-gradient-to-b from-background via-background to-transparent">
          <CaptureBar onCreate={handleCreate} classifying={classifying} seedRef={captureRef} />
        </div>

        <Tabs value={view} onValueChange={v => setView(v as ViewId)} className="mb-6">
          <TabsList className="w-full justify-start h-auto p-1 bg-muted/60 rounded-xl overflow-x-auto flex-nowrap">
            {VIEWS.map((v, i) => (
              <TabsTrigger key={v.id} value={v.id}
                className="gap-1.5 text-xs px-3 py-2 rounded-lg whitespace-nowrap data-[state=active]:bg-background data-[state=active]:shadow-sm"
                title={`${v.label} (${i + 1})`}>
                <v.Icon size={13} />{v.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div key={view} className="animate-in fade-in duration-200">{renderView()}</div>

        <div className="flex justify-between items-center mt-12 pt-6 border-t border-border text-xs text-muted-foreground">
          <span className="italic">מה הדבר הכי חשוב להיום?</span>
          <span className="font-mono"><kbd className="px-1.5 py-0.5 rounded bg-muted border border-border">⌘K</kbd> לכתיבה</span>
        </div>
      </div>

      {editing && <EditDialog task={editing} onClose={() => setEditing(null)} onSave={handleSaveEdit} />}
      <FeedbackButton />
      <Toaster position="bottom-center" dir="rtl" richColors />
    </div>
  );
}

function LoginScreen({ error }: { error?: string }) {
  const [busy, setBusy] = useState(false);
  const [showError, setShowError] = useState(error ?? '');
  const [devUsers, setDevUsers] = useState<{ id: number; name: string | null; email: string }[] | null>(null);
  const [pickedId, setPickedId] = useState(1);

  useEffect(() => {
    if (!['localhost', '127.0.0.1'].includes(window.location.hostname)) { setDevUsers([]); return; }
    fetch('/auth/dev_users', { credentials: 'include' }).then(r => r.ok ? r.json() : []).then(setDevUsers).catch(() => setDevUsers([]));
  }, []);

  const signInGoogle = (e: React.MouseEvent) => { e.preventDefault(); window.location.replace('/auth/google/login'); };
  const signInDev = async (e: React.MouseEvent) => {
    e.preventDefault(); setBusy(true); setShowError('');
    try {
      const r = await fetch(`/auth/dev_login?user_id=${pickedId}`, { credentials: 'include' });
      if (r.ok) { window.location.replace('/'); return; }
      setShowError(`Login failed: ${r.status}`);
    } catch (err) { setShowError((err as Error).message); }
    finally { setBusy(false); }
  };

  const isDevMode = Array.isArray(devUsers) && devUsers.length > 0;
  return (
    <div className="min-h-screen flex items-center justify-center p-5 bg-background" dir="rtl">
      <div className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-lg p-8 text-center">
        <div className="w-12 h-12 rounded-xl bg-foreground text-background flex items-center justify-center text-xl font-bold italic mx-auto mb-5">N</div>
        <h1 className="text-2xl font-bold mb-2 tracking-tight">Nucleus</h1>
        <p className="text-muted-foreground text-sm mb-7 leading-relaxed">הלוח האקדמי שלך — הכל במקום אחד</p>
        <Button onClick={signInGoogle} disabled={busy} className="w-full gap-2 mb-4">
          <span className="font-bold text-base">G</span>{busy ? 'מתחבר...' : 'התחבר עם Google'}
        </Button>
        {isDevMode && (
          <div className="p-3 bg-muted rounded-xl border border-dashed text-start text-xs">
            <div className="text-muted-foreground font-semibold mb-2">Dev mode</div>
            <div className="flex gap-2">
              <select value={pickedId} onChange={e => setPickedId(parseInt(e.target.value, 10))}
                className="flex-1 px-2 py-1.5 rounded-lg border border-border bg-background text-xs outline-none">
                {devUsers!.map(u => <option key={u.id} value={u.id}>#{u.id} · {u.name ?? u.email}</option>)}
              </select>
              <Button variant="outline" size="sm" onClick={signInDev} disabled={busy} className="text-xs">Sign in</Button>
            </div>
          </div>
        )}
        {showError && <div className="mt-4 p-3 rounded-lg bg-destructive/10 text-muted-foreground text-xs text-start">{showError}</div>}
      </div>
    </div>
  );
}

export function Bootstrap() {
  const [authState, setAuthState] = useState<
    { status: 'loading' } | { status: 'signed-in'; user: User } | { status: 'signed-out'; error?: string }
  >({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    api.authMe()
      .then(user => { if (!cancelled) setAuthState(user ? { status: 'signed-in', user } : { status: 'signed-out' }); })
      .catch(e => { if (!cancelled) setAuthState({ status: 'signed-out', error: (e as Error).message }); });
    return () => { cancelled = true; };
  }, []);

  if (authState.status === 'loading')
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm" dir="rtl">טוען...</div>;
  if (authState.status === 'signed-out') return <LoginScreen error={authState.error} />;
  return <App user={authState.user} />;
}

export default App;
