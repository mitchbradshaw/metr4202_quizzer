// Self-tests for the search drills (plan-search-order, plan-admissible, plan-bfs-weighted) and for the facts the
// grid labs teach ("grid" and "heuristics"), checked through the labs' own helpers in explore/gridEngine.ts:
//   - gridEngine's fastSearch pops exactly what core/graph.ts graphSearch pops (the labs' tables rely on it);
//   - BFS = Dijkstra when every step costs the same; Dijkstra = A* with h = 0;
//   - Manhattan is exact on a 4-connected grid but overestimates on an 8-connected one (2023 Q25);
//   - octile is exact and Euclidean admissible on the 8-connected grid; ε·h stays within ε × optimum.
import katex from 'katex';
import type { CheckResult, SelfTest } from '../../../selftest/types';
import type { SolveInstance, Tier } from '../../../engine/types';
import { isTrue, near, nearAbs } from '../../../selftest/assert';
import { makeRng } from '../../../engine/rng';
import { checkChoice, checkNumeric, checkOrder } from '../../../engine/check';
import { graphSearch, gridNeighbours, type Algo, type HeuristicKind, type WeightedGraph } from '../../../core/graph';
import { BRISBANE_2024 } from '../../../core/roadmaps';
import { roadMap } from '../../../core/roadgen';
import { PRESETS, Q25_PROBE, WALL, cellOfId, costToGoGrid, fastSearch, hasMud, heuristicArray, idOfCell, presetById, sameOrder, toGridMap, type Grid } from '../explore/gridEngine';
import { alphaNeighbours, generators } from '../solve/search';
import { judgeSeq, parseSeq, seqPartData } from '../solve/searchSeq';

// ------------------------------------------------------------------ generator sanity

/** Every $…$ / $$…$$ segment of a Rich string, as the renderer splits them (\$ is a literal dollar). */
function texSegments(text: string): { tex: string; display: boolean }[] {
  const src = text.replace(/\\\$/g, '\u0000');
  const out: { tex: string; display: boolean }[] = [];
  const re = /\$\$([\s\S]+?)\$\$|\$([^$]+?)\$/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) out.push({ tex: (m[1] ?? m[2]).replace(/\u0000/g, '\\$'), display: m[1] !== undefined });
  return out;
}

function texErrors(texts: string[]): string[] {
  const bad: string[] = [];
  for (const t of texts) {
    const src = t.replace(/\\\$/g, '');
    if ((src.match(/\$/g) ?? []).length % 2) bad.push(`unbalanced $ in "${t.slice(0, 60)}"`);
    for (const seg of texSegments(t)) {
      try {
        katex.renderToString(seg.tex, { displayMode: seg.display, throwOnError: true, strict: 'ignore' });
      } catch (e) {
        bad.push(`${seg.tex.slice(0, 60)}: ${(e as Error).message.slice(0, 90)}`);
      }
    }
  }
  return bad;
}

/** All Rich text in an instance (prompt, labels, options, whys, order steps, trap messages, hints). */
function richOf(inst: SolveInstance): string[] {
  const out: string[] = [inst.prompt, ...inst.hints];
  for (const p of inst.parts) {
    out.push(p.label);
    if (p.kind === 'numeric') for (const t of p.traps ?? []) out.push(t.message);
    if (p.kind === 'choice') for (const o of p.options) out.push(o.text, o.why ?? '');
    if (p.kind === 'order') out.push(...p.steps);
    const spec = p.kind === 'custom' ? seqPartData(p.render) : null;
    if (spec) {
      // The feedback a wrong answer gets (it is Rich text too).
      const w = spec.run.expandedOrder;
      out.push(judgeSeq(spec, w.slice(0, -1)).message, judgeSeq(spec, [...w, w[1]]).message, judgeSeq(spec, [w[0], ...w.slice(1).reverse()]).message);
      out.push(judgeSeq(spec, [w[0], w[0]]).message, judgeSeq(spec, [w[0], spec.goal]).message);
    }
  }
  return out;
}

