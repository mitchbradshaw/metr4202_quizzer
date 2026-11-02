// Exam-mode problem generators for 'vision' (one file per generator in solve/).
import type { SolveGenerator } from '../../engine/types';
import { pinholeInstance } from './solve/pinhole';
import { projectInstance } from './solve/project';
import { measureInstance } from './solve/measure';

export const generators: SolveGenerator[] = [
  {
    id: 'vision-pinhole',
    title: 'Pinhole camera: image size, distance or focal length',
    summary: "$h' = f h / Z$ with the units in metres, the depth measured from the camera, and the arm-geometry and same-depth chains of the long answers.",
    tiers: [1, 2, 3],
    source: 'Similar to 2023 Q33(c), 2024 Q30(c)-(d), 2025 Q30(c)-(d); review deck slides 23-24 (JWST)',
    cardId: 'vision-pinhole',
    marks: 3,
    generate: (rng, tier) => pinholeInstance(rng, tier),
  },
  {
    id: 'vision-project',
    title: 'World point to pixel (and back) with K, R, t',
    summary: 'Extrinsics $X_c = R X_w + t$, perspective division, intrinsics $K$; back-projection to a ray; which parameters are intrinsic or extrinsic.',
    tiers: [1, 2, 3],
    source: 'Review deck slides 21-22 (image formation, calibration parameters); intrinsic vs extrinsic as in 2023 Q14, 2024 Q14, 2025 Q14',
    cardId: 'vision-intrinsics',
    marks: 4,
    sprint: false,
    generate: (rng, tier) => projectInstance(rng, tier),
  },
  {
    id: 'vision-measure',
    title: 'What one image can tell you, perspective effects, visual servoing',
    summary: 'Relative sizes but not absolute size or depth; what perspective preserves; what PBVS and IBVS require.',
    tiers: [1, 2],
    source: 'Similar to 2023 Q13/Q15, 2024 Q13/Q15, 2025 Q13/Q15',
    cardId: 'vision-perspective',
    marks: 2,
    generate: (rng, tier) => measureInstance(rng, tier),
  },
];
