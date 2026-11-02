// Grid search lab: paint walls and mud, drag S and G, then step BFS, DFS, Dijkstra, A* or greedy best-first
// through Open and Closed. The displayed trace comes from core/graph.ts graphSearch (the same code as the
// exam-mode checker); the "compare every algorithm" table uses gridEngine's fastSearch, which a self-test
// proves returns exactly the same expansions, so it can be recomputed on every brush stroke.
import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ExploreItem } from '../../../engine/types';
import { graphSearch, gridNeighbours, type Algo, type NeighbourUpdate, type SearchResult } from '../../../core/graph';
import { Button, Callout, More, Readout, Readouts, Segmented, Toggle } from '../../../ui/kit';
import { StepControls, useStepper } from '../../../ui/stepper';
import { PredictReveal } from '../../../ui/PredictReveal';
import { Rich, TeX } from '../../../ui/Rich';
import { completeChallenge, useProgress } from '../../../app/store';
import { useWidth } from '../../../anim/hooks';
import {
  MUD,
  WALL,
  cellLabel,
  cellOfId,
  costToGoGrid,
  emptyGrid,
  fastSearch,
  fmtCost,
  heuristicArray,
  idOfCell,
  pathSteps,
  presetById,
  sameOrder,
  toGridMap,
  type FastResult,
  type Grid,
  type GridHeuristic,
  type PresetId,
} from './gridEngine';
import {
  CELL,
  CellChip,
  GridLegend,
  GridView,
  MapBar,
  cellX,
  cellY,
  cellsPath,
  centreX,
  centreY,
  centresPath,
  parentArrows,
  revealGrid,
  stepArrow,
  viewW,
  type Tool,
} from './gridCommon';

export const meta: Omit<ExploreItem, 'component'> = {
  id: 'grid',
  title: 'Grid search lab: BFS, DFS, Dijkstra, A*',
  summary:
    'Paint walls and mud, drag S and G, then step BFS, DFS, Dijkstra, A* or greedy best-first through Open and Closed, with $f = g + h$ on the cells and the exam’s Open list beside the map.',
  notice:
    'Same map, same S and G: watch what each algorithm pops next (oldest, newest, lowest $g$, lowest $f = g + h$ or lowest $h$), how many cells it opens before G is popped, and whether its path is the cheapest.',
  challenge: { id: 'plan-grid-greedy-trap', title: 'Edit a map until greedy best-first’s path costs at least 1.5 × the optimum' },
  minutes: 10,
};

const CHALLENGE_ID = 'plan-grid-greedy-trap';

type HSel = Extract<GridHeuristic, 'zero' | 'manhattan' | 'euclidean' | 'octile'>;
type Nums = 'off' | 'g' | 'h' | 'f' | 'all';

const ALGO_SHORT: Record<Algo, string> = { bfs: 'BFS', dfs: 'DFS', dijkstra: 'Dijkstra', astar: 'A*', greedy: 'Greedy' };
const H_LABEL: Record<HSel, string> = { zero: 'h = 0', manhattan: 'Manhattan', euclidean: 'Euclidean', octile: 'Octile' };
const H_TEX: Record<HSel, string> = {
  zero: 'h(n) = 0',
  manhattan: 'h(n) = |\\Delta x| + |\\Delta y|',
  euclidean: 'h(n) = \\sqrt{\\Delta x^2 + \\Delta y^2}',
  octile: 'h(n) = \\max(|\\Delta x|,|\\Delta y|) + (\\sqrt2 - 1)\\min(|\\Delta x|,|\\Delta y|)',
};

const POPS: Record<Algo, string> = {
  bfs: 'Open is a FIFO queue: pop the **oldest** entry. Edge costs play no part in the order.',
  dfs: 'Open is a stack (LIFO): pop the **newest** entry, so it dives down one branch.',
  dijkstra: 'Pop the lowest $g(n)$: the cheapest cost to arrive from S so far.',
  astar: 'Pop the lowest $f(n) = g(n) + h(n)$: cost so far plus the estimate of the cost to go.',
  greedy: 'Pop the lowest $h(n)$: whatever *looks* closest to G. $g$ is ignored when ordering.',
};

/** Which Open-list column decides the order. */
const KEY_COL: Record<Algo, 'order' | 'g' | 'h' | 'f'> = { bfs: 'order', dfs: 'order', dijkstra: 'g', astar: 'f', greedy: 'h' };

// ------------------------------------------------------------------ the numbers quoted by the predictions

interface Facts {
  wallGreedy: FastResult;
  wallAstar: FastResult;
  mudBfs: FastResult;
  mudDij: FastResult;
  dfsDfs: FastResult;
  dfsBfs: FastResult;
  dfsAstar: FastResult;
  mazeBfs: FastResult;
}
let factsCache: Facts | null = null;
function facts(): Facts {
  if (factsCache) return factsCache;
  const wall = presetById('wallgap').build();
  const mud = presetById('mud').build();
  const dfs = presetById('dfs').build();
  const maze = presetById('maze').build();
  const man = (g: Grid) => ({ h: heuristicArray(g, 'manhattan'), tieBreak: 'h' as const });
  factsCache = {
    wallGreedy: fastSearch(wall, 'greedy', false, man(wall)),
    wallAstar: fastSearch(wall, 'astar', false, man(wall)),
    mudBfs: fastSearch(mud, 'bfs', false, man(mud)),
    mudDij: fastSearch(mud, 'dijkstra', false, man(mud)),
    dfsDfs: fastSearch(dfs, 'dfs', false, man(dfs)),
    dfsBfs: fastSearch(dfs, 'bfs', false, man(dfs)),
    dfsAstar: fastSearch(dfs, 'astar', false, man(dfs)),
    mazeBfs: fastSearch(maze, 'bfs', false, man(maze)),
  };
  return factsCache;
}

