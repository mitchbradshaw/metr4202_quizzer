// Newton–Raphson IK, iteration by iteration. Placeholder: being built.
import type { ExploreItem } from '../../../engine/types';
import { Callout } from '../../../ui/kit';

export const meta: Omit<ExploreItem, 'component'> = {
  id: 'ik',
  title: "Newton–Raphson IK, iteration by iteration",
  summary: "Drag the target and the initial guess for a planar arm and step θ ← θ + J†e. See it converge, pick the other elbow from a different guess, crawl near singularities and fail outside the workspace.",
  notice: "Numerical IK only finds the solution near your initial guess; near a singularity J loses rank and the steps blow up or stall.",
  minutes: 6,
};

export default function IkNewton() {
  return <Callout kind="note">This simulation is being built.</Callout>;
}
