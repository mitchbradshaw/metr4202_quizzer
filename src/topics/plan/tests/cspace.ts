// Self-tests for C-space labelling (plan-cspace): the region analysis on the three exam workspaces against
// the worked solutions, the solutions' "check one point" configurations, the papers' own answer boxes, every
// generated box sitting on the obstacle it is keyed to, the tier-3 matching, and a generator sanity sweep.
import katex from 'katex';
import type { CheckResult, SelfTest } from '../../../selftest/types';
import type { CustomPart, SolveInstance, Tier } from '../../../engine/types';
import { isTrue, nearAbs } from '../../../selftest/assert';
import { makeRng } from '../../../engine/rng';
import { trapById } from '../../../engine/traps';
import { TAU, fk2 } from '../../../core/cspace';
import { pointInShape } from '../../../core/geom2d';
import {
  EXAM_2023,
  EXAM_2024,
  EXAM_2025,
  analyseRegions,
  armOf,
  cellOf,
  makeCollider,
  obstacleInfo,
  workspaceGrid,
  type CWorkspace,
} from '../../../core/cspacegen';
import {
  BOX_H,
  BOX_W,
  EXAM_SETS,
  NG,
  boxWhy,
  boxWrong,
  cfgPx,
  examLabelProblem,
  matchSignature,
  obstacleRegion,
  snapPaperBox,
  touching,
  type CsProblem,
} from '../solve/cspaceBoxes';
import { boxPartData, matchPartData, matchWhy, matchWrong } from '../solve/cspaceLabel';
import { FR } from '../explore/cspaceDraw';
import { generators } from '../solve/cspace';
import { generatorSanity } from './rrtstar';

const P = Math.PI;
const gen = generators.find((g) => g.id === 'plan-cspace')!;
const SRC = 'Worked solutions: 2023 Q26, 2024 Q24, 2025 Q25';

const regionsOf = (ws: CWorkspace) => {
  const g = workspaceGrid(ws, NG);
  const ra = analyseRegions(g, ws.obstacles.length);
  return { g, ra, reg: ws.obstacles.map((_, o) => obstacleRegion(ws, g, ra, o)) };
};
const inArc = (a: number, arc: [number, number]) => (a >= arc[0] - 1e-9 && a <= arc[1] + 1e-9) || (a + TAU >= arc[0] && a + TAU <= arc[1]);
const piOf = (a: number) => a / P;

/** Every TeX fragment of a Rich string parses. */
function texProblems(s: string): string[] {
  const src = s.replace(/\\\$/g, '\u0000');
  const out: string[] = [];
  const re = /\$\$([\s\S]+?)\$\$|\$([^$]+?)\$/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const tex = (m[1] ?? m[2]).replace(/\u0000/g, '\\$');
    try {
      katex.renderToString(tex, { displayMode: !!m[1], throwOnError: true, strict: 'ignore', output: 'html' });
    } catch (e) {
      out.push(`${(e as Error).message.slice(0, 90)} in "${tex.slice(0, 60)}"`);
    }
  }
  if ((src.match(/\$/g) ?? []).length % 2) out.push(`unbalanced $ in "${s.slice(0, 60)}"`);
  if (/NaN|undefined|Infinity|\[object/.test(s)) out.push(`bad text "${s.slice(0, 60)}"`);
  return out;
}

