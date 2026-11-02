// Exam-mode generators for local (reactive) planning and the planning hierarchy (summary notes §5;
// 2025 Q10; review deck "fleet of holonomic robots in a warehouse"; Fox, Burgard & Thrun's dynamic window):
//   plan-local-choice  which planner (or combination) for which job, and the pitfalls of reactive planners
//   plan-dwa-window    the dynamic window, the DWA objective and the stopping (admissibility) test by hand
import type { ChoicePart, NumericPart, SolveGenerator, SolveInstance, SolvePart, Tier } from '../../../engine/types';
import type { Rng } from '../../../engine/rng';
import { fmt, tex } from '../../../engine/format';
import { sceneFigure, windowFigure } from '../explore/localFigures';
import type { Shape } from '../../../core/geom2d';

type Opt = { text: string; correct: boolean; why: string };
const ok = (text: string, why: string): Opt => ({ text, correct: true, why });
const no = (text: string, why: string): Opt => ({ text, correct: false, why });

function choice(id: string, label: string, options: Opt[], marks = 1): ChoicePart {
  return { kind: 'choice', id, label, options, marks };
}

/** Round to n decimals without float noise (0.1 + 0.2 → 0.3). */
const rd = (x: number, n = 6) => Number(x.toFixed(n));

// ================================================================== plan-local-choice

type Scenario = (rng: Rng) => SolveInstance;

// ------------------------------------------------------------------ tier 1: one idea each

const hierarchy: Scenario = (rng) => {
  const who = rng.pick([
    'A hospital delivery robot has to cross the building to reach a ward',
    'A campus delivery robot has to reach a building on the far side of campus',
    'An autonomous forklift has to reach a loading bay at the other end of the warehouse',
    'A cleaning robot has to get from its dock to a room on the other side of the floor',
  ]);
  const A = 'Searching the whole map for a route from where the robot is now to its goal takes a lot of computation.';
  const B = 'The motion has to be re-planned at a high rate to cope with things the map does not show and with the robot not executing its commands exactly.';
  const [FALSE, REBUT] = rng.pick([
    ['A local planner on its own is guaranteed to reach any goal that can be reached.', 'a local planner only sees its surroundings and can stall in a local minimum, such as a U-shaped dead end.'],
    ['The global planner must run at the control rate so that the robot can react to people.', 'the global layer is the slow one; reacting quickly is the local layer’s job.'],
    ['A local planner needs the complete map of the building before it can run.', 'a local planner works from its sensors and the robot’s immediate surroundings.'],
  ] as const);
  const twist = rng.chance(0.35);
  const s1 = A;
  const s2 = twist ? FALSE : B;
  const [first, second] = rng.chance(0.5) ? [s1, s2] : [s2, s1];
  const firstIsA = first === A;
  const options: Opt[] = twist
    ? [
        ok(`Only statement ${firstIsA ? '(1)' : '(2)'}`, `That is the paper’s reason (a): a full-map search is too slow to repeat every few milliseconds, so it runs rarely. The other statement is false: ${REBUT}`),
        no(`Only statement ${firstIsA ? '(2)' : '(1)'}`, `That statement is false: ${REBUT}`),
        no('Both statements', `Only one of them is true. The other is false: ${REBUT}`),
        no('Neither statement', 'The cost of a full-map search is exactly why the global layer runs rarely and a cheaper local layer runs fast.'),
      ]
    : [
        ok('Both statements', 'Global search over the whole map is too slow to repeat at the control rate, so it runs rarely; a fast local planner re-plans at high rate around disturbances (2025 Q10, answer (c)).'),
        no('Only the statement about computational cost', 'Cost alone would argue for planning once and then just executing. It is the need for high-rate re-planning that calls for a second, fast layer.'),
        no('Only the statement about high-rate re-planning', 'If a full-map search were cheap you would simply re-run it at the control rate. The hierarchy exists because it is not.'),
        no('Neither: one plan made at the start is enough', 'A single plan goes stale as soon as people move or the wheels slip, and the robot cannot react.'),
      ];
  return {
    prompt: `${who}. Which of the statements below motivate splitting its planner into a **global** layer and a **local** layer?\n\n(1) ${first}\n\n(2) ${second}`,
    parts: [choice('why', 'Which statement(s) motivate hierarchical (global + local) planning?', options)],
    hints: [
      'A global planner (A\\*, Dijkstra, PRM) reasons about the whole map and is slow; a local planner (potential field, DWA, velocity obstacles) looks only at the robot’s surroundings and is fast. Ask what each layer is *for*.',
      'Test each statement: is it true, and does it explain why we need **two** layers running at different rates (one slow and complete, one fast and reactive)?',
      `Here: statement ${firstIsA ? '(1)' : '(2)'} is about the cost of searching the whole map. ${twist ? `The other statement claims: “${FALSE}” Is that true of a planner that only sees its surroundings?` : 'The other is about re-planning at high rate because the world and the robot’s execution are uncertain.'}`,
      twist
        ? `**Only statement ${firstIsA ? '(1)' : '(2)'}.** The expensive whole-map search is why the global planner runs rarely. The other statement is false: ${REBUT}`
        : '**Both statements.** The whole-map search is expensive, so it runs rarely (global layer); the robot must still re-plan at high rate to react to disturbances, which needs a fast local layer. (2025 Q10: answer (c), “Both (a) and (b)”.)',
    ],
  };
};

const LOCALS: [string, string][] = [
  ['The dynamic window approach (DWA)', 'Local: each cycle it searches only the velocities reachable in the next control period and scores short arcs from sensor data.'],
  ['An artificial potential field', 'Local: it follows −∇U at the robot’s current position; there is no search over the map.'],
  ['Velocity obstacles', 'Local: each cycle it picks a velocity that will not collide with the moving obstacles within a short time horizon.'],
];
const GLOBALS: [string, string][] = [
  ['A\\* on an occupancy grid of the map', 'Global: it searches the whole grid from start to goal before the robot moves.'],
  ['A probabilistic roadmap (PRM)', 'Global: it builds a roadmap over the whole free space and graph-searches it.'],
  ['RRT\\*', 'Global: it grows a tree through the whole C-space from the start and keeps refining the path to the goal.'],
  ['Dijkstra’s algorithm on a road map', 'Global: it expands the whole graph in order of cost-to-arrive until it pops the goal.'],
];

const localOrGlobal: Scenario = (rng) => {
  const askLocal = rng.chance(0.6);
  const target = askLocal ? rng.pick(LOCALS) : rng.pick(GLOBALS);
  const others = rng.shuffle(askLocal ? GLOBALS : LOCALS).slice(0, 3);
  const kind = askLocal ? 'local (reactive)' : 'global';
  return {
    prompt: `Planners are usually stacked: a **global** planner on the map, and a **local** planner that reacts to what the sensors see. Which of these is a **${kind}** planner?`,
    parts: [choice('kind', `Which is a ${kind} planner?`, [ok(target[0], target[1]), ...others.map(([t, w]) => no(t, w))])],
    hints: [
      'Global = plans the whole route on a map (complete, slow, run rarely). Local = decides the next motion from the robot’s immediate surroundings (fast, run every control cycle, can get stuck).',
      'For each option ask: does it search over the whole map / C-space, or does it only evaluate the robot’s current state and the next instant?',
      `Graph search (A\\*, Dijkstra), PRM and RRT/RRT\\* all search the whole space. Potential fields, DWA and velocity obstacles evaluate only the robot’s neighbourhood each cycle.`,
      `**${target[0]}.** ${target[1]}`,
    ],
  };
};

