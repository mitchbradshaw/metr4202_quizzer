// slam-which: "localisation, mapping or SLAM?" (2023 Q7-8, 2024 Q7-8, 2025 Q7-8). Tier 1: one scenario and one
// "what does SLAM solve for" fact. Tier 2: decide what is known (pose, map), the problem, and the posterior it
// estimates (online vs full SLAM). The scenarios are the which-problem simulation's (explore/whichData.ts).
import type { ChoicePart, SolveGenerator, SolvePart, Tier } from '../../../engine/types';
import type { Rng } from '../../../engine/rng';
import { POSTERIOR, PROBLEM_LABEL, SCENARIOS, problemOf, type Problem, type Scenario } from '../explore/whichData';

const PROBLEMS: Problem[] = ['localisation', 'mapping', 'slam', 'none'];

const PROBLEM_WHY: Record<Problem, string> = {
  localisation: 'Localisation estimates the pose when the map is given: $p(x_t \\mid m, z_{1:t}, u_{1:t})$.',
  mapping: 'Mapping builds the map when the pose is given: $p(m \\mid x_{1:t}, z_{1:t})$.',
  slam: 'SLAM estimates the pose and the map together, because neither is given.',
  none: 'With the pose and the map both given there is nothing left to estimate; the robot just plans and controls.',
};

function problemPart(sc: Scenario, label: string, marks: number): ChoicePart {
  const ans = problemOf(sc.pose, sc.map);
  const known = `Pose ${sc.pose}, map ${sc.map}.`;
  return {
    kind: 'choice',
    id: 'problem',
    label,
    options: PROBLEMS.map((p) => ({
      text: p === 'none' ? 'None of these: it only needs to plan and control' : PROBLEM_LABEL[p],
      correct: p === ans,
      why: p === ans ? `${known} ${PROBLEM_WHY[p]} ${sc.poseWhy} ${sc.mapWhy}` : `${known} ${PROBLEM_WHY[p]} That does not match: ${p === 'localisation' ? (sc.map === 'unknown' ? 'the map is not given.' : 'the pose is already known.') : p === 'mapping' ? (sc.pose === 'unknown' ? 'the pose is not given.' : 'the map is already known.') : p === 'slam' ? (sc.pose === 'known' ? 'the pose is given, so it is not unknown.' : 'the map is given, so it is not unknown.') : 'something here is unknown and must be estimated.'}`,
    })),
    marks,
  };
}

const FACTS: { stem: string; options: { text: string; correct: boolean; why: string }[]; source: string }[] = [
  {
    stem: 'SLAM solves for:',
    source: '2024 Q8',
    options: [
      { text: 'Only the robot pose', correct: false, why: 'That is localisation, which needs the map to be given.' },
      { text: 'Only the map', correct: false, why: 'That is mapping, which needs the pose to be given.' },
      { text: 'Both the robot pose and the map', correct: true, why: 'Simultaneous localisation and mapping: neither is given, so both are estimated together.' },
      { text: 'Only the sensor likelihood', correct: false, why: 'The sensor model $p(z \\mid x, m)$ is an input to SLAM, not what it estimates.' },
    ],
  },
  {
    stem: '**Online** SLAM solves for:',
    source: '2025 Q8',
    options: [
      { text: 'Only the map', correct: false, why: 'SLAM always estimates the pose too.' },
      { text: 'Only the current robot pose', correct: false, why: 'That is localisation (with a known map).' },
      { text: 'Both the current robot pose and the map', correct: true, why: 'Online SLAM: $p(x_t, m \\mid z_{1:t}, u_{1:t})$, the current pose only, updated as data arrive (e.g. EKF-SLAM).' },
      { text: 'The full robot trajectory and the map', correct: false, why: 'That is **full** SLAM, $p(x_{1:t}, m \\mid z_{1:t}, u_{1:t})$ (e.g. graph SLAM).' },
    ],
  },
  {
    stem: '**Full** SLAM solves for:',
    source: 'Review deck slide 9; summary notes §4',
    options: [
      { text: 'Only the current robot pose', correct: false, why: 'That is localisation.' },
      { text: 'The current robot pose and the map', correct: false, why: 'That is **online** SLAM; full SLAM keeps every past pose.' },
      { text: 'The whole robot trajectory and the map', correct: true, why: 'Full SLAM: $p(x_{1:t}, m \\mid z_{1:t}, u_{1:t})$. Graph SLAM solves it by optimising all poses at once, which is how a loop closure can move old poses.' },
      { text: 'Only the map, given the trajectory', correct: false, why: 'That is mapping with known poses.' },
    ],
  },
  {
    stem: 'When does a navigating mobile robot need to solve the SLAM problem?',
    source: '2023 Q8',
    options: [
      { text: 'When it only knows its pose', correct: false, why: 'Known pose, unknown map: mapping.' },
      { text: 'When it only knows the map', correct: false, why: 'Known map, unknown pose: localisation.' },
      { text: 'When it knows both its pose and the map', correct: false, why: 'Nothing to estimate: it just plans.' },
      { text: 'When it knows neither its pose nor the map', correct: true, why: 'Both unknown: it must estimate them together.' },
    ],
  },
];

