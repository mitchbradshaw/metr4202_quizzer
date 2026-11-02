// 3D arm viewer: joints, screw axes and frames. Placeholder: being built.
import type { ExploreItem } from '../../../engine/types';
import { Callout } from '../../../ui/kit';

export const meta: Omit<ExploreItem, 'component'> = {
  id: 'viewer',
  title: "3D arm viewer: joints, screw axes and frames",
  summary: "Pick an exam robot (2023 RPRR, 2024 PRR, 2025 RRRRR, the review deck’s 6-DOF arm) or a random one, move the joint sliders and orbit around it. Every screw axis is drawn as a line through its point q along ω.",
  notice: "A revolute screw axis is a line in space: ω gives its direction, any point q on it gives v = −ω × q. Sliding q along the axis does not change v.",
  minutes: 6,
};

export default function Viewer3D() {
  return <Callout kind="note">This simulation is being built.</Callout>;
}
