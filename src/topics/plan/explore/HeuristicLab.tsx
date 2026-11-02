// Heuristic lab: admissibility made visible. Every cell is tinted by h(n)/h*(n), where h*(n) is the true cost
// to go (Dijkstra outwards from G with directed mud costs); cells where h overestimates get a red ▲. A* is run
// with the chosen heuristic and its pops are replayed as dots, and a table compares every heuristic on the map.
import { useCallback, useDeferredValue, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ExploreItem } from '../../../engine/types';
import { Button, Callout, More, Readout, Readouts, Segmented, Slider } from '../../../ui/kit';
import { StepControls, useStepper } from '../../../ui/stepper';
import { PredictReveal } from '../../../ui/PredictReveal';
import { Rich, TeX } from '../../../ui/Rich';
import { useWidth } from '../../../anim/hooks';
import {
  MUD,
  Q25_PROBE,
  WALL,
  cellLabel,
  costToGoGrid,
  emptyGrid,
  fastSearch,
  fmtCost,
  heuristicArray,
  pathSteps,
  presetById,
  type FastResult,
  type Grid,
  type GridHeuristic,
  type PresetId,
} from './gridEngine';
import { CELL, GridLegend, GridView, MapBar, cellX, cellY, cellsPath, centreX, centreY, centresPath, revealGrid, viewW, type Tool } from './gridCommon';

export const meta: Omit<ExploreItem, 'component'> = {
  id: 'heuristics',
  title: 'Heuristic lab: admissible or not?',
  summary:
    'Colour every cell by $h(n)/h^*(n)$, the estimate over the true cost to go. Switch between $h = 0$, Euclidean, Manhattan, octile and an inflated $\\varepsilon h$, on 4- or 8-connected grids, and compare cells popped with the cost of the path A* returns.',
  notice:
    'Red ▲ cells are where $h > h^*$ (inadmissible). Watch them appear when Manhattan meets diagonal moves, and watch A* pop fewer cells as $h$ gets closer to $h^*$, but return a longer path once $h$ overestimates.',
  minutes: 8,
};

type HK = GridHeuristic;
const HKS: HK[] = ['zero', 'euclidean', 'manhattan', 'octile', 'inflated'];
const HK_LABEL: Record<HK, string> = { zero: 'h = 0', euclidean: 'Euclidean', manhattan: 'Manhattan', octile: 'Octile', inflated: 'ε × Euclidean' };
const HK_TEX: Record<HK, string> = {
  zero: 'h(n) = 0',
  euclidean: 'h(n) = \\sqrt{\\Delta x^2 + \\Delta y^2}',
  manhattan: 'h(n) = |\\Delta x| + |\\Delta y|',
  octile: 'h(n) = \\max(|\\Delta x|, |\\Delta y|) + (\\sqrt2 - 1)\\min(|\\Delta x|, |\\Delta y|)',
  inflated: 'h(n) = \\varepsilon\\sqrt{\\Delta x^2 + \\Delta y^2}',
};
type Nums = 'off' | 'h' | 'hs' | 'both' | 'f';

interface HeurStats {
  res: FastResult;
  over: number;
  maxRatio: number;
}

function stats(grid: Grid, diag: boolean, H: Float64Array, hStar: Float64Array): HeurStats {
  let over = 0;
  let maxRatio = 0;
  for (let k = 0; k < H.length; k++) {
    const hs = hStar[k];
    if (grid.cells[k] === WALL || !Number.isFinite(hs) || hs <= 0) continue;
    if (H[k] > hs + 1e-9) over++;
    maxRatio = Math.max(maxRatio, H[k] / hs);
  }
  return { res: fastSearch(grid, 'astar', diag, { h: H, tieBreak: 'h' }), over, maxRatio };
}

// ------------------------------------------------------------------ the numbers quoted by the predictions

