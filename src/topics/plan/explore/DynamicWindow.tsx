// Dynamic window approach. Placeholder: being built.
import type { ExploreItem } from '../../../engine/types';
import { Callout } from '../../../ui/kit';

export const meta: Omit<ExploreItem, 'component'> = {
  id: 'dwa',
  title: "Dynamic window approach",
  summary: "The reachable (v, ω) window, the short arcs it allows, and how heading, clearance and speed weights pick one arc each control cycle.",
  notice: "Only velocities reachable within one control period are considered, and arcs that cannot stop before an obstacle are discarded.",
  minutes: 6,
};

export default function DynamicWindow() {
  return <Callout kind="note">This simulation is being built.</Callout>;
}
