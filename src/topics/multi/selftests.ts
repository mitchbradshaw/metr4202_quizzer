// Self-tests for 'multi' (run by `npm test` and at #/selftest).
import type { SelfTest } from '../../selftest/types';
import { tests as core } from './tests/core';

export const tests: SelfTest[] = [...core];
