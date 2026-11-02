// Road maps used by the A*-by-hand activities. Node positions are only for drawing (x right, y down, in a
// 0-100 box); edge costs and heuristics are the ones printed on the papers.
import type { WeightedGraph } from './graph';

/** 2024 Q29: Brisbane university shuttle (km). Not to scale. */
export const BRISBANE_2024: WeightedGraph = {
  nodes: [
    { id: 'KG', label: 'Kelvin Grove', x: 8, y: 12 },
    { id: 'H', label: 'Herston', x: 26, y: 6 },
    { id: 'GP', label: 'Gardens Point', x: 46, y: 32 },
    { id: 'SB', label: 'South Bank', x: 42, y: 46 },
    { id: 'SL', label: 'St Lucia', x: 12, y: 62 },
    { id: 'DP', label: 'Dutton Park', x: 38, y: 70 },
    { id: 'MG', label: 'Mount Gravatt', x: 88, y: 78 },
    { id: 'N', label: 'Nathan', x: 62, y: 96 },
  ],
  edges: [
    ['KG', 'H', 0.9],
    ['KG', 'GP', 3.1],
    ['H', 'GP', 4.1],
    ['H', 'SL', 7.7],
    ['GP', 'SB', 1.0],
    ['SB', 'SL', 3.7],
    ['SB', 'DP', 3.4],
    ['SB', 'N', 11.2],
    ['SB', 'MG', 9.7],
    ['SL', 'DP', 2.4],
    ['DP', 'MG', 6.9],
    ['DP', 'N', 8.1],
    ['N', 'MG', 2.0],
  ],
};

/** 2024 Q29 Table 1: straight-line distance to Mount Gravatt (km). */
export const BRISBANE_H: Record<string, number> = { N: 1.9, DP: 6.4, SL: 7.1, GP: 8.1, SB: 8.5, KG: 11.0, H: 11.1, MG: 0 };

/** Review deck slide 17: Australian cities (km), heuristic = geodetic distance to Alice Springs. */
export const AUSTRALIA_REVIEW: WeightedGraph = {
  nodes: [
    { id: 'Darwin', x: 34, y: 2 },
    { id: 'Broome', x: 12, y: 18 },
    { id: 'Townsville', x: 76, y: 22 },
    { id: 'Alice Springs', x: 41, y: 31 },
    { id: 'Brisbane', x: 88, y: 46 },
    { id: 'Perth', x: 0, y: 59 },
    { id: 'Broken Hill', x: 61, y: 55 },
    { id: 'Adelaide', x: 53, y: 64 },
    { id: 'Sydney', x: 81, y: 64 },
    { id: 'Canberra', x: 76, y: 69 },
    { id: 'Melbourne', x: 66, y: 75 },
    { id: 'Hobart', x: 70, y: 98 },
  ],
  edges: [
    ['Darwin', 'Broome', 1200],
    ['Darwin', 'Townsville', 1900],
    ['Darwin', 'Alice Springs', 1300],
    ['Broome', 'Alice Springs', 1400],
    ['Broome', 'Perth', 1700],
    ['Alice Springs', 'Townsville', 1500],
    ['Alice Springs', 'Perth', 2000],
    ['Alice Springs', 'Adelaide', 1400],
    ['Alice Springs', 'Broken Hill', 1200],
    ['Townsville', 'Brisbane', 1200],
    ['Brisbane', 'Broken Hill', 1300],
    ['Brisbane', 'Sydney', 800],
    ['Broken Hill', 'Adelaide', 500],
    ['Broken Hill', 'Canberra', 900],
    ['Broken Hill', 'Melbourne', 800],
    ['Perth', 'Adelaide', 2500],
    ['Adelaide', 'Melbourne', 700],
    ['Melbourne', 'Canberra', 500],
    ['Canberra', 'Sydney', 300],
    ['Melbourne', 'Hobart', 600],
    ['Hobart', 'Sydney', 1100],
  ],
};

export const AUSTRALIA_H: Record<string, number> = {
  Adelaide: 1250,
  Brisbane: 1900,
  'Broken Hill': 1100,
  Broome: 1300,
  Canberra: 1900,
  Darwin: 1200,
  Hobart: 2400,
  Melbourne: 1800,
  Perth: 1900,
  Sydney: 2000,
  Townsville: 1400,
  'Alice Springs': 0,
};
