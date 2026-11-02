// Exam-mode generators for 'slam', one file per template.
import type { SolveGenerator } from '../../engine/types';
import { generators as occupancy } from './solve/occupancy';
import { generators as which } from './solve/which';

export const generators: SolveGenerator[] = [...occupancy, ...which];
