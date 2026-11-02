// The road maps the A* activities run on: the 2024 Q29 Brisbane shuttle, the review deck's Australia
// (slide 17), and seeded random maps from core/roadgen. Drawing positions are in a 640 × 440 viewBox;
// the exam maps are redrawn from the papers' figures ("not to scale"), random maps are drawn to scale
// so the straight-line heuristic is literally the distance you see.
import type { WeightedGraph } from '../../../core/graph';
import { AUSTRALIA_H, AUSTRALIA_REVIEW, BRISBANE_2024, BRISBANE_H } from '../../../core/roadmaps';
import { pickRoadMap, roadMap, straightLineH, type RoadMap } from '../../../core/roadgen';

export interface Pt {
  x: number;
  y: number;
}

export type MapKey = 'brisbane' | 'australia' | 'random';

export interface MapDef {
  key: MapKey;
  title: string;
  graph: WeightedGraph;
  /** Drawing position of each node in the viewBox. */
  pos: Record<string, Pt>;
  vb: { w: number; h: number };
  /** Short label inside the node circle. */
  code: (id: string) => string;
  /** Name used in tables and sentences. */
  name: (id: string) => string;
  /** Full name written beside the node (exam maps). */
  long: (id: string) => string | undefined;
  /** The goal the printed heuristic table refers to (exam maps); null = straight-line h to any goal. */
  tableGoal: string | null;
  /** Heuristic towards `goal`, or null when no table exists for that goal. */
  hFor: (goal: string) => Record<string, number> | null;
  start: string;
  goal: string;
  unit: string;
  /** Pixels (viewBox units) per km, for a scale bar on to-scale maps. */
  scale?: number;
  seed?: number;
  source: string;
}

export const VB = { w: 640, h: 440 };

const BRIS_POS: Record<string, Pt> = {
  KG: { x: 110, y: 74 },
  H: { x: 213, y: 50 },
  GP: { x: 336, y: 150 },
  SB: { x: 310, y: 206 },
  SL: { x: 128, y: 266 },
  DP: { x: 286, y: 296 },
  MG: { x: 556, y: 336 },
  N: { x: 418, y: 400 },
};

const BRIS_LONG: Record<string, string> = Object.fromEntries(BRISBANE_2024.nodes.map((n) => [n.id, n.label ?? n.id]));

export function brisbaneMap(): MapDef {
  return {
    key: 'brisbane',
    title: 'Brisbane shuttle (2024 Q29)',
    graph: BRISBANE_2024,
    pos: BRIS_POS,
    vb: VB,
    code: (id) => id,
    name: (id) => id,
    long: (id) => BRIS_LONG[id],
    tableGoal: 'MG',
    hFor: (goal) => (goal === 'MG' ? BRISBANE_H : null),
    start: 'KG',
    goal: 'MG',
    unit: 'km',
    source: '2024 Q29 (Figure 3, Table 1)',
  };
}

const AUS_POS: Record<string, Pt> = {
  Darwin: { x: 330, y: 38 },
  Broome: { x: 150, y: 112 },
  Townsville: { x: 512, y: 118 },
  'Alice Springs': { x: 340, y: 168 },
  Brisbane: { x: 592, y: 222 },
  Perth: { x: 64, y: 292 },
  'Broken Hill': { x: 446, y: 262 },
  Adelaide: { x: 356, y: 318 },
  Sydney: { x: 592, y: 312 },
  Canberra: { x: 514, y: 338 },
  Melbourne: { x: 430, y: 366 },
  Hobart: { x: 472, y: 410 },
};

const AUS_CODE: Record<string, string> = {
  Darwin: 'DRW',
  Broome: 'BME',
  Townsville: 'TSV',
  'Alice Springs': 'ASP',
  Brisbane: 'BNE',
  Perth: 'PER',
  'Broken Hill': 'BHQ',
  Adelaide: 'ADL',
  Sydney: 'SYD',
  Canberra: 'CBR',
  Melbourne: 'MEL',
  Hobart: 'HBA',
};

export function australiaMap(): MapDef {
  return {
    key: 'australia',
    title: 'Australia (review deck)',
    graph: AUSTRALIA_REVIEW,
    pos: AUS_POS,
    vb: VB,
    code: (id) => AUS_CODE[id] ?? id,
    name: (id) => id,
    long: (id) => id,
    tableGoal: 'Alice Springs',
    hFor: (goal) => (goal === 'Alice Springs' ? AUSTRALIA_H : null),
    start: 'Hobart',
    goal: 'Alice Springs',
    unit: 'km',
    source: 'Review deck slide 17 (geodetic distances to Alice Springs)',
  };
}

/** Uniform scale from the generation box (km) into the viewBox, so 1 km is the same length on every map. */
export function fitRoadMap(m: RoadMap, vb = VB, padX = 52, padTop = 46, padBottom = 48): { pos: Record<string, Pt>; scale: number } {
  const s = Math.min((vb.w - 2 * padX) / m.width, (vb.h - padTop - padBottom) / m.height);
  const ox = (vb.w - s * m.width) / 2;
  const oy = padTop + (vb.h - padTop - padBottom - s * m.height) / 2;
  const pos: Record<string, Pt> = {};
  for (const n of m.graph.nodes) pos[n.id] = { x: ox + s * (n.x ?? 0), y: oy + s * (n.y ?? 0) };
  return { pos, scale: s };
}

/** Maps worth practising on: the goal 3+ roads away, 4–8 pops, no tie for the lowest f at any pop. */
export function simAccept(seedMap: RoadMap, st: { pops: number; pathEdges: number; tieAtPop: boolean }): boolean {
  return st.pathEdges >= 3 && st.pops >= 4 && st.pops <= 8 && !st.tieAtPop && seedMap.graph.nodes.length >= 6;
}

export function mapFromRoad(m: RoadMap): MapDef {
  const { pos, scale } = fitRoadMap(m);
  return {
    key: 'random',
    title: `Random map #${m.seed}`,
    graph: m.graph,
    pos,
    vb: VB,
    code: (id) => id,
    name: (id) => id,
    long: () => undefined,
    tableGoal: null,
    hFor: (goal) => straightLineH(m.graph, goal),
    start: m.start,
    goal: m.goal,
    unit: 'km',
    scale,
    seed: m.seed,
    source: 'Random road map: roads are 1.0–1.4 × the straight line, h = straight-line distance (rounded down)',
  };
}

/** A random practice map (the first acceptable map at or after `seed`). */
export function randomMap(seed: number): MapDef {
  return mapFromRoad(pickRoadMap(seed, simAccept));
}

/** Exactly the map for this seed, no filtering (for tests). */
export const rawRandomMap = (seed: number) => mapFromRoad(roadMap(seed));
