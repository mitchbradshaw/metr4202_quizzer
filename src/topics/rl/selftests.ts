// Self-tests for 'rl' (run by `npm test` and at #/selftest), one file per area.
import type { SelfTest } from '../../selftest/types';
import { tests as core } from './tests/core';
import { tests as generators } from './tests/generators';

export const tests: SelfTest[] = [...core, ...generators];
