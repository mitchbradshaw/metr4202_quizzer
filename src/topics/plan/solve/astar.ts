// A* by hand (plan-astar), the planning long answer of 2024 Q29 and review deck slide 17.
//   Tier 1: one expansion: g and f of each neighbour, then the next pop.
//   Tier 2: the full exam question on a random road map (sometimes the printed Brisbane or Australia
//           numbers): an Open/Closed step table checked step by step, then the route and its length.
//   Tier 3: a twist: one inadmissible heuristic value (which, what A* returns, the true shortest), or a
//           parent update to spot.
import type { ChoicePart, NumericPart, SolveGenerator, SolveInstance, SolvePart, Tier } from '../../../engine/types';
import type { Rng } from '../../../engine/rng';
import { costToGo, graphSearch, neighboursOf, type WeightedGraph } from '../../../core/graph';
import { pickRoadMap, type RoadMap, type RoadMapStats } from '../../../core/roadgen';
import { australiaMap, brisbaneMap, mapFromRoad, type MapDef } from '../explore/astarMaps';
import {
  closedTeX,
  expectedEntries,
  hTableTeX,
  num,
  openTeX,
  pathSum,
  popLine,
  runExam,
  updateLine,
  workedSteps,
  type ExamStep,
  type ExamTrace,
  type NameOf,
} from '../explore/astarTable';
import { makeAStarFigure, makeAStarTablePart } from '../explore/astarSolve';

interface Problem {
  map: MapDef;
  start: string;
  goal: string;
  h: Record<string, number>;
  name: NameOf;
  unit: string;
  kind: 'brisbane' | 'australia' | 'random';
}

const TOL = { tol: 0.01, absTol: 0.05 };

function examProblem(kind: 'brisbane' | 'australia'): Problem {
  const map = kind === 'brisbane' ? brisbaneMap() : australiaMap();
  return { map, start: map.start, goal: map.goal, h: map.hFor(map.goal)!, name: map.name, unit: map.unit, kind };
}

function fromRoad(m: RoadMap): Problem {
  const map = mapFromRoad(m);
  return { map, start: m.start, goal: m.goal, h: m.h, name: map.name, unit: 'km', kind: 'random' };
}

/** A random map that suits a hand calculation: 5–8 pops, the goal 3+ roads away, no ties for the lowest f. */
function randomProblem(rng: Rng, want: (s: RoadMapStats) => boolean): Problem {
  const base = (s: RoadMapStats) => s.pathEdges >= 3 && s.pops >= 4 && s.pops <= 8 && !s.tieAtPop;
  const seed = rng.int(1, 999999);
  return fromRoad(pickRoadMap(seed, (m, s) => base(s) && want(s), 150));
}

const pathText = (p: readonly string[], name: NameOf) => p.map(name).join(' → ');
const fmtLen = (x: number, unit: string) => `${num(x)} ${unit}`;

/** Simple routes from s to g no longer than `bound` (for distractors), cheapest first. */
function simpleRoutes(graph: WeightedGraph, s: string, g: string, bound: number, limit = 4000): { path: string[]; cost: number }[] {
  const nb = neighboursOf(graph);
  const out: { path: string[]; cost: number }[] = [];
  const seen = new Set<string>([s]);
  const path = [s];
  const dfs = (u: string, c: number) => {
    if (out.length >= limit) return;
    if (u === g) {
      out.push({ path: path.slice(), cost: c });
      return;
    }
    for (const [v, w] of nb(u)) {
      if (seen.has(v) || c + w > bound + 1e-9) continue;
      seen.add(v);
      path.push(v);
      dfs(v, c + w);
      path.pop();
      seen.delete(v);
    }
  };
  dfs(s, 0);
  return out.sort((a, b) => a.cost - b.cost || a.path.length - b.path.length);
}

