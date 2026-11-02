// Generator sanity for the rl exam-mode templates: every generator, every tier, 40 seeds.
import type { SelfTest } from '../../../selftest/types';
import { generators } from '../solve';
import { generatorSanity } from './sanity';

export const tests: SelfTest[] = [
  {
    id: 'rl-generators',
    topic: 'rl',
    title: 'rl generators: every tier × 40 seeds well formed (finite answers, 4 hints, own answers accepted, traps rejected, TeX parses)',
    run: () => generators.flatMap((g) => generatorSanity(g, 40)),
  },
  {
    id: 'rl-generator-ids',
    topic: 'rl',
    title: 'rl generators: ids, tiers and concept cards as agreed with the content files',
    run: () => {
      const want: Record<string, { tiers: number[]; card: string }> = {
        'rl-return': { tiers: [1, 2, 3], card: 'rl-returns' },
        'rl-qupdate': { tiers: [1, 2, 3], card: 'rl-qlearning' },
        'rl-vi': { tiers: [1, 2], card: 'rl-values' },
        'rl-policy': { tiers: [1, 2], card: 'rl-values' },
      };
      return Object.entries(want).map(([id, w]) => {
        const g = generators.find((x) => x.id === id);
        const ok = !!g && g.tiers.join() === w.tiers.join() && g.cardId === w.card;
        return { label: `${id}: tiers ${w.tiers.join(', ')}, card ${w.card}`, expected: 'present', actual: g ? `tiers ${g.tiers.join(', ')}, card ${g.cardId}` : 'missing', pass: ok };
      });
    },
  },
];
