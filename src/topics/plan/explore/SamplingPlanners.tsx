// PRM, RRT and RRT*: watch them grow. Placeholder: being built.
import type { ExploreItem } from '../../../engine/types';
import { Callout } from '../../../ui/kit';

export const meta: Omit<ExploreItem, 'component'> = {
  id: 'sampling',
  title: "PRM, RRT and RRT*: watch them grow",
  summary: "Grow a roadmap or a tree step by step. RRT* highlights the neighbourhood, the chosen parent and every rewire; the path-cost plot shows who keeps improving.",
  notice: "RRT’s first path never improves; RRT* keeps shortening it as samples arrive, because choose-parent and rewire fix early jagged branches.",
  minutes: 6,
};

export default function SamplingPlanners() {
  return <Callout kind="note">This simulation is being built.</Callout>;
}
