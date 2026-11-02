// Self-tests for 'models' (run by `npm test` and at #/selftest), one file per area.
import type { SelfTest } from '../../selftest/types';
import { tests as core } from './tests/core';
import { tests as field } from './tests/field';
import { tests as solve } from './tests/solve';

export const tests: SelfTest[] = [...core, ...field, ...solve];
