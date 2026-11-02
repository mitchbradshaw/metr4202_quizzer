// SVG overlay pieces for the "PRM, RRT and RRT*" simulation: the anatomy of one RRT / RRT* iteration or one PRM
// vertex insertion (staged with CSS animation delays so a single step reads in order: sample → nearest → steer →
// neighbourhood → choose parent → rewire), and the step tables in the exam's format. Labels are placed greedily
// so they do not cover each other or the markers.
import type { CSSProperties, ReactNode } from 'react';
import { dist, type Vec2 } from '../../../core/geom2d';
import type { GrowRun, StepLog } from './samplingEngine';
import type { PrmRun } from './samplingPrm';
import { SCALE, VIEW, sx, sy } from './samplingDraw';
import { Halo, SubLabel } from './rrtFigures';

export const f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : '–');
/** Decimals needed (2 to 4) to tell two costs apart, so a rewire never reads "4.87 → 4.87". */
export const dpApart = (a: number, b: number) => {
  let dp = 2;
  while (dp < 4 && Number.isFinite(a) && Number.isFinite(b) && a !== b && a.toFixed(dp) === b.toFixed(dp)) dp++;
  return dp;
};
/** A cost with `dp` decimals ('–' if there is none). */
export const fdp = (x: number, dp: number) => (Number.isFinite(x) ? x.toFixed(dp) : '–');
/** "10.10 → 8.94" with enough decimals to show the change. */
export const fromTo = (a: number, b: number, arrow = ' → ') => {
  const dp = dpApart(a, b);
  return `${a.toFixed(dp)}${arrow}${b.toFixed(dp)}`;
};

/** Vertex name in HTML: x with the node id as a subscript. */
export function V({ id }: { id: number | string }) {
  return (
    <span className="plan-sampling-v">
      <i>x</i>
      <sub>{id}</sub>
    </span>
  );
}

type Pt = { x: number; y: number };
const P = (p: Vec2): Pt => ({ x: sx(p.x), y: sy(p.y) });
const seg = (a: Pt, b: Pt) => `M${a.x.toFixed(1)} ${a.y.toFixed(1)}L${b.x.toFixed(1)} ${b.y.toFixed(1)}`;

/** Greedy label placement: try directions around an anchor until the label's box overlaps nothing placed so far. */
export class Placer {
  private boxes: [number, number, number, number][] = [];
  /** Keep labels off a marker (circle of radius r). */
  block(p: Pt, r: number) {
    this.boxes.push([p.x - r, p.y - r, p.x + r, p.y + r]);
  }
  private free(b: [number, number, number, number]) {
    if (b[0] < 2 || b[1] < 2 || b[2] > VIEW - 2 || b[3] > VIEW - 2) return false;
    return this.boxes.every((o) => b[2] <= o[0] || b[0] >= o[2] || b[3] <= o[1] || b[1] >= o[3]);
  }
  /**
   * Centre of a label `chars` characters long near `a`, preferably in direction `dir` (a vector), `gap` units
   * from it. Returns the text position for a middle-anchored label.
   */
  place(a: Pt, chars: number, dir: Pt, gap = 7): Pt {
    return this.search(a, chars, dir, gap, true)!;
  }
  /** Like place, but gives up (null) rather than overlap: for labels the tables repeat anyway. */
  tryPlace(a: Pt, chars: number, dir: Pt, gap = 7): Pt | null {
    return this.search(a, chars, dir, gap, false);
  }
  private search(a: Pt, chars: number, dir: Pt, gap: number, force: boolean): Pt | null {
    const w = chars * 6.7 + 4;
    const h = 14;
    const base = Math.atan2(dir.y, dir.x) || 0;
    let first: [number, number, number, number] | null = null;
    for (const extra of [0, 9]) {
      for (const da of [0, 0.55, -0.55, 1.1, -1.1, 1.65, -1.65, 2.3, -2.3, Math.PI]) {
        const ux = Math.cos(base + da);
        const uy = Math.sin(base + da);
        const reach = gap + extra + 0.5 * (Math.abs(ux) * w + Math.abs(uy) * h);
        const cx = a.x + ux * reach;
        const cy = a.y + uy * reach;
        const b: [number, number, number, number] = [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2];
        if (!first) first = b;
        if (this.free(b)) {
          this.boxes.push(b);
          return { x: cx, y: cy + 4 };
        }
      }
    }
    if (!force) return null;
    const b = first!;
    this.boxes.push(b);
    return { x: (b[0] + b[2]) / 2, y: (b[1] + b[3]) / 2 + 4 };
  }
}

