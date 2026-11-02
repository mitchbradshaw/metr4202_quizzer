// Motion and sensor model simulations. Each component file owns its own meta (id, title, summary, notice).
import type { ExploreItem } from '../../../engine/types';
import VelocityArc, { meta as VelocityArcMeta } from './VelocityArc';
import VelocityOdometry, { meta as VelocityOdometryMeta } from './VelocityOdometry';
import BeamModel, { meta as BeamModelMeta } from './BeamModel';
import LikelihoodField, { meta as LikelihoodFieldMeta } from './LikelihoodField';

export const explore: ExploreItem[] = [
  { ...VelocityArcMeta, component: VelocityArc },
  { ...VelocityOdometryMeta, component: VelocityOdometry },
  { ...BeamModelMeta, component: BeamModel },
  { ...LikelihoodFieldMeta, component: LikelihoodField },
];
