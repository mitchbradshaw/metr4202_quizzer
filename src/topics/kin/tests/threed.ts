// Self-tests for the helpers behind the 3-D kinematics simulations (viewer, build-m, screws, poe):
// the exam-view directions, the axis picker's R, the notes' cross-product shortcuts, {b}-frame readings, the typed
// cell checker, and the product of exponentials applied one factor at a time (space and body form, wrong order).
import katex from 'katex';
import type { CheckResult, SelfTest } from '../../../selftest/types';
import { isTrue, near, nearAbs } from '../../../selftest/assert';
import {
  EXAM_ARMS,
  L,
  armM,
  armScrewsS,
  cross3,
  crossNL,
  dot3,
  fkBody,
  fkSpace,
  linAdd,
  linNeg,
  linVecEval,
  matMul,
  norm3,
  partialSpace,
  symScrewB,
  type ArmSpec,
  type LinVec,
  type Vec3,
} from '../../../core/kin';
import { mulberry32 } from '../../../engine/rng';
import {
  DEG,
  OBLIQUE_K,
  SIGNED_AXES,
  SHORTCUT_TEX,
  axisTagAt,
  bodyTears,
  checkLenCell,
  checkLinCell,
  columnsOf,
  defaultPoeTheta,
  drawnDiagonally,
  examOrbitDir,
  factorTeX,
  frontDir,
  fromBodyPoint,
  handedness,
  maxDiff,
  paperWords,
  paperXY,
  poeJointAt,
  poePose,
  poeSegments,
  poeStepOf,
  poeSteps,
  poeWrongOrder,
  productTeX,
  qFoot,
  qShift,
  randomArmFor,
  readJoint,
  rFromColumns,
  shortcutNoteTeX,
  shortcutV,
  shortcutWorkTeX,
  sideDir,
  signedAxisOf,
  tidyT,
  toBodyPoint,
  topDir,
  wrongOrderBodies,
  wrongStepStatus,
} from '../explore/kin3dMath';

const byId = (id: string) => EXAM_ARMS.find((a) => a.id === id)!;
/** The exam robots plus 40 random axis-aligned arms (the "random arm" button). */
const ARMS: ArmSpec[] = [...EXAM_ARMS, ...Array.from({ length: 40 }, (_, k) => randomArmFor(1000 + 37 * k))];
const vdiff = (a: readonly number[], b: readonly number[]) => Math.max(...a.map((x, i) => Math.abs(x - b[i])));
const fmt = (v: readonly number[]) => `(${v.map((x) => +x.toFixed(4)).join(', ')})`;
const linEq = (a: LinVec, b: LinVec, symbols: readonly string[]) => {
  const vals = Object.fromEntries(symbols.map((s, i) => [s, 0.37 + 0.61 * i]));
  return vdiff(linVecEval(a, vals), linVecEval(b, vals)) < 1e-9;
};
const texOk = (tex: string) => {
  try {
    katex.renderToString(tex, { throwOnError: true, strict: 'ignore' });
    return '';
  } catch (e) {
    return (e as Error).message.slice(0, 80);
  }
};

