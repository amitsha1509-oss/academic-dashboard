import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Task } from '@/types';
import { isHebrew } from '@/lib/utils';

interface Props {
  task: Task;
  onClose: () => void;
  onSave: (draft: Task) => void;
}

function ChipGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  labelOf,
}: {
  label: string;
  options: T[];
  value: T;
  onChange: (v: T) => void;
  labelOf: (v: T) => string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {options.map(v => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={[
              'px-2.5 py-1 rounded-lg text-[12.5px] border transition-all',
              value === v
                ? 'bg-foreground text-background border-transparent font-semibold'
                : 'bg-transparent border-border text-muted-foreground hover:border-foreground/40',
            ].join(' ')}
          >
            {labelOf(v)}
          </button>
        ))}
      </div>
    </div>
  );
}

export function EditDialog({ task, onClose, onSave }: Props) {
  const [draft, setDraft] = useState<Task>(task);
  useEffect(() => setDraft(task), [task.id]);

  const rtl = isHebrew(draft.raw_text);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-black/30 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[520px] bg-card border border-border rounded-2xl shadow-xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <span className="text-lg font-semibold">עריכת משימה</span>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X size={18} />
          </Button>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-5 px-5 py-5">
          <div
            dir={rtl ? 'rtl' : 'ltr'}
            className="block text-[15px] text-foreground leading-snug px-3.5 py-2.5 bg-muted rounded-lg border border-border"
            style={{ textAlign: rtl ? 'right' : 'left' }}
          >
            {draft.raw_text}
          </div>

          <div className="grid grid-cols-2 gap-5">
            <ChipGroup
              label="חשיבות"
              options={['high', 'low'] as const}
              value={draft.importance}
              onChange={v => setDraft(d => ({ ...d, importance: v }))}
              labelOf={v => v === 'high' ? 'חשוב' : 'לא חשוב'}
            />
            <ChipGroup
              label="דחיפות"
              options={['high', 'low'] as const}
              value={draft.urgency}
              onChange={v => setDraft(d => ({ ...d, urgency: v }))}
              labelOf={v => v === 'high' ? 'דחוף' : 'לא דחוף'}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-border bg-muted/40">
          <Button variant="outline" onClick={onClose}>ביטול</Button>
          <Button onClick={() => onSave(draft)}>שמור</Button>
        </div>
      </div>
    </div>
  );
}