const fieldStall: Scenario = (rng) => {
  const d = rng.step(0.8, 2.5, 0.1);
  return {
    prompt: `A point robot follows the force $-\\nabla U$ of an attractive + repulsive potential field. It comes to rest ${fmt(d, 2)} m short of its goal, not touching any obstacle, and never moves again.`,
    parts: [
      choice('why', 'What is true at the point where it stopped?', [
        ok('$\\nabla U = 0$: the attractive and repulsive forces cancel, so there is no downhill direction (a local minimum)', 'Gradient descent stops wherever the gradient vanishes, and it cannot tell a local minimum from the goal.'),
        no('$U = 0$ there, the same as at the goal', 'Only the goal has $U = 0$ (no attraction left, no repulsion if it is clear of obstacles). The stop point has $U > 0$: it is a local, not the global, minimum.'),
        no('The robot has collided with an obstacle', 'It is not touching anything; the repulsion grows without bound near an obstacle, which is what holds it off.'),
        no('The repulsive gain $\\eta$ must be zero', 'With $\\eta = 0$ there is no repulsion, only the attractive bowl, and the robot would reach the goal (or hit an obstacle).'),
      ]),
    ],
    hints: [
      'A potential-field robot only ever moves downhill on $U = U_{att} + U_{rep}$. It has no memory and no look-ahead.',
      'It stops when $-\\nabla U = -\\nabla U_{att} - \\nabla U_{rep} = 0$. At the goal $U$ is 0; anywhere else where the gradient vanishes $U > 0$.',
      `Here it stopped ${fmt(d, 2)} m from the goal with no contact, so the attraction (towards the goal) and the repulsion (away from the nearby obstacle) must be equal and opposite there.`,
      '**$\\nabla U = 0$ with $U > 0$: a local minimum.** The pull of the goal and the push of the obstacle cancel. Typical cause: a U-shaped obstacle or a gap narrower than the influence distance; fix it with a global planner’s waypoints.',
    ],
  };
};

const windowDef: Scenario = (rng) => {
  const dt = rng.pick([0.1, 0.2, 0.25]);
  return {
    prompt: `A differential-drive robot runs the dynamic window approach with a control period $\\Delta t$ = ${dt} s.`,
    parts: [
      choice('def', 'What is the **dynamic window**?', [
        ok('The $(v, \\omega)$ pairs the robot can reach within one control period from its current $(v, \\omega)$, given its acceleration limits', 'In $\\Delta t$ the motors can only change $v$ by $\\pm\\dot v_{max}\\Delta t$ and $\\omega$ by $\\pm\\dot\\omega_{max}\\Delta t$, so only that small rectangle is searched.'),
        no('Every $(v, \\omega)$ with $0 \\le v \\le v_{max}$ and $|\\omega| \\le \\omega_{max}$', 'That is the whole admissible box $V_s$. The dynamic window is the small part of it reachable in the next $\\Delta t$.'),
        no('The part of the map within the robot’s sensor range', 'DWA works in velocity space, not on the map.'),
        no('The velocities that keep the robot at least $Q^*$ from every obstacle', '$Q^*$ is the influence distance of a potential field. DWA removes velocities that cannot stop in time (admissibility), but that is a separate test.'),
      ]),
    ],
    hints: [
      'DWA searches **velocity space** $(v, \\omega)$, not the map, and it respects the robot’s dynamics.',
      'The window: $$V_d = [v - \\dot v_{max}\\Delta t,\\ v + \\dot v_{max}\\Delta t] \\times [\\omega - \\dot\\omega_{max}\\Delta t,\\ \\omega + \\dot\\omega_{max}\\Delta t]$$ The search space is $V_s \\cap V_d \\cap V_a$ (box, window, admissible).',
      `With $\\Delta t$ = ${dt} s and e.g. $\\dot v_{max}$ = 1 m/s², $v$ can change by only ${fmt(dt, 3)} m/s before the next decision.`,
      '**The set of velocities reachable within one control period, given the acceleration limits.** That is why the window is a small rectangle around the current velocity, not the whole box.',
    ],
  };
};

const voDef: Scenario = (rng) => {
  const tau = rng.pick([1, 2, 3, 5]);
  return {
    prompt: `Robot A shares a corridor with robot B, which is moving at a constant velocity $v_B$. A uses velocity obstacles with a time horizon $\\tau$ = ${tau} s.`,
    parts: [
      choice('def', 'The velocity obstacle $VO^{\\tau}_{A|B}$ is…', [
        ok(`the set of velocities of A that would make A and B collide within ${tau} s if B keeps $v_B$`, 'It lives in A’s velocity space: any velocity outside it is safe for the next τ seconds. A then picks the allowed velocity closest to the one it wants.'),
        no(`the region of the corridor that B sweeps in ${tau} s`, 'That is a region of space, not of velocities. The VO is a cone of velocities (apex at $v_B$).'),
        no('the set of velocities A can reach within one control period', 'That is DWA’s dynamic window (acceleration limits), a different constraint.'),
        no('the velocities B must avoid so that it does not hit A', 'That would be $VO_{B|A}$. $VO_{A|B}$ constrains A’s velocity.'),
      ]),
    ],
    hints: [
      'Velocity obstacles turn “will we collide?” into a forbidden region of **velocity space**, so a local planner can simply pick a velocity outside it.',
      'Collision within $\\tau$ means $\\exists\\, t \\in [0, \\tau]: \\|(p_B + v_B t) - (p_A + v_A t)\\| < r_A + r_B$. The set of such $v_A$ is a cone with apex $v_B$, cut off near the apex by the horizon.',
      `Here $\\tau$ = ${tau} s: velocities that would only collide after ${tau} s are still allowed this cycle (the robot re-plans long before then).`,
      `**The velocities of A that would collide with B within ${tau} s, assuming B keeps its velocity.** Choose a velocity outside the cone, as close as possible to the preferred one.`,
    ],
  };
};

const admissibleDef: Scenario = (rng) => {
  const b = rng.pick([0.5, 0.8, 1, 1.5]);
  return {
    prompt: `A DWA robot can brake at $\\dot v_b$ = ${b} m/s². One sample $(v, \\omega)$ lies inside the dynamic window, but DWA still discards it.`,
    parts: [
      choice('why', 'Which reason makes DWA discard a sample inside the window?', [
        ok('The robot could not stop before the nearest obstacle on that arc: $v > \\sqrt{2\\,\\mathrm{dist}(v,\\omega)\\,\\dot v_b}$', 'Fox et al.’s admissible set $V_a$: keep $(v, \\omega)$ only if braking at $\\dot v_b$ stops the robot within the free distance along its curvature.'),
        no('Its heading score is below 0.5', 'A low heading score lowers $G(v, \\omega)$ but does not remove the sample; only the stopping test (and the window and box) are hard constraints.'),
        no('Its arc does not end exactly on the goal', 'Arcs are scored on heading; they never need to end at the goal.'),
        no('It is slower than the current velocity', 'Slowing down is allowed (down to $v - \\dot v_{max}\\Delta t$); it is often the safe choice.'),
      ]),
    ],
    hints: [
      'DWA has hard constraints (box $V_s$, window $V_d$, admissible set $V_a$) and a soft objective $G(v, \\omega)$. Only a hard constraint can discard a sample.',
      'Admissible: $$V_a = \\{(v, \\omega) : v \\le \\sqrt{2\\,\\mathrm{dist}(v,\\omega)\\,\\dot v_b}\\}\\quad\\Leftrightarrow\\quad \\frac{v^2}{2\\dot v_b} \\le \\mathrm{dist}(v,\\omega)$$',
      `With $\\dot v_b$ = ${b} m/s², a sample at $v$ = 1 m/s needs $1^2/(2 \\times ${b})$ = ${fmt(1 / (2 * b), 3)} m of free arc ahead of it.`,
      '**It cannot stop in time:** the braking distance $v^2/(2\\dot v_b)$ is longer than the free distance along its arc, so it is not in $V_a$.',
    ],
  };
};

// ------------------------------------------------------------------ tier 2: design a planner stack