/** Problems with one labelling instance's boxes (empty when every box is sound). */
function boxProblems(p: CsProblem, tier: Tier): string[] {
  const bad: string[] = [];
  const n = p.g.n;
  const cols = p.ws.obstacles.map((o) => makeCollider(o.shape));
  for (const b of p.boxes) {
    const bit = 1 << b.answer;
    const k = cellOf(n, b.t1, b.t2);
    if (p.g.hit[k] !== bit) bad.push(`box ${b.num}: cell hits ${p.g.hit[k]} not only obstacle ${b.answer}`);
    const c = touching(p.ws, cols, b.t1, b.t2);
    if (c.any.length !== 1 || c.any[0] !== b.answer) bad.push(`box ${b.num}: exact geometry touches [${c.any}] not [${b.answer}]`);
    if ((b.kind === 'band') !== c.link1.includes(b.answer)) bad.push(`box ${b.num}: kind ${b.kind} but link 1 ${c.link1.includes(b.answer) ? 'hits' : 'misses'}`);
    const tip = cfgPx(b.t1, b.t2);
    if (Math.hypot(tip.x - b.P.x, tip.y - b.P.y) > 0.01) bad.push(`box ${b.num}: pointer not at its configuration`);
    if (b.cx - BOX_W / 2 < FR.L || b.cx + BOX_W / 2 > FR.L + FR.S || b.cy - BOX_H / 2 < FR.T || b.cy + BOX_H / 2 > FR.T + FR.S) bad.push(`box ${b.num}: outside the plot`);
  }
  p.boxes.forEach((a, i) =>
    p.boxes.slice(i + 1).forEach((b) => {
      if (Math.abs(a.cx - b.cx) < BOX_W && Math.abs(a.cy - b.cy) < BOX_H) bad.push(`boxes ${a.num} and ${b.num} overlap`);
    })
  );
  const numbers = p.boxes.map((b) => b.num).join(',');
  if (numbers !== p.boxes.map((_, i) => i + 1).join(',')) bad.push(`box numbers ${numbers}`);
  p.ws.obstacles.forEach((ob, o) => {
    if (!p.boxes.some((b) => b.answer === o)) bad.push(`no box for ${ob.label}`);
  });
  if (!p.exam) {
    const [lo, hi] = tier === 1 ? [3, 4] : [4, 5];
    if (p.boxes.length < lo || p.boxes.length > hi) bad.push(`${p.boxes.length} boxes`);
  }
  return bad;
}

function instanceBoxes(inst: SolveInstance): CsProblem | null {
  const data = inst.parts.map((q) => (q.kind === 'custom' ? boxPartData((q as CustomPart).render) : null));
  return data[0]?.problem ?? null;
}

