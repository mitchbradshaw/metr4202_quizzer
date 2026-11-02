// Simulations for 'bayes'. Each component file owns its own meta (id, title, summary, notice).
import type { ExploreItem } from '../../../engine/types';
import Corridor, { meta as CorridorMeta } from './Corridor';

export const explore: ExploreItem[] = [{ ...CorridorMeta, component: Corridor }];