const warehouse: Scenario = (rng) => {
  const N = rng.pick([6, 12, 20, 40]);
  return {
    prompt: `A warehouse runs a fleet of ${N} **holonomic** robots on a fixed, fully mapped layout of racks. Each robot is sent to a pick location and must get there without hitting the racks **or each other**. (The review lecture asks which planning algorithm to use and why.)`,
    parts: [
      choice('global', 'Global layer: what should plan each robot’s route on the known layout?', [
        ok('A graph search (A\\* or Dijkstra) on a grid or roadmap of the known layout', 'The racks are static and mapped, and the space is 2D, so a complete, optimal search is cheap and gives each robot a route around the racks.'),
        no('An artificial potential field over the whole warehouse', 'Aisles and dead ends create local minima; a field gives no guarantee of reaching the pick location.'),
        no(`RRT\\* in the joint C-space of all ${N} robots, re-run every control cycle`, `That space has ${2 * N} dimensions and the tree would be rebuilt every few milliseconds: far too slow, and not needed for a 2D map.`),
        no('No global planner: velocity obstacles alone', 'Velocity obstacles only choose the next velocity; they cannot find a route round a rack.'),
      ]),
      choice('local', 'Local layer: how should a robot avoid the **other robots**, which move?', [
        ok('Velocity obstacles: each cycle, pick the velocity closest to the planned one that would not collide with any other robot within a short horizon', 'Holonomic robots can take any $(v_x, v_y)$ at once, so the VO cone in $(v_x, v_y)$ space applies directly, and it reasons about the others’ velocities.'),
        no('Nothing: the global routes were collision-free when they were planned', 'The routes ignore where the other robots will be at each moment; two robots can meet in an aisle.'),
        no('Re-run A\\* on the whole map every 20 ms with the other robots drawn in as static obstacles', 'Too slow at the control rate, and treating moving robots as static makes the paths flip back and forth.'),
        no('Grow the racks by the robot radius', 'That handles the static racks (C-space obstacles) but nothing about robots that move.'),
      ]),
    ],
    hints: [
      'Split the problem: the **static, known** part (racks) suits a global planner on the map; the **moving** part (other robots) needs a fast local method that re-plans every cycle.',
      'Global: complete and optimal on a known 2D map → graph search on a grid/roadmap. Local for moving obstacles: velocity obstacles exclude every velocity that collides within the horizon $\\tau$; DWA does the same job for a differential-drive robot.',
      `Here: ${N} robots, holonomic (they can move in any direction instantly), known racks. Holonomic → choose $(v_x, v_y)$ directly, which is exactly the space a velocity obstacle lives in.`,
      '**Global: A\\* (or Dijkstra) on a grid/roadmap of the known layout. Local: velocity obstacles between the robots** (each robot keeps the allowed velocity closest to its planned one). Justify both: the map is static and known; the other robots are not.',
    ],
  };
};

const hospital: Scenario = (rng) => {
  const place = rng.pick(['hospital corridors', 'an office floor', 'a university library', 'an airport terminal']);
  return {
    prompt: `A **differential-drive** delivery robot works in ${place}. The floor plan is known, but people walk around it. It has a global planner on the floor plan and needs a local planner.`,
    parts: [
      choice('local', 'Which local planner fits this robot best?', [
        ok('The dynamic window approach', 'It searches only $(v, \\omega)$ the motors can reach within $\\Delta t$ and that can still stop, so the chosen arcs respect the acceleration limits and the non-holonomic constraint (no sideways motion).'),
        no('An artificial potential field', 'It ignores the robot’s dynamics (it may ask for an instant sideways jump) and stalls in local minima such as doorways and dead ends.'),
        no('A probabilistic roadmap (PRM)', 'A PRM is a global, multi-query planner over the whole map, not a fast reactive layer.'),
        no('Velocity obstacles in $(v_x, v_y)$', 'The basic VO assumes the robot can take any $(v_x, v_y)$ at once; a differential-drive robot cannot move sideways.'),
      ]),
      choice('handoff', 'What does the global planner hand to the local planner?', [
        ok('A path (waypoints) on the floor plan; the local planner aims its heading term at a point a little way along it', 'The local planner then only has to get to a nearby sub-goal, so it cannot be led into a dead end the global plan avoided.'),
        no('A full velocity profile $v(t), \\omega(t)$ to execute without sensing', 'Then the robot could not react to people: that is the whole point of the local layer.'),
        no('Nothing: the local planner only needs the final goal', 'Heading straight for a far goal is how reactive planners end up stuck in local minima.'),
        no('An updated map with the people in it', 'Mapping is not the planner’s job, and people move faster than a map is rebuilt.'),
      ]),
    ],
    hints: [
      'Match the local method to the robot’s motion constraints, and remember why the hierarchy exists: the global plan avoids dead ends, the local planner reacts.',
      'DWA: $V_r = V_s \\cap V_d \\cap V_a$ (box, dynamic window, admissible) and $G = w_h\\,\\text{heading} + w_c\\,\\text{clearance} + w_v\\,\\text{velocity}$ over $(v, \\omega)$ arcs: built for differential-drive robots.',
      `Here: differential drive (commands are $(v, \\omega)$, no sideways motion), people moving in ${place}, known floor plan → the global plan exists; the local planner must react within its dynamics.`,
      '**Local: the dynamic window approach. Hand-off: the global path, with the heading term aimed at a point on it (a moving sub-goal).**',
    ],
  };
};

const arm: Scenario = (rng) => {
  const n = rng.pick([6, 7]);
  const k = rng.pick([20, 50, 100]);
  const cells = Math.pow(k, n);
  const part2: NumericPart = {
    kind: 'numeric',
    id: 'cells',
    label: `How many cells would a uniform C-space grid need with ${k} values per joint?`,
    answer: cells,
    unit: '',
    tol: 0.01,
    traps: [
      { value: k * n, message: `That is $k \\times n$. A grid has $k$ values on **each** of the $n$ axes: $k^n$ cells.` },
      { value: Math.pow(n, k) > 1e300 ? 1e300 : Math.pow(n, k), message: 'That is $n^k$: the exponent is the number of joints, $k^n$.' },
    ],
  };
  return {
    prompt: `A ${n}-DOF robot arm must move a part between two fixtures in a cluttered work cell. Each query is different (the fixtures move between jobs).`,
    parts: [
      choice('planner', 'Which planner suits this job?', [
        ok('A sampling-based planner such as RRT (RRT\\* if path length matters)', `It only needs a collision checker, a sampler and a distance metric, so it never builds the ${n}-D C-space explicitly; a single-query tree suits changing queries.`),
        no('A\\* on a uniform grid over the joint space', `The grid has $k^{${n}}$ cells: exponential in the number of joints, impossible to store or search for useful $k$.`),
        no('A potential field in joint space', 'Cluttered cells are full of local minima, and a field gives no completeness guarantee.'),
        no('Dijkstra on a grid of the workspace (x, y, z)', 'A free straight line in the workspace does not mean the arm can follow it: the links sweep a volume, so the plan must be made in C-space.'),
      ]),
      part2,
    ],
    hints: [
      'Count dimensions first: the C-space of an arm has one axis per joint. Grid search is exponential in that number; sampling-based planners are not.',
      'Grid cells $= k^n$ for $k$ values per joint and $n$ joints. Sampling-based planners (PRM, RRT) need only: a sampler, a distance metric, a local planner and a collision checker (no explicit C-space).',
      `Here $n$ = ${n}, $k$ = ${k}: cells $= ${k}^{${n}}$.`,
      `**A sampling-based planner (RRT, or RRT\\* for shorter paths).** A grid would need $${k}^{${n}}$ = **${tex(cells, 4)} cells**, which is why grids stop at 2–3 DOF (2025 Q24).`,
    ],
  };
};

