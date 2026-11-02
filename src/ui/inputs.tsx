// Answer inputs for Solve parts: numeric (unit-aware), matrix, order, choice and the Lagrange term builder.
import { useMemo, useState, type KeyboardEvent } from 'react';
import { usePersisted } from './persist';
import { evaluate } from '../engine/expr';
import type { ChoicePart, MatrixPart, NumericPart, OrderPart, TermsPart } from '../engine/types';
import { Rich, TeX } from './Rich';
import { Button, Callout, Segmented } from './kit';
import { checkChoice, checkMatrix, checkNumeric, checkOrder, checkTerms, deriveMatrices, type Bucket, type Verdict } from '../engine/check';
import { FREQ_UNITS, isFreqUnit } from '../core/units';
import { hashString, makeRng } from '../engine/rng';
import { tex } from '../engine/format';

export interface PartResult {
  correct: boolean;
  trapId?: string;
}

/** Matrix as TeX bmatrix. */
export function matTeX(A: number[][], sig = 4): string {
  const rows = A.map((r) => r.map((x) => (Math.abs(x) < 1e-12 ? '0' : tex(x, sig))).join(' & '));
  return `\\begin{bmatrix} ${rows.join(' \\\\ ')} \\end{bmatrix}`;
}

function VerdictView({ v }: { v: Verdict | null }) {
  if (!v) return null;
  if (v.invalid) return <Callout kind="warn">{v.message && <Rich text={v.message} />}</Callout>;
  return (
    <Callout kind={v.correct ? 'ok' : 'bad'} title={v.correct ? 'Correct' : v.trapId ? 'Trap spotted' : 'Not yet'}>
      {v.message && <Rich text={v.message} />}
    </Callout>
  );
}

// ------------------------------------------------------------------ numeric

const FREQ_TOKENS: Record<string, string> = { hz: 'Hz', 'rad/s': 'rad/s', rads: 'rad/s', 'rad/sec': 'rad/s', rpm: 'rpm', 'r/min': 'rpm' };

/**
 * Accept an answer typed with its unit ("2.35 Hz"): a frequency unit switches the unit toggle,
 * the part's own unit is stripped, anything else gets a plain instruction.
 */
function splitUnit(raw: string, part: NumericPart): { value: string; unit?: string; error?: string } {
  if (Number.isFinite(evaluate(raw))) return { value: raw };
  const m = /^(.*?\d[\d.)\s]*?)\s*([A-Za-zµμ°%][A-Za-z0-9µμ°%/·.\s²³⁻]*)$/.exec(raw.trim());
  if (!m || !Number.isFinite(evaluate(m[1]))) return { value: raw };
  const tok = m[2].replace(/\s+/g, '').toLowerCase();
  if (part.freq && FREQ_TOKENS[tok]) return { value: m[1], unit: FREQ_TOKENS[tok] };
  if (part.unit && tok === part.unit.replace(/\s+/g, '').toLowerCase()) return { value: m[1] };
  return { value: raw, error: `Type just the number${part.unit ? ` (the answer is in ${part.unit})` : ' (dimensionless)'}; units other than the one shown are not converted.` };
}

export function NumericInput({ part, onResult, disabled, pkey }: { part: NumericPart; onResult: (r: PartResult) => void; disabled?: boolean; pkey?: string }) {
  const [raw, setRaw] = usePersisted(pkey && `${pkey}:raw`, '');
  const freq = !!part.freq && isFreqUnit(part.unit);
  const [unit, setUnit] = usePersisted<string>(pkey && `${pkey}:unit`, part.unit);
  const [verdict, setVerdict] = usePersisted<Verdict | null>(pkey && `${pkey}:verdict`, null);
  const check = () => {
    const sp = splitUnit(raw, part);
    if (sp.error) {
      setVerdict({ correct: false, invalid: true, message: sp.error });
      return;
    }
    const u = sp.unit ?? unit;
    if (sp.unit) setUnit(sp.unit);
    const v = checkNumeric(part, sp.value, u);
    setVerdict(v);
    if (!v.invalid) onResult({ correct: v.correct, trapId: v.trapId });
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') check();
  };
  return (
    <div className="part-input">
      <div className="row gap-s wrap">
        <input
          className="num-input"
          inputMode="decimal"
          value={raw}
          disabled={disabled}
          placeholder="e.g. 12.5, 2*pi*50 or 3.1 Hz"
          aria-label="Your answer"
          onChange={(e) => setRaw(e.target.value)}
          onKeyDown={onKey}
        />
        {freq ? (
          <Segmented size="sm" label="Answer unit" value={unit} onChange={setUnit} options={FREQ_UNITS.map((u) => ({ value: u, label: u }))} />
        ) : (
          part.unit && <span className="unit-label">{part.unit}</span>
        )}
        <Button variant="primary" onClick={check} disabled={disabled || !raw.trim()}>
          Check
        </Button>
      </div>
      <VerdictView v={verdict} />
    </div>
  );
}

