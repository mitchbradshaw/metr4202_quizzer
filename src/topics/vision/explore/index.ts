// Perception and vision simulations. Each component file owns its meta (id, title, summary, notice).
import type { ExploreItem } from '../../../engine/types';
import PinholeSandbox, { meta as pinholeMeta } from './PinholeSandbox';
import IntrinsicsLab, { meta as intrinsicsMeta } from './IntrinsicsLab';
import Pipeline3D, { meta as pipelineMeta } from './Pipeline3D';
import Servoing, { meta as servoingMeta } from './Servoing';
import Sensors, { meta as sensorsMeta } from './Sensors';

export const explore: ExploreItem[] = [
  { ...pinholeMeta, component: PinholeSandbox },
  { ...intrinsicsMeta, component: IntrinsicsLab },
  { ...pipelineMeta, component: Pipeline3D },
  { ...servoingMeta, component: Servoing },
  { ...sensorsMeta, component: Sensors },
];
