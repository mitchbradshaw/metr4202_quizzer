// Self-tests for the inverse-kinematics track of kinematics: the Pieper deck against an automatic check of the
// consecutive axes, the decoupling the Pieper simulation shows (W fixed while the wrist moves), the Newton–Raphson
// generator against core/kin planarIk, the IK simulation's model (basin map, solution curve) against the core, and a
// sanity sweep over every IK generator, tier and 40 seeds.
import katex from 'katex';
import type { SelfTest, CheckResult } from '../../../selftest/types';
import type { SolveGenerator, SolveInstance, Tier } from '../../../engine/types';
import { isTrue, nearAbs } from '../../../selftest/assert';
import { makeRng } from '../../../engine/rng';
import { checkChoice, checkMatrix, checkNumeric } from '../../../engine/check';
import { cross3, dot3, norm3, planarFk, planarIk, planarJacobian, sub3, type Vec3 } from '../../../core/kin';
import { LAYOUTS, layoutById, pieperCheck, tripleName } from '../../../core/kin_pieper';
import { focusPoint, highlightFor, poseLayout } from '../explore/kinikPieperDraw';
import { BASIN_NONE, basinMap, classifyRun, nrRun, selfMotion3, twoLinkSolutions } from '../explore/kinikModel';
import { generators, nrInstance, nrStep } from '../solve/ik';

// ------------------------------------------------------------------ generator sanity

/** Every TeX fragment ($…$, $$…$$) in a Rich string. */
function texIn(s: string): { tex: string; display: boolean }[] {
  const src = s.replace(/\\\$/g, '\u0000');
  const out: { tex: string; display: boolean }[] = [];
  const re = /\$\$([\s\S]+?)\$\$|\$([^$]+?)\$/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) out.push({ tex: (m[1] ?? m[2]).replace(/\u0000/g, '\\$'), display: m[1] !== undefined });
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
function instanceProblems(inst: SolveInstance): string[] {
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
      for (const t of p.traps ?? []) {
        texts.push(t.message);
        if (checkMatrix(p, t.value.map((row) => row.map(String))).correct) bad.push(`${p.id}: matrix trap accepted as correct`);
      }
      texts.push(...(p.rowLabels ?? []), ...(p.colLabels ?? []));
    } else if (p.kind === 'order') {
      if (p.steps.length < 2 || p.steps.some((s) => !s.trim())) bad.push(`${p.id}: bad steps`);
      texts.push(...p.steps);
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
    if (/\t/.test(t)) bad.push(`tab character (a lost \\t?) in "${t.slice(0, 60)}"`);
    for (const { tex, display } of texIn(t)) {
      const e = texError(tex, display);
      if (e) bad.push(e);
    }
  }
  if (inst.figure && typeof inst.figure !== 'function') bad.push('figure is not a component');
  return bad;
}

/** Every tier × `seeds` seeds: generates, finite answers, 4 hints, own answers accepted, traps rejected, TeX parses. */
function generatorSanity(gen: SolveGenerator, seeds = 40): CheckResult[] {
  return gen.tiers.map((tier) => {
    let bad = '';
    let parts = 0;
    for (let s = 1; s <= seeds && !bad; s++) {
      const seed = s * 7919 + tier;
      try {
        const inst = gen.generate(makeRng(seed), tier);
        parts += inst.parts.length;
        const probs = instanceProblems(inst);
        if (probs.length) bad = `seed ${seed}: ${probs.slice(0, 3).join('; ')}`;
      } catch (e) {
        bad = `seed ${seed} threw ${(e as Error).message}`;
      }
    }
    return isTrue(`${gen.id} tier ${tier}: ${seeds} seeds well formed (${parts} parts)`, !bad, bad);
  });
}

const gen = (id: string) => generators.find((g) => g.id === id)!;
const answerOf = (inst: SolveInstance, id: string): number | undefined => {
  const p = inst.parts.find((q) => q.id === id);
  return p && p.kind === 'numeric' ? p.answer : undefined;
};

// ------------------------------------------------------------------ tests