const away = (a: Pt, from: Pt): Pt => {
  const dx = a.x - from.x;
  const dy = a.y - from.y;
  return Math.hypot(dx, dy) > 1e-6 ? { x: dx, y: dy } : { x: 1, y: -1 };
};

function XMark({ at, className }: { at: Pt; className: string }) {
  return (
    <g className={className}>
      <circle cx={at.x} cy={at.y} r={7} className="plan-sampling-xmark-bg" />
      <path d={`M${at.x - 3.5} ${at.y - 3.5}L${at.x + 3.5} ${at.y + 3.5}M${at.x + 3.5} ${at.y - 3.5}L${at.x - 3.5} ${at.y + 3.5}`} className="plan-sampling-xmark" />
    </g>
  );
}

function Wrap({ st, children }: { st: number; children: ReactNode }) {
  return (
    <g className="plan-sampling-step" style={{ '--plan-sampling-st': `${st}s` } as CSSProperties}>
      {children}
    </g>
  );
}

export interface CandRow {
  id: number;
  c: number;
  d: number;
  total: number;
  free: boolean;
  nearest: boolean;
  parent: boolean;
}

/** Choose-parent rows of one RRT* iteration, cheapest first. */
export function candRows(run: GrowRun, ev: StepLog): CandRow[] {
  const rows: CandRow[] = [];
  for (let k = 0; k < ev.candIds.length; k++) {
    const id = ev.candIds[k];
    const d = dist({ x: run.px[id], y: run.py[id] }, ev.steered);
    rows.push({ id, d, total: ev.candTotals[k], c: ev.candTotals[k] - d, free: !!ev.candFree[k], nearest: id === ev.nearest, parent: id === ev.parent });
  }
  return rows.sort((a, b) => Number(b.free) - Number(a.free) || a.total - b.total || a.id - b.id);
}