interface Facts {
  blockMan: HeurStats;
  blockOpt: number;
  mudEuc: HeurStats;
  mudInf3: HeurStats;
  mudOpt: number;
  openMan4: HeurStats;
  openZero4: HeurStats;
}
let factsCache: Facts | null = null;
function facts(): Facts {
  if (factsCache) return factsCache;
  const block = presetById('block').build();
  const mud = presetById('mud').build();
  const open = presetById('open').build();
  const hb = costToGoGrid(block, true);
  const hm = costToGoGrid(mud, false);
  const ho = costToGoGrid(open, false);
  factsCache = {
    blockMan: stats(block, true, heuristicArray(block, 'manhattan'), hb),
    blockOpt: hb[block.start],
    mudEuc: stats(mud, false, heuristicArray(mud, 'euclidean'), hm),
    mudInf3: stats(mud, false, heuristicArray(mud, 'inflated', 3), hm),
    mudOpt: hm[mud.start],
    openMan4: stats(open, false, heuristicArray(open, 'manhattan'), ho),
    openZero4: stats(open, false, heuristicArray(open, 'zero'), ho),
  };
  return factsCache;
}

// ------------------------------------------------------------------ component

export default function HeuristicLab() {
  const [grid, setGrid] = useState<Grid>(() => presetById('wallgap').build());
  const [preset, setPreset] = useState<PresetId | 'custom'>('wallgap');
  const [diag, setDiagRaw] = useState(false);
  const [hk, setHkRaw] = useState<HK>('euclidean');
  const [eps, setEpsRaw] = useState(2);
  const [tool, setTool] = useState<Tool>('inspect');
  const [nums, setNums] = useState<Nums>('off');
  const [inspect, setInspect] = useState<number | null>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const [svgWrap, wrapW] = useWidth<HTMLDivElement>(600);

  const dgrid = useDeferredValue(grid);
  const deps = useDeferredValue(eps);
  const hStar = useMemo(() => costToGoGrid(dgrid, diag), [dgrid, diag]);
  const H = useMemo(() => heuristicArray(dgrid, hk, deps), [dgrid, hk, deps]);
  const cur = useMemo(() => stats(dgrid, diag, H, hStar), [dgrid, diag, H, hStar]);
  const table = useMemo(
    () => HKS.map((k) => ({ k, s: k === hk ? cur : stats(dgrid, diag, heuristicArray(dgrid, k, deps), hStar) })),
    [dgrid, diag, deps, hStar, hk, cur]
  );
  const opt = hStar[dgrid.start];
  const N = cur.res.order.length;
  const st = useStepper(N, { speed: 60 });

  const intent = useRef<'play' | 'end' | null>('play');
  useLayoutEffect(() => {
    if (dgrid !== grid || deps !== eps) return;
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
  }, [cur]);

  const setHk = (k: HK) => {
    if (k === hk) return;
    intent.current = 'play';
    setHkRaw(k);
  };
  const setDiag = (d: boolean) => {
    if (d === diag) return;
    intent.current = 'play';
    setDiagRaw(d);
  };
  const setEps = (e: number) => {
    intent.current = 'end';
    setEpsRaw(Math.round(e * 10) / 10);
  };
  const onMapChange = useCallback((g: Grid) => {
    intent.current = 'end';
    setGrid(g);
    setPreset('custom');
  }, []);
  const loadPreset = (id: PresetId) => {
    intent.current = 'play';
    const g = presetById(id).build();
    setGrid(g);
    setPreset(id);
    setInspect(id === 'q25' ? Q25_PROBE(g) : null);
    if (id === 'q25') setDiagRaw(true);
  };
  const clearMap = () => {
    intent.current = 'end';
    setGrid((g) => emptyGrid(g.cols, g.rows, g.start, g.goal));
    setPreset('custom');
  };
  const setup = (o: { preset?: PresetId; diag?: boolean; hk?: HK; eps?: number; inspect?: 'q25' | null; nums?: Nums }) => {
    intent.current = 'play';
    let g = grid;
    if (o.preset) {
      g = presetById(o.preset).build();
      setGrid(g);
      setPreset(o.preset);
    }
    if (o.diag !== undefined) setDiagRaw(o.diag);
    if (o.hk) setHkRaw(o.hk);
    if (o.eps !== undefined) setEpsRaw(o.eps);
    if (o.inspect !== undefined) setInspect(o.inspect === 'q25' ? Q25_PROBE(g) : null);
    if (o.nums) setNums(o.nums);
    revealGrid(leftRef.current);
  };

  const i = Math.min(st.i, N);
  const atEnd = i >= N;
  const found = cur.res.path !== null;
  const suboptimal = found && cur.res.cost > opt + 1e-9;
  const cellPx = (wrapW * CELL) / viewW(dgrid);
  const small = cellPx < 24;

  // ---------------------------------------------------------------- heat map of h / h*
  const under = useMemo(() => {
    const g = dgrid;
    const LEVELS = 8;
    const okCells: number[][] = Array.from({ length: LEVELS + 1 }, () => []);
    const badCells: number[][] = Array.from({ length: 5 }, () => []);
    const unreachable: number[] = [];
    let marks = '';
    for (let k = 0; k < g.cells.length; k++) {
      if (g.cells[k] === WALL || k === g.goal) continue;
      const hs = hStar[k];
      if (!Number.isFinite(hs)) {
        unreachable.push(k);
        continue;
      }
      const h = H[k];
      if (h > hs + 1e-9) {
        const lv = Math.min(4, Math.max(0, Math.ceil((h / hs - 1) / 0.125) - 1));
        badCells[lv].push(k);
        const x = cellX(g, k) + CELL;
        const y = cellY(g, k);
        marks += `M${x - 8} ${y + 3}L${x - 2.5} ${y + 12}L${x - 13.5} ${y + 12}z`;
      } else {
        okCells[Math.round((hs > 0 ? h / hs : 1) * LEVELS)].push(k);
      }
    }
    return (
      <g pointerEvents="none">
        {okCells.map((ks, lv) => (ks.length ? <path key={`ok${lv}`} d={cellsPath(g, ks)} fill="var(--m1)" fillOpacity={0.04 + 0.06 * lv} /> : null))}
        {badCells.map((ks, lv) => (ks.length ? <path key={`bad${lv}`} d={cellsPath(g, ks)} fill="var(--bad)" fillOpacity={0.2 + 0.07 * lv} /> : null))}
        {unreachable.length > 0 && <path d={cellsPath(g, unreachable)} fill="var(--text-3)" fillOpacity={0.22} />}
        {!small && <path d={marks} fill="var(--bad)" />}
      </g>
    );
  }, [dgrid, H, hStar, small]);

  // ---------------------------------------------------------------- A*'s pops, path and numbers
  const over = useMemo(() => {
    const g = dgrid;
    const parts: ReactNode[] = [];
    let dots = '';
    const order = cur.res.order;
    for (let j = 0; j < Math.min(i, order.length); j++) {
      const k = order[j];
      dots += `M${centreX(g, k) - 3.4} ${centreY(g, k)}a3.4 3.4 0 1 0 6.8 0a3.4 3.4 0 1 0 -6.8 0`;
    }
    parts.push(<path key="dots" d={dots} fill="var(--text)" fillOpacity={0.55} />);
    if (atEnd && found) {
      if (suboptimal) {
        const best = fastSearch(g, 'dijkstra', diag).path;
        if (best) parts.push(<path key="opt" d={centresPath(g, best)} fill="none" stroke="var(--text-2)" strokeWidth={2.5} strokeDasharray="7 5" strokeLinecap="round" />);
      }
      const d = centresPath(g, cur.res.path!);
      parts.push(
        <g key="path">
          <path d={d} fill="none" stroke="var(--surface)" strokeWidth={8} strokeLinejoin="round" strokeLinecap="round" opacity={0.85} />
          <path d={d} fill="none" stroke="var(--m3)" strokeWidth={4.5} strokeLinejoin="round" strokeLinecap="round" />
        </g>
      );
    }
    if (nums !== 'off') {
      const texts: ReactNode[] = [];
      const popped = new Uint8Array(g.cells.length);
      for (let j = 0; j < Math.min(i, order.length); j++) popped[order[j]] = 1;
      for (let k = 0; k < g.cells.length; k++) {
        if (g.cells[k] === WALL) continue;
        const x = centreX(g, k);
        const y = centreY(g, k);
        const bad = H[k] > hStar[k] + 1e-9;
        if (nums === 'both') {
          texts.push(
            <text key={`h${k}`} className="plan-grid-num" x={x} y={y - 2} textAnchor="middle" fontSize={9.5} fontWeight={700} fill={bad ? 'var(--bad)' : 'var(--text)'}>
              {fmtCost(H[k])}
            </text>,
            <text key={`s${k}`} className="plan-grid-num" x={x} y={y + 10} textAnchor="middle" fontSize={9.5} fill="var(--text-2)">
              {fmtCost(hStar[k])}
            </text>
          );
        } else if (nums === 'f') {
          if (!popped[k]) continue;
          texts.push(
            <text key={k} className="plan-grid-num" x={x} y={y + 4} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--text)">
              {fmtCost(cur.res.g[k] + H[k])}
            </text>
          );
        } else {
          const v = nums === 'h' ? H[k] : hStar[k];
          texts.push(
            <text key={k} className="plan-grid-num" x={x} y={y + 4} textAnchor="middle" fontSize={11} fontWeight={600} fill={nums === 'h' && bad ? 'var(--bad)' : 'var(--text)'}>
              {fmtCost(v)}
            </text>
          );
        }
      }
      parts.push(<g key="nums">{texts}</g>);
    }
    return <g pointerEvents="none">{parts}</g>;
  }, [dgrid, cur, i, atEnd, found, suboptimal, diag, nums, H, hStar]);

  const F = facts();

  // ---------------------------------------------------------------- render
  const left = (
    <div className="plan-grid-left plan-grid-panel" ref={leftRef}>
      <div className="plan-grid-bar plan-grid-algos">
        <Segmented label="Heuristic" value={hk} onChange={setHk} options={HKS.map((k) => ({ value: k, label: HK_LABEL[k] }))} />
      </div>
      {hk === 'inflated' && (
        <Slider
          label="inflation"
          tex="\varepsilon"
          tip="A* uses ε times the Euclidean distance. ε = 1 is plain Euclidean (admissible)."
          value={eps}
          min={1}
          max={5}
          step={0.1}
          sig={2}
          onChange={setEps}
        />
      )}
      <MapBar tool={tool} setTool={setTool} preset={preset} onPreset={loadPreset} onClear={clearMap} presets={['wallgap', 'open', 'q25', 'block', 'mud', 'maze', 'blank']} />
      <div ref={svgWrap}>
        <GridView
          grid={grid}
          onChange={onMapChange}
          tool={tool}
          onInspect={setInspect}
          inspect={inspect}
          under={under}
          over={over}
          ariaLabel={`Heuristic map: ${HK_LABEL[hk]} on a ${diag ? '8' : '4'}-connected grid. ${cur.over} cells overestimate. A* pops ${N} cells.`}
        />
      </div>
      <StepControls
        st={st}
        label="pop"
        speeds={[5, 20, 60, 200]}
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
      <div className="plan-grid-legend">
        <span className="plan-grid-legend-item">
          <span className="plan-grid-heat" style={{ background: 'linear-gradient(90deg, color-mix(in srgb, var(--m1) 4%, var(--surface)), color-mix(in srgb, var(--m1) 52%, var(--surface)))' }} />
          <span>
            <TeX>{'h/h^*'}</TeX> from 0 to 1 (darker = tighter)
          </span>
        </span>
      </div>
      <GridLegend
        items={[
          { kind: 'over', label: <Rich inline text="$h > h^*$: overestimates" /> },
          { kind: 'expanded', label: 'popped by A*' },
          { kind: 'path', label: 'A*’s path' },
          { kind: 'optimal', label: 'cheapest path (if different)' },
          { kind: 'mud', label: 'mud ×5' },
        ]}
      />
      <Rich className="note" text={preset === 'custom' ? 'Your map. Inspect a cell to read $h$ and $h^*$; switch the tool to paint walls or mud.' : presetById(preset).note} />
    </div>
  );

  const ins = inspect !== null && inspect >= 0 && dgrid.cells[inspect] !== WALL ? inspect : null;

  const right = (
    <div className="plan-grid-right">
      <section className="plan-grid-panel">
        <h4>Motion model and heuristic</h4>
        <div className="plan-grid-bar">
          <Segmented
            label="Connectivity"
            value={diag ? 8 : 4}
            onChange={(v) => setDiag(v === 8)}
            options={[
              { value: 4, label: '4-connected', title: 'Up, down, left, right; each step costs 1' },
              { value: 8, label: '8-connected', title: 'Diagonal steps too, costing √2 (the grid version of free motion)' },
            ]}
          />
        </div>
        <div className="small" style={{ marginTop: 6 }}>
          <TeX>{HK_TEX[hk]}</TeX>
          {hk === 'inflated' && <span className="mono"> (ε = {eps.toFixed(1)})</span>}
        </div>
        <div className="plan-grid-bar" style={{ marginTop: 8 }}>
          <span className="plan-grid-label">Numbers</span>
          <Segmented
            size="sm"
            label="Numbers in the cells"
            value={nums}
            onChange={setNums}
            options={[
              { value: 'off', label: 'off' },
              { value: 'h', label: 'h' },
              { value: 'hs', label: 'h*' },
              { value: 'both', label: 'h over h*' },
              { value: 'f', label: 'f of pops' },
            ]}
          />
        </div>
        {small && nums !== 'off' && <Rich className="note" text="The cells are small on this screen: rotate to landscape or zoom out for the numbers." />}
      </section>

      <section className="plan-grid-panel">
        <Readouts min={112}>
          <Readout tex="h(S)" text={fmtCost(H[dgrid.start], 3)} tip="The heuristic's estimate at the start" />
          <Readout tex="h^*(S)" text={fmtCost(opt, 3)} tip="True cheapest cost from S to G (walls and mud included)" tone="m1" />
          <Readout label="Overestimating cells" text={String(cur.over)} tip="Cells where h > h*: the heuristic is inadmissible if there is even one" tone={cur.over ? 'bad' : 'ok'} />
          <Readout label="max h / h*" text={cur.maxRatio.toFixed(3)} tip="Worst ratio over all cells; above 1 means it overestimates somewhere" tone={cur.maxRatio > 1 + 1e-9 ? 'bad' : undefined} />
          <Readout label="A* popped" text={`${i} / ${N}`} tip="Cells A* expanded with this heuristic (fewer = better guided)" />
          <Readout
            label="A* path cost"
            text={found ? fmtCost(cur.res.cost, 3) : 'no path'}
            tip="Cost of the path A* returned"
            tone={found ? (suboptimal ? 'bad' : 'ok') : undefined}
          />
        </Readouts>
        <Rich
          className="small"
          text={
            !found
              ? 'G cannot be reached from S.'
              : cur.over === 0
                ? `✓ **Admissible**: $h(n) \\le h^*(n)$ in every cell, so A*’s path is optimal (cost ${fmtCost(opt, 3)}). ${cur.maxRatio > 1 - 1e-9 && cur.maxRatio < 1 + 1e-9 ? 'Where $h = h^*$ it is a perfect guide.' : ''}`
                : `✗ **Not admissible**: $h > h^*$ in ${cur.over} cells (worst ratio ${cur.maxRatio.toFixed(2)}). ${suboptimal ? `Here A* returned ${fmtCost(cur.res.cost, 3)}, ${fmtCost((cur.res.cost / opt - 1) * 100, 2)} % above the optimum ${fmtCost(opt, 3)} (dashed).` : `This time A*’s path still happens to be optimal (${fmtCost(opt, 3)}), but nothing guarantees it.`}${hk === 'inflated' ? ` The bound: cost $\\le \\varepsilon \\times$ optimum = ${fmtCost(eps * opt, 3)}.` : ''}`
          }
        />
      </section>

      {ins !== null && (
        <section className="plan-grid-panel">
          <h4>Inspect {cellLabel(dgrid, ins)}</h4>
          <InspectCell grid={dgrid} k={ins} H={H} hStar={hStar} res={cur.res} hk={hk} diag={diag} />
          <Button size="sm" variant="ghost" onClick={() => setInspect(null)}>
            Close
          </Button>
        </section>
      )}

      <section className="plan-grid-panel">
        <h4>Every heuristic on this map ({diag ? '8' : '4'}-connected)</h4>
        <div className="plan-grid-table-wrap">
          <table className="plan-grid-table plan-grid-compact">
            <thead>
              <tr>
                <th>heuristic</th>
                <th title="Cells A* popped">popped</th>
                <th>path cost</th>
                <th style={{ textAlign: 'left' }}>optimal?</th>
                <th style={{ textAlign: 'left' }}>admissible?</th>
              </tr>
            </thead>
            <tbody>
              {table.map(({ k, s }) => {
                const ok = s.res.path !== null && Math.abs(s.res.cost - opt) < 1e-6;
                return (
                  <tr key={k} className={`is-click ${k === hk ? 'is-sel' : ''}`} onClick={() => setHk(k)}>
                    <td className="plan-grid-txt">
                      <button type="button" className="plan-grid-rowbtn" onClick={(e) => (e.stopPropagation(), setHk(k))}>
                        {k === 'inflated' ? `${eps.toFixed(1)} × Euclidean` : HK_LABEL[k]}
                      </button>
                    </td>
                    <td>{s.res.order.length}</td>
                    <td>{s.res.path ? fmtCost(s.res.cost, 3) : '—'}</td>
                    <td className="plan-grid-txt">{!s.res.path ? '—' : ok ? <span className="plan-grid-ok">✓ yes</span> : <span className="plan-grid-bad">✗ +{fmtCost((s.res.cost / opt - 1) * 100, 2)} %</span>}</td>
                    <td className="plan-grid-txt">
                      {s.over === 0 ? <span className="plan-grid-ok">✓ yes</span> : <span className="plan-grid-bad">✗ {s.over} cells</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Rich
          className="note"
          text="Click a row to switch. Among admissible heuristics, the larger $h$ is (the closer to $h^*$), the fewer cells A* pops: $h = 0$ is Dijkstra and floods everywhere."
        />
      </section>

      <section className="plan-grid-panel">
        <h4>Why admissible means optimal</h4>
        <Rich
          className="small"
          text={`A* pops the lowest $f(n) = g(n) + h(n)$. Take any node $n$ on the optimal path, cost $C^*$. If $h$ is admissible, $f(n) = g(n) + h(n) \\le g(n) + h^*(n) = C^*$, so $n$ is popped before G can come out of Open with a worse cost $C > C^*$; the optimal route is always finished first.

If $h$ overestimates on the optimal route, $f(n) > C^*$ there, and G can be popped first through a worse route. That is the 2023 Q25 answer: Manhattan distance overestimates when the robot can move diagonally, so A* may return a suboptimal path.`}
        />
      </section>

      <section className="plan-grid-panel plan-grid-predicts">
        <h4>Predict, then check</h4>
        <PredictReveal
          id="plan-heur-manhattan-8"
          question="Allow diagonal moves (8-connected, a diagonal step costs $\sqrt2$). Is Manhattan distance still an admissible heuristic?"
          options={['Yes: it never overestimates', 'No: it overestimates wherever both $\\Delta x$ and $\\Delta y$ are non-zero', 'Only next to walls']}
          answer={1}
          explain={`One diagonal step from G: Manhattan says $|1| + |1| = 2$, but the step costs $\\sqrt2 \\approx 1.41$ (2023 Q25). Almost every cell off G’s row and column gets a red ▲ (all of them on the open field; a few cells tucked behind the block escape, because the detour raises their $h^*$), worst on the diagonals (ratio $\\sqrt2$). On the block map A* with Manhattan returns ${fmtCost(F.blockMan.res.cost, 3)} instead of ${fmtCost(F.blockOpt, 3)}: it avoids the diagonal route because it prices it too high. Octile distance is the exact version for an 8-connected grid; Euclidean is admissible too.`}
          tryIt="load the block map, choose 8-connected and Manhattan, and look for red ▲ cells and the dashed cheaper route."
          onApply={() => setup({ preset: 'block', diag: true, hk: 'manhattan', nums: 'off', inspect: null })}
        />
        <PredictReveal
          id="plan-heur-manhattan-4"
          question="4-connected grid, no obstacles. How does Manhattan’s $h$ compare with the true cost to go $h^*$?"
          options={['$h < h^*$ almost everywhere', '$h = h^*$ in every cell', '$h > h^*$ off the axes']}
          answer={1}
          explain={`With only up, down, left and right moves and nothing in the way, the cheapest route really is $|\\Delta x| + |\\Delta y|$ steps, so $h = h^*$ everywhere: a perfect guide. A* pops only ${F.openMan4.res.order.length} cells on the open field (one per path cell), against ${F.openZero4.res.order.length} with $h = 0$. Walls or mud only make $h^*$ bigger, so Manhattan stays admissible on any 4-connected grid.`}
          tryIt="load the open field, choose 4-connected and Manhattan, and show h over h*."
          onApply={() => setup({ preset: 'open', diag: false, hk: 'manhattan', nums: 'both', inspect: null })}
        />
        <PredictReveal
          id="plan-heur-inflate"
          question="Mud map, 4-connected. Change Euclidean to $3 \times$ Euclidean. What happens?"
          options={['More cells popped, same path cost', 'Fewer cells popped; the path can cost more, but at most 3 × the optimum', 'Fewer cells popped and the same optimal path, guaranteed', 'A* no longer finds a path']}
          answer={1}
          explain={`$f = g + 3h$ weights the estimate heavily, so A* charges towards G: ${F.mudEuc.res.order.length} → ${F.mudInf3.res.order.length} cells popped. But $3h$ overestimates almost everywhere, so A* wades through the mud: cost ${fmtCost(F.mudEuc.res.cost)} → ${fmtCost(F.mudInf3.res.cost)}. Weighted A* trades optimality for speed, with the guarantee cost $\\le \\varepsilon \\times$ optimum (${fmtCost(3 * F.mudOpt)} here) because Euclidean is consistent.`}
          tryIt="load the mud map, 4-connected, ε × Euclidean with ε = 3, and compare the rows of the table."
          onApply={() => setup({ preset: 'mud', diag: false, hk: 'inflated', eps: 3, nums: 'off', inspect: null })}
        />
        <PredictReveal
          id="plan-heur-zero"
          question="**Mud map** (entering a mud cell costs 5). Set $h = 0$. A* now pops exactly the same cells, in the same order, as…"
          options={['BFS', 'Dijkstra', 'Greedy best-first', 'DFS']}
          answer={1}
          explain="With $h = 0$, $f = g$, which is Dijkstra’s priority, so the pops are identical (2024 Q9: Dijkstra and A* are the same if the heuristic is zero). BFS would match too if every step cost the same, but the mud makes costs unequal and BFS ignores them. $h = 0$ is still admissible ($0 \le h^*$), so the path is optimal, but A* gets no guidance: it floods outwards in rings of equal cost (bending round the mud) and pops the most cells of any admissible heuristic."
          tryIt="the mud map is loaded with h = 0: watch the pops spread out by cost from S, then compare the popped column of the table."
          onApply={() => setup({ preset: 'mud', diag: false, hk: 'zero', nums: 'off', inspect: null })}
        />
      </section>

      <More label="What the colours and numbers mean">
        <Rich
          text={`- $h^*(n)$ is the true cheapest cost from $n$ to G with the walls, the mud (×5 to enter) and the chosen moves (steps 1, diagonals $\\sqrt2$, no cutting wall corners). It is computed by Dijkstra outwards from G.
- Each cell is tinted by $h(n)/h^*(n)$: pale means the heuristic badly underestimates (little guidance), dark blue means it is nearly exact. Red with ▲ means $h(n) > h^*(n)$.
- Admissible: $h(n) \\le h^*(n)$ for **every** $n$. One red cell is enough to lose the guarantee.
- The dots are the cells A* popped (expanded) with this heuristic; ties in $f$ go to the lower $h$.`}
        />
      </More>
    </div>
  );

  return (
    <div className="plan-grid-sim">
      <div className="plan-grid-layout">
        {left}
        {right}
      </div>
    </div>
  );
}

function InspectCell({ grid, k, H, hStar, res, hk, diag }: { grid: Grid; k: number; H: Float64Array; hStar: Float64Array; res: FastResult; hk: HK; diag: boolean }) {
  const h = H[k];
  const hs = hStar[k];
  const bad = h > hs + 1e-9;
  const popped = res.state[k] === 2;
  const dx = Math.abs((k % grid.cols) - (grid.goal % grid.cols));
  const dy = Math.abs(Math.floor(k / grid.cols) - Math.floor(grid.goal / grid.cols));
  const detail =
    hk === 'manhattan'
      ? `$h = |\\Delta x| + |\\Delta y| = ${dx} + ${dy} = ${dx + dy}$`
      : hk === 'euclidean'
        ? `$h = \\sqrt{${dx}^2 + ${dy}^2} = ${fmtCost(h, 3)}$`
        : hk === 'octile'
          ? `$h = ${Math.max(dx, dy)} + (\\sqrt2 - 1) \\times ${Math.min(dx, dy)} = ${fmtCost(h, 3)}$`
          : hk === 'zero'
            ? '$h = 0$'
            : `$h = \\varepsilon\\sqrt{${dx}^2 + ${dy}^2} = ${fmtCost(h, 3)}$`;
  return (
    <div className="small">
      <Readouts min={92}>
        <Readout tex="h(n)" text={fmtCost(h, 3)} tip="Heuristic estimate" tone={bad ? 'bad' : undefined} />
        <Readout tex="h^*(n)" text={fmtCost(hs, 3)} tip="True cheapest cost to G" tone="m1" />
        <Readout label="popped by A*" text={popped ? 'yes' : 'no'} tip="Whether A* expanded this cell" />
        {popped && <Readout tex="f = g + h" text={fmtCost(res.g[k] + h, 3)} tip="A*'s priority when it was popped" />}
      </Readouts>
      <Rich
        text={`${detail}. ${!Number.isFinite(hs) ? 'G cannot be reached from here.' : bad ? `**Overestimates** by ${fmtCost(h - hs, 3)}: inadmissible.` : `$h \\le h^*$: fine here${Math.abs(h - hs) < 1e-9 ? ' (exact)' : ''}.`}${grid.cells[k] === MUD ? ' (This cell is mud: leaving it is cheap, entering it is not.)' : ''}${
          hk === 'manhattan' && diag && dx === 1 && dy === 1 && Math.abs(hs - Math.SQRT2) < 1e-9 ? ' This is the 2023 Q25 case: one diagonal step, $2 > \\sqrt2$.' : ''
        }`}
      />
      {pathSteps(res.path) > 0 && <span className="sr-only">A* path has {pathSteps(res.path)} steps.</span>}
    </div>
  );
}
