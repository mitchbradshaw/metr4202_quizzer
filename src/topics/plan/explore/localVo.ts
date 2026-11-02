// Velocity obstacles (Fiorini & Shiller 1998) for a holonomic robot A among moving discs B (no React).
//   VO^τ_{A|B} = { v_A : A at velocity v_A and B at its velocity v_B would touch within τ seconds }
// Geometrically: the cone from the apex v_B that is tangent to the disc of radius r_A + r_B around
// v_B + (p_B − p_A)/1, cut off before the small disc D(v_B + (p_B − p_A)/τ, (r_A + r_B)/τ): a truncated cone.
import type { Vec2 } from '../../../core/geom2d';

export interface Disc {
  p: Vec2;
  r: number;
  v: Vec2;
}

/** Earliest time t ∈ [0, τ] at which disc A (radius rA, velocity vA) touches disc B, or null if never within τ. */
export function contactTime(pA: Vec2, rA: number, vA: Vec2, b: Disc, tau: number): number | null {
  const px = b.p.x - pA.x;
  const py = b.p.y - pA.y;
  const ux = vA.x - b.v.x;
  const uy = vA.y - b.v.y;
  const R = rA + b.r;
  const c = px * px + py * py - R * R;
  if (c <= 0) return 0;
  const a = ux * ux + uy * uy;
  if (a < 1e-12) return null;
  const pu = px * ux + py * uy;
  if (pu <= 0) return null;
  const disc = pu * pu - a * c;
  if (disc < 0) return null;
  const t = (pu - Math.sqrt(disc)) / a;
  return t <= tau ? t : null;
}

export interface VoShape {
  /** A and B already overlap: every velocity is in the VO. */
  inside: boolean;
  /** Boundary of the truncated cone in velocity space (closed polygon, apex side arc included). */
  poly: Vec2[];
  apex: Vec2;
  /** Tangent points on the cut-off disc (where the straight edges start). */
  tangents: [Vec2, Vec2];
  /** Cut-off disc: centre v_B + (p_B − p_A)/τ, radius (r_A + r_B)/τ. */
  cut: { c: Vec2; r: number };
}

/** The truncated collision cone, with the straight edges drawn out to length `far`. */
export function voShape(pA: Vec2, rA: number, b: Disc, tau: number, far: number): VoShape {
  const px = b.p.x - pA.x;
  const py = b.p.y - pA.y;
  const d = Math.hypot(px, py);
  const R = rA + b.r;
  const apex = { ...b.v };
  const cut = { c: { x: b.v.x + px / tau, y: b.v.y + py / tau }, r: R / tau };
  if (d <= R) return { inside: true, poly: [], apex, tangents: [apex, apex], cut };
  const phi = Math.atan2(py, px);
  const beta = Math.asin(R / d);
  const L = (d / tau) * Math.cos(beta);
  const dir = (a: number) => ({ x: Math.cos(a), y: Math.sin(a) });
  const dp = dir(phi + beta);
  const dm = dir(phi - beta);
  const Tp = { x: apex.x + L * dp.x, y: apex.y + L * dp.y };
  const Tm = { x: apex.x + L * dm.x, y: apex.y + L * dm.y };
  const poly: Vec2[] = [Tp, { x: apex.x + far * dp.x, y: apex.y + far * dp.y }, { x: apex.x + far * dm.x, y: apex.y + far * dm.y }, Tm];
  // Near arc of the cut-off disc, from the T− radius angle round through the side facing the apex to T+.
  const aFrom = phi - beta - Math.PI / 2;
  const aTo = phi + beta + Math.PI / 2 - 2 * Math.PI;
  const n = 24;
  for (let k = 1; k < n; k++) {
    const a = aFrom + ((aTo - aFrom) * k) / n;
    poly.push({ x: cut.c.x + cut.r * Math.cos(a), y: cut.c.y + cut.r * Math.sin(a) });
  }
  return { inside: false, poly, apex, tangents: [Tp, Tm], cut };
}

/**
 * The velocity A should take: the one closest to its preferred velocity, no faster than vMax, that stays
 * out of every velocity obstacle. If every sample collides, the one whose first contact is latest.
 */
export function voChoose(pA: Vec2, rA: number, vPref: Vec2, vMax: number, others: readonly Disc[], tau: number, nS = 12, nA = 48): { v: Vec2; free: boolean } {
  const s = Math.hypot(vPref.x, vPref.y);
  const pref = s > vMax ? { x: (vPref.x * vMax) / s, y: (vPref.y * vMax) / s } : vPref;
  const cands: Vec2[] = [pref, { x: 0, y: 0 }];
  for (let i = 1; i <= nS; i++)
    for (let j = 0; j < nA; j++) {
      const a = (2 * Math.PI * j) / nA;
      const r = (vMax * i) / nS;
      cands.push({ x: r * Math.cos(a), y: r * Math.sin(a) });
    }
  let best: Vec2 | null = null;
  let bd = Infinity;
  let late: Vec2 = { x: 0, y: 0 };
  let lateT = -1;
  for (const v of cands) {
    let tMin = Infinity;
    for (const b of others) {
      const t = contactTime(pA, rA, v, b, tau);
      if (t !== null) tMin = Math.min(tMin, t);
    }
    if (tMin === Infinity) {
      const dd = Math.hypot(v.x - pref.x, v.y - pref.y);
      if (dd < bd - 1e-12) {
        bd = dd;
        best = v;
      }
    } else if (tMin > lateT) {
      lateT = tMin;
      late = v;
    }
  }
  return best ? { v: best, free: true } : { v: late, free: false };
}
