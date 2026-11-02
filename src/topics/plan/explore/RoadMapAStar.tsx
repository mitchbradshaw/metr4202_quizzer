// A* by hand on a road map. Placeholder: being built.
import type { ExploreItem } from '../../../engine/types';
import { Callout } from '../../../ui/kit';

export const meta: Omit<ExploreItem, 'component'> = {
  id: 'astar',
  title: "A* by hand on a road map",
  summary: "The exam’s A* question as a stepper: pop the lowest f, update neighbours, keep Open and Closed tables. Try it yourself first, then check.",
  notice: "The search stops when the goal is popped from Open, not when it is first added; a cheaper parent can replace an older one on the way.",
  minutes: 6,
};

export default function RoadMapAStar() {
  return <Callout kind="note">This simulation is being built.</Callout>;
}