const agv: Scenario = (rng) => {
  const stations = rng.pick([8, 12, 20, 30]);
  return {
    prompt: `An AGV in a factory shuttles between ${stations} fixed stations on a static, known floor plan. It receives hundreds of start–goal queries per shift.`,
    parts: [
      choice('planner', 'Which global planner suits many queries on the same static map?', [
        ok('A probabilistic roadmap (PRM): build it once, then answer every query with a graph search', 'The roadmap depends only on the static free space, so its cost is paid once and each query just connects start and goal to it (multi-query).'),
        no('RRT, grown from the current start for each query', 'RRT is single-query: the tree is rooted at one start, so it is regrown for every query.'),
        no('An artificial potential field', 'A reactive method; it gives no route guarantee on a map with dead ends.'),
        no('The dynamic window approach', 'DWA is a local planner: it chooses the next velocity, not a route between stations.'),
      ]),
      choice('notneeded', 'Which of these does a sampling-based planner such as a PRM **not** need?', [
        ok('An explicit representation of the configuration space', 'It never builds the C-space; it samples configurations and asks the collision checker about each one (2024 Q10).'),
        no('A collision-checking routine', 'Needed for every sample and every edge (checked along its whole length).'),
        no('A distance metric', 'Needed to find the nearest neighbours to connect.'),
        no('A sampling strategy', 'Needed to generate the configurations (uniform, near obstacles, …).'),
      ]),
    ],
    hints: [
      'Single-query vs multi-query: is the expensive structure tied to one start, or only to the static free space?',
      'PRM: sample free configurations → connect neighbours with collision-checked edges → graph search per query (multi-query). RRT: one tree from one start (single-query). Both need a sampler, a distance metric and a collision checker, never an explicit C-space.',
      `Here the map is static and there are hundreds of queries between ${stations} stations: build once, query many.`,
      '**PRM** (multi-query on a static map). It does **not** need an explicit representation of the C-space.',
    ],
  };
};

// ------------------------------------------------------------------ tier 3: pitfalls and the fix

const uBay: Scenario = (rng) => {
  const z = rng.pick([0.5, 1, 2]);
  const e = rng.pick([0.5, 1, 2]);
  const q = rng.pick([0.8, 1, 1.2]);
  const obstacles: Shape[] = [
    { kind: 'rect', x: 6, y: 1.6, w: 0.35, h: 2.8 },
    { kind: 'rect', x: 4.2, y: 1.6, w: 2.15, h: 0.35 },
    { kind: 'rect', x: 4.2, y: 4.05, w: 2.15, h: 0.35 },
  ];
  return {
    prompt: `A point robot uses an attractive + repulsive potential field ($\\zeta$ = ${z}, $\\eta$ = ${e}, $Q^*$ = ${q} m) to reach a goal behind a U-shaped shelving bay that opens towards it (figure).`,
    figure: sceneFigure({ w: 10, h: 6, obstacles, robot: { x: 1.2, y: 3.05 }, goal: { x: 8.8, y: 3 }, qStar: q, ariaLabel: 'A U-shaped bay opening towards the robot on the left; the goal is behind the bay on the right. Dashed lines show the influence distance Q*.' }),
    parts: [
      choice('what', 'What happens?', [
        ok('It drives into the bay and stops inside it, where the back wall’s repulsion balances the attraction: a local minimum', 'Inside the U every direction that leads round the bay first goes uphill (away from the goal or towards a wall), so gradient descent stalls.'),
        no('It slides along the outside of the bay and reaches the goal', 'Nothing pulls it round the outside: it heads straight for the goal and enters the bay first.'),
        no('It hits the back wall', 'The repulsion grows without bound as the distance to the wall shrinks, so it stops short of the wall.'),
        no('It oscillates for ever around the goal', 'It never gets near the goal; it stalls inside the bay.'),
      ]),
      choice('fix', 'Which change actually fixes it?', [
        ok('Plan a route round the bay with a global planner (A\\* on the map) and let the field follow its waypoints', 'The attraction then points at a nearby waypoint on a route that avoids the bay; the field only has to keep the robot off the walls.'),
        no(`Double the attractive gain to $\\zeta$ = ${2 * z}`, 'The stall point just moves closer to the back wall; it is still a minimum of $U$.'),
        no(`Double the repulsive gain to $\\eta$ = ${2 * e}`, 'The stall point moves away from the wall but stays inside the bay.'),
        no('Halve the step size', 'Smaller steps converge more precisely to the same local minimum.'),
      ]),
    ],
    hints: [
      'A potential field is a reactive (local) planner: it follows $-\\nabla U$ and stops wherever $\\nabla U = 0$, which need not be the goal.',
      '$U = \\tfrac12\\zeta d^2 + \\sum \\tfrac12\\eta(1/D - 1/Q^*)^2$. A local minimum is a point with $\\nabla U = 0$ and $U > 0$; changing $\\zeta$ or $\\eta$ moves such a point but does not remove it when the geometry (a U facing the robot) creates it.',
      `Here the goal is straight through the bay, so $-\\nabla U_{att}$ points into the U; the back wall is within $Q^*$ = ${q} m when the robot gets close, and its push balances the pull.`,
      '**It stalls inside the bay (a local minimum). Fix: a global planner (A\\* on the map) gives waypoints round the bay and the field follows them.** That is the planning hierarchy: the global plan avoids the trap, the local field handles the details.',
    ],
  };
};

const doorway: Scenario = (rng) => {
  const w = rng.pick([0.8, 0.9, 1.0, 1.2]);
  const q = rd(rng.pick([1.5, 1.8, 2.0]) * w, 2);
  const half = rd(w / 2, 3);
  const y0 = 3 - w / 2;
  const obstacles: Shape[] = [
    { kind: 'rect', x: 5, y: 0, w: 0.3, h: y0 },
    { kind: 'rect', x: 5, y: 3 + w / 2, w: 0.3, h: 6 - 3 - w / 2 },
  ];
  return {
    prompt: `A point robot uses a potential field with influence distance $Q^*$ = ${q} m to drive through a doorway ${w} m wide, with the goal on the far side on the doorway’s centre line (figure). It stalls in front of the doorway.`,
    figure: sceneFigure({
      w: 10,
      h: 6,
      obstacles,
      robot: { x: 1.5, y: 3 },
      goal: { x: 8.5, y: 3 },
      qStar: q,
      dims: [{ a: { x: 5.65, y: y0 }, b: { x: 5.65, y: 3 + w / 2 }, label: `${w} m` }],
      ariaLabel: `A wall with a doorway ${w} m wide; the robot is on the left, the goal on the right, both on the doorway's centre line.`,
    }),
    parts: [
      choice('why', 'Why does it stall?', [
        ok(`Both door jambs are closer than $Q^*$, so their repulsions add up across the doorway into a ridge the attraction cannot climb`, `Every point of the doorway is within ${half} m of a jamb, well inside $Q^*$ = ${q} m: the two repulsive terms overlap and their backward components add.`),
        no('The doorway is narrower than the robot', `It is a point robot and the doorway is ${w} m wide: it fits.`),
        no('The attractive gain is too large', 'A larger attraction would push it through more easily, not stop it.'),
        no('Gradient descent always stops at a doorway', 'Not with a small enough $Q^*$: then the centre line feels no repulsion and it drives straight through.'),
      ]),
      choice('fix', 'Which change lets it through?', [
        ok(`Reduce $Q^*$ below half the doorway width (${half} m)`, `On the centre line the nearest jamb is ${half} m away, so with $Q^* <$ ${half} m there is no repulsion there at all.`),
        no('Increase the repulsive gain $\\eta$', 'That raises the ridge across the doorway.'),
        no(`Increase $Q^*$ to ${rd(q + 0.5, 2)} m`, 'A larger influence distance makes the overlap worse.'),
        no('Use a smaller step size', 'It converges to the same stall point more precisely.'),
      ]),
    ],
    hints: [
      'Each obstacle repels only within its influence distance $Q^*$, and the repulsions of different obstacles **add**.',
      '$U_{rep} = \\sum_i \\tfrac12\\eta(1/D_i - 1/Q^*)^2$ for $D_i \\le Q^*$ (0 beyond). On the doorway’s centre line the distance to each jamb is half the width.',
      `Half the width is ${w}/2 = ${half} m, while $Q^*$ = ${q} m. So inside the doorway both jambs repel, and in front of it their backward pushes add up.`,
      `**Overlapping repulsion from both jambs (a local minimum in front of the door). Fix: $Q^* <$ ${half} m (half the width)**, so the centre line is outside both influence zones.`,
    ],
  };
};

