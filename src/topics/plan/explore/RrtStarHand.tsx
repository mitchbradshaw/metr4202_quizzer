// RRT vs RRT*: choose parent and rewire. Placeholder: being built.
import type { ExploreItem } from '../../../engine/types';
import { Callout } from '../../../ui/kit';

export const meta: Omit<ExploreItem, 'component'> = {
  id: 'rrtstar',
  title: "RRT vs RRT*: choose parent and rewire",
  summary: "Drag the new sample around a small tree and read the choose-parent and rewire tables live, exactly as in 2025 Q29.",
  notice: "Basic RRT connects to the nearest vertex; RRT* minimises cost-to-come c(x_near) + d(x_near, x_new), then rewires neighbours that get cheaper through x_new.",
  minutes: 6,
};

export default function RrtStarHand() {
  return <Callout kind="note">This simulation is being built.</Callout>;
}
