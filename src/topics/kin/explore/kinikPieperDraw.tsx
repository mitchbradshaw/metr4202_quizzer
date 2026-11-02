// Oblique 3-D schematics of 6-DOF joint layouts, drawn the way the 2023 Q12 sketches are: x to the right, z up,
// y receding up and to the right (a cabinet-style oblique projection), revolute joints as cylinders along their
// axes, prismatic joints as boxes with a small travel arrow, links as thick lines, a fork for the gripper.
// Used by the Pieper simulation (explore/Pieper.tsx) and the kin-pieper exam figures (solve/ik.ts).
//
// A yaw angle turns the arm about the vertical before projecting, so two skew axes that seem to cross in one
// view visibly miss in another. Every scene is one painter's-algorithm pass that returns SVG markup, so the
// simulation can redraw at 60 fps by writing innerHTML from a requestAnimationFrame loop (no React diffing).
import { useMemo, type ComponentType } from 'react';
import { add3, applyT, cross3, dot3, mat3Vec, norm3, partialSpace, rotOf, scale3, sub3, type Vec3 } from '../../../core/kin';
import { closestPoints, layoutById, layoutScrews, type PLayout } from '../../../core/kin_pieper';
import { fmt } from '../../../engine/format';
import '../kinik.css';

/** Oblique projection: screen right = x + A·y, screen up = z + B·y (y recedes up and to the right). */
export const OBL_A = 0.4;
export const OBL_B = 0.32;
/** Revolute body: cylinder length and radius; prismatic body: box side and length (scene units, "m"). */
const LEN = 0.8;
const RAD = 0.27;
const BOX = 0.5;
const BOXLEN = 0.78;
/** How far each revolute axis line is drawn beyond its joint, both ways. */
export const AXIS_EXT = 1.7;

export interface View {
  /** Turn of the arm about the vertical through `c`, radians (0 = the exam view). */
  yaw: number;
  /** Centre of rotation (and of the picture). */
  c: Vec3;
  /** Pixels per metre and where `c` lands on screen. */
  S: number;
  X0: number;
  Y0: number;
  /** Size of the picture in pixels (for keeping labels inside it). */
  W: number;
  H: number;
}

export interface Projector {
  xy(p: Vec3): [number, number];
  /** Larger = further from the viewer (along the oblique projection direction). */
  depth(p: Vec3): number;
  /** > 0 when a surface with outward normal n faces the viewer. */
  facing(n: Vec3): number;
}

export function projector(v: View): Projector {
  const co = Math.cos(v.yaw);
  const si = Math.sin(v.yaw);
  const rx = (p: Vec3) => co * (p[0] - v.c[0]) - si * (p[1] - v.c[1]);
  const ry = (p: Vec3) => si * (p[0] - v.c[0]) + co * (p[1] - v.c[1]);
  return {
    xy: (p) => {
      const x = rx(p);
      const y = ry(p);
      return [v.X0 + v.S * (x + OBL_A * y), v.Y0 - v.S * (p[2] - v.c[2] + OBL_B * y)];
    },
    depth: (p) => -OBL_A * rx(p) + ry(p) - OBL_B * (p[2] - v.c[2]),
    facing: (n) => {
      const x = co * n[0] - si * n[1];
      const y = si * n[0] + co * n[1];
      return OBL_A * x - y + OBL_B * n[2];
    },
  };
}

const unit = (a: Vec3): Vec3 => scale3(a, 1 / (norm3(a) || 1));
const mid = (a: Vec3, b: Vec3): Vec3 => scale3(add3(a, b), 0.5);