const gnron: Scenario = (rng) => {
  const g = rng.pick([0.2, 0.3, 0.4, 0.5]);
  const q = rng.pick([1, 1.2, 1.5]);
  const obstacles: Shape[] = [{ kind: 'rect', x: 7 + g, y: 1, w: 0.6, h: 4 }];
  return {
    prompt: `A potential-field robot ($Q^*$ = ${q} m) must stop at a goal ${g} m in front of a wall (figure). The goal itself is free.`,
    figure: sceneFigure({
      w: 10,
      h: 6,
      obstacles,
      robot: { x: 1.5, y: 2.4 },
      goal: { x: 7, y: 3 },
      qStar: q,
      dims: [{ a: { x: 7, y: 5.4 }, b: { x: 7 + g, y: 5.4 }, label: `${g} m` }],
      ariaLabel: `The goal is ${g} m in front of a wall, well inside the wall's influence distance Q* = ${q} m.`,
    }),
    parts: [
      choice('where', 'Where does gradient descent stop?', [
        ok('Short of the goal: the goal lies within $Q^*$ of the wall, so the repulsion still pushes at the goal and the minimum of $U$ moves away from it', `At the goal $\\nabla U_{att} = 0$ but $\\nabla U_{rep} \\ne 0$ (${g} m < $Q^*$), so the goal is not where $\\nabla U = 0$.`),
        no('Exactly at the goal, because $U_{att} = 0$ there', 'Only if the repulsion were zero at the goal too; here the wall is closer than $Q^*$.'),
        no('Against the wall', 'The repulsion grows without bound near the wall; it stops in front of the goal, further from the wall.'),
        no('It does not move at all', 'Far from the wall only the attraction acts, so it drives towards the goal and stops short of it.'),
      ]),
      choice('fix', 'Which change lets it reach the goal?', [
        ok(`Make $Q^*$ smaller than the goal’s distance to the wall (${g} m)`, 'Then the goal is outside the wall’s influence, $\\nabla U = 0$ exactly at the goal, and the robot reaches it. (Goal-aware repulsion that vanishes at the goal is the textbook alternative.)'),
        no('Increase $\\eta$', 'A stronger push moves the stop point further from the goal.'),
        no('Add waypoints from a global planner', 'Waypoints help it reach the neighbourhood of the goal, but the last approach still ends where attraction and repulsion balance.'),
        no('Use a smaller step size', 'It converges more precisely to the same stop point.'),
      ]),
    ],
    hints: [
      'At the goal the attractive force is zero. Ask whether the repulsive force is zero there too.',
      'The robot stops where $\\zeta\\,d_{goal} = \\eta\\,(1/D - 1/Q^*)/D^2$ (attraction = repulsion along the line), i.e. where $\\nabla U = 0$. If the goal is within $Q^*$ of an obstacle, the right-hand side is not zero at the goal.',
      `Here the wall is ${g} m from the goal and $Q^*$ = ${q} m > ${g} m, so the goal is inside the wall’s influence zone.`,
      `**It stops short of the goal (repulsion still acts there). Fix: $Q^* <$ ${g} m** (or a repulsive term that vanishes at the goal). This failure is often called “goal non-reachable with obstacles nearby”.`,
    ],
  };
};

const dwaTrap: Scenario = (rng) => {
  const T = rng.pick([1, 1.5, 2]);
  const obstacles: Shape[] = [
    { kind: 'rect', x: 6, y: 1.5, w: 0.3, h: 3 },
    { kind: 'rect', x: 4.2, y: 1.5, w: 2.1, h: 0.3 },
    { kind: 'rect', x: 4.2, y: 4.2, w: 2.1, h: 0.3 },
  ];
  return {
    prompt: `A differential-drive robot runs the dynamic window approach (horizon $T$ = ${T} s, heading term aimed at the goal) towards a goal behind a U-shaped obstacle that opens towards it (figure).`,
    figure: sceneFigure({ w: 10, h: 6, obstacles, robot: { x: 1.2, y: 3 }, theta: 0, goal: { x: 8.8, y: 3 }, ariaLabel: 'A U-shaped obstacle opening towards a differential-drive robot; the goal is behind it.' }),
    parts: [
      choice('what', 'What can happen?', [
        ok('It drives into the U and stalls: every forward arc is blocked or inadmissible, and turning away scores badly on heading', 'DWA is local: it only compares short arcs. Inside the U the best-scoring choice is to stop facing the goal.'),
        no('Nothing bad: DWA re-plans every cycle, so it cannot get stuck', 'Re-planning often does not add look-ahead; each cycle it sees the same blocked arcs.'),
        no('It crashes into the back wall', 'Arcs that cannot stop before the wall are removed (admissibility), so it stops rather than crashes.'),
        no('It reverses out of the U', 'The standard search box has $v \\ge 0$; and reversing would score badly on heading anyway.'),
      ]),
      choice('fix', 'Which change fixes it?', [
        ok('Aim the heading term at a point on a global path that goes round the U', 'With the global plan as a moving sub-goal the robot never enters the U: the global layer handles the topology, DWA the dynamics.'),
        no(`Lengthen the horizon to $T$ = ${T + 2} s`, 'Longer arcs of constant curvature still cannot see round the U; it remains a local method.'),
        no('Raise the velocity weight', 'It drives into the U faster and stalls closer to the back wall.'),
        no('Raise the acceleration limits', 'A bigger window gives more arcs to choose from, but all of them still face a dead end.'),
      ]),
    ],
    hints: [
      'DWA is a **local** planner: it scores short, constant-curvature arcs from the current state. It has no notion of a route.',
      '$G = w_h\\,\\text{heading} + w_c\\,\\text{clearance} + w_v\\,\\text{velocity}$, maximised over $V_s \\cap V_d \\cap V_a$. Inside a U facing the goal, standing still keeps heading = 1 while every forward arc is blocked.',
      `Here the U opens towards the robot and the goal is straight behind it; the horizon $T$ = ${T} s only lets it compare arcs a few metres long.`,
      '**It can stall inside the U (a local minimum of the DWA objective). Fix: follow a global plan (aim the heading term at a point on a path round the U).** That is why DWA runs under a global planner.',
    ],
  };
};

const TIER_BANK: Record<Tier, Scenario[]> = {
  1: [hierarchy, localOrGlobal, fieldStall, windowDef, voDef, admissibleDef],
  2: [warehouse, hospital, arm, agv],
  3: [uBay, doorway, gnron, dwaTrap],
};

// ================================================================== plan-dwa-window

interface WinCase {
  v: number;
  w: number;
  aV: number;
  aW: number;
  dt: number;
  vMax: number;
  wMax: number;
}

function windowBounds(c: WinCase) {
  return {
    v0: rd(Math.max(0, c.v - c.aV * c.dt)),
    v1: rd(Math.min(c.vMax, c.v + c.aV * c.dt)),
    w0: rd(Math.max(-c.wMax, c.w - c.aW * c.dt)),
    w1: rd(Math.min(c.wMax, c.w + c.aW * c.dt)),
  };
}

/** rng.step that tolerates an empty range (returns a). */
function stepIn(rng: Rng, a: number, b: number, s: number): number {
  return b <= a ? a : rng.step(a, b, s);
}

