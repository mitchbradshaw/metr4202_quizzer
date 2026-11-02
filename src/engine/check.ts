// Answer checking with honest, trap-naming feedback.
import type { ChoicePart, MatrixPart, NumericPart, OrderPart, Rich, TermsPart } from './types';
import { evaluate, type Vars } from './expr';
import { convertFreq, isFreqUnit, FREQ_UNITS, type FreqUnit } from '../core/units';
import { fmt } from './format';

export interface Verdict {
  correct: boolean;
  message?: Rich;
  trapId?: string;
  /** Could not parse the input (not counted as an attempt). */
  invalid?: boolean;
}

const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol * Math.max(Math.abs(b), 1e-300);

// ------------------------------------------------------------------ numeric

export interface NumericVerdict extends Verdict {
  value?: number;
}

export function checkNumeric(part: NumericPart, raw: string, inputUnit: string = part.unit): NumericVerdict {
  const typed = evaluate(raw);
  if (!Number.isFinite(typed)) {
    return { correct: false, invalid: true, message: 'Couldn’t read that number. Try e.g. `12.5`, `1.2e3` or `2*pi*50`.' };
  }
  const ans = part.answer;
  const freqMode = !!part.freq && isFreqUnit(part.unit) && isFreqUnit(inputUnit);
  const v = freqMode ? convertFreq(typed, inputUnit as FreqUnit, part.unit as FreqUnit) : typed;
  // If a known wrong answer (trap) lies close to the right one, tighten the tolerance to half the gap
  // (but not below 0.3 %), so the trap can never be accepted as correct.
  const gaps = (part.traps || []).map((t) => Math.abs(t.value - ans) / Math.max(Math.abs(ans), 1e-300)).filter((g) => g > 1e-9);
  const minGap = gaps.length ? Math.min(...gaps) : Infinity;
  const tol = Math.max(0.003, Math.min(part.tol ?? 0.02, minGap / 2));
  const ok = Math.abs(v - ans) <= Math.max(tol * Math.abs(ans), part.absTol ?? 0);
  if (ok) {
    const note =
      freqMode && inputUnit !== part.unit
        ? `Correct. (The question’s unit is ${part.unit}: ${fmt(ans, 4)} ${part.unit}.)`
        : undefined;
    return { correct: true, value: v, message: note };
  }

  const T = 0.015;
  for (const t of part.traps || []) {
    // Only name a trap when the answer is nearer the trap value than the true value.
    if (Math.abs(v - t.value) >= Math.abs(v - ans) && Math.abs(typed - t.value) >= Math.abs(v - ans)) continue;
    if (near(v, t.value, T) || (freqMode && near(typed, t.value, T))) return { correct: false, value: v, message: t.message, trapId: t.trapId };
  }
  if (ans === 0) return { correct: false, value: v, message: 'Not quite.' };

  if (freqMode) {
    for (const u of FREQ_UNITS) {
      if (u === inputUnit) continue;
      const inU = convertFreq(ans, part.unit as FreqUnit, u);
      if (near(typed, inU, T)) {
        return {
          correct: false,
          value: v,
          trapId: 'units',
          message: `That number is right in **${u}**, but you labelled it ${inputUnit}. Switch the unit to ${u}, or convert.`,
        };
      }
    }
  }
  const r = v / ans;
  const is = (f: number) => Math.abs(r - f) <= T * Math.abs(f);
  const tp = 2 * Math.PI;
  const deg = 180 / Math.PI;
  if (is(deg) || is(1 / deg)) return { correct: false, value: v, trapId: 'radians', message: 'Off by a factor of 180/π: degrees vs radians? The papers work in radians.' };
  if (part.freq && (is(tp) || is(1 / tp)))
    return { correct: false, value: v, trapId: 'units', message: `Off by a factor of 2π: you have probably mixed up ω (rad/s) and f (Hz).` };
  if (is(1000) || is(1e-3) || is(1e6) || is(1e-6))
    return { correct: false, value: v, trapId: 'unit-scale', message: 'Off by a power of 1000: check mm vs m (focal lengths and image sizes are often given in mm).' };
  if (is(100) || is(0.01)) return { correct: false, value: v, trapId: 'percent', message: 'Off by 100: percentage vs fraction? Give probabilities as fractions.' };
  if (is(-1)) return { correct: false, value: v, trapId: 'sign', message: 'Right magnitude, wrong sign. Check your positive directions (and the sign of ω or of v/ω).' };
  if (ans > 0 && v > 0 && (near(v, ans * ans, T) || near(v * v, ans, T)))
    return { correct: false, value: v, trapId: 'sqrt', message: 'Looks like a missing or extra square root (e.g. a variance instead of a standard deviation).' };
  if (is(2) || is(0.5)) return { correct: false, value: v, trapId: 'factor2', message: 'Off by a factor of 2. Check halves and doubles in your set-up.' };
  if (is(4) || is(0.25)) return { correct: false, value: v, trapId: 'factor2', message: 'Off by a factor of 4: a factor of 2 squared?' };
  if (Math.abs(r - 1) <= 0.06)
    return { correct: false, value: v, message: `Close (${fmt(Math.abs(r - 1) * 100, 2)} % off) but outside ±${fmt(tol * 100, 2)} %. Carry more significant figures through the working.` };
  return { correct: false, value: v, message: 'Not quite. Use the hints to check your set-up.' };
}

