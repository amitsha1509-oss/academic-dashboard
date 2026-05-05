import { useState } from 'react';
import { MessageSquare, X, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import * as api from '@/lib/api';

export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!text.trim()) return;
    setSending(true);
    try {
      await api.submitFeedback(text.trim(), window.location.pathname);
      toast.success('תודה על המשוב!');
      setText('');
      setOpen(false);
    } catch {
      toast.error('שגיאה בשליחה, נסה שוב');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 start-5 z-40 w-10 h-10 rounded-full bg-foreground text-background flex items-center justify-center shadow-lg hover:scale-105 transition-transform"
        title="שלח משוב"
      >
        <MessageSquare size={16} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-start p-5"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-80 bg-card border border-border rounded-2xl shadow-xl p-4 flex flex-col gap-3 animate-in slide-in-from-bottom-4 duration-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm">משוב</span>
              <Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => setOpen(false)}>
                <X size={14} />
              </Button>
            </div>
            <Textarea
              dir="rtl"
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="מה עובד, מה לא, מה חסר..."
              className="text-sm resize-none min-h-[80px]"
              onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) send(); }}
            />
            <Button onClick={send} disabled={!text.trim() || sending} size="sm" className="self-end gap-1.5">
              <Send size={13} />
              {sending ? 'שולח...' : 'שלח'}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
