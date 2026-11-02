// Headless browser helper (playwright-core driving an installed Edge or Chrome; no browser download).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { toolchain } from './toolchain.mjs';

const CANDIDATES = [
  process.env.M42_BROWSER,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

export async function launch() {
  const { ROOT, req } = toolchain();
  const { chromium } = req('playwright-core');
  const exe = CANDIDATES.find((p) => fs.existsSync(p));
  if (!exe) throw new Error('No Chrome/Edge found. Set M42_BROWSER to a Chromium-based browser executable.');
  // Current Chrome/Edge builds dropped the old headless mode that playwright passes by default,
  // so launch "headed" with the new headless flag instead.
  const browser = await chromium.launch({ executablePath: exe, headless: false, args: ['--headless=new', '--hide-scrollbars', '--mute-audio'] });
  return { browser, ROOT };
}

/** Parse "--file x.html --width 1280 --shots dir" style flags; the rest are positional. */
export function parseArgs(argv) {
  const flags = {};
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const k = argv[i].slice(2);
      const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      flags[k] = v;
    } else pos.push(argv[i]);
  }
  return { flags, pos };
}

/**
 * Accepts "#/A1/explore/msd", "/A1/explore/msd" or "A1/explore/msd". Also repairs routes that Git Bash
 * (MSYS) has rewritten into Windows paths, e.g. "#C:/Program Files/Git/A1/explore/msd".
 */
export function normalizeRoute(r) {
  if (!r) return '#/';
  const mangled = r.match(/^#?[A-Za-z]:[\\/].*?[\\/]Git[\\/](.*)$/);
  if (mangled) return `#/${mangled[1].replace(/\\/g, '/')}`;
  if (r.startsWith('#/')) return r;
  if (r.startsWith('#')) return `#/${r.slice(1)}`;
  if (r.startsWith('/')) return `#${r}`;
  return `#/${r}`;
}

export function fileUrl(ROOT, file) {
  return pathToFileURL(path.resolve(file || path.join(ROOT, 'index.html'))).href;
}

/** Open a page that records console errors and uncaught exceptions. */
export async function openPage(browser, url, { width = 1280, height = 900 } = {}) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto(url);
  await page.waitForFunction(() => !!document.querySelector('#root > *'), null, { timeout: 15000 });
  return { page, errors };
}

/** Navigate within the single-page app by hash and let React settle. */
export async function goHash(page, hash, settleMs = 350) {
  await page.evaluate((h) => {
    window.location.hash = h;
  }, hash);
  await page.waitForTimeout(settleMs);
}

/** Frame intervals (ms) over n animation frames. */
export async function frameStats(page, n = 90) {
  const ts = await page.evaluate(
    (count) =>
      new Promise((res) => {
        const t = [];
        const f = (x) => {
          t.push(x);
          if (t.length < count) requestAnimationFrame(f);
          else res(t);
        };
        requestAnimationFrame(f);
      }),
    n
  );
  const d = [];
  for (let i = 1; i < ts.length; i++) d.push(ts[i] - ts[i - 1]);
  d.sort((a, b) => a - b);
  const mean = d.reduce((s, x) => s + x, 0) / d.length;
  return { meanMs: mean, p95Ms: d[Math.floor(d.length * 0.95)], maxMs: d[d.length - 1], fps: 1000 / mean };
}
