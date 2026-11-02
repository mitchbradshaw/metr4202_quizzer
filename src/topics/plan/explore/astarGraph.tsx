// SVG road map for the A* activities: towns, roads with costs, h beside each town, and the search state
// (Open = frontier, Closed = expanded, parent links, the roads relaxed this step, the final path).
// Scales with its viewBox; towns are buttons (≥ 40 px touch targets) when `onNode` is given.
import { memo, useMemo, type KeyboardEvent } from 'react';
import type { Algo } from '../../../core/graph';
import type { MapDef, Pt } from './astarMaps';
import { num, type ClosedRow, type OpenRow, type StepUpdate } from './astarTable';
import '../astar.css';

export interface GraphView {
  open: readonly OpenRow[];
  closed: readonly ClosedRow[];
  /** Node popped in the step being shown. */
  popped?: string | null;
  /** That step's relaxations. */
  updates?: readonly StepUpdate[];
  /** Final path, once the goal has been popped. */
  path?: readonly string[] | null;
  /** "You drive": node picked, its expansion not applied yet. */
  pending?: string | null;
  /** "You drive": feedback flash on the last pick. */
  flash?: { node: string; ok: boolean } | null;
  /** Hide f/g on Open nodes (when the student must compute them). */
  hideOpenValues?: boolean;
}

export interface RoadGraphProps {
  map: MapDef;
  start: string;
  goal: string;
  /** Heuristic to print beside each town (omit to hide). */
  h?: (n: string) => number;
  /** Towns whose h overestimates the true cost to go. */
  hBad?: ReadonlySet<string>;
  hEdited?: ReadonlySet<string>;
  view?: GraphView;
  algo?: Algo;
  /** Print f (Open) or g (Closed) beside the towns. */
  showValues?: boolean;
  onNode?: (id: string) => void;
  /** What tapping a town does, for screen readers ("set as start"). */
  nodeAction?: string;
  ariaLabel: string;
  /** Static figure (solve pages): slightly smaller labels, no hover styles. */
  figure?: boolean;
}

const R = 17;

type Dir = 'E' | 'NE' | 'N' | 'NW' | 'W' | 'SW' | 'S' | 'SE';
const DIRS: Record<Dir, Pt> = {
  E: { x: 1, y: 0 },
  NE: { x: Math.SQRT1_2, y: -Math.SQRT1_2 },
  N: { x: 0, y: -1 },
  NW: { x: -Math.SQRT1_2, y: -Math.SQRT1_2 },
  W: { x: -1, y: 0 },
  SW: { x: -Math.SQRT1_2, y: Math.SQRT1_2 },
  S: { x: 0, y: 1 },
  SE: { x: Math.SQRT1_2, y: Math.SQRT1_2 },
};
const ALL_DIRS = Object.keys(DIRS) as Dir[];

const angDist = (a: number, b: number) => {
  const d = Math.abs(a - b) % (2 * Math.PI);
  return d > Math.PI ? 2 * Math.PI - d : d;
};
const dirAngle = (d: Dir) => Math.atan2(DIRS[d].y, DIRS[d].x);

/** Rough label box for a text anchored on side `d` of a town at p. */
function labelBox(p: Pt, d: Dir, w: number, hgt: number): [number, number, number, number] {
  const v = DIRS[d];
  const cx = p.x + v.x * (R + 6 + w / 2);
  const cy = p.y + v.y * (R + 6 + hgt / 2);
  return [cx - w / 2, cy - hgt / 2, cx + w / 2, cy + hgt / 2];
}

interface Placement {
  name: Dir;
  info: Dir;
}

