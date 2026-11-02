// Axis scales and tick generation (linear and log10).

export interface Scale {
  (v: number): number;
  invert(px: number): number;
}

export function linearScale(d0: number, d1: number, r0: number, r1: number): Scale {
  const k = (r1 - r0) / (d1 - d0 || 1);
  const s = ((v: number) => r0 + (v - d0) * k) as Scale;
  s.invert = (px: number) => d0 + (px - r0) / k;
  return s;
}

export function logScale(d0: number, d1: number, r0: number, r1: number): Scale {
  const l0 = Math.log10(d0);
  const l1 = Math.log10(d1);
  const k = (r1 - r0) / (l1 - l0 || 1);
  const s = ((v: number) => r0 + (Math.log10(Math.max(v, 1e-300)) - l0) * k) as Scale;
  s.invert = (px: number) => Math.pow(10, l0 + (px - r0) / k);
  return s;
}

/** "Nice" linear ticks: steps of 1, 2 or 5 × 10^k, about `count` of them. */
export function niceTicks(min: number, max: number, count = 6): number[] {
  if (!(max > min)) return [min];
  const raw = (max - min) / Math.max(1, count);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const start = Math.ceil(min / step - 1e-9) * step;
  const out: number[] = [];
  for (let v = start; v <= max + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : Number(v.toPrecision(12)));
  return out;
}

/** Decade ticks plus 2..9 minor ticks for a log axis. */
export function logTicks(min: number, max: number): { major: number[]; minor: number[] } {
  const major: number[] = [];
  const minor: number[] = [];
  const e0 = Math.floor(Math.log10(min));
  const e1 = Math.ceil(Math.log10(max));
  for (let e = e0; e <= e1; e++) {
    const base = Math.pow(10, e);
    if (base >= min * (1 - 1e-9) && base <= max * (1 + 1e-9)) major.push(base);
    for (let m = 2; m <= 9; m++) {
      const v = m * base;
      if (v > min && v < max) minor.push(v);
    }
  }
  // Few decades: promote 2 and 5 to labelled ticks.
  if (major.length < 3) {
    for (const v of minor) {
      const m = Math.round(v / Math.pow(10, Math.floor(Math.log10(v))));
      if (m === 2 || m === 5) major.push(v);
    }
    major.sort((a, b) => a - b);
  }
  return { major, minor };
}

export function tickLabel(v: number): string {
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1e4 || a < 1e-3) {
    const e = Math.floor(Math.log10(a));
    const m = v / Math.pow(10, e);
    const ms = Math.abs(m - 1) < 1e-9 ? '' : Math.abs(m + 1) < 1e-9 ? '−' : `${Number(m.toPrecision(2))}×`.replace('-', '−');
    return `${ms}10${String(e).replace(/-/g, '⁻').replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(d)])}`;
  }
  return String(Number(v.toPrecision(4))).replace('-', '−');
}
