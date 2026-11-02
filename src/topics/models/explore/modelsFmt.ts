// Number formatting for the models topic's TeX substitutions and readouts (shared by explore and solve).

const clean = (x: number) => (Math.abs(x) < 5e-12 ? 0 : x);

/** Up to `dp` decimals with trailing zeros dropped: 8, -2.5, 0.3, 7.3333. */
export const g = (x: number, dp = 4) => String(Number(clean(x).toFixed(dp)));

/** Fixed decimals: 3.4642. */
export const fx = (x: number, dp = 4) => clean(x).toFixed(dp);

/** A number inside TeX, parenthesised if negative: 8, (-2.5). */
export const par = (x: number, dp = 4) => (clean(x) < 0 ? `(${g(x, dp)})` : g(x, dp));

/** Signed term for "a + b" in TeX: "+ 0.3" or "- 0.4". */
export const sgn = (x: number, dp = 4) => (clean(x) < 0 ? `- ${g(-x, dp)}` : `+ ${g(x, dp)}`);

/** Significant figures (for readouts that can be large or small), minus sign as U+2212. */
export const sig = (x: number, n = 4) => (Number.isFinite(x) ? String(Number(clean(x).toPrecision(n))).replace('-', '−') : x > 0 ? '∞' : '−∞');

export const DEG = 180 / Math.PI;
