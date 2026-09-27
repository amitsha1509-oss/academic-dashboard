import { Check, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from "react";
import { useStore } from "../lib/store";

export const COLORS = ["gray", "brown", "orange", "yellow", "green", "teal", "blue", "purple", "pink", "red"];

export function tagStyle(color = "gray"): CSSProperties {
  const c = COLORS.includes(color) ? color : "gray";
  return { background: `var(--tag-${c}-bg)`, color: `var(--tag-${c}-fg)` };
}

export function Tag({ color, children, onRemove }: { color?: string; children: ReactNode; onRemove?: () => void }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded px-1.5 text-[13px] leading-[1.6] whitespace-nowrap" style={tagStyle(color)}>
      <span className="truncate">{children}</span>
      {onRemove && (
        <button type="button" onClick={(e) => { e.stopPropagation(); onRemove(); }} className="opacity-60 hover:opacity-100" aria-label="הסר">
          <X size={12} />
        </button>
      )}
    </span>
  );
}

export function Button({ variant = "ghost", className = "", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "ghost" | "primary" | "outline" | "danger" }) {
  const styles = {
    ghost: "text-muted hover:bg-hover hover:text-ink",
    primary: "bg-accent text-white hover:opacity-90",
    outline: "border border-line text-ink hover:bg-hover",
    danger: "text-danger hover:bg-hover",
  }[variant];
  return (
    <button
      type="button"
      className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm transition-colors disabled:opacity-40 ${styles} ${className}`}
      {...rest}
    />
  );
}

export function IconButton({ label, className = "", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-hover hover:text-ink ${className}`}
      {...rest}
    />
  );
}

/** Round completion toggle, like a task checkbox. */
export function StatusCheck({ done, onToggle, size = 18, color }: { done: boolean; onToggle: () => void; size?: number; color?: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={done ? "סמן כלא בוצע" : "סמן כבוצע"}
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      className="group inline-flex shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors"
      style={{
        width: size, height: size,
        borderColor: done ? "var(--accent)" : color ? `var(--tag-${color}-fg)` : "var(--faint)",
        background: done ? "var(--accent)" : "transparent",
      }}
    >
      <Check size={size - 6} strokeWidth={3} className={done ? "text-white" : "text-faint opacity-0 group-hover:opacity-100"} />
    </button>
  );
}

/**
 * A floating panel anchored to its trigger. Positioned with fixed coordinates so it is
 * never clipped by scrolling containers, and flips upward near the bottom of the screen.
 */
export function Popover({
  trigger, children, width = 260, className = "",
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: (close: () => void) => ReactNode;
  width?: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({});

  useLayoutEffect(() => {
    if (!open || !anchor.current) return;
    const r = anchor.current.getBoundingClientRect();
    const w = Math.min(width, window.innerWidth - 16);
    let right = window.innerWidth - r.right;
    if (window.innerWidth - right - w < 8) right = window.innerWidth - w - 8;
    right = Math.max(8, right);
    const below = window.innerHeight - r.bottom;
    setStyle(below < 300 && r.top > below
      ? { position: "fixed", right, bottom: window.innerHeight - r.top + 4, width: w }
      : { position: "fixed", right, top: r.bottom + 4, width: w });
  }, [open, width]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !anchor.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onScroll = (e: Event) => !panel.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  return (
    <>
      <span ref={anchor} className="inline-flex max-w-full">{trigger({ open, toggle: () => setOpen((o) => !o) })}</span>
      {open && (
        <div
          ref={panel}
          style={style}
          className={`scroll-thin z-50 max-h-[min(360px,70vh)] overflow-y-auto rounded-lg bg-popover p-1 shadow-pop ${className}`}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </>
  );
}

export function MenuItem({ children, onClick, active, danger, icon }: {
  children: ReactNode; onClick: () => void; active?: boolean; danger?: boolean; icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-sm hover:bg-hover ${danger ? "text-danger" : ""}`}
    >
      {icon && <span className="flex w-5 shrink-0 justify-center text-muted">{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {active && <Check size={14} className="shrink-0 text-muted" />}
    </button>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className="px-2 pt-2 pb-1 text-xs font-medium text-faint">{children}</div>;
}

export function Divider() {
  return <div className="my-1 h-px bg-line" />;
}

export function SearchInput({ value, onChange, placeholder = "חיפוש…", autoFocus = true, onEnter }: {
  value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean; onEnter?: () => void;
}) {
  return (
    <input
      autoFocus={autoFocus}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
      placeholder={placeholder}
      className="mb-1 w-full rounded-md border border-line bg-transparent px-2 py-1.5 text-sm outline-none focus:border-accent"
    />
  );
}

export function PageHeader({ icon, title, subtitle, actions }: { icon?: ReactNode; title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <h1 className="flex items-center gap-2 text-[28px] leading-tight font-bold md:text-[32px]">
          {icon && <span className="text-[26px] md:text-[30px]">{icon}</span>}
          <span className="min-w-0 truncate">{title}</span>
        </h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1 pt-1">{actions}</div>}
    </header>
  );
}

export function Section({ title, count, children, action, tone }: {
  title: ReactNode; count?: number; children: ReactNode; action?: ReactNode; tone?: "danger";
}) {
  return (
    <section className="mb-7">
      <div className="mb-1 flex items-center gap-2 border-b border-line pb-1.5">
        <h2 className={`text-sm font-semibold ${tone === "danger" ? "text-danger" : "text-muted"}`}>{title}</h2>
        {count !== undefined && <span className="text-xs text-faint">{count}</span>}
        <div className="flex-1" />
        {action}
      </div>
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="py-3 text-sm text-faint">{children}</div>;
}

export function Toasts() {
  const { toasts, dismissToast } = useStore();
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto flex items-center gap-3 rounded-lg bg-[#2f3437] px-4 py-2.5 text-sm text-white shadow-pop dark:bg-[#3a3a3a]">
          <span>{t.message}</span>
          {t.action && (
            <button
              type="button"
              className="font-semibold text-[#8ec5ff] hover:underline"
              onClick={() => { t.action!.run(); dismissToast(t.id); }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
