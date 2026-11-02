// Self-tests for RRT steering with the velocity model (plan-steer).
import type { SelfTest } from '../../../selftest/types';
import { isTrue, nearAbs } from '../../../selftest/assert';
import { makeRng } from '../../../engine/rng';
import { velocityMotion } from '../../../core/motion';
import { checkNumeric } from '../../../engine/check';
import type { NumericPart } from '../../../engine/types';
import { generators, steerChain, _internal } from '../solve/steer';
import { generatorSanity } from './rrtstar';

export const tests: SelfTest[] = [
  {
    id: 'plan-steer-2023q32',
    topic: 'plan',
    title: '2023 Q32 through the steering solver: (1.1, −2.7, 0) → (3.4642, −2.3427, 0.3) → (4.4525, −2.2435, −0.1)',
    source: '2023 worked solutions Q32(b)',
    run: () => {
      const s = steerChain({ x: 1.1, y: -2.7, theta: 0 }, [
        { v: 1.2, w: 0.15, dt: 2 },
        { v: 0.5, w: -0.2, dt: 2 },
      ]);
      return [
        nearAbs('r₁ = v/ω = 8', s[0].r, 8, 1e-12),
        nearAbs('ω₁Δt = 0.3', s[0].wdt, 0.3, 1e-12),
        nearAbs('x₁ = 3.4642', s[0].to.x, 3.4642, 5e-5),
        nearAbs('y₁ = −2.3427', s[0].to.y, -2.3427, 5e-5),
        nearAbs('θ₁ = 0.3', s[0].to.theta, 0.3, 1e-12),
        nearAbs('r₂ = −2.5 (sign kept)', s[1].r, -2.5, 1e-12),
        nearAbs('ω₂Δt = −0.4', s[1].wdt, -0.4, 1e-12),
        nearAbs('x₂ = 4.4525', s[1].to.x, 4.4525, 5e-5),
        nearAbs('y₂ = −2.2435', s[1].to.y, -2.2435, 5e-5),
        nearAbs('θ₂ = −0.1 (not wrapped)', s[1].to.theta, -0.1, 1e-12),
        isTrue('command 2 starts where command 1 ended', s[1].from === s[0].to),
      ];
    },
  },
  {
    id: 'plan-steer-cases',
    topic: 'plan',
    title: 'Steering solver: review-deck arc, ω = 0 straight line, and the 2023 traps are rejected',
    source: 'Review deck (velocity model check); summary notes §3',
    run: () => {
      const arc = steerChain({ x: 0, y: 0, theta: 0 }, [{ v: 0.8, w: 0.03, dt: 2 }])[0];
      const line = steerChain({ x: 1, y: 2, theta: 0.5 }, [{ v: 0.8, w: 0, dt: 2.5 }])[0];
      const part: NumericPart = { kind: 'numeric', id: 'x2', label: '', answer: 4.4525, unit: 'm', tol: 0.002, absTol: 0.006 };
      const p1 = { x: 3.4642, y: -2.3427, theta: 0.3 };
      const deg = _internal.degMode(p1, { v: 0.5, w: -0.2, dt: 2 });
      const noCarry = velocityMotion({ ...p1, theta: 0 }, 0.5, -0.2, 2);
      return [
        nearAbs('review deck: x = 1.5990', arc.to.x, 1.599, 5e-4),
        nearAbs('review deck: y = 0.04799', arc.to.y, 0.04799, 5e-5),
        nearAbs('review deck: θ = 0.06', arc.to.theta, 0.06, 1e-12),
        isTrue('ω = 0 is flagged straight with infinite radius', line.straight && !Number.isFinite(line.r)),
        nearAbs('ω = 0: x = 1 + 2 cos 0.5', line.to.x, 1 + 2 * Math.cos(0.5), 1e-12),
        nearAbs('ω = 0: y = 2 + 2 sin 0.5', line.to.y, 2 + 2 * Math.sin(0.5), 1e-12),
        nearAbs('ω = 0: heading unchanged', line.to.theta, 0.5, 1e-12),
        isTrue('the paper’s rounded 4.45 is accepted for x₂', checkNumeric(part, '4.45').correct),
        isTrue(`degrees-mode x₂ (${deg.x.toFixed(4)}) is rejected`, !checkNumeric(part, String(deg.x)).correct),
        isTrue(`x₂ without carrying θ₁ (${noCarry.x.toFixed(4)}) is rejected`, !checkNumeric(part, String(noCarry.x)).correct),
      ];
    },
  },
  {
    id: 'plan-steer-instances',
    topic: 'plan',
    title: 'plan-steer instances: tier 1 one arc, tier 2 two arcs of opposite turn, tier 3 a straight leg or three arcs; answers chain',
    run: () =>
      ([1, 2, 3] as const).map((t) => {
        let bad = '';
        let straight = 0;
        let three = 0;
        for (let s = 1; s <= 60 && !bad; s++) {
          const rng = makeRng(s * 131 + t);
          const inst = _internal.makeInstance(rng, t);
          const steps = steerChain(inst.start, inst.cmds);
          const n = inst.cmds.length;
          if (t === 1 && n !== 1) bad = `seed ${s}: ${n} commands`;
          if (t === 2 && (n !== 2 || Math.sign(inst.cmds[0].w) === Math.sign(inst.cmds[1].w))) bad = `seed ${s}: tier 2 needs opposite turns`;
          if (t === 3 && !(n === 3 || inst.cmds.some((c) => c.w === 0))) bad = `seed ${s}: tier 3 has neither a straight leg nor three commands`;
          if (inst.cmds.some((c) => c.w !== 0 && (Math.abs(c.w * c.dt) > 1.2 + 1e-9 || Math.abs(c.v / c.w) > 12))) bad = `seed ${s}: a command out of range`;
          if (steps.some((st, i) => i > 0 && st.from !== steps[i - 1].to)) bad = `seed ${s}: chain broken`;
          const thetaSum = inst.start.theta + inst.cmds.reduce((a, c) => a + c.w * c.dt, 0);
          if (Math.abs(steps[n - 1].to.theta - thetaSum) > 1e-9) bad = `seed ${s}: heading not carried`;
          if (inst.cmds.some((c) => c.w === 0)) straight++;
          if (n === 3) three++;
        }
        const extra = t === 3 ? `, ${straight} with a straight leg, ${three} with three arcs` : '';
        return isTrue(`tier ${t}: 60 seeds as specified${extra}`, !bad && (t !== 3 || (straight > 10 && three > 10)), bad);
      }),
  },
  {
    id: 'plan-steer-generator',
    topic: 'plan',
    title: 'plan-steer generator: every tier × 40 seeds well formed (answers pass their own checks, traps are rejected, TeX parses)',
    run: () => generators.flatMap((g) => generatorSanity(g, 40)),
  },
];