function pickCase(rng: Rng, clip: 'none' | 'low' | 'high' | 'w'): WinCase {
  let dt = 0.25;
  let aV = 1;
  let aW = 2;
  let vMax = 1.5;
  let wMax = 2;
  for (let k = 0; k < 60; k++) {
    dt = rng.pick([0.1, 0.2, 0.25, 0.5]);
    aV = rng.pick([0.5, 0.8, 1, 1.2, 1.5, 2]);
    aW = rng.pick([1, 1.5, 2, 2.5, 3, 4]);
    vMax = rng.pick([1, 1.2, 1.5, 2]);
    wMax = rng.pick([1.5, 2, 2.5]);
    // As on a real robot, the window is a small part of the box: its half-widths v̇Δt and ω̇Δt stay within 35 % of
    // v_max and 50 % of ω_max (but large enough to compute something).
    if (aV * dt <= 0.35 * vMax + 1e-9 && aW * dt <= 0.5 * wMax + 1e-9 && aV * dt >= 0.1 - 1e-9 && aW * dt >= 0.2 - 1e-9) break;
  }
  const dv = rd(aV * dt);
  const dw = rd(aW * dt);
  let v: number;
  if (clip === 'low') v = rd(stepIn(rng, 0, dv - 0.05, 0.05));
  else if (clip === 'high') v = rd(Math.max(0, vMax - stepIn(rng, 0, dv - 0.05, 0.05)));
  else v = rd(stepIn(rng, Math.min(vMax, dv + 0.05), vMax - dv - 0.05, 0.05));
  v = Math.min(v, vMax);
  let w: number;
  if (clip === 'w') w = rd(rng.pick([-1, 1]) * (wMax - stepIn(rng, 0, dw - 0.1, 0.1)));
  else {
    const lim = Math.max(0, rd(wMax - dw - 0.1));
    w = rd(stepIn(rng, -lim, lim, 0.1));
  }
  return { v, w, aV, aW, dt, vMax, wMax };
}

type Trap = { value: number; message: string; trapId: string };

function boundsParts(c: WinCase): NumericPart[] {
  const b = windowBounds(c);
  const T = (value: number, message: string): Trap => ({ value, message, trapId: 'dwa-window' });
  const far = (x: number, y: number) => Math.abs(x - y) > Math.max(0.01, 0.03 * Math.abs(y));
  const mk = (id: string, label: string, answer: number, unit: string, traps: Trap[]): NumericPart => {
    const kept: Trap[] = [];
    for (const t of traps) if (far(t.value, answer) && kept.every((k) => far(k.value, t.value))) kept.push(t);
    return { kind: 'numeric', id, label, answer, unit, tol: 0.01, absTol: 0.002, traps: kept };
  };
  return [
    mk('v0', 'Lowest forward velocity in the window', b.v0, 'm/s', [
      T(rd(c.v - c.aV * c.dt), 'Clip at the box: $V_s$ has $v \\ge 0$ (no reversing), so the window stops at 0.'),
      T(rd(c.v - c.aV), 'You used $\\dot v_{max}$ as a change of velocity. Multiply by $\\Delta t$: the change in one period is $\\dot v_{max}\\Delta t$.'),
      T(rd(c.v - 0.5 * c.aV * c.dt * c.dt), 'That is a distance ($\\tfrac12 a\\Delta t^2$). The velocity changes by $\\dot v_{max}\\Delta t$.'),
    ]),
    mk('v1', 'Highest forward velocity in the window', b.v1, 'm/s', [
      T(rd(c.v + c.aV * c.dt), 'Clip at the box: the window cannot go above $v_{max}$.'),
      T(rd(c.v + c.aV), 'Multiply the acceleration by $\\Delta t$.'),
      T(rd(c.v + 0.5 * c.aV * c.dt * c.dt), 'That is a distance ($\\tfrac12 a\\Delta t^2$). The velocity changes by $\\dot v_{max}\\Delta t$.'),
    ]),
    mk('w0', 'Lowest angular velocity in the window', b.w0, 'rad/s', [
      T(rd(c.w - c.aW * c.dt), 'Clip at the box: $\\omega \\ge -\\omega_{max}$.'),
      T(rd(c.w - c.aW), 'Multiply the angular acceleration by $\\Delta t$.'),
      T(rd(c.w - c.aV * c.dt), 'You used the translational acceleration for $\\omega$. Use $\\dot\\omega_{max}$.'),
    ]),
    mk('w1', 'Highest angular velocity in the window', b.w1, 'rad/s', [
      T(rd(c.w + c.aW * c.dt), 'Clip at the box: $\\omega \\le \\omega_{max}$.'),
      T(rd(c.w + c.aW), 'Multiply the angular acceleration by $\\Delta t$.'),
      T(rd(c.w + c.aV * c.dt), 'You used the translational acceleration for $\\omega$. Use $\\dot\\omega_{max}$.'),
    ]),
  ];
}

function windowGivens(c: WinCase) {
  return [
    { sym: 'v', value: `${fmt(c.v, 4)} m/s`, label: 'current forward velocity' },
    { sym: '\\omega', value: `${fmt(c.w, 4)} rad/s`, label: 'current angular velocity' },
    { sym: '\\dot v_{max}', value: `${c.aV} m/s²`, label: 'translational acceleration limit' },
    { sym: '\\dot\\omega_{max}', value: `${c.aW} rad/s²`, label: 'angular acceleration limit' },
    { sym: '\\Delta t', value: `${c.dt} s`, label: 'control period' },
    { sym: 'v_{max}', value: `${c.vMax} m/s` },
    { sym: '\\omega_{max}', value: `${c.wMax} rad/s` },
  ];
}

function windowTier1(rng: Rng): SolveInstance {
  const clip = rng.pick(['none', 'low', 'high', 'w', 'low'] as const);
  const c = pickCase(rng, clip);
  const b = windowBounds(c);
  const dv = rd(c.aV * c.dt);
  const dw = rd(c.aW * c.dt);
  const clipNote = [
    c.v - dv < 0 ? `$v - \\dot v_{max}\\Delta t = ${tex(rd(c.v - dv))} < 0$, so it is clipped to 0` : '',
    c.v + dv > c.vMax ? `$v + \\dot v_{max}\\Delta t = ${tex(rd(c.v + dv))} > v_{max}$, so it is clipped to ${c.vMax}` : '',
    c.w - dw < -c.wMax ? `$\\omega - \\dot\\omega_{max}\\Delta t = ${tex(rd(c.w - dw))} < -\\omega_{max}$, so it is clipped to $${tex(-c.wMax)}$` : '',
    c.w + dw > c.wMax ? `$\\omega + \\dot\\omega_{max}\\Delta t = ${tex(rd(c.w + dw))} > \\omega_{max}$, so it is clipped to ${c.wMax}` : '',
  ].filter(Boolean);
  return {
    prompt: `A differential-drive robot runs the dynamic window approach. It is moving at $v$ = ${fmt(c.v, 4)} m/s and $\\omega$ = ${fmt(c.w, 4)} rad/s. Find the dynamic window for the next control period, intersected with the robot’s velocity limits.`,
    givens: windowGivens(c),
    figure: windowFigure({ vMax: c.vMax, wMax: c.wMax, now: { v: c.v, w: c.w } }),
    parts: boundsParts(c),
    hints: [
      'In one control period the motors can only change the velocity by acceleration × time, so DWA searches a small rectangle around the current $(v, \\omega)$, cut to the box $V_s = [0, v_{max}] \\times [-\\omega_{max}, \\omega_{max}]$.',
      '$$V_d = [v - \\dot v_{max}\\Delta t,\\ v + \\dot v_{max}\\Delta t] \\times [\\omega - \\dot\\omega_{max}\\Delta t,\\ \\omega + \\dot\\omega_{max}\\Delta t],\\qquad \\text{search } V_s \\cap V_d$$',
      `$\\dot v_{max}\\Delta t = ${c.aV} \\times ${c.dt} = ${tex(dv)}$ m/s and $\\dot\\omega_{max}\\Delta t = ${c.aW} \\times ${c.dt} = ${tex(dw)}$ rad/s.${clipNote.length ? ` Watch the box: ${clipNote.join('; ')}.` : ' Check each bound against the box.'}`,
      `$$v \\in [${tex(c.v)} - ${tex(dv)},\\ ${tex(c.v)} + ${tex(dv)}] \\cap [0,\\ ${c.vMax}] = [\\mathbf{${tex(b.v0)}},\\ \\mathbf{${tex(b.v1)}}]\\ \\text{m/s}$$ $$\\omega \\in [${tex(c.w)} - ${tex(dw)},\\ ${tex(c.w)} + ${tex(dw)}] \\cap [${tex(-c.wMax)},\\ ${c.wMax}] = [\\mathbf{${tex(b.w0)}},\\ \\mathbf{${tex(b.w1)}}]\\ \\text{rad/s}$$ **Window: $v$ from ${fmt(b.v0, 4)} to ${fmt(b.v1, 4)} m/s, $\\omega$ from ${fmt(b.w0, 4)} to ${fmt(b.w1, 4)} rad/s.**`,
    ],
  };
}

