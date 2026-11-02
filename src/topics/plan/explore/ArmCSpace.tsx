// Workspace ↔ C-space for a 2-link arm. Placeholder: being built.
import type { ExploreItem } from '../../../engine/types';
import { Callout } from '../../../ui/kit';

export const meta: Omit<ExploreItem, 'component'> = {
  id: 'cspace',
  title: "Workspace ↔ C-space for a 2-link arm",
  summary: "Drag obstacles in the workspace and see their C-space regions appear; click anywhere in C-space to pose the arm, and plan a collision-free path.",
  notice: "Obstacles inside the link-1 circle make full-height bands (link 1 hits them whatever θ₂ is); obstacles outside it make isolated link-2 blobs near θ₂ ≈ 0.",
  minutes: 6,
};

export default function ArmCSpace() {
  return <Callout kind="note">This simulation is being built.</Callout>;
}