/** "Which route?" choice: the true route plus the routes a typical slip produces. */
function routeChoice(p: Problem, t: ExamTrace, label: string, id = 'path', marks = 1): ChoicePart {
  const best = t.path!;
  const key = (r: readonly string[]) => r.join('>');
  const opts: { text: string; correct: boolean; why: string }[] = [
    { text: pathText(best, p.name), correct: true, why: `Parents traced back from ${p.name(p.goal)}: ${best.slice().reverse().map(p.name).join(' ← ')}. Length $${pathSum(p.map.graph, best).text}$ ${p.unit}.` },
  ];
  const used = new Set([key(best)]);
  const add = (r: readonly string[] | null | undefined, why: string) => {
    if (!r || used.has(key(r)) || opts.length >= 4) return;
    used.add(key(r));
    opts.push({ text: pathText(r, p.name), correct: false, why });
  };
  const nb = neighboursOf(p.map.graph);
  // The goal's first parent chain (what stopping at insertion would answer).
  const ga = t.goalAdded;
  if (ga && Math.abs(ga.g - t.cost) > 1e-9) {
    const chain: string[] = [p.goal];
    let n: string | null = ga.parent;
    const closedAtAdd = t.steps[ga.k - 1].closed;
    while (n) {
      chain.unshift(n);
      n = closedAtAdd.find((c) => c.node === n)?.parent ?? null;
    }
    add(chain, `This is the route ${p.name(p.goal)} had when it first entered Open (step ${ga.k}, ${fmtLen(ga.g, p.unit)}). A cheaper parent replaced it before the goal was popped: the goal test is at the pop.`);
  }
  const bfs = graphSearch(nb, p.start, p.goal, 'bfs');
  add(bfs.path, `Fewest roads (${(bfs.path?.length ?? 1) - 1}), which is what BFS returns, but ${fmtLen(bfs.path ? pathSum(p.map.graph, bfs.path).total : NaN, p.unit)}: longer than the shortest.`);
  const greedy = graphSearch(nb, p.start, p.goal, 'greedy', { h: (n) => p.h[n] ?? 0 });
  add(greedy.path, `Always heading for the lowest $h$ (greedy best-first) gives this route, ${fmtLen(greedy.path ? pathSum(p.map.graph, greedy.path).total : NaN, p.unit)}: it ignores the distance already driven.`);
  for (const r of simpleRoutes(p.map.graph, p.start, p.goal, t.cost * 2.2))
    add(r.path, `${fmtLen(r.cost, p.unit)}, which is ${fmtLen(r.cost - t.cost, p.unit)} longer than the shortest route.`);
  return { kind: 'choice', id, label, options: opts, marks };
}

function lengthPart(p: Problem, t: ExamTrace, label: string, marks = 1, id = 'len'): NumericPart {
  const traps: NumericPart['traps'] = [];
  const ga = t.goalAdded;
  if (ga && Math.abs(ga.g - t.cost) > 0.05)
    traps.push({ value: ga.g, message: `That is ${p.name(p.goal)}'s cost when it first entered Open (step ${ga.k}). Its entry improved later; A* only stops when the goal is **popped**.`, trapId: 'plan-astar-goal-early' });
  const nb = neighboursOf(p.map.graph);
  const bfs = graphSearch(nb, p.start, p.goal, 'bfs');
  if (bfs.path) {
    const c = pathSum(p.map.graph, bfs.path).total;
    if (Math.abs(c - t.cost) > 0.05 && !traps.some((x) => Math.abs(x.value - c) < 0.05)) traps.push({ value: c, message: 'That is the length of the fewest-roads route (BFS), not the shortest one.' });
  }
  const second = simpleRoutes(p.map.graph, p.start, p.goal, t.cost * 2).find((r) => r.cost > t.cost + 0.05);
  if (second && !traps.some((x) => Math.abs(x.value - second.cost) < 0.05))
    traps.push({ value: second.cost, message: `That is the second-shortest route (${pathText(second.path, p.name)}).` });
  return { kind: 'numeric', id, label, answer: t.cost, unit: p.unit, ...TOL, traps, marks };
}

const CONCEPT =
  'A* expands the Open town with the lowest $f = g + h$: $g$ is the road distance already driven from the start and $h$ the straight-line distance still to go. A road is never shorter than the straight line, so $h$ never overestimates (it is **admissible**) and the first time the goal is **popped** its route is the shortest. Do not stop when the goal first enters Open.';

