// Type-checks src/ with tsc, wherever the toolchain's node_modules lives.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { toolchain } from './toolchain.mjs';

const { ROOT, TOOL, req } = toolchain();
const tsc = req.resolve('typescript/lib/tsc.js');
const nm = path.join(TOOL, 'node_modules');
const cfg = path.join(os.tmpdir(), `m42-tsconfig-${process.pid}.json`);
fs.writeFileSync(
  cfg,
  JSON.stringify({
    extends: path.join(ROOT, 'tsconfig.json'),
    compilerOptions: {
      baseUrl: ROOT,
      typeRoots: [path.join(nm, '@types')],
      // @types first: otherwise tsc resolves e.g. react/index.js (untyped) and stops there.
      paths: { '*': [path.join(nm, '@types', '*'), path.join(nm, '*')] },
    },
    include: [path.join(ROOT, 'src')],
  })
);
const r = spawnSync(process.execPath, [tsc, '-p', cfg, '--pretty', 'false'], { stdio: 'inherit' });
fs.rmSync(cfg, { force: true });
if (r.status === 0) console.log('[typecheck] ok');
process.exitCode = r.status ?? 1;
