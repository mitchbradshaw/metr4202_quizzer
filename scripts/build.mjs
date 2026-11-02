// Bundles src/ into ONE self-contained index.html (JS, CSS and KaTeX woff2 fonts inlined).
//   node scripts/build.mjs           production build -> ./index.html
//   node scripts/build.mjs --dev     unminified with inline source maps
//   node scripts/build.mjs --watch   rebuild on change
//   node scripts/build.mjs --out <file>   write somewhere else (parallel agents)
//   M42_ONLY=A2,A3 node scripts/build.mjs  stub out every other topic
import fs from 'node:fs';
import path from 'node:path';
import { toolchain } from './toolchain.mjs';
import { onlyPlugin } from './only-plugin.mjs';

const { ROOT, esbuild, nodePaths } = toolchain();
const argv = process.argv.slice(2);
const args = new Set(argv);
const dev = args.has('--dev');
const watch = args.has('--watch');
const outIdx = argv.indexOf('--out');
const outHtml = outIdx >= 0 ? path.resolve(argv[outIdx + 1]) : path.join(ROOT, 'index.html');

// KaTeX ships woff2 + woff + ttf for every font; keep only woff2 so the inlined file stays small.
const katexWoff2Only = {
  name: 'katex-woff2-only',
  setup(b) {
    b.onLoad({ filter: /katex(\.min)?\.css$/ }, async (a) => {
      let css = await fs.promises.readFile(a.path, 'utf8');
      css = css
        .replace(/,\s*url\([^)]*?\.woff\)\s*format\("woff"\)/g, '')
        .replace(/,\s*url\([^)]*?\.ttf\)\s*format\("truetype"\)/g, '');
      return { contents: css, loader: 'css', resolveDir: path.dirname(a.path) };
    });
  },
};

const THEME_BOOT = `(function(){try{var t=JSON.parse(localStorage.getItem('m42lab.v1')||'{}');var p=t&&t.settings&&t.settings.theme;if(p==='light'||p==='dark')document.documentElement.setAttribute('data-theme',p);}catch(e){}})();`;

function page(js, css) {
  const safeJs = js.replace(/<\/script/gi, '<\\/script');
  const safeCss = css.replace(/<\/style/gi, '<\\/style');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="METR4202 Robotics Lab: interactive study game for UQ METR4202 Robotics & Automation.">
<title>METR4202 Robotics Lab</title>
<script>${THEME_BOOT}</script>
<style>${safeCss}</style>
</head>
<body>
<div id="root"></div>
<noscript>METR4202 Robotics Lab needs JavaScript enabled.</noscript>
<script>${safeJs}</script>
</body>
</html>
`;
}

const writeHtml = {
  name: 'write-single-html',
  setup(b) {
    b.onEnd((res) => {
      if (res.errors.length) return;
      const js = res.outputFiles.find((f) => f.path.endsWith('.js'));
      const css = res.outputFiles.find((f) => f.path.endsWith('.css'));
      const html = page(js ? js.text : '', css ? css.text : '');
      fs.writeFileSync(outHtml, html);
      const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
      console.log(`[build] wrote ${path.relative(ROOT, outHtml) || outHtml} (${kb} KB)${dev ? ' [dev]' : ''}${process.env.M42_ONLY ? ` [only ${process.env.M42_ONLY}]` : ''}`);
    });
  },
};

const options = {
  entryPoints: [path.join(ROOT, 'src', 'main.tsx')],
  bundle: true,
  write: false,
  outdir: path.join(ROOT, '.cache', 'out'),
  format: 'iife',
  target: ['chrome109', 'edge109', 'firefox115', 'safari16'],
  jsx: 'automatic',
  minify: !dev,
  sourcemap: dev ? 'inline' : false,
  legalComments: 'none',
  loader: { '.woff2': 'dataurl', '.woff': 'empty', '.ttf': 'empty' },
  define: { 'process.env.NODE_ENV': dev ? '"development"' : '"production"' },
  nodePaths,
  plugins: [onlyPlugin(ROOT), katexWoff2Only, writeHtml],
  logLevel: 'warning',
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log('[build] watching src/ for changes...');
} else {
  const res = await esbuild.build(options);
  if (res.errors.length) process.exitCode = 1;
}