const SETUP =
  '$$f(n) = g(n) + h(n), \\qquad g(m) = g(n) + c(n, m)$$\n\n1. Open = {start: $g = 0$, $f = 0 + h$}; Closed is empty.\n2. Pop the Open town with the lowest $f$ and move it to Closed.\n3. For each neighbour $m$ not in Closed: if new, add it with parent $n$; if already in Open with a larger $g$, replace its $g$ and parent; otherwise leave it.\n4. Repeat until the goal is popped, then follow the parents back.';

function firstSteps(t: ExamTrace, name: NameOf, n = 2): string {
  return t.steps
    .slice(0, n)
    .map((s) => {
      const lines = s.updates.filter((u) => u.kind !== 'closed').map((u) => `- ${updateLine(u, s, 'astar', name)}`);
      return `**Step ${s.k}.** ${popLine(s, 'astar', name, t.goal)}${lines.length ? `\n\n${lines.join('\n')}` : ''}`;
    })
    .join('\n\n');
}

function finalLine(p: Problem, t: ExamTrace): string {
  const sum = pathSum(p.map.graph, t.path!);
  return `Trace the parents back: ${t.path!.slice().reverse().map(p.name).join(' ← ')}.\n\n**Shortest route: ${pathText(t.path!, p.name)}; length $${sum.text}$ ${p.unit}.**`;
}

function problemFor(rng: Rng, tier: Tier, want: (s: RoadMapStats) => boolean): Problem {
  const r = rng.next();
  if (tier === 2 && r < 0.12) return examProblem('brisbane');
  if (tier === 2 && r < 0.2) return examProblem('australia');
  return randomProblem(rng, want);
}

const intro = (p: Problem) =>
  p.kind === 'brisbane'
    ? 'The 2024 exam question: a free shuttle runs between Brisbane campuses. Road distances (km) are on the map (not to scale); the table gives the straight-line distance $h$ from each campus to Mount Gravatt (MG).'
    : p.kind === 'australia'
      ? 'The review deck question: road distances (km) between Australian cities are on the map; the table gives the geodetic (straight-line) distance $h$ from each city to Alice Springs.'
      : `A delivery robot drives on the road network below (road lengths in km, drawn to scale). The table gives the straight-line distance $h$ from each town to ${p.name(p.goal)}, rounded down to 0.1 km.`;

// ------------------------------------------------------------------ tier 1: one expansion