/** Put each town's name and its numbers in the widest gaps between its roads, away from other towns and the edge. */
function placeLabels(map: MapDef): Record<string, Placement> {
  const out: Record<string, Placement> = {};
  const ids = map.graph.nodes.map((n) => n.id);
  const inc = new Map<string, number[]>(ids.map((id) => [id, []]));
  for (const [a, b] of map.graph.edges) {
    const pa = map.pos[a];
    const pb = map.pos[b];
    inc.get(a)!.push(Math.atan2(pb.y - pa.y, pb.x - pa.x));
    inc.get(b)!.push(Math.atan2(pa.y - pb.y, pa.x - pb.x));
  }
  for (const id of ids) {
    const p = map.pos[id];
    const score = (d: Dir, w: number, hgt: number) => {
      const th = dirAngle(d);
      let s = Math.min(Math.PI, ...inc.get(id)!.map((a) => angDist(th, a)));
      for (const other of ids) {
        if (other === id) continue;
        const q = map.pos[other];
        const dist = Math.hypot(q.x - p.x, q.y - p.y);
        if (dist > 130) continue;
        const da = angDist(th, Math.atan2(q.y - p.y, q.x - p.x));
        if (da < 0.75) s -= (0.75 - da) * ((130 - dist) / 130) * 2.5;
      }
      const [x0, y0, x1, y1] = labelBox(p, d, w, hgt);
      if (x0 < 2 || y0 < 2 || x1 > map.vb.w - 2 || y1 > map.vb.h - 2) s -= 3;
      return s;
    };
    const longName = map.long(id);
    const nameW = Math.max(36, (longName ? longName.length : 4) * 6.6 + 34);
    let bestName: Dir = 'E';
    let bestNameS = -Infinity;
    for (const d of ALL_DIRS) {
      const bonus = d === 'E' || d === 'W' ? 0.3 : d === 'N' || d === 'S' ? 0.1 : 0;
      const s = score(d, nameW, 14) + bonus;
      if (s > bestNameS) {
        bestNameS = s;
        bestName = d;
      }
    }
    let bestInfo: Dir = 'S';
    let bestInfoS = -Infinity;
    for (const d of ALL_DIRS) {
      if (angDist(dirAngle(d), dirAngle(bestName)) < Math.PI / 2 - 1e-6) continue;
      const s = score(d, 52, 30) + (d === 'N' || d === 'S' ? 0.1 : 0);
      if (s > bestInfoS) {
        bestInfoS = s;
        bestInfo = d;
      }
    }
    out[id] = { name: bestName, info: bestInfo };
  }
  return out;
}

/** Text anchor and offset of a label on side d. `line` stacks lines away from the town. */
function anchorAt(p: Pt, d: Dir, line: number, lines: number): { x: number; y: number; anchor: 'start' | 'middle' | 'end' } {
  const v = DIRS[d];
  const gap = R + 6;
  const lh = 14;
  const anchor = v.x > 0.3 ? 'start' : v.x < -0.3 ? 'end' : 'middle';
  const x = p.x + v.x * gap;
  let y: number;
  if (v.y < -0.3) y = p.y + v.y * gap - (lines - 1 - line) * lh - 2; // above: last line nearest the town
  else if (v.y > 0.3) y = p.y + v.y * gap + 10 + line * lh; // below
  else y = p.y + 4 - ((lines - 1) * lh) / 2 + line * lh; // beside, centred
  return { x, y, anchor };
}