/** Two unit vectors perpendicular to u (and to each other); axis-aligned when u is. */
function basis(u: Vec3): [Vec3, Vec3] {
  const a: Vec3 = Math.abs(u[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const e1 = unit(cross3(u, a));
  return [e1, cross3(u, e1)];
}

/** Convex hull of 2-D points (monotone chain), anticlockwise. */
function hull(pts: [number, number][]): [number, number][] {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cr = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: [number, number][] = [];
  for (const q of p) {
    while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
    lo.push(q);
  }
  const up: [number, number][] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop();
    up.push(q);
  }
  up.pop();
  lo.pop();
  return lo.concat(up);
}

const f1 = (x: number) => x.toFixed(1);
/** Keep a centred label of about `half` px half-width inside the picture. */
const clampX = (x: number, v: View, half = 60) => Math.max(half, Math.min(v.W - half, x));
const poly = (pts: readonly [number, number][]) => pts.map((q, i) => `${i ? 'L' : 'M'}${f1(q[0])} ${f1(q[1])}`).join('') + 'Z';
const seg = (a: [number, number], b: [number, number]) => `M${f1(a[0])} ${f1(a[1])}L${f1(b[0])} ${f1(b[1])}`;

// ------------------------------------------------------------------ posing (product of exponentials)

export interface PosedJoint {
  type: 'R' | 'P';
  /** Current axis direction and a point on it (where its body is drawn). */
  axis: Vec3;
  at: Vec3;
}

export interface Posed {
  joints: PosedJoint[];
  links: { link: number; pts: Vec3[] }[];
  tool: { at: Vec3; dir: Vec3; side: Vec3 };
}

/**
 * The layout at joint values θ (home when omitted): joint i's body and axis move with e^{[S1]θ1}⋯e^{[S(i−1)]θ(i−1)},
 * link k with the first k exponentials, the gripper with all six (space-form PoE on the layout's screw axes).
 */
export function poseLayout(L: PLayout, th?: readonly number[]): Posed {
  if (!th || th.every((t) => t === 0)) return { joints: L.joints.map((j) => ({ ...j })), links: L.links, tool: L.tool };
  const T = partialSpace(layoutScrews(L.joints), th);
  const P = (k: number, p: Vec3) => applyT(T[k], p);
  const D = (k: number, d: Vec3) => mat3Vec(rotOf(T[k]), d);
  return {
    joints: L.joints.map((j, i) => ({ type: j.type, axis: D(i, j.axis), at: P(i, j.at) })),
    links: L.links.map((lk) => ({ link: lk.link, pts: lk.pts.map((p) => P(lk.link, p)) })),
    tool: { at: P(6, L.tool.at), dir: D(6, L.tool.dir), side: D(6, L.tool.side) },
  };
}

// ------------------------------------------------------------------ framing

/** Points that bound the drawing of a layout (bodies, links, gripper). */
function boundPoints(L: PLayout): Vec3[] {
  const pts: Vec3[] = [];
  for (const lk of L.links) pts.push(...lk.pts);
  const dirs: Vec3[] = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  for (const j of L.joints) for (const d of dirs) for (const s of [-1, 1]) pts.push(add3(j.at, scale3(d, s * 0.45)));
  const t = L.tool;
  pts.push(add3(t.at, scale3(t.dir, 0.2)), add3(t.at, scale3(t.side, 0.3)), add3(t.at, scale3(t.side, -0.3)), add3(t.at, scale3(t.dir, -0.6)));
  if (L.ground !== false) {
    const j0 = L.joints[0];
    const z = j0.at[2] - (j0.type === 'R' ? LEN : BOXLEN) / 2;
    for (const [dx, dy] of [
      [0.6, 0],
      [-0.6, 0],
      [0, 0.6],
      [0, -0.6],
    ])
      pts.push([j0.at[0] + dx, j0.at[1] + dy, z - 0.05]);
  }
  return pts;
}

/**
 * A fixed frame for a layout: one scale and centre that fit the home pose at every yaw in `yaws` (so turning
 * the view never rescales it), with `pad` pixels to spare.
 */
export function fitView(L: PLayout, W: number, H: number, pad: number, yaws: readonly number[], yaw = yaws[0] ?? 0): View {
  const pts = boundPoints(L);
  const lo: Vec3 = [Infinity, Infinity, Infinity];
  const hi: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const p of pts)
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k], p[k]);
      hi[k] = Math.max(hi[k], p[k]);
    }
  const c = mid(lo, hi);
  let x0 = Infinity;
  let x1 = -Infinity;
  let u0 = Infinity;
  let u1 = -Infinity;
  for (const yw of yaws) {
    const co = Math.cos(yw);
    const si = Math.sin(yw);
    for (const p of pts) {
      const x = co * (p[0] - c[0]) - si * (p[1] - c[1]);
      const y = si * (p[0] - c[0]) + co * (p[1] - c[1]);
      const X = x + OBL_A * y;
      const U = p[2] - c[2] + OBL_B * y;
      x0 = Math.min(x0, X);
      x1 = Math.max(x1, X);
      u0 = Math.min(u0, U);
      u1 = Math.max(u1, U);
    }
  }
  const S = Math.min((W - 2 * pad) / Math.max(1e-6, x1 - x0), (H - 2 * pad) / Math.max(1e-6, u1 - u0));
  return { yaw, c, S, X0: W / 2 - (S * (x0 + x1)) / 2, Y0: H / 2 + (S * (u0 + u1)) / 2, W, H };
}