function tier1(rng: Rng): SolveInstance {
  let p: Problem;
  let t: ExamTrace;
  let step: ExamStep | undefined;
  const r = rng.next();
  const score = (s: ExamStep) => {
    const es = expectedEntries(s, 'astar', p.name);
    if (s.isGoal || es.length < 2 || es.length > 3) return -1;
    return (es.some((e) => e.kind === 'improve') ? 3 : 0) + (es.some((e) => e.kind === 'worse') ? 2 : 0) + (s.k >= 2 ? 1 : 0);
  };
  if (r < 0.1) {
    p = examProblem('brisbane');
    t = runExam(p.map.graph, p.start, p.goal, 'astar', (n) => p.h[n]);
    step = t.steps[1]; // pop GP: H is reached by a worse route, SB is new
  } else if (r < 0.2) {
    p = examProblem('australia');
    t = runExam(p.map.graph, p.start, p.goal, 'astar', (n) => p.h[n]);
    step = rng.pick([t.steps[1], t.steps[3]]); // pop Melbourne (three new), or Adelaide (Alice Springs not improved)
  } else {
    p = randomProblem(rng, (s) => s.worses + s.improves > 0);
    t = runExam(p.map.graph, p.start, p.goal, 'astar', (n) => p.h[n]);
    const scored = t.steps.map((s) => ({ s, v: score(s) })).filter((x) => x.v >= 0);
    const top = Math.max(-1, ...scored.map((x) => x.v));
    step = top >= 0 ? rng.pick(scored.filter((x) => x.v === top)).s : t.steps.find((s) => !s.isGoal && expectedEntries(s, 'astar', p.name).length > 0);
  }
  if (!step) step = t.steps[0];
  const name = p.name;
  const P = name(step.popped);
  const closedBefore = step.k > 1 ? t.steps[step.k - 2].closed : [];
  const entries = expectedEntries(step, 'astar', name).slice(0, 3);
  const parts: SolvePart[] = [];
  for (const e of entries) {
    const u = step.updates.find((x) => x.node === e.node)!;
    const Y = name(e.node);
    const gTraps: NumericPart['traps'] = [];
    const fTraps: NumericPart['traps'] = [];
    if (e.kind === 'add') {
      gTraps.push({ value: u.cost, message: `That is only the road ${P}–${Y}. $g$ is the whole distance from the start: $g(${P}) + c = ${num(step.row.g)} + ${num(u.cost)}$.`, trapId: 'plan-astar-g-edge' });
      fTraps.push({ value: e.g, message: 'That is $g$. The priority adds the heuristic: $f = g + h$.' });
      fTraps.push({ value: u.cost + e.h, message: `You used only the road ${P}–${Y} for $g$; add the distance to ${P} first.`, trapId: 'plan-astar-g-edge' });
    } else if (e.kind === 'improve') {
      gTraps.push({ value: u.oldG ?? NaN, message: `${Y} was already in Open with $g = ${num(u.oldG ?? NaN)}$, but the route via ${P} is cheaper ($${num(u.g)}$), so its entry is replaced.`, trapId: 'plan-astar-missed-improve' });
      fTraps.push({ value: (u.oldG ?? NaN) + e.h, message: `That is ${Y}'s old $f$. Via ${P} it is cheaper, so update it.`, trapId: 'plan-astar-missed-improve' });
    } else {
      gTraps.push({ value: u.g, message: `Via ${P} the route is $${num(u.g)}$, longer than ${Y}'s current $g = ${num(e.g)}$: keep the cheaper entry (and its parent).`, trapId: 'plan-astar-worse-route' });
      fTraps.push({ value: u.g + e.h, message: `That is $f$ via ${P}, but ${Y} keeps its cheaper existing entry.`, trapId: 'plan-astar-worse-route' });
    }
    parts.push({ kind: 'numeric', id: `g-${e.node}`, label: `$g$ of **${Y}** in Open after expanding ${P}`, answer: e.g, unit: p.unit, ...TOL, traps: gTraps.filter((x) => Number.isFinite(x.value) && Math.abs(x.value - e.g) > 0.05), marks: 1 });
    parts.push({ kind: 'numeric', id: `f-${e.node}`, label: `$f = g + h$ of **${Y}**`, answer: e.value, unit: p.unit, ...TOL, traps: fTraps.filter((x) => Number.isFinite(x.value) && Math.abs(x.value - e.value) > 0.05), marks: 1 });
  }
  // Which town is popped next?
  const nextRow = step.open[0];
  const closedNow = new Set(step.closed.map((c) => c.node));
  const options: ChoicePart['options'] = step.open.slice(0, 4).map((r, idx) => ({
    text: name(r.node),
    correct: idx === 0,
    why:
      idx === 0
        ? `Lowest $f$ in Open: $${num(r.g)} + ${num(r.h)} = ${num(r.f)}$.${r.node === p.goal ? ' It is the goal, so the search stops when it is popped.' : ''}`
        : `$f = ${num(r.g)} + ${num(r.h)} = ${num(r.f)}$ is higher than ${name(nextRow.node)}'s ${num(nextRow.f)}.${r.node === p.goal ? ' Being the goal does not let it jump the queue.' : ''}`,
  }));
  for (const c of step.closed) {
    if (options.length >= 3) break;
    if (!closedNow.has(c.node)) continue;
    options.push({ text: name(c.node), correct: false, why: `${name(c.node)} is in Closed: it has been expanded and is never popped again.` });
  }
  parts.push({ kind: 'choice', id: 'next', label: `Which town does A* pop at step ${step.k + 1}?`, options, marks: 1 });

  const lines = step.updates.map((u) => `- ${updateLine(u, step!, 'astar', name)}`);
  const firstE = entries[0];
  const firstU = firstE ? step.updates.find((x) => x.node === firstE.node)! : undefined;
  return {
    prompt: `${intro(p)}\n\n${hTableTeX(p.map.graph.nodes.map((n) => n.id), (n) => p.h[n], name, p.goal, p.unit)}\n\nA* is searching from ${name(p.start)} to ${name(p.goal)}. After ${step.k - 1 === 0 ? 'initialisation' : `step ${step.k - 1}`} the tables are:\n\n$$${openTeX(step.before, 'astar', name)} \\qquad ${closedTeX(closedBefore, name)}$$\n\nStep ${step.k} pops **${P}** ($f = ${num(step.row.g)} + ${num(step.row.h)} = ${num(step.row.f)}$, the lowest) and moves it to Closed. Update its neighbours.`,
    figure: makeAStarFigure(p.map, p.start, p.goal, p.h),
    parts,
    hints: [
      `Expanding ${P} relaxes every road out of it: the route via ${P} to a neighbour $m$ costs $g(${P}) + c(${P}, m)$. A town in Closed is final (skip it). A town already in Open keeps whichever $g$ is smaller, together with that route's parent.`,
      `$$g(m) = g(${P}) + c(${P}, m), \\qquad f(m) = g(m) + h(m)$$\n\nNew town: add it with parent ${P}. Already in Open: replace $g$ and parent only if the new $g$ is smaller. Then pop the lowest $f$.`,
      firstE && firstU
        ? `$g(${P}) = ${num(step.row.g)}$. For ${name(firstE.node)}: $${num(step.row.g)} + ${num(firstU.cost)} = ${num(firstU.g)}$${firstE.kind === 'add' ? '' : `, compared with its current $g = ${num(firstU.oldG ?? NaN)}$`}.`
        : `$g(${P}) = ${num(step.row.g)}$.`,
      `${lines.join('\n')}\n\nTables after step ${step.k}:\n\n$$${openTeX(step.open, 'astar', name)} \\qquad ${closedTeX(step.closed, name)}$$\n\n**Next pop: ${name(nextRow.node)}** with the lowest $f = ${num(nextRow.f)}$ ${p.unit}.${entries.length ? `\n\n**Answers:** ${entries.map((e) => `${name(e.node)}: $g = ${num(e.g)}$, $f = ${num(e.value)}$ ${p.unit}`).join('; ')}.` : ''}`,
    ],
  };
}

