// Mapping and SLAM simulations. Each component file owns its own meta (id, title, summary, notice, challenge).
import type { ExploreItem } from '../../../engine/types';
import OccupancyCell, { meta as OccupancyCellMeta } from './OccupancyCell';
import WhichProblem, { meta as WhichProblemMeta } from './WhichProblem';

export const explore: ExploreItem[] = [
  { ...OccupancyCellMeta, component: OccupancyCell },
  { ...WhichProblemMeta, component: WhichProblem },
];
