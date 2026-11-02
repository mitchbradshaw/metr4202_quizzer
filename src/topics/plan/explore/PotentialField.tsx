// Potential fields and local minima. Placeholder: being built.
import type { ExploreItem } from '../../../engine/types';
import { Callout } from '../../../ui/kit';

export const meta: Omit<ExploreItem, 'component'> = {
  id: 'potential',
  title: "Potential fields and local minima",
  summary: "Drag the goal and the obstacles; the robot descends the attractive-plus-repulsive potential. Build a U-shaped trap and watch it stall.",
  notice: "The robot only ever follows −∇U: where attraction and repulsion cancel it stops, short of the goal, in a local minimum.",
  minutes: 6,
};

export default function PotentialField() {
  return <Callout kind="note">This simulation is being built.</Callout>;
}