// ------------------------------------------------------------------ tier 2: the exam question

function tier2(rng: Rng): SolveInstance {
  const p = problemFor(rng, 2, (s) => s.pops >= 5 && s.improves + s.worses > 0);
  const t = runExam(p.map.graph, p.start, p.goal, 'astar', (n) => p.h[n]);
  const name = p.name;
  return {
    prompt: `${intro(p)}\n\n${hTableTeX(p.map.graph.nodes.map((n) => n.id), (n) => p.h[n], name, p.goal, p.unit)}\n\nUse A* to find the shortest route from **${name(p.start)}** to **${name(p.goal)}**. Keep an Open table (town, priority $f = g + h$, parent) and a Closed table (town, cost $g$, parent), and show both at every step.`,
    figure: makeAStarFigure(p.map, p.start, p.goal, p.h),
    parts: [
      {
        kind: 'custom',
        id: 'table',
        label: 'Run A*: at each step pick the town popped from Open, then type $f = g + h$ for each of its neighbours not in Closed, as it stands in Open after the step. Each step is marked when you submit it.',
        render: makeAStarTablePart(t, name),
        marks: 5,
      },
      routeChoice(p, t, `Trace the parents back from ${name(p.goal)}. The shortest route is:`),
      lengthPart(p, t, 'Its length'),
    ],
    hints: [CONCEPT, SETUP, firstSteps(t, name, 2), `${workedSteps(t, name)}\n\n${finalLine(p, t)}`],
  };
}

// ------------------------------------------------------------------ tier 3: twists