export const tests: SelfTest[] = [
  {
    id: 'kin-3d-exam-view',
    topic: 'kin',
    title: 'Exam view: screen right, up and out are orthonormal and right-handed; out of the page is drawn down-left at half length',
    source: 'Exam figures 2023 Q33, 2024 Q30, 2025 Q30; review deck slide 20 (cabinet oblique drawing)',
    run: () => {
      const out: CheckResult[] = [];
      let bad = 0;
      for (const a of ARMS) {
        const { right, up, out: o } = a.view;
        const err = Math.max(Math.abs(norm3(right) - 1), Math.abs(norm3(up) - 1), Math.abs(norm3(o) - 1), Math.abs(dot3(right, up)), Math.abs(dot3(right, o)), Math.abs(dot3(up, o)), vdiff(cross3(right, up), o));
        const dirs = [examOrbitDir(a.view), topDir(a.view), sideDir(a.view), frontDir(a.view)];
        if (err > 1e-12 || dirs.some((d) => Math.abs(norm3(d) - 1) > 1e-12)) bad++;
      }
      out.push(isTrue(`${ARMS.length} robots: right · up = 0, |each| = 1, right × up = out; quick-view directions are unit`, bad === 0, `${bad} failures`));
      const v = byId('rprr-2023').view;
      const k = OBLIQUE_K * Math.SQRT1_2;
      out.push(nearAbs('2023: x̂s (out of the page) is drawn left by K/√2', paperXY([1, 0, 0], v)[0], -k, 1e-12));
      out.push(nearAbs('2023: x̂s (out of the page) is drawn down by K/√2', paperXY([1, 0, 0], v)[1], -k, 1e-12));
      out.push(nearAbs('2023: ŷs is drawn right at full length', paperXY([0, 1, 0], v)[0], 1, 1e-12));
      out.push(nearAbs('2023: ẑs is drawn up at full length', paperXY([0, 0, 1], v)[1], 1, 1e-12));
      const v25 = byId('rrrrr-2025').view;
      out.push(isTrue('2025: ŷs points into the page, drawn up-right', paperWords([0, 1, 0], v25) === 'into the page (drawn up-right)', paperWords([0, 1, 0], v25)));
      return out;
    },
  },
  {
    id: 'kin-3d-r-picker',
    topic: 'kin',
    title: 'Build M: the axis picks that match the figure give back arm.R, right-handed, with the diagonal trap flagged',
    source: '2023 Q33a, 2024 Q30a, 2025 Q30a worked solutions; summary notes §6 step 2',
    run: () => {
      const out: CheckResult[] = [];
      let bad = 0;
      let lefty = 0;
      for (const a of ARMS) {
        const cols = columnsOf(a.R);
        if (cols.some((c) => !c)) {
          bad++;
          continue;
        }
        const R = rFromColumns(cols.map((c) => c!.v));
        if (maxDiff(R as number[][], a.R) > 1e-12) bad++;
        if (handedness(cols[0]!.v, cols[1]!.v, cols[2]!.v) !== 'right' || vdiff(cross3(cols[0]!.v, cols[1]!.v), cols[2]!.v) > 1e-12) lefty++;
      }
      out.push(isTrue(`${ARMS.length} robots: picking each column's signed {s} axis rebuilds R exactly`, bad === 0, `${bad} mismatches`));
      out.push(isTrue(`${ARMS.length} robots: x̂b × ŷb = ẑb (det R = +1)`, lefty === 0, `${lefty} left-handed`));
      const a23 = byId('rprr-2023');
      const c23 = columnsOf(a23.R);
      out.push(isTrue('2023: picks are x̂b = −ẑs, ŷb = −x̂s, ẑb = +ŷs', c23.map((c) => c?.id).join(' ') === '-z -x +y', c23.map((c) => c?.id).join(' ')));
      out.push(isTrue('2023: ŷb is the one drawn diagonally (into the page, drawn up-right)', drawnDiagonally(SIGNED_AXES[1].v, a23.view) && paperWords([-1, 0, 0], a23.view) === 'into the page (drawn up-right)'));
      out.push(isTrue('Swapping one sign makes R left-handed (det = −1)', handedness([0, 0, 1], [-1, 0, 0], [0, 1, 0]) === 'left'));
      out.push(isTrue('Reusing a direction makes R degenerate (det = 0)', handedness([0, 0, 1], [0, 0, 1], [0, 1, 0]) === 'degenerate'));
      return out;
    },
  },
  {
    id: 'kin-3d-shortcuts',
    topic: 'kin',
    title: 'Cross-product shortcut table equals −ω × q; q anywhere on the axis gives the same v; flipping ω flips v',
    source: 'Summary notes §6 shortcut table and its check (2023 Q33 joint 3: v = (0, L1, 0))',
    run: () => {
      const out: CheckResult[] = [];
      const syms = ['L1', 'L2', 'L3'];
      const q: LinVec = [linAdd(L('L1'), L('L2', -2)), L('L3'), linAdd(L('L2'), L('L1', 0.5))];
      let bad = 0;
      for (const a of SIGNED_AXES) if (!linEq(shortcutV(a.v, q), crossNL(a.v, q).map(linNeg) as LinVec, syms)) bad++;
      out.push(isTrue('±x̂, ±ŷ, ±ẑ with a symbolic q: shortcut row = −ω × q', bad === 0, `${bad} of 6 rows differ`));
      out.push(isTrue('The printed rows read (0, qz, −qy), (−qz, 0, qx), (qy, −qx, 0)', SHORTCUT_TEX.join(' ') === '(0,\\ q_z,\\ -q_y) (-q_z,\\ 0,\\ q_x) (q_y,\\ -q_x,\\ 0)'));
      const v3 = shortcutV([1, 0, 0], [{}, {}, L('L1')]);
      out.push(isTrue('Notes check, 2023 Q33 joint 3: ω = x̂, q = (0, 0, L1) gives v = (0, L1, 0)', linEq(v3, [{}, L('L1'), {}], syms)));
      let slide = 0;
      let flip = 0;
      let foot = 0;
      const next = mulberry32(42);
      for (let t = 0; t < 60; t++) {
        const a = SIGNED_AXES[t % 6];
        const shift = (next() - 0.5) * 4;
        if (!linEq(shortcutV(a.v, qShift(q, a.v, shift)), shortcutV(a.v, q), syms)) slide++;
        const neg: Vec3 = [-a.v[0], -a.v[1], -a.v[2]];
        if (!linEq(shortcutV(neg, q), shortcutV(a.v, q).map(linNeg) as LinVec, syms)) flip++;
        const f = qFoot(q, a.v);
        if (Math.abs(dot3(linVecEval(f, { L1: 0.9, L2: 0.4, L3: 1.3 }), a.v)) > 1e-9 || !linEq(shortcutV(a.v, f), shortcutV(a.v, q), syms)) foot++;
      }
      out.push(isTrue('60 random slides q → q + tω leave v unchanged', slide === 0, `${slide} changed`));
      out.push(isTrue('60 flips ω → −ω give v → −v', flip === 0, `${flip} did not flip`));
      out.push(isTrue('The "simplest q" (zero along the axis) is on the axis and gives the same v', foot === 0, `${foot} failures`));
      const work = shortcutWorkTeX([0, -1, 0], [L('L2'), {}, L('L1')]);
      out.push(isTrue('Worked line for ω = −ŷ, q = (L2, 0, L1) renders in KaTeX', work.startsWith('-') && texOk(work) === '', work));
      return out;
    },
  },
  {
    id: 'kin-3d-body-reads',
    topic: 'kin',
    title: '{b}-frame readings: ω and q in {b} reproduce the screw table (review deck slide 20) for every robot',
    source: 'Review deck slide 20 (joint 1: q = (0, −L3−L4, L5+L6), v = (0, L5+L6, L3+L4)); summary notes §6 step 4',
    run: () => {
      const out: CheckResult[] = [];
      let bad = 0;
      let round = 0;
      for (const a of ARMS)
        a.joints.forEach((j, i) => {
          const rd = readJoint(a, i, 'b');
          const sb = symScrewB(a, i);
          if (vdiff(rd.w, sb.w) > 1e-12 || !linEq(rd.v, sb.v, a.symbols)) bad++;
          if (j.type === 'R' && !linEq(shortcutV(rd.w, rd.q), sb.v, a.symbols)) bad++;
          if (!linEq(fromBodyPoint(a, toBodyPoint(a, j.q)), j.q, a.symbols)) round++;
        });
      out.push(isTrue(`${ARMS.length} robots: ω_b = Rᵀω_s and −ω_b × q_b (shortcut) match symScrewB`, bad === 0, `${bad} mismatches`));
      out.push(isTrue('q_s → q_b → q_s round trip', round === 0, `${round} failures`));
      const rv = byId('review-6dof');
      const r1 = readJoint(rv, 0, 'b');
      out.push(isTrue('Review deck joint 1 in {b}: v1 = (0, L5 + L6, L3 + L4)', linEq(r1.v, [{}, linAdd(L('L5'), L('L6')), linAdd(L('L3'), L('L4'))], rv.symbols), fmt(linVecEval(r1.v, rv.values))));
      out.push(isTrue('… and the {s} answer for the same joint is v1 = 0 (the axis passes through {0})', linEq(readJoint(rv, 0, 's').v, [{}, {}, {}], rv.symbols)));
      return out;
    },
  },
  {
    id: 'kin-3d-cells',
    topic: 'kin',
    title: 'Typed cells: symbolic answers checked at hidden lengths; a sign slip is told apart from a wrong value',
    source: 'Exam marking: M and screw tables are written in the length symbols (2023–2025 worked solutions)',
    run: () => {
      const syms = ['L1', 'L2', 'L3'];
      const out: CheckResult[] = [];
      out.push(isTrue("'L2+L3' = L2 + L3", checkLinCell('L2+L3', linAdd(L('L2'), L('L3')), syms) === 'ok'));
      out.push(isTrue("'L3 + L2' in any order", checkLinCell('L3 + L2', linAdd(L('L2'), L('L3')), syms) === 'ok'));
      out.push(isTrue("'-L1' against L1 is a sign slip", checkLinCell('-L1', L('L1'), syms) === 'neg'));
      out.push(isTrue("'2*L2' against L2 is wrong", checkLinCell('2*L2', L('L2'), syms) === 'bad'));
      out.push(isTrue("'0' against 0", checkLinCell('0', {}, syms) === 'ok'));
      out.push(isTrue('An empty cell', checkLinCell('  ', L('L1'), syms) === 'empty'));
      out.push(isTrue("'L1+' cannot be read", checkLinCell('L1+', L('L1'), syms) === 'invalid'));
      out.push(isTrue('A number is compared with the drawn length (±0.01 m)', checkLenCell('1.2', L('L1'), syms, { L1: 1.2, L2: 0.5, L3: 0.6 }) === 'ok' && checkLenCell('-1.2', L('L1'), syms, { L1: 1.2, L2: 0.5, L3: 0.6 }) === 'neg'));
      return out;
    },
  },
  {
    id: 'kin-3d-poe',
    topic: 'kin',
    title: 'PoE one factor at a time: after k factors the product is the robot at the schedule pose; space = body form',
    source: 'Modern Robotics ch. 4 (PoE); summary notes §6; 2022 Q34 worked solution (T at θ = (−π/2, π, π/2, −h))',
    run: () => {
      const out: CheckResult[] = [];
      let partial = 0;
      let same = 0;
      let inv = 0;
      let realTears = 0;
      const next = mulberry32(7);
      for (const a of ARMS) {
        const vals = a.values;
        const M = armM(a, vals);
        const S = armScrewsS(a, vals);
        const n = a.joints.length;
        const th = a.joints.map((j) => (j.type === 'R' ? (next() * 2 - 1) * Math.PI : (next() * 2 - 1) * 0.5));
        for (const form of ['s', 'b'] as const) {
          const st = poeSteps(M, S, th, form);
          for (let k = 0; k <= n; k++) if (maxDiff(st.running[k], fkSpace(M, S, poePose(th, k, form))) > 1e-9) partial++;
          for (let k = 1; k <= n; k++) if (poeStepOf(n, poeJointAt(n, k, form), form) !== k) inv++;
        }
        const T = fkSpace(M, S, th);
        if (maxDiff(T, fkBody(M, poeSteps(M, S, th, 'b').B, th)) > 1e-9 || maxDiff(T, poeSteps(M, S, th, 's').running[n]) > 1e-9) same++;
        const P = partialSpace(S, th);
        const qs = a.joints.map((j) => linVecEval(j.q, vals));
        if (bodyTears(P, S, th, qs).some((t) => t.gap > 1e-9)) realTears++;
      }
      out.push(isTrue(`${ARMS.length} robots × 2 forms: running product after k factors = T(schedule pose) for every k`, partial === 0, `${partial} mismatches`));
      out.push(isTrue('Space form, body form and the step-by-step product all give the same T(θ)', same === 0, `${same} robots differ`));
      out.push(isTrue('Build step ↔ joint maps are inverse (space: last joint first; body: first joint first)', inv === 0 && poeJointAt(5, 1, 's') === 4 && poeJointAt(5, 1, 'b') === 0, `${inv} failures`));
      out.push(isTrue('A real pose never tears the arm (every joint gap 0)', realTears === 0, `${realTears} robots tear`));
      // the schedule: space form moves the distal joints first, body form the proximal ones
      const th5 = [0.1, 0.2, 0.3, 0.4, 0.5];
      out.push(isTrue('Space form after 2 factors: (0, 0, 0, θ4, θ5)', vdiff(poePose(th5, 2, 's'), [0, 0, 0, 0.4, 0.5]) < 1e-12, fmt(poePose(th5, 2, 's'))));
      out.push(isTrue('Body form after 2 factors: (θ1, θ2, 0, 0, 0)', vdiff(poePose(th5, 2, 'b'), [0.1, 0.2, 0, 0, 0]) < 1e-12, fmt(poePose(th5, 2, 'b'))));
      out.push(isTrue('Animation segments split at whole factors', JSON.stringify(poeSegments(0.4, 2)) === '[[0.4,1],[1,2]]' && JSON.stringify(poeSegments(3, 1)) === '[[3,2],[2,1]]' && poeSegments(2, 2).length === 0, JSON.stringify(poeSegments(0.4, 2))));
      // the wrong order: e^[S1]θ1 first about fixed axes
      const a25 = byId('rrrrr-2025');
      const M25 = armM(a25);
      const S25 = armScrewsS(a25);
      const th25 = defaultPoeTheta(a25);
      const W = wrongOrderBodies(S25, th25, 5);
      const Ww = poeWrongOrder(M25, S25, th25);
      out.push(nearAbs('Wrong-order bodies end at e^[S5]θ5 ⋯ e^[S1]θ1 M', maxDiff(matMul(W[5], M25), Ww), 0, 1e-9));
      out.push(isTrue('2025 arm, default pose: the wrong order misses T(θ) by more than 0.1', maxDiff(Ww, fkSpace(M25, S25, th25)) > 0.1, `max |difference| = ${maxDiff(Ww, fkSpace(M25, S25, th25)).toFixed(3)}`));
      const qs25 = a25.joints.map((j) => linVecEval(j.q, a25.values));
      out.push(isTrue('… and it tears the arm apart (some joint gap > 0.01 m)', bodyTears(W, S25, poePose(th25, 5, 'b'), qs25).some((t) => t.gap > 0.01)));
      out.push(isTrue('Wrong order: factor 1 is always fine; joint 2 (on the base axis) only tilts', wrongStepStatus(S25, th25, qs25, 0, 0.01) === 'fine' && wrongStepStatus(S25, th25, qs25, 1, 0.01) === 'tilted', wrongStepStatus(S25, th25, qs25, 1, 0.01)));
      // 2022 Q34 through the stepper
      const a22 = byId('rrrp-2022');
      const v22 = a22.values;
      const q34 = [-90 * DEG, 180 * DEG, 90 * DEG, -0.3];
      const T34 = poeSteps(armM(a22), armScrewsS(a22), q34, 's').running[4];
      const want = [
        [-1, 0, 0, v22.L1 - v22.L2],
        [0, -1, 0, 0],
        [0, 0, 1, v22.L0 - 0.3],
        [0, 0, 0, 1],
      ];
      out.push(nearAbs('2022 Q34: T = [[−1, 0, 0, L1 − L2], [0, −1, 0, 0], [0, 0, 1, L0 − h]]', maxDiff(T34, want), 0, 1e-9));
      // TeX used in the stepper
      const texs = [factorTeX('s', 2), factorTeX('b', 0), productTeX(5, 2, 's'), productTeX(5, 3, 'b'), productTeX(5, 2, 's', true), productTeX(4, 0, 'b')];
      const errs = texs.map(texOk).filter(Boolean);
      out.push(isTrue('Factor and product labels render in KaTeX', errs.length === 0 && productTeX(5, 2, 's') === 'e^{[S_{4}]\\theta_{4}}e^{[S_{5}]\\theta_{5}} M', errs.join('; ') || productTeX(5, 2, 's')));
      return out;
    },
  },
  {
    id: 'kin-3d-labels',
    topic: 'kin',
    title: 'Screw-axis tags move to the tail of the line when a frame label already sits at the arrowhead',
    source: '2023 Q33: joint 4’s axis runs along ẑb through the {b} origin',
    run: () => {
      const tip = axisTagAt([0, 0, 0], [1, 0, 0], [-1, 1], [[5, 0, 0]], 0.2, 0.1);
      const moved = axisTagAt([0, 0, 0], [1, 0, 0], [-1, 1], [[1.1, 0, 0]], 0.2, 0.1);
      return [near('No clash: the tag sits just past the arrowhead', tip[0], 1.1, 1e-9), near('Clash: the tag moves to the tail end', moved[0], -1.06, 1e-9)];
    },
  },
  {
    id: 'kin-3d-viewer-notes',
    topic: 'kin',
    title: 'Viewer: the shortcut note carries the sign of ω; q starts on its axis with no drawing offset, and v is unchanged',
    source: '2024 worked solutions Q30(b) (ω3 = −x̂s); review deck slide 20 (joint 3 in {b})',
    run: () => {
      const out: CheckResult[] = [];
      // the notes' row with the sign of ω, for every revolute joint of every arm, both ways round
      let bad = '';
      let texBad = '';
      for (const arm of ARMS)
        for (let i = 0; i < arm.joints.length; i++) {
          if (arm.joints[i].type !== 'R') continue;
          const rd = readJoint(arm, i, 's');
          const a = signedAxisOf(rd.dir)!;
          for (const flipped of [false, true]) {
            const note = shortcutNoteTeX(rd.dir, flipped);
            const neg = (a.sign < 0) !== flipped;
            const want = `\\omega = ${neg ? '-' : ''}\\hat{${'xyz'[a.axis]}}:\\ v = ${neg ? '-' : ''}${SHORTCUT_TEX[a.axis]}`;
            if (note !== want && !bad) bad = `${arm.id} joint ${i + 1}${flipped ? ' flipped' : ''}: ${note}`;
            const e = texOk(note);
            if (e && !texBad) texBad = e;
          }
        }
      out.push(isTrue('The note shows ω with its sign (−x̂ for 2024 joint 3), negated with v when flipped', !bad, bad || 'all joints'));
      out.push(isTrue('The notes render in KaTeX', !texBad, texBad || 'ok'));
      const j3 = shortcutNoteTeX(readJoint(byId('prr-2024'), 2, 's').dir);
      out.push(isTrue('2024 joint 3: ω = −x̂, v = −(0, q_z, −q_y)', j3 === `\\omega = -\\hat{x}:\\ v = -${SHORTCUT_TEX[0]}`, j3));
      // tidy q: only the review deck's joint 3 carries a drawing offset; removing it keeps q on the axis and v the same
      const rev = byId('review-6dof');
      for (const fr of ['s', 'b'] as const) {
        const rd = readJoint(rev, 2, fr);
        const t = tidyT(rd.q, rd.dir);
        const q = qShift(rd.q, rd.dir, t);
        const a = signedAxisOf(rd.dir)!;
        out.push(isTrue(`Review joint 3 in {${fr}}: the along-axis coordinate keeps only symbols`, Math.abs(t) > 0.1 && !('1' in q[a.axis]), JSON.stringify(q[a.axis])));
        out.push(isTrue(`Review joint 3 in {${fr}}: v is unchanged by the tidy point`, linEq(shortcutV(rd.w, q), rd.v, rev.symbols), fmt(linVecEval(shortcutV(rd.w, q), rev.values))));
      }
      const bq = qShift(readJoint(rev, 2, 'b').q, readJoint(rev, 2, 'b').dir, tidyT(readJoint(rev, 2, 'b').q, readJoint(rev, 2, 'b').dir));
      out.push(isTrue('Review joint 3 in {b}: q = (0, −L3 − L4, L2 + L5 + L6)', linEq(bq, [{}, linAdd(L('L3', -1), L('L4', -1)), linAdd(L('L2'), L('L5'), L('L6'))], rev.symbols), fmt(linVecEval(bq, rev.values))));
      const others = ARMS.flatMap((arm) => arm.joints.map((j, i) => ({ arm, i, j }))).filter(({ arm, i, j }) => j.type === 'R' && !(arm.id === 'review-6dof' && i === 2));
      const moved = others.filter(({ arm, i }) => (['s', 'b'] as const).some((fr) => tidyT(readJoint(arm, i, fr).q, readJoint(arm, i, fr).dir) !== 0));
      out.push(isTrue('Every other revolute joint starts at the joint itself (no offset to remove)', moved.length === 0, moved.map(({ arm, i }) => `${arm.id} j${i + 1}`).join(', ') || `${others.length} joints`));
      return out;
    },
  },
];
