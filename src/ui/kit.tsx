// Shared UI building blocks. Keep simulations visually consistent by using these.
import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Rich, TeX } from './Rich';
import { fmtSig } from '../engine/format';

export type Tone = 'm1' | 'm2' | 'm3' | 'm4' | 'ok' | 'bad' | 'warn' | 'muted' | 'accent' | 'pred';

// ------------------------------------------------------------------ basics

export function Button({
  variant = 'default',
  size = 'md',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'primary' | 'ghost' | 'danger' | 'ok'; size?: 'sm' | 'md' }) {
  return <button type="button" className={`btn btn-${variant} btn-${size} ${className}`} {...props} />;
}

export function LinkButton({ href, children, variant = 'default', className = '' }: { href: string; children: ReactNode; variant?: 'default' | 'primary' | 'ghost'; className?: string }) {
  return (
    <a href={href} className={`btn btn-${variant} btn-md ${className}`}>
      {children}
    </a>
  );
}

export function Card({ title, children, className = '', actions, sub }: { title?: ReactNode; sub?: ReactNode; children?: ReactNode; className?: string; actions?: ReactNode }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="card-head">
          <div>
            {title && <h3 className="card-title">{title}</h3>}
            {sub && <div className="card-sub">{sub}</div>}
          </div>
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

const CALLOUT_ICON: Record<string, string> = { info: 'i', trap: '!', ok: '✓', bad: '✗', note: '•', warn: '!' };

export function Callout({ kind = 'info', title, children }: { kind?: 'info' | 'trap' | 'ok' | 'bad' | 'note' | 'warn'; title?: ReactNode; children?: ReactNode }) {
  return (
    <div className={`callout callout-${kind}`} role={kind === 'bad' || kind === 'trap' ? 'alert' : undefined}>
      <span className="callout-icon" aria-hidden="true">
        {CALLOUT_ICON[kind]}
      </span>
      <div className="callout-body">
        {title && <div className="callout-title">{title}</div>}
        {children}
      </div>
    </div>
  );
}

export function Badge({ children, tone = 'muted', title }: { children: ReactNode; tone?: Tone; title?: string }) {
  return (
    <span className={`badge badge-${tone}`} title={title}>
      {children}
    </span>
  );
}

/** Progressive disclosure. */
export function More({ label = 'More', children, open }: { label?: ReactNode; children: ReactNode; open?: boolean }) {
  return (
    <details className="more" open={open}>
      <summary>{label}</summary>
      <div className="more-body">{children}</div>
    </details>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

export function ProgressBar({ value, max = 1, tone = 'accent', label }: { value: number; max?: number; tone?: Tone; label?: string }) {
  const p = Math.max(0, Math.min(1, max ? value / max : 0));
  return (
    <div className="pbar" role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={label}>
      <div className={`pbar-fill bg-${tone}`} style={{ width: `${p * 100}%` }} />
    </div>
  );
}

// ------------------------------------------------------------------ symbols & readouts

/** A maths symbol with a tooltip explaining it (hover, or keyboard focus when `focusable`). */
export function Sym({ tex, tip, focusable = true }: { tex: string; tip: string; focusable?: boolean }) {
  return (
    <span className="sym" tabIndex={focusable ? 0 : undefined} data-tip={tip} aria-label={tip} title={focusable ? undefined : tip}>
      <TeX>{tex}</TeX>
    </span>
  );
}

const SUP_DIGITS = '⁰¹²³⁴⁵⁶⁷⁸⁹';
/** "7.018×10⁵" -> 7.018×10<sup>5</sup> (monospace fonts lack clear superscript glyphs). */
function SciText({ text }: { text: string }) {
  const m = /^(.*?)×10([⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+)$/.exec(text);
  if (!m) return <>{text}</>;
  const exp = m[2].replace(/[⁻⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (c) => (c === '⁻' ? '−' : String(SUP_DIGITS.indexOf(c))));
  return (
    <>
      {m[1]}×10<sup>{exp}</sup>
    </>
  );
}

export function Readout({
  tex,
  label,
  value,
  unit,
  sig = 4,
  tip,
  tone,
  text,
}: {
  tex?: string;
  label?: string;
  value?: number;
  unit?: string;
  sig?: number;
  tip?: string;
  tone?: Tone;
  /** Show this text instead of a number. */
  text?: string;
}) {
  return (
    <div className={`readout ${tone ? `tone-${tone}` : ''}`}>
      <div className="readout-label">
        {tex && (tip ? <Sym tex={tex} tip={tip} focusable={false} /> : <TeX>{tex}</TeX>)}
        {label &&
          (tip && !tex ? (
            <span className="readout-text sym" data-tip={tip} title={tip} aria-label={`${label}: ${tip}`}>
              {label}
            </span>
          ) : (
            <span className="readout-text">{label}</span>
          ))}
      </div>
      <div className="readout-value">
        {text ?? (value === undefined ? '—' : <SciText text={fmtSig(value, sig)} />)}
        {unit && text === undefined && <span className="readout-unit"> {unit}</span>}
      </div>
    </div>
  );
}

/** Grid of readouts. `min` sets the minimum column width in px (default 118); use ~170 for long values. */
export function Readouts({ children, min }: { children: ReactNode; min?: number }) {
  return (
    <div className="readouts" style={min ? { gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))` } : undefined}>
      {children}
    </div>
  );
}

// ------------------------------------------------------------------ controls

export interface SliderProps {
  label: string;
  tex?: string;
  tip?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  log?: boolean;
  unit?: string;
  sig?: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  /** Optional formatter for the shown value. */
  format?: (v: number) => string;
}

const LOG_STEPS = 1000;

export function Slider({ label, tex, tip, value, min, max, step, log, unit, sig = 3, onChange, disabled, format }: SliderProps) {
  const id = useId();
  const toPos = (v: number) => (log ? (Math.log(v / min) / Math.log(max / min)) * LOG_STEPS : v);
  const fromPos = (p: number) => (log ? min * Math.pow(max / min, p / LOG_STEPS) : p);
  const shown = format ? format(value) : `${fmtSig(value, sig)}${unit ? ` ${unit}` : ''}`;
  // Click the value to type an exact number (Enter to apply, Esc to cancel).
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const commit = () => {
    const v = Number(draft.replace(',', '.'));
    if (Number.isFinite(v)) onChange(Math.max(min, Math.min(max, v)));
    setEditing(false);
  };
  return (
    <div className={`slider ${disabled ? 'is-disabled' : ''}`}>
      <label htmlFor={id} className="slider-label">
        {tex && (tip ? <Sym tex={tex} tip={tip} /> : <TeX>{tex}</TeX>)}
        <span>{label}</span>
      </label>
      <input
        id={id}
        type="range"
        min={log ? 0 : min}
        max={log ? LOG_STEPS : max}
        step={log ? 1 : step ?? (max - min) / 200}
        value={toPos(value)}
        disabled={disabled}
        aria-valuetext={shown}
        onChange={(e) => onChange(fromPos(Number(e.target.value)))}
      />
      {editing ? (
        <input
          className="slider-edit"
          autoFocus
          inputMode="decimal"
          value={draft}
          aria-label={`${label}: type a value${unit ? ` in ${unit}` : ''}`}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            else if (e.key === 'Escape') setEditing(false);
          }}
        />
      ) : (
        <button
          type="button"
          className="slider-value"
          disabled={disabled}
          title="Click to type an exact value"
          aria-label={`${label} = ${shown}. Click to type a value.`}
          onClick={() => {
            setDraft(String(Number(value.toPrecision(6))));
            setEditing(true);
          }}
        >
          {shown}
        </button>
      )}
    </div>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
  size = 'md',
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
  label?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div className={`seg seg-${size}`} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          title={o.title}
          className={`seg-btn ${o.value === value ? 'is-on' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden="true">
        <span className="toggle-thumb" />
      </span>
      <span>{label}</span>
    </label>
  );
}

export function Select<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  const id = useId();
  return (
    <span className="select-wrap">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)} className="select">
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </span>
  );
}

// ------------------------------------------------------------------ mastery ring

export function MasteryRing({ value, size = 44, n, label }: { value: number; size?: number; n?: number; label?: string }) {
  const r = (size - 6) / 2;
  const C = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, value));
  const tone = p >= 0.8 ? 'var(--ok)' : p >= 0.5 ? 'var(--accent)' : p > 0 ? 'var(--warn)' : 'var(--border)';
  return (
    <span className="ring" title={label ?? `Mastery ${Math.round(p * 100)} %${n !== undefined ? ` (${n} recent attempts)` : ''}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={5} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={tone}
          strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray={`${C * p} ${C}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="ring-text">{Math.round(p * 100)}</span>
    </span>
  );
}

// ------------------------------------------------------------------ modal

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : 'Dialog'} tabIndex={-1} ref={ref}>
        <header className="modal-head">
          <h3>{title}</h3>
          <Button variant="ghost" onClick={onClose} aria-label="Close">
            ✕
          </Button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ misc

/** Rich text shown as a small muted note. */
export function Note({ text }: { text: string }) {
  return <Rich className="note" text={text} />;
}

/** Two-column layout for a simulation: visual on the left, controls/readouts on the right. */
export function SimLayout({ visual, controls, below }: { visual: ReactNode; controls: ReactNode; below?: ReactNode }) {
  return (
    <div className="sim">
      <div className="sim-visual">{visual}</div>
      <div className="sim-controls">{controls}</div>
      {below && <div className="sim-below">{below}</div>}
    </div>
  );
}

/** A colour-keyed legend. */
export function Legend({ items }: { items: { label: ReactNode; color: string; dash?: boolean | string }[] }) {
  return (
    <div className="legend">
      {items.map((it, i) => (
        <span key={i} className="legend-item">
          <svg width="22" height="10" aria-hidden="true">
            <line x1="1" y1="5" x2="21" y2="5" stroke={it.color} strokeWidth="2.5" strokeDasharray={it.dash === true ? '5 3' : it.dash || undefined} />
          </svg>
          {it.label}
        </span>
      ))}
    </div>
  );
}

/** Mode colour CSS variable for mode index (1-based). */
export const modeColor = (i: number) => `var(--m${((i - 1) % 4) + 1})`;
