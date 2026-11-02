// Content check: every TeX fragment in every topic renders with KaTeX (throwOnError), including text that only
// appears after interaction (MCQ reasons, model answers, flashcard backs, hints and worked solutions of generated
// problems), and no Rich string has an unmatched "$". The crawler can only see what is on screen; this sees it all.
import katex from 'katex';
import type { SelfTest, CheckResult } from './types';
import type { TopicDef, SolvePart } from '../engine/types';
import { isTrue } from './assert';
import { makeRng } from '../engine/rng';
import { TOPICS } from '../topics';

const MACROS: Record<string, string> = { '\\wn': '\\omega_n', '\\wd': '\\omega_d' };

/** TeX fragments of a Rich string (same tokenising as src/ui/Rich.tsx), plus whether a stray "$" is left over. */
export function texOf(rich: string): { frags: { tex: string; display: boolean }[]; stray: boolean } {
  const src = rich.replace(/\\\$/g, '\u0000');
  const frags: { tex: string; display: boolean }[] = [];
  const rest = src.replace(/\$\$([\s\S]+?)\$\$|\$([^$]+?)\$/g, (_m, d: string | undefined, i: string | undefined) => {
    if (d !== undefined) frags.push({ tex: d.replace(/\u0000/g, '$'), display: true });
    else if (i !== undefined) frags.push({ tex: i.replace(/\u0000/g, '$'), display: false });
    return ' ';
  });
  return { frags, stray: rest.includes('$') };
}

function renderOk(tex: string, display: boolean): string | null {
  try {
    katex.renderToString(tex, { displayMode: display, throwOnError: true, strict: 'ignore', macros: { ...MACROS } });
    return null;
  } catch (e) {
    return e instanceof Error ? e.message.split('\n')[0] : String(e);
  }
}

type Item = [where: string, text: string | undefined, raw?: boolean];

function staticItems(t: TopicDef): Item[] {
  const out: Item[] = [];
  const add = (w: string, s: string | undefined) => out.push([w, s]);
  for (const c of t.cards) {
    add(`card ${c.id} title`, c.title);
    add(`card ${c.id} what`, c.what);
    add(`card ${c.id} when`, c.when);
    c.how.forEach((h, i) => add(`card ${c.id} how ${i + 1}`, h));
    c.traps.forEach((tr, i) => {
      add(`card ${c.id} trap ${i + 1} title`, tr.title);
      add(`card ${c.id} trap ${i + 1}`, tr.detail);
    });
    (c.formulas || []).forEach((f, i) => add(`card ${c.id} formula ${i + 1}`, f));
    add(`card ${c.id} more`, c.more);
  }
  for (const f of t.flashcards) {
    add(`flashcard ${f.id} front`, f.front);
    add(`flashcard ${f.id} back`, f.back);
  }
  for (const q of t.mcqs) {
    add(`mcq ${q.id} stem`, q.stem);
    q.options.forEach((o, i) => {
      add(`mcq ${q.id} option ${i + 1}`, o.text);
      add(`mcq ${q.id} why ${i + 1}`, o.why);
    });
  }
  for (const g of t.games || []) {
    add(`game ${g.id} prompt`, g.prompt);
    if (g.kind === 'sort') {
      g.buckets.forEach((b) => add(`game ${g.id} bucket ${b.id}`, b.label));
      g.items.forEach((it) => {
        add(`game ${g.id} item ${it.id}`, it.text);
        add(`game ${g.id} item ${it.id} why`, it.why);
      });
    } else
      g.pairs.forEach((p) => {
        add(`game ${g.id} pair ${p.id} left`, p.left);
        add(`game ${g.id} pair ${p.id} right`, p.right);
        add(`game ${g.id} pair ${p.id} why`, p.why);
      });
  }
  for (const s of t.shortAnswers || []) {
    add(`short ${s.id} prompt`, s.prompt);
    add(`short ${s.id} model`, s.model);
    s.keyPoints.forEach((k, i) => add(`short ${s.id} key point ${i + 1}`, k));
  }
  for (const e of t.explore) {
    add(`sim ${e.id} title`, e.title);
    add(`sim ${e.id} summary`, e.summary);
    add(`sim ${e.id} notice`, e.notice);
  }
  for (const g of t.solve) {
    add(`generator ${g.id} title`, g.title);
    add(`generator ${g.id} summary`, g.summary);
  }
  for (const tr of t.traps || []) {
    add(`trap ${tr.id} title`, tr.title);
    add(`trap ${tr.id} detail`, tr.detail);
  }
  return out;
}

