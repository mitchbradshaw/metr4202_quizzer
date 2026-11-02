// Self-tests for the local-planning generators (solve/local.ts): plan-local-choice and plan-dwa-window, and the
// dynamic-window numbers they (and the DWA simulation) rely on.
import type { CheckResult, SelfTest } from '../../../selftest/types';
import type { ChoicePart, NumericPart, SolveInstance } from '../../../engine/types';
import { isTrue, nearAbs } from '../../../selftest/assert';
import { makeRng } from '../../../engine/rng';
import { checkChoice, checkNumeric } from '../../../engine/check';
import { dynamicWindow } from '../../../core/local';
import { DWA_DEFAULT, windowOf } from '../explore/localDwa';
import { generators } from '../solve/local';
import { generatorSanity } from './rrtstar';

const gen = (id: string) => generators.find((g) => g.id === id)!;

/** A given's numeric value ("0.8 m/s", "−1.2 rad/s" → 0.8, −1.2). */
function givenValue(inst: SolveInstance, sym: string): number {
  const g = (inst.givens ?? []).find((x) => x.sym === sym);
  return g ? parseFloat(g.value.replace('−', '-')) : NaN;
}

const numPart = (inst: SolveInstance, id: string) => inst.parts.find((p): p is NumericPart => p.kind === 'numeric' && p.id === id);
const choicePart = (inst: SolveInstance) => inst.parts.find((p): p is ChoicePart => p.kind === 'choice');

