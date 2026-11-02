// Shared pieces of the bayes simulations: the two-column layout, a short tween driver (per-frame work in refs,
// one setState at the end), the hand-worked correction table (prior × likelihood = product → posterior) and
// small formatting helpers. Imports the topic stylesheet.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePrefersReducedMotion } from '../../../anim/hooks';
import { Rich } from '../../../ui/Rich';
import '../bayes.css';

/** Probability with fixed decimals (steady width in tables). */
export const f4 = (x: number) => (Number.isFinite(x) ? x.toFixed(4) : '—');
export const f3 = (x: number) => (Number.isFinite(x) ? x.toFixed(3) : '—');
export const f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : '—');
/** A table entry: two decimals, or three when the value needs them (0.125 stays 0.125, not 0.13). */
export const fLik = (x: number) => (!Number.isFinite(x) ? '—' : Math.abs(x * 100 - Math.round(x * 100)) > 1e-6 ? x.toFixed(3) : x.toFixed(2));

export const easeInOut = (p: number) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);

/**
 * Runs short animations: tween(ms, frame, done) calls frame(eased progress 0…1) every animation frame and done()
 * at the end. Starting a new tween finishes the previous one at once. Honours prefers-reduced-motion.
 */
export function useTween() {
  const raf = useRef(0);
  const pending = useRef<{ frame: (p: number) => void; done?: () => void } | null>(null);
  const reduced = usePrefersReducedMotion();
  const finish = useCallback(() => {
    cancelAnimationFrame(raf.current);
    const p = pending.current;
    pending.current = null;
    if (p) {
      p.frame(1);
      p.done?.();
    }
  }, []);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  return useCallback(
    (ms: number, frame: (p: number) => void, done?: () => void) => {
      finish();
      if (reduced || ms <= 0) {
        frame(1);
        done?.();
        return;
      }
      pending.current = { frame, done };
      const t0 = performance.now();
      const loop = (now: number) => {
        const p = Math.min(1, (now - t0) / ms);
        frame(easeInOut(p));
        if (p < 1) raf.current = requestAnimationFrame(loop);
        else {
          pending.current = null;
          done?.();
        }
      };
      frame(0);
      raf.current = requestAnimationFrame(loop);
    },
    [finish, reduced]
  );
}

/** Two columns: the visual (sticky below the app header) and the controls/readouts/predictions. */
export function BayesLayout({ left, right, below }: { left: ReactNode; right: ReactNode; below?: ReactNode }) {
  return (
    <div className="bayes-sim">
      <div className="bayes-layout">
        <div className="bayes-left">{left}</div>
        <div className="bayes-right">{right}</div>
      </div>
      {below}
    </div>
  );
}

export function Panel({ title, children, className = '', live }: { title?: ReactNode; children: ReactNode; className?: string; live?: boolean }) {
  return (
    <section className={`bayes-panel ${className}`} aria-live={live ? 'polite' : undefined}>
      {title && <h4>{title}</h4>}
      {children}
    </section>
  );
}

export interface HandRow {
  key: string;
  /** Label cell (plain text or Rich). */
  label: ReactNode;
  prior: number;
  lik: number;
  product: number;
  post: number;
  /** Optional colour chip for the state. */
  chip?: string;
}

/**
 * The correction table the worked solutions draw: x | prior | P(z | x) | product | posterior, with the sum row
 * (Σ prior = 1, Σ product = P(z), Σ posterior = 1). The most likely state is marked.
 */
export function HandTable({ rows, zTex, priorTex = 'P(x)', postTex = 'P(x \\mid z)', caption, compact }: { rows: HandRow[]; zTex: string; priorTex?: string; postTex?: string; caption?: string; compact?: boolean }) {
  const ev = rows.reduce((a, r) => a + r.product, 0);
  const best = rows.reduce((a, r, i) => (r.post > rows[a].post ? i : a), 0);
  return (
    <div className="bayes-table-wrap">
      <table className={`bayes-table ${compact ? 'is-compact' : ''}`}>
        {caption && <caption>{caption}</caption>}
        <thead>
          <tr>
            <th className="is-left">x</th>
            <th>
              <Rich text={`$${priorTex}$`} inline />
            </th>
            <th>
              <Rich text={`$P(${zTex} \\mid x)$`} inline />
            </th>
            <th>product</th>
            <th>
              <Rich text={`$${postTex}$`} inline />
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.key} className={i === best ? 'is-best' : undefined}>
              <td className="is-left">
                {r.chip && <span className="bayes-chip" style={{ background: r.chip }} aria-hidden="true" />}
                {r.label}
              </td>
              <td>{f4(r.prior)}</td>
              <td>{fLik(r.lik)}</td>
              <td>{f4(r.product)}</td>
              <td className="is-post">{f4(r.post)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className="is-left">Σ</td>
            <td>{f4(rows.reduce((a, r) => a + r.prior, 0))}</td>
            <td />
            <td className="is-ev" title="The sum of the products is P(z), the evidence; η = 1/P(z)">
              {f4(ev)}
            </td>
            <td>{f4(rows.reduce((a, r) => a + r.post, 0))}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/**
 * A probability cell the student can type into. A plain controlled <input type="number"> loses a half-typed
 * "0." (the browser reports it as empty, React writes the old number back), so this keeps the typed text as a
 * draft while focused, commits whenever it is a complete number (and on blur / Enter), and steps with ↑ / ↓.
 */
export function NumCell({
  value,
  onCommit,
  label,
  className,
  min = 0,
  max = 1,
  step = 0.01,
  title,
}: {
  value: number;
  onCommit: (v: number) => void;
  label: string;
  className?: string;
  min?: number;
  max?: number;
  step?: number;
  title?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const fmt = (v: number) => String(Number(v.toFixed(3)));
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  const parse = (s: string) => {
    const t = s.trim().replace(',', '.');
    return /^\d*\.?\d+$/.test(t) ? Number(t) : NaN;
  };
  return (
    <input
      className={className}
      type="text"
      inputMode="decimal"
      value={draft ?? fmt(value)}
      aria-label={label}
      title={title}
      onFocus={(e) => {
        setDraft(fmt(value));
        e.currentTarget.select();
      }}
      onChange={(e) => {
        setDraft(e.target.value);
        const v = parse(e.target.value);
        if (Number.isFinite(v)) onCommit(clamp(v));
      }}
      onBlur={() => setDraft(null)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          const v = clamp(Math.round((value + (e.key === 'ArrowUp' ? step : -step)) * 1000) / 1000);
          onCommit(v);
          setDraft(fmt(v));
        }
      }}
    />
  );
}

/** Seeded uniform random numbers that survive re-renders (for hidden robots and sampled readings). */
export function useRand(seed: number) {
  const s = useRef(seed >>> 0);
  return useCallback(() => {
    s.current = (s.current + 0x6d2b79f5) >>> 0;
    let t = s.current;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }, []);
}

/** Scroll the sticky visual into view after a prediction's "Show me" (it may sit above the fold). */
export function revealVisual(el: HTMLElement | null) {
  if (!el || typeof window === 'undefined') return;
  const HEADER = 106;
  const r = el.getBoundingClientRect();
  let dy = 0;
  if (r.top < HEADER - 4) dy = r.top - HEADER;
  else if (r.top > window.innerHeight * 0.6) dy = r.top - HEADER;
  if (Math.abs(dy) > 2) window.scrollBy({ top: dy, behavior: 'smooth' });
}
