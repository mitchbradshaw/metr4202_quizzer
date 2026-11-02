// C-space labelling (plan-cspace), the planning short answer of every paper: 2023 Q26 (5 marks), 2024 Q24
// (4 marks), 2025 Q25 (3 marks); review deck slide 16.
//   Tier 1: two obstacles, one crossing the link-1 circle (a band) and one outside it (a blob); 3-4 boxes.
//   Tier 2: three obstacles like the papers (sometimes the actual 2023 / 2024 / 2025 workspace with the
//           paper's own boxes); 4-5 boxes. One answer part per box, checked box by box.
//   Tier 3: review-deck style: match three workspaces to three C-space plots that differ only in which
//           obstacles cross the circle (bands) and which do not (blobs).
// The pure work (regions, where boxes go, the explanations) is in cspaceBoxes.ts; the React figure and
// answer parts are in cspaceLabel.tsx.
import type { Given, SolveGenerator, SolveInstance, SolvePart } from '../../../engine/types';
import type { Rng } from '../../../engine/rng';
import { TAU } from '../../../core/cspace';
import {
  EXAM_SETS,
  boxClue,
  examLabelProblem,
  fkCheck,
  kindLabel,
  letterOf,
  m2,
  matchProblem,
  matchSignature,
  obstacleLine,
  plotStory,
  pt,
  randomLabelProblem,
  workspaceStory,
  type CsProblem,
  type MatchProblem,
} from './cspaceBoxes';
import { makeBoxPart, makeLabelFigure, makeLabelStore, makeMatchFigure, makeMatchPart } from './cspaceLabel';

const FK_TEX =
  '$$\\text{elbow} = \\text{base} + L_1(\\cos\\theta_1, \\sin\\theta_1), \\qquad \\text{tip} = \\text{elbow} + L_2\\big(\\cos(\\theta_1 + \\theta_2), \\sin(\\theta_1 + \\theta_2)\\big)$$';

const ARM_LINE = (l1: number, l2: number) =>
  `base at (5, 5) m, link 1 of length $L_1$ = ${m2(l1)} m (the dashed circle is its reach), link 2 of length $L_2$ = ${m2(l2)} m; $\\theta_1$ is measured from $+x$ and $\\theta_2$ relative to link 1`;

function concept(l1: number): string {
  return `Draw the circle of radius $L_1$ = ${m2(l1)} m around the base (the dashed circle).

- An obstacle that **crosses the circle** can be hit by link 1, whatever $\\theta_2$ is: a **full-height vertical band** over the $\\theta_1$ that point at it, with bulges at its sides where link 2 also hits it.
- An obstacle **wholly outside** the circle can only be hit by link 2: an **isolated blob** at $\\theta_1 \\approx$ the obstacle's direction from the base, usually near $\\theta_2 \\approx 0 \\equiv 2\\pi$ (arm nearly straight) and wrapping between the top and bottom edges.

So read each region's shape (band or blob) and its $\\theta_1$ (direction), then verify one point with forward kinematics.`;
}

/** θ1 directions as TeX for the set-up table (runs through 0 written as two pieces). */
const dirCell = (d: [number, number]) => (d[1] > TAU + 1e-6 ? `${pt(d[0])} \\text{ to } ${pt(d[1] - TAU)} \\text{ (through 0)}` : `${pt(d[0])} \\text{ to } ${pt(d[1])}`);

function obstacleTable(p: CsProblem): string {
  const rows = p.ws.obstacles.map((ob, o) => {
    const inf = p.infos[o];
    return `${ob.label} & ${m2(inf.dNear)}\\text{ m} & ${inf.band ? '< L_1:\\ \\text{band}' : '> L_1:\\ \\text{blob}'} & ${dirCell(inf.dir)}`;
  });
  return `$$\\begin{array}{c|c|c|c} \\text{obstacle} & \\text{nearest point to the base} & \\text{vs } L_1 = ${m2(p.ws.l1)}\\text{ m} & \\text{directions from the base} \\\\ \\hline ${rows.join(' \\\\ ')} \\end{array}$$`;
}

const givensFor = (l1: number, l2: number): Given[] => [
  { sym: 'L_1', value: `${m2(l1)} m`, label: 'link 1 (radius of the dashed circle)' },
  { sym: 'L_2', value: `${m2(l2)} m`, label: 'link 2' },
  { sym: '\\text{base}', value: '(5, 5) m', label: 'joint 1, centre of the workspace' },
];

/** The box whose FK check is the most instructive: a blob or bulge (link 2) if there is one. */
const checkBox = (p: CsProblem) => p.boxes.find((b) => b.kind === 'blob') ?? p.boxes.find((b) => b.kind === 'bulge') ?? p.boxes[0];

