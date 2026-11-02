// Self-tests for kinematics (run by `npm test` and at #/selftest), one file per area.
import type { SelfTest } from '../../selftest/types';
import { tests as threed } from './tests/threed';
import { tests as solve } from './tests/solve';
import { tests as ik } from './tests/ik';

export const tests: SelfTest[] = [...threed, ...solve, ...ik];
