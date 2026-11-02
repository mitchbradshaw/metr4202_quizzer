// Playwright smoke test: opens Home, the global pages, and EVERY topic and EVERY activity in it (each concept
// card, the flashcards, each simulation, each exam-mode generator at each tier, the MCQs, games and short
// answers). Fails on console errors, uncaught exceptions, error-boundary crashes, empty pages and KaTeX errors.
//
//   node scripts/smoke.mjs            (local: runs this file with the toolchain outside Google Drive)
//   npx playwright test               (CI, where node_modules sits in the repo)
import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const HTML = process.env.M42_HTML || path.resolve(process.cwd(), 'index.html');
const URL = pathToFileURL(HTML).href;
const TOPICS = ['bayes', 'filters', 'models', 'slam', 'plan', 'kin', 'vision', 'rl', 'multi'];

interface Inventory {
  topics: {
    code: string;
    cards: string[];
    explore: string[];
    solve: { id: string; tiers: number[] }[];
    mcqs: number;
    flashcards: number;
    games: string[];
    shortAnswers: number;
  }[];
}

function watch(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

async function open(page: Page) {
  await page.goto(URL);
  await page.waitForFunction(() => !!document.querySelector('#root > *'), null, { timeout: 20000 });
}

/** Visit a hash route and check the page rendered cleanly. */
async function visit(page: Page, errors: string[], hash: string, settleMs = 300) {
  const before = errors.length;
  await page.evaluate((h) => {
    window.location.hash = h;
  }, hash);
  await page.waitForTimeout(settleMs);
  const info = await page.evaluate(() => {
    const main = document.querySelector('main');
    const text = main ? (main as HTMLElement).innerText : '';
    return {
      crashed: text.includes('Something went wrong'),
      notFound: text.includes('Page not found'),
      length: text.trim().length,
      katexErrors: document.querySelectorAll('.katex-error').length,
    };
  });
  const newErrors = errors.slice(before);
  expect.soft(newErrors, `console errors on ${hash}`).toEqual([]);
  expect.soft(info.crashed, `error boundary on ${hash}`).toBe(false);
  expect.soft(info.notFound, `not found: ${hash}`).toBe(false);
  expect.soft(info.length, `empty page: ${hash}`).toBeGreaterThan(40);
  expect.soft(info.katexErrors, `KaTeX errors on ${hash}`).toBe(0);
}

test.describe.configure({ mode: 'parallel' });

test('home, review, sprints, traps, settings and self-test pages open', async ({ page }) => {
  const errors = watch(page);
  await open(page);
  for (const h of ['#/', '#/review', '#/sprint', '#/sprint/quick', '#/sprint/mock', '#/traps', '#/session', '#/settings']) await visit(page, errors, h);
  await visit(page, errors, '#/selftest', 1500);
  // Every self-test passes in the browser too (the page shows "n / m tests passed").
  const counts = await page.evaluate(() => document.querySelector('main')!.innerText.match(/(\d+)\s*\/\s*(\d+)\s*tests passed/));
  expect(counts, 'self-test summary shown').toBeTruthy();
  expect.soft(Number(counts![1]), 'self-tests failing in the browser').toBe(Number(counts![2]));
});

for (const code of TOPICS) {
  test(`topic "${code}": every activity opens`, async ({ page }) => {
    test.setTimeout(6 * 60 * 1000);
    const errors = watch(page);
    await open(page);
    const inv = (await page.evaluate(() => (window as unknown as { __m42: Inventory }).__m42)) as Inventory;
    const t = inv.topics.find((x) => x.code === code)!;
    expect(t, `topic ${code} is registered`).toBeTruthy();
    expect(t.explore.length, `${code} has simulations`).toBeGreaterThan(0);
    // Multi-robot is examined by MCQs and a short comparison, so its exam mode is the short answers.
    if (code === 'multi') expect(t.shortAnswers, `${code} has exam-style short answers`).toBeGreaterThan(0);
    else expect(t.solve.length, `${code} has exam-mode generators`).toBeGreaterThan(0);
    expect(t.mcqs, `${code} has MCQs`).toBeGreaterThan(0);
    expect(t.flashcards, `${code} has flashcards`).toBeGreaterThan(0);

    await visit(page, errors, `#/${code}/learn`);
    for (const c of t.cards) await visit(page, errors, `#/${code}/learn?c=${c}`);
    await visit(page, errors, `#/${code}/learn?v=flash`);
    await visit(page, errors, `#/${code}/explore`);
    for (const e of t.explore) await visit(page, errors, `#/${code}/explore/${e}`, 700);
    await visit(page, errors, `#/${code}/solve`);
    for (const g of t.solve) for (const tier of g.tiers) await visit(page, errors, `#/${code}/solve/${g.id}?t=${tier}&s=${424242 + tier}`, 400);
    await visit(page, errors, `#/${code}/quiz`);
    await visit(page, errors, `#/${code}/quiz?v=games`);
    if (t.shortAnswers) await visit(page, errors, `#/${code}/quiz?v=short`);
  });
}
