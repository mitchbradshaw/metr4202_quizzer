// Self-tests for A* by hand: the exam tables built by the sim/generator helpers reproduce the 2024 Q29 and
// review-deck worked solutions, random road maps keep the straight-line heuristic admissible, and every
// plan-astar instance is well formed and accepts its own answers.
import katex from 'katex';
import type { SelfTest, CheckResult } from '../../../selftest/types';
import { isTrue, near, nearAbs } from '../../../selftest/assert';
import { admissibilityViolations, consistencyViolations, costToGo, neighboursOf } from '../../../core/graph';
import { AUSTRALIA_H, AUSTRALIA_REVIEW, BRISBANE_2024, BRISBANE_H } from '../../../core/roadmaps';
import { roadMap, roadMapStats, trueCostToGo } from '../../../core/roadgen';
import { segSeg } from '../../../core/geom2d';
import { makeRng } from '../../../engine/rng';
import { checkChoice, checkNumeric } from '../../../engine/check';
import type { SolveInstance, Tier } from '../../../engine/types';
import { expectedEntries, judgeEntry, judgePop, num, openTeX, pathSum, prioText, runExam, tablesTeX, workedSteps, type ExamTrace } from '../explore/astarTable';
import { australiaMap, brisbaneMap, randomMap, simAccept, type MapDef } from '../explore/astarMaps';
import { layoutLabels, type Box, type InfoSlot } from '../explore/astarLabels';
import { tablePartData } from '../explore/astarSolve';
import { generators } from '../solve/astar';

const id = (s: string) => s;
const bris = () => runExam(BRISBANE_2024, 'KG', 'MG', 'astar', (n) => BRISBANE_H[n]);
const aus = () => runExam(AUSTRALIA_REVIEW, 'Hobart', 'Alice Springs', 'astar', (n) => AUSTRALIA_H[n]);
const rowOf = (t: ExamTrace, k: number, node: string) => t.steps[k - 1].open.find((r) => r.node === node);

/** Every $…$ / $$…$$ segment of a Rich string, as the renderer splits them (\$ is a literal dollar). */
function texSegments(text: string): string[] {
  const src = text.replace(/\\\$/g, '\u0000');
  const out: string[] = [];
  const re = /\$\$([\s\S]+?)\$\$|\$([^$]+?)\$/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) out.push((m[1] ?? m[2]).replace(/\u0000/g, '$'));
  return out;
}

function texErrors(texts: string[]): string[] {
  const bad: string[] = [];
  for (const t of texts)
    for (const seg of texSegments(t)) {
      try {
        katex.renderToString(seg, { throwOnError: true, strict: 'ignore' });
      } catch (e) {
        bad.push(`${seg.slice(0, 60)}: ${(e as Error).message.slice(0, 80)}`);
      }
    }
  return bad;
}

/** All Rich text in an instance (prompt, labels, options, whys, trap messages, hints). */
function richOf(inst: SolveInstance): string[] {
  const out: string[] = [inst.prompt, ...inst.hints];
  for (const p of inst.parts) {
    out.push(p.label);
    if (p.kind === 'numeric') for (const t of p.traps ?? []) out.push(t.message);
    if (p.kind === 'choice') for (const o of p.options) out.push(o.text, o.why ?? '');
  }
  return out;
}

