// Visits every route of the given topics in a headless browser and reports console errors,
// error-boundary crashes, empty pages, horizontal overflow and frame times of simulations.
//   node scripts/crawl.mjs                  all topics + global pages
//   node scripts/crawl.mjs A2 A3            just these topics
//   flags: --file <html> (default ./index.html)  --width 1280  --shots <dir> (PNG per route)
import fs from 'node:fs';
import path from 'node:path';
import { fileUrl, frameStats, goHash, launch, openPage, parseArgs } from './browser.mjs';

const { flags, pos } = parseArgs(process.argv.slice(2));
const width = Number(flags.width || 1280);
const { browser, ROOT } = await launch();
const { page, errors } = await openPage(browser, fileUrl(ROOT, flags.file), { width, height: 900 });
const inv = await page.evaluate(() => window.__m42);
const wanted = pos.map((s) => s.toUpperCase());
const topics = inv.topics.filter((t) => !wanted.length || wanted.includes(t.code));
if (flags.shots) fs.mkdirSync(flags.shots, { recursive: true });

const routes = [];
if (!wanted.length) routes.push('#/', '#/review', '#/sprint', '#/sprint/quick', '#/sprint/mock', '#/traps', '#/session', '#/settings', '#/selftest');
for (const t of topics) {
  routes.push(`#/${t.code}/learn`);
  for (const c of t.cards) routes.push(`#/${t.code}/learn?c=${c}`);
  routes.push(`#/${t.code}/learn?v=flash`, `#/${t.code}/explore`);
  for (const e of t.explore) routes.push(`#/${t.code}/explore/${e}`);
  routes.push(`#/${t.code}/solve`);
  for (const g of t.solve) for (const tier of g.tiers) routes.push(`#/${t.code}/solve/${g.id}?t=${tier}&s=${123456 + tier}`);
  routes.push(`#/${t.code}/quiz`, `#/${t.code}/quiz?v=games`);
  if (t.shortAnswers) routes.push(`#/${t.code}/quiz?v=short`);
}

const problems = [];
const perf = [];
let n = 0;
for (const r of routes) {
  const before = errors.length;
  await goHash(page, r, r.includes('/explore/') ? 600 : 300);
  const info = await page.evaluate(() => {
    const main = document.querySelector('main');
    const text = main ? main.innerText : '';
    return {
      crashed: text.includes('Something went wrong'),
      empty: text.trim().length < 40,
      overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      katexErrors: document.querySelectorAll('.katex-error').length,
    };
  });
  const errs = errors.slice(before);
  if (errs.length || info.crashed || info.empty || info.overflow || info.katexErrors)
    problems.push({ route: r, errors: errs, ...info });
  if (r.includes('/explore/')) perf.push({ route: r, ...(await frameStats(page, 60)) });
  if (flags.shots) {
    const name = r.replace(/[#/?=&]+/g, '_').replace(/^_+|_+$/g, '') || 'home';
    await page.screenshot({ path: path.join(flags.shots, `${name}.png`), fullPage: true });
  }
  n++;
}

console.log(`Visited ${n} routes at ${width}px for ${topics.map((t) => t.code).join(', ') || 'none'}.`);
for (const t of topics)
  console.log(`  ${t.code}: ${t.cards.length} cards, ${t.flashcards} flashcards, ${t.explore.length} sims, ${t.solve.length} generators, ${t.mcqs} MCQs, ${t.games.length} games, ${t.shortAnswers} short answers`);
if (perf.length) {
  console.log('Simulation frame times (headless; mean / p95 / max ms):');
  for (const p of perf) console.log(`  ${p.route}: ${p.meanMs.toFixed(1)} / ${p.p95Ms.toFixed(1)} / ${p.maxMs.toFixed(1)}`);
}
if (!problems.length) console.log('No problems found.');
else {
  console.log(`${problems.length} route(s) with problems:`);
  for (const p of problems) {
    const flagsTxt = [p.crashed && 'ERROR BOUNDARY', p.empty && 'empty page', p.overflow && 'horizontal overflow', p.katexErrors && `${p.katexErrors} KaTeX error(s)`].filter(Boolean).join(', ');
    console.log(`  ${p.route}${flagsTxt ? `  [${flagsTxt}]` : ''}`);
    for (const e of p.errors) console.log(`      ${e.slice(0, 300)}`);
  }
  process.exitCode = 1;
}
await browser.close();