function edgeKey(a: string, b: string) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export const RoadGraph = memo(function RoadGraph({ map, start, goal, h, hBad, hEdited, view, algo = 'astar', showValues = true, onNode, nodeAction, ariaLabel, figure }: RoadGraphProps) {
  const place = useMemo(() => placeLabels(map), [map]);
  const centroid = useMemo(() => {
    const ps = Object.values(map.pos);
    return { x: ps.reduce((t, p) => t + p.x, 0) / ps.length, y: ps.reduce((t, p) => t + p.y, 0) / ps.length };
  }, [map]);

  const openBy = new Map((view?.open ?? []).map((r) => [r.node, r]));
  const closedBy = new Map((view?.closed ?? []).map((r) => [r.node, r]));
  const onPath = new Set(view?.path ?? []);
  const pathEdges = new Set<string>();
  if (view?.path) for (let i = 1; i < view.path.length; i++) pathEdges.add(edgeKey(view.path[i - 1], view.path[i]));
  const relax = new Map<string, StepUpdate>();
  for (const u of view?.updates ?? []) if (view?.popped) relax.set(edgeKey(view.popped, u.node), u);
  const replaced = new Set<string>();
  for (const u of view?.updates ?? []) if (u.kind === 'improve' && u.oldParent) replaced.add(edgeKey(u.node, u.oldParent));
  const pendingEdges = new Set<string>();
  if (view?.pending) for (const [a, b] of map.graph.edges) if (a === view.pending || b === view.pending) pendingEdges.add(edgeKey(a, b));

  const tree: { a: string; b: string; final: boolean }[] = [];
  for (const r of view?.closed ?? []) if (r.parent) tree.push({ a: r.node, b: r.parent, final: true });
  for (const r of view?.open ?? []) if (r.parent) tree.push({ a: r.node, b: r.parent, final: false });

  const P = (id: string) => map.pos[id];
  const key = (e: KeyboardEvent<SVGGElement>, id: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onNode?.(id);
    }
  };

  const valueText = (id: string): { text: string; tone: 'open' | 'closed' } | null => {
    if (!showValues) return null;
    const c = closedBy.get(id);
    if (c) return { text: `g ${num(c.g)}`, tone: 'closed' };
    const o = openBy.get(id);
    if (!o || view?.hideOpenValues) return null;
    const mark = o.change === 'improved' ? ' ↓' : '';
    if (algo === 'astar') return { text: `f ${num(o.f)}${mark}`, tone: 'open' };
    if (algo === 'bfs' || algo === 'dfs') return { text: `#${num(o.prio + 1)}`, tone: 'open' };
    return { text: `g ${num(o.g)}${mark}`, tone: 'open' };
  };

  return (
    <svg
      className={`plan-astar-svg${figure ? ' is-figure' : ''}${onNode ? ' is-interactive' : ''}`}
      viewBox={`0 0 ${map.vb.w} ${map.vb.h}`}
      width="100%"
      role="group"
      aria-label={ariaLabel}
    >
      {/* roads */}
      <g className="plan-astar-roads">
        {map.graph.edges.map(([a, b]) => {
          const k = edgeKey(a, b);
          const pa = P(a);
          const pb = P(b);
          return <line key={k} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} className={`plan-astar-road${pendingEdges.has(k) ? ' is-pending' : ''}`} />;
        })}
      </g>
      {/* parent links: dashed while tentative (child in Open), solid once final (child in Closed) */}
      <g>
        {tree.map(({ a, b, final }) => {
          const pa = P(a);
          const pb = P(b);
          return <line key={`t${a}`} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} className={final ? 'plan-astar-tree is-final' : 'plan-astar-tree'} />;
        })}
      </g>
      {/* the road whose parent link was just replaced */}
      {[...replaced].map((k) => {
        const [a, b] = k.split('|');
        const pa = P(a);
        const pb = P(b);
        const mx = (pa.x + pb.x) / 2;
        const my = (pa.y + pb.y) / 2;
        return (
          <g key={`x${k}`} className="plan-astar-replaced">
            <line x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} />
            <text x={mx} y={my + 5} textAnchor="middle">
              ✗
            </text>
          </g>
        );
      })}
      {/* roads relaxed this step */}
      {[...relax.entries()].map(([k, u]) => {
        const [a, b] = k.split('|');
        const pa = P(a);
        const pb = P(b);
        const cls = u.kind === 'add' || u.kind === 'improve' ? 'is-better' : u.kind === 'worse' ? 'is-worse' : 'is-closed';
        return <line key={`r${k}`} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} className={`plan-astar-relax ${cls}`} />;
      })}
      {/* final path */}
      {view?.path &&
        view.path.slice(1).map((id, i) => {
          const a = P(view.path![i]);
          const b = P(id);
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          const ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
          return (
            <g key={`p${i}`} className="plan-astar-path">
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
              <path d="M -7 -6 L 7 0 L -7 6 Z" transform={`translate(${mx} ${my}) rotate(${ang})`} />
            </g>
          );
        })}
      {/* road costs */}
      <g>
        {map.graph.edges.map(([a, b, w]) => {
          const pa = P(a);
          const pb = P(b);
          const mx = (pa.x + pb.x) / 2;
          const my = (pa.y + pb.y) / 2;
          const L = Math.hypot(pb.x - pa.x, pb.y - pa.y) || 1;
          let nx = -(pb.y - pa.y) / L;
          let ny = (pb.x - pa.x) / L;
          if ((mx + nx - centroid.x) ** 2 + (my + ny - centroid.y) ** 2 < (mx - nx - centroid.x) ** 2 + (my - ny - centroid.y) ** 2) {
            nx = -nx;
            ny = -ny;
          }
          const off = 11;
          const k = edgeKey(a, b);
          const hot = relax.has(k) || pathEdges.has(k) || pendingEdges.has(k);
          return (
            <text key={`c${k}`} x={mx + nx * off} y={my + ny * off + 4} textAnchor="middle" className={`plan-astar-cost${hot ? ' is-hot' : ''}`}>
              {num(w)}
            </text>
          );
        })}
      </g>
      {/* towns */}
      {map.graph.nodes.map(({ id }) => {
        const p = P(id);
        const isOpen = openBy.has(id);
        const isClosed = closedBy.has(id);
        const status = isClosed ? 'is-closed' : isOpen ? 'is-open' : 'is-idle';
        const popped = view?.popped === id;
        const pending = view?.pending === id;
        const flash = view?.flash?.node === id ? (view.flash.ok ? 'is-flash-ok' : 'is-flash-bad') : '';
        const pl = place[id];
        const longName = map.long(id);
        const role = id === start ? 'start' : id === goal ? 'goal' : '';
        const val = valueText(id);
        const hv = h ? h(id) : undefined;
        const nameLine = longName || role ? { text: longName ?? '', role } : null;
        const infoLines: { cls: string; text: string }[] = [];
        if (val) infoLines.push({ cls: `plan-astar-val is-${val.tone}`, text: val.text });
        if (hv !== undefined && Number.isFinite(hv))
          infoLines.push({ cls: `plan-astar-hval${hBad?.has(id) ? ' is-bad' : hEdited?.has(id) ? ' is-edited' : ''}`, text: `h ${num(hv)}${hBad?.has(id) ? ' !' : ''}` });
        const label = `${map.code(id)}${longName && longName !== map.code(id) ? ` ${longName}` : ''}${role ? `, ${role}` : ''}${isClosed ? ', in Closed' : isOpen ? ', in Open' : ''}${val ? `, ${val.text}` : ''}${hv !== undefined ? `, h ${num(hv)}` : ''}`;
        return (
          <g key={id}>
            <g
              className={`plan-astar-node ${status}${onPath.has(id) ? ' is-path' : ''}${popped ? ' is-popped' : ''}${pending ? ' is-pending' : ''} ${flash}`}
              transform={`translate(${p.x} ${p.y})`}
              {...(onNode
                ? {
                    role: 'button',
                    tabIndex: 0,
                    'aria-label': `${label}${nodeAction ? `. Tap to ${nodeAction}` : ''}`,
                    onClick: () => onNode(id),
                    onKeyDown: (e: KeyboardEvent<SVGGElement>) => key(e, id),
                  }
                : { 'aria-label': label })}
            >
              <circle r={26} className="plan-astar-hit" />
              {(popped || pending) && <circle r={R + 5} className="plan-astar-ring" />}
              {popped && <circle r={R + 5} className="plan-astar-pulse" />}
              <circle r={R} className="plan-astar-disc" />
              {role && <circle r={R + 3.5} className={`plan-astar-role is-${role}`} />}
              <text className="plan-astar-code" y={4.5} textAnchor="middle">
                {map.code(id)}
              </text>
            </g>
            {nameLine &&
              (() => {
                const a = anchorAt(p, pl.name, 0, 1);
                return (
                  <text x={a.x} y={a.y} textAnchor={a.anchor} className="plan-astar-name">
                    {nameLine.text}
                    {nameLine.role && (
                      <tspan className={`plan-astar-roletag is-${nameLine.role}`}>
                        {nameLine.text ? ' · ' : ''}
                        {nameLine.role}
                      </tspan>
                    )}
                  </text>
                );
              })()}
            {infoLines.map((ln, i) => {
              const a = anchorAt(p, pl.info, i, infoLines.length);
              return (
                <text key={i} x={a.x} y={a.y} textAnchor={a.anchor} className={ln.cls}>
                  {ln.text}
                </text>
              );
            })}
          </g>
        );
      })}
      {map.scale && !figure && (
        <g className="plan-astar-scalebar" transform={`translate(${map.vb.w - 20 - map.scale * 2} ${map.vb.h - 14})`}>
          <line x1={0} y1={0} x2={map.scale * 2} y2={0} />
          <line x1={0} y1={-4} x2={0} y2={4} />
          <line x1={map.scale * 2} y1={-4} x2={map.scale * 2} y2={4} />
          <text x={map.scale} y={-6} textAnchor="middle">
            2 km (to scale)
          </text>
        </g>
      )}
    </svg>
  );
});