export const tests: SelfTest[] = [
  {
    id: 'plan-local-generators',
    topic: 'plan',
    title: 'plan-local-choice and plan-dwa-window: every tier × 40 seeds well formed (finite answers, 4 hints, own answers pass, traps rejected, TeX parses)',
    run: () => [...generatorSanity(gen('plan-local-choice'), 40), ...generatorSanity(gen('plan-dwa-window'), 40)],
  },
  {
    id: 'plan-local-choice-shape',
    topic: 'plan',
    title: 'plan-local-choice: every instance is a single-key multiple choice (one correct option, a why for every option)',
    run: () =>
      ([1, 2, 3] as const).map((t) => {
        let bad = '';
        const prompts = new Set<string>();
        for (let s = 1; s <= 40 && !bad; s++) {
          const inst = gen('plan-local-choice').generate(makeRng(s * 104729 + t), t);
          prompts.add(inst.prompt.slice(0, 60));
          const choices = inst.parts.filter((p): p is ChoicePart => p.kind === 'choice');
          if (!choices.length) bad = `seed ${s}: no choice part`;
          for (const c of choices) {
            const keys = c.options.map((o, i) => (o.correct ? i : -1)).filter((i) => i >= 0);
            if (!c.multi && keys.length !== 1) bad = `seed ${s}: ${keys.length} keys`;
            if (c.options.some((o) => !o.why)) bad = `seed ${s}: option without why`;
            const wrong = c.options.findIndex((o) => !o.correct);
            if (wrong >= 0 && checkChoice(c, [wrong]).correct) bad = `seed ${s}: a wrong option is accepted`;
          }
        }
        return isTrue(`tier ${t}: 40 seeds, ${prompts.size} different scenarios`, !bad && prompts.size >= 3, bad);
      }),
  },
  {
    id: 'plan-dwa-window-numbers',
    topic: 'plan',
    title: 'Dynamic window by hand: V_d = [v ± v̇Δt] × [ω ± ω̇Δt] cut to the box (core, the DWA sim and the worked example)',
    source: 'Summary notes §5 (dynamic window approach); Fox, Burgard & Thrun (1997)',
    run: () => {
      const p = { ...DWA_DEFAULT };
      // The DWA prediction in the simulation: v = 0.8, ω = 0, v̇ = 1, ω̇ = 4, Δt = 0.25, v_max = 1, ω_max = 2.
      const a = windowOf(0.8, 0, p);
      // At rest: v − v̇Δt < 0 is clipped to 0; turning hard: ω + ω̇Δt > ω_max is clipped.
      const b = windowOf(0.1, 1.5, p);
      const c = windowOf(1, -1.8, { ...p, aMax: 2, dt: 0.5 });
      const core = dynamicWindow(0.6, 0.3, { vMax: 1, wMax: 2, aMax: 0.5, alphaMax: 1, dt: 0.2, horizon: 1, nv: 5, nw: 5, radius: 0.2, heading: 1, clearance: 1, velocity: 1 });
      return [
        nearAbs('v₀ = 0.8 − 1(0.25) = 0.55 m/s', a.v0, 0.55, 1e-12),
        nearAbs('v₁ = min(1, 0.8 + 0.25) = 1 m/s (clipped at v_max)', a.v1, 1, 1e-12),
        nearAbs('ω₀ = 0 − 4(0.25) = −1 rad/s', a.w0, -1, 1e-12),
        nearAbs('ω₁ = +1 rad/s', a.w1, 1, 1e-12),
        nearAbs('at 0.1 m/s: v₀ = max(0, 0.1 − 0.25) = 0 (no reversing)', b.v0, 0, 1e-12),
        nearAbs('at 0.1 m/s: v₁ = 0.35 m/s', b.v1, 0.35, 1e-12),
        nearAbs('at ω = 1.5: ω₁ = min(2, 2.5) = 2 rad/s', b.w1, 2, 1e-12),
        nearAbs('at ω = 1.5: ω₀ = 0.5 rad/s', b.w0, 0.5, 1e-12),
        nearAbs('v̇ = 2, Δt = 0.5 from 1 m/s: v₀ = 0', c.v0, 0, 1e-12),
        nearAbs('ω = −1.8, ω̇Δt = 2: ω₀ = −2 (clipped)', c.w0, -2, 1e-12),
        nearAbs('ω = −1.8, ω̇Δt = 2: ω₁ = 0.2', c.w1, 0.2, 1e-12),
        nearAbs('core dynamicWindow: v ∈ [0.5, 0.7]', core.v1 - core.v0, 0.2, 1e-12),
        nearAbs('core dynamicWindow: ω ∈ [0.1, 0.5]', core.w0, 0.1, 1e-12),
      ];
    },
  },
  {
    id: 'plan-dwa-window-instances',
    topic: 'plan',
    title: 'plan-dwa-window tier 1: every answer equals the window computed from the printed givens; tiers 2–3 pick the right sample',
    run: () => {
      const out: CheckResult[] = [];
      let bad = '';
      let clipped = 0;
      for (let s = 1; s <= 60 && !bad; s++) {
        const inst = gen('plan-dwa-window').generate(makeRng(s * 7907 + 1), 1);
        const v = givenValue(inst, 'v');
        const w = givenValue(inst, '\\omega');
        const aV = givenValue(inst, '\\dot v_{max}');
        const aW = givenValue(inst, '\\dot\\omega_{max}');
        const dt = givenValue(inst, '\\Delta t');
        const vMax = givenValue(inst, 'v_{max}');
        const wMax = givenValue(inst, '\\omega_{max}');
        const exp = { v0: Math.max(0, v - aV * dt), v1: Math.min(vMax, v + aV * dt), w0: Math.max(-wMax, w - aW * dt), w1: Math.min(wMax, w + aW * dt) };
        if (v - aV * dt < 0 || v + aV * dt > vMax || w - aW * dt < -wMax || w + aW * dt > wMax) clipped++;
        // The window must look like one: a small rectangle inside the box, never the whole speed range.
        if (aV * dt > 0.35 * vMax + 1e-9 || aW * dt > 0.5 * wMax + 1e-9) bad = `seed ${s}: window half-widths ${aV * dt} m/s, ${aW * dt} rad/s are too big for the box (${vMax}, ${wMax})`;
        if (v < 0 || v > vMax + 1e-9 || Math.abs(w) > wMax + 1e-9) bad = `seed ${s}: the current velocity (${v}, ${w}) is outside the box`;
        for (const k of ['v0', 'v1', 'w0', 'w1'] as const) {
          const p = numPart(inst, k);
          if (!p) bad = `seed ${s}: no part ${k}`;
          else if (Math.abs(p.answer - exp[k]) > 1e-6) bad = `seed ${s}: ${k} = ${p.answer}, expected ${exp[k]} from the givens`;
          else if (!checkNumeric(p, String(Number(exp[k].toFixed(3)))).correct) bad = `seed ${s}: ${k} rounded to 3 d.p. rejected`;
        }
      }
      out.push(isTrue(`tier 1: 60 seeds match the givens, windows small (half-widths ≤ 35 % of v_max, 50 % of ω_max), ${clipped} with a bound clipped by the box`, !bad && clipped >= 15, bad));
      for (const tier of [2, 3] as const) {
        let err = '';
        for (let s = 1; s <= 40 && !err; s++) {
          const inst = gen('plan-dwa-window').generate(makeRng(s * 7907 + tier), tier);
          const Gs = ['A', 'B', 'C'].map((l) => numPart(inst, `G${l}`)?.answer ?? NaN);
          const ch = choicePart(inst);
          if (!ch || Gs.some((g) => !Number.isFinite(g))) {
            err = `seed ${s}: missing parts`;
            break;
          }
          const key = ch.options.findIndex((o) => o.correct);
          const top = Gs.indexOf(Math.max(...Gs));
          const label = (i: number) => `Sample ${'ABC'[i]}`;
          if (tier === 2 && !ch.options[key].text.startsWith(label(top))) err = `seed ${s}: key is not the highest G`;
          if (tier === 3) {
            if (ch.options[key].text.startsWith(label(top))) err = `seed ${s}: tier 3 key is the top score (no admissibility twist)`;
            const stop = numPart(inst, 'stop');
            if (!stop || !(stop.answer > 0)) err = `seed ${s}: no braking-distance part`;
          }
        }
        out.push(isTrue(`tier ${tier}: 40 seeds, the key is ${tier === 2 ? 'the highest G' : 'the best admissible sample, not the top score'}`, !err, err));
      }
      return out;
    },
  },
];