// ------------------------------------------------------------------ the state at one step of the trace

interface OpenRow {
  k: number;
  g: number;
  h: number;
  parent: number;
}
interface StepView {
  /** 0 not reached, 1 Open, 2 Closed. */
  status: Uint8Array;
  g: Float64Array;
  h: Float64Array;
  parent: Int32Array;
  open: OpenRow[];
  closedCount: number;
  current: number;
  updates: (NeighbourUpdate & { k: number })[];
  isGoal: boolean;
}

function stepView(grid: Grid, tr: SearchResult, i: number, H: Float64Array, useH: boolean): StepView {
  const n = grid.cols * grid.rows;
  const status = new Uint8Array(n);
  const g = new Float64Array(n).fill(NaN);
  const h = new Float64Array(n).fill(NaN);
  const parent = new Int32Array(n).fill(-1);
  const step = i > 0 ? tr.steps[i - 1] : null;
  const openRaw = step ? step.open : tr.initialOpen;
  const closedRaw = step ? step.closed : [];
  for (const e of closedRaw) {
    const k = cellOfId(grid, e.node);
    status[k] = 2;
    g[k] = e.g;
    h[k] = useH ? H[k] : 0;
    parent[k] = e.parent === null ? -1 : cellOfId(grid, e.parent);
  }
  const open: OpenRow[] = openRaw.map((e) => {
    const k = cellOfId(grid, e.node);
    const p = e.parent === null ? -1 : cellOfId(grid, e.parent);
    status[k] = 1;
    g[k] = e.g;
    h[k] = e.h;
    parent[k] = p;
    return { k, g: e.g, h: e.h, parent: p };
  });
  return {
    status,
    g,
    h,
    parent,
    open,
    closedCount: closedRaw.length,
    current: step ? cellOfId(grid, step.expanded) : -1,
    updates: step ? step.updates.map((u) => ({ ...u, k: cellOfId(grid, u.node) })) : [],
    isGoal: !!step?.isGoal,
  };
}

/** Parent chain from k back to the start, as cell indices from start to k. */
function chain(parent: Int32Array, k: number): number[] {
  const out: number[] = [];
  for (let q = k, guard = 0; q >= 0 && guard < 2000; q = parent[q], guard++) out.unshift(q);
  return out;
}

// ------------------------------------------------------------------ compare every algorithm

interface CompareRow {
  key: string;
  label: string;
  /** Second line under the name (the heuristic). */
  sub?: string;
  algo: Algo;
  h: HSel;
  res: FastResult;
}

/** The informative heuristic for the A* and greedy rows: the chosen one, or the tight one when h = 0 is chosen. */
const informative = (hSel: HSel, diag: boolean): HSel => (hSel !== 'zero' ? hSel : diag ? 'octile' : 'manhattan');

function compareAll(grid: Grid, diag: boolean, hSel: HSel): { rows: CompareRow[]; opt: number } {
  const hInf = informative(hSel, diag);
  const Hs = heuristicArray(grid, hInf);
  const H0 = heuristicArray(grid, 'zero');
  const run = (algo: Algo, H: Float64Array) => fastSearch(grid, algo, diag, { h: H, tieBreak: 'h' });
  const rows: CompareRow[] = [
    { key: 'bfs', label: 'BFS', algo: 'bfs', h: 'zero', res: run('bfs', H0) },
    { key: 'dfs', label: 'DFS', algo: 'dfs', h: 'zero', res: run('dfs', H0) },
    { key: 'dijkstra', label: 'Dijkstra', algo: 'dijkstra', h: 'zero', res: run('dijkstra', H0) },
    { key: 'astar0', label: 'A*', sub: 'h = 0', algo: 'astar', h: 'zero', res: run('astar', H0) },
    { key: 'astar', label: 'A*', sub: H_LABEL[hInf], algo: 'astar', h: hInf, res: run('astar', Hs) },
    { key: 'greedy', label: 'Greedy', sub: H_LABEL[hInf], algo: 'greedy', h: hInf, res: run('greedy', Hs) },
  ];
  return { rows, opt: rows[2].res.cost };
}

// ------------------------------------------------------------------ component

