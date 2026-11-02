// Reinforcement-learning simulations. Each component file owns its own meta (id, title, summary, notice, challenge).
import type { ExploreItem } from '../../../engine/types';
import GridWorld, { meta as GridWorldMeta } from './GridWorld';
import MdpTuple, { meta as MdpTupleMeta } from './MdpTuple';
import Sim2Real, { meta as Sim2RealMeta } from './Sim2Real';

export const explore: ExploreItem[] = [
  { ...GridWorldMeta, component: GridWorld },
  { ...MdpTupleMeta, component: MdpTuple },
  { ...Sim2RealMeta, component: Sim2Real },
];
