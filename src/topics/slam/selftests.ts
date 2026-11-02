// Self-tests for 'slam' (run by `npm test` and at #/selftest), one file per area.
import type { SelfTest } from '../../selftest/types';
import { tests as occupancy } from './tests/occupancy';
import { tests as sims } from './tests/sims';
import { tests as generators } from './tests/generators';
import { tests as review } from './tests/review';

export const tests: SelfTest[] = [...occupancy, ...sims, ...generators, ...review];