// ------------------------------------------------------------------ matrix

export function MatrixInput({ part, onResult, disabled, pkey }: { part: MatrixPart; onResult: (r: PartResult) => void; disabled?: boolean; pkey?: string }) {
  const rows = part.answer.length;
  const cols = part.answer[0].length;
  const [cells, setCells] = usePersisted<string[][]>(pkey && `${pkey}:cells`, () => Array.from({ length: rows }, () => new Array<string>(cols).fill('')));
  const [marks, setMarks] = usePersisted<boolean[][] | null>(pkey && `${pkey}:marks`, null);
  const [verdict, setVerdict] = usePersisted<Verdict | null>(pkey && `${pkey}:verdict`, null);
  const check = () => {
    const v = checkMatrix(part, cells);
    setVerdict(v);
    if (!v.invalid) {
      setMarks(v.cells);
      onResult({ correct: v.correct, trapId: v.trapId });
    }
  };
  return (
    <div className="part-input">
      <div className="matrix-wrap">
        <table className="matrix-input">
          {part.colLabels && (
            <thead>
              <tr>
                {part.rowLabels && <th />}
                {part.colLabels.map((c, j) => (
                  <th key={j}>
                    <Rich text={c} inline />
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {cells.map((row, i) => (
              <tr key={i}>
                {part.rowLabels && (
                  <th>
                    <Rich text={part.rowLabels[i]} inline />
                  </th>
                )}
                {row.map((val, j) => (
                  <td key={j} className={marks ? (marks[i][j] ? 'cell-ok' : 'cell-bad') : ''}>
                    <input
                      value={val}
                      disabled={disabled}
                      inputMode={part.symbolic ? 'text' : 'decimal'}
                      autoCapitalize="off"
                      autoCorrect="off"
                      spellCheck={false}
                      placeholder={part.placeholder}
                      aria-label={`Row ${i + 1}, column ${j + 1}`}
                      onChange={(e) => {
                        const next = cells.map((r) => r.slice());
                        next[i][j] = e.target.value;
                        setCells(next);
                        setMarks(null);
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && check()}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {part.unit && <span className="unit-label">{part.unit}</span>}
      </div>
      {part.symbolic && (
        <p className="muted small">
          Type numbers or expressions in {part.symbolic.vars.join(', ')}, e.g. <code>-{part.symbolic.vars[0]}</code>
          {part.symbolic.vars[1] ? (
            <>
              {' '}
              or{' '}
              <code>
                {part.symbolic.vars[0]}+{part.symbolic.vars[1]}
              </code>
            </>
          ) : null}
          . Write 0 for zero.
        </p>
      )}
      <Button variant="primary" onClick={check} disabled={disabled}>
        Check {part.symbolic ? 'table' : 'matrix'}
      </Button>
      <VerdictView v={verdict} />
    </div>
  );
}

// ------------------------------------------------------------------ order

export function OrderInput({ part, onResult, disabled, seed, pkey }: { part: OrderPart; onResult: (r: PartResult) => void; disabled?: boolean; seed: number; pkey?: string }) {
  const initial = useMemo(() => {
    const idx = part.steps.map((_, i) => i);
    let sh = makeRng(seed ^ hashString(part.id)).shuffle(idx);
    if (sh.every((v, i) => v === i) && sh.length > 1) sh = [...sh.slice(1), sh[0]];
    return sh;
  }, [part, seed]);
  const [order, setOrder] = usePersisted<number[]>(pkey && `${pkey}:order`, initial);
  const [result, setResult] = usePersisted<ReturnType<typeof checkOrder> | null>(pkey && `${pkey}:result`, null);
  const [drag, setDrag] = useState<number | null>(null);
  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length) return;
    const next = order.slice();
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    setOrder(next);
    setResult(null);
  };
  const check = () => {
    const r = checkOrder(part, order);
    setResult(r);
    onResult({ correct: r.correct });
  };
  return (
    <div className="part-input">
      <ol className="order-list">
        {order.map((stepIdx, pos) => (
          <li
            key={stepIdx}
            draggable={!disabled}
            onDragStart={() => setDrag(pos)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (drag !== null) move(drag, pos);
              setDrag(null);
            }}
            className={`order-item ${result ? (stepIdx === pos ? 'cell-ok' : 'cell-bad') : ''}`}
          >
            <span className="order-handle" aria-hidden="true">
              ⋮⋮
            </span>
            <span className="order-text">
              <Rich text={part.steps[stepIdx]} inline />
            </span>
            <span className="order-btns">
              <button type="button" className="icon-btn" aria-label="Move up" disabled={disabled || pos === 0} onClick={() => move(pos, pos - 1)}>
                ↑
              </button>
              <button type="button" className="icon-btn" aria-label="Move down" disabled={disabled || pos === order.length - 1} onClick={() => move(pos, pos + 1)}>
                ↓
              </button>
            </span>
          </li>
        ))}
      </ol>
      <Button variant="primary" onClick={check} disabled={disabled}>
        Check order
      </Button>
      {result && (
        <Callout kind={result.correct ? 'ok' : 'bad'} title={result.correct ? 'Correct order' : 'Not yet'}>
          {!result.correct && (
            <>
              <p>{result.message}</p>
              <details>
                <summary>Show the correct order</summary>
                <ol>
                  {part.steps.map((s, i) => (
                    <li key={i}>
                      <Rich text={s} inline />
                    </li>
                  ))}
                </ol>
              </details>
            </>
          )}
        </Callout>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ choice

export function ChoiceInput({ part, onResult, disabled, seed, pkey }: { part: ChoicePart; onResult: (r: PartResult) => void; disabled?: boolean; seed: number; pkey?: string }) {
  const order = useMemo(() => makeRng(seed ^ hashString(part.id)).shuffle(part.options.map((_, i) => i)), [part, seed]);
  const [sel, setSel] = usePersisted<number[]>(pkey && `${pkey}:sel`, []);
  const [checked, setChecked] = usePersisted<Verdict | null>(pkey && `${pkey}:checked`, null);
  const toggle = (i: number) => {
    if (checked) return;
    setSel((s) => (part.multi ? (s.includes(i) ? s.filter((x) => x !== i) : [...s, i]) : [i]));
  };
  const check = () => {
    const v = checkChoice(part, sel);
    setChecked(v);
    onResult({ correct: v.correct });
  };
  return (
    <div className="part-input">
      <div className="options" role={part.multi ? 'group' : 'radiogroup'}>
        {order.map((i) => {
          const o = part.options[i];
          const on = sel.includes(i);
          const st = checked ? (o.correct ? 'is-right' : on ? 'is-wrong' : '') : on ? 'is-picked' : '';
          return (
            <button key={i} type="button" role={part.multi ? 'checkbox' : 'radio'} aria-checked={on} className={`option ${st}`} onClick={() => toggle(i)} disabled={disabled}>
              <span className="option-mark" aria-hidden="true">
                {checked ? (o.correct ? '✓' : on ? '✗' : '') : on ? '●' : ''}
              </span>
              <span className="option-body">
                <Rich text={o.text} inline />
                {checked && o.why && (
                  <span className="option-why">
                    <Rich text={o.why} inline />
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
      {!checked && (
        <Button variant="primary" onClick={check} disabled={disabled || !sel.length}>
          Check
        </Button>
      )}
      {checked && <Callout kind={checked.correct ? 'ok' : 'bad'} title={checked.correct ? 'Correct' : 'Not quite: see why under each option'} />}
    </div>
  );
}

// ------------------------------------------------------------------ Lagrange term builder

export function TermBuilder({ part, onResult, disabled, seed, pkey }: { part: TermsPart; onResult: (r: PartResult) => void; disabled?: boolean; seed: number; pkey?: string }) {
  const order = useMemo(() => makeRng(seed ^ hashString(part.id)).shuffle(part.terms.map((_, i) => i)), [part, seed]);
  const [place, setPlace] = usePersisted<Record<string, Bucket | undefined>>(pkey && `${pkey}:place`, {});
  const [result, setResult] = usePersisted<ReturnType<typeof checkTerms> | null>(pkey && `${pkey}:result`, null);
  const live = deriveMatrices(part, place);
  // Nothing is pre-selected: an untouched distractor must not count as correctly rejected.
  const placedCount = part.terms.filter((t) => place[t.id]).length;
  const coordVec = `\\begin{bmatrix} ${part.coords.join(' \\\\ ')} \\end{bmatrix}`;
  const check = () => {
    const r = checkTerms(part, place);
    setResult(r);
    const wrong = part.terms.find((t, i) => !r.perTerm[i]);
    const trapId = wrong ? (/(lever|deflect)/i.test(wrong.why) ? 'lever-arm' : /parallel|I_O|I_G/i.test(wrong.why) ? 'parallel-axis' : undefined) : undefined;
    onResult({ correct: r.correct, trapId });
  };
  return (
    <div className="part-input">
      <p className="hint-line">
        Sort each candidate term: kinetic energy <b>T</b>, potential energy <b>V</b>, or <b>—</b> (wrong or not needed). M and K are assembled live from
        your choices, with coordinates <TeX>{`q = ${coordVec}`}</TeX>.
      </p>
      <div className="terms">
        {order.map((i) => {
          const t = part.terms[i];
          const v = place[t.id];
          const ok = result ? result.perTerm[i] : null;
          return (
            <div key={t.id} className={`term ${ok === null ? '' : ok ? 'cell-ok' : 'cell-bad'}`}>
              <div className="term-tex">
                {t.role && <div className="term-role">{t.role}</div>}
                <Rich text={t.tex} inline />
              </div>
              <Segmented
                size="sm"
                label="Where does this term go?"
                value={v as Bucket}
                onChange={(b) => {
                  setPlace((p) => ({ ...p, [t.id]: b as Bucket }));
                  setResult(null);
                }}
                options={[
                  { value: 'T', label: 'T' },
                  { value: 'V', label: 'V' },
                  { value: 'none', label: '—' },
                ]}
              />
              {result && (
                <div className="term-why">
                  <span className={ok ? 'ok-text' : 'bad-text'}>{ok ? '✓' : `✗ belongs in ${t.belongs === 'none' ? '— (not a valid term)' : t.belongs}`}</span>{' '}
                  <Rich text={t.why} inline />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="derived">
        <div>
          <div className="derived-label">Your M {part.mUnit && <span className="muted">({part.mUnit})</span>}</div>
          <TeX display>{`M = ${matTeX(live.M)}`}</TeX>
        </div>
        <div>
          <div className="derived-label">Your K {part.kUnit && <span className="muted">({part.kUnit})</span>}</div>
          <TeX display>{`K = ${matTeX(live.K)}`}</TeX>
        </div>
      </div>
      <div className="row gap-s wrap">
        <Button variant="primary" onClick={check} disabled={disabled || placedCount < part.terms.length}>
          Check T and V
        </Button>
        <span className="muted small">
          {placedCount} of {part.terms.length} terms placed{placedCount < part.terms.length ? ' (decide every term, including the ones that are not valid)' : ''}
        </span>
      </div>
      {result && (
        <Callout kind={result.correct ? 'ok' : 'bad'} title={result.correct ? 'Correct: M and K match' : 'Not yet'}>
          {!result.correct && (
            <>
              <p>
                {result.perTerm.filter((x) => !x).length} term(s) misplaced. M {result.mOk ? 'matches' : 'does not match'}; K {result.kOk ? 'matches' : 'does not match'}.
              </p>
              <details>
                <summary>Show the correct matrices</summary>
                <TeX display>{`M = ${matTeX(part.M)}, \\quad K = ${matTeX(part.K)}`}</TeX>
              </details>
            </>
          )}
        </Callout>
      )}
    </div>
  );
}
