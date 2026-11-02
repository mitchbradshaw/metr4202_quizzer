// Closed-form IK or not? (Pieper). Placeholder: being built.
import type { ExploreItem } from '../../../engine/types';
import { Callout } from '../../../ui/kit';

export const meta: Omit<ExploreItem, 'component'> = {
  id: 'pieper',
  title: "Closed-form IK or not? (Pieper)",
  summary: "Six-axis layouts, one at a time: do three consecutive revolute axes meet at a point (a spherical wrist) or run parallel? Decide, then rotate the 3D view to check.",
  notice: "Closed-form IK needs three consecutive revolute axes that intersect at one point or are parallel; then position and orientation decouple.",
  minutes: 6,
};

export default function Pieper() {
  return <Callout kind="note">This simulation is being built.</Callout>;
}
