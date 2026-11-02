// Locates esbuild/typescript/playwright. Normally they live in ./node_modules (after `npm install`).
// This repo usually sits on Google Drive, which copes badly with thousands of small files, so the
// dependencies can live elsewhere. Searched in order:
//   1. $M42_TOOLCHAIN                      (a folder whose node_modules has the deps)
//   2. the path written in ./.toolchain-path (one line; git-ignored)
//   3. ~/source/m4202-toolchain
//   4. this folder
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

export function toolchain() {
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const fromFile = (() => {
    try {
      return fs.readFileSync(path.join(ROOT, '.toolchain-path'), 'utf8').trim();
    } catch {
      return '';
    }
  })();
  const candidates = [process.env.M42_TOOLCHAIN, fromFile, path.join(os.homedir(), 'source', 'm4202-toolchain'), ROOT].filter(Boolean);
  for (const dir of candidates) {
    const nm = path.join(dir, 'node_modules');
    if (fs.existsSync(path.join(nm, 'esbuild'))) {
      const req = createRequire(path.join(dir, 'package.json'));
      return { ROOT, TOOL: dir, req, esbuild: req('esbuild'), nodePaths: [nm] };
    }
  }
  throw new Error(
    'esbuild not found. Run `npm install` in the project folder, ' +
      'or set M42_TOOLCHAIN to a folder whose node_modules has the dependencies.'
  );
}
