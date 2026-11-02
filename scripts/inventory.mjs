// Prints a Markdown inventory of every topic (cards, sims, generators, quiz counts) from the real content.
//   node scripts/inventory.mjs            Markdown table + per-topic lists
//   node scripts/inventory.mjs --json     machine-readable
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { toolchain } from './toolchain.mjs';
import { onlyPlugin } from './only-plugin.mjs';

const { ROOT, esbuild, nodePaths } = toolchain();
const entry = path.join(os.tmpdir(), `m42-inventory-entry-${process.pid}.ts`);
const outfile = path.join(os.tmpdir(), `m42-inventory-${process.pid}.mjs`);
const fs = await import('node:fs');
fs.writeFileSync(
  entry,
  `import { TOPICS } from ${JSON.stringify(path.join(ROOT, 'src', 'topics', 'index.ts').replace(/\\/g, '/'))};
export const inventory = TOPICS.map((t) => ({
  code: t.code, title: t.title, lectures: t.lectures,
  cards: t.cards.map((c) => c.title), flashcards: t.flashcards.length, mcqs: t.mcqs.length,
  games: (t.games || []).map((g) => g.title), shortAnswers: (t.shortAnswers || []).length,
  solve: t.solve.map((g) => ({ title: g.title, tiers: g.tiers, source: g.source })),
  explore: t.explore.map((e) => ({ title: e.title, challenge: e.challenge ? e.challenge.title : null })),
}));`
);
await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile,
  nodePaths,
  jsx: 'automatic',
  loader: { '.css': 'empty' },
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [onlyPlugin(ROOT)],
  logLevel: 'error',
});
// The bundle touches `window`/`document` only inside components and the store's listeners.
globalThis.window = globalThis.window || { addEventListener() {}, location: { hash: '' } };
globalThis.document = globalThis.document || { compatMode: 'CSS1Compat', addEventListener() {}, visibilityState: 'visible', documentElement: { setAttribute() {}, removeAttribute() {} } };
globalThis.localStorage = globalThis.localStorage || { getItem: () => null, setItem() {} };
const { inventory } = await import(pathToFileURL(outfile).href);
fs.rmSync(entry, { force: true });

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(inventory, null, 1));
} else {
  const tot = (k) => inventory.reduce((s, t) => s + (Array.isArray(t[k]) ? t[k].length : t[k]), 0);
  console.log('| Topic | Concept cards | Flashcards | Simulations | Problem types | MCQs | Games | Short answers |');
  console.log('|---|---|---|---|---|---|---|---|');
  for (const t of inventory)
    console.log(`| ${t.code} ${t.title} | ${t.cards.length} | ${t.flashcards} | ${t.explore.length} | ${t.solve.length} | ${t.mcqs} | ${t.games.length} | ${t.shortAnswers} |`);
  console.log(`| **Total** | ${tot('cards')} | ${tot('flashcards')} | ${tot('explore')} | ${tot('solve')} | ${tot('mcqs')} | ${tot('games')} | ${tot('shortAnswers')} |`);
  console.log('');
  for (const t of inventory) {
    console.log(`### ${t.code} ${t.title} (${t.lectures})`);
    if (t.explore.length) console.log(`- **Explore:** ${t.explore.map((e) => e.title + (e.challenge ? ` (challenge: ${e.challenge})` : '')).join('; ')}`);
    if (t.solve.length) console.log(`- **Solve:** ${t.solve.map((g) => g.title).join('; ')}`);
    if (t.cards.length) console.log(`- **Learn:** ${t.cards.join('; ')}`);
    console.log('');
  }
}
