// Label layout for the road maps (RoadGraph): every town's name, its f/g and h lines, and every road's length are
// placed together so that no label covers another label, a town or (where avoidable) a road.
//
// Each label has a handful of candidate spots (around its town, or along and either side of its road, or on the
// road itself with a halo as a last resort). A spot's penalty counts overlaps with the other labels and towns,
// road crossings, leaving the picture, and a small preference for the natural spot. Starting from the preferred
// spots, a few rounds of "move each label to its cheapest spot given the others" settle the layout. Maps have at
// most a dozen towns and ~20 roads, so this takes a millisecond or two and runs once per map (not per step).
import type { MapDef, Pt } from './astarMaps';

export type Anchor = 'start' | 'middle' | 'end';

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Spot {
  box: Box;
  /** Text anchor x and the baseline of the first line. */
  tx: number;
  ty: number;
  anchor: Anchor;
}

/** Which lines the info block beside a town reserves, top to bottom. */
export type InfoSlot = 'val' | 'h';

export interface LabelLayout {
  name: Record<string, Spot | undefined>;
  info: Record<string, (Spot & { lineY: Record<InfoSlot, number> }) | undefined>;
  /** By edge key "a|b" (a < b). */
  cost: Record<string, Spot>;
}

export interface LayoutOptions {
  start: string;
  goal: string;
  /** Lines reserved beside every town (empty: no info block). */
  slots: InfoSlot[];
  /** Characters to reserve for the widest info line, e.g. "f 13.8 ↓" = 8. */
  infoChars: number;
  /** A scale bar is drawn in the bottom-right corner (keep labels off it). */
  scaleBar?: { x0: number; y0: number; x1: number; y1: number };
}

// Font metrics (see astar.css): names 12 px sans, info 11.5 px mono on a 14 px line, road lengths 12.5 px mono.
const NAME_CH = 6.5;
const NAME_H = 13;
const INFO_CH = 6.95;
const LINE = 14;
const INFO_H1 = 13;
const COST_CH = 7.6;
const COST_H = 13;
/** Clearance from a town's centre: disc 17, role ring 20.5, popped ring 22. */
const CLEAR = 24;
const DIAG = 17.5;
const TOWN_R = 23;

export const edgeKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Characters of a road length or value as printed (7.800000001 → "7.8"). */
export function numText(x: number): string {
  if (!Number.isFinite(x)) return '—';
  const s = String(Number(x.toFixed(4)));
  return s === '-0' ? '0' : s;
}

interface Cand {
  box: Box;
  anchor: Anchor;
  pref: number;
  /** Road this spot sits on (exempt from the crossing test). */
  onEdge?: number;
}

interface Label {
  kind: 'name' | 'info' | 'cost';
  id: string;
  /** Town the label belongs to (name, info). */
  town?: number;
  cands: Cand[];
  /** Index of the edge this label belongs to (cost labels). */
  edge?: number;
  at: number;
}

const area = (a: Box, b: Box) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));

/** Length of the part of segment p→q inside box b (Liang–Barsky). */
function clipLen(p: Pt, q: Pt, b: Box): number {
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  let t0 = 0;
  let t1 = 1;
  const edges: [number, number][] = [
    [-dx, p.x - b.x0],
    [dx, b.x1 - p.x],
    [-dy, p.y - b.y0],
    [dy, b.y1 - p.y],
  ];
  for (const [pp, qq] of edges) {
    if (Math.abs(pp) < 1e-12) {
      if (qq < 0) return 0;
      continue;
    }
    const r = qq / pp;
    if (pp < 0) {
      if (r > t1) return 0;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return 0;
      if (r < t1) t1 = r;
    }
  }
  return t1 > t0 ? (t1 - t0) * Math.hypot(dx, dy) : 0;
}

/** Distance from (x, y) to the segment p–q. */
function segDist(x: number, y: number, p: Pt, q: Pt): number {
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const L2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((x - p.x) * dx + (y - p.y) * dy) / L2));
  return Math.hypot(x - p.x - t * dx, y - p.y - t * dy);
}

