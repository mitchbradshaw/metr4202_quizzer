// Mapping and SLAM simulations. Each component file owns its own meta (id, title, summary, notice, challenge).
import type { ExploreItem } from '../../../engine/types';
import OccupancyCell, { meta as OccupancyCellMeta } from './OccupancyCell';
import WhichProblem, { meta as WhichProblemMeta } from './WhichProblem';
import RayCast, { meta as RayCastMeta } from './RayCast';
import LoopClosure, { meta as LoopClosureMeta } from './LoopClosure';

export const explore: ExploreItem[] = [
  { ...OccupancyCellMeta, component: OccupancyCell },
  { ...RayCastMeta, component: RayCast },
  { ...LoopClosureMeta, component: LoopClosure },
  { ...WhichProblemMeta, component: WhichProblem },
];
