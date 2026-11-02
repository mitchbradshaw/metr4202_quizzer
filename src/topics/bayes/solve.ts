// Exam-mode generators for 'bayes', one file per template:
//   bayes-grid             2024 Q28 grid-world localisation (predict, P(z), posteriors, most likely tile)
//   bayes-classifier       2025 Q28 classifier sequence + gripper choice by expected success
//   bayes-rules            product rule, marginalisation, Bayes from a joint table, (conditional) independence
//   bayes-predict-correct  one predict and one correct step on a short corridor with doors
import type { SolveGenerator } from '../../engine/types';
import { generators as grid } from './solve/grid';
import { generators as classifier } from './solve/classifier';
import { generators as rules } from './solve/rules';
import { generators as corridor } from './solve/corridor';

export const generators: SolveGenerator[] = [...grid, ...classifier, ...rules, ...corridor];