// ------------------------------------------------------------------ matrix

export interface MatrixVerdict extends Verdict {
  cells: boolean[][];
}

function maxAbs(A: number[][]) {
  let m = 0;
  for (const row of A) for (const x of row) m = Math.max(m, Math.abs(x));
  return m || 1;
}

function matNear(A: number[][], B: number[][], tol: number): boolean {
  const s = maxAbs(B);
  return A.length === B.length && A.every((row, i) => row.length === B[i].length && row.every((x, j) => Math.abs(x - B[i][j]) <= tol * s));
}

/** Hidden, generic values for the symbols (three sets), so a symbolic cell is checked like an identity. */
export function symbolSets(vars: readonly string[]): Vars[] {
  const frac = (x: number) => x - Math.floor(x);
  return [0, 1, 2].map((k) => Object.fromEntries(vars.map((v, i) => [v, 0.37 + 2.3 * frac(Math.sin((i + 1) * 12.9898 + (k + 1) * 78.233) * 43758.5453)])));
}

function checkSymbolic(part: MatrixPart, raw: string[][]): MatrixVerdict {
  const sym = part.symbolic!;
  const sets = symbolSets(sym.vars);
  const A = sym.answer;
  const cells = A.map((row) => row.map(() => false));
  // An empty cell counts as 0 when the table shows a '0' placeholder (screw tables are mostly zeros).
  const blank = part.placeholder === '0' ? '0' : '';
  const val = (src: string, k: number) => {
    const s = src.trim() === '' ? blank : src;
    return s === '' ? NaN : evaluate(s, sets[k]);
  };
  if (raw.some((row) => row.some((c) => !Number.isFinite(val(c, 0))))) {
    const eg = sym.vars.length > 1 ? ` (e.g. \`-${sym.vars[0]}\` or \`${sym.vars[0]}+${sym.vars[1]}\`)` : '';
    return { correct: false, invalid: true, cells, message: `Fill every cell with a number or an expression in ${sym.vars.join(', ')}${eg}. Write 0 for zero.` };
  }
  const same = (a: string, b: string, sign = 1) =>
    sets.every((_, k) => {
      const x = val(a, k);
      const y = sign * val(b, k);
      return Math.abs(x - y) <= 1e-6 * Math.max(1, Math.abs(y));
    });
  let allOk = true;
  for (let i = 0; i < A.length; i++)
    for (let j = 0; j < A[i].length; j++) {
      cells[i][j] = same(raw[i][j], A[i][j]);
      if (!cells[i][j]) allOk = false;
    }
  if (allOk) return { correct: true, cells };
  for (const t of sym.traps || []) if (t.answer.every((row, i) => row.every((x, j) => same(raw[i][j], x)))) return { correct: false, cells, message: t.message, trapId: t.trapId };
  const wrong: [number, number][] = [];
  cells.forEach((row, i) => row.forEach((ok, j) => !ok && wrong.push([i, j])));
  if (wrong.every(([i, j]) => same(raw[i][j], A[i][j], -1)))
    return {
      correct: false,
      cells,
      trapId: 'sign',
      message: 'Right magnitudes, wrong signs in the marked cells. Check each axis direction against the drawn arrows, and use $v = -\\omega \\times q$ (not $\\omega \\times q$).',
    };
  return { correct: false, cells, message: 'Some entries are off (marked). Re-derive those terms.' };
}

