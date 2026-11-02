// Self-tests for 'filters' (run by `npm test` and at #/selftest), one file per area.
import type { SelfTest } from '../../selftest/types';
import { tests as core } from './tests/core';
import { tests as gens } from './tests/generators';

export const tests: SelfTest[] = [...core, ...gens];