interface Cand3 {
  label: string;
  v: number;
  w: number;
  /** Sub-scores (2 decimals). */
  h: number;
  c: number;
  s: number;
  G: number;
  /** Tier 3: free distance along the arc (m; Infinity = no obstacle on it), braking distance, admissible. */
  dist: number;
  stop: number;
  adm: boolean;
}

const CAP = 2;

function scoreTable(cands: Cand3[], withDist: boolean): string {
  const head = `& v\\ (\\mathrm{m/s}) & \\omega\\ (\\mathrm{rad/s}) & \\text{heading} & \\text{clearance} & \\text{velocity}${withDist ? ' & \\mathrm{dist}\\ (\\mathrm{m})' : ''}`;
  const rows = cands
    .map((c) => `\\text{${c.label}} & ${tex(c.v)} & ${tex(c.w)} & ${c.h.toFixed(2)} & ${c.c.toFixed(2)} & ${c.s.toFixed(2)}${withDist ? ` & ${Number.isFinite(c.dist) ? tex(c.dist) : '\\text{none}'}` : ''}`)
    .join(' \\\\ ');
  return `$$\\begin{array}{c|cc|ccc${withDist ? '|c' : ''}} ${head} \\\\ \\hline ${rows} \\end{array}$$`;
}

interface ScoreSetup {
  wh: number;
  wc: number;
  wv: number;
  vMax: number;
  wMax: number;
  v: number;
  w: number;
  win: { v0: number; v1: number; w0: number; w1: number };
  bLim: number;
  cands: Cand3[];
}

/** One random attempt; null if the numbers do not make a clean question (ties, or no twist in tier 3). */
function trySetup(rng: Rng, tier: 2 | 3): ScoreSetup | null {
  const wh = rng.pick([0.5, 0.6, 0.7, 0.8]);
  const wc = rng.pick([0.1, 0.2, 0.3]);
  const wv = rng.pick([0.1, 0.2, 0.3, 0.4]);
  const dt = rng.pick([0.2, 0.25]);
  const aV = rng.pick([0.8, 1, 1.2]);
  const aW = rng.pick([2, 3, 4]);
  const vMax = rng.pick([1, 1.2, 1.5]);
  const wMax = 2;
  const v = rd(rng.step(0.4, vMax - 0.3, 0.05));
  const w = rd(rng.step(-0.5, 0.5, 0.1));
  const win = windowBounds({ v, w, aV, aW, dt, vMax, wMax });
  const bLim = rng.pick([0.5, 0.8, 1]);
  const vs = rng.shuffle([win.v0, rd((win.v0 + win.v1) / 2), win.v1]);
  const ws = rng.shuffle([win.w0, rd((win.w0 + win.w1) / 2), win.w1]);
  const score = (h: number, c: number, s: number) => rd(wh * h + wc * c + wv * s, 6);
  const cands: Cand3[] = ['A', 'B', 'C'].map((label, i) => {
    const cv = vs[i];
    const h = rd(rng.step(0.4, 0.98, 0.01), 2);
    const dist = tier === 3 ? (rng.chance(0.2) ? Infinity : rd(rng.step(0.3, 2.4, 0.1), 2)) : Infinity;
    const c = tier === 3 ? rd(Number.isFinite(dist) ? Math.min(1, dist / CAP) : 1, 2) : rd(rng.step(0.1, 1, 0.01), 2);
    const s = rd(cv / vMax, 2);
    const stop = rd((cv * cv) / (2 * bLim), 6);
    return { label, v: cv, w: ws[i], h, c, s, G: score(h, c, s), dist, stop, adm: stop <= dist };
  });
  if (tier === 3) {
    // The twist: the best-scoring sample cannot stop in time, the runner-up can.
    const top = [...cands].sort((a, b) => b.G - a.G)[0];
    if (top.stop < 0.25) return null;
    top.dist = rd(Math.max(0.1, Math.floor((top.stop - 0.08) * 10) / 10), 2);
    top.c = rd(Math.min(1, top.dist / CAP), 2);
    top.G = score(top.h, top.c, top.s);
    for (const c of cands) c.adm = c.stop <= c.dist;
  }
  const byG = [...cands].sort((a, b) => b.G - a.G);
  if (byG[0].G - byG[1].G < 0.02 || byG[1].G - byG[2].G < 0.015) return null;
  if (tier === 3) {
    if (byG[0].adm || byG[0].dist > byG[0].stop - 0.03) return null;
    if (!byG[1].adm || byG[1].dist < byG[1].stop + 0.05) return null;
  }
  return { wh, wc, wv, vMax, wMax, v, w, win, bLim, cands };
}

/** A hand-checked fallback (never needed in practice: a valid draw comes within a few attempts). */
function fallbackSetup(tier: 2 | 3): ScoreSetup {
  const win = { v0: 0.55, v1: 1.05, w0: -0.8, w1: 0.4 };
  const mk = (label: string, v: number, w: number, h: number, c: number, dist: number): Cand3 => {
    const s = rd(v / 1.2, 2);
    const stop = rd((v * v) / (2 * 0.8), 6);
    return { label, v, w, h, c, s, G: rd(0.6 * h + 0.2 * c + 0.3 * s, 6), dist, stop, adm: stop <= dist };
  };
  const cands =
    tier === 2
      ? [mk('A', 1.05, -0.2, 0.9, 0.35, Infinity), mk('B', 0.8, 0.4, 0.78, 0.9, Infinity), mk('C', 0.55, -0.8, 0.6, 1, Infinity)]
      : [mk('A', 1.05, -0.2, 0.95, 0.3, 0.6), mk('B', 0.8, 0.4, 0.8, 0.9, 1.8), mk('C', 0.55, -0.8, 0.55, 1, Infinity)];
  return { wh: 0.6, wc: 0.2, wv: 0.3, vMax: 1.2, wMax: 2, v: 0.8, w: -0.2, win, bLim: 0.8, cands };
}

