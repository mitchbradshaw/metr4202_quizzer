// Multi-robot simulations. Each component file owns its own meta (id, title, summary, notice, challenge).
import type { ExploreItem } from '../../../engine/types';
import Allocation, { meta as AllocationMeta } from './Allocation';
import Credit, { meta as CreditMeta } from './Credit';

export const explore: ExploreItem[] = [
  { ...AllocationMeta, component: Allocation },
  { ...CreditMeta, component: Credit },
];
