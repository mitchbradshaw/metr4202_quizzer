// Planning simulations. Each component file owns its own meta (id, title, summary, notice, challenge).
import type { ExploreItem } from '../../../engine/types';
import GridSearch, { meta as GridSearchMeta } from './GridSearch';
import HeuristicLab, { meta as HeuristicLabMeta } from './HeuristicLab';
import RoadMapAStar, { meta as RoadMapAStarMeta } from './RoadMapAStar';
import ArmCSpace, { meta as ArmCSpaceMeta } from './ArmCSpace';
import SamplingPlanners, { meta as SamplingPlannersMeta } from './SamplingPlanners';
import RrtStarHand, { meta as RrtStarHandMeta } from './RrtStarHand';
import PotentialField, { meta as PotentialFieldMeta } from './PotentialField';
import DynamicWindow, { meta as DynamicWindowMeta } from './DynamicWindow';

export const explore: ExploreItem[] = [
  { ...GridSearchMeta, component: GridSearch },
  { ...HeuristicLabMeta, component: HeuristicLab },
  { ...RoadMapAStarMeta, component: RoadMapAStar },
  { ...ArmCSpaceMeta, component: ArmCSpace },
  { ...SamplingPlannersMeta, component: SamplingPlanners },
  { ...RrtStarHandMeta, component: RrtStarHand },
  { ...PotentialFieldMeta, component: PotentialField },
  { ...DynamicWindowMeta, component: DynamicWindow },
];
