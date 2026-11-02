// Self-tests for RRT vs RRT* (plan-rrtstar), the by-hand model behind the RrtStarHand simulation, and the
// incremental RRT/RRT* engine behind the "PRM, RRT and RRT*" simulation.
import katex from 'katex';
import type { SelfTest, CheckResult } from '../../../selftest/types';
import type { SolveGenerator, SolveInstance } from '../../../engine/types';
import { isTrue, near, nearAbs } from '../../../selftest/assert';
import { makeRng } from '../../../engine/rng';
import { checkChoice, checkMatrix, checkNumeric } from '../../../engine/check';
import { rrtParentByHand, rrtStarParentByHand, rrtStarRewireByHand, rrtStep, segmentFree, treeInit, bestToGoal, prmBuild, prmQuery } from '../../../core/sampling';
import { mulberry32 } from '../../../engine/rng';
import { analyse, edgeLen, examScene, randomScene, r1, type SceneSpec } from '../explore/rrtHandModel';
import { GrowRun, WORLDS } from '../explore/samplingEngine';
import { PrmRun } from '../explore/samplingPrm';
import { shortestFreePath } from '../explore/samplingOptimal';
import { generators } from '../solve/rrtstar';

// ------------------------------------------------------------------ generator sanity (shared with tests/steer.ts)

/** Every TeX fragment ($…$, $$…$$) in a Rich string. */
function texIn(s: string): string[] {
  const src = s.replace(/\\\$/g, '\u0000');
  const out: string[] = [];
  const re = /\$\$([\s\S]+?)\$\$|\$([^$]+?)\$/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) out.push((m[1] ?? m[2]).replace(/\u0000/g, '\\$'));
  return out;
}

function texError(src: string, display: boolean): string {
  try {
    katex.renderToString(src, { displayMode: display, throwOnError: true, strict: 'ignore', output: 'html' });
    return '';
  } catch (e) {
    return `${(e as Error).message.slice(0, 120)} in "${src.slice(0, 80)}"`;
  }
}

