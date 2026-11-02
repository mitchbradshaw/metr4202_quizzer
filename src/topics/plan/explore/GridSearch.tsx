// Grid search lab: BFS, DFS, Dijkstra, A*. Placeholder: being built.
import type { ExploreItem } from '../../../engine/types';
import { Callout } from '../../../ui/kit';

export const meta: Omit<ExploreItem, 'component'> = {
  id: 'grid',
  title: "Grid search lab: BFS, DFS, Dijkstra, A*",
  summary: "Paint walls and mud, then step BFS, DFS, Dijkstra, A* or greedy through the open and closed sets and watch f = g + h on every cell.",
  notice: "Same map, same start and goal: watch which cells each algorithm opens, and how many it needs before it pops the goal.",
  minutes: 6,
};

export default function GridSearch() {
  return <Callout kind="note">This simulation is being built.</Callout>;
}
