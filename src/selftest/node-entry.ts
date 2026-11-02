// Entry point for `npm test`: runs every self-test under Node and prints a report.
import { ALL_TESTS } from './registry';
import { runAll } from './runner';

declare const process: { env: Record<string, string | undefined>; exitCode?: number };

const outcomes = runAll(ALL_TESTS, process.env.M42_TEST_FILTER || '');
let failed = 0;
let checks = 0;
for (const o of outcomes) {
  const mark = o.pass ? 'PASS' : 'FAIL';
  console.log(`${mark}  [${o.test.topic}] ${o.test.title}  (${o.ms.toFixed(1)} ms)`);
  if (o.error) console.log(`      error: ${o.error}`);
  for (const r of o.results) {
    checks++;
    if (!r.pass) console.log(`      ✗ ${r.label}: expected ${r.expected}, got ${r.actual}${r.note ? `  (${r.note})` : ''}`);
    else if (process.env.M42_VERBOSE) console.log(`      ✓ ${r.label}: expected ${r.expected}, got ${r.actual}`);
  }
  if (!o.pass) failed++;
}
console.log(`\n${outcomes.length - failed}/${outcomes.length} tests passed (${checks} checks).`);
if (failed || outcomes.length === 0) process.exitCode = 1;
