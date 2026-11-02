// Planning exam-mode generators, one file per template (owned separately so they can be built in parallel).
import type { SolveGenerator } from '../../engine/types';
import { generators as astar } from './solve/astar';
import { generators as rrtstar } from './solve/rrtstar';
import { generators as cspace } from './solve/cspace';
import { generators as steer } from './solve/steer';
import { generators as search } from './solve/search';
import { generators as local } from './solve/local';

export const generators: SolveGenerator[] = [...astar, ...rrtstar, ...cspace, ...steer, ...search, ...local];
