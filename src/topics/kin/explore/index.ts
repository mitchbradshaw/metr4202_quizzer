// Kinematics simulations. Each component file owns its own meta (id, title, summary, notice, challenge).
import type { ExploreItem } from '../../../engine/types';
import Viewer3D, { meta as Viewer3DMeta } from './Viewer3D';
import BuildM, { meta as BuildMMeta } from './BuildM';
import ScrewTable, { meta as ScrewTableMeta } from './ScrewTable';
import PoeStepper, { meta as PoeStepperMeta } from './PoeStepper';
import IkNewton, { meta as IkNewtonMeta } from './IkNewton';
import Pieper, { meta as PieperMeta } from './Pieper';

export const explore: ExploreItem[] = [
  { ...Viewer3DMeta, component: Viewer3D },
  { ...BuildMMeta, component: BuildM },
  { ...ScrewTableMeta, component: ScrewTable },
  { ...PoeStepperMeta, component: PoeStepper },
  { ...IkNewtonMeta, component: IkNewton },
  { ...PieperMeta, component: Pieper },
];