function partItems(where: string, p: SolvePart): Item[] {
  const out: Item[] = [[`${where} label`, p.label]];
  if (p.kind === 'numeric') (p.traps || []).forEach((tr, i) => out.push([`${where} trap ${i + 1}`, tr.message]));
  if (p.kind === 'choice') p.options.forEach((o, i) => out.push([`${where} option ${i + 1}`, o.text], [`${where} why ${i + 1}`, o.why]));
  if (p.kind === 'order') p.steps.forEach((s, i) => out.push([`${where} step ${i + 1}`, s]));
  if (p.kind === 'matrix') {
    (p.rowLabels || []).forEach((r, i) => out.push([`${where} row label ${i + 1}`, r]));
    (p.colLabels || []).forEach((c, i) => out.push([`${where} column label ${i + 1}`, c]));
    (p.traps || []).forEach((tr, i) => out.push([`${where} trap ${i + 1}`, tr.message]));
    (p.symbolic?.traps || []).forEach((tr, i) => out.push([`${where} symbolic trap ${i + 1}`, tr.message]));
  }
  return out;
}

function generatedItems(t: TopicDef): Item[] {
  const out: Item[] = [];
  for (const g of t.solve)
    for (const tier of g.tiers)
      for (const seed of [11, 424242, 777777]) {
        const where = `${g.id} t${tier} s${seed}`;
        let inst;
        try {
          inst = g.generate(makeRng(seed), tier);
        } catch (e) {
          out.push([`${where} FAILED TO GENERATE: ${e instanceof Error ? e.message : e}`, '$\\error$']);
          continue;
        }
        out.push([`${where} prompt`, inst.prompt]);
        (inst.givens || []).forEach((gv, i) => {
          out.push([`${where} given ${i + 1} symbol`, gv.sym, true]);
          out.push([`${where} given ${i + 1} value`, gv.value]);
          out.push([`${where} given ${i + 1} label`, gv.label]);
        });
        inst.parts.forEach((p) => out.push(...partItems(`${where} part ${p.id}`, p)));
        inst.hints.forEach((h, i) => out.push([`${where} hint ${i + 1}`, h]));
      }
  return out;
}

function check(items: Item[]): { bad: string[]; frags: number } {
  const bad: string[] = [];
  let frags = 0;
  for (const [where, text, raw] of items) {
    if (!text) continue;
    if (raw) {
      frags++;
      const err = renderOk(text, false);
      if (err) bad.push(`${where}: ${err}`);
      continue;
    }
    const { frags: fs, stray } = texOf(text);
    if (stray) bad.push(`${where}: unmatched "$"`);
    for (const f of fs) {
      frags++;
      const err = renderOk(f.tex, f.display);
      if (err) bad.push(`${where}: ${err} in "${f.tex.slice(0, 60)}"`);
    }
  }
  return { bad, frags };
}

export const tests: SelfTest[] = [
  {
    id: 'content-katex-static',
    topic: 'core',
    title: 'Every TeX fragment in cards, flashcards, MCQs (incl. reasons), games, short answers and sim text renders',
    run: () => {
      const out: CheckResult[] = [];
      for (const t of TOPICS) {
        const { bad, frags } = check(staticItems(t));
        out.push(isTrue(`${t.code}: ${frags} TeX fragments render, no stray "$"`, bad.length === 0, bad.slice(0, 3).join(' | ')));
      }
      return out;
    },
  },
  {
    id: 'content-katex-generated',
    topic: 'core',
    title: 'Every TeX fragment in generated problems (prompts, labels, options, hints, worked solutions) renders',
    run: () => {
      const out: CheckResult[] = [];
      for (const t of TOPICS) {
        if (!t.solve.length) continue;
        const { bad, frags } = check(generatedItems(t));
        out.push(isTrue(`${t.code}: ${frags} TeX fragments render across 3 seeds × every tier`, bad.length === 0, bad.slice(0, 3).join(' | ')));
      }
      return out;
    },
  },
];