/** One overestimated h that makes A* return a longer route (searched over maps and towns). */
function inadmissibleProblem(rng: Rng): { p: Problem; bad: string; v: number; t: ExamTrace; tTrue: ExamTrace; hStar: Map<string, number> } {
  const tryProblem = (p: Problem) => {
    const nb = neighboursOf(p.map.graph);
    const ids = p.map.graph.nodes.map((n) => n.id);
    const hStar = costToGo(nb, ids, p.goal);
    const tTrue = runExam(p.map.graph, p.start, p.goal, 'astar', (n) => p.h[n]);
    if (!tTrue.path) return null;
    const interior = tTrue.path.slice(1, -1);
    for (const x of rng.shuffle(interior)) {
      const hs = hStar.get(x)!;
      for (let v = Math.ceil(hs) + 1; v <= 2 * hs + 6; v += 0.5) {
        const h2 = { ...p.h, [x]: v };
        const t2 = runExam(p.map.graph, p.start, p.goal, 'astar', (n) => h2[n]);
        const tie = t2.steps.some((s) => s.ties.length > 0);
        if (t2.path && t2.cost > tTrue.cost + 0.05 && !tie && t2.steps.length <= 9) return { p: { ...p, h: h2 }, bad: x, v, t: t2, tTrue, hStar };
      }
    }
    return null;
  };
  if (rng.next() < 0.15) {
    const p = examProblem('brisbane');
    const v = rng.pick([16, 18, 20]);
    const h2: Record<string, number> = { ...p.h, SB: v };
    const nb = neighboursOf(p.map.graph);
    const hStar = costToGo(nb, p.map.graph.nodes.map((n) => n.id), p.goal);
    return { p: { ...p, h: h2 }, bad: 'SB', v, t: runExam(p.map.graph, p.start, p.goal, 'astar', (n) => h2[n]), tTrue: runExam(p.map.graph, p.start, p.goal, 'astar', (n) => p.h[n]), hStar };
  }
  for (let k = 0; k < 40; k++) {
    const res = tryProblem(randomProblem(rng, (s) => s.pops >= 4));
    if (res) return res;
  }
  // Fallback (never seen in tests): Brisbane with h(SB) = 20.
  const p = examProblem('brisbane');
  const h2: Record<string, number> = { ...p.h, SB: 20 };
  const hStar = costToGo(neighboursOf(p.map.graph), p.map.graph.nodes.map((n) => n.id), p.goal);
  return { p: { ...p, h: h2 }, bad: 'SB', v: 20, t: runExam(p.map.graph, p.start, p.goal, 'astar', (n) => h2[n]), tTrue: runExam(p.map.graph, p.start, p.goal, 'astar', (n) => p.h[n]), hStar };
}