// ------------------------------------------------------------------ what to highlight

export interface Highlight {
  /** 0-based joints whose bodies and axis lines are coloured. */
  joints: number[];
  tone: 'ok' | 'bad';
  /** The common point of three axes that meet. */
  meet?: { p: Vec3; label: string };
  /** Points where two axes of the triple do meet (a near miss shows two different ones). */
  dots?: Vec3[];
  /** Red dashed segments: the gap between two meeting points, or the common perpendicular of skew axes. */
  gaps?: { a: Vec3; b: Vec3; label: string }[];
  /** A label placed above the highest end of the coloured axes (e.g. "2 ∥ 3 ∥ 4"). */
  note?: string;
}

/** The overlay that explains a layout's verdict, from its current (posed) axes. */
export function highlightFor(L: PLayout, posed: Posed): Highlight | null {
  if (!L.triple) return null;
  const J = posed.joints;
  const tone = L.closedForm ? 'ok' : 'bad';
  const [i, j, k] = L.triple;
  const pair = (a: number, b: number) => closestPoints(J[a].at, J[a].axis, J[b].at, J[b].axis);
  if (L.reason === 'meet') {
    const c = pair(i, j);
    return { joints: [i, j, k], tone, meet: { p: c ? mid(c.a, c.b) : J[i].at, label: i === 3 ? 'W' : 'C' } };
  }
  if (L.reason === 'parallel' || L.reason === 'orientation')
    return { joints: [i, j, k], tone, note: L.reason === 'parallel' ? `axes ${i + 1} ∥ ${j + 1} ∥ ${k + 1}` : `axes ${i + 1} ∥ ${j + 1} ∥ ${k + 1}: every revolute axis` };
  const dots: Vec3[] = [];
  const gaps: { a: Vec3; b: Vec3; label: string }[] = [];
  const m1 = pair(i, j);
  const m2 = pair(j, k);
  const p1 = m1 && m1.dist < 1e-6 ? mid(m1.a, m1.b) : null;
  const p2 = m2 && m2.dist < 1e-6 ? mid(m2.a, m2.b) : null;
  for (const [m, p, a, b] of [
    [m1, p1, i, j],
    [m2, p2, j, k],
  ] as const) {
    if (p) dots.push(p);
    else if (m) gaps.push({ a: m.a, b: m.b, label: `${a + 1}, ${b + 1} miss by ${fmt(m.dist, 2)} m` });
  }
  if (p1 && p2 && norm3(sub3(p1, p2)) > 1e-6) gaps.push({ a: p1, b: p2, label: `gap ${fmt(norm3(sub3(p1, p2)), 2)} m` });
  return { joints: [i, j, k], tone, dots, gaps };
}

/**
 * The point that tells decoupling apart: where the triple's axes meet (W) for a spherical wrist or shoulder;
 * otherwise where axes 5 and 6 meet, or most nearly meet (W′); otherwise the gripper.
 */
export function focusPoint(L: PLayout, posed: Posed): { p: Vec3; label: string } {
  const J = posed.joints;
  if (L.closedForm && L.reason === 'meet' && L.triple) {
    const [i, j] = L.triple;
    const c = closestPoints(J[i].at, J[i].axis, J[j].at, J[j].axis);
    if (c) return { p: mid(c.a, c.b), label: i === 3 ? 'W' : 'C' };
  }
  if (J[4].type === 'R' && J[5].type === 'R') {
    const c = closestPoints(J[4].at, J[4].axis, J[5].at, J[5].axis);
    if (c) return { p: mid(c.a, c.b), label: 'W′' };
  }
  return { p: posed.tool.at, label: 'tool' };
}

// ------------------------------------------------------------------ the scene

export interface SceneOpts {
  /** Extended axis line through every revolute joint. */
  axes?: boolean;
  /** Joint numbers 1…6. */
  numbers?: boolean;
  hl?: Highlight | null;
  /** A 3-D path to draw (e.g. where W has been). */
  trace?: readonly Vec3[] | null;
  /** A tracked point with a label. */
  mark?: { p: Vec3; label: string } | null;
  /** A translucent rectangle (centre p, in-plane unit directions u and v, half-sizes hu and hv): a plane of motion. */
  plane?: { p: Vec3; u: Vec3; v: Vec3; hu: number; hv: number } | null;
}