/** One RRT / RRT* iteration drawn on top of the tree as it was before it. `st` = seconds per stage. */
export function TreeStepOverlay({ run, i, star, st }: { run: GrowRun; i: number; star: boolean; st: number }) {
  const ev = run.log[i - 1];
  if (!ev) return null;
  const at = (id: number) => ({ x: sx(run.px[id]), y: sy(run.py[id]) });
  const S = P(ev.sample);
  const N = at(ev.nearest);
  const X = P(ev.steered);
  const added = ev.added >= 0;
  const sampleIsNew = Math.hypot(S.x - X.x, S.y - X.y) < 1;
  const L = new Placer();
  L.block(X, 8);
  L.block(N, 10);
  L.block(S, 8);
  const out: ReactNode[] = [];
  const labels: ReactNode[] = [];
  /** A label beside `a`; optional ones are left out when they would overlap (the tables list every value). */
  const tag = (key: string, a: Pt, text: string, dir: Pt, cls: string, optional = false) => {
    const q = optional ? L.tryPlace(a, text.length, dir) : L.place(a, text.length, dir);
    if (!q) return;
    labels.push(
      <Halo key={key} x={q.x} y={q.y} className={`plan-sampling-tag ${cls}`}>
        {text}
      </Halo>
    );
  };
  // x_new's own label first (the most important one).
  const xl = L.place(X, 4, away(X, N), 6);
  const xLabel = <SubLabel key="xnewlab" x={xl.x} y={xl.y} sub="new" anchor="middle" className="plan-sampling-svglabel plan-sampling-xnewlabel plan-sampling-halo" />;

  // 1. the random sample (and the ray from the nearest node towards it)
  if (!sampleIsNew) out.push(<path key="ray" d={seg(N, S)} className="plan-sampling-ray plan-sampling-s1" />);
  out.push(
    <g key="rand" className="plan-sampling-s1">
      <circle cx={S.x} cy={S.y} r={6} className="plan-sampling-rand" />
      <path d={`M${S.x - 3.5} ${S.y}h7M${S.x} ${S.y - 3.5}v7`} className="plan-sampling-rand" />
    </g>
  );
  // 2. the nearest node
  out.push(<circle key="near" cx={N.x} cy={N.y} r={8} className="plan-sampling-nearring plan-sampling-s2" />);

  // 3. steer one step towards the sample (or stop: duplicate / blocked)
  if (ev.dup || !added) {
    if (ev.dup) tag('dup', N, 'already in the tree: nothing added', { x: 1, y: 1 }, 'plan-sampling-tag-bad plan-sampling-s3');
    else {
      const m = { x: (N.x + X.x) / 2, y: (N.y + X.y) / 2 };
      out.push(<path key="try" d={seg(N, X)} className="plan-sampling-blocked plan-sampling-s3" />);
      out.push(<XMark key="tryx" at={m} className="plan-sampling-s3" />);
      out.push(<circle key="xrej" cx={X.x} cy={X.y} r={5} className="plan-sampling-xrej plan-sampling-s3" />);
      tag('rejlab', X, 'edge blocked: discarded', away(X, N), 'plan-sampling-tag-bad plan-sampling-s3');
    }
    tag('nearlab', N, 'nearest', away(N, S), 'plan-sampling-tag-m1 plan-sampling-s2');
    tag('randlab', S, ev.goalSample ? 'goal sample' : 'random sample', away(S, N), 'plan-sampling-tag-m2 plan-sampling-s1');
    return (
      <Wrap st={st}>
        {out}
        {labels}
      </Wrap>
    );
  }
  out.push(<path key="rrt" d={seg(N, X)} className="plan-sampling-rrt plan-sampling-s3" />);

  // 4. RRT*: the neighbourhood and every candidate parent
  let rows: CandRow[] = [];
  if (star) {
    out.push(<circle key="hood" cx={X.x} cy={X.y} r={ev.radius * SCALE} className="plan-sampling-hood plan-sampling-s4" />);
    rows = candRows(run, ev);
    for (const r of rows) {
      L.block(at(r.id), 4);
      if (r.nearest || r.parent) continue;
      out.push(<path key={`c${r.id}`} d={seg(at(r.id), X)} className={`${r.free ? 'plan-sampling-cand' : 'plan-sampling-blocked'} plan-sampling-s4`} />);
    }
  }

  // 5. the chosen parent edge (RRT: the nearest node; RRT*: the cheapest c + d)
  const Pp = at(ev.parent);
  out.push(<path key="chosen" d={seg(Pp, X)} pathLength={1} className={`${ev.badEdge ? 'plan-sampling-badnew' : star ? 'plan-sampling-chosen' : 'plan-sampling-rrtnew'} plan-sampling-grow plan-sampling-s5`} />);
  if (star) {
    // c + d next to the winner, the nearest node and the cheapest few others.
    const shown = rows.filter((r) => r.parent || r.nearest);
    for (const r of rows) if (r.free && shown.length < 7 && !shown.includes(r)) shown.push(r);
    // Enough decimals that no runner-up reads the same as the winner.
    const win = rows.find((r) => r.parent)?.total ?? NaN;
    const dp = Math.max(2, ...shown.map((r) => (r.parent ? 2 : dpApart(r.total, win))));
    for (const r of shown) {
      const cls = r.parent ? 'plan-sampling-tag-m3' : r.nearest ? 'plan-sampling-tag-m1' : 'plan-sampling-muted';
      tag(`t${r.id}`, at(r.id), r.parent ? `${fdp(r.total, dp)} ✓` : fdp(r.total, dp), away(at(r.id), X), `${cls} plan-sampling-s5`, !r.parent && !r.nearest);
    }
  } else tag('nearlab', N, 'nearest', away(N, X), 'plan-sampling-tag-m1 plan-sampling-s2');
  if (ev.badEdge) tag('badlab', { x: (Pp.x + X.x) / 2, y: (Pp.y + X.y) / 2 }, 'through the obstacle!', { x: 1, y: -1 }, 'plan-sampling-tag-bad plan-sampling-s5');

  // 6. RRT*: rewire (old edge removed, new edge from x_new)
  for (const w of ev.rewires) {
    if (!w.done) continue;
    const C = at(w.id);
    const O = at(w.oldParent);
    out.push(<path key={`rm${w.id}`} d={seg(O, C)} className="plan-sampling-removed plan-sampling-s6" />);
    out.push(<XMark key={`rmx${w.id}`} at={{ x: (O.x + C.x) / 2, y: (O.y + C.y) / 2 }} className="plan-sampling-s6" />);
    out.push(<path key={`rw${w.id}`} d={seg(X, C)} pathLength={1} className="plan-sampling-rewired plan-sampling-grow plan-sampling-s6" />);
    tag(`rwl${w.id}`, C, fromTo(w.current, w.via, '→'), away(C, X), 'plan-sampling-tag-m4 plan-sampling-s6', true);
  }
  if (!sampleIsNew) tag('randlab', S, ev.goalSample ? 'goal sample' : 'random sample', away(S, N), 'plan-sampling-tag-m2 plan-sampling-s1');

  // x_new on top (stage 3)
  out.push(
    <g key="xnew" className="plan-sampling-s3">
      <circle cx={X.x} cy={X.y} r={5.5} className="plan-sampling-xnew" />
    </g>
  );
  return (
    <Wrap st={st}>
      {out}
      <g className="plan-sampling-s3">{xLabel}</g>
      {labels}
    </Wrap>
  );
}