export const tests: SelfTest[] = [
  {
    id: 'kin-ik-pieper-labels',
    topic: 'kin',
    title: 'Pieper deck: every layout’s hand-written label matches the automatic consecutive-axes check',
    source: '2023 Q12 worked solution; summary notes §6',
    run: () => {
      const out: CheckResult[] = [];
      for (const L of LAYOUTS) {
        const r = pieperCheck(L.joints);
        const desc = `auto: ${r.closedForm ? 'closed form' : 'no'} (${r.reason}${r.triple ? ` ${tripleName(r.triple)}` : ''}), rank ${r.rank}, ω-rank ${r.wRank}; triples ${r.triples.map((t) => `${tripleName([t.start, t.start + 1, t.start + 2])}:${t.kind}`).join(' ')}`;
        const ok = r.closedForm === L.closedForm && r.reason === L.reason && (!L.closedForm || (r.triple ?? []).join() === (L.triple ?? []).join());
        out.push(isTrue(`${L.id}: ${L.closedForm ? 'closed form' : 'no closed form'} (${L.reason})`, ok, desc));
      }
      const q12 = ['q12a', 'q12b', 'stanford', 'q12d'].map((id) => layoutById(id).closedForm);
      out.push(isTrue('2023 Q12: only (c), the Stanford layout, has a closed form', q12.join() === 'false,false,true,false', q12.join()));
      return out;
    },
  },
  {
    id: 'kin-ik-pieper-decouple',
    topic: 'kin',
    title: 'Pieper simulation: W stays put when the meeting joints move; the offset wrist’s W′ moves; parallel axes keep a plane; (d) only turns about y',
    source: 'Summary notes §6 (decoupling); 2023 Q12 worked solution',
    run: () => {
      const out: CheckResult[] = [];
      const rnd = makeRng(4202);
      const angles = (js: number[]) => [0, 1, 2, 3, 4, 5].map((i) => (js.includes(i) ? rnd.uniform(-1.4, 1.4) : 0));
      for (const L of LAYOUTS) {
        const home = poseLayout(L);
        if (L.closedForm && L.reason === 'meet' && L.triple) {
          const W0 = focusPoint(L, home).p;
          const hl = highlightFor(L, home);
          const auto = pieperCheck(L.joints).point!;
          // joints from the first of the triple onwards cannot move the common point
          const js = [0, 1, 2, 3, 4, 5].filter((i) => i >= L.triple![0]);
          let worst = 0;
          for (let k = 0; k < 25; k++) worst = Math.max(worst, norm3(sub3(focusPoint(L, poseLayout(L, angles(js))).p, W0)));
          out.push(nearAbs(`${L.id}: W does not move while joints ${js.map((i) => i + 1).join(', ')} turn (25 random poses)`, worst, 0, 1e-9));
          out.push(nearAbs(`${L.id}: the overlay’s meeting point is the automatic check’s point`, norm3(sub3(hl!.meet!.p, auto)), 0, 1e-9));
        } else if (L.reason === 'none') {
          const W0 = focusPoint(L, home).p;
          let moved = 0;
          for (let k = 0; k < 25; k++) moved = Math.max(moved, norm3(sub3(focusPoint(L, poseLayout(L, angles([3]))).p, W0)));
          out.push(isTrue(`${L.id}: W′ (where axes 5 and 6 meet) moves when joint 4 turns (up to ${moved.toFixed(2)} m)`, moved > 0.2));
        } else if (L.reason === 'parallel' && L.triple) {
          const [i] = L.triple;
          const n = L.joints[i].axis;
          const a = L.joints[i].at;
          let off = 0;
          for (let k = 0; k < 25; k++) {
            const P = poseLayout(L, angles([...L.triple]));
            for (const lk of P.links) if (lk.link > i) for (const p of lk.pts) off = Math.max(off, Math.abs(dot3(sub3(p, a), n)));
          }
          out.push(nearAbs(`${L.id}: links moved by joints ${tripleName(L.triple)} stay in the plane normal to the parallel axes`, off, 0, 1e-9));
        } else if (L.reason === 'orientation') {
          let worst = 0;
          for (let k = 0; k < 25; k++) {
            const P = poseLayout(L, angles([0, 1, 2, 3, 4, 5]));
            // the gripper only ever turns about y: its y-pointing approach axis never changes
            worst = Math.max(worst, norm3(cross3(P.tool.dir, [0, -1, 0] as Vec3)), Math.abs(P.tool.side[1]));
          }
          out.push(nearAbs(`${L.id}: whatever the joints do, the gripper only rotates about y`, worst, 0, 1e-9));
        }
      }
      return out;
    },
  },
  {
    id: 'kin-ik-nr-step',
    topic: 'kin',
    title: 'kin-nr-step: tip, error, J, Δθ and θ⁽¹⁾ equal core planarIk’s first iterate (every tier, 40 seeds) and a hand-worked example',
    source: 'Summary notes §6 (Newton–Raphson); core/kin planarIk',
    run: () => {
      const out: CheckResult[] = [];
      // a by-hand reference with every number written out (Cramer's rule, no shared code)
      const L: [number, number] = [0.8, 0.6];
      const th: [number, number] = [0.45, 1.2];
      const xd: [number, number] = [0.25, 1.2];
      const c1 = Math.cos(0.45);
      const s1 = Math.sin(0.45);
      const c12 = Math.cos(1.65);
      const s12 = Math.sin(1.65);
      const x = 0.8 * c1 + 0.6 * c12;
      const y = 0.8 * s1 + 0.6 * s12;
      const [ex, ey] = [0.25 - x, 1.2 - y];
      const [a, b, c, d] = [-0.8 * s1 - 0.6 * s12, -0.6 * s12, 0.8 * c1 + 0.6 * c12, 0.6 * c12];
      const det = a * d - b * c;
      const d1 = (ex * d - b * ey) / det;
      const d2 = (a * ey - c * ex) / det;
      const st = nrStep(L, th, xd);
      out.push(nearAbs('hand example: tip x = 0.8 cos 0.45 + 0.6 cos 1.65', st.tip[0], x, 1e-12));
      out.push(nearAbs('hand example: det J = L₁L₂ sin θ₂ = 0.48 sin 1.2', st.det, 0.48 * Math.sin(1.2), 1e-12));
      out.push(nearAbs('hand example: Δθ₁ by Cramer’s rule', st.dth[0], d1, 1e-12));
      out.push(nearAbs('hand example: Δθ₂ by Cramer’s rule', st.dth[1], d2, 1e-12));
      const core = planarIk(L, xd, th, { maxIter: 1 }).iterates;
      out.push(nearAbs('hand example: θ⁽¹⁾₁ = planarIk’s first iterate', st.th1[0], core[1].theta[0], 1e-8));
      out.push(nearAbs('hand example: θ⁽¹⁾₂ = planarIk’s first iterate', st.th1[1], core[1].theta[1], 1e-8));

      const g = gen('kin-nr-step');
      for (const tier of g.tiers) {
        let worst = 0;
        let compared = 0;
        let msg = '';
        for (let s = 1; s <= 40; s++) {
          const seed = s * 104729 + tier;
          const inst = g.generate(makeRng(seed), tier);
          const d = nrInstance(makeRng(seed), tier);
          const it = planarIk(d.L, d.xd, d.th0, { maxIter: 1 }).iterates;
          const J = planarJacobian(d.L, d.th0);
          const scale = (v: number) => Math.max(1, Math.abs(v));
          const want: [string, number][] = [
            ['tip-x', it[0].tip[0]],
            ['tip-y', it[0].tip[1]],
            ['e-x', d.xd[0] - it[0].tip[0]],
            ['e-y', d.xd[1] - it[0].tip[1]],
            ['det', J[0][0] * J[1][1] - J[0][1] * J[1][0]],
            ...(it[1] ? ([['dth-1', it[1].theta[0] - d.th0[0]], ['dth-2', it[1].theta[1] - d.th0[1]], ['th1-1', it[1].theta[0]], ['th1-2', it[1].theta[1]]] as [string, number][]) : []),
          ];
          for (const [id, v] of want) {
            const got = answerOf(inst, id);
            if (got === undefined) continue;
            compared++;
            const dev = Math.abs(got - v) / scale(v);
            if (dev > worst) {
              worst = dev;
              msg = `seed ${seed} ${id}: ${got} vs ${v}`;
            }
          }
          const Jp = inst.parts.find((p) => p.id === 'J');
          if (Jp && Jp.kind === 'matrix') worst = Math.max(worst, ...Jp.answer.flatMap((r, i) => r.map((x, j) => Math.abs(x - J[i][j]))));
        }
        out.push(isTrue(`tier ${tier}: ${compared} answers agree with planarIk (worst relative deviation ${worst.toExponential(1)})`, worst < 1e-6 && compared >= 40 * 5, msg));
      }
      return out;
    },
  },
  {
    id: 'kin-ik-nr-variants',
    topic: 'kin',
    title: 'kin-nr-step instances: tiers 1–2 converge (‖e⁽¹⁾‖ < ½‖e⁽⁰⁾‖), tier 3 covers degrees / check / singular, singular starts take huge steps',
    source: 'Summary notes §6 (singularities: “steps blow up”)',
    run: () => {
      const out: CheckResult[] = [];
      for (const tier of [1, 2] as Tier[]) {
        let bad = '';
        for (let s = 1; s <= 60 && !bad; s++) {
          const d = nrInstance(makeRng(s * 31 + tier), tier);
          if (!(d.err1 < 0.5 * d.err0) || Math.abs(Math.sin(d.th0[1])) < 0.5) bad = `seed ${s}: err ${d.err0} → ${d.err1}, θ2 = ${d.th0[1]}`;
        }
        out.push(isTrue(`tier ${tier}: 60 instances, every step at least halves the error, guess well away from det J = 0`, !bad, bad));
      }
      const seen = new Set<string>();
      let singularOk = true;
      for (let s = 1; s <= 60; s++) {
        const d = nrInstance(makeRng(s * 31 + 3), 3);
        seen.add(d.variant);
        if (d.variant === 'singular' && !(Math.hypot(...d.dth) > 3 && Math.abs(d.det) < 0.12)) singularOk = false;
      }
      out.push(isTrue('tier 3: all three twists appear in 60 seeds', ['degrees', 'check', 'singular'].every((v) => seen.has(v)), [...seen].join(', ')));
      out.push(isTrue('tier 3 singular starts: ‖Δθ‖ > 3 rad with |det J| < 0.12 m²', singularOk));
      return out;
    },
  },
  {
    id: 'kin-ik-model',
    topic: 'kin',
    title: 'IK simulation model: nrRun = planarIk, the fast basin map agrees with planarIk runs, every exact / self-motion solution reaches the target',
    source: 'core/kin planarIk; explore/kinikModel.ts',
    run: () => {
      const out: CheckResult[] = [];
      const L2: [number, number] = [1.0, 0.7];
      const target: [number, number] = [1.1, 0.6];
      const run = nrRun(L2, target, [0.7, 1.9], 0);
      const core = planarIk(L2, target, [0.7, 1.9], { maxIter: 30, tol: 1e-4, lambda: 1e-6 });
      out.push(isTrue('nrRun has the same iterates as planarIk', run.steps.length === core.iterates.length && run.steps.every((s, k) => Math.abs(s.theta[0] - core.iterates[k].theta[0]) + Math.abs(s.theta[1] - core.iterates[k].theta[1]) < 1e-12), `${run.steps.length} vs ${core.iterates.length}`));
      out.push(isTrue('the first scenario converges', run.converged));
      for (const lambda of [0, 0.2]) {
        const N = 16;
        const code = new Uint8Array(N * N);
        const its = new Uint8Array(N * N);
        basinMap(L2[0], L2[1], target, lambda, N, code, its);
        let agree = 0;
        for (let j = 0; j < N; j++)
          for (let i = 0; i < N; i++) {
            const g: [number, number] = [((i + 0.5) * 2 * Math.PI) / N, ((j + 0.5) * 2 * Math.PI) / N];
            if (classifyRun(nrRun(L2, target, g, lambda)) === code[j * N + i]) agree++;
          }
        out.push(isTrue(`λ = ${lambda}: basin map agrees with planarIk on ${agree} of ${N * N} guesses (≥ 95 %)`, agree >= 0.95 * N * N));
      }
      const far = new Uint8Array(64);
      basinMap(L2[0], L2[1], [1.6, 0.9], 0, 8, far, new Uint8Array(64));
      out.push(isTrue('out of reach (1.84 m > 1.7 m): no guess converges', far.every((c) => c === BASIN_NONE)));
      const sols = twoLinkSolutions(L2[0], L2[1], target);
      out.push(isTrue('two exact solutions, both on the target', sols.length === 2 && sols.every((s) => Math.hypot(planarFk(L2, s)[2][0] - target[0], planarFk(L2, s)[2][1] - target[1]) < 1e-12)));
      const L3 = [0.8, 0.6, 0.4];
      const curves = selfMotion3(L3, [0.9, 0.7]);
      let worst = 0;
      let n = 0;
      for (const c of curves)
        for (const th of c.pts) {
          const tip = planarFk(L3, th)[3];
          worst = Math.max(worst, Math.hypot(tip[0] - 0.9, tip[1] - 0.7));
          n++;
        }
      out.push(isTrue(`3-link self-motion: ${n} sampled configurations, all with the tip on the target (worst ${worst.toExponential(1)} m)`, n > 100 && worst < 1e-9));
      return out;
    },
  },
  {
    id: 'kin-ik-sanity',
    topic: 'kin',
    title: 'IK generators sanity: every tier × 40 seeds, exactly 4 hints, TeX parses, own answers accepted, traps rejected',
    source: 'docs/AUTHORING.md (generator sanity test)',
    run: () => generators.flatMap((g) => generatorSanity(g, 40)),
  },
];