function tier3Inadmissible(rng: Rng): SolveInstance {
  const { p, bad, v, t, tTrue, hStar } = inadmissibleProblem(rng);
  const name = p.name;
  const X = name(bad);
  const ids = p.map.graph.nodes.map((n) => n.id);
  const routeTo = (n: string) => {
    const r = graphSearch(neighboursOf(p.map.graph), n, p.goal, 'dijkstra');
    return r.path ? pathText(r.path, name) : '';
  };
  const others = rng.shuffle(ids.filter((n) => n !== bad && n !== p.goal && n !== p.start)).slice(0, 3);
  const whichOpts: ChoicePart['options'] = [bad, ...others].map((n) => ({
    text: `$h(\\text{${name(n)}}) = ${num(p.h[n])}$`,
    correct: n === bad,
    why:
      n === bad
        ? `The shortest road route ${routeTo(n)} is only $h^* = ${num(hStar.get(n)!)}$ ${p.unit}, so $h = ${num(p.h[n])}$ overestimates.`
        : `$h = ${num(p.h[n])} \\le h^* = ${num(hStar.get(n)!)}$ (${routeTo(n)}): admissible.`,
  }));
  return {
    prompt: `${intro(p)} One value in the table has been **mistyped**.\n\n${hTableTeX(ids, (n) => p.h[n], name, p.goal, p.unit)}\n\nThe robot must get from **${name(p.start)}** to **${name(p.goal)}**.`,
    figure: makeAStarFigure(p.map, p.start, p.goal, p.h, `Road lengths in ${p.unit}; h as printed in the table (one value is wrong).`),
    parts: [
      { kind: 'choice', id: 'bad', label: 'Which table entry is NOT admissible (it overestimates the true road distance to the goal)?', options: whichOpts, marks: 2 },
      {
        kind: 'numeric',
        id: 'astar',
        label: 'Run A* with the table exactly as printed. How long is the route it returns?',
        answer: t.cost,
        unit: p.unit,
        ...TOL,
        traps: [{ value: tTrue.cost, message: `That is the true shortest length, but A* with the printed table never finds it: $f(${X})$ is inflated, so the goal is popped first. Run A* with the printed numbers.`, trapId: 'plan-astar-inadmissible' }],
        marks: 2,
      },
      {
        kind: 'numeric',
        id: 'true',
        label: 'How long is the true shortest route?',
        answer: tTrue.cost,
        unit: p.unit,
        ...TOL,
        traps: [{ value: t.cost, message: `That is what A* returned with the faulty table. The true shortest route goes through ${X}.` }],
        marks: 2,
      },
      {
        kind: 'choice',
        id: 'why',
        label: 'Why did A* stop with a longer route?',
        options: [
          { text: `The overestimate makes the route through ${X} look longer than it is, so the goal is popped before that route is explored.`, correct: true, why: `$f(${X}) = g + ${num(v)}$ exceeds the goal's $f$, so ${X} sits in Open while the goal is popped. With $h \\le h^*$ this cannot happen.` },
          { text: 'A* is only optimal when $h = 0$ for every town.', correct: false, why: 'Any admissible $h$ (never overestimating) keeps A* optimal; $h = 0$ is just the weakest choice (Dijkstra).' },
          { text: 'The goal test should be done when the goal is added to Open.', correct: false, why: 'Testing at insertion is wrong even with a perfect heuristic: a cheaper parent can still appear before the pop.' },
          { text: 'Two towns tied on $f$ and the tie was broken the wrong way.', correct: false, why: 'There are no ties for the lowest $f$ in this run; the cause is the overestimated entry.' },
        ],
        marks: 1,
      },
    ],
    hints: [
      `A heuristic is **admissible** when $h(n) \\le h^*(n)$ for every town, where $h^*(n)$ is the true shortest road distance to the goal. Only then does popping the goal prove its route is shortest. An overestimate makes a town look worse than it is, so A* can pop the goal before exploring the better route through that town.`,
      `For each candidate compute $h^*(n)$ (the shortest road route from $n$ to ${name(p.goal)}; work backwards from the goal) and compare it with the table. Then run A* with the printed values, keeping Open and Closed as usual, and compare its answer with the true shortest route.`,
      `${X}: the table says $h = ${num(v)}$, but ${routeTo(bad)} is only $h^* = ${num(hStar.get(bad)!)}$ ${p.unit}. Every other entry satisfies $h \\le h^*$. With the printed value, ${X} gets $f = g(${X}) + ${num(v)}$.`,
      `With the printed table:\n\n${workedSteps(t, name)}\n\nA* returns **${pathText(t.path!, name)} = ${fmtLen(t.cost, p.unit)}**. With an admissible $h(${X}) \\le ${num(hStar.get(bad)!)}$ it finds **${pathText(tTrue.path!, name)} = ${fmtLen(tTrue.cost, p.unit)}**, the true shortest route.`,
    ],
  };
}

