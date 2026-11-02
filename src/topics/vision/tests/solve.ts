// Self-tests for the vision generators: every generator × tier × 40 seeds is well formed (answers finite and accepted
// by their own checkers, traps rejected, exactly four hints, TeX parses, choice options all have a why), plus
// cross-checks of the projection generator against the core pipeline.
import katex from 'katex';
import type { SelfTest, CheckResult } from '../../../selftest/types';
import type { SolveGenerator, SolveInstance } from '../../../engine/types';
import { isTrue, nearAbs } from '../../../selftest/assert';
import { makeRng } from '../../../engine/rng';
import { checkChoice, checkNumeric } from '../../../engine/check';
import { projectPoint } from '../../../core/camera';
import { mv } from '../../../core/vision';
import { generators } from '../solve';
import { _internal } from '../solve/project';

function texIn(s: string): string[] {
  const src = s.replace(/\\\$/g, '\u0000');
  const out: string[] = [];
  const re = /\$\$([\s\S]+?)\$\$|\$([^$]+?)\$/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) out.push((m[1] ?? m[2]).replace(/\u0000/g, '\\$'));
  return out;
}

function texError(src: string): string {
  try {
    katex.renderToString(src, { throwOnError: true, strict: 'ignore', output: 'html' });
    return '';
  } catch (e) {
    return `${(e as Error).message.slice(0, 100)} in "${src.slice(0, 70)}"`;
  }
}

function problems(inst: SolveInstance): string[] {
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
      else if (!checkNumeric(p, p.answer.toPrecision(4)).correct) bad.push(`${p.id}: 4-sig-fig answer ${p.answer.toPrecision(4)} rejected`);
      for (const t of p.traps ?? []) {
        texts.push(t.message);
        if (checkNumeric(p, String(t.value)).correct) bad.push(`${p.id}: trap ${t.value} accepted`);
      }
    } else if (p.kind === 'choice') {
      const keys = p.options.map((o, i) => (o.correct ? i : -1)).filter((i) => i >= 0);
      if (p.options.length < 2) bad.push(`${p.id}: < 2 options`);
      if (!p.multi && keys.length !== 1) bad.push(`${p.id}: ${keys.length} correct options`);
      if (!checkChoice(p, keys).correct) bad.push(`${p.id}: own key rejected`);
      if (new Set(p.options.map((o) => o.text)).size !== p.options.length) bad.push(`${p.id}: duplicate option`);
      for (const o of p.options) {
        texts.push(o.text);
        if (!o.why || !o.why.trim()) bad.push(`${p.id}: option without a why`);
        else texts.push(o.why);
      }
    }
  }
  for (const g of inst.givens ?? []) {
    const e = texError(g.sym);
    if (e) bad.push(`given ${g.sym}: ${e}`);
    texts.push(g.value, g.label ?? '');
  }
  for (const t of texts) {
    if (/NaN|undefined|Infinity|\[object/.test(t)) bad.push(`bad text: "${t.slice(0, 70)}"`);
    if ((t.replace(/\\\$/g, '').match(/\$/g) ?? []).length % 2) bad.push(`unbalanced $ in "${t.slice(0, 60)}"`);
    for (const x of texIn(t)) {
      const e = texError(x);
      if (e) bad.push(e);
    }
  }
  if (inst.figure && typeof inst.figure !== 'function') bad.push('figure is not a component');
  return bad;
}

function sanity(gen: SolveGenerator, seeds = 40): CheckResult[] {
  return gen.tiers.map((tier) => {
    let bad = '';
    let parts = 0;
    for (let s = 1; s <= seeds && !bad; s++) {
      const seed = s * 7919 + tier;
      try {
        const inst = gen.generate(makeRng(seed), tier);
        parts += inst.parts.length;
        const pr = problems(inst);
        if (pr.length) bad = `seed ${seed}: ${pr.slice(0, 3).join('; ')}`;
      } catch (e) {
        bad = `seed ${seed} threw ${(e as Error).message}`;
      }
    }
    return isTrue(`${gen.id} tier ${tier}: ${seeds} seeds well formed (${parts} parts)`, !bad, bad);
  });
}

export const tests: SelfTest[] = [
  {
    id: 'vision-generators',
    topic: 'vision',
    title: 'Vision generators: every tier × 40 seeds well formed (answers pass their own checks, traps rejected, 4 hints, TeX parses)',
    run: () => generators.flatMap((g) => sanity(g, 40)),
  },
  {
    id: 'vision-generator-ids',
    topic: 'vision',
    title: 'Generator ids and cards: vision-pinhole is fixed (Home and the mock paper link to it); the others are prefixed',
    run: () => [
      isTrue('vision-pinhole exists with tiers 1-3 and 3 marks', generators.some((g) => g.id === 'vision-pinhole' && g.tiers.join() === '1,2,3' && g.marks === 3)),
      isTrue('every id starts with vision-', generators.every((g) => g.id.startsWith('vision-'))),
      isTrue('every generator names a concept card', generators.every((g) => !!g.cardId)),
    ],
  },
  {
    id: 'vision-project-crosscheck',
    topic: 'vision',
    title: 'vision-project: the generator’s world → camera → pixel arithmetic matches core/camera projectPoint (60 seeds)',
    source: 'Summary notes §7 image formation',
    run: () => {
      const out: CheckResult[] = [];
      let worst = 0;
      let worstPx = 0;
      for (let s = 1; s <= 60; s++) {
        const { c, view, t, Xc, Xw } = _internal.worldSetup(makeRng(s * 31 + 5));
        const p = projectPoint(c.K, view.R, t, Xw);
        const Xc2 = mv(view.R, Xw).map((x, i) => x + t[i]);
        worst = Math.max(worst, ...Xc2.map((x, i) => Math.abs(x - Xc[i])));
        worstPx = Math.max(worstPx, Math.abs(p.u - (c.ax * (Xc[0] / Xc[2]) + c.u0)), Math.abs(p.v - (c.ay * (Xc[1] / Xc[2]) + c.v0)));
        if (!(Xc[2] > 0) || p.u < 0 || p.u > c.img.w || p.v < 0 || p.v > c.img.h) out.push(isTrue(`seed ${s}: point in front and inside the image`, false, `Z_c ${Xc[2]}, (u, v) = (${p.u}, ${p.v})`));
      }
      out.push(nearAbs('X_c = R X_w + t (worst component error, m)', worst, 0, 2e-3), nearAbs('(u, v) from K (worst error, px)', worstPx, 0, 1e-6));
      return out;
    },
  },
];
