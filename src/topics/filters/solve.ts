// Exam-mode problem generators for 'filters', one file per template.
import type { SolveGenerator } from '../../engine/types';
import { generators as kf } from './solve/kf';
import { generators as pf } from './solve/pf';
import { generators as choice } from './solve/choice';

export const generators: SolveGenerator[] = [...kf, ...pf, ...choice];
