// Named traps: the mistakes that cost marks in the METR4202 papers (summary notes and worked solutions), plus
// the generic answer-checking traps used by src/engine/check.ts. Topics can register more via TopicDef.traps.
import type { TrapDef } from './types';

export const CORE_TRAPS: TrapDef[] = [
  // Estimation (Bayes, filters, occupancy)
  { id: 'likelihood-column', title: 'Reading the wrong likelihood', detail: '$P(z \\mid x)$ is the entry for the OBSERVED reading given each true state. If $P(\\text{black} \\mid \\text{black}) = 0.83$ then $P(\\text{white} \\mid \\text{black}) = 0.17$.' },
  { id: 'contributions-add', title: 'Prediction: contributions to the same state add', detail: 'Where two starting states can land in the same cell, add their contributions $p(x\' \\mid u, x)\\,bel(x)$.' },
  { id: 'normalise', title: 'Forgetting to normalise', detail: 'Divide every product by $P(z) = \\sum_x P(z \\mid x) P(x)$, then check the posteriors sum to 1.' },
  { id: 'false-positive', title: 'False-positive rate = 1 − true-negative rate', detail: 'Rows of the sensor table are the true state and each row sums to 1: $p(\\text{occ} \\mid \\neg m) = 1 - \\text{TN}$.' },
  { id: 'prior-0-1', title: 'A prior of 0 or 1 can never be updated', detail: 'Log-odds $\\pm\\infty$: no finite measurement moves it. Start occupancy cells at 0.5 (log-odds 0).' },
  { id: 'r-vs-q', title: 'R is actuation noise, Q is sensor noise', detail: 'Course (Thrun) notation: $\\bar\\Sigma = A\\Sigma A^T + R$ and $K = \\bar\\Sigma C^T(C\\bar\\Sigma C^T + Q)^{-1}$.' },
  { id: 'markov', title: 'Random noise does not break the Markov assumption', detail: 'Memoryless noise (slip, gusts) is fine; noise or behaviour that depends on history not in the state (a heating sensor, a decaying motor) breaks it.' },
  // Motion models
  { id: 'radians', title: 'Degrees vs radians', detail: 'The velocity model, ωΔt and every trig function in the papers use radians.' },
  { id: 'carry-theta', title: 'Carry θ into the next step', detail: 'Multi-step velocity-model questions: the end heading of one command is the start heading of the next.' },
  { id: 'omega-zero', title: 'ω = 0 is a straight line', detail: 'The arc formula divides by ω; use $x\' = x + v\\Delta t\\cos\\theta$, $y\' = y + v\\Delta t\\sin\\theta$.' },
  { id: 'radius-sign', title: 'Keep the sign of r = v/ω', detail: 'When ω < 0 the radius is negative and the robot turns clockwise.' },
  // Planning
  { id: 'goal-on-insert', title: 'A* stops when the goal is POPPED', detail: 'Not when it is first added to Open: a cheaper path may still be waiting in Open.' },
  { id: 'manhattan-diagonal', title: 'Manhattan overestimates with diagonal or free motion', detail: '(0, 0) to (1, 1): Manhattan 2 > true √2, so it is not admissible in Euclidean space.' },
  { id: 'bfs-weights', title: 'BFS ignores edge costs', detail: 'BFS finds the fewest edges; with unequal costs use Dijkstra or A*.' },
  { id: 'rrt-nearest', title: 'RRT connects to the nearest node; RRT* minimises c(x_near) + d', detail: 'Basic RRT ignores cost-to-come. RRT* picks the cheapest parent, then rewires neighbours that get cheaper through x_new.' },
  { id: 'endpoint-collision', title: 'Checking collisions only at end points', detail: 'The robot sweeps the whole edge or arc: check along it, finer than the smallest obstacle.' },
  { id: 'cspace-band-blob', title: 'C-space: link-1 bands vs link-2 blobs', detail: 'An obstacle inside the L1 circle gives a full-height band (link 1 hits it whatever θ₂ is); outside it gives an isolated blob near θ₂ ≈ 0.' },
  // Kinematics
  { id: 'v-cross-sign', title: 'v = −ω × q, not ω × q', detail: 'Equivalently $v = q \\times \\omega$. Flipping ω flips v.' },
  { id: 'diagonal-axis', title: 'An axis drawn diagonally points into or out of the page', detail: 'Read which way x̂ or ŷ points before writing M; check $\\hat x_b \\times \\hat y_b = \\hat z_b$ and det R = +1.' },
  { id: 'b-frame-q', title: '{b}-frame screws: measure q from the {b} origin, in {b} axes', detail: '$B_i = \\mathrm{Ad}_{M^{-1}} S_i$: ω and q are written in {b} coordinates.' },
  // Perception
  { id: 'depth-from-camera', title: 'Depth is measured from the camera along its optical axis', detail: 'Not from the robot base: get the camera position from p in M and its viewing direction from ẑ_b.' },
  { id: 'extrinsic-pose', title: '3-D position and orientation are extrinsic', detail: 'Intrinsics: focal length, pixel scale, principal point, skew, distortion.' },
  // RL
  { id: 'mdp-tuple', title: 'The MDP tuple is (S, A, T, R, γ)', detail: 'Timestep, return, policy and sensor model are not in it.' },
  // Generic answer-checking traps (src/engine/check.ts)
  { id: 'units', title: 'Unit slip', detail: 'An answer off by a fixed conversion factor usually means a unit was not converted.' },
  { id: 'unit-scale', title: 'Unit scale (mm vs m)', detail: 'An answer off by 10³ usually means a unit slipped; convert to metres before the pinhole formula.' },
  { id: 'percent', title: 'Percent vs fraction', detail: 'Off by 100: give a probability as a fraction unless the question asks for %.' },
  { id: 'sqrt', title: 'Missing or extra square root', detail: 'e.g. quoting a variance instead of a standard deviation.' },
  { id: 'sign', title: 'Sign convention', detail: 'Right magnitude, wrong sign: check the positive directions you chose (and v = −ω × q).' },
  { id: 'factor2', title: 'Factor of 2', detail: 'Check halves and doubles in the set-up.' },
  { id: 'symmetry', title: 'Covariance matrices are symmetric', detail: '$\\Sigma_{ij} = \\Sigma_{ji}$.' },
  { id: 'offdiag-sign', title: 'Off-diagonal sign', detail: 'The sign of a coupling term follows your coordinate directions.' },
  { id: 'offdiag-factor2', title: 'Off-diagonal factor of 2', detail: 'A cross term appears twice in a quadratic form.' },
  { id: 'read-the-stem', title: 'TRUE vs FALSE vs NOT', detail: 'Re-read the instruction before choosing: many MCQs ask for the false statement.' },
];

const extra = new Map<string, TrapDef>();

export function registerTraps(defs: TrapDef[] | undefined) {
  for (const d of defs || []) if (!extra.has(d.id)) extra.set(d.id, d);
}

/** Look up a trap; an unknown id still gets a readable title, so a logged trap never disappears. */
export function trapById(id: string): TrapDef | undefined {
  return CORE_TRAPS.find((t) => t.id === id) || extra.get(id) || (id ? { id, title: id.replace(/[-_]/g, ' ').replace(/^./, (c) => c.toUpperCase()) } : undefined);
}

export function allTraps(): TrapDef[] {
  return [...CORE_TRAPS, ...extra.values()];
}
