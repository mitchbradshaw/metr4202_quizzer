// Simulations for 'bayes', in teaching order: the rule, the filter in 1-D and on the exam's grid, a classifier
// sequence with a decision, and the Markov assumption. Each component file owns its own meta.
import type { ExploreItem } from '../../../engine/types';
import BayesRule, { meta as BayesRuleMeta } from './BayesRule';
import Corridor, { meta as CorridorMeta } from './Corridor';
import GridWorld, { meta as GridWorldMeta } from './GridWorld';
import Classifier, { meta as ClassifierMeta } from './Classifier';
import Markov, { meta as MarkovMeta } from './Markov';

export const explore: ExploreItem[] = [
  { ...BayesRuleMeta, component: BayesRule },
  { ...CorridorMeta, component: Corridor },
  { ...GridWorldMeta, component: GridWorld },
  { ...ClassifierMeta, component: Classifier },
  { ...MarkovMeta, component: Markov },
];
