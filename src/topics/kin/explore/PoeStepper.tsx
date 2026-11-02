// Product of exponentials, one factor at a time. Placeholder: being built.
import type { ExploreItem } from '../../../engine/types';
import { Callout } from '../../../ui/kit';

export const meta: Omit<ExploreItem, 'component'> = {
  id: 'poe',
  title: "Product of exponentials, one factor at a time",
  summary: "Start from M and apply e^[S_n]θ_n … e^[S_1]θ_1 one factor at a time (space form) or M e^[B_1]θ_1 … (body form), and watch the arm move into place.",
  notice: "In the space form each factor moves everything after it about a FIXED axis in {s}; in the body form the axes ride with the end-effector. Both give the same T(θ).",
  minutes: 6,
};

export default function PoeStepper() {
  return <Callout kind="note">This simulation is being built.</Callout>;
}
