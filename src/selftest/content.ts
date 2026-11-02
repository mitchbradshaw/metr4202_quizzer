// Content lint over every topic's quiz bank: structural integrity, and no "pick the longest option" cue.
import type { SelfTest, CheckResult } from './types';
import type { MCQ } from '../engine/types';
import { isTrue } from './assert';
import { mcqs as bayes } from '../topics/bayes/quiz';
import { mcqs as filters } from '../topics/filters/quiz';
import { mcqs as models } from '../topics/models/quiz';
import { mcqs as slam } from '../topics/slam/quiz';
import { mcqs as plan } from '../topics/plan/quiz';
import { mcqs as kin } from '../topics/kin/quiz';
import { mcqs as vision } from '../topics/vision/quiz';
import { mcqs as rl } from '../topics/rl/quiz';
import { mcqs as multi } from '../topics/multi/quiz';

const BANK: [string, MCQ[]][] = [
  ['bayes', bayes],
  ['filters', filters],
  ['models', models],
  ['slam', slam],
  ['plan', plan],
  ['kin', kin],
  ['vision', vision],
  ['rl', rl],
  ['multi', multi],
];

/** Approximate rendered length: TeX counts at half weight (it renders compactly), markup is dropped. */
export function visibleLength(s: string): number {
  return s
    .replace(/\$\$?([^$]*)\$\$?/g, (_m, t: string) => 'x'.repeat(Math.ceil(t.length * 0.5)))
    .replace(/\*\*|\*|`/g, '').length;
}

/** For "pick the true statement" items: is the key strictly the longest option? */
export function keyIsLongest(q: MCQ): boolean {
  const lens = q.options.map((o) => visibleLength(o.text));
  const k = q.options.findIndex((o) => o.correct);
  return lens.every((l, i) => i === k || lens[k] > l);
}

const KEY_STYLES = new Set<MCQ['style']>(['correct', 'most-correct', 'best']);
export const LENGTH_CUE_LIMIT = 0.4;

export const tests: SelfTest[] = [
  {
    id: 'content-mcq-integrity',
    topic: 'core',
    title: 'MCQs: exactly one key, a reason for every option, unique ids, at least 3 options',
    run: () => {
      const out: CheckResult[] = [];
      const ids = new Map<string, string>();
      for (const [code, qs] of BANK) {
        const bad: string[] = [];
        for (const q of qs) {
          const keys = q.options.filter((o) => o.correct).length;
          if (keys !== 1) bad.push(`${q.id}: ${keys} keys`);
          if (q.options.length < 3) bad.push(`${q.id}: ${q.options.length} options`);
          if (q.options.some((o) => !o.why || !o.why.trim())) bad.push(`${q.id}: option without a reason`);
          if (!q.source || !q.source.trim()) bad.push(`${q.id}: no source`);
          if (ids.has(q.id)) bad.push(`${q.id}: duplicate id (also in ${ids.get(q.id)})`);
          ids.set(q.id, code);
        }
        out.push(isTrue(`${code}: ${qs.length} MCQs well formed`, bad.length === 0, bad.slice(0, 4).join('; ')));
      }
      return out;
    },
  },
  {
    id: 'content-mcq-length-cue',
    topic: 'core',
    title: `MCQs: option length gives no cue (key is the longest option in ≤ ${LENGTH_CUE_LIMIT * 100} % of "pick the true one" items)`,
    source: 'Review round 1 (engineer): keys were the longest option in 67 % of items',
    run: () => {
      const out: CheckResult[] = [];
      let all = 0;
      let longest = 0;
      for (const [code, qs] of BANK) {
        const items = qs.filter((q) => KEY_STYLES.has(q.style));
        const hits = items.filter(keyIsLongest);
        all += items.length;
        longest += hits.length;
        if (items.length < 4) continue;
        const frac = hits.length / items.length;
        out.push(isTrue(`${code}: key longest in ${hits.length}/${items.length} (${Math.round(frac * 100)} %)`, frac <= LENGTH_CUE_LIMIT, hits.map((q) => q.id).slice(0, 8).join(', ')));
      }
      out.push(isTrue(`all topics: key longest in ${longest}/${all} (${Math.round((100 * longest) / Math.max(1, all))} %)`, longest / Math.max(1, all) <= 0.35));
      return out;
    },
  },
];