function townCands(p: Pt, w: number, h: number, kind: 'name' | 'info'): Cand[] {
  const side = kind === 'name' ? 0 : 0.35; // names prefer beside the town, numbers above/below
  const vert = kind === 'name' ? 0.35 : 0;
  const out: Cand[] = [];
  const add = (x0: number, y0: number, anchor: Anchor, pref: number) => out.push({ box: { x0, y0, x1: x0 + w, y1: y0 + h }, anchor, pref });
  add(p.x + CLEAR, p.y - h / 2, 'start', side);
  add(p.x - CLEAR - w, p.y - h / 2, 'end', side);
  add(p.x - w / 2, p.y - CLEAR - h, 'middle', vert);
  add(p.x - w / 2, p.y + CLEAR, 'middle', vert);
  add(p.x + CLEAR, p.y - h + 3, 'start', side + 0.6);
  add(p.x + CLEAR, p.y - 3, 'start', side + 0.6);
  add(p.x - CLEAR - w, p.y - h + 3, 'end', side + 0.6);
  add(p.x - CLEAR - w, p.y - 3, 'end', side + 0.6);
  add(p.x + DIAG, p.y - DIAG - h, 'start', 1);
  add(p.x - DIAG - w, p.y - DIAG - h, 'end', 1);
  add(p.x + DIAG, p.y + DIAG, 'start', 1);
  add(p.x - DIAG - w, p.y + DIAG, 'end', 1);
  add(p.x - 9, p.y - CLEAR - h, 'start', vert + 0.7);
  add(p.x + 9 - w, p.y - CLEAR - h, 'end', vert + 0.7);
  add(p.x - 9, p.y + CLEAR, 'start', vert + 0.7);
  add(p.x + 9 - w, p.y + CLEAR, 'end', vert + 0.7);
  return out;
}

function costCands(pa: Pt, pb: Pt, w: number, h: number, centroid: Pt, edge: number): Cand[] {
  const L = Math.hypot(pb.x - pa.x, pb.y - pa.y) || 1;
  const nx = -(pb.y - pa.y) / L;
  const ny = (pb.x - pa.x) / L;
  const mx = (pa.x + pb.x) / 2;
  const my = (pa.y + pb.y) / 2;
  // Preferred side: away from the middle of the map (the old rule), so lengths sit outside the network.
  const away = (mx + nx - centroid.x) ** 2 + (my + ny - centroid.y) ** 2 >= (mx - nx - centroid.x) ** 2 + (my - ny - centroid.y) ** 2 ? 1 : -1;
  const off = (w / 2) * Math.abs(nx) + (h / 2) * Math.abs(ny) + 4.5;
  const out: Cand[] = [];
  const at = (t: number, s: number, o: number, pref: number, onEdge?: number) => {
    const cx = pa.x + (pb.x - pa.x) * t + nx * s * o;
    const cy = pa.y + (pb.y - pa.y) * t + ny * s * o;
    out.push({ box: { x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2 }, anchor: 'middle', pref, onEdge });
  };
  for (const t of [0.5, 0.42, 0.58, 0.34, 0.66, 0.27, 0.73])
    for (const s of [away, -away]) at(t, s, off, Math.abs(t - 0.5) * 5 + (s === away ? 0 : 0.45));
  // Last resort: on the road itself (the label's halo hides the line under it).
  for (const t of [0.5, 0.4, 0.6]) at(t, 1, 0, 2.2 + Math.abs(t - 0.5) * 5, edge);
  return out;
}

