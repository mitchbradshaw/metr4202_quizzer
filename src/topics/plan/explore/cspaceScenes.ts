// Scenes for the workspace ↔ C-space simulation (pure data, so the self-tests can check them).
import type { Vec2 } from '../../../core/geom2d';
import {
  EXAM_2023,
  EXAM_2023_BOXES,
  EXAM_2024,
  EXAM_2024_BOXES,
  EXAM_2025,
  EXAM_2025_BOXES,
  REVIEW_A,
  REVIEW_B,
  REVIEW_C,
  type CWorkspace,
  type PaperBox,
} from '../../../core/cspacegen';

const P = Math.PI;

export interface CScene {
  id: string;
  /** Short name for the scene picker. */
  name: string;
  /** One or two sentences shown under the picker (Rich). */
  note: string;
  ws: CWorkspace;
  /** Initial pose [θ1, θ2] (radians). */
  pose: [number, number];
  start: [number, number];
  goal: [number, number];
  /** The paper's answer boxes (θ in units of π), shown on request. */
  boxes?: PaperBox[];
  /** Straight tip line for the "free line ≠ free motion" demo (IK branch θ2 ∈ (0, π)). */
  line?: { from: Vec2; to: Vec2 };
  challenge?: boolean;
  /** Obstacles and lengths fixed (challenge). */
  locked?: boolean;
  /** Hidden from the picker (used by the predict-then-reveal prompts). */
  hidden?: boolean;
}

const B = { x: 5, y: 5 };

export const LINE_WS: CWorkspace = {
  base: B,
  l1: 2.5,
  l2: 2,
  obstacles: [{ label: 'A', shape: { kind: 'rect', x: 4.6, y: 6, w: 0.8, h: 0.8 } }],
};

export const WRAP_WS: CWorkspace = {
  base: B,
  l1: 2.5,
  l2: 2,
  obstacles: [
    { label: 'A', shape: { kind: 'rect', x: 4.5, y: 6.3, w: 1, h: 1 } },
    { label: 'B', shape: { kind: 'rect', x: 4.25, y: 1, w: 1.5, h: 1 } },
    { label: 'C', shape: { kind: 'rect', x: 8, y: 4.5, w: 1, h: 1 } },
  ],
};

export const SCENES: CScene[] = [
  {
    id: 'e2024',
    name: '2024 Q24',
    note: 'A and C cross the dashed circle (bands); B is out of reach of link 1, so it only makes thin link-2 stripes near $\\theta_2 \\approx 0 \\equiv 2\\pi$.',
    ws: EXAM_2024,
    pose: [0.38 * P, 0.1 * P],
    start: [0.38 * P, 0.1 * P],
    goal: [1.9 * P, 0.3 * P],
    boxes: EXAM_2024_BOXES,
  },
  {
    id: 'e2023',
    name: '2023 Q26',
    note: 'B and C touch the circle (bands; C’s band wraps through $\\theta_1 = 0$, which is why a piece of it shows on the left edge). A is outside: one blob that wraps top to bottom.',
    ws: EXAM_2023,
    pose: [0.38 * P, 0.1 * P],
    start: [0.38 * P, 0.1 * P],
    goal: [1.1 * P, 0.3 * P],
    boxes: EXAM_2023_BOXES,
  },
  {
    id: 'e2025',
    name: '2025 Q25',
    note: 'Nothing crosses the circle ($L_1$ = 2.5 m): no bands at all, just three link-2 blobs, each cut in two by the top and bottom edges.',
    ws: EXAM_2025,
    pose: [0.38 * P, 0.09 * P],
    start: [0.38 * P, 0.09 * P],
    goal: [1.3 * P, 0.2 * P],
    boxes: EXAM_2025_BOXES,
  },
  {
    id: 'rA',
    name: 'Review: workspace A',
    note: 'Review deck slide 16, workspace A (its C-space is plot 1): two obstacles inside the circle (two bands; B’s wraps through $\\theta_1 = 0$) and C below, out of reach of link 1 (blob).',
    ws: REVIEW_A,
    pose: [0.38 * P, 0.05 * P],
    start: [0.38 * P, 0.05 * P],
    goal: [0.62 * P, 1.0 * P],
  },
  {
    id: 'rB',
    name: 'Review: workspace B',
    note: 'Review deck workspace B (plot 3): the block below now reaches inside the circle, so it is a second full-height band instead of a blob.',
    ws: REVIEW_B,
    pose: [0.38 * P, 0.05 * P],
    start: [0.38 * P, 0.05 * P],
    goal: [1.85 * P, 0.5 * P],
  },
  {
    id: 'rC',
    name: 'Review: workspace C',
    note: 'Review deck workspace C (plot 2): one band from the small block, one blob from the block below.',
    ws: REVIEW_C,
    pose: [0.38 * P, 0.05 * P],
    start: [0.38 * P, 0.05 * P],
    goal: [1.5 * P, 0.6 * P],
  },
  {
    id: 'line',
    name: 'Straight line ≠ free motion',
    note: 'The tip can slide along the dashed line from P to Q without touching A, but link 1 cannot get past A: every $\\theta_1$ that points at A is blocked whatever $\\theta_2$ is.',
    ws: LINE_WS,
    pose: [0.176 * P, 0.144 * P],
    start: [0.176 * P, 0.144 * P],
    goal: [0.696 * P, 0.144 * P],
    line: { from: { x: 8.2, y: 8 }, to: { x: 1.8, y: 8 } },
  },
  {
    id: 'wrap',
    name: 'Challenge: go round',
    note: '**Challenge.** Move the arm from S to G without touching anything. A’s band blocks the short way, so go round through $\\theta_1 = 0 \\equiv 2\\pi$, and dodge B on the way.',
    ws: WRAP_WS,
    pose: [0.3 * P, 0.5 * P],
    start: [0.3 * P, 0.5 * P],
    goal: [0.75 * P, 0.5 * P],
    challenge: true,
    locked: true,
  },
  {
    id: 'pr-band',
    name: 'One square, inside the circle',
    note: 'Square A crosses the dashed circle of radius $L_1$.',
    ws: { base: B, l1: 2.5, l2: 2, obstacles: [{ label: 'A', shape: { kind: 'rect', x: 2.5, y: 6.5, w: 1, h: 1 } }] },
    pose: [0.25 * P, 0.2 * P],
    start: [0.25 * P, 0.2 * P],
    goal: [1.3 * P, 0.2 * P],
    hidden: true,
  },
  {
    id: 'pr-above',
    name: 'One block, above and out of reach',
    note: 'B sits directly above the base, beyond the dashed circle: only link 2 can reach it.',
    ws: { base: B, l1: 2.5, l2: 2, obstacles: [{ label: 'B', shape: { kind: 'rect', x: 4.5, y: 8, w: 1, h: 1 } }] },
    pose: [0.25 * P, 0.2 * P],
    start: [0.25 * P, 0.2 * P],
    goal: [0.75 * P, 1.8 * P],
    hidden: true,
  },
];

export const sceneById = (id: string) => SCENES.find((s) => s.id === id) ?? SCENES[0];

/** Challenge id (also in the explore meta). */
export const WRAP_CHALLENGE = 'plan-cspace-wrap';
