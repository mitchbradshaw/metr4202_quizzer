// Every self-test in the app. Topic folders own their own lists, so they can be edited in parallel.
import type { SelfTest } from './types';
import { coreTests } from './core';
import { tests as groundTruth } from './groundtruth';
import { tests as kinCore } from './kincore';
import { tests as content } from './content';
import { tests as katexContent } from './katex';
import { tests as bayes } from '../topics/bayes/selftests';
import { tests as filters } from '../topics/filters/selftests';
import { tests as models } from '../topics/models/selftests';
import { tests as slam } from '../topics/slam/selftests';
import { tests as plan } from '../topics/plan/selftests';
import { tests as kin } from '../topics/kin/selftests';
import { tests as vision } from '../topics/vision/selftests';
import { tests as rl } from '../topics/rl/selftests';
import { tests as multi } from '../topics/multi/selftests';

export const ALL_TESTS: SelfTest[] = [
  ...groundTruth,
  ...coreTests,
  ...kinCore,
  ...content,
  ...katexContent,
  ...bayes,
  ...filters,
  ...models,
  ...slam,
  ...plan,
  ...kin,
  ...vision,
  ...rl,
  ...multi,
];
