// Generator sanity checks for the models topic (same contract as the planning topic's): every tier × N seeds
// generates, every numeric answer is finite and passes its own checker, traps are rejected, choice parts have
// exactly one key and a why for every option, there are exactly 4 non-empty hints, and every TeX fragment parses.
import katex from 'katex';
import type { CheckResult } from '../../../selftest/types';
import type { SolveGenerator, SolveInstance } from '../../../engine/types';
import { isTrue } from '../../../selftest/assert';
import { makeRng } from '../../../engine/rng';
import { checkChoice, checkMatrix, checkNumeric } from '../../../engine/check';

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
    katex.renderToString(src, { displayMode: false, throwOnError: true, strict: 'ignore', output: 'html' });
    return '';
  } catch (e) {
    return `${(e as Error).message.slice(0, 120)} in "${src.slice(0, 80)}"`;
  }
}

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
    }
  }
  for (const gv of inst.givens ?? []) {
    const e = texError(gv.sym);
    if (e) bad.push(`given ${gv.sym}: ${e}`);
    texts.push(gv.value, gv.label ?? '');
  }
  for (const t of texts) {
    if (/NaN|undefined|Infinity|\[object/.test(t)) bad.push(`bad text: "${t.slice(0, 70)}"`);
    const src = t.replace(/\\\$/g, '');
    if ((src.match(/\$/g) ?? []).length % 2) bad.push(`unbalanced $ in "${t.slice(0, 60)}"`);
    for (const tex of texIn(t)) {
      const e = texError(tex);
      if (e) bad.push(e);
    }
  }
  if (inst.figure && typeof inst.figure !== 'function') bad.push('figure is not a component');
  return bad;
}

/** Every tier × `seeds` seeds: generates, finite answers, 4 hints, own answers accepted, traps rejected, TeX parses. */
export function generatorSanity(gen: SolveGenerator, seeds = 40): CheckResult[] {
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
        const again = gen.generate(makeRng(seed), tier);
        if (again.prompt !== inst.prompt) bad = `seed ${seed}: not reproducible`;
      } catch (e) {
        bad = `seed ${seed} threw ${(e as Error).message}`;
      }
    }
    return isTrue(`${gen.id} tier ${tier}: ${seeds} seeds well formed (${parts} parts)`, !bad, bad);
  });
}