export const tests: SelfTest[] = [
  {
    id: 'plan-astar-brisbane-tables',
    topic: 'plan',
    title: '2024 Q29 through the exam-table helpers: KG → GP → SB → MG, 13.8 km; SL improves 8.6 → 7.8 at step 4',
    source: '2024 worked solutions Q29(c)',
    run: () => {
      const t = bris();
      const s1 = t.steps[0];
      const s4 = t.steps[3];
      const sl = rowOf(t, 4, 'SL');
      const e4 = expectedEntries(s4, 'astar', id);
      const e2 = expectedEntries(t.steps[1], 'astar', id);
      const hEntry = e2.find((e) => e.node === 'H')!;
      return [
        isTrue('step 1 Open: GP 3.1 + 8.1 = 11.2 (KG), then H 0.9 + 11.1 = 12 (KG)', s1.open.map((r) => `${r.node} ${prioText(r, 'astar')} ${r.parent}`).join('; ') === 'GP 3.1 + 8.1 = 11.2 KG; H 0.9 + 11.1 = 12 KG', s1.open.map((r) => `${r.node} ${prioText(r, 'astar')} ${r.parent}`).join('; ')),
        isTrue('step 1 Closed: KG 0 –', s1.closed.length === 1 && s1.closed[0].node === 'KG' && s1.closed[0].g === 0 && s1.closed[0].parent === null),
        isTrue('pops KG, GP, H, SB, MG', t.steps.map((s) => s.popped).join(',') === 'KG,GP,H,SB,MG', t.steps.map((s) => s.popped).join(',')),
        isTrue('step 2: H via GP (7.2) is worse than 0.9, no change', t.steps[1].updates.some((u) => u.node === 'H' && u.kind === 'worse' && Math.abs(u.g - 7.2) < 1e-9)),
        isTrue('step 4: SL marked improved, was 8.6 via H', sl?.change === 'improved' && Math.abs((sl.oldG ?? 0) - 8.6) < 1e-9 && sl.oldParent === 'H', JSON.stringify(sl)),
        near('step 4: SL g = 7.8 via SB', sl?.g ?? NaN, 7.8, 1e-9),
        isTrue('step 4 Open order MG 13.8, DP 13.9, SL 14.9, N 17.2', s4.open.map((r) => `${r.node}${num(r.f)}`).join(' ') === 'MG13.8 DP13.9 SL14.9 N17.2', s4.open.map((r) => `${r.node}${num(r.f)}`).join(' ')),
        isTrue('step 5 pops the goal and stops', t.steps[4].isGoal && t.steps[4].popped === 'MG'),
        isTrue('path KG → GP → SB → MG', (t.path ?? []).join('→') === 'KG→GP→SB→MG'),
        near('path length 13.8 km', t.cost, 13.8, 1e-9),
        isTrue('path sum written 3.1 + 1 + 9.7 = 13.8', pathSum(BRISBANE_2024, t.path!).text === '3.1 + 1 + 9.7 = 13.8', pathSum(BRISBANE_2024, t.path!).text),
        isTrue('goal first entered Open at step 4 with g 13.8', t.goalAdded?.k === 4 && Math.abs((t.goalAdded?.g ?? 0) - 13.8) < 1e-9),
        nearAbs('typed-value key: SL f = 14.9 after step 4', e4.find((e) => e.node === 'SL')?.value ?? NaN, 14.9, 1e-9),
        nearAbs('typed-value key: SL old f (missed improvement) 15.7', e4.find((e) => e.node === 'SL')?.wrongValue ?? NaN, 15.7, 1e-9),
        nearAbs('typed-value key: H keeps f = 12 after step 2', hEntry.value, 12, 1e-9),
        isTrue('typing H\'s worse f (18.3) is rejected as "worse route"', !judgeEntry(hEntry, 18.3, 'astar', id).ok && /worse/.test(judgeEntry(hEntry, 18.3, 'astar', id).message)),
        isTrue('typing 12.0 for H is accepted', judgeEntry(hEntry, 12.0, 'astar', id).ok),
        isTrue('worked solution text renders as KaTeX', texErrors([workedSteps(t, id), tablesTeX(s4.open, s4.closed, 'astar', id)]).length === 0, texErrors([workedSteps(t, id)]).join(' | ')),
      ];
    },
  },
  {
    id: 'plan-astar-judge-pop',
    topic: 'plan',
    title: 'You-drive judging: lowest f is right; lowest g, lowest h, closed, unseen and goal-early picks are named',
    source: '2024 Q29; review deck slide 17; summary notes §5 (goal test at the pop)',
    run: () => {
      const t = bris();
      const a = aus();
      const trapOf = (k: number, pick: string, tr: ExamTrace = t, goal = 'MG') => judgePop(tr.steps[k - 1], pick, 'astar', id, goal).trap ?? 'ok';
      return [
        isTrue('step 2: GP (f 11.2) is right', judgePop(t.steps[1], 'GP', 'astar', id, 'MG').ok),
        isTrue('step 2: H has the lowest g → "lowest-g"', trapOf(2, 'H') === 'lowest-g', trapOf(2, 'H')),
        isTrue('step 2: KG → "closed"', trapOf(2, 'KG') === 'closed', trapOf(2, 'KG')),
        isTrue('step 2: N → "unseen"', trapOf(2, 'N') === 'unseen', trapOf(2, 'N')),
        isTrue('step 4: SL has the lowest h → "lowest-h"', trapOf(4, 'SL') === 'lowest-h', trapOf(4, 'SL')),
        isTrue('step 5: MG (13.8 < DP 13.9) is right and stops', judgePop(t.steps[4], 'MG', 'astar', id, 'MG').ok && t.steps[4].isGoal),
        isTrue('step 5: DP has the lowest g (7.5) → "lowest-g" (what Dijkstra would pop)', trapOf(5, 'DP') === 'lowest-g', trapOf(5, 'DP')),
        isTrue('step 5: N (f 17.2) → "not-lowest"', trapOf(5, 'N') === 'not-lowest', trapOf(5, 'N')),
        isTrue('Australia step 4: popping Alice Springs (2600) before Adelaide (2550) → "goal-early"', trapOf(4, 'Alice Springs', a, 'Alice Springs') === 'goal-early', trapOf(4, 'Alice Springs', a, 'Alice Springs')),
      ];
    },
  },
  {
    id: 'plan-astar-australia-tables',
    topic: 'plan',
    title: 'Review deck A* through the exam-table helpers: Hobart → Melbourne → Broken Hill → Alice Springs, 2600 km',
    source: 'Review deck slide 17',
    run: () => {
      const t = aus();
      const s4 = t.steps[3];
      return [
        isTrue('path Hobart → Melbourne → Broken Hill → Alice Springs', (t.path ?? []).join('→') === 'Hobart→Melbourne→Broken Hill→Alice Springs', (t.path ?? []).join('→')),
        near('length 2600 km', t.cost, 2600, 1e-9),
        isTrue('pops Hobart, Melbourne, Broken Hill, Adelaide, Alice Springs', t.steps.map((s) => s.popped).join(',') === 'Hobart,Melbourne,Broken Hill,Adelaide,Alice Springs'),
        isTrue('Alice Springs entered Open at step 3 with 2600', t.goalAdded?.k === 3 && t.goalAdded.g === 2600),
        isTrue('step 4 pops Adelaide (2550) while the goal waits in Open', s4.popped === 'Adelaide' && s4.before.some((r) => r.node === 'Alice Springs')),
        isTrue('step 4: Alice Springs via Adelaide (2700) is worse, no change', s4.updates.some((u) => u.node === 'Alice Springs' && u.kind === 'worse' && u.g === 2700)),
        isTrue('step 1 Open: Melbourne 600 + 1800 = 2400, Sydney 1100 + 2000 = 3100', t.steps[0].open.map((r) => prioText(r, 'astar')).join('; ') === '600 + 1800 = 2400; 1100 + 2000 = 3100'),
        isTrue('Open TeX renders', texErrors([`$$${openTeX(s4.open, 'astar', id)}$$`]).length === 0),
      ];
    },
  },
  {
    id: 'plan-astar-roadgen',
    topic: 'plan',
    title: 'Random road maps: straight-line h admissible and consistent for 200 seeds; planar, connected, deterministic',
    source: 'Summary notes §5 (straight-line distance is admissible for road travel); 2024 Q29(b)',
    run: () => {
      const out: CheckResult[] = [];
      let inadmissible = 0;
      let inconsistent = 0;
      let crossing = 0;
      let short = 0;
      let disconnected = 0;
      let lowDegree = 0;
      let sizes = true;
      for (let s = 1; s <= 200; s++) {
        const m = roadMap(s * 7919);
        const ids = m.graph.nodes.map((n) => n.id);
        if (ids.length < 6 || ids.length > 9) sizes = false;
        const hs = trueCostToGo(m, m.goal);
        if ([...hs.values()].some((v) => !Number.isFinite(v))) disconnected++;
        if (admissibilityViolations((n) => m.h[n], hs).length) inadmissible++;
        if (consistencyViolations(m.graph, (n) => m.h[n]).length) inconsistent++;
        const P = Object.fromEntries(m.graph.nodes.map((n) => [n.id, { x: n.x!, y: n.y! }]));
        const deg: Record<string, number> = {};
        for (const [a, b, w] of m.graph.edges) {
          deg[a] = (deg[a] ?? 0) + 1;
          deg[b] = (deg[b] ?? 0) + 1;
          if (w + 1e-9 < Math.hypot(P[a].x - P[b].x, P[a].y - P[b].y)) short++;
        }
        if (ids.some((n) => (deg[n] ?? 0) < 2)) lowDegree++;
        const E = m.graph.edges;
        for (let i = 0; i < E.length; i++)
          for (let j = i + 1; j < E.length; j++) {
            const [a, b] = E[i];
            const [c, d] = E[j];
            if (a === c || a === d || b === c || b === d) continue;
            if (segSeg(P[a], P[b], P[c], P[d])) crossing++;
          }
      }
      out.push(isTrue('h ≤ h* at every town (200 maps)', inadmissible === 0, `${inadmissible} maps`));
      out.push(isTrue('h(a) ≤ c(a, b) + h(b) on every road (consistent)', inconsistent === 0, `${inconsistent} maps`));
      out.push(isTrue('every road at least as long as the straight line', short === 0, `${short} roads`));
      out.push(isTrue('no two roads cross', crossing === 0, `${crossing} crossings`));
      out.push(isTrue('every town reachable from the goal', disconnected === 0, `${disconnected} maps`));
      out.push(isTrue('dead-end towns only where no second road fits (≤ 2 of 200 maps)', lowDegree <= 2, `${lowDegree} maps`));
      out.push(isTrue('6 to 9 towns', sizes));
      out.push(isTrue('same seed ⇒ same map', JSON.stringify(roadMap(4242)) === JSON.stringify(roadMap(4242))));
      const st = roadMapStats(roadMap(1000));
      out.push(isTrue('stats are finite', Number.isFinite(st.pops) && st.pops > 0));
      // The sim's random maps: acceptable and with an h table for their own goal.
      let simOk = 0;
      for (let s = 1; s <= 40; s++) {
        const m = randomMap(s * 31337);
        const t = runExam(m.graph, m.start, m.goal, 'astar', (n) => m.hFor(m.goal)![n]);
        const hs = costToGo(neighboursOf(m.graph), m.graph.nodes.map((n) => n.id), m.goal);
        if (t.path && Math.abs(t.cost - (hs.get(m.start) ?? NaN)) < 1e-9 && simAccept({ graph: m.graph } as never, { pops: t.steps.length, pathEdges: t.path.length - 1, tieAtPop: t.steps.some((x) => x.ties.length > 0) })) simOk++;
      }
      out.push(isTrue('sim random maps: A* optimal, 4–8 pops, no ties (40 seeds)', simOk >= 38, `${simOk}/40`));
      return out;
    },
  },
  {
    id: 'plan-astar-generator',
    topic: 'plan',
    title: 'plan-astar: every tier × 40 seeds generates, 4 hints, finite answers, valid KaTeX, own answers pass own checkers',
    run: () => {
      const gen = generators.find((g) => g.id === 'plan-astar');
      if (!gen) return [isTrue('plan-astar exists', false)];
      const out: CheckResult[] = [];
      for (const tier of gen.tiers as Tier[]) {
        const fails: string[] = [];
        const tex: string[] = [];
        let marks = 0;
        for (let k = 0; k < 40; k++) {
          const seed = 100000 + 7919 * k + tier;
          let inst: SolveInstance;
          try {
            inst = gen.generate(makeRng(seed), tier);
          } catch (e) {
            fails.push(`seed ${seed}: threw ${(e as Error).message}`);
            continue;
          }
          const again = gen.generate(makeRng(seed), tier);
          if (again.prompt !== inst.prompt) fails.push(`seed ${seed}: not deterministic`);
          if (inst.hints.length !== 4 || inst.hints.some((h) => !h || !h.trim())) fails.push(`seed ${seed}: hints`);
          if (/undefined|NaN/.test(richOf(inst).join(' '))) fails.push(`seed ${seed}: "undefined" or "NaN" in text`);
          if (!inst.figure) fails.push(`seed ${seed}: no figure`);
          tex.push(...texErrors(richOf(inst)).map((e) => `seed ${seed}: ${e}`));
          marks = Math.max(marks, inst.parts.reduce((t, p) => t + (p.marks ?? 0), 0));
          for (const p of inst.parts) {
            if (p.kind === 'numeric') {
              if (!Number.isFinite(p.answer)) fails.push(`seed ${seed} ${p.id}: answer not finite`);
              else if (!checkNumeric(p, String(p.answer)).correct) fails.push(`seed ${seed} ${p.id}: own answer rejected`);
              else if (!checkNumeric(p, p.answer.toFixed(1)).correct) fails.push(`seed ${seed} ${p.id}: 1-decimal answer rejected`);
              for (const t of p.traps ?? []) if (checkNumeric(p, String(t.value)).correct) fails.push(`seed ${seed} ${p.id}: trap ${t.value} accepted`);
            } else if (p.kind === 'choice') {
              const keys = p.options.map((o, i) => (o.correct ? i : -1)).filter((i) => i >= 0);
              if (keys.length !== 1) fails.push(`seed ${seed} ${p.id}: ${keys.length} keys`);
              if (p.options.length < 3) fails.push(`seed ${seed} ${p.id}: ${p.options.length} options`);
              if (new Set(p.options.map((o) => o.text)).size !== p.options.length) fails.push(`seed ${seed} ${p.id}: duplicate options`);
              if (p.options.some((o) => !o.why)) fails.push(`seed ${seed} ${p.id}: option without why`);
              if (!checkChoice(p, keys).correct) fails.push(`seed ${seed} ${p.id}: key rejected`);
            } else if (p.kind === 'custom') {
              const d = tablePartData(p.render);
              if (!d) {
                fails.push(`seed ${seed} ${p.id}: no reference data`);
                continue;
              }
              const t = d.examTrace;
              if (!t.path || !t.steps.length || !t.steps[t.steps.length - 1].isGoal) fails.push(`seed ${seed}: run does not end at the goal`);
              for (const s of t.steps) {
                if (!judgePop(s, s.popped, 'astar', d.nameOf, t.goal).ok) fails.push(`seed ${seed} step ${s.k}: official pop rejected`);
                if (s.ties.length) fails.push(`seed ${seed} step ${s.k}: tie for the lowest f`);
                for (const e of expectedEntries(s, 'astar', d.nameOf)) if (!judgeEntry(e, Number(num(e.value)), 'astar', d.nameOf).ok) fails.push(`seed ${seed} step ${s.k} ${e.node}: official value rejected`);
              }
              if (t.steps.length > 9) fails.push(`seed ${seed}: ${t.steps.length} steps (too long by hand)`);
            }
          }
        }
        out.push(isTrue(`tier ${tier}: 40 instances well formed`, fails.length === 0, fails.slice(0, 4).join(' | ')));
        out.push(isTrue(`tier ${tier}: KaTeX renders every formula`, tex.length === 0, tex.slice(0, 3).join(' | ')));
        out.push(isTrue(`tier ${tier}: marks ≤ 8 (max ${marks})`, marks > 0 && marks <= 8));
      }
      return out;
    },
  },
  {
    id: 'plan-astar-labels',
    topic: 'plan',
    title: 'Road-map labels (A* sim and every graph figure): no label overlaps another label or a town, and every label stays in the picture (Brisbane, Australia, 40 random maps)',
    run: () => {
      const maps: MapDef[] = [brisbaneMap(), australiaMap(), ...Array.from({ length: 40 }, (_, k) => randomMap(1000 + 7919 * k))];
      const fails: string[] = [];
      let worst = 0;
      const area = (a: Box, b: Box) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
      for (const m of maps)
        for (const slots of [['val', 'h'], ['h'], []] as InfoSlot[][]) {
          const L = layoutLabels(m, { start: m.start, goal: m.goal, slots, infoChars: 8 });
          const boxes = [...Object.entries(L.name), ...Object.entries(L.info), ...Object.entries(L.cost)].filter((e) => !!e[1]).map(([k, sp]) => ({ k, b: sp!.box }));
          for (let i = 0; i < boxes.length; i++) {
            const b = boxes[i].b;
            for (let j = i + 1; j < boxes.length; j++) {
              const a = area(b, boxes[j].b);
              worst = Math.max(worst, a);
              if (a > 2) fails.push(`${m.title} [${slots.join(',')}]: ${boxes[i].k} x ${boxes[j].k} (${a.toFixed(0)} px²)`);
            }
            for (const n of m.graph.nodes) {
              const p = m.pos[n.id];
              const d = Math.hypot(Math.max(b.x0 - p.x, 0, p.x - b.x1), Math.max(b.y0 - p.y, 0, p.y - b.y1));
              if (d < 18) fails.push(`${m.title} [${slots.join(',')}]: ${boxes[i].k} covers town ${n.id}`);
            }
            if (b.x0 < 0 || b.y0 < 0 || b.x1 > m.vb.w || b.y1 > m.vb.h) fails.push(`${m.title} [${slots.join(',')}]: ${boxes[i].k} leaves the picture`);
          }
        }
      return [isTrue(`${maps.length} maps × 3 layouts: no overlaps (worst ${worst.toFixed(1)} px²)`, fails.length === 0, fails.slice(0, 4).join(' | '))];
    },
  },
];