/** One PRM vertex insertion: discarded samples, the new vertex, its connection radius and every edge tried. */
export function PrmStepOverlay({ prm, i, st }: { prm: PrmRun; i: number; st: number }) {
  const v = i - 1;
  const lg = prm.log[v];
  if (!lg) return null;
  const at = (id: number) => ({ x: sx(prm.px[id]), y: sy(prm.py[id]) });
  const X = at(v);
  const L = new Placer();
  L.block(X, 8);
  for (let k = 0; k < lg.cand.length; k++) L.block(at(lg.cand[k]), 4);
  const out: ReactNode[] = [];
  const labels: ReactNode[] = [];
  lg.rejected.forEach((q, k) => {
    const R = P(q);
    L.block(R, 6);
    out.push(<path key={`rej${k}`} d={`M${R.x - 4} ${R.y - 4}L${R.x + 4} ${R.y + 4}M${R.x + 4} ${R.y - 4}L${R.x - 4} ${R.y + 4}`} className="plan-sampling-rejmark plan-sampling-s1" />);
  });
  const xl = L.place(X, 4, { x: -1, y: -1 }, 6);
  if (lg.rejected.length) {
    const R = P(lg.rejected[0]);
    const q = L.place(R, 24, away(R, X));
    labels.push(
      <Halo key="rejlab" x={q.x} y={q.y} className="plan-sampling-tag plan-sampling-tag-bad plan-sampling-s1">
        in an obstacle: discarded
      </Halo>
    );
  }
  if (prm.spec.connect === 'radius') out.push(<circle key="hood" cx={X.x} cy={X.y} r={prm.spec.radius * SCALE} className="plan-sampling-hood plan-sampling-s2" />);
  for (let k = 0; k < lg.cand.length; k++) {
    const A = at(lg.cand[k]);
    if (lg.ok[k]) {
      const bad = prm.spec.check === 'endpoint' && prm.ebad[edgeIndex(prm, lg.cand[k], v)] === 1;
      out.push(<path key={`e${k}`} d={seg(A, X)} pathLength={1} className={`${bad ? 'plan-sampling-badnew' : 'plan-sampling-prmedge'} plan-sampling-grow plan-sampling-s3`} />);
    } else {
      out.push(<path key={`e${k}`} d={seg(A, X)} className="plan-sampling-blocked plan-sampling-s3" />);
      out.push(<XMark key={`x${k}`} at={{ x: (A.x + X.x) / 2, y: (A.y + X.y) / 2 }} className="plan-sampling-s3" />);
    }
    if (prm.spec.connect === 'k') {
      const q = L.place(A, String(k + 1).length, away(A, X), 4);
      labels.push(
        <Halo key={`k${k}`} x={q.x} y={q.y} className="plan-sampling-tag plan-sampling-muted plan-sampling-s3">
          {String(k + 1)}
        </Halo>
      );
    }
  }
  out.push(<circle key="v" cx={X.x} cy={X.y} r={5.5} className="plan-sampling-xnew plan-sampling-s2" />);
  return (
    <Wrap st={st}>
      {out}
      <g className="plan-sampling-s2">
        <SubLabel x={xl.x} y={xl.y} sub={String(v)} anchor="middle" className="plan-sampling-svglabel plan-sampling-xnewlabel plan-sampling-halo" />
      </g>
      {labels}
    </Wrap>
  );
}

