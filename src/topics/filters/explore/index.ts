// Filters simulations. Each component file owns its own meta (id, title, summary, notice).
import type { ExploreItem } from '../../../engine/types';
import KalmanOneD, { meta as KalmanOneDMeta } from './KalmanOneD';
import EkfLinearise, { meta as EkfLineariseMeta } from './EkfLinearise';
import ParticleFilter, { meta as ParticleFilterMeta } from './ParticleFilter';
import WhichFilter, { meta as WhichFilterMeta } from './WhichFilter';

export const explore: ExploreItem[] = [
  { ...KalmanOneDMeta, component: KalmanOneD },
  { ...EkfLineariseMeta, component: EkfLinearise },
  { ...ParticleFilterMeta, component: ParticleFilter },
  { ...WhichFilterMeta, component: WhichFilter },
];
