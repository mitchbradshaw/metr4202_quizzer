// esbuild plugin: with M42_ONLY="plan,kin" every other topic (and its self-tests and quiz bank) is replaced
// by an empty stub, so one topic can be built and tested while other topics are mid-edit.
import path from 'node:path';

export const TOPIC_IDS = ['bayes', 'filters', 'models', 'slam', 'plan', 'kin', 'vision', 'rl', 'multi'];
const ID = new RegExp(`(${TOPIC_IDS.join('|')})`);

export function onlyPlugin(ROOT, onlyEnv = process.env.M42_ONLY) {
  const only = onlyEnv ? new Set(onlyEnv.split(/[,\s]+/).filter(Boolean).map((s) => s.toLowerCase())) : null;
  return {
    name: 'm42-only',
    setup(b) {
      if (!only) return;
      b.onResolve({ filter: new RegExp(`^\\./(${TOPIC_IDS.join('|')})$`) }, (a) => {
        if (!a.importer.replace(/\\/g, '/').endsWith('src/topics/index.ts')) return undefined;
        const code = a.path.slice(2);
        return only.has(code) ? undefined : { path: code, namespace: 'm42-stub-topic' };
      });
      b.onResolve({ filter: new RegExp(`topics/(${TOPIC_IDS.join('|')})/selftests$`) }, (a) => {
        const code = a.path.match(ID)[1];
        return only.has(code) ? undefined : { path: code, namespace: 'm42-stub-tests' };
      });
      b.onLoad({ filter: /.*/, namespace: 'm42-stub-topic' }, (a) => ({
        contents: `import { TOPIC_META } from ${JSON.stringify(path.join(ROOT, 'src', 'topics', 'meta.ts').replace(/\\/g, '/'))};
export default { ...TOPIC_META[${JSON.stringify(a.path)}], cards: [], flashcards: [], mcqs: [], games: [], shortAnswers: [], solve: [], explore: [] };`,
        loader: 'ts',
        resolveDir: ROOT,
      }));
      // The content lint imports every topic's quiz bank directly; stub the ones outside M42_ONLY too.
      b.onResolve({ filter: new RegExp(`topics/(${TOPIC_IDS.join('|')})/quiz$`) }, (a) => {
        const code = a.path.match(ID)[1];
        return only.has(code) ? undefined : { path: code, namespace: 'm42-stub-quiz' };
      });
      b.onLoad({ filter: /.*/, namespace: 'm42-stub-tests' }, () => ({ contents: 'export const tests = [];', loader: 'ts' }));
      b.onLoad({ filter: /.*/, namespace: 'm42-stub-quiz' }, () => ({ contents: 'export const mcqs = []; export const games = []; export const shortAnswers = [];', loader: 'ts' }));
    },
  };
}
