// Topic 'kin'. See docs/AUTHORING.md; src/topics/plan/ is the reference implementation.
import type { TopicDef } from '../../engine/types';
import { TOPIC_META } from '../meta';
import { cards, flashcards } from './learn';
import { games, mcqs, shortAnswers } from './quiz';
import { generators } from './solve';
import { explore } from './explore';

const topic: TopicDef = {
  ...TOPIC_META.kin,
  cards,
  flashcards,
  mcqs,
  games,
  shortAnswers,
  solve: generators,
  explore,
};

export default topic;
