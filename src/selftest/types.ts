// Self-test contract, shared by the in-app #/selftest page and `npm test` (Node). Pure module.
import type { TopicCode } from '../engine/codes';

export interface CheckResult {
  label: string;
  expected: string;
  actual: string;
  pass: boolean;
  note?: string;
}

export interface SelfTest {
  id: string;
  topic: TopicCode | 'core';
  title: string;
  /** Where the reference value comes from, e.g. "Summary notes B3 table" or "LB4 handout". */
  source?: string;
  run(): CheckResult[];
}
