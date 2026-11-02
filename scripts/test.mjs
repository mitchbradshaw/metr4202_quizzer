// Runs the physics self-tests (the same list as the in-app #/selftest page) under Node.
//   node scripts/test.mjs            all tests
//   node scripts/test.mjs B3         only tests whose topic or id starts with "B3"
//   M42_ONLY=B3 node scripts/test.mjs B3   also stub out other topics (when they are mid-edit)
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { toolchain } from './toolchain.mjs';
import { onlyPlugin } from './only-plugin.mjs';

const { ROOT, esbuild, nodePaths } = toolchain();
const outfile = path.join(os.tmpdir(), `m42-selftest-${process.pid}.mjs`);
await esbuild.build({
  entryPoints: [path.join(ROOT, 'src', 'selftest', 'node-entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  outfile,
  nodePaths,
  jsx: 'automatic',
  loader: { '.css': 'empty' },
  plugins: [onlyPlugin(ROOT)],
  logLevel: 'warning',
});
const rest = process.argv.slice(2);
if (rest.includes('--verbose')) process.env.M42_VERBOSE = '1';
process.env.M42_TEST_FILTER = rest.find((a) => !a.startsWith('--')) || '';
await import(pathToFileURL(outfile).href);
