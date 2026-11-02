// Exam-mode generators for 'rl', one file per template.
import type { SolveGenerator } from '../../engine/types';
import { generators as returns } from './solve/returns';
import { generators as qlearn } from './solve/qlearn';
import { generators as vi } from './solve/vi';

export const generators: SolveGenerator[] = [...returns, ...qlearn, ...vi];
