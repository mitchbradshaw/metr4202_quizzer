// Generator sanity checks for the filters self-tests (same checks as the bayes topic uses): every tier x N seeds
// generates, answers are finite, exactly 4 hints, every part's own answer passes its own checker, traps are
// rejected, TeX parses, and every one-column table listed as a belief sums to 1.
import katex from 'katex';
import type { CheckResult } from '../../../selftest/types';
import type { SolveGenerator, SolveInstance } from '../../../engine/types';
import { isTrue } from '../../../selftest/assert';
import { makeRng } from '../../../engine/rng';
import { checkChoice, checkMatrix, checkNumeric } from '../../../engine/check';

/** Every TeX fragment ($…$, $$…$$) in a Rich string. */
export function texIn(s: string): { tex: string; display: boolean }[] {
  const src = s.replace(/\\\$/g, '\u0000');
  const out: { tex: string; display: boolean }[] = [];
  const re = /\$\$([\s\S]+?)\$\$|\$([^$]+?)\$/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) out.push({ tex: (m[1] ?? m[2]).replace(/\u0000/g, '\\$'), display: m[1] !== undefined });
  return out;
}

export function texError(src: string, display: boolean): string {
  try {
    katex.renderToString(src, { displayMode: display, throwOnError: true, strict: 'ignore', output: 'html' });
    return '';
  } catch (e) {
    return `${(e as Error).message.slice(0, 120)} in "${src.slice(0, 80)}"`;
  }
}

/** TeX problems in a list of Rich strings. */
export function richProblems(texts: string[]): string[] {
  const bad: string[] = [];
  for (const t of texts) {
    if (/NaN|undefined|Infinity|\[object/.test(t)) bad.push(`bad text: "${t.slice(0, 70)}"`);
    const src = t.replace(/\\\$/g, '');
    if ((src.match(/\$/g) ?? []).length % 2) bad.push(`unbalanced $ in "${t.slice(0, 60)}"`);
    for (const { tex, display } of texIn(t)) {
      const e = texError(tex, display);
      if (e) bad.push(e);
    }
  }
  return bad;
}

/**
 * Problems with one generated instance (empty when it is well formed). `beliefIds` lists matrix part ids whose
 * single column is a whole belief (must sum to 1).
 */
export function instanceProblems(inst: SolveInstance, beliefIds: readonly string[] = []): string[] {
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
      else {
        if (!checkNumeric(p, String(p.answer)).correct) bad.push(`${p.id}: own answer rejected`);
        if (!checkNumeric(p, p.answer.toFixed(4)).correct) bad.push(`${p.id}: 4-d.p. answer rejected`);
      }
      for (const t of p.traps ?? []) {
        texts.push(t.message);
        if (checkNumeric(p, String(t.value)).correct) bad.push(`${p.id}: trap ${t.value} accepted as correct`);
      }
    } else if (p.kind === 'choice') {
      const keys = p.options.map((o, i) => (o.correct ? i : -1)).filter((i) => i >= 0);
      if (p.options.length < 2) bad.push(`${p.id}: < 2 options`);
      if (!p.multi && keys.length !== 1) bad.push(`${p.id}: ${keys.length} correct options`);
      if (!checkChoice(p, keys).correct) bad.push(`${p.id}: own key rejected`);
      const wrong = p.options.findIndex((o) => !o.correct);
      if (!p.multi && wrong >= 0 && checkChoice(p, [wrong]).correct) bad.push(`${p.id}: a wrong option accepted`);
      if (new Set(p.options.map((o) => o.text)).size !== p.options.length) bad.push(`${p.id}: duplicate option text`);
      for (const o of p.options) {
        texts.push(o.text);
        if (!o.why || !o.why.trim()) bad.push(`${p.id}: option without a why`);
        else texts.push(o.why);
      }
    } else if (p.kind === 'matrix') {
      if (p.answer.some((row) => row.some((x) => !Number.isFinite(x)))) bad.push(`${p.id}: matrix not finite`);
      else {
        if (!checkMatrix(p, p.answer.map((row) => row.map(String))).correct) bad.push(`${p.id}: own matrix rejected`);
        if (!checkMatrix(p, p.answer.map((row) => row.map((x) => x.toFixed(4)))).correct) bad.push(`${p.id}: 4-d.p. matrix rejected`);
        for (const t of p.traps ?? []) if (checkMatrix(p, t.value.map((row) => row.map(String))).correct) bad.push(`${p.id}: a trap matrix is accepted`);
        if (beliefIds.includes(p.id)) {
          const s = p.answer.reduce((a, row) => a + row[0], 0);
          if (Math.abs(s - 1) > 1e-9) bad.push(`${p.id}: belief sums to ${s}`);
        }
      }
      if (p.rowLabels && p.rowLabels.length !== p.answer.length) bad.push(`${p.id}: ${p.rowLabels.length} row labels for ${p.answer.length} rows`);
      // Labels are Rich text: a TeX command outside $ … $ would show as raw text (e.g. "\text{C3}").
      for (const l of [...(p.rowLabels ?? []), ...(p.colLabels ?? [])]) if (/\\[a-zA-Z]/.test(l.replace(/\$[^$]*\$/g, ''))) bad.push(`${p.id}: label "${l}" has TeX outside $ … $`);
      texts.push(...(p.rowLabels ?? []), ...(p.colLabels ?? []));
      for (const t of p.traps ?? []) texts.push(t.message);
    }
  }
  for (const g of inst.givens ?? []) {
    const e = texError(g.sym, false);
    if (e) bad.push(`given ${g.sym}: ${e}`);
    texts.push(g.value, g.label ?? '');
  }
  bad.push(...richProblems(texts));
  if (inst.figure && typeof inst.figure !== 'function') bad.push('figure is not a component');
  return bad;
}

/** Every tier x `seeds` seeds: well formed, deterministic for a seed. */
export function generatorSanity(gen: SolveGenerator, seeds = 40, beliefIds: readonly string[] = []): CheckResult[] {
  return gen.tiers.map((tier) => {
    let bad = '';
    let parts = 0;
    for (let s = 1; s <= seeds && !bad; s++) {
      const seed = s * 7919 + tier;
      try {
        const inst = gen.generate(makeRng(seed), tier);
        parts += inst.parts.length;
        const probs = instanceProblems(inst, beliefIds);
        if (probs.length) bad = `seed ${seed}: ${probs.slice(0, 3).join('; ')}`;
        else if (gen.generate(makeRng(seed), tier).prompt !== inst.prompt) bad = `seed ${seed}: not deterministic`;
      } catch (e) {
        bad = `seed ${seed} threw ${(e as Error).message}`;
      }
    }
    return isTrue(`${gen.id} tier ${tier}: ${seeds} seeds well formed (${parts} parts)`, !bad, bad);
  });
}
