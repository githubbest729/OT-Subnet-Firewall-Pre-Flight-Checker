import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { useEffect, useState } from 'react';
import { AlertOctagon, AlertTriangle, Info, Trash2 } from 'lucide-react';
import type { Finding, Severity } from '../lib/validate';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

/* ---------- controls (all at least 48px tall for gloved / tablet use) ---------- */

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' | 'dark' };

export function Btn({ variant = 'ghost', className, ...p }: BtnProps) {
  return (
    <button
      type="button"
      {...p}
      className={cx(
        'inline-flex min-h-12 items-center justify-center gap-2 rounded-md border-2 px-4 font-semibold select-none active:translate-y-px disabled:opacity-40',
        variant === 'primary' && 'border-ink bg-signal text-ink',
        variant === 'ghost' && 'border-ink bg-white text-ink',
        variant === 'dark' && 'border-ink bg-ink text-white',
        variant === 'danger' && 'border-alarm bg-white text-alarm',
        className,
      )}
    />
  );
}

/** Two-tap delete: the first tap arms the button, the second confirms. */
export function DeleteBtn({ onConfirm, label = 'Delete' }: { onConfirm: () => void; label?: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <Btn variant={armed ? 'primary' : 'danger'} className={armed ? '!border-alarm !bg-alarm !text-white' : ''} onClick={() => (armed ? onConfirm() : setArmed(true))}>
      <Trash2 size={18} />
      {armed ? 'Tap again to delete' : label}
    </Btn>
  );
}

export function TextInput({ invalid, mono, className, ...p }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean; mono?: boolean }) {
  return (
    <input
      {...p}
      aria-invalid={invalid || undefined}
      className={cx(
        'min-h-12 w-full rounded-md border-2 bg-white px-3',
        mono && 'font-mono',
        invalid ? 'border-alarm bg-alarm-tint text-alarm' : 'border-ink',
        className,
      )}
    />
  );
}

export function Select({ className, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...p} className={cx('min-h-12 w-full rounded-md border-2 border-ink bg-white px-3', className)} />;
}

export function Field({ label, error, children, className }: { label: string; error?: string | null; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1 block text-sm font-semibold">{label}</span>
      {children}
      {error && (
        <span role="alert" className="mt-1 flex items-start gap-1 text-sm font-semibold text-alarm">
          <AlertOctagon size={16} className="mt-0.5 shrink-0" />
          {error}
        </span>
      )}
    </label>
  );
}

export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex overflow-hidden rounded-md border-2 border-ink bg-white">
      {options.map((o, i) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx(
            'min-h-12 flex-1 px-3 font-semibold',
            i > 0 && 'border-l-2 border-ink',
            o.value === value ? 'bg-ink text-white' : 'bg-white text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Large on/off switch with a text state so it never relies on colour alone. */
export function Switch({ on, onChange, label, tone = 'go' }: { on: boolean; onChange: (v: boolean) => void; label: string; tone?: 'go' | 'signal' }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cx(
        'relative h-12 w-28 shrink-0 rounded-full border-2 border-ink text-sm font-bold transition-colors',
        on ? (tone === 'go' ? 'bg-go text-white' : 'bg-signal text-ink') : 'bg-white text-ink',
      )}
    >
      <span className={cx('absolute top-1/2 -translate-y-1/2', on ? 'left-4' : 'right-4')}>{on ? 'Yes' : 'No'}</span>
      <span
        className={cx(
          'absolute top-1 h-9 w-9 rounded-full border-2 border-ink bg-white transition-all',
          on ? 'right-1' : 'left-1',
        )}
      />
    </button>
  );
}

export function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cx('min-h-12 rounded-md border-2 border-ink px-3 font-semibold', on ? 'bg-ink text-white' : 'bg-white text-ink')}
    >
      {on ? '\u2713 ' : ''}
      {children}
    </button>
  );
}

export function Card({ children, className, id, highlight }: { children: ReactNode; className?: string; id?: string; highlight?: boolean }) {
  return (
    <section
      id={id}
      className={cx('rounded-lg border-2 border-ink bg-white p-4', highlight && 'ring-8 ring-signal', className)}
    >
      {children}
    </section>
  );
}

/* ---------- findings ---------- */

export const SEV: Record<Severity, { label: string; icon: typeof Info; head: string; body: string }> = {
  error: { label: 'Blocking', icon: AlertOctagon, head: 'bg-alarm text-white', body: 'border-alarm bg-white' },
  warning: { label: 'Warning', icon: AlertTriangle, head: 'bg-caution-tint text-caution', body: 'border-caution bg-white' },
  info: { label: 'Note', icon: Info, head: 'bg-info-tint text-info', body: 'border-info bg-white' },
};

export function SeverityTag({ sev }: { sev: Severity }) {
  const s = SEV[sev];
  const Icon = s.icon;
  return (
    <span className={cx('inline-flex items-center gap-1 rounded px-2 py-0.5 text-sm font-bold', s.head)}>
      <Icon size={16} />
      {s.label}
    </span>
  );
}

export function FindingCard({ f, onOpen }: { f: Finding; onOpen?: (f: Finding) => void }) {
  const s = SEV[f.severity];
  const Icon = s.icon;
  return (
    <article className={cx('overflow-hidden rounded-lg border-2', s.body)}>
      <header className={cx('flex items-start gap-2 px-3 py-2 font-bold', s.head)}>
        <Icon size={22} className="mt-0.5 shrink-0" />
        <span className="leading-snug">{f.title}</span>
      </header>
      <div className="space-y-1 px-3 py-2 text-[0.95rem] leading-snug">
        <p>{f.detail}</p>
        <p className="font-semibold">Fix: {f.fix}</p>
        {f.target && onOpen && (
          <button type="button" onClick={() => onOpen(f)} className="min-h-12 font-bold underline underline-offset-4">
            Open in topology
          </button>
        )}
      </div>
    </article>
  );
}

export function InlineFindings({ list }: { list: Finding[] | undefined }) {
  if (!list || list.length === 0) return null;
  return (
    <ul className="mt-3 space-y-1">
      {list.map((f) => {
        const s = SEV[f.severity];
        const Icon = s.icon;
        return (
          <li key={f.id} className={cx('flex items-start gap-2 rounded px-2 py-1 text-sm font-semibold', s.head)}>
            <Icon size={18} className="mt-0.5 shrink-0" />
            <span>{f.title}</span>
          </li>
        );
      })}
    </ul>
  );
}