export default function GridSearch() {
  const [grid, setGrid] = useState<Grid>(() => presetById('wallgap').build());
  const [preset, setPreset] = useState<PresetId | 'custom'>('wallgap');
  const [edited, setEdited] = useState(false);
  const [algo, setAlgoRaw] = useState<Algo>('astar');
  const [diag, setDiagRaw] = useState(false);
  const [hSel, setHSelRaw] = useState<HSel>('manhattan');
  const [tool, setTool] = useState<Tool>('wall');
  const [nums, setNums] = useState<Nums>('off');
  const [arrows, setArrows] = useState(false);
  const [wide, setWide] = useState(false);
  const [inspect, setInspect] = useState<number | null>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const [svgWrap, wrapW] = useWidth<HTMLDivElement>(600);
  const challengeDone = !!useProgress().challenges[CHALLENGE_ID];

  // Heavy work follows a deferred copy of the map, so painting stays smooth.
  const dgrid = useDeferredValue(grid);
  const useH = algo === 'astar' || algo === 'greedy';
  const H = useMemo(() => heuristicArray(dgrid, hSel), [dgrid, hSel]);
  const trace = useMemo(() => {
    const nb = gridNeighbours(toGridMap(dgrid), diag);
    return graphSearch(nb, idOfCell(dgrid, dgrid.start), idOfCell(dgrid, dgrid.goal), algo, { h: (id) => H[cellOfId(dgrid, id)], tieBreak: 'h' });
  }, [dgrid, diag, algo, H]);
  const cmp = useMemo(() => compareAll(dgrid, diag, hSel), [dgrid, diag, hSel]);
  const hStar = useMemo(() => costToGoGrid(dgrid, diag), [dgrid, diag]);
  const peakOpen = useMemo(() => Math.max(trace.initialOpen.length, ...trace.steps.map((s) => s.open.length)), [trace]);

  const N = trace.steps.length;
  const st = useStepper(N, { speed: 30 });

  // What to do with the step index when a new trace arrives: replay it, or jump to the result. Wait until
  // the deferred map has caught up, so a preset + algorithm change replays the new map, not the old one.
  const intent = useRef<'play' | 'end' | null>('play');
  useLayoutEffect(() => {
    if (dgrid !== grid) return;
    const it = intent.current;
    intent.current = null;
    if (it === 'end') {
      st.pause();
      st.setI(N);
    } else if (it === 'play') {
      st.setI(0);
      st.play();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trace]);

  const setAlgo = (a: Algo) => {
    if (a === algo) return;
    intent.current = 'play';
    setAlgoRaw(a);
  };
  const setDiag = (d: boolean) => {
    if (d === diag) return;
    intent.current = 'play';
    setDiagRaw(d);
    // Keep the heuristic admissible and tight when the motion model changes.
    if (d && hSel === 'manhattan') setHSelRaw('octile');
    if (!d && hSel === 'octile') setHSelRaw('manhattan');
  };
  const setHSel = (h: HSel) => {
    if (h === hSel) return;
    if (useH) intent.current = 'play';
    setHSelRaw(h);
  };
  const onMapChange = useCallback((g: Grid) => {
    intent.current = 'end';
    setGrid(g);
    setPreset('custom');
    setEdited(true);
  }, []);
  const loadPreset = (id: PresetId) => {
    intent.current = 'play';
    setGrid(presetById(id).build());
    setPreset(id);
    setEdited(false);
    setInspect(null);
  };
  const clearMap = () => {
    intent.current = 'end';
    setGrid((g) => ({ ...emptyGrid(g.cols, g.rows, g.start, g.goal) }));
    setPreset('custom');
    setEdited(true);
  };
  const setup = (o: { preset?: PresetId; algo?: Algo; diag?: boolean; h?: HSel; speed?: number }) => {
    intent.current = 'play';
    if (o.preset) {
      setGrid(presetById(o.preset).build());
      setPreset(o.preset);
      setEdited(false);
      setInspect(null);
    }
    if (o.algo) setAlgoRaw(o.algo);
    if (o.diag !== undefined) setDiagRaw(o.diag);
    if (o.h) setHSelRaw(o.h);
    if (o.speed) st.setSpeed(o.speed);
    revealGrid(leftRef.current);
  };

  const i = Math.min(st.i, N);
  const view = useMemo(() => stepView(dgrid, trace, i, H, useH), [dgrid, trace, i, H, useH]);
  const atEnd = i >= N;
  const found = trace.path !== null;
  const optCost = cmp.opt;
  const suboptimal = found && atEnd && trace.cost > optCost + 1e-9;

  // Cell size on screen decides whether three numbers fit in a cell.
  const cellPx = (wrapW * CELL) / viewW(dgrid);
  const allFits = cellPx >= 40;
  const numMode: Nums = nums === 'all' && !allFits ? 'f' : nums;

  // ---------------------------------------------------------------- overlay for the current step
  const over = useMemo(() => {
    const g = dgrid;
    const closed: number[] = [];
    const open: number[] = [];
    view.status.forEach((s, k) => (s === 2 ? closed.push(k) : s === 1 ? open.push(k) : 0));
    const parts: ReactNode[] = [];
    parts.push(<path key="closed" d={cellsPath(g, closed)} fill="var(--m1)" fillOpacity={0.28} />);
    parts.push(<path key="open" d={cellsPath(g, open, 2.5)} fill="var(--accent)" fillOpacity={0.13} stroke="var(--accent)" strokeWidth={2} />);
    if (view.current >= 0)
      parts.push(
        <rect
          key="cur"
          x={cellX(g, view.current) + 1.5}
          y={cellY(g, view.current) + 1.5}
          width={CELL - 3}
          height={CELL - 3}
          fill="var(--m2)"
          fillOpacity={0.35}
          stroke="var(--m2)"
          strokeWidth={3}
        />
      );
    if (arrows) {
      const reached: number[] = [...closed, ...open];
      const pa = parentArrows(g, reached, (k) => view.parent[k]);
      parts.push(
        <g key="tree" pointerEvents="none">
          <path d={pa.shafts} stroke="var(--text-3)" strokeWidth={1.4} fill="none" />
          <path d={pa.heads} fill="var(--text-3)" />
        </g>
      );
    }
    // This step's neighbour updates.
    if (view.current >= 0 && view.updates.length) {
      let addS = '';
      let addH = '';
      let impS = '';
      let impH = '';
      let ignS = '';
      for (const u of view.updates) {
        const a = stepArrow(g, view.current, u.k);
        if (u.kind === 'add') {
          addS += a.shaft;
          addH += a.head;
        } else if (u.kind === 'improve') {
          impS += a.shaft;
          impH += a.head;
        } else ignS += a.shaft;
      }
      parts.push(
        <g key="upd" pointerEvents="none">
          <path d={ignS} stroke="var(--text-3)" strokeWidth={1.4} strokeDasharray="3 3" fill="none" />
          <path d={addS} stroke="var(--m2)" strokeWidth={2.2} fill="none" />
          <path d={addH} fill="var(--m2)" />
          <path d={impS} stroke="var(--m4)" strokeWidth={3} fill="none" />
          <path d={impH} fill="var(--m4)" />
        </g>
      );
    }
    // Path: the tentative chain to the popped cell while searching, the final path at the end.
    if (atEnd && found) {
      if (suboptimal) {
        const best = cmp.rows[2].res.path;
        if (best) parts.push(<path key="opt" d={centresPath(g, best)} fill="none" stroke="var(--text-2)" strokeWidth={2.5} strokeDasharray="7 5" strokeLinecap="round" />);
      }
      const p = trace.path!.map((id) => cellOfId(g, id));
      const d = centresPath(g, p);
      parts.push(
        <g key="path" pointerEvents="none">
          <path d={d} fill="none" stroke="var(--surface)" strokeWidth={8} strokeLinejoin="round" strokeLinecap="round" opacity={0.85} />
          <path d={d} fill="none" stroke="var(--m3)" strokeWidth={4.5} strokeLinejoin="round" strokeLinecap="round" />
        </g>
      );
    } else if (view.current >= 0) {
      const p = chain(view.parent, view.current);
      if (p.length > 1) parts.push(<path key="tent" d={centresPath(g, p)} fill="none" stroke="var(--m2)" strokeWidth={2.2} strokeDasharray="5 4" strokeLinecap="round" pointerEvents="none" />);
    }
    // Numbers in the cells.
    if (numMode !== 'off') {
      const texts: ReactNode[] = [];
      view.status.forEach((s, k) => {
        if (!s) return;
        const gv = view.g[k];
        const hv = view.h[k];
        const x = centreX(g, k);
        const y = centreY(g, k);
        const fill = s === 1 ? 'var(--accent)' : 'var(--text)';
        if (numMode === 'all') {
          texts.push(
            <text key={`f${k}`} className="plan-grid-num" x={x} y={y - 1} textAnchor="middle" fontSize={11} fontWeight={700} fill={fill}>
              {fmtCost(gv + hv)}
            </text>,
            <text key={`gh${k}`} className="plan-grid-num" x={x} y={y + 11} textAnchor="middle" fontSize={7.5} fill="var(--text-2)">
              {`${fmtCost(gv)}+${fmtCost(hv)}`}
            </text>
          );
        } else {
          const v = numMode === 'g' ? gv : numMode === 'h' ? hv : gv + hv;
          texts.push(
            <text key={k} className="plan-grid-num" x={x} y={y + 4} textAnchor="middle" fontSize={11} fontWeight={600} fill={fill}>
              {fmtCost(v)}
            </text>
          );
        }
      });
      parts.push(<g key="nums">{texts}</g>);
    }
    return <>{parts}</>;
  }, [dgrid, view, arrows, atEnd, found, suboptimal, cmp, trace, numMode]);

  // ---------------------------------------------------------------- challenge
  const greedyRow = cmp.rows.find((r) => r.key === 'greedy')!;
  const greedyRatio = Number.isFinite(optCost) && optCost > 0 ? greedyRow.res.cost / optCost : NaN;
  const challengeMet = edited && greedyRatio >= 1.5 - 1e-9;
  useEffect(() => {
    if (challengeMet && !challengeDone) completeChallenge(CHALLENGE_ID);
  }, [challengeMet, challengeDone]);

  const F = facts();
  const hWarn = useH && diag && hSel === 'manhattan';

  // ---------------------------------------------------------------- render
  const left = (
    <div className="plan-grid-left plan-grid-panel" ref={leftRef}>
      <div className="plan-grid-bar plan-grid-algos">
        <Segmented
          label="Search algorithm"
          value={algo}
          onChange={setAlgo}
          options={(['bfs', 'dfs', 'dijkstra', 'astar', 'greedy'] as Algo[]).map((a) => ({ value: a, label: ALGO_SHORT[a] }))}
        />
      </div>
      <MapBar tool={tool} setTool={setTool} preset={preset} onPreset={loadPreset} onClear={clearMap} presets={['wallgap', 'mud', 'open', 'maze', 'dfs', 'blank']} />
      <div ref={svgWrap}>
        <GridView
          grid={grid}
          onChange={onMapChange}
          tool={tool}
          onInspect={setInspect}
          inspect={inspect}
          over={over}
          ariaLabel={`Grid ${grid.cols} by ${grid.rows}. Start at ${cellLabel(grid, grid.start)}, goal at ${cellLabel(grid, grid.goal)}. ${ALGO_SHORT[algo]} after ${i} of ${N} pops.`}
        />
      </div>
      <StepControls
        st={st}
        label="pop"
        speeds={[2, 8, 30, 120]}
        extra={
          <Button
            size="sm"
            onClick={() => {
              st.pause();
              st.setI(N);
            }}
            disabled={atEnd}
            aria-label="Jump to the end of the search"
            title="Jump to the end"
          >
            ⏭ End
          </Button>
        }
      />
      <GridLegend
        items={[
          { kind: 'closed', label: 'Closed (popped)' },
          { kind: 'open', label: 'Open (frontier)' },
          { kind: 'current', label: 'popped this step' },
          { kind: 'added', label: 'added to Open' },
          { kind: 'improved', label: 'parent improved' },
          { kind: 'path', label: 'path found' },
          { kind: 'optimal', label: 'cheapest path (if different)' },
          { kind: 'mud', label: 'mud ×5' },
        ]}
      />
      <Rich className="note" text={presetNote(preset)} />
    </div>
  );

  const keyCol = KEY_COL[algo];
  const shownOpen = view.open.slice(0, 8);

  const right = (
    <div className="plan-grid-right">
      <section className="plan-grid-panel">
        <h4>Search settings</h4>
        <div className="plan-grid-bar">
          <Segmented
            label="Connectivity"
            value={diag ? 8 : 4}
            onChange={(v) => setDiag(v === 8)}
            options={[
              { value: 4, label: '4-connected', title: 'Up, down, left, right; each step costs 1' },
              { value: 8, label: '8-connected', title: 'Diagonal steps too, costing √2; no cutting wall corners' },
            ]}
          />
        </div>
        <Rich className="note" text={POPS[algo]} />
        {useH ? (
          <>
            <div className="plan-grid-bar" style={{ marginTop: 6 }}>
              <span className="plan-grid-label">h</span>
              <Segmented
                size="sm"
                label="Heuristic"
                value={hSel}
                onChange={setHSel}
                options={(['manhattan', 'euclidean', 'octile', 'zero'] as HSel[]).map((h) => ({ value: h, label: H_LABEL[h] }))}
              />
            </div>
            <div className="small">
              <TeX>{H_TEX[hSel]}</TeX> <span className="muted">(cells to G, ignoring walls and mud)</span>
            </div>
            {hWarn && (
              <Callout kind="trap" title="Not admissible here">
                <Rich text="With diagonal steps, Manhattan overestimates: one diagonal step has $h = 2$ but costs $\sqrt2 \approx 1.41$ (2023 Q25). A* can then return a longer path. Compare the A* rows below, or open the Heuristic lab." />
              </Callout>
            )}
          </>
        ) : (
          <Rich className="note" text={`${ALGO_SHORT[algo]} uses no heuristic ($h = 0$), so $f = g$ in the tables.`} />
        )}
        <div className="plan-grid-bar" style={{ marginTop: 8 }}>
          <span className="plan-grid-label">Numbers</span>
          <Segmented
            size="sm"
            label="Numbers in the cells"
            value={nums}
            onChange={setNums}
            options={[
              { value: 'off', label: 'off' },
              { value: 'g', label: 'g' },
              { value: 'h', label: 'h' },
              { value: 'f', label: 'f' },
              { value: 'all', label: 'g, h, f', title: allFits ? 'f on top, g + h below' : 'Needs bigger cells: switch on "Wide map"' },
            ]}
          />
        </div>
        {nums === 'all' && !allFits && <Rich className="note" text="Three numbers do not fit in cells this small, so only $f$ is shown. Switch on **Wide map** (on a laptop) to see $g + h$ under $f$." />}
        <div className="plan-grid-bar" style={{ marginTop: 6 }}>
          <Toggle checked={arrows} onChange={setArrows} label="Parent arrows (the search tree)" />
          <Toggle checked={wide} onChange={setWide} label="Wide map" />
        </div>
      </section>

      <section className="plan-grid-panel">
        <Readouts min={112}>
          <Readout label="Popped" text={`${i} / ${N}`} tip="Nodes expanded so far (moved from Open to Closed) out of the total for this search" />
          <Readout label="Open now" text={String(view.open.length)} tip="Cells waiting in Open (the frontier)" />
          <Readout label="Peak Open" text={String(peakOpen)} tip="Largest Open size during the search: the memory it needs" tone="m1" />
          <Readout
            label="Path cost"
            text={atEnd ? (found ? fmtCost(trace.cost, 2) : 'no path') : '…'}
            tip="Sum of step costs along the returned path (step 1 or √2, ×5 into mud). Known once G is popped."
            tone={atEnd && found ? (suboptimal ? 'bad' : 'ok') : undefined}
          />
          <Readout label="Path steps" text={atEnd && found ? String(trace.path!.length - 1) : '…'} tip="Number of moves on the returned path" />
          <Readout label="Cheapest" text={Number.isFinite(optCost) ? fmtCost(optCost, 2) : '—'} tip="Optimal path cost on this map (Dijkstra)" />
        </Readouts>
        {atEnd && found && (
          <Rich
            className="small"
            text={
              suboptimal
                ? `✗ This path costs **${fmtCost(trace.cost, 2)}**, ${fmtCost((trace.cost / optCost - 1) * 100, 2)} % more than the cheapest (${fmtCost(optCost, 2)}, dashed).`
                : `✓ Optimal: no path from ${cellLabel(dgrid, dgrid.start)} to ${cellLabel(dgrid, dgrid.goal)} costs less than **${fmtCost(trace.cost, 2)}**.`
            }
          />
        )}
      </section>

      <section className="plan-grid-panel" aria-live="polite">
        <h4>{i === 0 ? 'Start' : `Pop ${i}`}</h4>
        <StepText grid={dgrid} view={view} i={i} N={N} algo={algo} found={found} trace={trace} />
        {view.updates.length > 0 && (
          <div className="plan-grid-table-wrap">
            <table className="plan-grid-table">
              <thead>
                <tr>
                  <th>neighbour</th>
                  <th title="Step cost from the popped cell">c</th>
                  <th title="g through the popped cell">g</th>
                  <th>h</th>
                  <th>f = g + h</th>
                  <th style={{ textAlign: 'left' }}>result</th>
                </tr>
              </thead>
              <tbody>
                {view.updates.map((u) => (
                  <tr key={u.k}>
                    <td>
                      <CellChip grid={dgrid} k={u.k} />
                    </td>
                    <td>{fmtCost(u.g - view.g[view.current], 2)}</td>
                    <td>{fmtCost(u.g, 2)}</td>
                    <td>{fmtCost(u.h, 2)}</td>
                    <td>{fmtCost(u.f, 2)}</td>
                    <td className="plan-grid-txt">{updateText(u, algo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="plan-grid-panel">
        <h4>Open list, in the order it will be popped</h4>
        {view.open.length === 0 ? (
          <p className="muted small">{atEnd && !found ? 'Open is empty and G was never popped: there is no path.' : 'Open is empty.'}</p>
        ) : (
          <div className="plan-grid-table-wrap">
            <table className="plan-grid-table">
              <thead>
                <tr>
                  <th className={keyCol === 'order' ? 'is-key' : undefined} title={algo === 'dfs' ? 'Stack order: newest first' : algo === 'bfs' ? 'Queue order: oldest first' : 'Pop order'}>
                    #
                  </th>
                  <th style={{ textAlign: 'left' }}>node</th>
                  <th className={keyCol === 'g' ? 'is-key' : undefined}>g</th>
                  <th className={keyCol === 'h' ? 'is-key' : undefined}>h</th>
                  <th className={keyCol === 'f' ? 'is-key' : undefined}>f</th>
                  <th style={{ textAlign: 'left' }}>parent</th>
                </tr>
              </thead>
              <tbody>
                {shownOpen.map((e, j) => (
                  <tr key={e.k} className={j === 0 ? 'is-first' : undefined}>
                    <td className={keyCol === 'order' ? 'is-key' : undefined}>{j + 1}</td>
                    <td style={{ textAlign: 'left' }}>
                      <CellChip grid={dgrid} k={e.k} />
                    </td>
                    <td className={keyCol === 'g' ? 'is-key' : undefined}>{fmtCost(e.g, 2)}</td>
                    <td className={keyCol === 'h' ? 'is-key' : undefined}>{fmtCost(e.h, 2)}</td>
                    <td className={keyCol === 'f' ? 'is-key' : undefined}>{fmtCost(e.g + e.h, 2)}</td>
                    <td style={{ textAlign: 'left' }}>{e.parent >= 0 ? cellLabel(dgrid, e.parent) : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {view.open.length > shownOpen.length && <p className="muted small">… and {view.open.length - shownOpen.length} more. Closed holds {view.closedCount} cells.</p>}
        {view.open.length > 0 && view.open.length <= shownOpen.length && <p className="muted small">Closed holds {view.closedCount} cells.</p>}
      </section>

      {inspect !== null && inspect >= 0 && (
        <section className="plan-grid-panel">
          <h4>Inspect {cellLabel(dgrid, inspect)}</h4>
          <InspectText grid={dgrid} k={inspect} view={view} hStar={hStar} useH={useH} H={H} />
          <Button size="sm" variant="ghost" onClick={() => setInspect(null)}>
            Close
          </Button>
        </section>
      )}

      <section className="plan-grid-panel">
        <h4>Every algorithm on this map</h4>
        <CompareTable
          rows={cmp.rows}
          opt={optCost}
          selected={algo === 'astar' ? (hSel === 'zero' ? 'astar0' : 'astar') : algo}
          onPick={(r) => setup({ algo: r.algo, h: r.algo === 'astar' || r.algo === 'greedy' ? r.h : undefined })}
        />
        <Rich
          className="note"
          text="Click a row to replay that search. **Optimal** compares the path cost with Dijkstra’s. With every step costing 1, BFS pops in exactly Dijkstra’s order (2023 Q9), and A* with $h = 0$ always matches Dijkstra (2024 Q9)."
        />
      </section>

      <section className="plan-grid-panel plan-grid-predicts">
        <h4>Predict, then check</h4>
        <PredictReveal
          id="plan-grid-bfs-dijkstra"
          question="Every step costs 1 (4-connected, no mud). Which two algorithms pop the cells in **exactly** the same order?"
          options={['BFS and DFS', 'BFS and Dijkstra', 'Dijkstra and A* (Manhattan)', 'DFS and greedy best-first']}
          answer={1}
          explain={`With equal step costs, $g(n)$ is just the number of steps from S, so Dijkstra’s lowest-$g$ queue empties level by level, exactly like BFS’s FIFO queue. On the maze both pop the same ${F.mazeBfs.order.length} cells in the same order: the table marks the BFS row “same order as Dijkstra”. A* differs because $h$ re-orders the queue (2023 Q9, 2024 Q9).`}
          tryIt="load the maze with 4-connected steps, run Dijkstra, and compare the BFS and Dijkstra rows."
          onApply={() => setup({ preset: 'maze', diag: false, algo: 'dijkstra', speed: 30 })}
        />
        <PredictReveal
          id="plan-grid-mud"
          question="Mud (×5 to enter) lies across the straight route. Which returns the **cheaper** path?"
          options={['BFS', 'Dijkstra', 'They return the same path']}
          answer={1}
          explain={`BFS minimises the number of **steps**, so it wades straight through: ${pathSteps(F.mudBfs.path)} steps costing ${fmtCost(F.mudBfs.cost)}. Dijkstra minimises **cost** and walks round: ${pathSteps(F.mudDij.path)} steps costing ${fmtCost(F.mudDij.cost)} (dashed). This is why BFS is the wrong tool for a weighted road map (2024 Q29a).`}
          tryIt="load the mud map and run BFS; the dashed line is the cheapest route."
          onApply={() => setup({ preset: 'mud', diag: false, algo: 'bfs', speed: 30 })}
        />
        <PredictReveal
          id="plan-grid-greedy"
          question="On the wall-with-a-gap map (4-connected, Manhattan $h$), which returns the cheaper path: greedy best-first or A*?"
          options={['Greedy best-first', 'A*', 'Same cost']}
          answer={1}
          explain={`Greedy pops the lowest $h$ and ignores $g$, so it heads straight for G, gets caught above the shelf, and the parent chain it keeps still contains that detour: cost ${fmtCost(F.wallGreedy.cost)} against A*’s optimal ${fmtCost(F.wallAstar.cost)}. A* is optimal because Manhattan never overestimates on a 4-connected grid. Greedy did pop fewer cells (${F.wallGreedy.order.length} vs ${F.wallAstar.order.length}): it trades optimality for speed.`}
          tryIt="load the wall with a gap and run greedy; the dashed line is A*’s path."
          onApply={() => setup({ preset: 'wallgap', diag: false, h: 'manhattan', algo: 'greedy', speed: 30 })}
        />
        <PredictReveal
          id="plan-grid-dfs"
          question="G is three cells to the right of S on an empty map. About how many cells does DFS pop before it pops G?"
          options={['3 to 5', 'About 15', 'More than 100']}
          answer={2}
          explain={`DFS always pops the newest cell, so it runs off in the direction of the last neighbour pushed (up, here) and only turns when it hits an edge. It pops ${F.dfsDfs.order.length} cells and returns a ${pathSteps(F.dfsDfs.path)}-step path for a 3-step trip. BFS pops ${F.dfsBfs.order.length}, A* ${F.dfsAstar.order.length}. DFS does reach G on a finite grid (it never pops a cell twice), but it is not optimal and can wander over most of the map first. Its textbook advantage is memory (in tree search it keeps only the current branch), which buys nothing on a small grid: compare the peak Open column.`}
          tryIt="load “DFS wanders” and run DFS. Switch on the parent arrows to see the snake."
          onApply={() => setup({ preset: 'dfs', diag: false, algo: 'dfs', speed: 120 })}
        />
      </section>

      <section className="plan-grid-panel">
        <h4>Challenge: trap greedy</h4>
        <Rich
          className="small"
          text={`Edit any map (walls, mud, S, G) until greedy best-first’s path costs at least **1.5 ×** the cheapest. Now: greedy ${Number.isFinite(greedyRow.res.cost) ? fmtCost(greedyRow.res.cost, 2) : '—'} vs cheapest ${Number.isFinite(optCost) ? fmtCost(optCost, 2) : '—'}, ratio **${Number.isFinite(greedyRatio) ? greedyRatio.toFixed(2) : '—'} ×**${edited ? '' : ' (preset: edit it first)'}.`}
        />
        {(challengeDone || challengeMet) && (
          <Callout kind="ok" title="Challenge complete">
            <Rich text="Greedy commits to whatever looks closest to G. A pocket facing S, or mud on the straight line (greedy never looks at $g$), makes its first route expensive, and it never revisits a Closed cell to fix it." />
          </Callout>
        )}
      </section>
    </div>
  );

  return (
    <div className="plan-grid-sim">
      <div className={`plan-grid-layout ${wide ? 'is-wide' : ''}`}>
        {left}
        {right}
      </div>
      <More label="Conventions used here (the exam’s)">
        <Rich
          text={`- Each step pops one node from Open and moves it to Closed. The **goal test is on pop**, not when G is first added to Open.
- A popped (Closed) node is never reopened. For Dijkstra, A* and greedy, a node already in Open gets a new parent when a lower $g$ turns up (“parent improved”). BFS and DFS keep the first parent.
- Neighbours are generated right, left, down, up, then the diagonals. Equal priorities go to the lower $h$, then first in first out.
- Steps cost 1, diagonals $\\sqrt2$, and entering mud costs 5 times that. A diagonal may not cut the corner of a wall.
- $g(n)$ is the cost from S along the parent chain, $h(n)$ the estimate of the cost to G, $f(n) = g(n) + h(n)$.`}
        />
      </More>
    </div>
  );
}

// ------------------------------------------------------------------ pieces

function presetNote(p: PresetId | 'custom'): string {
  if (p === 'custom') return 'Your map. Drag S or G, paint walls (start on a wall to erase) or mud ×5. The search reruns as you draw.';
  return presetById(p).note;
}

function updateText(u: NeighbourUpdate, algo: Algo): string {
  switch (u.kind) {
    case 'add':
      return 'added to Open';
    case 'improve':
      return `improved: g ${fmtCost(u.oldG ?? NaN, 2)} → ${fmtCost(u.g, 2)}, new parent`;
    case 'worse':
      return algo === 'bfs' || algo === 'dfs' ? 'already in Open (kept)' : `kept: had g = ${fmtCost(u.oldG ?? NaN, 2)}`;
    case 'closed':
      return 'already Closed (ignored)';
  }
}

function StepText({ grid, view, i, N, algo, found, trace }: { grid: Grid; view: StepView; i: number; N: number; algo: Algo; found: boolean; trace: SearchResult }) {
  if (i === 0)
    return (
      <p className="plan-grid-steptext">
        Open = {'{'}
        <CellChip grid={grid} k={grid.start} /> with g = 0{'}'}, Closed = {'{ }'}. Press ▶| to pop the first node.
      </p>
    );
  const k = view.current;
  const g = view.g[k];
  const h = view.h[k];
  if (view.isGoal) {
    const p = trace.path ? trace.path.map((id) => cellLabel(grid, cellOfId(grid, id))) : [];
    return (
      <div className="plan-grid-steptext">
        <p style={{ margin: 0 }}>
          Popped <CellChip grid={grid} k={k} /> = G with g = {fmtCost(g, 2)}: the goal is popped, so the search stops. Backtrack the parents:
        </p>
        <p className="mono small" style={{ margin: '4px 0 0', overflowWrap: 'anywhere' }}>
          {p.join(' → ')}
        </p>
      </div>
    );
  }
  return (
    <p className="plan-grid-steptext">
      Popped <CellChip grid={grid} k={k} /> {algo === 'astar' || algo === 'greedy' ? `(g = ${fmtCost(g, 2)}, h = ${fmtCost(h, 2)}, f = ${fmtCost(g + h, 2)})` : `(g = ${fmtCost(g, 2)})`} and moved it to Closed.{' '}
      {view.updates.length === 0 ? 'It has no neighbours to update.' : 'Its neighbours:'}
      {i === N && !found ? ' Open is now empty: G cannot be reached.' : ''}
    </p>
  );
}

function InspectText({ grid, k, view, hStar, useH, H }: { grid: Grid; k: number; view: StepView; hStar: Float64Array; useH: boolean; H: Float64Array }) {
  const kind = grid.cells[k] === WALL ? 'wall' : grid.cells[k] === MUD ? 'mud (×5 to enter)' : 'free';
  const s = view.status[k];
  const hv = useH ? H[k] : 0;
  return (
    <div className="small">
      <p style={{ margin: '0 0 4px' }}>
        {kind}; {s === 2 ? 'Closed (already popped)' : s === 1 ? 'in Open' : 'not reached yet'}
        {k === grid.start ? ' · this is S' : k === grid.goal ? ' · this is G' : ''}
      </p>
      {grid.cells[k] !== WALL && (
        <Readouts min={92}>
          <Readout label="g" text={s ? fmtCost(view.g[k], 3) : '—'} tip="Cost from S along the parent chain (so far)" />
          <Readout label="h" text={fmtCost(hv, 3)} tip="Heuristic estimate of the cost to G" />
          <Readout label="f = g + h" text={s ? fmtCost(view.g[k] + hv, 3) : '—'} tip="A*'s priority" />
          <Readout label="h* (true)" text={fmtCost(hStar[k], 3)} tip="True cheapest cost from this cell to G, walls and mud included" />
          <Readout label="parent" text={s && view.parent[k] >= 0 ? cellLabel(grid, view.parent[k]) : '—'} tip="Where it was reached from" />
        </Readouts>
      )}
    </div>
  );
}

function CompareTable({ rows, opt, selected, onPick }: { rows: CompareRow[]; opt: number; selected: string; onPick: (r: CompareRow) => void }) {
  const dij = rows[2].res;
  const withPath = rows.filter((r) => r.res.path);
  const minSteps = withPath.length ? Math.min(...withPath.map((r) => pathSteps(r.res.path))) : 0;
  return (
    <div className="plan-grid-table-wrap">
      <table className="plan-grid-table plan-grid-compact">
        <thead>
          <tr>
            <th>algorithm</th>
            <th title="Cells popped (expanded), including G">popped</th>
            <th title="Largest number of cells waiting in Open: the memory the search needs">peak Open</th>
            <th>cost</th>
            <th title="Moves on the returned path">steps</th>
            <th style={{ textAlign: 'left' }}>optimal?</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const ok = r.res.path !== null && Math.abs(r.res.cost - opt) < 1e-6;
            const same = r.key !== 'dijkstra' && sameOrder(r.res.order, dij.order);
            const extra = Number.isFinite(r.res.cost) && opt > 0 ? (r.res.cost / opt - 1) * 100 : NaN;
            return (
              <tr key={r.key} className={`is-click ${r.key === selected ? 'is-sel' : ''}`} onClick={() => onPick(r)}>
                <td className="plan-grid-txt">
                  <button type="button" className="plan-grid-rowbtn" onClick={(e) => (e.stopPropagation(), onPick(r))} aria-label={`Replay ${r.label}${r.sub ? ` with ${r.sub}` : ''}`}>
                    {r.label}
                  </button>
                  {r.sub && <span className="small muted"> {r.sub}</span>}
                  {same && <div className="plan-grid-same">= Dijkstra’s order</div>}
                </td>
                <td>{r.res.order.length}</td>
                <td>{r.res.peakOpen}</td>
                <td>{r.res.path ? fmtCost(r.res.cost, 2) : '—'}</td>
                <td title={r.res.path && pathSteps(r.res.path) === minSteps ? 'Fewest steps of any algorithm here' : undefined}>
                  {r.res.path ? (pathSteps(r.res.path) === minSteps ? <strong>{pathSteps(r.res.path)}</strong> : pathSteps(r.res.path)) : '—'}
                </td>
                <td className="plan-grid-txt">
                  {!r.res.path ? (
                    <span className="muted">no path</span>
                  ) : ok ? (
                    <span className="plan-grid-ok">✓ yes</span>
                  ) : (
                    <span className="plan-grid-bad">✗ +{extra >= 9.95 ? Math.round(extra) : extra.toFixed(1)} %</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