function tier1(rng: Rng) {
  const sc = rng.pick(SCENARIOS);
  const fact = rng.pick(FACTS);
  const ans = problemOf(sc.pose, sc.map);
  const parts: SolvePart[] = [
    problemPart(sc, '(a) Which problem must the robot solve?', 1),
    { kind: 'choice', id: 'fact', label: `(b) ${fact.stem}`, options: fact.options, marks: 1 },
  ];
  const hints: [string, string, string, string] = [
    'Ask two questions: is the robot’s **pose** given (GPS, motion capture, encoders), and is the **map** given (floor plan, surveyed tags, CAD)? What is unknown is what must be estimated.',
    '$$\\begin{array}{l|c|c} & \\text{map known} & \\text{map unknown} \\\\ \\hline \\text{pose known} & \\text{neither (plan)} & \\text{mapping} \\\\ \\text{pose unknown} & \\text{localisation} & \\text{SLAM} \\end{array}$$ Online SLAM: $p(x_t, m \\mid z_{1:t}, u_{1:t})$; full SLAM: $p(x_{1:t}, m \\mid z_{1:t}, u_{1:t})$.',
    `Pose: **${sc.pose}** (${sc.poseWhy}) Map: **${sc.map}** (${sc.mapWhy})`,
    `(a) Pose ${sc.pose}, map ${sc.map} ⇒ **${PROBLEM_LABEL[ans]}**. (b) **${fact.options.find((o) => o.correct)!.text}**: ${fact.options.find((o) => o.correct)!.why} (${fact.source}.)`,
  ];
  return { prompt: sc.text, parts, hints };
}

function tier2(rng: Rng) {
  const sc = rng.pick(SCENARIOS.filter((s) => problemOf(s.pose, s.map) !== 'none'));
  const ans = problemOf(sc.pose, sc.map);
  const key: Problem | 'online' | 'full' = ans === 'slam' ? sc.slam ?? 'online' : ans;
  const knownPart = (id: 'pose' | 'map'): ChoicePart => {
    const v = sc[id];
    const why = id === 'pose' ? sc.poseWhy : sc.mapWhy;
    return {
      kind: 'choice',
      id,
      label: id === 'pose' ? '(a) Is the robot’s **pose** given to it, or must it be estimated?' : '(b) Is the **map** given, or must it be estimated?',
      options: [
        { text: 'Given (known)', correct: v === 'known', why: v === 'known' ? why : `No: ${why}` },
        { text: 'Unknown: it must be estimated', correct: v === 'unknown', why: v === 'unknown' ? why : `No: ${why}` },
      ],
      marks: 1,
    };
  };
  const postOptions: { k: Problem | 'online' | 'full'; why: string }[] = [
    { k: 'localisation', why: 'Pose only, with the map $m$ given (to the right of the bar).' },
    { k: 'mapping', why: 'Map only, with the poses $x_{1:t}$ given.' },
    { k: 'online', why: 'Online SLAM: the current pose and the map, updated as the robot moves.' },
    { k: 'full', why: 'Full SLAM: every past pose and the map, e.g. optimised all at once afterwards (graph SLAM).' },
  ];
  const postPart: ChoicePart = {
    kind: 'choice',
    id: 'posterior',
    label: '(d) Which posterior does it estimate? (Unknowns go left of the bar, givens right.)',
    options: postOptions.map((o) => ({
      text: `$${POSTERIOR[o.k]}$`,
      correct: o.k === key,
      why: o.k === key ? `${o.why}${ans === 'slam' ? (key === 'full' ? ' Here the whole path is wanted (the data are processed together afterwards).' : ' Here the robot needs its pose now, while it moves.') : ''}` : `${o.why} Not this scenario.`,
    })),
    marks: 1,
  };
  const parts: SolvePart[] = [knownPart('pose'), knownPart('map'), problemPart(sc, '(c) So which problem is it?', 1), postPart];
  const hints: [string, string, string, string] = [
    'The problem follows from what is unknown. Read the scenario for **how the pose is obtained** (GPS, motion capture, encoders = given) and **whether a map exists** (floor plan, surveyed tags, CAD = given). In a posterior, the unknowns sit left of the bar and the givens right.',
    `$$\\begin{array}{l|c|c} & \\text{map known} & \\text{map unknown} \\\\ \\hline \\text{pose known} & \\text{neither} & ${POSTERIOR.mapping} \\\\ \\text{pose unknown} & ${POSTERIOR.localisation} & ${POSTERIOR.online} \\end{array}$$ Full SLAM keeps the whole trajectory: $${POSTERIOR.full}$.`,
    `Pose: ${sc.poseWhy} Map: ${sc.mapWhy}${ans === 'slam' ? ` Does it need only its current pose while moving, or the whole path afterwards? ${sc.slam === 'full' ? 'The data are processed afterwards, all together.' : 'It needs the pose now, to keep driving.'}` : ''}`,
    `(a) Pose **${sc.pose}**. (b) Map **${sc.map}**. (c) **${PROBLEM_LABEL[ans]}**. (d) **$${POSTERIOR[key]}$**${ans === 'slam' ? ` (${key} SLAM)` : ''}.`,
  ];
  return { prompt: sc.text, parts, hints };
}

export const generators: SolveGenerator[] = [
  {
    id: 'slam-which',
    title: 'Localisation, mapping or SLAM?',
    summary: 'Decide what is known (pose, map), name the problem, and pick the posterior it estimates: localisation, mapping, online or full SLAM.',
    tiers: [1, 2],
    source: 'Similar to 2023 Q7-8, 2024 Q7-8, 2025 Q7-8; summary notes §4 table',
    cardId: 'slam-problems',
    marks: 4,
    generate(rng, tier: Tier) {
      return tier === 1 ? tier1(rng) : tier2(rng);
    },
  },
];