function labelInstance(p: CsProblem, tier: 1 | 2): SolveInstance {
  const store = makeLabelStore(p.boxes.length);
  const ws = p.ws;
  const exam = p.exam ? EXAM_SETS[p.exam] : null;
  const intro = exam
    ? `**The ${p.exam} paper (${exam.q}, ${exam.marks} marks).** The workspace of a 2-link arm is shown on the left: ${ARM_LINE(ws.l1, ws.l2)}.`
    : tier === 1
      ? `**Two obstacles.** The workspace of a 2-link arm is shown on the left: ${ARM_LINE(ws.l1, ws.l2)}.`
      : `The workspace of a 2-link arm is shown on the left: ${ARM_LINE(ws.l1, ws.l2)}.`;
  const prompt = `${intro} Its configuration space is on the right (grey = the arm collides). Label each numbered box with the obstacle that causes the region it points at.`;
  const parts: SolvePart[] = p.boxes.map((b, bi) => ({
    kind: 'custom',
    id: `box${b.num}`,
    label: `**Box ${b.num}**, pointing at $(\\theta_1, \\theta_2) \\approx (${pt(b.t1)}, ${pt(b.t2)})$. Which obstacle?`,
    render: makeBoxPart(p, store, bi),
    marks: b.marks,
  }));
  const cb = checkBox(p);
  const answers = p.boxes.map((b) => `- Box ${b.num} $(${pt(b.t1)}, ${pt(b.t2)})$, ${kindLabel(p, b)}: **${letterOf(ws, b.answer)}**`);
  return {
    prompt,
    givens: givensFor(ws.l1, ws.l2),
    figure: makeLabelFigure(p, store),
    parts,
    hints: [
      concept(ws.l1),
      `For each obstacle compare its nearest point to the base with $L_1$, and read the directions it spans from the base (these are the $\\theta_1$ of its region):\n\n${obstacleTable(p)}\n\nTo check a point, use forward kinematics:\n\n${FK_TEX}`,
      `${p.boxes.map((b) => `- ${boxClue(p, b)}`).join('\n')}\n\nCheck one: ${fkCheck(ws, cb.t1, cb.t2, cb.answer)}`,
      `${ws.obstacles.map((_, o) => `- ${obstacleLine(p, o)}`).join('\n')}\n\n${answers.join('\n')}\n\n**Check.** ${fkCheck(ws, cb.t1, cb.t2, cb.answer)}`,
    ],
  };
}

// ------------------------------------------------------------------ tier 3: match workspaces to C-spaces

const W = ['A', 'B', 'C'];

function matchInstance(mp: MatchProblem): SolveInstance {
  const store = makeLabelStore(3);
  const l1 = mp.wss[0].l1;
  const l2 = mp.wss[0].l2;
  const parts: SolvePart[] = mp.wss.map((_, w) => ({
    kind: 'custom',
    id: `ws${W[w]}`,
    label: `Workspace **${W[w]}** goes with C-space plot:`,
    render: makeMatchPart(mp, store, w),
    marks: 1,
  }));
  const sigRows = mp.wss.map((ws, w) => {
    const sig = matchSignature(mp, w);
    return `${W[w]} & ${ws.obstacles.length} & ${sig.bands} & ${sig.blobs}`;
  });
  return {
    prompt: `${mp.deck ? '**The review deck (slide 16).** ' : ''}The three workspaces below (A, B, C) hold the same 2-link arm: ${ARM_LINE(l1, l2)}. Match each workspace to its configuration space (plots 1 to 3).`,
    givens: givensFor(l1, l2),
    figure: makeMatchFigure(mp, store),
    parts,
    hints: [
      `${concept(l1)}\n\nThe plots differ in how many bands and blobs they have and where: count what each workspace must make, then match.`,
      `Per workspace, count the obstacles that cross the dashed circle (bands) and those wholly outside it (blobs):\n\n$$\\begin{array}{c|c|c|c} \\text{workspace} & \\text{obstacles} & \\text{cross the circle (bands)} & \\text{outside (blobs)} \\\\ \\hline ${sigRows.join(' \\\\ ')} \\end{array}$$\n\nWhere the counts tie, compare the $\\theta_1$ of each band or blob with the obstacles' directions from the base.`,
      [0, 1, 2].map((k) => `- ${plotStory(mp, k)}`).join('\n'),
      `${mp.wss.map((_, w) => `- **Workspace ${W[w]}**: ${workspaceStory(mp, w)}. **Plot ${mp.plotOf[w] + 1}.**`).join('\n')}\n\n**Answer:** ${mp.wss.map((_, w) => `${W[w]} → ${mp.plotOf[w] + 1}`).join(', ')}.`,
    ],
  };
}

export function cspaceInstance(rng: Rng, tier: 1 | 2 | 3): SolveInstance {
  if (tier === 3) return matchInstance(matchProblem(rng));
  if (tier === 2 && rng.chance(0.3)) return labelInstance(examLabelProblem(rng.pick([2023, 2024, 2025] as const)), 2);
  return labelInstance(randomLabelProblem(rng, tier), tier);
}

export const generators: SolveGenerator[] = [
  {
    id: 'plan-cspace',
    title: 'Label the C-space of a 2-link arm',
    summary: 'Which obstacle made each grey region? Link 1 makes full-height bands, link 2 makes blobs; $\\theta_1$ is the direction from the base.',
    tiers: [1, 2, 3],
    source: 'Similar to 2023 Q26, 2024 Q24, 2025 Q25 (asked every year, 3-5 marks); review deck slide 16',
    cardId: 'plan-cspace',
    marks: 4,
    generate(rng, tier) {
      return cspaceInstance(rng, tier);
    },
  },
];
