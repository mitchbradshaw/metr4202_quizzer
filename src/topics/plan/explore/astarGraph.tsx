// SVG road map for the A* activities: towns, roads with costs, h beside each town, and the search state
// (Open = frontier, Closed = expanded, parent links, the roads relaxed this step, the final path).
// Scales with its viewBox; towns are buttons (≥ 40 px touch targets) when `onNode` is given.
import { memo, useMemo, type KeyboardEvent } from 'react';
import type { Algo } from '../../../core/graph';
import type { MapDef } from './astarMaps';
import { num, type ClosedRow, type OpenRow, type StepUpdate } from './astarTable';
import { edgeKey, layoutLabels, numText, type InfoSlot } from './astarLabels';
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

/** Characters to reserve for the widest f/g or h line on this map ("f 13.8 ↓", "h 11.1 !"). */
function infoChars(map: MapDef, values: boolean, flags: boolean): number {
  const total = map.graph.edges.reduce((t, e) => t + e[2], 0);
  const digits = Math.max(numText(total).length, ...map.graph.edges.map((e) => numText(e[2]).length));
  return Math.max(values ? digits + 4 : 0, digits + 2 + (flags ? 2 : 0));
}

export const RoadGraph = memo(function RoadGraph({ map, start, goal, h, hBad, hEdited, view, algo = 'astar', showValues = true, onNode, nodeAction, ariaLabel, figure }: RoadGraphProps) {
  // Lines reserved beside every town: f/g (when values are shown) and h. Fixed per map and toggle, so labels never
  // jump while stepping; a line that has nothing to say this step is simply left blank.
  const slots: InfoSlot[] = [...(showValues && !figure ? (['val'] as const) : []), ...(h ? (['h'] as const) : [])];
  const slotKey = slots.join(',');
  const scaleW = map.scale && !figure ? map.scale * 2 : 0;
  const layout = useMemo(
    () =>
      layoutLabels(map, {
        start,
        goal,
        slots: slotKey ? (slotKey.split(',') as InfoSlot[]) : [],
        infoChars: infoChars(map, slotKey.includes('val'), !figure),
        scaleBar: scaleW ? { x0: map.vb.w - 26 - scaleW, y0: map.vb.h - 28, x1: map.vb.w - 14, y1: map.vb.h - 8 } : undefined,
      }),
    [map, start, goal, slotKey, figure, scaleW]
  );

  // Static figures are cropped to what is drawn (towns and labels), so a flat map does not leave a blank band.
  const vb = useMemo(() => {
    if (!figure) return { text: `0 0 ${map.vb.w} ${map.vb.h}`, w: map.vb.w };
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    const grow = (a: number, b: number, c: number, d: number) => {
      x0 = Math.min(x0, a);
      y0 = Math.min(y0, b);
      x1 = Math.max(x1, c);
      y1 = Math.max(y1, d);
    };
    for (const n of map.graph.nodes) {
      const p = map.pos[n.id];
      grow(p.x - 24, p.y - 24, p.x + 24, p.y + 24);
    }
    for (const sp of [...Object.values(layout.name), ...Object.values(layout.info), ...Object.values(layout.cost)]) if (sp) grow(sp.box.x0, sp.box.y0, sp.box.x1, sp.box.y1);
    x0 = Math.max(0, x0 - 6);
    y0 = Math.max(0, y0 - 6);
    x1 = Math.min(map.vb.w, x1 + 6);
    y1 = Math.min(map.vb.h, y1 + 6);
    return { text: `${x0.toFixed(1)} ${y0.toFixed(1)} ${(x1 - x0).toFixed(1)} ${(y1 - y0).toFixed(1)}`, w: x1 - x0 };
  }, [figure, map, layout]);

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
      viewBox={vb.text}
      width="100%"
      style={figure ? { maxWidth: `${Math.round(vb.w)}px` } : undefined}
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
          const k = edgeKey(a, b);
          const sp = layout.cost[k];
          const hot = relax.has(k) || pathEdges.has(k) || pendingEdges.has(k);
          return (
            <text key={`c${k}`} x={sp.tx} y={sp.ty} textAnchor={sp.anchor} className={`plan-astar-cost${hot ? ' is-hot' : ''}`}>
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
        const longName = map.long(id);
        const role = id === start ? 'start' : id === goal ? 'goal' : '';
        const val = valueText(id);
        const hv = h ? h(id) : undefined;
        const nameLine = longName || role ? { text: longName ?? '', role } : null;
        const info = layout.info[id];
        const infoLines: { cls: string; text: string; y: number }[] = [];
        if (info && val && info.lineY.val !== undefined) infoLines.push({ cls: `plan-astar-val is-${val.tone}`, text: val.text, y: info.lineY.val });
        if (info && hv !== undefined && Number.isFinite(hv) && info.lineY.h !== undefined)
          infoLines.push({ cls: `plan-astar-hval${hBad?.has(id) ? ' is-bad' : hEdited?.has(id) ? ' is-edited' : ''}`, text: `h ${num(hv)}${hBad?.has(id) ? ' !' : ''}`, y: info.lineY.h });
        const nameSpot = layout.name[id];
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
                    'aria-label': `${label}${nodeAction ? `. Click or press Enter to ${nodeAction}` : ''}`,
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
              nameSpot &&
              (() => {
                return (
                  <text x={nameSpot.tx} y={nameSpot.ty} textAnchor={nameSpot.anchor} className="plan-astar-name">
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
            {info &&
              infoLines.map((ln, i) => (
                <text key={i} x={info.tx} y={ln.y} textAnchor={info.anchor} className={ln.cls}>
                  {ln.text}
                </text>
              ))}
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
