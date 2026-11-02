// The hidden "true" office for the ray-cast grid builder: walls, a glass partition, furniture, a thin pillar, a narrow
// door, a tour for the robot and a person's walking schedule. Data only (no React). Metres, y up, origin bottom-left.
import type { Disc, MapWorld, Seg, SegKind } from '../../../core/slamgrid';

export const WORLD_W = 16;
export const WORLD_H = 10;

const seg = (ax: number, ay: number, bx: number, by: number, kind: SegKind = 'wall'): Seg => ({ ax, ay, bx, by, kind });
const rect = (x0: number, y0: number, x1: number, y1: number): Seg[] => [seg(x0, y0, x1, y0), seg(x1, y0, x1, y1), seg(x1, y1, x0, y1), seg(x0, y1, x0, y0)];

/** Labels drawn on the truth overlay. */
export const LABELS: { x: number; y: number; text: string }[] = [
  { x: 2.3, y: 6.9, text: 'table' },
  { x: 3.6, y: 2.05, text: 'pillar' },
  { x: 8.6, y: 7.2, text: 'box' },
  { x: 12.4, y: 5.25, text: 'glass' },
  { x: 12.7, y: 7.8, text: 'shelf' },
  { x: 11.25, y: 3.0, text: '0.8 m door' },
];

export const OFFICE: MapWorld = {
  w: WORLD_W,
  h: WORLD_H,
  segs: [
    // outer walls
    ...rect(0.4, 0.4, 15.6, 9.6),
    // wall between rooms 1 and 2, with a 1.2 m door
    seg(5.6, 0.4, 5.6, 4.0),
    seg(5.6, 5.2, 5.6, 9.6),
    // wall between rooms 2 and 3, with a narrow 0.8 m door (it closes on a 0.5 m grid)
    seg(10.8, 0.4, 10.8, 2.6),
    seg(10.8, 3.4, 10.8, 9.6),
    // furniture
    ...rect(1.6, 6.4, 3.0, 7.4), // table
    ...rect(3.5, 2.3, 3.7, 2.5), // 0.2 m pillar
    ...rect(8.0, 6.8, 9.2, 7.6), // box
    ...rect(6.4, 0.4, 7.6, 1.0), // cabinet against the wall
    ...rect(12.0, 7.2, 13.4, 8.4), // shelf behind the glass
    // glass partition in room 3 (lidar beams pass through unless they meet it head-on)
    seg(10.8, 5.0, 14.0, 5.0, 'glass'),
  ],
};

export type Pt = [number, number];

/** A polyline the robot drives along at constant speed. */
export interface Route {
  pts: Pt[];
  /** Cumulative length at each vertex. */
  cum: number[];
  length: number;
}

export function makeRoute(pts: Pt[]): Route {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, cum, length: cum[cum.length - 1] };
}

/** Position and heading at arc length s (clamped to the route). */
export function routeAt(r: Route, s: number): { x: number; y: number; th: number } {
  const t = Math.max(0, Math.min(r.length, s));
  let k = 1;
  while (k < r.pts.length - 1 && r.cum[k] < t) k++;
  const a = r.pts[k - 1];
  const b = r.pts[k];
  const L = r.cum[k] - r.cum[k - 1] || 1;
  const f = (t - r.cum[k - 1]) / L;
  return { x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f, th: Math.atan2(b[1] - a[1], b[0] - a[0]) };
}

/** The office tour: room 1, through the wide door, room 2, through the narrow door, along the glass, behind it. */
export const TOUR = makeRoute([
  [1.4, 1.4],
  [1.4, 5.0],
  [4.6, 5.0],
  [4.6, 8.6],
  [4.6, 4.6],
  [7.2, 4.6],
  [7.2, 2.2],
  [9.8, 2.2],
  [9.8, 3.0],
  [14.8, 3.0],
  [14.8, 8.8],
  [11.8, 8.8],
  [11.8, 6.0],
]);

