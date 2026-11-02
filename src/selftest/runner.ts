import type { CheckResult, SelfTest } from './types';

export interface TestOutcome {
  test: SelfTest;
  results: CheckResult[];
  error?: string;
  ms: number;
  pass: boolean;
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export function runTest(test: SelfTest): TestOutcome {
  const t0 = now();
  try {
    const results = test.run();
    return { test, results, ms: now() - t0, pass: results.length > 0 && results.every((r) => r.pass) };
  } catch (e) {
    return { test, results: [], error: e instanceof Error ? `${e.message}` : String(e), ms: now() - t0, pass: false };
  }
}

export function runAll(tests: SelfTest[], filter = ''): TestOutcome[] {
  const f = filter.trim().toUpperCase();
  return tests
    .filter((t) => !f || t.topic.toUpperCase().startsWith(f) || t.id.toUpperCase().startsWith(f))
    .map(runTest);
}
