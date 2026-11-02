// Heuristic lab: admissible or not?. Placeholder: being built.
import type { ExploreItem } from '../../../engine/types';
import { Callout } from '../../../ui/kit';

export const meta: Omit<ExploreItem, 'component'> = {
  id: 'heuristics',
  title: "Heuristic lab: admissible or not?",
  summary: "Switch between zero, Euclidean, Manhattan, octile and inflated heuristics and compare nodes expanded with the cost of the path found.",
  notice: "Cells where h overestimates the true cost to go are marked: once any appear, A* can return a longer path.",
  minutes: 6,
};

export default function HeuristicLab() {
  return <Callout kind="note">This simulation is being built.</Callout>;
}