/** SVG markup (no root element) for a posed layout in a view. */
export function sceneMarkup(L: PLayout, posed: Posed, view: View, o: SceneOpts = {}): string {
  const P = projector(view);
  const hlSet = new Set(o.hl?.joints ?? []);
  const tone = o.hl?.tone ?? 'ok';
  const tcls = (i: number) => (hlSet.has(i) ? ` is-${tone}` : '');
  const prims: { d: number; s: string }[] = [];

  // base plate under joint 1
  if (L.ground !== false) {
    const j0 = L.joints[0];
    const z = j0.at[2] - (j0.type === 'R' ? LEN : BOXLEN) / 2;
    const c: Vec3 = [j0.at[0], j0.at[1], z];
    const ring: [number, number][] = [];
    for (let k = 0; k < 28; k++) {
      const t = (2 * Math.PI * k) / 28;
      ring.push(P.xy([c[0] + 0.55 * Math.cos(t), c[1] + 0.55 * Math.sin(t), z]));
    }
    prims.push({ d: Infinity, s: `<path class="kin-ik-base" d="${poly(ring)}"/>` });
  }

  // links, one segment at a time (sorted by their midpoints)
  for (const lk of posed.links)
    for (let k = 1; k < lk.pts.length; k++) {
      const a = lk.pts[k - 1];
      const b = lk.pts[k];
      prims.push({ d: P.depth(mid(a, b)) + 0.01, s: `<path class="kin-ik-link" d="${seg(P.xy(a), P.xy(b))}"/>` });
    }

  // joint bodies
  posed.joints.forEach((j, i) => {
    const u = unit(j.axis);
    const [e1, e2] = basis(u);
    if (j.type === 'R') {
      const capA: [number, number][] = [];
      const capB: [number, number][] = [];
      for (let k = 0; k < 20; k++) {
        const t = (2 * Math.PI * k) / 20;
        const off = add3(scale3(e1, RAD * Math.cos(t)), scale3(e2, RAD * Math.sin(t)));
        capA.push(P.xy(add3(add3(j.at, scale3(u, LEN / 2)), off)));
        capB.push(P.xy(add3(add3(j.at, scale3(u, -LEN / 2)), off)));
      }
      const f = P.facing(u);
      let s = `<path class="kin-ik-body${tcls(i)}" d="${poly(hull(capA.concat(capB)))}"/>`;
      if (Math.abs(f) > 0.04) s += `<path class="kin-ik-cap${tcls(i)}" d="${poly(f > 0 ? capA : capB)}"/>`;
      prims.push({ d: P.depth(j.at), s });
    } else {
      const ax: Vec3[] = [u, e1, e2];
      const half = [BOXLEN / 2, BOX / 2, BOX / 2];
      const corner = (s0: number, s1: number, s2: number) => add3(j.at, add3(scale3(ax[0], s0 * half[0]), add3(scale3(ax[1], s1 * half[1]), scale3(ax[2], s2 * half[2]))));
      let s = '';
      for (let a = 0; a < 3; a++)
        for (const sg of [-1, 1]) {
          const n = scale3(ax[a], sg);
          if (P.facing(n) <= 1e-6) continue;
          const b = (a + 1) % 3;
          const c = (a + 2) % 3;
          const quad: [number, number][] = [
            [-1, -1],
            [1, -1],
            [1, 1],
            [-1, 1],
          ].map(([p, q]) => {
            const sv = [0, 0, 0];
            sv[a] = sg;
            sv[b] = p;
            sv[c] = q;
            return P.xy(corner(sv[0], sv[1], sv[2]));
          });
          const top = n[2] > 0.5 ? ' is-top' : '';
          s += `<path class="kin-ik-face${top}${tcls(i)}" d="${poly(quad)}"/>`;
        }
      // travel arrow beside the box, on the side that shows lowest on screen
      const a0 = P.xy(add3(j.at, scale3(u, -0.3)));
      const a1 = P.xy(add3(j.at, scale3(u, 0.3)));
      const L2 = Math.hypot(a1[0] - a0[0], a1[1] - a0[1]);
      if (L2 > 6) {
        const side = [e1, e2, scale3(e1, -1), scale3(e2, -1)].reduce((best, e) => (P.xy(add3(j.at, e))[1] > P.xy(add3(j.at, best))[1] ? e : best));
        const off = scale3(side, BOX / 2 + 0.2);
        const b0 = P.xy(add3(add3(j.at, scale3(u, -0.28)), off));
        const b1 = P.xy(add3(add3(j.at, scale3(u, 0.28)), off));
        const dx = (b1[0] - b0[0]) / Math.hypot(b1[0] - b0[0], b1[1] - b0[1]);
        const dy = (b1[1] - b0[1]) / Math.hypot(b1[0] - b0[0], b1[1] - b0[1]);
        const hs = Math.min(8, 0.4 * Math.hypot(b1[0] - b0[0], b1[1] - b0[1]));
        const hb: [number, number] = [b1[0] - dx * hs, b1[1] - dy * hs];
        s += `<path class="kin-ik-travel" d="${seg(b0, hb)}"/><path class="kin-ik-travel-head" d="${poly([b1, [hb[0] - dy * hs * 0.45, hb[1] + dx * hs * 0.45], [hb[0] + dy * hs * 0.45, hb[1] - dx * hs * 0.45]])}"/>`;
      }
      prims.push({ d: P.depth(j.at), s });
    }
  });

  // gripper: a fork opening along the approach direction
  {
    const t = posed.tool;
    const b = add3(t.at, scale3(t.dir, -0.22));
    const st = add3(b, scale3(t.dir, -0.32));
    const l0 = add3(b, scale3(t.side, -0.24));
    const r0 = add3(b, scale3(t.side, 0.24));
    const l1 = add3(l0, scale3(t.dir, 0.36));
    const r1 = add3(r0, scale3(t.dir, 0.36));
    const pp = (p: Vec3) => P.xy(p);
    const d = `${seg(pp(st), pp(b))}${seg(pp(l1), pp(l0))}L${f1(pp(r0)[0])} ${f1(pp(r0)[1])}L${f1(pp(r1)[0])} ${f1(pp(r1)[1])}`;
    prims.push({ d: P.depth(t.at), s: `<path class="kin-ik-grip" d="${d}"/>` });
  }

  prims.sort((a, b) => b.d - a.d);
  let out = prims.map((p) => p.s).join('');

  // a plane of motion (drawn over the bodies, translucent)
  if (o.plane) {
    const pl = o.plane;
    const q = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ].map(([a, b]) => P.xy(add3(pl.p, add3(scale3(pl.u, a * pl.hu), scale3(pl.v, b * pl.hv)))));
    out = `<path class="kin-ik-plane" d="${poly(q)}"/>` + out;
  }

  // extended axis lines (highlighted ones last, on top)
  if (o.axes || o.hl) {
    const order = posed.joints.map((_, i) => i).sort((a, b) => Number(hlSet.has(a)) - Number(hlSet.has(b)));
    for (const i of order) {
      const j = posed.joints[i];
      if (j.type !== 'R') continue;
      if (!o.axes && !hlSet.has(i)) continue;
      const u = unit(j.axis);
      out += `<path class="kin-ik-axisline${tcls(i)}" d="${seg(P.xy(add3(j.at, scale3(u, -AXIS_EXT))), P.xy(add3(j.at, scale3(u, AXIS_EXT))))}"/>`;
    }
  }

  // highlight markers
  const hl = o.hl;
  if (hl) {
    for (const g of hl.gaps ?? []) {
      const a = P.xy(g.a);
      const b = P.xy(g.b);
      out += `<path class="kin-ik-gap" d="${seg(a, b)}"/>`;
      const m: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      out += `<text class="kin-ik-hltext is-bad" x="${f1(clampX(m[0], view))}" y="${f1(m[1] - 10)}" text-anchor="middle">${g.label}</text>`;
    }
    for (const p of hl.dots ?? []) {
      const q = P.xy(p);
      out += `<circle class="kin-ik-near" cx="${f1(q[0])}" cy="${f1(q[1])}" r="5"/>`;
    }
    if (hl.meet) {
      const q = P.xy(hl.meet.p);
      out += `<circle class="kin-ik-meet" cx="${f1(q[0])}" cy="${f1(q[1])}" r="7"/><text class="kin-ik-hltext is-ok" x="${f1(q[0] + 10)}" y="${f1(q[1] - 9)}">${hl.meet.label}</text>`;
    }
    if (hl.note) {
      // above the highest end of the coloured axes, where the picture is usually empty
      let top: [number, number] = [view.W / 2, view.H];
      for (const i of hl.joints) {
        const j = posed.joints[i];
        for (const s of [-1, 1]) {
          const q = P.xy(add3(j.at, scale3(unit(j.axis), s * AXIS_EXT)));
          if (q[1] < top[1]) top = q;
        }
      }
      out += `<text class="kin-ik-hltext is-${hl.tone}" x="${f1(clampX(top[0], view, 110))}" y="${f1(Math.max(16, top[1] - 8))}" text-anchor="middle">${hl.note}</text>`;
    }
  }

  // joint numbers, up and to the left of each body
  if (o.numbers) {
    posed.joints.forEach((j, i) => {
      const q = P.xy(j.at);
      const r = (j.type === 'R' ? RAD + 0.1 : BOX / 2 + 0.1) * view.S;
      out += `<text class="kin-ik-jnum" x="${f1(q[0] - r - 2)}" y="${f1(q[1] - r * 0.7)}" text-anchor="end">${i + 1}</text>`;
    });
  }

  if (o.trace && o.trace.length > 1) out += `<path class="kin-ik-trace" d="${o.trace.map((p, k) => `${k ? 'L' : 'M'}${f1(P.xy(p)[0])} ${f1(P.xy(p)[1])}`).join('')}"/>`;
  if (o.mark) {
    const q = P.xy(o.mark.p);
    out += `<circle class="kin-ik-track" cx="${f1(q[0])}" cy="${f1(q[1])}" r="4.5"/>`;
    // the highlight already names a common point W; otherwise label the tracked point
    if (!(hl?.meet && hl.meet.label === o.mark.label)) out += `<text class="kin-ik-tracktext" x="${f1(q[0] + 9)}" y="${f1(q[1] + 18)}">${o.mark.label}</text>`;
  }
  return out;
}

