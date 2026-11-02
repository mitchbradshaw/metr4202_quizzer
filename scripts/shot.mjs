// Screenshot one route (and print any console errors), e.g. to check a simulation visually.
//   node scripts/shot.mjs A1/explore/msd out.png [--width 1280] [--height 900] [--file x.html] [--theme dark|light] [--full]
// (Routes may be written "#/A1/explore/msd" too; Git Bash mangling of that form is repaired.)
import { fileUrl, goHash, launch, normalizeRoute, openPage, parseArgs } from './browser.mjs';

const { flags, pos } = parseArgs(process.argv.slice(2));
const hash = normalizeRoute(pos[0]);
const out = pos[1] || 'shot.png';
const { browser, ROOT } = await launch();
const { page, errors } = await openPage(browser, fileUrl(ROOT, flags.file), { width: Number(flags.width || 1280), height: Number(flags.height || 900) });
if (flags.theme) await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), flags.theme);
await goHash(page, hash, Number(flags.wait || 900));
await page.screenshot({ path: out, fullPage: !!flags.full });
console.log(JSON.stringify({ route: hash, out, errors }, null, 1));
await browser.close();
