// Kinematics exam-mode generators, one file per area (owned separately so they can be built in parallel).
import type { SolveGenerator } from '../../engine/types';
import { generators as m } from './solve/m';
import { generators as screws } from './solve/screws';
import { generators as armcamera } from './solve/armcamera';
import { generators as poe } from './solve/poe';
import { generators as ik } from './solve/ik';

export const generators: SolveGenerator[] = [...m, ...screws, ...armcamera, ...poe, ...ik];