/** Problems with one instance (empty when it is well formed). */
function instanceProblems(inst: SolveInstance): string[] {
  const bad: string[] = [];
  if (inst.hints.length !== 4) bad.push(`${inst.hints.length} hints`);
  if (inst.hints.some((h) => !h || !h.trim())) bad.push('empty hint');
  if (!inst.figure) bad.push('no figure');
  if (!inst.parts.length) bad.push('no parts');
  if (/undefined|NaN|Infinity|\[object|∞/.test(richOf(inst).join(' '))) bad.push('"undefined", "NaN" or "∞" in the text');
  const ids = new Set<string>();
  for (const p of inst.parts) {
    if (ids.has(p.id)) bad.push(`duplicate part id ${p.id}`);
    ids.add(p.id);
    if (!p.marks) bad.push(`${p.id}: no marks`);
    if (p.kind === 'numeric') {
      if (!Number.isFinite(p.answer)) bad.push(`${p.id}: answer not finite`);
      else {
        if (!checkNumeric(p, String(p.answer)).correct) bad.push(`${p.id}: own answer rejected`);
        const shown = p.unit === 'km' ? p.answer.toFixed(1) : String(Number(p.answer.toPrecision(4)));
        if (!checkNumeric(p, shown).correct) bad.push(`${p.id}: rounded answer ${shown} rejected`);
      }
      for (const t of p.traps ?? []) if (checkNumeric(p, String(t.value)).correct) bad.push(`${p.id}: trap ${t.value} accepted`);
    } else if (p.kind === 'choice') {
      const keys = p.options.map((o, i) => (o.correct ? i : -1)).filter((i) => i >= 0);
      if (keys.length !== 1) bad.push(`${p.id}: ${keys.length} keys`);
      if (p.options.length < 3) bad.push(`${p.id}: ${p.options.length} options`);
      if (new Set(p.options.map((o) => o.text)).size !== p.options.length) bad.push(`${p.id}: duplicate options`);
      if (p.options.some((o) => !o.why || !o.why.trim())) bad.push(`${p.id}: option without a why`);
      if (!checkChoice(p, keys).correct) bad.push(`${p.id}: key rejected`);
      const wrong = p.options.findIndex((o) => !o.correct);
      if (wrong >= 0 && checkChoice(p, [wrong]).correct) bad.push(`${p.id}: a wrong option accepted`);
    } else if (p.kind === 'custom') {
      const spec = seqPartData(p.render);
      if (spec) {
        const w = spec.run.expandedOrder;
        if (w.length < 4) bad.push(`${p.id}: only ${w.length} pops`);
        if (!judgeSeq(spec, w).correct) bad.push(`${p.id}: own sequence rejected`);
        if (!judgeSeq(spec, parseSeq(w.slice(1).join('').toLowerCase(), spec.ids)).correct) bad.push(`${p.id}: sequence without S (lower case, no commas) rejected`);
        if (judgeSeq(spec, [w[0], ...w.slice(1).reverse()]).correct) bad.push(`${p.id}: reversed sequence accepted`);
        if (judgeSeq(spec, w.slice(0, -1)).correct) bad.push(`${p.id}: sequence without the goal pop accepted`);
        if (judgeSeq(spec, [...w, w[1]]).correct) bad.push(`${p.id}: sequence running past the goal accepted`);
      }
    } else if (p.kind === 'order') {
      if (p.steps.length < 3) bad.push(`${p.id}: only ${p.steps.length} steps`);
      if (new Set(p.steps).size !== p.steps.length) bad.push(`${p.id}: repeated steps`);
      if (!checkOrder(p, p.steps.map((_, i) => i)).correct) bad.push(`${p.id}: own order rejected`);
      if (checkOrder(p, p.steps.map((_, i) => i).reverse()).correct) bad.push(`${p.id}: reversed order accepted`);
    }
  }
  return bad;
}

function sanityTest(id: string): SelfTest {
  return {
    id: `${id}-sanity`,
    topic: 'plan',
    title: `${id}: every tier × 40 seeds generates, deterministic, 4 hints, finite answers, valid KaTeX, own answers pass own checkers`,
    run: () => {
      const gen = generators.find((g) => g.id === id);
      if (!gen) return [isTrue(`${id} exists`, false)];
      const out: CheckResult[] = [];
      for (const tier of gen.tiers as Tier[]) {
        const fails: string[] = [];
        const tex: string[] = [];
        let marks = 0;
        let slowest = 0;
        for (let k = 0; k < 40; k++) {
          const seed = 100000 + 7919 * k + tier;
          let inst: SolveInstance;
          const t0 = Date.now();
          try {
            inst = gen.generate(makeRng(seed), tier);
          } catch (e) {
            fails.push(`seed ${seed}: threw ${(e as Error).message}`);
            continue;
          }
          slowest = Math.max(slowest, Date.now() - t0);
          if (gen.generate(makeRng(seed), tier).prompt !== inst.prompt) fails.push(`seed ${seed}: not deterministic`);
          fails.push(...instanceProblems(inst).map((p) => `seed ${seed}: ${p}`));
          tex.push(...texErrors(richOf(inst)).map((e) => `seed ${seed}: ${e}`));
          marks = Math.max(marks, inst.parts.reduce((t, p) => t + (p.marks ?? 0), 0));
        }
        out.push(isTrue(`tier ${tier}: 40 instances well formed`, fails.length === 0, fails.slice(0, 4).join(' | ')));
        out.push(isTrue(`tier ${tier}: KaTeX renders every formula`, tex.length === 0, tex.slice(0, 3).join(' | ')));
        out.push(isTrue(`tier ${tier}: 2 ≤ marks ≤ 6 (max ${marks})`, marks >= 2 && marks <= 6));
        out.push(isTrue(`tier ${tier}: slowest instance ${slowest} ms (< 400 ms)`, slowest < 400));
      }
      return out;
    },
  };
}

/** Instances of one generator and tier over 40 seeds. */
function instances(id: string, tier: Tier, n = 40): SolveInstance[] {
  const gen = generators.find((g) => g.id === id)!;
  return Array.from({ length: n }, (_, k) => gen.generate(makeRng(100000 + 7919 * k + tier), tier));
}

const keyOf = (inst: SolveInstance, partId: string): string => {
  const p = inst.parts.find((q) => q.id === partId);
  return p && p.kind === 'choice' ? p.options.find((o) => o.correct)?.text ?? '' : '';
};
const answerOf = (inst: SolveInstance, partId: string): number => {
  const p = inst.parts.find((q) => q.id === partId);
  return p && p.kind === 'numeric' ? p.answer : NaN;
};

// ------------------------------------------------------------------ grid helpers

const ALGOS: Algo[] = ['bfs', 'dfs', 'dijkstra', 'astar', 'greedy'];

/** graphSearch on a Grid with the labs' settings (h array, tie-break on h), pops as cell indices. */
function slowSearch(g: Grid, algo: Algo, diag: boolean, H: Float64Array) {
  const r = graphSearch(gridNeighbours(toGridMap(g), diag), idOfCell(g, g.start), idOfCell(g, g.goal), algo, { h: (id) => H[cellOfId(g, id)], tieBreak: 'h' });
  return { order: Int32Array.from(r.expandedOrder.map((id) => cellOfId(g, id))), cost: r.cost };
}

/** Cells where h exceeds the true cost to go (free cells that can reach the goal). */
function overCells(g: Grid, H: Float64Array, hStar: Float64Array): number {
  let n = 0;
  for (let k = 0; k < H.length; k++) if (g.cells[k] !== WALL && Number.isFinite(hStar[k]) && H[k] > hStar[k] + 1e-9) n++;
  return n;
}

function maxGap(g: Grid, H: Float64Array, hStar: Float64Array): number {
  let m = 0;
  for (let k = 0; k < H.length; k++) if (g.cells[k] !== WALL && Number.isFinite(hStar[k])) m = Math.max(m, Math.abs(H[k] - hStar[k]));
  return m;
}

const uniform = (w: WeightedGraph): WeightedGraph => ({ nodes: w.nodes, edges: w.edges.map(([a, b]) => [a, b, 1] as [string, string, number]) });

export const tests: SelfTest[] = [
  sanityTest('plan-search-order'),
  sanityTest('plan-admissible'),
  sanityTest('plan-bfs-weighted'),

  {
    id: 'plan-search-order-rules',
    topic: 'plan',
    title: 'plan-search-order follows its stated rules: BFS pops the first letter, DFS the last, Dijkstra the cheapest road; tier 3 always has exactly one parent update',
    run: () => {
      const t1 = instances('plan-search-order', 1);
      const fails: string[] = [];
      let distinct = 0;
      for (const inst of t1) {
        const letters = (inst.parts.find((p) => p.id === 'bfs') as { options: { text: string }[] }).options.map((o) => o.text).filter((t) => t !== 'S');
        const sorted = letters.slice().sort();
        if (keyOf(inst, 'bfs') !== sorted[0]) fails.push(`BFS key ${keyOf(inst, 'bfs')} is not ${sorted[0]}`);
        if (keyOf(inst, 'dfs') !== sorted[sorted.length - 1]) fails.push(`DFS key ${keyOf(inst, 'dfs')} is not ${sorted[sorted.length - 1]}`);
        if (keyOf(inst, 'dijkstra') === keyOf(inst, 'astar')) fails.push('Dijkstra and A* agree (a dull instance)');
        if (new Set(['bfs', 'dfs', 'dijkstra', 'astar'].map((a) => keyOf(inst, a))).size >= 3) distinct++;
      }
      const t2 = instances('plan-search-order', 2);
      const stepsOf = (inst: SolveInstance, id: string) => {
        const p = inst.parts.find((q) => q.id === id);
        const spec = p && p.kind === 'custom' ? seqPartData(p.render) : null;
        return spec ? spec.run.expandedOrder.join(',') : '';
      };
      const sameOrders = t2.filter((i) => stepsOf(i, 'order1') === stepsOf(i, 'order2')).length;
      const t3 = instances('plan-search-order', 3);
      const updates = (i: SolveInstance) => {
        const p = i.parts.find((q) => q.id === 'order');
        const spec = p && p.kind === 'custom' ? seqPartData(p.render) : null;
        return spec ? spec.run.steps.reduce((t, st) => t + st.updates.filter((u) => u.kind === 'improve').length, 0) : 0;
      };
      const withUpdate = t3.filter((i) => i.parts.some((p) => p.id === 'which') && updates(i) === 1).length;
      return [
        isTrue('tier 1: keys match the rules on 40 seeds', fails.length === 0, fails.slice(0, 3).join(' | ')),
        isTrue(`tier 1: at least 3 different answers among the 4 searches (${distinct}/40)`, distinct === 40),
        isTrue(`tier 2: the two searches pop in different orders (${40 - sameOrders}/40)`, sameOrders === 0),
        isTrue(`tier 3: exactly one parent update on every seed (${withUpdate}/40)`, withUpdate === 40),
      ];
    },
  },

  {
    id: 'plan-bfs-weighted-brisbane',
    topic: 'plan',
    title: '2024 Q29(a): BFS from KG to SL returns KG → H → SL (8.6 km), the shortest is KG → GP → SB → SL (7.8 km)',
    source: '2024 worked solutions Q29(a)',
    run: () => {
      const nb = alphaNeighbours(BRISBANE_2024);
      const b = graphSearch(nb, 'KG', 'SL', 'bfs');
      const d = graphSearch(nb, 'KG', 'SL', 'dijkstra');
      const t2 = instances('plan-bfs-weighted', 2);
      const bris = t2.filter((i) => i.prompt.includes('Brisbane'));
      const all = [...instances('plan-bfs-weighted', 1), ...t2];
      const flat = all.filter((i) => !(answerOf(i, 'bfs') >= answerOf(i, 'best') + 0.3)).length;
      return [
        isTrue(`every instance: the BFS route is at least 0.3 km longer than the shortest (${all.length - flat}/${all.length})`, flat === 0),
        isTrue('BFS route KG → H → SL', b.path?.join(' ') === 'KG H SL', b.path?.join(' ')),
        near('BFS route length', b.cost, 8.6, 1e-9),
        isTrue('shortest route KG → GP → SB → SL', d.path?.join(' ') === 'KG GP SB SL', d.path?.join(' ')),
        near('shortest length', d.cost, 7.8, 1e-9),
        isTrue(`tier 2 uses the exam map on some seeds (${bris.length}/40)`, bris.length >= 3),
        isTrue('…and then keys KG → H → SL, 8.6 km, 7.8 km', bris.every((i) => keyOf(i, 'route') === 'KG → H → SL' && Math.abs(answerOf(i, 'bfs') - 8.6) < 1e-9 && Math.abs(answerOf(i, 'best') - 7.8) < 1e-9)),
      ];
    },
  },

  {
    id: 'plan-admissible-manhattan',
    topic: 'plan',
    title: '2023 Q25 in the drill: Manhattan exceeds the true cost (straight line or octile) on every tier-3 instance',
    source: '2023 worked solutions Q25: (0,0) to (1,1) gives 2 > √2',
    run: () => {
      const t3 = instances('plan-admissible', 3);
      const fails: string[] = [];
      let grid8 = 0;
      for (const inst of t3) {
        const man = answerOf(inst, 'man');
        const hs = answerOf(inst, 'hstar');
        if (!(man > hs)) fails.push(`Manhattan ${man} ≤ h* ${hs}`);
        if (inst.prompt.includes('8-connected')) grid8++;
        if (!/not admissible/.test(inst.hints[3])) fails.push('worked solution does not conclude "not admissible"');
      }
      return [
        nearAbs('(0,0) → (1,1): Manhattan − straight line = 2 − √2', 2 - Math.hypot(1, 1), 2 - Math.SQRT2, 1e-12),
        isTrue('h_Man > h* on 40 tier-3 instances', fails.length === 0, fails.slice(0, 3).join(' | ')),
        isTrue(`both variants appear (8-connected on ${grid8}/40)`, grid8 >= 5 && grid8 <= 35),
      ];
    },
  },

  {
    id: 'plan-graph-equivalences',
    topic: 'plan',
    title: 'On road graphs (alphabetical neighbours): BFS = Dijkstra when every road costs the same; Dijkstra = A* with h = 0',
    source: 'Notes §5; 2023 Q9 (b) TRUE, 2024 Q9',
    run: () => {
      const fails: string[] = [];
      for (let k = 0; k < 40; k++) {
        const m = roadMap(5000 + k);
        const nbU = alphaNeighbours(uniform(m.graph));
        const bfs = graphSearch(nbU, m.start, m.goal, 'bfs');
        const dij = graphSearch(nbU, m.start, m.goal, 'dijkstra');
        if (bfs.expandedOrder.join() !== dij.expandedOrder.join()) fails.push(`map ${5000 + k}: uniform BFS ${bfs.expandedOrder.join('')} vs Dijkstra ${dij.expandedOrder.join('')}`);
        const nb = alphaNeighbours(m.graph);
        const d = graphSearch(nb, m.start, m.goal, 'dijkstra');
        const a0 = graphSearch(nb, m.start, m.goal, 'astar', { h: () => 0 });
        if (d.expandedOrder.join() !== a0.expandedOrder.join()) fails.push(`map ${5000 + k}: Dijkstra vs A*(h=0)`);
      }
      return [isTrue('40 road maps: identical pop orders', fails.length === 0, fails.slice(0, 3).join(' | '))];
    },
  },

  // ---------------------------------------------------------------- the grid labs' helpers

  {
    id: 'plan-grid-fast-equals-graph',
    topic: 'plan',
    title: 'Grid labs: gridEngine.fastSearch pops exactly what core graphSearch pops (every preset, algorithm, 4/8-connected)',
    run: () => {
      const fails: string[] = [];
      let runs = 0;
      for (const p of PRESETS) {
        const g = p.build();
        for (const diag of [false, true]) {
          for (const algo of ALGOS) {
            const kinds: HeuristicKind[] = algo === 'astar' || algo === 'greedy' ? ['manhattan', 'octile'] : ['manhattan'];
            for (const hk of kinds) {
              const H = heuristicArray(g, hk);
              const fast = fastSearch(g, algo, diag, { h: H, tieBreak: 'h' });
              const slow = slowSearch(g, algo, diag, H);
              runs++;
              if (!sameOrder(fast.order, slow.order) || Math.abs(fast.cost - slow.cost) > 1e-9) fails.push(`${p.id} ${diag ? '8' : '4'}-conn ${algo}/${hk}: ${fast.order.length} vs ${slow.order.length} pops`);
            }
          }
        }
      }
      return [isTrue(`${runs} runs identical`, fails.length === 0, fails.slice(0, 3).join(' | '))];
    },
  },

  {
    id: 'plan-grid-equivalences',
    topic: 'plan',
    title: 'Grid labs: BFS = Dijkstra on 4-connected maps without mud; Dijkstra = A* with h = 0 everywhere; Dijkstra cost = h*(S)',
    source: 'Notes §5 (search table); 2023 Q9, 2024 Q9',
    run: () => {
      const fails: string[] = [];
      const hstar: string[] = [];
      let uniformMaps = 0;
      for (const p of PRESETS) {
        const g = p.build();
        for (const diag of [false, true]) {
          const dij = fastSearch(g, 'dijkstra', diag);
          const a0 = fastSearch(g, 'astar', diag, { h: heuristicArray(g, 'zero') });
          if (!sameOrder(dij.order, a0.order)) fails.push(`${p.id} ${diag ? 8 : 4}: Dijkstra ≠ A*(h=0)`);
          const hs = costToGoGrid(g, diag);
          if (Math.abs(hs[g.start] - dij.cost) > 1e-9) hstar.push(`${p.id} ${diag ? 8 : 4}: h*(S) ${hs[g.start]} vs ${dij.cost}`);
          if (!diag && !hasMud(g)) {
            uniformMaps++;
            const bfs = fastSearch(g, 'bfs', false);
            if (!sameOrder(bfs.order, dij.order) || Math.abs(bfs.cost - dij.cost) > 1e-9) fails.push(`${p.id}: BFS ≠ Dijkstra on uniform costs`);
          }
        }
      }
      const mud = presetById('mud').build();
      const mBfs = fastSearch(mud, 'bfs', false);
      const mDij = fastSearch(mud, 'dijkstra', false);
      return [
        isTrue(`identical pop orders (${uniformMaps} uniform maps for BFS = Dijkstra)`, fails.length === 0, fails.slice(0, 3).join(' | ')),
        isTrue('Dijkstra’s cost equals costToGoGrid at S (directed mud costs)', hstar.length === 0, hstar.slice(0, 2).join(' | ')),
        near('mud preset: Dijkstra goes round, 17 + 12 = 29', mDij.cost, 29, 1e-9, 'the preset note: going round costs 12 extra steps'),
        near('mud preset: BFS wades straight through, 17 + 16 = 33', mBfs.cost, 33, 1e-9, 'the preset note: wading costs 16 extra'),
      ];
    },
  },

  {
    id: 'plan-grid-manhattan',
    topic: 'plan',
    title: 'Heuristic lab: Manhattan is exact on a 4-connected open grid but overestimates with diagonals (2023 Q25); octile exact, Euclidean admissible',
    source: '2023 Q25; notes §5 heuristic table',
    run: () => {
      const q = presetById('q25').build();
      const probe = Q25_PROBE(q);
      const hs8 = costToGoGrid(q, true);
      const hs4 = costToGoGrid(q, false);
      const man = heuristicArray(q, 'manhattan');
      const oct = heuristicArray(q, 'octile');
      const euc = heuristicArray(q, 'euclidean');
      const block = presetById('block').build();
      const bh8 = costToGoGrid(block, true);
      const blockMan = fastSearch(block, 'astar', true, { h: heuristicArray(block, 'manhattan'), tieBreak: 'h' });
      const blockOpt = fastSearch(block, 'dijkstra', true);
      return [
        near('probe cell: Manhattan h = 2', man[probe], 2, 1e-12),
        near('probe cell: true cost on the 8-connected grid = √2', hs8[probe], Math.SQRT2, 1e-12),
        isTrue('8-connected open grid: Manhattan overestimates somewhere', overCells(q, man, hs8) > 0, `${overCells(q, man, hs8)} cells`),
        nearAbs('4-connected open grid: Manhattan = h* everywhere', maxGap(q, man, hs4), 0, 1e-9),
        nearAbs('8-connected open grid: octile = h* everywhere', maxGap(q, oct, hs8), 0, 1e-9),
        isTrue('8-connected: Euclidean never overestimates', overCells(q, euc, hs8) === 0),
        isTrue('block preset, 8-connected: Manhattan overestimates there too', overCells(block, heuristicArray(block, 'manhattan'), bh8) > 0),
        isTrue(`block preset: A* with Manhattan returns ≥ the optimum (${blockMan.cost.toFixed(3)} vs ${blockOpt.cost.toFixed(3)})`, blockMan.cost >= blockOpt.cost - 1e-9),
      ];
    },
  },

  {
    id: 'plan-grid-inflated',
    topic: 'plan',
    title: 'Heuristic lab: A* with ε × Euclidean returns a path within ε × the optimum (ε = 1.5, 2, 3) on every preset',
    source: 'Notes §5 (weighted A*)',
    run: () => {
      const fails: string[] = [];
      for (const p of PRESETS) {
        const g = p.build();
        for (const diag of [false, true]) {
          const opt = fastSearch(g, 'dijkstra', diag).cost;
          if (!Number.isFinite(opt)) continue;
          for (const eps of [1.5, 2, 3]) {
            const r = fastSearch(g, 'astar', diag, { h: heuristicArray(g, 'inflated', eps), tieBreak: 'h' });
            if (!(r.cost <= eps * opt + 1e-9)) fails.push(`${p.id} ${diag ? 8 : 4} ε=${eps}: ${r.cost.toFixed(2)} > ${eps} × ${opt.toFixed(2)}`);
          }
        }
      }
      return [isTrue('bound holds on every preset', fails.length === 0, fails.slice(0, 3).join(' | '))];
    },
  },
];