/** Along the glass partition and round behind it. */
export const GLASS_ROUTE = makeRoute([
  [11.4, 1.8],
  [14.6, 1.8],
  [14.8, 6.4],
  [11.6, 6.4],
]);

/** Person keyframes: walk in through the wide door, stop 2 m in front of the robot for 4 s, walk on, wait, walk back. Period 16 s. */
const PERSON_KEYS: [number, number, number][] = [
  [0, 6.2, 4.6],
  [2.2, 8.4, 4.6],
  [6.2, 8.4, 4.6],
  [8.0, 10.2, 4.6],
  [10.0, 10.2, 4.6],
  [14.0, 6.2, 4.6],
  [16.0, 6.2, 4.6],
];
export const PERSON_PERIOD = 16;
export const PERSON_R = 0.3;

export function personAt(t: number): Disc {
  const u = ((t % PERSON_PERIOD) + PERSON_PERIOD) % PERSON_PERIOD;
  let k = 1;
  while (k < PERSON_KEYS.length - 1 && PERSON_KEYS[k][0] < u) k++;
  const a = PERSON_KEYS[k - 1];
  const b = PERSON_KEYS[k];
  const f = b[0] > a[0] ? (u - a[0]) / (b[0] - a[0]) : 0;
  return { x: a[1] + (b[1] - a[1]) * f, y: a[2] + (b[2] - a[2]) * f, r: PERSON_R };
}

export type SceneId = 'tour' | 'person' | 'glass' | 'coarse';

export interface Scene {
  id: SceneId;
  label: string;
  title: string;
  /** Where the robot starts (and stays, when there is no route). */
  start: { x: number; y: number; th: number };
  route: Route | null;
  person: boolean;
  /** Grid resolution the scene starts with (m). */
  res?: number;
  /** What the scene is for, shown under the map. */
  note: string;
}

export const SCENES: Record<SceneId, Scene> = {
  tour: {
    id: 'tour',
    label: 'Office tour',
    title: 'Drive the robot round the office (known pose) and watch the map build',
    start: { x: 1.4, y: 1.4, th: Math.PI / 2 },
    route: TOUR,
    person: false,
    note: 'Mapping with a **known** pose: every beam is placed exactly. Grey cells were never seen; the shadow behind each obstacle stays grey because beams stop at the first thing they hit.',
  },
  person: {
    id: 'person',
    label: 'Person walks by',
    title: 'The robot is parked and scanning while a person walks through and stops to chat',
    start: { x: 8.4, y: 2.6, th: Math.PI / 2 },
    route: null,
    person: true,
    note: 'The occupancy grid assumes a **static** world. The person is mapped as an obstacle wherever they stand; the cells only clear when later beams pass through them again. Compare clamping on and off after the 4 s stop.',
  },
  glass: {
    id: 'glass',
    label: 'Glass wall',
    title: 'Drive along a glass partition: lidar beams pass through glass unless they meet it head-on',
    start: { x: 11.4, y: 1.8, th: 0 },
    route: GLASS_ROUTE,
    person: false,
    note: 'Glass returns a beam only near normal incidence, so most beams pass through and mark the pane **free**. The map shows at best a broken line where there is a solid obstacle: a planner would drive into it.',
  },
  coarse: {
    id: 'coarse',
    label: 'Coarse grid',
    title: 'The same tour on a 0.5 m grid: little memory, little detail',
    start: { x: 1.4, y: 1.4, th: Math.PI / 2 },
    route: TOUR,
    person: false,
    res: 0.5,
    note: 'Memory grows as $1/\\text{res}^2$ in 2D. At 0.5 m the 0.2 m pillar fills whole 0.5 m cells, every wall is 0.5 m thick and the 0.8 m door is under two cells wide: inflate the walls by the robot’s radius, as a planner must, and it closes. Switch the resolution: the map is rebuilt from the same scans.',
  },
};
