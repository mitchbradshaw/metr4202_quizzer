// Number formatting for readouts, answers and TeX.
const SUP: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
const sup = (s: string) => s.replace(/[-0-9]/g, (ch) => SUP[ch]);

function split(x: number, sig: number): { mant: string; exp: number } {
  const [m, e] = x.toExponential(sig - 1).split('e');
  return { mant: m, exp: Number(e) };
}

const useSci = (x: number) => x !== 0 && (Math.abs(x) >= 1e5 || Math.abs(x) < 1e-3);

/** Human-friendly: `sig` significant figures, trailing zeros removed, ×10ⁿ for very large/small. */
export function fmt(x: number, sig = 4): string {
  if (!Number.isFinite(x)) return Number.isNaN(x) ? '—' : x > 0 ? '∞' : '−∞';
  if (useSci(x)) {
    const { mant, exp } = split(x, sig);
    return `${Number(mant)}×10${sup(String(exp))}`.replace('-', '−');
  }
  return String(Number(x.toPrecision(sig))).replace('-', '−');
}

/** Fixed significant figures (keeps trailing zeros): steady width for live readouts. */
export function fmtSig(x: number, sig = 4): string {
  if (!Number.isFinite(x)) return Number.isNaN(x) ? '—' : x > 0 ? '∞' : '−∞';
  if (useSci(x)) {
    const { mant, exp } = split(x, sig);
    return `${mant}×10${sup(String(exp))}`.replace('-', '−');
  }
  let s = x.toPrecision(sig);
  if (s.includes('e')) s = String(Number(s));
  return s.replace('-', '−');
}

/** Number as TeX, e.g. 1.23 \times 10^{6}. */
export function tex(x: number, sig = 4): string {
  if (!Number.isFinite(x)) return Number.isNaN(x) ? '\\text{—}' : x > 0 ? '\\infty' : '-\\infty';
  if (useSci(x)) {
    const { mant, exp } = split(x, sig);
    return `${Number(mant)} \\times 10^{${exp}}`;
  }
  return String(Number(x.toPrecision(sig)));
}

/** "12.5 Hz". */
export const fmtU = (x: number, unit: string, sig = 4) => (unit ? `${fmt(x, sig)} ${unit}` : fmt(x, sig));

/** Percentage from a fraction: 0.153 -> "15.3 %". */
export const pct = (frac: number, sig = 3) => `${fmt(frac * 100, sig)} %`;

/** Round for display in generated problem text (keeps it exam-like). */
export const r = (x: number, sig = 3) => Number(x.toPrecision(sig));
