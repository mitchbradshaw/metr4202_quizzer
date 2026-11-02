// Seeded random numbers, so every generated problem can be replayed from its seed.
export interface Rng {
  readonly seed: number;
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform in [a, b). */
  uniform(a: number, b: number): number;
  /** Integer in [a, b] inclusive. */
  int(a: number, b: number): number;
  /** A random multiple of `step` in [a, b] (inclusive), e.g. step(10, 40, 5) -> 25. */
  step(a: number, b: number, step: number): number;
  pick<T>(arr: readonly T[]): T;
  shuffle<T>(arr: readonly T[]): T[];
  chance(p: number): boolean;
  /** Round to `sig` significant figures (default 2), for exam-looking data. */
  nice(x: number, sig?: number): number;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function roundSig(x: number, sig = 2): number {
  if (x === 0 || !Number.isFinite(x)) return x;
  return Number(x.toPrecision(sig));
}

export function makeRng(seed: number): Rng {
  const r = mulberry32(seed);
  const rng: Rng = {
    seed,
    next: r,
    uniform: (a, b) => a + (b - a) * r(),
    int: (a, b) => a + Math.floor(r() * (b - a + 1)),
    step: (a, b, s) => {
      const n = Math.floor((b - a) / s + 1e-9);
      return Number((a + s * Math.floor(r() * (n + 1))).toPrecision(12));
    },
    pick: (arr) => arr[Math.floor(r() * arr.length)],
    shuffle: (arr) => {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(r() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
    chance: (p) => r() < p,
    nice: (x, sig = 2) => roundSig(x, sig),
  };
  return rng;
}

/** A fresh 6-digit seed (not reproducible; only used to pick a new problem). */
export function freshSeed(): number {
  return 100000 + Math.floor(Math.random() * 900000);
}

/** Stable 32-bit hash of a string (for deterministic shuffles keyed by an id). */
export function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