/** Problems with one generated instance (empty when it is well formed). */
export function instanceProblems(inst: SolveInstance): string[] {
  const bad: string[] = [];
  const texts: string[] = [inst.prompt, ...inst.hints];
  if (inst.hints.length !== 4) bad.push(`${inst.hints.length} hints`);
  if (inst.hints.some((h) => !h || !h.trim())) bad.push('empty hint');
  if (!inst.parts.length) bad.push('no parts');
  const ids = new Set<string>();
  for (const p of inst.parts) {
    if (ids.has(p.id)) bad.push(`duplicate part id ${p.id}`);
    ids.add(p.id);
    texts.push(p.label);
    if (p.kind === 'numeric') {
      if (!Number.isFinite(p.answer)) bad.push(`${p.id}: answer not finite`);
      else if (!checkNumeric(p, String(p.answer)).correct) bad.push(`${p.id}: own answer rejected`);
      for (const t of p.traps ?? []) {
        texts.push(t.message);
        if (checkNumeric(p, String(t.value)).correct) bad.push(`${p.id}: trap ${t.value} accepted as correct`);
      }
    } else if (p.kind === 'choice') {
      const keys = p.options.map((o, i) => (o.correct ? i : -1)).filter((i) => i >= 0);
      if (p.options.length < 2) bad.push(`${p.id}: < 2 options`);
      if (!p.multi && keys.length !== 1) bad.push(`${p.id}: ${keys.length} correct options`);
      if (!checkChoice(p, keys).correct) bad.push(`${p.id}: own key rejected`);
      if (new Set(p.options.map((o) => o.text)).size !== p.options.length) bad.push(`${p.id}: duplicate option text`);
      for (const o of p.options) {
        texts.push(o.text);
        if (!o.why || !o.why.trim()) bad.push(`${p.id}: option without a why`);
        else texts.push(o.why);
      }
    } else if (p.kind === 'matrix') {
      if (p.answer.some((row) => row.some((x) => !Number.isFinite(x)))) bad.push(`${p.id}: matrix not finite`);
      else if (!checkMatrix(p, p.answer.map((row) => row.map(String))).correct) bad.push(`${p.id}: own matrix rejected`);
      texts.push(...(p.rowLabels ?? []), ...(p.colLabels ?? []));
    }
  }
  for (const g of inst.givens ?? []) {
    const e = texError(g.sym, false);
    if (e) bad.push(`given ${g.sym}: ${e}`);
    texts.push(g.value, g.label ?? '');
  }
  for (const t of texts) {
    if (/NaN|undefined|Infinity|\[object/.test(t)) bad.push(`bad text: "${t.slice(0, 70)}"`);
    const src = t.replace(/\\\$/g, '');
    if ((src.match(/\$/g) ?? []).length % 2) bad.push(`unbalanced $ in "${t.slice(0, 60)}"`);
    for (const tex of texIn(t)) {
      const e = texError(tex, false);
      if (e) bad.push(e);
    }
  }
  if (inst.figure && typeof inst.figure !== 'function') bad.push('figure is not a component');
  return bad;
}

/** Every tier x `seeds` seeds: generates, finite answers, 4 hints, own answers accepted, traps rejected, TeX parses. */
export function generatorSanity(gen: SolveGenerator, seeds = 40): CheckResult[] {
  return gen.tiers.map((tier) => {
    let bad = '';
    let parts = 0;
    for (let s = 1; s <= seeds && !bad; s++) {
      try {
        const inst = gen.generate(makeRng(s * 7919 + tier), tier);
        parts += inst.parts.length;
        const probs = instanceProblems(inst);
        if (probs.length) bad = `seed ${s * 7919 + tier}: ${probs.slice(0, 3).join('; ')}`;
      } catch (e) {
        bad = `seed ${s * 7919 + tier} threw ${(e as Error).message}`;
      }
    }
    return isTrue(`${gen.id} tier ${tier}: ${seeds} seeds well formed (${parts} parts)`, !bad, bad);
  });
}

// ------------------------------------------------------------------ tests

const SPECS: Record<1 | 2 | 3, SceneSpec> = {
  1: { neighbours: [3, 3], rewires: [0, 2], descendant: false, size: [8, 11] },
  2: { neighbours: [4, 4], rewires: [0, 2], descendant: false, size: [10, 13] },
  3: { neighbours: [4, 5], rewires: [1, 2], descendant: true, size: [10, 13] },
};

export const tests: SelfTest[] = [
  {
    id: 'plan-rrtstar-2025q29',
    topic: 'plan',
    title: '2025 Q29 through the by-hand tables: RRT → x_a; RRT* → x_b with c = 5.0; x_d rewired 9.9 → 8.5',
    source: '2025 worked solutions Q29 (a)–(c)',
    run: () => {
      const sc = examScene();
      const res = analyse(sc);
      const id = (l: string) => sc.nodes.find((n) => n.label === l)!.id;
      const nb = (l: string) => res.neighbours.find((n) => n.id === id(l))!;
      const rw = (l: string) => res.rewires.find((r) => r.id === id(l))!;
      return [
        isTrue('neighbours are exactly x_a, x_b, x_c, x_d', res.neighbours.map((n) => sc.nodes[n.id].label).join('') === 'abcd', res.neighbours.map((n) => sc.nodes[n.id].label).join('')),
        nearAbs('printed edge x0–x_b = 2.8', edgeLen(sc.nodes, id('b')), 2.8, 1e-9),
        nearAbs('printed edge x_b–x_a = 3.2', edgeLen(sc.nodes, id('a')), 3.2, 1e-9),
        nearAbs('printed edge x_b–x_c = 3.0', edgeLen(sc.nodes, id('c')), 3.0, 1e-9),
        nearAbs('printed edge x_c–x_d = 4.1', edgeLen(sc.nodes, id('d')), 4.1, 1e-9),
        nearAbs('d(x_a, x_new) = 1.5', nb('a').d, 1.5, 1e-9),
        nearAbs('d(x_b, x_new) = 2.2', nb('b').d, 2.2, 1e-9),
        nearAbs('d(x_c, x_new) = 2.8', nb('c').d, 2.8, 1e-9),
        nearAbs('d(x_d, x_new) = 3.5', nb('d').d, 3.5, 1e-9),
        nearAbs('c(x_a) = 6.0', nb('a').c, 6.0, 1e-9),
        nearAbs('c(x_c) = 5.8', nb('c').c, 5.8, 1e-9),
        nearAbs('c(x_d) = 9.9', nb('d').c, 9.9, 1e-9),
        isTrue('basic RRT connects to x_a (nearest)', res.nearest === id('a')),
        isTrue('RRT* parent is x_b', res.parent === id('b')),
        nearAbs('c(x_new) = 5.0', res.cNew, 5.0, 1e-9),
        nearAbs('RRT connection would cost 7.5', res.rrtCost, 7.5, 1e-9),
        nearAbs('x_a via x_new = 6.5 (not < 6.0)', rw('a').via, 6.5, 1e-9),
        nearAbs('x_c via x_new = 7.8 (not < 5.8)', rw('c').via, 7.8, 1e-9),
        nearAbs('x_d via x_new = 8.5', rw('d').via, 8.5, 1e-9),
        isTrue('only x_d is rewired', rw('d').rewire && !rw('a').rewire && !rw('c').rewire),
        nearAbs('c(x_d) after the rewire = 8.5', res.after[id('d')], 8.5, 1e-9),
        isTrue('x_d’s new parent is x_new', res.afterParent[id('d')] === sc.nodes.length),
        isTrue('no background vertex is inside the neighbourhood', sc.nodes.filter((n) => !'0abcd'.includes(n.label)).every((n) => Math.hypot(n.p.x - sc.xnew.x, n.p.y - sc.xnew.y) > sc.radius + 0.5)),
      ];
    },
  },
  {
    id: 'plan-rrtstar-model-vs-core',
    topic: 'plan',
    title: 'By-hand model agrees with core rrtParentByHand / rrtStarParentByHand / rrtStarRewireByHand (exam + 120 random trees)',
    source: 'core/sampling.ts by-hand helpers',
    run: () => {
      const out: CheckResult[] = [];
      const scenes = [examScene(), ...([1, 2, 3] as const).flatMap((t) => Array.from({ length: 40 }, (_, s) => randomScene(makeRng(1000 + s * 31 + t), SPECS[t]).scene))];
      let bad = '';
      let rewires = 0;
      let descendants = 0;
      scenes.forEach((sc, k) => {
        if (bad) return;
        const res = analyse(sc);
        const nbs = res.neighbours.map((n) => ({ id: String(n.id), cost: n.c, d: n.d }));
        const p = rrtStarParentByHand(nbs);
        const rw = rrtStarRewireByHand(nbs, p.parent, p.cost);
        if (rrtParentByHand(nbs) !== String(res.nearest)) bad = `scene ${k}: nearest differs`;
        else if (p.parent !== String(res.parent) || Math.abs(p.cost - res.cNew) > 1e-9) bad = `scene ${k}: parent differs`;
        else if (rw.some((r) => { const m = res.rewires.find((x) => String(x.id) === r.id); return !m || m.rewire !== r.rewire || Math.abs(m.via - r.via) > 1e-9; })) bad = `scene ${k}: rewire differs`;
        rewires += res.rewires.filter((r) => r.rewire).length;
        for (const d of res.descendants) {
          descendants++;
          const w = res.rewires.find((r) => r.id === d.from)!;
          if (Math.abs(d.old - d.now - (w.current - w.via)) > 1e-9) bad = `scene ${k}: descendant ${d.id} saving differs from its ancestor's`;
        }
      });
      out.push(isTrue(`${scenes.length} trees: same parent, cost and rewires as the core helpers`, !bad, bad));
      out.push(isTrue(`random trees exercise rewiring (${rewires} rewires, ${descendants} descendant updates)`, rewires > 60 && descendants > 20));
      return out;
    },
  },
  {
    id: 'plan-rrtstar-random-trees',
    topic: 'plan',
    title: 'Random practice trees are clear-cut: nearest ≠ RRT* parent, margins ≥ 0.2, rewire counts as asked',
    run: () =>
      ([1, 2, 3] as const).map((t) => {
        let bad = '';
        let ok = 0;
        for (let s = 1; s <= 60 && !bad; s++) {
          const r = randomScene(makeRng(s * 97 + t), SPECS[t]);
          if (!r.ok) continue;
          ok++;
          const res = analyse(r.scene);
          const n = res.neighbours.length;
          const k = res.rewires.filter((w) => w.rewire).length;
          if (n < SPECS[t].neighbours[0] || n > SPECS[t].neighbours[1]) bad = `seed ${s}: ${n} neighbours`;
          else if (res.nearest === res.parent) bad = `seed ${s}: nearest is also the RRT* parent`;
          else if (k < SPECS[t].rewires[0] || k > SPECS[t].rewires[1]) bad = `seed ${s}: ${k} rewires`;
          else if (res.rewires.some((w) => Math.abs(w.via - w.current) < 0.2 - 1e-9)) bad = `seed ${s}: a rewire margin under 0.2`;
          else if (r.scene.nodes.some((nd) => nd.id > 0 && edgeLen(r.scene.nodes, nd.id) < 1.2)) bad = `seed ${s}: an edge shorter than 1.2`;
          else if (t === 3 && (r.descendant === null || !res.descendants.some((d) => d.id === r.descendant))) bad = `seed ${s}: no descendant whose cost drops`;
          else if (res.neighbours.some((x) => Math.abs(r1(x.c + x.d) - x.total) > 1e-9)) bad = `seed ${s}: totals not exact`;
        }
        return isTrue(`tier ${t}: ${ok}/60 seeds built a fresh tree, all clear-cut`, !bad && ok >= 55, bad);
      }),
  },
  {
    id: 'plan-sampling-engine-vs-core',
    topic: 'plan',
    title: 'Simulation engine = core rrtStep node for node (RRT and RRT*, same samples), and its log replays any iteration',
    source: 'core/sampling.ts rrtStep, bestToGoal',
    run: () => {
      const out: CheckResult[] = [];
      // Goal bias 0 here: with goal samples core adds zero-length duplicates of a node sitting on the goal, which
      // the engine skips on purpose (plan-sampling-engine-no-duplicates checks that nothing else changes).
      for (const star of [false, true]) {
        const w = WORLDS.cluttered;
        const spec = { world: w.world, start: w.start, goal: w.goal, step: 0.6, goalBias: 0, star, radius: 1.3, check: 'edge' as const, seed: 4242, maxIt: 500 };
        const run = new GrowRun(spec);
        run.advance(500);
        const rng = makeRng(4242);
        const tree = treeInit(w.start);
        let mismatch = '';
        let bestMismatch = '';
        for (let i = 1; i <= 500; i++) {
          rrtStep(w.world, tree, rng.next, { step: 0.6, goalBias: 0, goal: w.goal, star, radius: 1.3 });
          const b = bestToGoal(w.world, tree, w.goal, 0.6);
          const mine = run.best[i];
          if (!bestMismatch && ((b === null) !== Number.isNaN(mine) || (b && Math.abs(b.cost - mine) > 1e-9))) bestMismatch = `iteration ${i}: core ${b?.cost} vs ${mine}`;
        }
        if (tree.nodes.length !== run.px.length) mismatch = `${tree.nodes.length} vs ${run.px.length} nodes`;
        else
          tree.nodes.forEach((n, k) => {
            if (mismatch) return;
            if (n.p.x !== run.px[k] || n.p.y !== run.py[k] || n.parent !== run.parent[k] || Math.abs(n.cost - run.cost[k]) > 1e-9) mismatch = `node ${k}`;
          });
        out.push(isTrue(`${star ? 'RRT*' : 'RRT'}: identical tree after 500 iterations (${run.px.length} nodes, ${run.rewiresAt[run.it]} rewires)`, !mismatch, mismatch));
        out.push(isTrue(`${star ? 'RRT*' : 'RRT'}: best cost to goal matches core bestToGoal at every iteration`, !bestMismatch, bestMismatch));
        // Replaying the log at iteration 300 gives the parents a fresh 300-iteration run ends with.
        const short = new GrowRun({ ...spec, maxIt: 300 });
        short.advance(300);
        const replay = run.parentsAt(300);
        out.push(isTrue(`${star ? 'RRT*' : 'RRT'}: log replay at iteration 300 = a fresh 300-iteration tree`, replay.length === short.parent.length && short.parent.every((p, k) => p === replay[k])));
      }
      return out;
    },
  },
  {
    id: 'plan-sampling-engine-no-duplicates',
    topic: 'plan',
    title: 'With goal bias the engine never adds a zero-length duplicate node; RRT still equals core bestToGoal at every iteration, RRT* stays a consistent tree whose best cost never rises',
    source: 'core/sampling.ts rrtStep, bestToGoal',
    run: () => {
      const out: CheckResult[] = [];
      for (const star of [false, true]) {
        const w = WORLDS.open;
        const run = new GrowRun({ world: w.world, start: w.start, goal: w.goal, step: 0.6, goalBias: 0.2, star, radius: 1.3, check: 'edge', seed: 77, maxIt: 600 });
        run.advance(600);
        const rng = makeRng(77);
        const tree = treeInit(w.start);
        let bestMismatch = '';
        for (let i = 1; i <= 600; i++) {
          rrtStep(w.world, tree, rng.next, { step: 0.6, goalBias: 0.2, goal: w.goal, star, radius: 1.3 });
          const b = bestToGoal(w.world, tree, w.goal, 0.6);
          if (!bestMismatch && ((b === null) !== Number.isNaN(run.best[i]) || (b && Math.abs(b.cost - run.best[i]) > 1e-9))) bestMismatch = `iteration ${i}: core ${b?.cost} vs ${run.best[i]}`;
        }
        const seen = new Set<string>();
        let dups = 0;
        for (let k = 0; k < run.px.length; k++) {
          const key = `${run.px[k]},${run.py[k]}`;
          if (seen.has(key)) dups++;
          seen.add(key);
        }
        const coreDups = tree.nodes.length - run.px.length;
        const skipped = run.log.filter((e) => e.dup).length;
        // core rrtStep and the engine both skip a sample that lands on an existing node, so they grow the same tree.
        out.push(isTrue(`${star ? 'RRT*' : 'RRT'}: no two nodes share a position, and core matches the engine node for node (engine skipped ${skipped} repeat goal samples)`, dups === 0 && coreDups === 0, `${dups} duplicates in the engine, core has ${coreDups} extra nodes`));
        if (!star) out.push(isTrue('RRT: best cost = core bestToGoal at every iteration (duplicates never change RRT)', !bestMismatch, bestMismatch));
        else {
          // Core's duplicates can trigger extra rewires of the goal node, so RRT* trees may differ from core here;
          // check the engine's own invariants instead.
          let rises = 0;
          for (let i = 1; i <= 600; i++) if (Number.isFinite(run.best[i - 1]) && run.best[i] > run.best[i - 1] + 1e-12) rises++;
          const worst = Math.max(...run.cost.map((c, k) => (k === 0 ? 0 : Math.abs(c - run.cost[run.parent[k]] - Math.hypot(run.px[k] - run.px[run.parent[k]], run.py[k] - run.py[run.parent[k]])))));
          out.push(isTrue('RRT*: best cost never rises, and every cost = parent cost + edge length', rises === 0 && worst < 1e-9, `${rises} rises, worst cost error ${worst}`));
        }
      }
      return out;
    },
  },
  {
    id: 'plan-sampling-engine-demos',
    topic: 'plan',
    title: 'Simulation presets behave as the lessons claim',
    source: 'Summary notes §5; 2023 Q32(c, d); review deck slide 15 (PRM* / RRT* asymptotic optimality)',
    run: () => {
      const out: CheckResult[] = [];
      // RRT* never ends worse than RRT on the same samples, and keeps improving after its first path.
      for (const key of ['open', 'cluttered', 'narrow'] as const) {
        const w = WORLDS[key];
        const base = { world: w.world, start: w.start, goal: w.goal, step: 0.5, goalBias: 0.05, radius: 1.2, check: 'edge' as const, seed: 7, maxIt: 1500 };
        const rrt = new GrowRun({ ...base, star: false });
        const star = new GrowRun({ ...base, star: true });
        rrt.advance(1500);
        star.advance(1500);
        const endR = rrt.best[1500];
        const endS = star.best[1500];
        out.push(isTrue(`${key}: both find a path within 1500 iterations`, Number.isFinite(endR) && Number.isFinite(endS), `RRT ${endR}, RRT* ${endS}`));
        out.push(isTrue(`${key}: RRT* ends at least 5 % shorter than RRT (${endS.toFixed(2)} vs ${endR.toFixed(2)})`, endS < 0.95 * endR));
        out.push(isTrue(`${key}: RRT* improves after its first path (${star.best[star.firstIt]?.toFixed(2)} → ${endS.toFixed(2)})`, star.firstIt > 0 && endS < star.best[star.firstIt] - 1e-6));
      }
      // Checking only the new node lets edges cut through the narrow-passage wall.
      const nw = WORLDS.narrow;
      const lazy = new GrowRun({ world: nw.world, start: nw.start, goal: nw.goal, step: 0.5, goalBias: 0.05, star: false, radius: 1.2, check: 'endpoint', seed: 7, maxIt: 600 });
      lazy.advance(600);
      const crossings = lazy.parentsAt(600).filter((p, k) => p >= 0 && !segmentFree(nw.world, { x: lazy.px[p], y: lazy.py[p] }, { x: lazy.px[k], y: lazy.py[k] })).length;
      out.push(isTrue(`endpoint-only checking: edges cross obstacles (${crossings} of ${lazy.px.length - 1})`, crossings > 0));
      out.push(isTrue('endpoint-only checking: every crossing edge is flagged for drawing', lazy.badAt(600).filter(Boolean).length === crossings));
      const safe = new GrowRun({ world: nw.world, start: nw.start, goal: nw.goal, step: 0.5, goalBias: 0.05, star: true, radius: 1.2, check: 'edge', seed: 7, maxIt: 600 });
      safe.advance(600);
      out.push(isTrue('edge checking: no tree edge crosses an obstacle', safe.parentsAt(600).every((p, k) => p < 0 || segmentFree(nw.world, { x: safe.px[p], y: safe.py[p] }, { x: safe.px[k], y: safe.py[k] }))));
      out.push(near('edge checking: cost of a node = parent cost + edge length (RRT*)', Math.max(...safe.cost.map((c, k) => (k === 0 ? 0 : Math.abs(c - safe.cost[safe.parent[k]] - Math.hypot(safe.px[k] - safe.px[safe.parent[k]], safe.py[k] - safe.py[safe.parent[k]])))) ) + 1, 1, 1e-9));
      return out;
    },
  },
  {
    id: 'plan-sampling-optimal',
    topic: 'plan',
    title: 'Shortest-possible reference: straight line when nothing is in the way, the tangent-arc-tangent length round a disc, and never beaten by a free PRM path',
    source: 'Visibility graph (samplingOptimal.ts); geometry of a path round a circle',
    run: () => {
      const out: CheckResult[] = [];
      const o = WORLDS.open;
      out.push(near('open world: the straight line', shortestFreePath(o.world, o.start, o.goal).cost, Math.hypot(8, 8), 1e-9));
      // Disc of radius 1 at (5, 5), start (2, 5), goal (8, 5): 2√8 + (π − 2 acos(1/3)) = 6.3365 m.
      const disc = { w: 10, h: 10, obstacles: [{ kind: 'circle' as const, x: 5, y: 5, r: 1 }] };
      const exact = 2 * Math.sqrt(8) + (Math.PI - 2 * Math.acos(1 / 3));
      const c = shortestFreePath(disc, { x: 2, y: 5 }, { x: 8, y: 5 }).cost;
      out.push(isTrue(`round a disc: ${c.toFixed(4)} m vs exact ${exact.toFixed(4)} m (polygon approximation, at most 0.6 % long)`, c >= exact - 1e-9 && c <= exact * 1.006));
      for (const key of ['narrow', 'cluttered', 'bugtrap'] as const) {
        const w = WORLDS[key];
        const sp = shortestFreePath(w.world, w.start, w.goal);
        const path = sp.path;
        const freePath = !!path && path.every((p, k) => k === 0 || segmentFree(w.world, path[k - 1], p));
        const prm = new PrmRun({ world: w.world, n: 400, connect: 'radius', radius: 1.5, k: 6, check: 'edge', seed: 5 });
        prm.advance(400);
        const q = prm.query(prm.count, w.start, w.goal);
        out.push(isTrue(`${key}: the reference path is collision-free and no longer than a 400-sample PRM path (${sp.cost.toFixed(2)} ≤ ${q.cost.toFixed(2)} m)`, freePath && sp.cost <= q.cost + 1e-9));
      }
      return out;
    },
  },
  {
    id: 'plan-sampling-prm-vs-core',
    topic: 'plan',
    title: 'Incremental PRM = core prmBuild (same samples, same radius edges) and its query = core prmQuery; queries never change the roadmap',
    source: 'core/sampling.ts prmBuild, prmConnect, prmQuery',
    run: () => {
      const out: CheckResult[] = [];
      for (const key of ['cluttered', 'narrow'] as const) {
        const w = WORLDS[key];
        const run = new PrmRun({ world: w.world, n: 300, connect: 'radius', radius: 1.4, k: 6, check: 'edge', seed: 21 });
        run.advance(300);
        const rm = prmBuild(w.world, mulberry32(21), 300, { radius: 1.4 });
        const keyOf = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
        const mine = new Set(run.ea.map((a, i) => keyOf(a, run.eb[i])));
        const core = new Set(rm.edges.map(([a, b]) => keyOf(a, b)));
        const samePts = rm.nodes.length === run.count && rm.nodes.every((p, i) => p.x === run.px[i] && p.y === run.py[i]);
        out.push(isTrue(`${key}: same ${run.count} samples and the same ${core.size} edges`, samePts && mine.size === core.size && [...mine].every((x) => core.has(x))));
        const edgesBefore = run.ea.length;
        const q = run.query(run.count, w.start, w.goal);
        const qc = prmQuery(w.world, rm, w.start, w.goal, { radius: 1.4 });
        out.push(isTrue(`${key}: query cost = core prmQuery (${q.cost.toFixed(4)} m)`, Number.isFinite(q.cost) && Math.abs(q.cost - qc.cost) < 1e-9, `${q.cost} vs ${qc.cost}`));
        run.query(run.count, { x: 8.5, y: 0.6 }, { x: 0.6, y: 9.2 });
        out.push(isTrue(`${key}: another query adds no samples or edges (${edgesBefore} edges before and after)`, run.ea.length === edgesBefore && run.count === 300));
      }
      const w = WORLDS.narrow;
      const lazy = new PrmRun({ world: w.world, n: 150, connect: 'radius', radius: 1.5, k: 6, check: 'endpoint', seed: 3 });
      lazy.advance(150);
      const crossing = lazy.ea.filter((a, i) => !segmentFree(w.world, { x: lazy.px[a], y: lazy.py[a] }, { x: lazy.px[lazy.eb[i]], y: lazy.py[lazy.eb[i]] })).length;
      out.push(isTrue(`end-point checking: ${crossing} roadmap edges cross the wall, all flagged`, crossing > 0 && lazy.ebad.reduce((s, b) => s + b, 0) === crossing));
      return out;
    },
  },
  {
    id: 'plan-sampling-demo-claims',
    topic: 'plan',
    title: 'The "Show me" scenarios of the PRM / RRT / RRT* simulation show what their explanations say',
    source: 'SamplingPlanners.tsx predictions; 2023 Q32(c, d); 2023 Q10, 2024 Q11; review deck slide 15',
    run: () => {
      const out: CheckResult[] = [];
      const grow = (key: 'open' | 'narrow' | 'cluttered', star: boolean, extra: { radius?: number; check?: 'edge' | 'endpoint'; seed: number }) => {
        const w = WORLDS[key];
        const r = new GrowRun({ world: w.world, start: w.start, goal: w.goal, step: 0.6, goalBias: 0.05, radius: extra.radius ?? 1.5, check: extra.check ?? 'edge', seed: extra.seed, maxIt: 2000, star });
        r.advance(2000);
        return r;
      };
      const pct = (c: number, key: 'open' | 'narrow' | 'cluttered') => (c / shortestFreePath(WORLDS[key].world, WORLDS[key].start, WORLDS[key].goal).cost - 1) * 100;
      // 1. Open world, seed 9: RRT's first path never changes; RRT* ends within 1 % of the straight line.
      const rrt = grow('open', false, { seed: 9 });
      const star = grow('open', true, { seed: 9 });
      out.push(isTrue(`open, seed 9: RRT's cost is identical from its first path (it ${rrt.firstIt}) to it 2000, ${pct(rrt.best[2000], 'open').toFixed(1)} % above the shortest`, rrt.firstIt > 0 && rrt.best[rrt.firstIt] === rrt.best[2000] && pct(rrt.best[2000], 'open') > 20));
      out.push(isTrue(`open, seed 9: RRT* ends ${pct(star.best[2000], 'open').toFixed(2)} % above the shortest (< 1 %)`, pct(star.best[2000], 'open') < 1));
      // 2. Narrow passage, end-point checking, seed 1: the first path crosses the wall, early and too short.
      const lazy = grow('narrow', false, { check: 'endpoint', seed: 1 });
      const lp = lazy.pathAt(lazy.firstIt);
      const crosses = !!lp && lp.some((p, k) => k > 0 && !segmentFree(WORLDS.narrow.world, lp[k - 1], p));
      out.push(isTrue(`narrow, end points only: first path at it ${lazy.firstIt} crosses the wall and is shorter than any real path`, crosses && lazy.firstIt < 80 && pct(lazy.best[lazy.firstIt], 'narrow') < 0));
      // 3. Cluttered, seed 1: r = 0.6 m ends worse but with far fewer checks than r = 1.5 m.
      const small = grow('cluttered', true, { radius: 0.6, seed: 1 });
      const big = grow('cluttered', true, { radius: 1.5, seed: 1 });
      out.push(isTrue(`cluttered, seed 1: r = 0.6 m ends ${pct(small.best[2000], 'cluttered').toFixed(1)} % above, r = 1.5 m ${pct(big.best[2000], 'cluttered').toFixed(1)} %`, pct(small.best[2000], 'cluttered') > 2 && pct(big.best[2000], 'cluttered') < 1));
      out.push(isTrue(`cluttered, seed 1: ${small.checksAt[2000]} vs ${big.checksAt[2000]} collision checks (about a fifth)`, small.checksAt[2000] < 0.3 * big.checksAt[2000] && small.checksAt[2000] > 0.12 * big.checksAt[2000]));
      // 4. Sparse PRM in the open world: no path, many pieces.
      const o = WORLDS.open;
      const sparse = new PrmRun({ world: o.world, n: 60, connect: 'radius', radius: 0.6, k: 6, check: 'edge', seed: 1 });
      sparse.advance(60);
      const sq = sparse.query(60, o.start, o.goal);
      out.push(isTrue(`open, 60 samples, r = 0.6 m: no path, ${sparse.components(60).count} pieces`, !Number.isFinite(sq.cost) && sparse.components(60).count > 20));
      // 5. The default view (cluttered, RRT*, seed 1) finds a path early.
      const def = grow('cluttered', true, { seed: 1 });
      out.push(isTrue(`default view: RRT* finds its first path at it ${def.firstIt} (< 300)`, def.firstIt > 0 && def.firstIt < 300));
      return out;
    },
  },
  {
    id: 'plan-rrtstar-generator',
    topic: 'plan',
    title: 'plan-rrtstar generator: every tier × 40 seeds well formed (answers pass their own checks, traps are rejected, TeX parses)',
    run: () => generators.flatMap((g) => generatorSanity(g, 40)),
  },
];