export function checkMatrix(part: MatrixPart, raw: string[][]): MatrixVerdict {
  if (part.symbolic) return checkSymbolic(part, raw);
  const A = part.answer;
  const tol = part.tol ?? 0.02;
  const V = raw.map((row) => row.map((s) => evaluate(s)));
  const cells = A.map((row) => row.map(() => false));
  if (V.some((row) => row.some((x) => !Number.isFinite(x)))) {
    return { correct: false, invalid: true, cells, message: 'Fill every cell with a number (expressions like `2*1500` are fine).' };
  }
  const s = maxAbs(A);
  if (part.columnsUpToScale) {
    let allOk = true;
    for (let j = 0; j < A[0].length; j++) {
      const a = A.map((r) => r[j]);
      const v = V.map((r) => r[j]);
      const aa = a.reduce((t, x) => t + x * x, 0);
      const k = a.reduce((t, x, i) => t + x * v[i], 0) / (aa || 1);
      const colScale = Math.max(...a.map(Math.abs)) || 1;
      for (let i = 0; i < a.length; i++) {
        const ok = k !== 0 && Math.abs(v[i] - k * a[i]) <= tol * Math.abs(k) * colScale;
        cells[i][j] = ok;
        if (!ok) allOk = false;
      }
    }
    return allOk
      ? { correct: true, cells, message: 'Correct (mode shapes are compared up to scale and sign).' }
      : { correct: false, cells, trapId: undefined, message: 'Some columns are not proportional to the true mode shapes. Only ratios matter, but the ratios must match.' };
  }
  let allOk = true;
  for (let i = 0; i < A.length; i++)
    for (let j = 0; j < A[i].length; j++) {
      // Each entry is checked relative to itself (floored at 5 % of the largest entry for ~0 entries),
      // so a small I_G next to a large mass is not let through with a huge absolute slack.
      const ok =
        part.absTol !== undefined ? Math.abs(V[i][j] - A[i][j]) <= part.absTol : Math.abs(V[i][j] - A[i][j]) <= tol * Math.max(Math.abs(A[i][j]), 0.05 * s);
      cells[i][j] = ok;
      if (!ok) allOk = false;
    }
  if (allOk) return { correct: true, cells };

  for (const t of part.traps || []) if (matNear(V, t.value, 0.015)) return { correct: false, cells, message: t.message, trapId: t.trapId };

  const n = A.length;
  const square = n === A[0].length;
  if (square) {
    const symA = A.every((row, i) => row.every((x, j) => Math.abs(x - A[j][i]) <= 1e-9 * s));
    const symV = V.every((row, i) => row.every((x, j) => Math.abs(x - V[j][i]) <= tol * s));
    if (symA && !symV) return { correct: false, cells, trapId: 'symmetry', message: 'Your matrix is not symmetric. M and K from quadratic forms always are: $K_{ij} = K_{ji}$.' };
    const diagOk = A.every((_, i) => cells[i][i]);
    if (diagOk && n > 1) {
      const off = (f: number) =>
        A.every((row, i) => row.every((x, j) => i === j || Math.abs(V[i][j] - f * x) <= tol * s));
      if (off(-1)) return { correct: false, cells, trapId: 'offdiag-sign', message: 'Diagonal right, off-diagonal signs flipped. The coupling sign follows your coordinate directions.' };
      if (off(2) || off(0.5))
        return { correct: false, cells, trapId: 'offdiag-factor2', message: 'Diagonal right, off-diagonals off by 2. In $V=\\tfrac12 q^TKq$ the cross term appears twice ($K_{12}+K_{21}$).' };
    }
    if (!symA && matNear(V, A[0].map((_, j) => A.map((r) => r[j])), tol))
      return { correct: false, cells, message: 'You have the transpose. Check rows vs columns.' };
  }
  return { correct: false, cells, message: 'Some entries are off (marked). Re-derive those terms.' };
}

// ------------------------------------------------------------------ choice & order

export function checkChoice(part: ChoicePart, selected: number[]): Verdict {
  const correctSet = part.options.map((o, i) => (o.correct ? i : -1)).filter((i) => i >= 0);
  const sel = [...new Set(selected)].sort();
  const ok = sel.length === correctSet.length && sel.every((x, i) => x === correctSet[i]);
  return { correct: ok };
}

export function checkOrder(part: OrderPart, order: number[]): Verdict & { inPlace: number } {
  const inPlace = order.filter((v, i) => v === i).length;
  return { correct: inPlace === part.steps.length, inPlace, message: inPlace === part.steps.length ? undefined : `${inPlace} of ${part.steps.length} steps are in the right place.` };
}

// ------------------------------------------------------------------ Lagrange terms

export type Bucket = 'T' | 'V' | 'none';

export function deriveMatrices(part: TermsPart, placement: Record<string, Bucket | undefined>) {
  const n = part.coords.length;
  const M = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const K = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (const t of part.terms) {
    const b = placement[t.id];
    if (b === 'T' && t.M) t.M.forEach((row, i) => row.forEach((x, j) => (M[i][j] += x)));
    if (b === 'V' && t.K) t.K.forEach((row, i) => row.forEach((x, j) => (K[i][j] += x)));
  }
  return { M, K };
}

export function checkTerms(part: TermsPart, placement: Record<string, Bucket | undefined>) {
  const perTerm = part.terms.map((t) => (placement[t.id] ?? 'none') === t.belongs);
  const { M, K } = deriveMatrices(part, placement);
  const mOk = matNear(M, part.M, 0.01);
  const kOk = matNear(K, part.K, 0.01);
  const correct = perTerm.every(Boolean) && mOk && kOk;
  return { correct, perTerm, M, K, mOk, kOk };
}
