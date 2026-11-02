// RRT vs RRT*: choose parent and rewire, by hand (2025 Q29). Drag x_new and change the neighbourhood radius;
// step through one RRT* insertion (nearest → cost-to-come → c + d → parent → rewire → subtree) while the two
// tables fill in exactly as you would write them in the exam. "Add x_new to the tree" keeps the result, so you
// can build a tree by hand and watch costs drop.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as RKeyboardEvent, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import type { ExploreItem } from '../../../engine/types';
import { Badge, Button, Callout, Legend, More, Segmented, SimLayout, Slider } from '../../../ui/kit';
import { StepControls, useStepper } from '../../../ui/stepper';
import { PredictReveal } from '../../../ui/PredictReveal';
import { Rich } from '../../../ui/Rich';
import { svgPoint } from '../../../ui/diagrams';
import { freshSeed, makeRng } from '../../../engine/rng';
import { dist, type Vec2 } from '../../../core/geom2d';
import { analyse, edgeLen, examScene, f1, labelAll, nextLabel, pathIds, randomScene, r1, type HandNode } from './rrtHandModel';
import { Halo, SubLabel, edgeLabelPos, gapLabelSpots, treeNeighbours } from './rrtFigures';
import '../sampling.css';

export const meta: Omit<ExploreItem, 'component'> = {
  id: 'rrtstar',
  title: 'RRT vs RRT*: choose parent and rewire',
  summary: 'Drag the new sample around a small tree and step through one RRT* insertion: the choose-parent and rewire tables fill in live, exactly as in 2025 Q29.',
  notice: 'Basic RRT connects to the **nearest** vertex. RRT* picks the parent with the smallest $c(x_{near}) + d(x_{near}, x_{new})$, then rewires any neighbour that gets cheaper through $x_{new}$, and that neighbour’s whole subtree gets cheaper too.',
  minutes: 8,
};

const PHASES = ['Sample', 'RRT', 'c(x)', 'c + d', 'Parent', 'Rewire', 'Subtree'] as const;
const LAST = PHASES.length - 1;

interface Model {
  nodes: HandNode[];
  xnew: Vec2;
  radius: number;
  /** Which tree: the paper's (exam) or a random one. */
  kind: 'exam' | 'random';
}

function examModel(): Model {
  const s = examScene();
  return { nodes: s.nodes, xnew: s.xnew, radius: s.radius, kind: 'exam' };
}

function randomModel(seed: number): Model {
  const r = randomScene(makeRng(seed), { neighbours: [3, 5], rewires: [1, 2], descendant: true, size: [10, 13] });
  return { nodes: labelAll(r.scene.nodes), xnew: r.scene.xnew, radius: r.scene.radius, kind: 'random' };
}

/** Vertex name in HTML (cheap enough to re-render while dragging). */
function V({ l }: { l: string }) {
  return (
    <span className="plan-sampling-v">
      <i>x</i>
      <sub>{l}</sub>
    </span>
  );
}

/** Where the RRT label goes: beside the nearest → x_new line, on the side away from the root (the tree's other edges). */
function rrtLabelAt(a: Vec2, b: Vec2, root: Vec2): { x: number; y: number } {
  const q = edgeLabelPos(a, b, root, 13);
  return { x: q.x, y: q.y + 4 };
}

const PAD = 22;
const VW = 600;

// ------------------------------------------------------------------ label placement (no label on a line, a vertex or another label)

type Box = { x0: number; y0: number; x1: number; y1: number };
type Anchor = 'start' | 'middle' | 'end';
/** Approximate box of a 12 px label whose baseline is at y. */
function textBox(x: number, y: number, text: string, anchor: Anchor = 'middle'): Box {
  const w = text.length * 6.7 + 4;
  const x0 = anchor === 'start' ? x - 2 : anchor === 'end' ? x - w + 2 : x - w / 2;
  return { x0, x1: x0 + w, y0: y - 12, y1: y + 4 };
}
const around = (p: Vec2, r: number): Box => ({ x0: p.x - r, x1: p.x + r, y0: p.y - r, y1: p.y + r });
const overlapArea = (a: Box, b: Box) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
function segBoxDist(a: Vec2, b: Vec2, r: Box): number {
  const n = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 3));
  let m = Infinity;
  for (let k = 0; k <= n; k++) {
    const x = a.x + ((b.x - a.x) * k) / n;
    const y = a.y + ((b.y - a.y) * k) / n;
    m = Math.min(m, Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.y0 - y, 0, y - r.y1)));
  }
  return m;
}
/** Points at fractions `ts` along a → b, pushed `off` px to either side of the line. */
function besideLine(a: Vec2, b: Vec2, ts: readonly number[], off: number): Vec2[] {
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const nx = -(b.y - a.y) / L;
  const ny = (b.x - a.x) / L;
  const out: Vec2[] = [];
  for (const t of ts) {
    const m = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    out.push({ x: m.x + nx * off, y: m.y + ny * off }, { x: m.x - nx * off, y: m.y - ny * off });
  }
  return out;
}
const sameSeg = (u: readonly [Vec2, Vec2], a: Vec2, b: Vec2) =>
  (Math.hypot(u[0].x - a.x, u[0].y - a.y) < 0.5 && Math.hypot(u[1].x - b.x, u[1].y - b.y) < 0.5) || (Math.hypot(u[0].x - b.x, u[0].y - b.y) < 0.5 && Math.hypot(u[1].x - a.x, u[1].y - a.y) < 0.5);

