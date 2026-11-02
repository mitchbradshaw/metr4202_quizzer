// Exam-mode generators for 'models', one file per template (solve/common.ts registers the topic's traps).
import type { SolveGenerator } from '../../engine/types';
import './solve/common';
import { generators as velocity } from './solve/velocity';
import { generators as odometry } from './solve/odometry';
import { generators as beam } from './solve/beam';
import { generators as choice } from './solve/choice';

export const generators: SolveGenerator[] = [...velocity, ...odometry, ...beam, ...choice];