export const tests: SelfTest[] = [
  {
    id: 'plan-cspace-exam-regions',
    topic: 'plan',
    title: 'C-space regions of the 2023 / 2024 / 2025 workspaces (bands inside the circle, blobs outside)',
    source: SRC,
    run() {
      const out: CheckResult[] = [];
      // 2023: B band [5π/4, 3π/2], C band [7π/4, 2π] with its link-2 piece on the left edge, A a blob that wraps.
      {
        const { ra, reg } = regionsOf(EXAM_2023);
        const [A, B, C] = reg;
        out.push(isTrue('2023 A: no link-1 cells (outside the circle): a blob', !A.band));
        out.push(isTrue('2023 A: one region that wraps top to bottom', A.wrapsT2 && ra.comps.filter((c) => c.obstacle === 0).length === 1));
        out.push(isTrue('2023 A: its θ1 extent covers the solution’s 0.75π → π', inArc(0.75 * P, A.t1) && inArc(0.99 * P, A.t1), `[${piOf(A.t1[0]).toFixed(2)}π, ${piOf(A.t1[1]).toFixed(2)}π]`));
        out.push(nearAbs('2023 B band starts at 5π/4 (units of π)', piOf(B.bands[0]?.[0] ?? 0), 1.25, 0.002));
        out.push(nearAbs('2023 B band ends at 3π/2 (units of π)', piOf(B.bands[0]?.[1] ?? 0), 1.5, 0.002));
        out.push(nearAbs('2023 C band starts at 7π/4 (units of π)', piOf(C.bands[0]?.[0] ?? 0), 1.75, 0.002));
        out.push(nearAbs('2023 C band ends at 2π (units of π)', piOf(C.bands[0]?.[1] ?? 0), 2, 0.002));
        const cComps = ra.comps.filter((c) => c.obstacle === 2);
        const left = ra.pieces.find((q) => q.obstacle === 2 && q.touches.left && !q.link1);
        out.push(isTrue('2023 C: a link-2 piece on the left edge, the same region as its band (wraps through θ1 = 0)', !!left && cComps.length === 1 && cComps[0].pieces.includes(ra.pieces.indexOf(left))));
      }
      // 2024: A wide band [3π/4, 5π/4] with bulges on both sides, C narrow band ≈ [1.6π, 1.75π], B thin stripes.
      {
        const { ra, reg } = regionsOf(EXAM_2024);
        const [A, B, C] = reg;
        out.push(nearAbs('2024 A band starts at 3π/4', piOf(A.bands[0]?.[0] ?? 0), 0.75, 0.002));
        out.push(nearAbs('2024 A band ends at 5π/4', piOf(A.bands[0]?.[1] ?? 0), 1.25, 0.002));
        out.push(isTrue('2024 A: link-2 bulges on both sides of the band', A.t1[0] < A.bands[0][0] - 0.1 && A.t1[1] > A.bands[0][1] + 0.1));
        out.push(nearAbs('2024 C band starts ≈ 1.6π', piOf(C.bands[0]?.[0] ?? 0), 1.6, 0.03));
        out.push(nearAbs('2024 C band ends ≈ 1.75π', piOf(C.bands[0]?.[1] ?? 0), 1.75, 0.002));
        out.push(isTrue('2024 B: out of reach of link 1 (no band)', !B.band));
        out.push(isTrue('2024 B: one region, two stripes joined through θ2 = 0', B.wrapsT2 && ra.comps.filter((c) => c.obstacle === 1).length === 1 && ra.comps.find((c) => c.obstacle === 1)!.pieces.length === 2));
        out.push(isTrue('2024 B: link 1 pointing ≈ 20°–45° (0.11π–0.25π) lies in the stripes’ θ1 extent', inArc(0.12 * P, B.t1) && inArc(0.24 * P, B.t1)));
      }
      // 2025: nothing crosses the circle: three blobs, each cut in two by the top and bottom edges.
      {
        const { ra, reg } = regionsOf(EXAM_2025);
        out.push(isTrue('2025: no bands at all', reg.every((r) => !r.band)));
        reg.forEach((r, o) => {
          const comps = ra.comps.filter((c) => c.obstacle === o);
          out.push(isTrue(`2025 ${EXAM_2025.obstacles[o].label}: one region in two pieces, wrapping top to bottom`, r.wrapsT2 && comps.length === 1 && comps[0].pieces.length === 2));
        });
        const [A, B, C] = reg;
        out.push(isTrue('2025 B (above): θ1 extent holds 0.5π–0.6π', inArc(0.5 * P, B.t1) && inArc(0.6 * P, B.t1)));
        out.push(isTrue('2025 A (left): θ1 extent holds 0.8π–π', inArc(0.8 * P, A.t1) && inArc(0.99 * P, A.t1)));
        out.push(isTrue('2025 C (lower right): θ1 extent holds 1.7π–1.85π', inArc(1.7 * P, C.t1) && inArc(1.85 * P, C.t1)));
      }
      // The exact θ1 extents quoted in the hints agree with the grid that is drawn (to within one 2° cell).
      for (const ws of [EXAM_2023, EXAM_2024, EXAM_2025]) {
        const { g, reg } = regionsOf(ws);
        const n = g.n;
        reg.forEach((r, o) => {
          const bit = 1 << o;
          let worst = 0;
          for (let i = 0; i < n; i++) {
            const t = ((i + 0.5) * TAU) / n;
            const gridBand = (g.link1[i] & bit) !== 0;
            const gridAny = Array.from({ length: n }, (_, j) => g.hit[j * n + i] & bit).some(Boolean);
            const exactBand = r.bands.some((b) => inArc(t, b));
            const exactAny = inArc(t, r.t1);
            if (gridBand !== exactBand || gridAny !== exactAny) {
              const edges = [...r.bands.flat(), ...r.t1].map((e) => Math.abs(((t - e + 3 * P) % TAU) - P));
              worst = Math.max(worst, Math.min(...edges));
            }
          }
          out.push(isTrue(`${ws === EXAM_2023 ? 2023 : ws === EXAM_2024 ? 2024 : 2025} ${ws.obstacles[o].label}: exact extents match the grid within a cell`, worst <= TAU / n + 1e-9, `worst ${(worst / P).toFixed(4)}π`));
        });
      }
      return out;
    },
  },
  {
    id: 'plan-cspace-exam-checks',
    topic: 'plan',
    title: 'The worked solutions’ “check one point” configurations land in the right obstacle',
    source: SRC,
    run() {
      const out: CheckResult[] = [];
      const cases: { year: string; ws: CWorkspace; t1: number; t2: number; o: number; elbow: [number, number]; tip: [number, number]; tipIn: boolean }[] = [
        { year: '2023', ws: EXAM_2023, t1: 0.85 * P, t2: 0.25 * P, o: 0, elbow: [2.48, 6.28], tip: [0.58, 5.66], tipIn: true },
        { year: '2024', ws: EXAM_2024, t1: 0.1 * P, t2: 0.2 * P, o: 1, elbow: [7.69, 5.87], tip: [8.87, 7.49], tipIn: true },
        { year: '2025', ws: EXAM_2025, t1: 0.8 * P, t2: 0.4 * P, o: 0, elbow: [2.98, 6.47], tip: [1.36, 5.29], tipIn: true },
        { year: '2025', ws: EXAM_2025, t1: 0.4 * P, t2: 0.4 * P, o: 1, elbow: [5.77, 7.38], tip: [4.15, 8.56], tipIn: true },
      ];
      for (const c of cases) {
        const X = c.ws.obstacles[c.o].label;
        const at = `${c.year} (${(c.t1 / P).toFixed(2)}π, ${(c.t2 / P).toFixed(2)}π)`;
        const { elbow, tip } = fk2(armOf(c.ws), c.t1, c.t2);
        out.push(nearAbs(`${at}: elbow x`, elbow.x, c.elbow[0], 0.011));
        out.push(nearAbs(`${at}: elbow y`, elbow.y, c.elbow[1], 0.011));
        out.push(nearAbs(`${at}: tip x`, tip.x, c.tip[0], 0.011));
        out.push(nearAbs(`${at}: tip y`, tip.y, c.tip[1], 0.011));
        out.push(isTrue(`${at}: tip inside ${X}`, pointInShape(tip, c.ws.obstacles[c.o].shape) === c.tipIn));
        const cols = c.ws.obstacles.map((ob) => makeCollider(ob.shape));
        const hits = touching(c.ws, cols, c.t1, c.t2);
        out.push(isTrue(`${at}: link 2 (not link 1) hits ${X}, nothing else`, hits.link2.includes(c.o) && !hits.link1.includes(c.o) && hits.any.length === 1));
        const g = workspaceGrid(c.ws, NG);
        out.push(isTrue(`${at}: the C-space grid has ${X} there`, (g.hit[cellOf(NG, c.t1, c.t2)] & (1 << c.o)) !== 0));
      }
      return out;
    },
  },
  {
    id: 'plan-cspace-paper-boxes',
    topic: 'plan',
    title: 'The papers’ answer boxes: pointers on the right obstacle, all boxes placed, answers kept',
    source: SRC,
    run() {
      const out: CheckResult[] = [];
      for (const year of [2023, 2024, 2025] as const) {
        const set = EXAM_SETS[year];
        const g = workspaceGrid(set.ws, NG);
        const cols = set.ws.obstacles.map((o) => makeCollider(o.shape));
        for (const b of set.boxes) {
          const s = snapPaperBox(set.ws, g, cols, b);
          out.push(isTrue(`${year} ${b.where}: pointer on ${b.answer} (moved ${s ? s.moved.toFixed(1) : '–'} cells)`, !!s && s.moved <= 1.5));
        }
        let p: CsProblem | null = null;
        try {
          p = examLabelProblem(year);
        } catch (e) {
          out.push(isTrue(`${year}: boxes placed`, false, (e as Error).message));
        }
        if (p) {
          const ans = p.boxes.map((b) => p!.ws.obstacles[b.answer].label).sort().join('');
          out.push(isTrue(`${year}: ${set.boxes.length} boxes with the paper’s answers`, p.boxes.length === set.boxes.length && ans === set.boxes.map((b) => b.answer).sort().join(''), ans));
          const probs = boxProblems(p, 2);
          out.push(isTrue(`${year}: every box sound (on its obstacle, inside the plot, no overlaps)`, !probs.length, probs.slice(0, 3).join('; ')));
          out.push(nearAbs(`${year}: box marks add up to the paper’s ${set.marks}`, p.boxes.reduce((t, b) => t + b.marks, 0), set.marks, 1e-9));
        }
      }
      return out;
    },
  },
  {
    id: 'plan-cspace-generated-boxes',
    topic: 'plan',
    title: 'Generated labelling problems: every box on a cell of the obstacle it is keyed to, every obstacle boxed',
    source: 'Generator plan-cspace, tiers 1-2 x 30 seeds',
    run() {
      return ([1, 2] as const).map((tier) => {
        let bad = '';
        let boxes = 0;
        let exams = 0;
        const kinds = { band: 0, bulge: 0, blob: 0 };
        for (let s = 1; s <= 30 && !bad; s++) {
          const seed = s * 7919 + tier;
          const inst = gen.generate(makeRng(seed), tier);
          const p = instanceBoxes(inst);
          if (!p) {
            bad = `seed ${seed}: no box data on the parts`;
            break;
          }
          if (p.exam) exams++;
          boxes += p.boxes.length;
          p.boxes.forEach((b) => kinds[b.kind]++);
          const probs = boxProblems(p, tier);
          if (inst.parts.length !== p.boxes.length) probs.push(`${inst.parts.length} parts for ${p.boxes.length} boxes`);
          if (probs.length) bad = `seed ${seed}: ${probs.slice(0, 3).join('; ')}`;
        }
        return isTrue(`tier ${tier}: ${boxes} boxes (${kinds.band} bands, ${kinds.bulge} bulges, ${kinds.blob} blobs; ${exams} paper figures) all sound`, !bad, bad);
      });
    },
  },
  {
    id: 'plan-cspace-match',
    topic: 'plan',
    title: 'Tier 3 matching: the deck’s answer (A-1, B-3, C-2) and generated triples that only band/blob reading separates',
    source: 'Review deck slide 16; generator plan-cspace tier 3',
    run() {
      const out: CheckResult[] = [];
      let deckSeen = false;
      let bad = '';
      for (let s = 1; s <= 30 && !bad; s++) {
        const seed = s * 7919 + 3;
        const inst = gen.generate(makeRng(seed), 3);
        const data = inst.parts.map((q) => (q.kind === 'custom' ? matchPartData((q as CustomPart).render) : null));
        const mp = data[0]?.problem;
        if (!mp || data.some((d) => !d)) {
          bad = `seed ${seed}: no match data`;
          break;
        }
        if ([...mp.plotOf].sort().join('') !== '012') bad = `seed ${seed}: plotOf ${mp.plotOf} is not a permutation`;
        const sigs = [0, 1, 2].map((w) => matchSignature(mp, w));
        const keys = sigs.map((g) => `${g.bands}/${g.blobs}`);
        if (new Set(keys).size !== 3) bad = `seed ${seed}: two workspaces make the same counts ${keys}`;
        // every obstacle's region kind agrees with the circle rule (inside the L1 circle <=> link-1 band)
        mp.wss.forEach((ws, w) =>
          ws.obstacles.forEach((ob, o) => {
            if (obstacleInfo(ws, ob.shape).band !== sigs[w].regs[o].band) bad = `seed ${seed}: workspace ${w} obstacle ${o} breaks the circle rule`;
          })
        );
        if (mp.deck) {
          deckSeen = true;
          const ok = mp.plotOf.join(',') === '0,2,1' && keys.join(' ') === '2/1 2/0 1/1';
          if (!ok) bad = `deck triple: plots ${mp.plotOf}, counts ${keys}`;
        }
        for (let w = 0; w < 3 && !bad && s <= 10; w++) {
          const texts = [matchWhy(mp, w), ...[0, 1, 2].filter((k) => k !== mp.plotOf[w]).map((k) => matchWrong(mp, w, k).text)];
          const probs = texts.flatMap(texProblems);
          if (probs.length) bad = `seed ${seed} workspace ${w}: ${probs[0]}`;
        }
      }
      out.push(isTrue('30 tier-3 instances: plots are a permutation, workspaces distinguishable, texts parse', !bad, bad));
      out.push(isTrue('the review deck’s own triple appears among them with A-1, B-3, C-2', deckSeen));
      return out;
    },
  },
  {
    id: 'plan-cspace-sanity',
    topic: 'plan',
    title: 'plan-cspace generator sanity: every tier x 30 seeds, 4 hints, TeX parses, answers self-consistent',
    source: 'Generator plan-cspace',
    run() {
      const out = generatorSanity(gen, 30);
      // the custom parts' own explanations (right answer and every wrong pick) parse, and wrong picks carry known traps
      let bad = '';
      for (const tier of [1, 2] as const)
        for (let s = 1; s <= 12 && !bad; s++) {
          const inst = gen.generate(makeRng(s * 7919 + tier), tier);
          for (const q of inst.parts) {
            const d = q.kind === 'custom' ? boxPartData((q as CustomPart).render) : null;
            if (!d) {
              bad = `tier ${tier} seed ${s}: part ${q.id} is not a box part`;
              break;
            }
            const { problem: p, box: b } = d;
            if (b.answer < 0 || b.answer >= p.ws.obstacles.length) bad = `tier ${tier} seed ${s}: box ${b.num} answer out of range`;
            const texts = [boxWhy(p, b)];
            p.ws.obstacles.forEach((_, o) => {
              if (o === b.answer) return;
              const w = boxWrong(p, b, o);
              texts.push(w.text);
              if (w.trapId && !trapById(w.trapId)) bad = `unknown trap ${w.trapId}`;
            });
            const probs = texts.flatMap(texProblems);
            if (probs.length) bad = `tier ${tier} seed ${s} box ${b.num}: ${probs[0]}`;
          }
        }
      out.push(isTrue('box parts: every explanation parses, wrong picks use known traps', !bad, bad));
      return out;
    },
  },
];
