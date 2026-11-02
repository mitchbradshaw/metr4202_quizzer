// Generator sanity for every slam template: every generator × tier × 40 seeds.
import type { SelfTest } from '../../../selftest/types';
import { generators } from '../solve';
import { generatorSanity } from './sanity';

export const tests: SelfTest[] = [
  {
    id: 'slam-generators',
    topic: 'slam',
    title: 'slam generators: every generator × tier × 40 seeds well formed (answers pass their own checks, traps rejected, 4 hints, TeX parses)',
    source: 'Generators slam-occupancy, slam-logodds, slam-which',
    run: () => generators.flatMap((g) => generatorSanity(g, 40)),
  },
];
