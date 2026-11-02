// Self-tests for RRT vs RRT* (plan-rrtstar), the by-hand model behind the RrtStarHand simulation, and the
// incremental RRT/RRT* engine behind the "PRM, RRT and RRT*" simulation.
import katex from 'katex';
import type { SelfTest, CheckResult } from '../../../selftest/types';
import type { SolveGenerator, SolveInstance } from '../../../engine/types';
import { isTrue, near, nearAbs } from '../../../selftest/assert';
import { makeRng } from '../../../engine/rng';
import { checkChoice, checkMatrix, checkNumeric } from '../../../engine/check';
import { rrtParentByHand, rrtStarParentByHand, rrtStarRewireByHand, rrtStep, segmentFree, treeInit, bestToGoal } from '../../../core/sampling';
import { analyse, edgeLen, examScene, randomScene, r1, type SceneSpec } from '../explore/rrtHandModel';
import { GrowRun, WORLDS } from '../explore/samplingEngine';
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
      for (const star of [false, true]) {
        const w = WORLDS.cluttered;
        const spec = { world: w.world, start: w.start, goal: w.goal, step: 0.6, goalBias: 0.05, star, radius: 1.3, check: 'edge' as const, seed: 4242, maxIt: 500 };
        const run = new GrowRun(spec);
        run.advance(500);
        const rng = makeRng(4242);
        const tree = treeInit(w.start);
        let mismatch = '';
        let bestMismatch = '';
        for (let i = 1; i <= 500; i++) {
          rrtStep(w.world, tree, rng.next, { step: 0.6, goalBias: 0.05, goal: w.goal, star, radius: 1.3 });
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
    id: 'plan-rrtstar-generator',
    topic: 'plan',
    title: 'plan-rrtstar generator: every tier × 40 seeds well formed (answers pass their own checks, traps are rejected, TeX parses)',
    run: () => generators.flatMap((g) => generatorSanity(g, 40)),
  },
];