// ------------------------------------------------------------------ words

const AXIS_WORDS: [Vec3, string][] = [
  [[1, 0, 0], 'x (along the page)'],
  [[0, 1, 0], 'y (into the page)'],
  [[0, 0, 1], 'z (vertical)'],
];

function axisWord(u: Vec3): string {
  const best = AXIS_WORDS.reduce((b, w) => (Math.abs(dot3(w[0], u)) > Math.abs(dot3(b[0], u)) ? w : b));
  return best[1];
}

/** "1 revolute about z (vertical), 2 revolute about y (into the page), 3 prismatic along x …". */
export function layoutWords(L: PLayout): string {
  return L.joints.map((j, i) => `${i + 1} ${j.type === 'R' ? 'revolute about' : 'prismatic along'} ${axisWord(j.axis)}`).join(', ');
}

// ------------------------------------------------------------------ static figures

export interface PieperSvgProps {
  layout: PLayout;
  width: number;
  height: number;
  axes?: boolean;
  numbers?: boolean;
  reveal?: boolean;
  thumb?: boolean;
  label?: string;
}

/** One layout at the exam view (static; rendered once). */
export function PieperSvg({ layout, width, height, axes = false, numbers = true, reveal = false, thumb = false, label }: PieperSvgProps) {
  const markup = useMemo(() => {
    const posed = poseLayout(layout);
    const view = fitView(layout, width, height, thumb ? 6 : 14, [0]);
    return sceneMarkup(layout, posed, view, { axes, numbers, hl: reveal ? highlightFor(layout, posed) : null });
  }, [layout, width, height, axes, numbers, reveal, thumb]);
  return (
    <svg
      className={`kin-ik-scene${thumb ? ' is-thumb' : ''}`}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label ?? `Six-joint arm. Joints from the base: ${layoutWords(layout)}.`}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}

/** A figure component for a generated instance: one layout, or several labelled (a), (b), … like 2023 Q12. */
export function pieperFigure(ids: readonly string[], o: { axes?: boolean; numbers?: boolean } = {}): ComponentType {
  const layouts = ids.map(layoutById);
  function PieperFigure() {
    if (layouts.length === 1)
      return (
        <div className="kin-ik-onefig">
          <PieperSvg layout={layouts[0]} width={520} height={300} axes={o.axes} numbers={o.numbers ?? true} />
        </div>
      );
    return (
      <div className="kin-ik-figs">
        {layouts.map((L, k) => (
          <figure className="kin-ik-fig" key={L.id} style={{ margin: 0 }}>
            <PieperSvg layout={L} width={360} height={210} axes={o.axes} numbers={o.numbers ?? true} label={`Arm (${String.fromCharCode(97 + k)}). Joints from the base: ${layoutWords(L)}.`} />
            <figcaption className="kin-ik-fig-cap">({String.fromCharCode(97 + k)})</figcaption>
          </figure>
        ))}
      </div>
    );
  }
  return PieperFigure;
}
