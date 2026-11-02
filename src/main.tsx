import 'katex/dist/katex.min.css';
import './styles.css';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { applyTheme, getProgress } from './app/store';
import { TOPICS } from './topics';

// Route inventory for the headless crawler (scripts/crawl.mjs) and reviewers.
(window as unknown as { __m42: unknown }).__m42 = {
  topics: TOPICS.map((t) => ({
    code: t.code,
    cards: t.cards.map((c) => c.id),
    explore: t.explore.map((e) => e.id),
    solve: t.solve.map((g) => ({ id: g.id, tiers: g.tiers })),
    mcqs: t.mcqs.length,
    flashcards: t.flashcards.length,
    games: (t.games || []).map((g) => g.id),
    shortAnswers: (t.shortAnswers || []).length,
  })),
};

applyTheme(getProgress().settings.theme);
createRoot(document.getElementById('root')!).render(<App />);