function tier3Parent(rng: Rng): SolveInstance {
  const p = randomProblem(rng, (s) => s.improves > 0 && s.pops >= 4);
  const t = runExam(p.map.graph, p.start, p.goal, 'astar', (n) => p.h[n]);
  const name = p.name;
  const st = t.steps.find((s) => s.updates.some((u) => u.kind === 'improve'));
  if (!st) return tier2(rng);
  const u = st.updates.find((x) => x.kind === 'improve')!;
  const Y = name(u.node);
  const P = name(st.popped);
  const A = name(u.oldParent ?? '?');
  const fNew = u.g + u.h;
  const fOld = (u.oldG ?? NaN) + u.h;
  const opts: ChoicePart['options'] = [
    { text: `Step ${st.k}: ${Y} switches parent from ${A} to ${P}`, correct: true, why: `Via ${P}: $g = ${num(st.row.g)} + ${num(u.cost)} = ${num(u.g)} < ${num(u.oldG ?? NaN)}$, so ${Y}'s entry is replaced.` },
  ];
  for (const s of t.steps)
    for (const w of s.updates) {
      if (opts.length >= 3) break;
      if (w.kind !== 'worse') continue;
      opts.push({
        text: `Step ${s.k}: ${name(w.node)} switches parent from ${name(w.oldParent ?? '?')} to ${name(s.popped)}`,
        correct: false,
        why: `Via ${name(s.popped)} the cost would be $${num(w.g)}$, not less than ${name(w.node)}'s current $${num(w.oldG ?? NaN)}$: no change.`,
      });
    }
  opts.push({ text: 'No town changes parent: the first route found to a town is kept', correct: false, why: `A* replaces an Open entry whenever a cheaper $g$ turns up: ${Y} at step ${st.k}.` });
  return {
    prompt: `${intro(p)}\n\n${hTableTeX(p.map.graph.nodes.map((n) => n.id), (n) => p.h[n], name, p.goal, p.unit)}\n\nRun A* from **${name(p.start)}** to **${name(p.goal)}** (Open and Closed tables at every step). Partway through, a town already in Open is reached by a cheaper route.`,
    figure: makeAStarFigure(p.map, p.start, p.goal, p.h),
    parts: [
      { kind: 'choice', id: 'which', label: 'Which town gets a new parent, and at which step?', options: opts, marks: 2 },
      { kind: 'numeric', id: 'gOld', label: `$g$ of ${Y} just before the change`, answer: u.oldG ?? NaN, unit: p.unit, ...TOL, traps: [{ value: u.g, message: 'That is its new $g$, after the change.' }], marks: 1 },
      { kind: 'numeric', id: 'fNew', label: `$f$ of ${Y} just after the change`, answer: fNew, unit: p.unit, ...TOL, traps: [{ value: fOld, message: `That is ${Y}'s old $f$, before the cheaper parent.`, trapId: 'plan-astar-missed-improve' }, { value: u.g, message: 'That is $g$; add $h$.' }].filter((x) => Math.abs(x.value - fNew) > 0.05), marks: 1 },
      routeChoice(p, t, 'The shortest route is:'),
      lengthPart(p, t, 'Its length', 2),
    ],
    hints: [
      `A town in Open is only **tentative**: if a later expansion reaches it more cheaply, its $g$ and parent are replaced (in 2024 Q29, SL improves from 8.6 via H to 7.8 via SB at step 4). Closed towns are final. ${CONCEPT}`,
      SETUP,
      `At step ${st.k}, ${P} is popped with $g = ${num(st.row.g)}$. The road ${P}–${Y} is ${num(u.cost)} ${p.unit}, so via ${P}: $g = ${num(st.row.g)} + ${num(u.cost)} = ${num(u.g)}$, less than ${Y}'s $g = ${num(u.oldG ?? NaN)}$ via ${A}. New $f = ${num(u.g)} + ${num(u.h)} = ${num(fNew)}$.`,
      `${workedSteps(t, name)}\n\n${finalLine(p, t)}`,
    ],
  };
}

export const generators: SolveGenerator[] = [
  {
    id: 'plan-astar',
    title: 'A* by hand on a road map',
    summary: 'The 2024 Q29 template: Open and Closed tables step by step, then trace the parents back. Warm-up: one expansion; stretch: an inadmissible heuristic or a parent update.',
    tiers: [1, 2, 3],
    source: 'Similar to 2024 Q29; review deck slide 17',
    cardId: 'plan-astar',
    marks: 7,
    sprint: false,
    generate(rng, tier) {
      if (tier === 1) return tier1(rng);
      if (tier === 2) return tier2(rng);
      return rng.next() < 0.5 ? tier3Inadmissible(rng) : tier3Parent(rng);
    },
  },
];
