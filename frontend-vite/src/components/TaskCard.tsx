import { useState } from 'react';
import { Check, Trash2 } from 'lucide-react';
import type { Task } from '@/types';
import { isHebrew } from '@/lib/utils';

export interface TaskCardProps {
  task: Task;
  onToggleDone: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (task: Task) => void;
  fadingIds: Record<string, boolean>;
}

type Props = TaskCardProps;

const URGENCY_COLOR: Record<string, string> = {
  high: '#DC2626',
  low:  '#94A3B8',
};

function formatTime(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString('he-IL', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return null; }
}

export function TaskCard({ task, onToggleDone, onDelete, onEdit, fadingIds }: Props) {
  const [hover, setHover] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const done = task.status === 'done';
  const fading = !!fadingIds?.[task.id];
  const rtl = isHebrew(task.raw_text);
  const urgColor = URGENCY_COLOR[task.urgency] ?? URGENCY_COLOR.low;
  const timeLabel = formatTime(task.time_value);

  return (
    <div
      className={[
        'relative rounded-xl border transition-all duration-200 cursor-pointer select-none',
        done ? 'opacity-50' : '',
        fading ? 'opacity-0 -translate-y-2' : '',
        hover ? 'shadow-md -translate-y-0.5 bg-muted/60' : 'bg-card shadow-sm',
        task.urgency === 'high' && !done ? 'border-red-200 dark:border-red-900/40' : 'border-border',
      ].join(' ')}
      style={{ transition: 'all .18s cubic-bezier(.4,0,.2,1)' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setConfirming(false); }}
      onClick={e => {
        if ((e.target as HTMLElement).closest('[data-action]')) return;
        onEdit(task);
      }}
    >
      {/* Urgency edge */}
      <div
        className="absolute start-0 top-1.5 bottom-1.5 rounded-e-sm"
        style={{ width: task.urgency === 'high' ? 4 : 3, background: urgColor, opacity: done ? 0.4 : 1 }}
      />

      <div className="flex items-start gap-3 px-4 py-3">
        {/* Checkbox */}
        <button
          data-action="done"
          onClick={() => onToggleDone(task.id)}
          className={[
            'shrink-0 mt-0.5 w-[18px] h-[18px] rounded-full border flex items-center justify-center transition-all',
            done ? 'bg-green-500 border-green-500' : 'border-muted-foreground/50 bg-transparent hover:border-foreground',
          ].join(' ')}
          title={done ? 'פתח מחדש' : 'סמן כבוצע'}
        >
          {done && <Check size={11} strokeWidth={3} className="text-white" />}
        </button>

        {/* Body */}
        <div className="flex-1 min-w-0">
          <div
            dir={rtl ? 'rtl' : 'ltr'}
            className={['text-[15px] font-[450] leading-snug text-foreground', done ? 'line-through' : ''].join(' ')}
            style={{ wordBreak: 'break-word', textAlign: rtl ? 'right' : 'left' }}
          >
            {task.raw_text}
          </div>

          <div className="flex flex-wrap gap-1.5 mt-2" dir="ltr">
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-muted text-muted-foreground">
              {task.subject}
            </span>
            {timeLabel && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">
                {timeLabel}
              </span>
            )}
            <span className={[
              'inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium',
              task.urgency === 'high' ? 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300' : 'bg-muted text-muted-foreground',
            ].join(' ')}>
              {task.urgency === 'high' ? 'דחוף' : 'לא דחוף'}
            </span>
            <span className={[
              'inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium',
              task.importance === 'high' ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300' : 'bg-muted text-muted-foreground',
            ].join(' ')}>
              {task.importance === 'high' ? 'חשוב' : 'לא חשוב'}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className={['flex gap-1 shrink-0 transition-opacity', hover ? 'opacity-100' : 'opacity-0'].join(' ')}>
          {confirming ? (
            <>
              <button
                data-action="confirm"
                onClick={() => onDelete(task.id)}
                className="text-[11px] px-2 py-1 rounded-lg bg-red-600 text-white font-semibold border-none"
              >מחק</button>
              <button
                data-action="cancel"
                onClick={() => setConfirming(false)}
                className="text-[11px] px-2 py-1 rounded-lg border border-border text-muted-foreground bg-transparent"
              >ביטול</button>
            </>
          ) : (
            <button
              data-action="del"
              onClick={() => setConfirming(true)}
              className="w-7 h-7 rounded-lg border border-border bg-transparent text-muted-foreground flex items-center justify-center hover:text-destructive hover:border-destructive/40 transition-colors"
              title="מחק"
            >
              <Trash2 size={13} strokeWidth={1.8} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
