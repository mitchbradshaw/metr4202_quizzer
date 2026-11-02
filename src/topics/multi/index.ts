// Topic 'multi'. See docs/AUTHORING.md; src/topics/plan/ is the reference implementation.
import type { TopicDef } from '../../engine/types';
import { TOPIC_META } from '../meta';
import { cards, flashcards } from './learn';
import { games, mcqs, shortAnswers } from './quiz';
import { generators } from './solve';
import { explore } from './explore';

const topic: TopicDef = {
  ...TOPIC_META.multi,
  cards,
  flashcards,
  mcqs,
  games,
  shortAnswers,
  solve: generators,
  explore,
  seeAlso: [
    {
      label: 'Exam-style short answers',
      href: '#/multi/quiz?v=short',
      note: 'Multi-robot coordination is examined by two MCQs and a 3-mark comparison every year, so its exam mode is the short answers: write yours, then mark it against the model answer and key points.',
    },
  ],
};

export default topic;
