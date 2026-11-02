// Playwright config for the smoke test (tests/smoke.spec.ts). Locally it drives an installed Chrome or Edge
// (no browser download); in CI it uses Playwright's own Chromium (`npx playwright install chromium`).
import { defineConfig } from '@playwright/test';
import fs from 'node:fs';

const CANDIDATES = [
  process.env.M42_BROWSER,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean) as string[];
const exe = process.env.CI ? undefined : CANDIDATES.find((p) => fs.existsSync(p));

export default defineConfig({
  testDir: process.env.M42_TEST_DIR || 'tests',
  testMatch: /smoke\.spec\.ts$/,
  timeout: 6 * 60 * 1000,
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  reporter: [['list']],
  use: {
    viewport: { width: 1280, height: 900 },
    // Current Chrome/Edge builds dropped the old headless mode, so launch "headed" with the new headless flag.
    ...(exe ? { launchOptions: { executablePath: exe, args: ['--headless=new', '--hide-scrollbars', '--mute-audio'] }, headless: false } : { headless: true }),
  },
  // The app is designed for laptops only (1280-1440 px wide).
  projects: [{ name: 'laptop', use: { viewport: { width: 1280, height: 900 } } }],
});
