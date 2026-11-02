// Self-tests for the models exam-mode solvers and generators, with the reference values from the review deck
// and the 2023 worked solutions, plus the simulations' presets and the facts their predictions quote.
import type { SelfTest } from '../../../selftest/types';
import type { NumericPart } from '../../../engine/types';
import { isTrue, near, nearAbs } from '../../../selftest/assert';
import { makeRng } from '../../../engine/rng';
import { checkNumeric } from '../../../engine/check';
import { odometryMotion, wrapAngle } from '../../../core/motion';
import { mixture, shortNorm } from '../../../core/models_beam';
import { generators } from '../solve';
import { velocitySteps, _internal as vel } from '../solve/velocity';
import { odometrySolve, _internal as odo } from '../solve/odometry';
import { _internal as beam } from '../solve/beam';
import { _velocity } from '../explore/VelocityArc';
import { ROUTES, meanOf, propagate, simulateRoute } from '../explore/odoWorld';
import { BEAM_SCENARIOS } from '../explore/BeamModel';
import { generatorSanity } from './sanity';

const gen = (id: string) => generators.find((x) => x.id === id)!;

export const tests: SelfTest[] = [
  {
    id: 'models-velocity-review',
    topic: 'models',
    title: 'Review deck through models-velocity’s solver: (0, 0, 0), v 0.8, ω 0.03, 2 s → (1.5990, 0.04799, 0.06)',
    source: 'Review deck, velocity model question; summary notes §3 worked check',
    run: () => {
      const s = velocitySteps({ x: 0, y: 0, theta: 0 }, [{ v: 0.8, w: 0.03, dt: 2, g: 0 }])[0];
      return [
        near('r = 26.67 m', s.r, 26.6667, 1e-4),
        nearAbs('ωΔt = 0.06 rad', s.wdt, 0.06, 1e-12),
        nearAbs("x' = 1.5990 m", s.to.x, 1.599, 5e-4),
        nearAbs("y' = 0.04799 m", s.to.y, 0.04799, 5e-6),
        nearAbs("θ' = 0.06 rad", s.to.theta, 0.06, 1e-12),
      ];
    },
  },
  {
    id: 'models-velocity-2023q32',
    topic: 'models',
    title: '2023 Q32(b) through models-velocity’s solver and the velocity sim’s preset: → (3.4642, −2.3427, 0.3) → (4.4525, −2.2435, −0.1)',
    source: '2023 worked solutions Q32(b)',
    run: () => {
      const st = velocitySteps({ x: 1.1, y: -2.7, theta: 0 }, [
        { v: 1.2, w: 0.15, dt: 2, g: 0 },
        { v: 0.5, w: -0.2, dt: 2, g: 0 },
      ]);
      const pre = _velocity.PRESETS.find((p) => p.id === 'q32')!;
      const sim = _velocity.chainPoses(pre.start, pre.cmds);
      const rev = _velocity.PRESETS.find((p) => p.id === 'review')!;
      const simRev = _velocity.chainPoses(rev.start, rev.cmds);
      const part: NumericPart = { kind: 'numeric', id: 'x2', label: '', answer: st[1].to.x, unit: 'm', tol: 0.01, absTol: 0.005 };
      const deg = vel.degMode(st[0].to, { v: 0.5, w: -0.2, dt: 2, g: 0 });
      return [
        nearAbs('x₁ = 3.4642', st[0].to.x, 3.4642, 5e-5),
        nearAbs('y₁ = −2.3427', st[0].to.y, -2.3427, 5e-5),
        nearAbs('θ₁ = 0.3', st[0].to.theta, 0.3, 1e-12),
        nearAbs('r₂ = −2.5 (sign kept)', st[1].r, -2.5, 1e-12),
        nearAbs('x₂ = 4.4525', st[1].to.x, 4.4525, 5e-5),
        nearAbs('y₂ = −2.2435', st[1].to.y, -2.2435, 5e-5),
        nearAbs('θ₂ = −0.1 (not wrapped)', st[1].to.theta, -0.1, 1e-12),
        nearAbs('the sim’s 2023 preset ends at x = 4.4525', sim[2].x, 4.4525, 5e-5),
        nearAbs('the sim’s 2023 preset ends at y = −2.2435', sim[2].y, -2.2435, 5e-5),
        nearAbs('the sim’s review preset ends at y = 0.04799', simRev[1].y, 0.04799, 5e-6),
        isTrue('the paper’s rounded 4.45 is accepted for x₂', checkNumeric(part, '4.45').correct),
        isTrue(`degrees-mode x₂ (${deg.x.toFixed(4)}) is rejected`, !checkNumeric(part, String(deg.x)).correct),
      ];
    },
  },
  {
    id: 'models-velocity-cases',
    topic: 'models',
    title: 'Velocity solver special cases: ω = 0 straight, v = 0 turn on the spot, γ changes only the heading',
    source: 'Summary notes §3',
    run: () => {
      const [line] = velocitySteps({ x: 1, y: 2, theta: 0.5 }, [{ v: 0.8, w: 0, dt: 2.5, g: 0 }]);
      const [spin] = velocitySteps({ x: 1, y: 2, theta: 0.5 }, [{ v: 0, w: 0.4, dt: 2, g: 0 }]);
      const [ga] = velocitySteps({ x: 0, y: 0, theta: 0 }, [{ v: 1, w: 0.2, dt: 2, g: 0.1 }]);
      const [ng] = velocitySteps({ x: 0, y: 0, theta: 0 }, [{ v: 1, w: 0.2, dt: 2, g: 0 }]);
      return [
        isTrue('ω = 0 is classed straight with infinite radius', line.kind === 'straight' && !Number.isFinite(line.r)),
        nearAbs('ω = 0: x = 1 + 2 cos 0.5', line.to.x, 1 + 2 * Math.cos(0.5), 1e-12),
        nearAbs('ω = 0: y = 2 + 2 sin 0.5', line.to.y, 2 + 2 * Math.sin(0.5), 1e-12),
        isTrue('v = 0 is classed as a spin', spin.kind === 'spin'),
        nearAbs('v = 0: x unchanged', spin.to.x, 1, 1e-12),
        nearAbs('v = 0: θ = 0.5 + 0.8', spin.to.theta, 1.3, 1e-12),
        nearAbs('γ = 0.1 rad/s for 2 s adds 0.2 rad to θ', ga.to.theta - ng.to.theta, 0.2, 1e-12),
        nearAbs('γ does not move x', ga.to.x, ng.to.x, 1e-12),
      ];
    },
  },
  {
    id: 'models-odometry-solver',
    topic: 'models',
    title: 'Odometry solver: (1, 2, 0.3) → (2.2, 2.9, 0.8) gives (0.3435, 1.5, 0.1565); applied to (0, 0, 0) → (1.4126, 0.5049, 0.5); wrap case',
    source: 'Thrun Table 5.6 (hand-checked)',
    run: () => {
      const { u, to } = odometrySolve({ x: 1, y: 2, theta: 0.3 }, { x: 2.2, y: 2.9, theta: 0.8 }, { x: 0, y: 0, theta: 0 });
      const w = odometrySolve({ x: 0, y: 0, theta: 3.0 }, { x: -1, y: -0.2, theta: -3.0 }, null).u;
      const dir = Math.atan2(-0.2, -1);
      return [
        nearAbs('δrot1 = atan2(0.9, 1.2) − 0.3 = 0.3435', u.rot1, Math.atan2(0.9, 1.2) - 0.3, 1e-12),
        nearAbs('δtrans = 1.5', u.trans, 1.5, 1e-12),
        nearAbs('δrot2 = 0.8 − 0.3 − δrot1 = 0.1565', u.rot2, 0.5 - (Math.atan2(0.9, 1.2) - 0.3), 1e-12),
        nearAbs("x' = 1.5 cos(0.3435) = 1.4126", to!.x, 1.5 * Math.cos(Math.atan2(0.9, 1.2) - 0.3), 1e-12),
        nearAbs("θ' = 0.5", to!.theta, 0.5, 1e-12),
        nearAbs('wrap: δrot1 = atan2(−0.2, −1) − 3.0 wrapped', w.rot1, wrapAngle(dir - 3), 1e-12),
        isTrue('wrap: both rotations lie in (−π, π]', Math.abs(w.rot1) <= Math.PI && Math.abs(w.rot2) <= Math.PI),
        nearAbs('wrap: δrot1 + δrot2 = the wrapped heading change (+0.283)', wrapAngle(w.rot1 + w.rot2), wrapAngle(-3 - 3), 1e-12),
      ];
    },
  },
  {
    id: 'models-instances',
    topic: 'models',
    title: 'Instances: velocity tier 3 covers all four twists; odometry tier 3 straddles ±π, reverses or crosses quadrants; beam readings fit their story',
    run: () => {
      const twists = new Set<string>();
      let vBad = '';
      for (let s = 1; s <= 80; s++) {
        const inst = vel.makeVelocity(makeRng(s * 31 + 3), 3);
        twists.add(inst.twist);
        if (inst.twist === 'zero' && !inst.cmds.some((c) => c.w === 0)) vBad = `seed ${s}: no straight leg`;
        if (inst.twist === 'spin' && inst.cmds[0].v !== 0) vBad = `seed ${s}: no spin`;
      }
      let oBad = '';
      const ot = new Set<string>();
      for (let s = 1; s <= 80; s++) {
        const inst = odo.makeOdometry(makeRng(s * 37 + 3), 3);
        ot.add(inst.twist);
        const { u } = odometrySolve(inst.a, inst.b, inst.start);
        if (inst.twist === 'wrap' && Math.abs(inst.b.theta - inst.a.theta) < Math.PI) oBad = `seed ${s}: no wrap`;
        if (inst.twist === 'back' && Math.abs(u.rot1) < 2.5) oBad = `seed ${s}: not backwards`;
        if (inst.twist === 'quadrant' && inst.b.x - inst.a.x >= 0) oBad = `seed ${s}: dx ≥ 0`;
        const back = odometryMotion(inst.a, u);
        if (Math.hypot(back.x - inst.b.x, back.y - inst.b.y) > 1e-9) oBad = `seed ${s}: round trip`;
      }
      let bBad = '';
      for (let s = 1; s <= 80; s++) {
        for (const t of [1, 2] as const) {
          const b = beam.makeBeam(makeRng(s * 41 + t), t);
          if (b.kase === 'short' && !(b.z < b.p.zStar)) bBad = `seed ${s}: short reading beyond z*`;
          if (b.kase === 'rand' && !(b.z > b.p.zStar)) bBad = `seed ${s}: rand reading before z*`;
          if (Math.abs(shortNorm(b.p.zStar, b.p.lambda) * (1 - Math.exp(-b.p.lambda * b.p.zStar)) - 1) > 1e-12) bBad = 'η_short';
          if (!(mixture(b.z, b.p) > 0)) bBad = `seed ${s}: p(z) = 0`;
        }
      }
      return [
        isTrue(`velocity tier 3 twists: ${[...twists].join(', ')}`, twists.size === 4 && !vBad, vBad),
        isTrue(`odometry tier 3 twists: ${[...ot].join(', ')}`, ot.size === 3 && !oBad, oBad),
        isTrue('beam readings sit where their part lives', !bBad, bBad),
      ];
    },
  },
  {
    id: 'models-sims-facts',
    topic: 'models',
    title: 'Simulation facts: weak motors put the odometry cloud nearer the truth; slip fools both; beam scenarios sum to 1',
    run: () => {
      const route = ROUTES[0];
      const weak = simulateRoute(route, { gain: 0.8, imbalance: 0, slip: 0 });
      const cw = propagate(route, weak, 1, 300);
      const K = route.cmds.length;
      const truthW = weak.truth[K];
      const eV = Math.hypot(meanOf(cw.vel[K]).x - truthW.x, meanOf(cw.vel[K]).y - truthW.y);
      const eO = Math.hypot(meanOf(cw.odo[K]).x - truthW.x, meanOf(cw.odo[K]).y - truthW.y);
      const slip = simulateRoute(route, { gain: 1, imbalance: 0, slip: 0.5 });
      const odoAhead = Math.hypot(slip.odo[K].x - slip.truth[K].x, slip.odo[K].y - slip.truth[K].y);
      return [
        isTrue(`gain 80 %: odometry mean ${eO.toFixed(2)} m from the truth vs velocity ${eV.toFixed(2)} m`, eO < eV / 2),
        isTrue(`slip 50 %: the encoder path ends ${odoAhead.toFixed(2)} m from the truth`, odoAhead > 0.2),
        isTrue('every beam scenario’s weights sum to 1', BEAM_SCENARIOS.every((s) => Math.abs(s.w.hit + s.w.short + s.w.max + s.w.rand - 1) < 1e-12)),
      ];
    },
  },
  {
    id: 'models-generators',
    topic: 'models',
    title: 'models generators: every tier × 40 seeds well formed (answers pass their own checks, traps are rejected, TeX parses)',
    run: () => [...generators.flatMap((g) => generatorSanity(g, 40)), isTrue('four generators', ['models-velocity', 'models-odometry', 'models-beam', 'models-choice'].every((id) => !!gen(id)))],
  },
];
