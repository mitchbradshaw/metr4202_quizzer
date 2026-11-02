// Fill the screw-axis table, in {s} and in {b}. Placeholder: being built.
import type { ExploreItem } from '../../../engine/types';
import { Callout } from '../../../ui/kit';

export const meta: Omit<ExploreItem, 'component'> = {
  id: 'screws',
  title: "Fill the screw-axis table, in {s} and in {b}",
  summary: "Joint by joint: pick ω from the drawn arrow, pick a point q on the axis, and watch v = −ω × q come out with the cross-product shortcuts. Switch to {b} to see the same joints measured from the end-effector.",
  notice: "Flipping ω flips v; any q on the axis gives the same v; in {b}, q is measured from the {b} origin and ω is written in {b} axes.",
  minutes: 6,
};

export default function ScrewTable() {
  return <Callout kind="note">This simulation is being built.</Callout>;
}