/** Place every label of a road map. Deterministic; depends only on the map, the start/goal and the options. */
export function layoutLabels(map: MapDef, o: LayoutOptions): LabelLayout {
  const P = (id: string) => map.pos[id];
  const ids = map.graph.nodes.map((n) => n.id);
  const pts = ids.map(P);
  const centroid = { x: pts.reduce((t, p) => t + p.x, 0) / pts.length, y: pts.reduce((t, p) => t + p.y, 0) / pts.length };
  const segs = map.graph.edges.map(([a, b]) => [P(a), P(b)] as [Pt, Pt]);
  const labels: Label[] = [];

  const nameText = (id: string) => {
    const longName = map.long(id);
    const role = id === o.start ? 'start' : id === o.goal ? 'goal' : '';
    return `${longName ?? ''}${longName && role ? ' · ' : ''}${role}`;
  };
  for (const id of ids) {
    const t = nameText(id);
    if (t) labels.push({ kind: 'name', id, town: ids.indexOf(id), cands: townCands(P(id), Math.max(24, t.length * NAME_CH + 2), NAME_H, 'name'), at: 0 });
  }
  if (o.slots.length) {
    const w = o.infoChars * INFO_CH + 2;
    const h = INFO_H1 + (o.slots.length - 1) * LINE;
    for (const id of ids) labels.push({ kind: 'info', id, town: ids.indexOf(id), cands: townCands(P(id), w, h, 'info'), at: 0 });
  }
  map.graph.edges.forEach(([a, b, c], k) => {
    const w = numText(c).length * COST_CH + 2;
    labels.push({ kind: 'cost', id: edgeKey(a, b), cands: costCands(P(a), P(b), w, COST_H, centroid, k), edge: k, at: 0 });
  });

  const vb = { x0: 2, y0: 2, x1: map.vb.w - 2, y1: map.vb.h - 2 };
  const penalty = (L: Label, c: Cand, withLabels = true): number => {
    const b = c.box;
    let pen = c.pref;
    // other labels
    if (withLabels)
      for (const M of labels) {
        if (M === L) continue;
        const a = area(b, M.cands[M.at].box);
        if (a > 0.5) pen += 40 + a * 1.5;
      }
    // towns: never on a town, and a town's label nearer its own town than any other
    const dist = pts.map((p) => Math.hypot(Math.max(b.x0 - p.x, 0, p.x - b.x1), Math.max(b.y0 - p.y, 0, p.y - b.y1)));
    dist.forEach((d, k) => {
      if (d < TOWN_R) pen += 60 + (TOWN_R - d) * 6;
      if (L.town !== undefined && k !== L.town && d < dist[L.town] + 6) pen += 10 + (dist[L.town] + 6 - d);
    });
    // a road length nearer its own road than any other road
    if (L.edge !== undefined) {
      const cx = (b.x0 + b.x1) / 2;
      const cy = (b.y0 + b.y1) / 2;
      const own = segDist(cx, cy, segs[L.edge][0], segs[L.edge][1]);
      segs.forEach(([p, q], k) => {
        if (k === L.edge) return;
        const d = segDist(cx, cy, p, q);
        if (d < own + 3) pen += 8 + (own + 3 - d);
      });
    }
    // roads
    const inner = { x0: b.x0 + 1, y0: b.y0 + 1, x1: b.x1 - 1, y1: b.y1 - 1 };
    segs.forEach(([p, q], k) => {
      if (k === c.onEdge) return;
      const len = clipLen(p, q, inner);
      if (len > 0) pen += 14 + len * 0.4;
    });
    // picture edge and scale bar
    const out = (b.x1 - b.x0) * (b.y1 - b.y0) - area(b, vb);
    if (out > 0.5) pen += 80 + out * 2;
    if (o.scaleBar) {
      const a = area(b, o.scaleBar);
      if (a > 0.5) pen += 40 + a * 1.5;
    }
    return pen;
  };

  // Start each label at its own best spot ignoring the other labels, then settle by coordinate descent.
  for (const L of labels) {
    let best = Infinity;
    L.cands.forEach((c, i) => {
      const v = penalty(L, c, false);
      if (v < best - 1e-9) {
        best = v;
        L.at = i;
      }
    });
  }
  for (let pass = 0; pass < 8; pass++) {
    let moved = false;
    for (const L of labels) {
      let best = penalty(L, L.cands[L.at]);
      L.cands.forEach((c, i) => {
        if (i === L.at) return;
        const v = penalty(L, c);
        if (v < best - 1e-6) {
          best = v;
          L.at = i;
          moved = true;
        }
      });
    }
    if (!moved) break;
  }

  const spot = (c: Cand, firstBaseline: number): Spot => ({
    box: c.box,
    anchor: c.anchor,
    tx: c.anchor === 'start' ? c.box.x0 + 1 : c.anchor === 'end' ? c.box.x1 - 1 : (c.box.x0 + c.box.x1) / 2,
    ty: firstBaseline,
  });
  const res: LabelLayout = { name: {}, info: {}, cost: {} };
  for (const L of labels) {
    const c = L.cands[L.at];
    if (L.kind === 'name') res.name[L.id] = spot(c, c.box.y0 + 9.8);
    else if (L.kind === 'cost') res.cost[L.id] = spot(c, c.box.y0 + 10);
    else {
      // h on the line nearest the town (so it never moves when an f/g line appears): above the town h is the
      // bottom line, below it the top line; beside the town f/g comes first.
      const p = P(L.id);
      const order: InfoSlot[] = c.box.y0 >= p.y + 2 ? [...o.slots].reverse() : o.slots;
      const lineY = {} as Record<InfoSlot, number>;
      order.forEach((s, i) => (lineY[s] = c.box.y0 + 9.6 + i * LINE));
      res.info[L.id] = { ...spot(c, c.box.y0 + 9.6), lineY };
    }
  }
  return res;
}
