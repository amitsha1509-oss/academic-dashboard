import { useState, useEffect, useRef } from 'react';
import { Send, Sparkles, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isHebrew } from '@/lib/utils';

interface Props {
  onCreate: (text: string, opts: { importance?: number | null; urgency?: number | null; due_at?: string | null }) => void;
  classifying: boolean;
  seedRef?: React.MutableRefObject<((txt: string) => void) | null>;
}

function toLocalIso(local: string): string {
  const d = new Date(local);
  const pad = (n: number) => String(n).padStart(2, '0');
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const oh = pad(Math.floor(Math.abs(off) / 60));
  const om = pad(Math.abs(off) % 60);
  return `${local}:00${sign}${oh}:${om}`;
}

export function CaptureBar({ onCreate, classifying, seedRef }: Props) {
  const [val, setVal] = useState('');
  const [pickedImp, setPickedImp] = useState<number | null>(null);
  const [pickedUrg, setPickedUrg] = useState<number | null>(null);
  const [pickedDue, setPickedDue] = useState('');
  const [showDue, setShowDue] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const rtl = isHebrew(val) || val === '';

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (seedRef) {
      seedRef.current = (txt: string) => {
        setVal(txt);
        setTimeout(() => inputRef.current?.focus(), 50);
      };
      return () => { seedRef.current = null; };
    }
  }, [seedRef]);

  const submit = () => {
    if (!val.trim() || classifying) return;
    onCreate(val.trim(), {
      importance: pickedImp,
      urgency: pickedUrg,
      due_at: pickedDue ? toLocalIso(pickedDue) : null,
    });
    setVal('');
    setPickedImp(null);
    setPickedUrg(null);
    setPickedDue('');
    setShowDue(false);
  };

  const PriBtn = ({ axis, level, label }: { axis: 'imp' | 'urg'; level: number; label: string }) => {
    const picked = axis === 'imp' ? pickedImp : pickedUrg;
    const setter = axis === 'imp' ? setPickedImp : setPickedUrg;
    const active = picked === level;
    return (
      <button
        type="button"
        onClick={() => setter(active ? null : level)}
        className={[
          'px-3 py-0.5 rounded-full text-[11.5px] transition-all border',
          active
            ? level === 5
              ? 'bg-red-600 text-white border-transparent font-semibold'
              : 'bg-gray-500 text-white border-transparent font-semibold'
            : 'border-border text-muted-foreground bg-background hover:bg-muted',
        ].join(' ')}
      >
        {label}
      </button>
    );
  };

  return (
    <div
      className={[
        'rounded-2xl border overflow-hidden transition-all duration-200',
        classifying ? 'bg-muted/60' : 'bg-card',
        'shadow-sm',
      ].join(' ')}
    >
      {classifying && (
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-r from-transparent via-orange-500/10 to-transparent animate-[shimmer_1.4s_linear_infinite]" />
      )}

      <div className="flex items-center gap-2 ps-4 pe-1 py-1">
        <Sparkles
          size={18}
          className={['shrink-0 transition-colors', classifying ? 'text-orange-500 animate-pulse' : 'text-muted-foreground'].join(' ')}
        />

        <input
          ref={inputRef}
          value={val}
          data-capture
          dir={rtl ? 'rtl' : 'ltr'}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); }}
          placeholder="הוסף משימה..."
          disabled={classifying}
          className="flex-1 min-w-0 bg-transparent border-none outline-none text-lg py-4 text-foreground placeholder:text-muted-foreground disabled:opacity-50"
          style={{ textAlign: rtl ? 'right' : 'left' }}
        />

        {classifying && (
          <div className="flex gap-1 px-2 text-orange-500">
            {[0, 1, 2].map(i => (
              <span
                key={i}
                className="block w-1.5 h-1.5 rounded-full bg-current animate-bounce"
                style={{ animationDelay: `${i * 0.16}s` }}
              />
            ))}
          </div>
        )}

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setShowDue(s => !s)}
          disabled={classifying}
          className={['shrink-0 w-9 h-9 rounded-xl', pickedDue ? 'text-orange-500 border border-orange-400 bg-orange-50 dark:bg-orange-950/20' : ''].join(' ')}
          title="בחר תאריך יעד"
        >
          <Calendar size={16} />
        </Button>

        <Button
          onClick={submit}
          disabled={!val.trim() || classifying}
          size="icon"
          className="shrink-0 w-11 h-11 rounded-xl"
        >
          <Send size={16} />
        </Button>
      </div>

      {showDue && (
        <div className="flex items-center gap-2 px-4 pb-2 pt-1 border-t border-border">
          <span className="text-xs text-muted-foreground shrink-0">תאריך יעד:</span>
          <input
            type="datetime-local"
            value={pickedDue}
            onChange={e => setPickedDue(e.target.value)}
            className="text-xs border border-border rounded-lg px-2 py-1 bg-background text-foreground outline-none"
          />
          {pickedDue && (
            <button
              type="button"
              onClick={() => setPickedDue('')}
              className="text-muted-foreground text-sm px-1"
              title="נקה תאריך"
            >✕</button>
          )}
        </div>
      )}

      <div className="flex flex-col gap-1.5 px-4 pb-3 text-xs text-muted-foreground">
        <div className="flex gap-3.5 items-center flex-nowrap">
          <span className="flex items-center gap-1 shrink-0">
            חשיבות: <PriBtn axis="imp" level={5} label="חשוב" /> <PriBtn axis="imp" level={2} label="לא חשוב" />
          </span>
          <span className="flex items-center gap-1 shrink-0">
            דחיפות: <PriBtn axis="urg" level={5} label="דחוף" /> <PriBtn axis="urg" level={2} label="לא דחוף" />
          </span>
        </div>
        <span className="text-[11px] italic text-muted-foreground/70">לא תבחר ⇒ ייקבע לפי הפרופיל שלך</span>
      </div>
    </div>
  );
}
