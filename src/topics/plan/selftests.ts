// Self-tests for planning (run by `npm test` and at #/selftest), one file per area.
import type { SelfTest } from '../../selftest/types';
import { tests as astar } from './tests/astar';
import { tests as rrtstar } from './tests/rrtstar';
import { tests as cspace } from './tests/cspace';
import { tests as steer } from './tests/steer';
import { tests as search } from './tests/search';
import { tests as local } from './tests/local';
import { tests as sims } from './tests/sims';

export const tests: SelfTest[] = [...astar, ...rrtstar, ...cspace, ...steer, ...search, ...local, ...sims];
