// Build M: read the frames like the exam. Placeholder: being built.
import type { ExploreItem } from '../../../engine/types';
import { Callout } from '../../../ui/kit';

export const meta: Omit<ExploreItem, 'component'> = {
  id: 'build-m',
  title: "Build M: read the frames like the exam",
  summary: "The paper’s drawing of {s} and {b}, in the exam’s oblique view and in 3D. Choose where x̂_b, ŷ_b and ẑ_b point in {s} and read off p; the matrix assembles itself and checks det R = +1.",
  notice: "The columns of R are x̂_b, ŷ_b and ẑ_b written in {s} coordinates; an axis drawn diagonally usually points into or out of the page.",
  minutes: 6,
};

export default function BuildM() {
  return <Callout kind="note">This simulation is being built.</Callout>;
}