function edgeIndex(prm: PrmRun, a: number, b: number): number {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  for (let e = prm.edgesAt[hi]; e < prm.edgesAt[hi + 1]; e++) if (prm.ea[e] === lo && prm.eb[e] === hi) return e;
  return -1;
}

/** The exam's two RRT* tables for one iteration: choose parent ("to" x_new) and rewire ("from" x_new). */
export function StarTables({ run, i }: { run: GrowRun; i: number }) {
  const ev = run.log[i - 1];
  if (!ev || ev.added < 0) return null;
  const all = candRows(run, ev);
  const rows = all.slice(0, 5);
  const win = all.find((r) => r.parent)?.total ?? NaN;
  const tdp = Math.max(2, ...rows.map((r) => (r.parent || !r.free ? 2 : dpApart(r.total, win))));
  for (const r of all) if ((r.nearest || r.parent) && !rows.includes(r)) rows.push(r);
  const more = all.length - rows.length;
  const rw = ev.rewires
    .map((w) => ({ ...w, better: w.via < w.current - 1e-12 }))
    .sort((a, b) => Number(b.done) - Number(a.done) || Number(b.better) - Number(a.better) || b.current - b.via - (a.current - a.via));
  const rwRows = rw.slice(0, 5);
  const restDone = rw.slice(rwRows.length).filter((w) => w.done).length;
  return (
    <div className="plan-sampling-tables">
      <table className="table plan-sampling-table" aria-label="Choose parent for this iteration">
        <thead>
          <tr>
            <th>
              to <V id="new" />
            </th>
            <th>
              <i>c</i>(<i>x</i>)
            </th>
            <th>
              <i>d</i>
            </th>
            <th>
              <i>c</i> + <i>d</i>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={r.parent ? 'plan-sampling-rowpick' : r.nearest ? 'plan-sampling-rownear' : undefined}>
              <td>
                <V id={r.id} />
                {r.nearest && <span className="plan-sampling-flag plan-sampling-flag-m1">nearest</span>}
                {r.parent && <span className="plan-sampling-flag plan-sampling-flag-m3">parent</span>}
              </td>
              <td className="mono">{f2(r.c)}</td>
              <td className="mono">{f2(r.d)}</td>
              <td className="mono">{r.free ? <b className={r.parent ? 'plan-sampling-pick' : undefined}>{fdp(r.total, tdp)}</b> : <span className="plan-sampling-no">blocked</span>}</td>
            </tr>
          ))}
          {more > 0 && (
            <tr>
              <td colSpan={4} className="muted small">
                + {more} more (dearer or blocked)
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <table className="table plan-sampling-table" aria-label="Rewire for this iteration">
        <thead>
          <tr>
            <th>
              from <V id="new" />
            </th>
            <th>
              <i>c</i>(<V id="new" />) + <i>d</i>
            </th>
            <th>
              <i>c</i>(<i>x</i>)
            </th>
            <th>rewire?</th>
          </tr>
        </thead>
        <tbody>
          {rwRows.map((w) => (
            <tr key={w.id} className={w.done ? 'plan-sampling-rowrewire' : undefined}>
              <td>
                <V id={w.id} />
              </td>
              <td className="mono">{fdp(w.via, dpApart(w.via, w.current))}</td>
              <td className="mono">{fdp(w.current, dpApart(w.via, w.current))}</td>
              <td>{w.done ? <b className="plan-sampling-yes">✓ yes</b> : w.better ? <span className="plan-sampling-no">edge blocked</span> : <span className="muted">✗ no</span>}</td>
            </tr>
          ))}
          {!rwRows.length && (
            <tr>
              <td colSpan={4} className="muted small">
                No other neighbours to test.
              </td>
            </tr>
          )}
          {rw.length > rwRows.length && (
            <tr>
              <td colSpan={4} className="muted small">
                + {rw.length - rwRows.length} more{restDone ? ` (${restDone} rewired)` : ', none rewired'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
