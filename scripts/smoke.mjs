// Runs the Playwright smoke test (tests/smoke.spec.ts) locally. The test runner and the spec must resolve
// '@playwright/test' from the same node_modules, and this repo's node_modules usually lives outside Google
// Drive (see toolchain.mjs), so the spec and config are copied next to the toolchain and run there against
// this repo's index.html.
//   node scripts/smoke.mjs                 every topic and activity at a laptop width (1280 px)
//   node scripts/smoke.mjs -g plan          only tests whose title matches "plan"
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { toolchain } from './toolchain.mjs';

const { ROOT, TOOL } = toolchain();
const html = path.join(ROOT, 'index.html');
if (!fs.existsSync(html)) {
  console.error('index.html not found: run `node scripts/build.mjs` first.');
  process.exit(1);
}
const runDir = path.join(TOOL, '.smoke');
fs.mkdirSync(path.join(runDir, 'tests'), { recursive: true });
fs.copyFileSync(path.join(ROOT, 'tests', 'smoke.spec.ts'), path.join(runDir, 'tests', 'smoke.spec.ts'));
fs.copyFileSync(path.join(ROOT, 'playwright.config.ts'), path.join(runDir, 'playwright.config.ts'));
const cli = path.join(TOOL, 'node_modules', '@playwright', 'test', 'cli.js');
const r = spawnSync(process.execPath, [cli, 'test', '-c', path.join(runDir, 'playwright.config.ts'), ...process.argv.slice(2)], {
  cwd: runDir,
  stdio: 'inherit',
  env: { ...process.env, M42_HTML: html, M42_TEST_DIR: path.join(runDir, 'tests') },
});
process.exitCode = r.status ?? 1;