function scoringInstance(rng: Rng, tier: 2 | 3): SolveInstance {
  let su: ScoreSetup | null = null;
  for (let k = 0; k < 400 && !su; k++) su = trySetup(rng, tier);
  const { wh, wc, wv, vMax, wMax, v, w, win, bLim, cands } = su ?? fallbackSetup(tier);
  const ranked = [...cands].sort((a, b) => b.G - a.G);
  const top = ranked[0];
  const chosen = tier === 3 ? ranked.find((c) => c.adm)! : top;
  const parts: SolvePart[] = cands.map(
    (c): NumericPart => ({
      kind: 'numeric',
      id: `G${c.label}`,
      label: `Objective $G$ of sample ${c.label}`,
      answer: c.G,
      unit: '',
      tol: 0.01,
      absTol: 0.003,
      traps: [{ value: rd(c.h + c.c + c.s, 6), message: 'You added the sub-scores without the weights: $G = w_h\\,\\text{heading} + w_c\\,\\text{clearance} + w_v\\,\\text{velocity}$.', trapId: 'dwa-weights' }].filter(
        (t) => Math.abs(t.value - c.G) > 0.02
      ),
    })
  );
  if (tier === 3) {
    // Not named in the label: the student has to see from parts 1–3 which sample scores highest.
    const stopTraps: { value: number; message: string; trapId?: string }[] = [
      { value: rd(top.v / (2 * bLim), 6), message: 'Square the speed: braking distance $= v^2/(2\\dot v_b)$.', trapId: 'dwa-stop' },
      { value: rd((top.v * top.v) / bLim, 6), message: 'Missing the ½: braking distance $= v^2/(2\\dot v_b)$.', trapId: 'dwa-stop' },
      ...cands.filter((c) => c !== top).map((c) => ({ value: c.stop, message: `That is sample ${c.label}’s braking distance. Take the sample with the highest $G$ from parts 1–3.` })),
    ];
    const kept: typeof stopTraps = [];
    for (const t of stopTraps) if (Math.abs(t.value - top.stop) > 0.02 * top.stop && kept.every((k) => Math.abs(k.value - t.value) > 0.02 * Math.max(k.value, 1e-9))) kept.push(t);
    parts.push({
      kind: 'numeric',
      id: 'stop',
      label: 'Braking distance $v^2/(2\\dot v_b)$ of the sample with the highest $G$',
      answer: top.stop,
      unit: 'm',
      tol: 0.01,
      traps: kept,
    });
  }
  const distTxt = (c: Cand3) => (Number.isFinite(c.dist) ? `${fmt(c.dist, 3)} m` : 'no obstacle on its arc');
  const options: Opt[] = cands.map((c) => {
    let why = `$G$ = ${fmt(c.G, 3)}.`;
    if (tier === 3)
      why += c.adm
        ? ` Admissible: braking distance ${fmt(c.stop, 3)} m ≤ free distance (${distTxt(c)}).`
        : ` **Not admissible**: braking distance ${fmt(c.stop, 3)} m > free distance ${distTxt(c)}, so it could not stop in time; DWA discards it however high its score.`;
    if (c === chosen) why += tier === 3 && c !== top ? ' It is the best of the admissible samples.' : ' It has the highest score.';
    else if (tier === 2 || c.adm) why += ` ${chosen.label} scores higher.`;
    return { text: `Sample ${c.label}: $v$ = ${fmt(c.v, 4)} m/s, $\\omega$ = ${fmt(c.w, 4)} rad/s`, correct: c === chosen, why };
  });
  if (tier === 3) options.push({ text: 'None of them: brake as hard as possible', correct: false, why: `Sample ${chosen.label} is admissible, so DWA executes the best admissible sample instead of braking.` });
  parts.push({ kind: 'choice', id: 'pick', label: 'Which velocity does DWA execute for the next control period?', options });
  const gLines = cands.map((c) => `G_{\\text{${c.label}}} &= ${wh}(${c.h.toFixed(2)}) + ${wc}(${c.c.toFixed(2)}) + ${wv}(${c.s.toFixed(2)}) = ${tex(c.G, 4)}`).join(' \\\\ ');
  const sLines = cands
    .map((c) => `\\text{${c.label}}: \\tfrac{${tex(c.v)}^2}{2(${bLim})} &= ${tex(c.stop, 3)}\\ \\text{m}\\ ${c.adm ? '\\le' : '>'}\\ ${Number.isFinite(c.dist) ? `${tex(c.dist)}\\ \\text{m}` : '\\text{(no obstacle)}'}${c.adm ? '' : '\\ \\Rightarrow\\ \\text{reject}'}`)
    .join(' \\\\ ');
  const givens = [
    { sym: 'w_h', value: `${wh}`, label: 'heading weight' },
    { sym: 'w_c', value: `${wc}`, label: 'clearance weight' },
    { sym: 'w_v', value: `${wv}`, label: 'velocity weight' },
    { sym: 'v_{max}', value: `${vMax} m/s`, label: 'velocity sub-score = v / v_max' },
    ...(tier === 3 ? [{ sym: '\\dot v_b', value: `${bLim} m/s²`, label: 'braking deceleration' }] : []),
  ];
  const figure = windowFigure({ vMax, wMax, now: { v, w }, window: win, cands: cands.map((c) => ({ label: c.label, v: c.v, w: c.w })) });
  if (tier === 2)
    return {
      prompt: `A DWA robot is moving at $v$ = ${fmt(v, 3)} m/s, $\\omega$ = ${fmt(w, 3)} rad/s. Three samples of its dynamic window have been simulated and scored; each sub-score is already scaled to [0, 1] (velocity $= v/v_{max}$):\n\n${scoreTable(cands, false)}`,
      givens,
      figure,
      parts,
      hints: [
        'Every admissible sample in the window is scored with the same weighted sum; DWA executes the highest-scoring one for one control period, then repeats from the new state.',
        '$$G(v, \\omega) = w_h\\,\\text{heading} + w_c\\,\\text{clearance} + w_v\\,\\text{velocity}$$',
        `With $w_h$ = ${wh}, $w_c$ = ${wc}, $w_v$ = ${wv}: $G_{\\text{A}} = ${wh}(${cands[0].h.toFixed(2)}) + ${wc}(${cands[0].c.toFixed(2)}) + ${wv}(${cands[0].s.toFixed(2)})$, and the same for B and C.`,
        `$$\\begin{aligned} ${gLines} \\end{aligned}$$ **DWA executes ${chosen.label}** ($v$ = ${fmt(chosen.v, 4)} m/s, $\\omega$ = ${fmt(chosen.w, 4)} rad/s), the highest score, $G$ = ${fmt(chosen.G, 3)}.`,
      ],
    };
  return {
    prompt: `A DWA robot is moving at $v$ = ${fmt(v, 3)} m/s, $\\omega$ = ${fmt(w, 3)} rad/s. Three samples of its dynamic window have been simulated. For each, dist is the free distance along its arc before the nearest obstacle, and the clearance sub-score is dist / ${CAP} m (capped at 1):\n\n${scoreTable(cands, true)}\n\nUse the admissibility test $v^2/(2\\dot v_b) \\le \\mathrm{dist}(v, \\omega)$.`,
    givens,
    figure,
    parts,
    hints: [
      'Two different tests: the objective $G$ ranks the samples (soft), but a sample that cannot stop before the obstacle on its arc is discarded whatever its score (hard: the admissible set $V_a$).',
      '$$G = w_h\\,\\text{heading} + w_c\\,\\text{clearance} + w_v\\,\\text{velocity},\\qquad \\text{admissible} \\iff \\frac{v^2}{2\\dot v_b} \\le \\mathrm{dist}(v, \\omega)$$',
      `With $\\dot v_b$ = ${bLim} m/s², sample ${top.label} needs $${tex(top.v)}^2/(2 \\times ${bLim})$ m to stop; compare that with its free distance (${distTxt(top)}).`,
      `$$\\begin{aligned} ${gLines} \\end{aligned}$$ $$\\begin{aligned} ${sLines} \\end{aligned}$$ **${top.label} scores highest but cannot stop in time (braking distance ${fmt(top.stop, 3)} m), so DWA executes ${chosen.label}** ($v$ = ${fmt(chosen.v, 4)} m/s, $\\omega$ = ${fmt(chosen.w, 4)} rad/s, $G$ = ${fmt(chosen.G, 3)}).`,
    ],
  };
}

export const generators: SolveGenerator[] = [
  {
    id: 'plan-local-choice',
    title: 'Global or local? Choosing the planner',
    summary: 'Scenario questions: why plan in two layers, which planner for which robot, and what goes wrong with reactive planners (and the fix).',
    tiers: [1, 2, 3],
    source: 'Similar to 2025 Q10 and 2025 Q24; review deck (warehouse fleet of holonomic robots); summary notes §5 (global vs local planning)',
    cardId: 'plan-local',
    marks: 2,
    generate(rng, tier) {
      return rng.pick(TIER_BANK[tier])(rng);
    },
  },
  {
    id: 'plan-dwa-window',
    title: 'Dynamic window by hand',
    summary: 'The reachable window $V_d$, the DWA objective $G(v, \\omega)$, and the stopping test that removes inadmissible arcs.',
    tiers: [1, 2, 3],
    source: 'Summary notes §5 (dynamic window approach); review deck learning outcomes (collision avoidance: dynamic window); Fox, Burgard & Thrun (1997)',
    cardId: 'plan-local',
    marks: 4,
    generate(rng, tier) {
      if (tier === 1) return windowTier1(rng);
      return scoringInstance(rng, tier === 2 ? 2 : 3);
    },
  },
];