/** The candidate spot whose box crosses the fewest lines and overlaps the least of what is already placed. */
function bestSpot<T extends { box: Box }>(cands: readonly T[], segs: readonly (readonly [Vec2, Vec2])[], taken: readonly Box[], frame?: Box): T {
  let best = cands[0];
  let bestScore = Infinity;
  for (const c of cands) {
    let score = 0;
    if (frame) score += 400 * (Math.max(0, frame.x0 - c.box.x0) + Math.max(0, c.box.x1 - frame.x1) + Math.max(0, frame.y0 - c.box.y0) + Math.max(0, c.box.y1 - frame.y1));
    for (const [a, b] of segs) {
      const d = segBoxDist(a, b, c.box);
      if (d < 3) score += 60 + (3 - d) * 10;
    }
    for (const t of taken) score += overlapArea(c.box, t) * 2;
    if (score < bestScore - 1e-9) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

export default function RrtStarHand() {
  const [model, setModel] = useState<Model>(examModel);
  const st = useStepper(LAST, { speed: 1 });
  const { nodes, xnew, radius } = model;
  const res = useMemo(() => analyse({ nodes, xnew, radius }), [nodes, xnew, radius]);
  const phase = st.i;
  const L = (id: number) => nodes[id].label;

  // View box: fixed for a given tree (so the drawing does not jump while x_new is dragged).
  const view = useMemo(() => {
    const pts = [...nodes.map((n) => n.p), { x: xnew.x - radius, y: xnew.y - radius }, { x: xnew.x + radius, y: xnew.y + radius }];
    const x0 = Math.min(...pts.map((p) => p.x)) - 0.6;
    const x1 = Math.max(...pts.map((p) => p.x)) + 0.6;
    const y0 = Math.min(...pts.map((p) => p.y)) - 0.6;
    const y1 = Math.max(...pts.map((p) => p.y)) + 0.6;
    const s = (VW - 2 * PAD) / (x1 - x0);
    return { x0, x1, y0, y1, s, H: Math.round((y1 - y0) * s + 2 * PAD) };
    // Only a new tree (not a drag) refits the view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes]);
  const X = (p: Vec2) => PAD + (p.x - view.x0) * view.s;
  const Y = (p: Vec2) => PAD + (view.y1 - p.y) * view.s;
  const P = (p: Vec2) => ({ x: X(p), y: Y(p) });

  // ---------------------------------------------------------------- interaction
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef(false);
  const setX = (p: Vec2) => {
    const q = { x: Math.max(view.x0 + 0.2, Math.min(view.x1 - 0.2, p.x)), y: Math.max(view.y0 + 0.2, Math.min(view.y1 - 0.2, p.y)) };
    setModel((m) => ({ ...m, xnew: q }));
  };
  const toWorld = (e: RPointerEvent) => {
    const q = svgPoint(svgRef.current!, e.clientX, e.clientY);
    return { x: (q.x - PAD) / view.s + view.x0, y: view.y1 - (q.y - PAD) / view.s };
  };
  const onPointer = (e: RPointerEvent<SVGGElement>, kind: 'down' | 'move' | 'up') => {
    if (kind === 'down') {
      drag.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      st.pause();
    }
    if (!drag.current) return;
    if (kind === 'up') {
      drag.current = false;
      e.currentTarget.releasePointerCapture(e.pointerId);
      return;
    }
    setX(toWorld(e));
  };
  const onKey = (e: RKeyboardEvent<SVGGElement>) => {
    const d = e.shiftKey ? 0.5 : 0.1;
    const k: Record<string, [number, number]> = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, d], ArrowDown: [0, -d] };
    if (!k[e.key]) return;
    e.preventDefault();
    setX({ x: xnew.x + k[e.key][0], y: xnew.y + k[e.key][1] });
  };

  const loadExam = () => {
    setModel(examModel());
    st.setI(0);
  };
  const loadRandom = () => {
    setModel(randomModel(freshSeed()));
    st.setI(0);
  };
  /** Keep the result: x_new joins the tree under its RRT* parent and takes over the rewired vertices. */
  const commit = () => {
    if (res.parent === null) return;
    const id = nodes.length;
    const label = nextLabel(nodes);
    const next = nodes.map((n) => ({ ...n, parent: res.afterParent[n.id] === nodes.length ? id : n.parent }));
    next.push({ id, label, p: { ...xnew }, parent: res.parent });
    // A fresh sample somewhere clear of the tree.
    const rng = makeRng(Math.floor(xnew.x * 1000) ^ (next.length * 7919));
    let best = xnew;
    let bestD = -1;
    for (let k = 0; k < 40; k++) {
      const q = { x: rng.uniform(view.x0 + 1, view.x1 - 1), y: rng.uniform(view.y0 + 1, view.y1 - 1) };
      const dmin = Math.min(...next.map((n) => dist(n.p, q)));
      const nb = next.filter((n) => dist(n.p, q) <= radius).length;
      if (dmin > bestD && dmin < 2.6 && nb >= 2) {
        best = q;
        bestD = dmin;
      }
    }
    setModel((m) => ({ ...m, nodes: next, xnew: best === xnew ? { x: xnew.x + 1.5, y: xnew.y - 1 } : best }));
    st.setI(0);
  };

  // ---------------------------------------------------------------- derived for drawing
  const nbIds = new Set(res.neighbours.map((n) => n.id));
  const rewired = res.rewires.filter((w) => w.rewire);
  const rewiredIds = new Set(rewired.map((w) => w.id));
  const descIds = new Set(res.descendants.map((d) => d.id));
  const showRewire = phase >= 5;
  /** Edges whose length is printed: on a root path to a neighbour (and to the affected subtree from phase 6). */
  const printed = new Set<number>();
  for (const id of nbIds) for (const k of pathIds(nodes, id)) if (k !== 0) printed.add(k);
  if (phase >= 6) for (const id of descIds) for (const k of pathIds(nodes, id)) if (k !== 0) printed.add(k);
  // Like the paper: name the root, the neighbours and (once it matters) the subtree below a rewired vertex.
  const labelled = (id: number) => id === 0 || nbIds.has(id) || (phase >= 6 && descIds.has(id));
  const px = P(xnew);
  const row = (id: number) => res.neighbours.find((n) => n.id === id);
  const nearest = res.nearest;
  const parent = res.parent;
  const keyBase = `${model.kind}-${nodes.length}`;
  // Everything drawn so far that a label must not cover: lines, vertices, x_new's handle and placed labels.
  const segs: [Vec2, Vec2][] = [];
  for (const n of nodes) if (n.parent >= 0) segs.push([P(n.p), P(nodes[n.parent].p)]);
  for (const id of nbIds) segs.push([P(nodes[id].p), px]);
  const taken: Box[] = nodes.map((n) => around(P(n.p), 7));
  taken.push(around(px, 13));
  const badgeBox = new Map<number, Box>();
  const frame: Box = { x0: 2, y0: 2, x1: VW - 2, y1: view.H - 2 };
  // x_new's name first: in the widest gap between its lines to the neighbours.
  const xnewLabel = bestSpot(
    gapLabelSpots(px, [...nbIds].map((id) => P(nodes[id].p)), 21).map((q) => ({ ...q, box: textBox(q.x, q.y, 'x_new', q.anchor) })),
    segs,
    taken,
    frame
  );
  taken.push(xnewLabel.box);

  const edgeEls: ReactNode[] = [];
  for (const n of nodes) {
    if (n.parent < 0) continue;
    const a = P(n.p);
    const b = P(nodes[n.parent].p);
    const removed = showRewire && rewiredIds.has(n.id);
    const onPath = printed.has(n.id) && phase >= 2 && phase <= 3;
    edgeEls.push(
      <path
        key={`e${n.id}`}
        d={`M${a.x} ${a.y}L${b.x} ${b.y}`}
        className={removed ? 'plan-sampling-removed' : onPath ? 'plan-sampling-edge plan-sampling-pathedge' : 'plan-sampling-edge'}
      />
    );
    if (removed) {
      // Nearer the old parent than the midpoint, so it covers neither the printed length nor the cost badge.
      const m = { x: a.x + (b.x - a.x) * 0.68, y: a.y + (b.y - a.y) * 0.68 };
      edgeEls.push(
        <g key={`x${n.id}`} className="plan-sampling-pop">
          <circle cx={m.x} cy={m.y} r={8} className="plan-sampling-xmark-bg" />
          <path d={`M${m.x - 4} ${m.y - 4}L${m.x + 4} ${m.y + 4}M${m.x + 4} ${m.y - 4}L${m.x - 4} ${m.y + 4}`} className="plan-sampling-xmark" />
        </g>
      );
    }
  }
  const lenEls = [...printed].map((k) => {
    if (showRewire && rewiredIds.has(k)) return null; // crossed out: its length no longer matters
    const a = P(nodes[k].p);
    const b = P(nodes[nodes[k].parent].p);
    const q = edgeLabelPos(a, b, px, 11);
    taken.push(textBox(q.x, q.y + 4, f1(edgeLen(nodes, k))));
    return (
      <Halo key={`l${k}`} x={q.x} y={q.y + 4} className="plan-sampling-num plan-sampling-edgenum">
        {f1(edgeLen(nodes, k))}
      </Halo>
    );
  });

  // Lines from the neighbours to x_new (phase-dependent).
  const candEls: ReactNode[] = [];
  /** c + d labels, drawn after the x_new handle so it never hides them. */
  const candLabelEls: ReactNode[] = [];
  for (const n of res.neighbours) {
    const a = P(nodes[n.id].p);
    const isNearest = n.id === nearest;
    const isParent = n.id === parent;
    if (phase >= 4 && isParent) continue; // drawn as the chosen edge
    if (phase >= 1 && isNearest && phase < 4) continue; // drawn as the RRT edge
    const faded = phase >= 4;
    candEls.push(<path key={`c${n.id}`} d={`M${a.x} ${a.y}L${px.x} ${px.y}`} className={faded ? 'plan-sampling-cand plan-sampling-faded' : 'plan-sampling-cand'} />);
    if (phase <= 3) {
      // On its own line (the halo keeps it readable), at the point along it that covers the least.
      const text = phase === 3 ? `${f1(n.c)}+${f1(n.d)}=${f1(n.total)}` : `d ${f1(n.d)}`;
      const ts = phase === 3 ? [0.42, 0.52, 0.32, 0.62] : [0.5, 0.4, 0.6, 0.3];
      const onLine = ts.map((t) => ({ x: a.x + (px.x - a.x) * t, y: a.y + (px.y - a.y) * t + 4 }));
      // A short line cannot hold a long label: then beside it.
      const beside = besideLine(a, px, [0.5, 0.35, 0.65], 13).map((q) => ({ x: q.x, y: q.y + 4 }));
      const pick = bestSpot(
        [...onLine, ...beside].map((m) => ({ ...m, box: textBox(m.x, m.y, text) })),
        segs.filter((u) => !sameSeg(u, a, px)),
        taken,
        frame
      );
      taken.push(pick.box);
      candLabelEls.push(
        <Halo key={`ct${n.id}`} x={pick.x} y={pick.y} className={phase === 3 ? 'plan-sampling-num' : 'plan-sampling-num plan-sampling-muted'}>
          {text}
        </Halo>
      );
    }
  }
  const nr = nearest !== null ? row(nearest) : undefined;
  const pr = parent !== null ? row(parent) : undefined;
  const rrtEl =
    phase >= 1 && nr ? (
      <g key={`rrt-${keyBase}`}>
        <path d={`M${X(nodes[nr.id].p)} ${Y(nodes[nr.id].p)}L${px.x} ${px.y}`} className={phase >= 4 ? 'plan-sampling-rrt plan-sampling-faded' : 'plan-sampling-rrt'} />
      </g>
    ) : null;
  let rrtLabelEl: ReactNode = null;
  if (phase >= 1 && phase < 4 && nr) {
    const text = phase === 3 ? `RRT · ${f1(nr.c)}+${f1(nr.d)}=${f1(nr.total)}` : `RRT: nearest, d ${f1(nr.d)}`;
    const a = P(nodes[nr.id].p);
    const first = rrtLabelAt(a, px, P(nodes[0].p));
    // Beside its line, or (when the line is short) further out beyond the nearest vertex.
    const away = { x: a.x + (a.x - px.x), y: a.y + (a.y - px.y) };
    const cands = [first, ...besideLine(a, px, [0.5, 0.3, 0.7], 13), ...besideLine(a, px, [0.5], 26), ...besideLine(a, away, [0.4, 0.8], 14), { x: away.x, y: away.y }].map((q, k) => (k === 0 ? q : { x: q.x, y: q.y + 4 }));
    const pick = bestSpot(
      cands.map((q) => ({ ...q, box: textBox(q.x, q.y, text) })),
      segs,
      taken,
      frame
    );
    taken.push(pick.box);
    rrtLabelEl = (
      <Halo key={`rrtl-${keyBase}`} x={pick.x} y={pick.y} className="plan-sampling-num plan-sampling-rrtlabel">
        {text}
      </Halo>
    );
  }
  const parentEl =
    phase >= 4 && pr ? (
      <g key={`par-${keyBase}-${parent}`}>
        <path d={`M${X(nodes[pr.id].p)} ${Y(nodes[pr.id].p)}L${px.x} ${px.y}`} pathLength={1} className="plan-sampling-chosen plan-sampling-grow" />
        {(() => {
          const q = edgeLabelPos(P(nodes[pr.id].p), px, labelAt(pr.id), 10);
          taken.push(textBox(q.x, q.y + 4, f1(pr.d)));
          return (
            <Halo x={q.x} y={q.y + 4} className="plan-sampling-num plan-sampling-chosenlabel">
              {`${f1(pr.d)}`}
            </Halo>
          );
        })()}
      </g>
    ) : null;
  const rewireEls: ReactNode[] = showRewire
    ? res.rewires.map((w) => {
        const a = P(nodes[w.id].p);
        if (!w.rewire) return null;
        const q = edgeLabelPos(px, a, { x: (px.x + a.x) / 2 + 40, y: (px.y + a.y) / 2 + 40 }, 10);
        taken.push(textBox(q.x, q.y + 4, f1(row(w.id)!.d)));
        return (
          <g key={`rw-${keyBase}-${w.id}`}>
            <path d={`M${px.x} ${px.y}L${a.x} ${a.y}`} pathLength={1} className="plan-sampling-rewired plan-sampling-grow plan-sampling-flash" />
            <Halo x={q.x} y={q.y + 4} className="plan-sampling-num plan-sampling-rwyes">
              {f1(row(w.id)!.d)}
            </Halo>
          </g>
        );
      })
    : [];

  // Cost badges next to vertices.
  const badgeEls: ReactNode[] = [];
  if (phase >= 2) {
    for (const n of res.neighbours) {
      const a = P(nodes[n.id].p);
      const w = res.rewires.find((r) => r.id === n.id);
      const below = nodes[n.id].p.y < xnew.y - 0.3;
      let text = `c ${f1(n.c)}`;
      let cls = 'plan-sampling-num plan-sampling-cost';
      if (phase >= 5 && w) {
        text = w.rewire ? `${f1(w.via)} < ${f1(w.current)} ✓` : `${f1(w.via)} ${w.equal ? '=' : '≥'} ${f1(w.current)}`;
        cls = w.rewire ? 'plan-sampling-num plan-sampling-rwyes' : 'plan-sampling-num plan-sampling-muted';
      }
      if (phase >= 6 && w?.rewire) text = `c ${f1(w.current)} → ${f1(w.via)}`;
      const spot = placeBadge(n.id, a, text, below);
      badgeEls.push(
        <Halo key={`b${n.id}-${phase >= 5 ? 'r' : 'c'}`} x={spot.x} y={spot.y} anchor={spot.anchor} className={cls}>
          {text}
        </Halo>
      );
    }
  }
  if (phase >= 6) {
    for (const d of res.descendants) {
      if (nbIds.has(d.id)) continue;
      const a = P(nodes[d.id].p);
      const text = `c ${f1(d.old)} → ${f1(d.now)}`;
      const spot = placeBadge(d.id, a, text, false);
      badgeEls.push(
        <Halo key={`d${d.id}`} x={spot.x} y={spot.y} anchor={spot.anchor} className="plan-sampling-num plan-sampling-rwyes plan-sampling-pop">
          {text}
        </Halo>
      );
    }
  }

  /** A vertex name goes in the widest gap between its tree edges, its line to x_new and its cost badge. */
  function labelAt(id: number) {
    const a = P(nodes[id].p);
    const towards = treeNeighbours(nodes, id, P);
    const blocked: number[] = [];
    if (nbIds.has(id)) towards.push(px);
    const bb = badgeBox.get(id);
    if (bb) for (const [cx, cy] of [[bb.x0, bb.y0], [bb.x1, bb.y0], [bb.x0, bb.y1], [bb.x1, bb.y1]]) blocked.push(Math.atan2(cy - a.y, cx - a.x));
    const spots = gapLabelSpots(a, towards, id === 0 ? 17 : 16, blocked).map((q) => ({ ...q, box: textBox(q.x, q.y, 'x0', q.anchor) }));
    const q = bestSpot(spots, segs, taken, frame);
    return { x: q.x, y: q.y, anchor: q.anchor };
  }

  /** A cost badge beside a vertex: upper or lower, right or left, wherever it covers the least. */
  function placeBadge(id: number, a: Vec2, text: string, preferBelow: boolean): { x: number; y: number; anchor: Anchor } {
    const spots: { x: number; y: number; anchor: Anchor }[] = [
      { x: a.x + 10, y: a.y - 12, anchor: 'start' },
      { x: a.x + 10, y: a.y + 21, anchor: 'start' },
      { x: a.x - 10, y: a.y - 12, anchor: 'end' },
      { x: a.x - 10, y: a.y + 21, anchor: 'end' },
    ];
    if (preferBelow) spots.unshift(spots.splice(1, 1)[0]);
    const pick = bestSpot(
      spots.map((sp) => ({ ...sp, box: textBox(sp.x, sp.y, text, sp.anchor) })),
      segs,
      taken,
      frame
    );
    taken.push(pick.box);
    badgeBox.set(id, pick.box);
    return { x: pick.x, y: pick.y, anchor: pick.anchor };
  }

  // ---------------------------------------------------------------- narration
  const nbList = res.neighbours.map((n, i) => (
    <span key={n.id}>
      {i > 0 && (i === res.neighbours.length - 1 ? ' and ' : ', ')}
      <V l={L(n.id)} />
    </span>
  ));
  let say: ReactNode;
  if (!res.neighbours.length) say = <>No vertex lies within r = {f1(radius)} of x_new. Drag it closer to the tree or widen the radius.</>;
  else if (phase === 0)
    say = (
      <>
        <V l="new" /> has just been sampled. Inside the neighbourhood (r = {f1(radius)}): {nbList}. Their distances to <V l="new" /> are in the table. What would each planner connect it to?
      </>
    );
  else if (phase === 1 && nr)
    say = (
      <>
        <b>Basic RRT stops here:</b> it joins <V l="new" /> to the <b>nearest</b> vertex, <V l={L(nr.id)} /> (d = {f1(nr.d)}){res.nearestTie ? ' (a tie in the printed distances; the exact distance decides)' : ''}, ignoring how far that vertex is from the root.
      </>
    );
  else if (phase === 2)
    say = (
      <>
        <b>RRT* step 1:</b> write the cost-to-come <i>c</i>(<i>x</i>) of every neighbour, adding the edges back to <V l="0" />:{' '}
        {res.neighbours.map((n, i) => (
          <span key={n.id}>
            {i > 0 && '; '}
            <V l={L(n.id)} /> {n.edges.length > 1 ? `${n.edges.map(f1).join(' + ')} = ${f1(n.c)}` : f1(n.c)}
          </span>
        ))}
        .
      </>
    );
  else if (phase === 3 && pr)
    say = (
      <>
        <b>Choose parent:</b> for each neighbour add the new edge, <i>c</i>(<i>x</i>) + <i>d</i>(<i>x</i>, <V l="new" />). The smallest total is <V l={L(pr.id)} />: {f1(pr.c)} + {f1(pr.d)} = {f1(pr.total)}
        {res.parentTie ? ' (tied; the first one checked wins)' : ''}.
      </>
    );
  else if (phase === 4 && pr && nr)
    say =
      pr.id === nr.id ? (
        <>
          Connect <V l="new" /> to <V l={L(pr.id)} />: <i>c</i>(<V l="new" />) = {f1(res.cNew)}. Here the nearest vertex is also the cheapest parent, so RRT and RRT* agree.
        </>
      ) : (
        <>
          <b>Connect</b> <V l="new" /> to <V l={L(pr.id)} />: <i>c</i>(<V l="new" />) = {f1(res.cNew)}, which is {f1(res.rrtCost - res.cNew)} shorter than basic RRT’s {f1(res.rrtCost)} through <V l={L(nr.id)} />.
        </>
      );
  else if (phase === 5)
    say = rewired.length ? (
      <>
        <b>Rewire</b> (“from” <V l="new" />): a neighbour switches parent if <i>c</i>(<V l="new" />) + <i>d</i> &lt; <i>c</i>(<i>x</i>).{' '}
        {rewired.map((w, i) => (
          <span key={w.id}>
            {i > 0 && ' '}
            <V l={L(w.id)} />: {f1(w.via)} &lt; {f1(w.current)}, so its old parent edge is removed and <V l="new" /> becomes its parent.
          </span>
        ))}
      </>
    ) : (
      <>
        <b>Rewire</b>: no other neighbour is cheaper through <V l="new" /> ({res.rewires.map((w) => `${f1(w.via)} ≥ ${f1(w.current)}`).join(', ')}), so nothing changes.
      </>
    );
  else if (phase === 6)
    say = rewired.length ? (
      <>
        <b>Subtree:</b> {rewired.map((w, i) => (
          <span key={w.id}>
            {i > 0 && '; '}
            <V l={L(w.id)} /> drops {f1(w.current)} → {f1(w.via)}
          </span>
        ))}
        . {res.descendants.filter((d) => !nbIds.has(d.id)).length ? (
          <>
            Every vertex below it saves the same amount (
            {res.descendants
              .filter((d) => !nbIds.has(d.id))
              .map((d) => `${d.old.toFixed(1)} → ${d.now.toFixed(1)}`)
              .join(', ')}
            ).
          </>
        ) : (
          'Nothing hangs below it here; if anything did, it would save the same amount.'
        )}{' '}
        Press <b>Add x_new to the tree</b> to keep this and sample again.
      </>
    ) : (
      <>No rewires, so no costs change. Press <b>Add x_new to the tree</b> to keep it and sample again.</>
    );

  // ---------------------------------------------------------------- tables
  const show = (from: number, node: ReactNode) => (phase >= from ? node : <span className="muted">?</span>);
  const parentTable = (
    <table className="table plan-sampling-table" aria-label="Choose-parent table">
      <thead>
        <tr>
          <th>vertex</th>
          <th>
            <i>d</i>(<i>x</i>, <V l="new" />)
          </th>
          <th>
            <i>c</i>(<i>x</i>)
          </th>
          <th>
            <i>c</i> + <i>d</i>
          </th>
        </tr>
      </thead>
      <tbody>
        {res.neighbours.map((n) => {
          const isN = n.id === nearest;
          const isP = n.id === parent;
          return (
            <tr key={n.id} className={phase >= 4 && isP ? 'plan-sampling-rowpick' : phase >= 1 && isN ? 'plan-sampling-rownear' : undefined}>
              <td>
                <V l={L(n.id)} /> {phase >= 1 && isN && <Badge tone="m1">RRT</Badge>} {phase >= 4 && isP && <Badge tone="m3">RRT*</Badge>}
              </td>
              <td className="mono">{f1(n.d)}</td>
              <td className="mono">
                {show(
                  2,
                  <>
                    {f1(n.c)}
                    {n.edges.length > 1 && <span className="plan-sampling-sum">{n.edges.map(f1).join('+')}</span>}
                  </>
                )}
              </td>
              <td className="mono">{show(3, <b className={phase >= 4 && isP ? 'plan-sampling-pick' : undefined}>{f1(n.total)}</b>)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
  const rewireTable = (
    <table className="table plan-sampling-table" aria-label="Rewire table">
      <thead>
        <tr>
          <th>vertex</th>
          <th>
            <i>c</i>(<V l="new" />) + <i>d</i>
          </th>
          <th>
            <i>c</i>(<i>x</i>)
          </th>
          <th>rewire?</th>
        </tr>
      </thead>
      <tbody>
        {res.rewires.map((w) => (
          <tr key={w.id} className={phase >= 5 && w.rewire ? 'plan-sampling-rowrewire' : undefined}>
            <td>
              <V l={L(w.id)} />
            </td>
            <td className="mono">{show(5, <>{f1(res.cNew)} + {f1(row(w.id)!.d)} = {f1(w.via)}</>)}</td>
            <td className="mono">
              {show(
                5,
                <>
                  {f1(w.current)}
                  {Math.abs(w.current - w.original) > 1e-9 && <span className="plan-sampling-sum">was {f1(w.original)}</span>}
                </>
              )}
            </td>
            <td>{show(5, w.rewire ? <b className="plan-sampling-yes">✓ yes</b> : <span className="muted">✗ no{w.equal ? ' (equal)' : ''}</span>)}</td>
          </tr>
        ))}
        {!res.rewires.length && (
          <tr>
            <td colSpan={4} className="muted small">
              No other neighbours to check.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );

  const examExact = model.kind === 'exam' && nodes.length === 13 && dist(xnew, examScene().xnew) < 1e-9 && Math.abs(radius - 3.9) < 1e-9;

  return (
    <div>
      <SimLayout
        visual={
          <>
            <svg
              ref={svgRef}
              className="plan-sampling-hand"
              viewBox={`0 0 ${VW} ${view.H}`}
              width="100%"
              role="img"
              aria-label={`Tree rooted at x0 with ${nodes.length} vertices and the new sample x_new. ${res.neighbours.length} vertices inside the radius. Step ${phase}: ${PHASES[phase]}.`}
            >
              <circle cx={px.x} cy={px.y} r={radius * view.s} className="plan-sampling-hood" />
              {edgeEls}
              {candEls}
              {rrtEl}
              {parentEl}
              {rewireEls}
              {lenEls}
              {nodes.map((n) => {
                const a = P(n.p);
                const inside = nbIds.has(n.id);
                return (
                  <g key={`n${n.id}`}>
                    {inside && <circle cx={a.x} cy={a.y} r={9} className="plan-sampling-nbring" />}
                    <circle cx={a.x} cy={a.y} r={n.id === 0 ? 6.5 : 5} className={n.id === 0 ? 'plan-sampling-root' : 'plan-sampling-node'} />
                    {labelled(n.id) && <SubLabel {...labelAt(n.id)} sub={n.label} />}
                  </g>
                );
              })}
              {badgeEls}
              <g
                className="plan-sampling-drag"
                tabIndex={0}
                role="slider"
                aria-label="x_new: drag, or use the arrow keys (Shift for bigger steps)"
                aria-valuetext={`x_new at (${xnew.x.toFixed(1)}, ${xnew.y.toFixed(1)})`}
                onPointerDown={(e) => onPointer(e, 'down')}
                onPointerMove={(e) => onPointer(e, 'move')}
                onPointerUp={(e) => onPointer(e, 'up')}
                onPointerCancel={(e) => onPointer(e, 'up')}
                onKeyDown={onKey}
              >
                <circle cx={px.x} cy={px.y} r={24} fill="transparent" />
                <circle cx={px.x} cy={px.y} r={11} className="plan-sampling-handle" />
                <circle cx={px.x} cy={px.y} r={6} className="plan-sampling-xnew" />
                <SubLabel x={xnewLabel.x} y={xnewLabel.y} sub="new" anchor={xnewLabel.anchor} className="plan-sampling-svglabel plan-sampling-xnewlabel" />
              </g>
              {candLabelEls}
              {rrtLabelEl}
            </svg>
            <StepControls st={st} label="step" speeds={[0.5, 1, 2]} />
            <Segmented size="sm" label="Jump to a step" value={phase} onChange={(v) => st.setI(v)} options={PHASES.map((p, i) => ({ value: i, label: `${i} ${p}` }))} />
            <p className="plan-sampling-say" aria-live="polite">
              {say}
            </p>
            <Legend
              items={[
                { label: 'RRT: nearest vertex', color: 'var(--m1)', dash: true },
                { label: 'RRT*: chosen parent', color: 'var(--m3)' },
                { label: 'rewired (new edge)', color: 'var(--m4)' },
                { label: 'removed edge', color: 'var(--bad)', dash: '3 3' },
                { label: 'neighbourhood', color: 'var(--m2)', dash: '5 4' },
              ]}
            />
          </>
        }
        controls={
          <>
            <div className="row gap-s wrap">
              <Button size="sm" variant={model.kind === 'exam' ? 'primary' : 'default'} onClick={loadExam} title="The tree, distances and radius of 2025 Q29">
                2025 Q29 tree
              </Button>
              <Button size="sm" onClick={loadRandom}>
                Random tree
              </Button>
              <Button size="sm" variant="ok" onClick={commit} disabled={phase < LAST || res.parent === null} title={phase < LAST ? 'Step to the end first' : 'Keep x_new in the tree and sample again'}>
                Add x_new to the tree
              </Button>
            </div>
            {model.kind === 'exam' && (
              <p className="muted small plan-sampling-tight">
                {examExact ? 'Exactly the paper’s numbers (its figure is not to scale; this one is, so the printed lengths match the drawing).' : 'Started from the paper’s tree; you have moved x_new or the radius.'}
              </p>
            )}
            <Slider label="neighbourhood radius" tex="r" tip="RRT* only considers vertices within r of x_new" value={radius} min={1} max={6} step={0.1} onChange={(v) => setModel((m) => ({ ...m, radius: r1(v) }))} />
            <h4>
              Choose parent (“to” <span style={{ textTransform: 'none' }}><V l="new" /></span>)
            </h4>
            {res.neighbours.length ? parentTable : <Callout kind="warn">No vertex inside the radius.</Callout>}
            <h4>
              Rewire (“from” <span style={{ textTransform: 'none' }}><V l="new" /></span>)
            </h4>
            {rewireTable}
            <div className="readouts plan-sampling-vs" aria-label="Basic RRT against RRT*">
              <div className="readout tone-m1">
                <div className="readout-label">Basic RRT (nearest)</div>
                <div className="readout-value">
                  {phase >= 1 && nr ? <V l={L(nr.id)} /> : '?'} <span className="readout-unit">c(x_new) =</span> {phase >= 3 && nr ? f1(res.rrtCost) : '?'}
                </div>
              </div>
              <div className="readout tone-m3">
                <div className="readout-label">RRT* (cheapest c + d)</div>
                <div className="readout-value">
                  {phase >= 4 && pr ? <V l={L(pr.id)} /> : '?'} <span className="readout-unit">c(x_new) =</span> {phase >= 4 && pr ? f1(res.cNew) : '?'}
                </div>
              </div>
            </div>
          </>
        }
      />
      <PredictReveal
        id="plan-rrtstar-rrt-parent"
        question="2025 Q29 tree. Which vertex does **basic RRT** connect $x_{new}$ to?"
        options={['$x_a$', '$x_b$', '$x_c$', '$x_d$']}
        answer={0}
        explain="Basic RRT joins the new sample to the **nearest** vertex, $x_a$ ($d$ = 1.5), whatever its cost-to-come. Reaching $x_a$ from the root already costs 2.8 + 3.2 = 6.0, so this connection gives $c(x_{new})$ = 7.5."
        tryIt="press Show me: step 1 draws the RRT connection."
        onApply={() => {
          loadExam();
          st.setI(1);
        }}
      />
      <PredictReveal
        id="plan-rrtstar-star-parent"
        question="Same tree. Which parent does **RRT*** choose, and what is $c(x_{new})$?"
        options={['$x_a$, with $c(x_{new})$ = 7.5', '$x_b$, with $c(x_{new})$ = 5.0', '$x_b$, with $c(x_{new})$ = 2.2', '$x_c$, with $c(x_{new})$ = 8.6']}
        answer={1}
        explain="RRT* minimises $c(x_{near}) + d(x_{near}, x_{new})$: $x_a$ 6.0 + 1.5 = 7.5, $x_b$ 2.8 + 2.2 = **5.0**, $x_c$ 5.8 + 2.8 = 8.6, $x_d$ 9.9 + 3.5 = 13.4. The nearest vertex is not the cheapest one to come through. (2.2 forgets $c(x_b)$.)"
        tryIt="press Show me: steps 2–4 fill in the cost-to-come and c + d columns."
        onApply={() => {
          loadExam();
          st.setI(4);
        }}
      />
      <PredictReveal
        id="plan-rrtstar-rewire"
        question="Now the rewire step. Which neighbour, if any, gets $x_{new}$ as its new parent?"
        options={['None of them', '$x_a$ (6.0 → 6.5)', '$x_c$ (5.8 → 7.8)', '$x_d$ (9.9 → 8.5)']}
        answer={3}
        explain="Rewire if $c(x_{new}) + d(x_{new}, x_{near}) < c(x_{near})$: $x_a$ 5.0 + 1.5 = 6.5 ≥ 6.0 (no), $x_c$ 5.0 + 2.8 = 7.8 ≥ 5.8 (no), $x_d$ 5.0 + 3.5 = **8.5 < 9.9**. So the edge $x_c$–$x_d$ is removed and $x_{new}$–$x_d$ added; anything below $x_d$ would save 1.4 too (2025 Q29c). The other two options would make those vertices more expensive."
        tryIt="press Show me: steps 5–6 run the rewire."
        onApply={() => {
          loadExam();
          st.setI(LAST);
        }}
      />
      <PredictReveal
        id="plan-rrtstar-small-radius"
        question="Shrink the radius until only $x_a$ is inside. What does RRT* connect $x_{new}$ to now?"
        options={['$x_b$: RRT* always finds the cheapest parent in the tree', '$x_a$: with one neighbour, RRT* behaves like basic RRT', 'Nothing: RRT* needs at least two neighbours']}
        answer={1}
        explain="RRT* only compares vertices inside the radius. With $x_a$ alone, the cheapest candidate is the nearest one and nothing can be rewired, so it reduces to RRT. That is why the radius matters: too small and you lose the optimality, too large and every insertion checks many edges (RRT* shrinks it slowly as the tree grows, like $\gamma(\log n / n)^{1/2}$)."
        tryIt="press Show me (radius 1.8)."
        onApply={() => {
          setModel({ ...examModel(), radius: 1.8 });
          st.setI(4);
        }}
      />
      <More label="Why this makes RRT* asymptotically optimal">
        <Rich
          text={
            'Basic RRT never revisits an edge: once a vertex is in the tree, its path back to the root is fixed, so early jagged branches stay for ever (2023 Q32d). RRT* repairs the tree locally at every insertion: **choose parent** gives each new vertex the cheapest connection available in its neighbourhood, and **rewire** lets older vertices switch to a cheaper path through it. As samples fill the space these local repairs propagate, and the path cost converges to the optimum: *asymptotic optimality*, the extra property of RRT* and PRM* (review deck). The price is extra collision checks: one per neighbour for choose-parent and one per improving neighbour for rewiring.\n\nBy hand (2025 Q29): write $c(x)$ for each neighbour, compute $c(x) + d(x, x_{new})$ and pick the smallest, then test $c(x_{new}) + d(x_{new}, x_{near}) < c(x_{near})$ for the others.'
          }
        />
      </More>
    </div>
  );
}

