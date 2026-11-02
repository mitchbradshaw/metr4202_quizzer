// RRT vs RRT* by hand (plan-rrtstar): the 2025 Q29 template on a random tree. Basic RRT's parent (nearest),
// RRT*'s parent (smallest cost-to-come), c(x_new), then the rewire test for every other neighbour.
// The tree, its printed edge lengths and the distance table all come from one random instance
// (explore/rrtHandModel.ts); every length is rounded to 0.1 before any arithmetic, as on the paper.
import type { ChoicePart, NumericPart, SolveGenerator, SolvePart, Tier } from '../../../engine/types';
import { analyse, costSum, f1, randomScene, vx, type HandNode, type HandResult, type SceneSpec } from '../explore/rrtHandModel';
import { rrtTreeFigure } from '../explore/rrtFigures';
import { registerTraps } from '../../../engine/traps';

// The by-hand RRT* mistakes that have no core trap (the trap log shows them with this title and detail).
registerTraps([
  { id: 'rrt-cost-to-come', title: 'c(x) is the whole path back to the root', detail: 'The cost-to-come of a vertex adds **every** edge from $x_0$ to it, not just its last edge.' },
  { id: 'rrt-rewire-direction', title: 'Rewire starts from c(x_new)', detail: 'Rewire $x_{near}$ if $c(x_{new}) + d(x_{new}, x_{near}) < c(x_{near})$. Re-using the choose-parent total $c(x_{near}) + d$ tests the wrong direction.' },
  { id: 'rrt-descendants', title: 'A rewired vertex takes its subtree with it', detail: 'Every vertex below a rewired one saves the same amount: its path to the root now runs through $x_{new}$.' },
]);

const SPEC: Record<Tier, SceneSpec> = {
  1: { neighbours: [3, 3], rewires: [0, 2], descendant: false, size: [8, 11] },
  2: { neighbours: [4, 4], rewires: [0, 2], descendant: false, size: [10, 13] },
  3: { neighbours: [4, 5], rewires: [1, 2], descendant: true, size: [10, 13] },
};

/** Exact 1-d.p. answers: ±0.3 % (the checker's floor) or ±0.01, whichever is larger. */
const TIGHT = { tol: 0.001, absTol: 0.01 };

/** Keep the traps that differ from the answer (a trap equal to the answer would be meaningless). */
function traps(answer: number, list: { value: number; message: string; trapId?: string }[]) {
  const seen = new Set<string>();
  return list.filter((t) => {
    const k = t.value.toFixed(3);
    if (!Number.isFinite(t.value) || Math.abs(t.value - answer) < 0.05 || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export const generators: SolveGenerator[] = [
  {
    id: 'plan-rrtstar',
    title: 'RRT vs RRT*: choose parent and rewire',
    summary: 'A partly built tree, a new sample and its neighbourhood: basic RRT’s parent, RRT*’s parent and $c(x_{new})$, then the rewire test for every other neighbour.',
    tiers: [1, 2, 3],
    source: 'Similar to 2025 Q29; 2023 Q32(d, e); summary notes §5 “RRT* by hand”',
    cardId: 'plan-rrtstar',
    marks: 10,
    sprint: false,
    generate(rng, tier) {
      const { scene, descendant } = randomScene(rng, SPEC[tier]);
      const res = analyse(scene);
      const nodes = scene.nodes;
      const L = (id: number) => nodes[id].label;
      const X = (id: number) => `$${vx(L(id))}$`;
      const nb = res.neighbours;
      const nearest = res.nearest!;
      const parent = res.parent!;
      const row = (id: number) => nb.find((n) => n.id === id)!;
      const pr = row(parent);
      const nr = row(nearest);
      const rewired = res.rewires.filter((r) => r.rewire);
      const showCosts = tier === 1;
      const desc = descendant !== null ? res.descendants.find((d) => d.id === descendant) ?? null : null;

      const figure = rrtTreeFigure(scene, { descendant });

      // ---------------------------------------------------------------- prompt
      const table = showCosts
        ? `$$\\begin{array}{c|c|c} \\text{vertex } x & d(x, x_{new}) & c(x) \\\\ \\hline ${nb.map((n) => `${vx(L(n.id))} & ${f1(n.d)} & ${f1(n.c)}`).join(' \\\\ ')} \\end{array}$$`
        : `$$\\begin{array}{c|c} \\text{vertex } x & d(x, x_{new}) \\\\ \\hline ${nb.map((n) => `${vx(L(n.id))} & ${f1(n.d)}`).join(' \\\\ ')} \\end{array}$$`;
      const descTxt =
        desc !== null
          ? ` The vertex $${vx(L(desc.id))}$ lies outside the neighbourhood, below $${vx(L(desc.from))}$.`
          : '';
      const prompt = [
        `A robot arm plans its motion with a rapidly exploring random tree. The figure shows part of the tree, rooted at $x_0$, with the lengths of the relevant edges printed (drawn roughly to scale, but use the printed numbers). A new configuration $x_{new}$ has just been sampled. The shaded circle is its connection neighbourhood (radius $r$ = ${f1(scene.radius)}), and the table gives the distance from each tree vertex inside it to $x_{new}$${showCosts ? ', together with that vertex’s cost-to-come $c(x)$ from the root' : ''}.${descTxt} Assume every candidate edge is collision-free.`,
        table,
      ].join('\n\n');

      // ---------------------------------------------------------------- parts
      const parts: SolvePart[] = [];
      if (!showCosts) {
        parts.push({
          kind: 'matrix',
          id: 'cost',
          label: 'Start with the cost-to-come $c(x)$ of each vertex in the neighbourhood: the sum of the edge lengths on its path back to $x_0$.',
          answer: nb.map((n) => [n.c]),
          rowLabels: nb.map((n) => X(n.id)),
          colLabels: ['$c(x)$'],
          absTol: 0.01,
          traps: nb.some((n) => n.edges.length > 1)
            ? [{ value: nb.map((n) => [n.edges[n.edges.length - 1] ?? 0]), message: 'Those are only the last edges. $c(x)$ adds **every** edge on the path back to the root $x_0$.', trapId: 'rrt-cost-to-come' }]
            : undefined,
          marks: 1,
        });
      }

      const rrtPart: ChoicePart = {
        kind: 'choice',
        id: 'rrt',
        label: '(a) Basic **RRT**: which vertex does $x_{new}$ connect to?',
        options: nb.map((n) => ({
          text: X(n.id),
          correct: n.id === nearest,
          why:
            n.id === nearest
              ? `Nearest vertex: $d$ = ${f1(n.d)} is the smallest distance in the table. Basic RRT connects to the nearest vertex and ignores the cost-to-come.`
              : n.id === parent
                ? `That is the **RRT*** choice (smallest $c + d$). Basic RRT compares distances only, and ${X(nearest)} is nearer (${f1(nr.d)} < ${f1(n.d)}).`
                : `$d$ = ${f1(n.d)} > ${f1(nr.d)}: not the nearest vertex.`,
        })),
        marks: 2,
      };
      parts.push(rrtPart);

      const starPart: ChoicePart = {
        kind: 'choice',
        id: 'star',
        label: '(b) **RRT***: which vertex becomes the parent of $x_{new}$?',
        options: nb.map((n) => ({
          text: X(n.id),
          correct: n.id === parent,
          why:
            n.id === parent
              ? `$c + d$ = ${f1(n.c)} + ${f1(n.d)} = ${f1(n.total)}, the smallest total: the cheapest path from the root to $x_{new}$.`
              : n.id === nearest
                ? `It is the nearest, but reaching it from the root already costs ${f1(n.c)}: $c + d$ = ${f1(n.c)} + ${f1(n.d)} = ${f1(n.total)} > ${f1(pr.total)}.`
                : `$c + d$ = ${f1(n.c)} + ${f1(n.d)} = ${f1(n.total)} > ${f1(pr.total)}.`,
        })),
        marks: 2,
      };
      parts.push(starPart);

      const cnew: NumericPart = {
        kind: 'numeric',
        id: 'cnew',
        label: '(b) The cost-to-come $c(x_{new})$ with that parent (the distance from $x_0$ to $x_{new}$ through the tree)',
        answer: res.cNew,
        unit: '',
        ...TIGHT,
        traps: traps(res.cNew, [
          { value: res.rrtCost, message: `That is the cost through the nearest vertex ${X(nearest)} (basic RRT’s connection), not the RRT* parent.`, trapId: 'rrt-nearest' },
          { value: pr.d, message: `That is only the last edge $d(${vx(L(parent))}, x_{new})$. Add the parent’s own cost-to-come $c(${vx(L(parent))})$ = ${f1(pr.c)}.` },
          { value: pr.c, message: `That is $c(${vx(L(parent))})$ alone. Add the new edge $d(${vx(L(parent))}, x_{new})$ = ${f1(pr.d)}.` },
        ]),
        marks: 1,
      };
      parts.push(cnew);

      if (tier >= 2) {
        for (const w of res.rewires) {
          const n = row(w.id);
          parts.push({
            kind: 'numeric',
            id: `via-${L(w.id)}`,
            label: `(c) Cost of reaching ${X(w.id)} through $x_{new}$: $c(x_{new}) + d(x_{new}, ${vx(L(w.id))})$`,
            answer: w.via,
            unit: '',
            ...TIGHT,
            traps: traps(w.via, [
              { value: n.total, message: `That is the choose-parent total $c(${vx(L(w.id))}) + d$. For rewiring, start from $c(x_{new})$ = ${f1(res.cNew)} and add $d(x_{new}, ${vx(L(w.id))})$ = ${f1(n.d)}.`, trapId: 'rrt-rewire-direction' },
              { value: n.d, message: `That is only the edge length. Add $c(x_{new})$ = ${f1(res.cNew)}.` },
            ]),
            marks: 0.5,
          });
          const yesWhy = w.rewire
            ? `Yes: ${f1(w.via)} < ${f1(w.current)} = $c(${vx(L(w.id))})$. Its old parent edge is removed and $x_{new}$ becomes its parent, so its cost drops to ${f1(w.via)}.`
            : `Rewiring needs $c(x_{new}) + d < c(${vx(L(w.id))})$, and ${f1(w.via)} ${w.equal ? '=' : '>'} ${f1(w.current)}.`;
          const noWhy = w.rewire
            ? `${f1(w.via)} < ${f1(w.current)}: the path through $x_{new}$ is shorter, so RRT* rewires it.`
            : `No: ${f1(w.via)} ${w.equal ? '=' : '≥'} ${f1(w.current)}, so going through $x_{new}$ would not make it cheaper. It keeps its parent.`;
          parts.push({
            kind: 'choice',
            id: `rw-${L(w.id)}`,
            label: `Is ${X(w.id)} rewired, so that $x_{new}$ becomes its parent?`,
            options: [
              { text: 'Yes', correct: w.rewire, why: yesWhy },
              { text: 'No', correct: !w.rewire, why: noWhy },
            ],
            marks: 0.5,
          });
        }
        parts.push(edgesPart(nodes, res, X));
      }

      if (desc) {
        parts.push({
          kind: 'numeric',
          id: 'desc',
          label: `${X(desc.id)} hangs below ${X(desc.from)}, outside the neighbourhood. What is $c(${vx(L(desc.id))})$ after the rewire?`,
          answer: desc.now,
          unit: '',
          ...TIGHT,
          traps: traps(desc.now, [
            { value: desc.old, message: `Its path to the root runs through ${X(desc.from)}, so it inherits the same saving of ${f1(desc.old - desc.now)}. Descendants of a rewired vertex get cheaper too.`, trapId: 'rrt-descendants' },
          ]),
          marks: 1,
        });
      }

      // ---------------------------------------------------------------- hints
      const costLines = nb.map((n) => `$c(${vx(L(n.id))}) = ${costSum(n.edges)}$`).join(', ');
      const totals = nb.map((n) => `${vx(L(n.id))}: ${f1(n.c)} + ${f1(n.d)} = ${f1(n.total)}`).join(',\\quad ');
      const parentTable = `$$\\begin{array}{c|c|c|c} x & d(x, x_{new}) & c(x) & c(x) + d \\\\ \\hline ${nb
        .map((n) => `${vx(L(n.id))} & ${f1(n.d)} & ${f1(n.c)} & ${n.id === parent ? `\\mathbf{${f1(n.total)}}` : f1(n.total)}`)
        .join(' \\\\ ')} \\end{array}$$`;
      const rewireTable = `$$\\begin{array}{c|c|c|c} x & c(x_{new}) + d(x_{new}, x) & c(x) & \\text{rewire?} \\\\ \\hline ${res.rewires
        .map((w) => `${vx(L(w.id))} & ${f1(res.cNew)} + ${f1(row(w.id).d)} = ${f1(w.via)} & ${f1(w.current)} & ${w.rewire ? '\\textbf{yes}' : '\\text{no}'}`)
        .join(' \\\\ ')} \\end{array}$$`;
      const result =
        rewired.length === 0
          ? 'No neighbour gets cheaper through $x_{new}$, so **nothing is rewired**.'
          : rewired
              .map(
                (w) =>
                  `${oldEdgeText(nodes, w.id)} is replaced by $x_{new}$–$${vx(L(w.id))}$: $c(${vx(L(w.id))})$ drops from ${f1(w.current)} to **${f1(w.via)}** (a saving of ${f1(w.current - w.via)}).`
              )
              .join(' ') + ' Every vertex below a rewired one saves the same amount.';

      const hints: [string, string, string, string] = [
        'Basic RRT joins $x_{new}$ to the **nearest** vertex and never looks at path length. RRT* first **chooses the parent** that gives $x_{new}$ the cheapest path from the root, then **rewires**: any other neighbour that becomes cheaper by going through $x_{new}$ gets $x_{new}$ as its new parent, and its whole subtree gets cheaper with it.',
        `${showCosts ? '' : 'First write the cost-to-come $c(x)$ of every neighbour (add the edges back to $x_0$). '}Basic RRT: $\\arg\\min_{x} d(x, x_{new})$. RRT* choose parent: $$x_{parent} = \\arg\\min_{x \\in X_{near}} \\big[c(x) + d(x, x_{new})\\big], \\qquad c(x_{new}) = c(x_{parent}) + d(x_{parent}, x_{new})$$${tier >= 2 ? ' Rewire each other neighbour $x_{near}$ if $$c(x_{new}) + d(x_{new}, x_{near}) < c(x_{near})$$' : ''}`,
        `${showCosts ? '' : `Cost-to-come: ${costLines}. `}Nearest: ${X(nearest)} ($d$ = ${f1(nr.d)}). Totals $c + d$: $${totals}$.${tier >= 2 ? ` With $c(x_{new})$ = ${f1(res.cNew)}, the rewire candidates are ${res.rewires.map((w) => `$${vx(L(w.id))}$: ${f1(res.cNew)} + ${f1(row(w.id).d)} = ${f1(w.via)} vs ${f1(w.current)}`).join('; ')}.` : ''}`,
        [
          parentTable,
          `(a) Basic RRT connects to **${X(nearest)}** (nearest, $d$ = ${f1(nr.d)}). (b) RRT* connects to **${X(parent)}**, giving **$c(x_{new})$ = ${f1(res.cNew)}** (basic RRT’s connection would cost ${f1(res.rrtCost)}).`,
          ...(tier >= 2 ? [`(c) Rewire test for the other neighbours (${X(parent)} is the parent, so it is skipped):`, rewireTable, result] : []),
          ...(desc ? [`${X(desc.id)} sits below ${X(desc.from)}: $c(${vx(L(desc.id))})$ = ${f1(desc.old)} − ${f1(desc.old - desc.now)} = **${f1(desc.now)}**.`] : []),
        ].join('\n\n'),
      ];

      return {
        prompt,
        givens: [{ sym: 'r', value: f1(scene.radius), label: 'neighbourhood radius' }],
        figure,
        parts,
        hints,
      };
    },
  },
];

/** "the edge x_c–x_d" (or "x_d’s old parent edge" when the parent is unlabelled). */
function oldEdgeText(nodes: readonly HandNode[], id: number): string {
  const p = nodes[id].parent;
  const pl = p >= 0 ? nodes[p].label : '';
  return pl ? `The edge $${vx(pl)}$–$${vx(nodes[id].label)}$` : `The old parent edge of $${vx(nodes[id].label)}$`;
}

function edgeName(nodes: readonly HandNode[], id: number): string {
  const p = nodes[id].parent;
  const pl = p >= 0 ? nodes[p].label : '';
  return pl ? `$${vx(pl)}$–$${vx(nodes[id].label)}$` : `the old parent edge of $${vx(nodes[id].label)}$`;
}

/** "What changes in the tree?" with distractors built from this instance. */
function edgesPart(nodes: readonly HandNode[], res: HandResult, X: (id: number) => string): ChoicePart {
  const rewired = res.rewires.filter((r) => r.rewire);
  const parent = res.parent!;
  const L = (id: number) => nodes[id].label;
  const add = (ids: number[]) => ids.map((id) => `$x_{new}$–$${vx(L(id))}$`).join(' and ');
  const remove = (ids: number[]) => ids.map((id) => edgeName(nodes, id)).join(' and ');
  const options: ChoicePart['options'] = [];
  if (rewired.length) {
    const ids = rewired.map((r) => r.id);
    options.push({
      text: `Remove ${remove(ids)}; add ${add(ids)}`,
      correct: true,
      why: `Each rewired vertex swaps its old parent edge for an edge from $x_{new}$; a tree vertex has exactly one parent.`,
    });
    options.push({
      text: `Add ${add(ids)} and keep ${remove(ids)}`,
      correct: false,
      why: 'A tree vertex has exactly one parent. Keeping the old edge as well would create a loop (a graph, not a tree).',
    });
    options.push({
      text: `Remove the edge ${X(parent)}–$x_{new}$ and connect $x_{new}$ to ${X(ids[0])} instead`,
      correct: false,
      why: 'Rewiring never changes the parent of $x_{new}$ (chosen in the previous step); it changes the parents of the neighbours.',
    });
    options.push({
      text: 'No change: the tree keeps all its edges',
      correct: false,
      why: `${X(ids[0])} is cheaper through $x_{new}$ (${f1(rewired[0].via)} < ${f1(rewired[0].current)}), so it is rewired.`,
    });
  } else {
    const closest = [...res.rewires].sort((a, b) => a.via - a.current - (b.via - b.current))[0];
    options.push({
      text: 'No change: no other neighbour is cheaper through $x_{new}$',
      correct: true,
      why: `Every rewire test fails (${res.rewires.map((w) => `${f1(w.via)} ≥ ${f1(w.current)}`).join(', ')}), so the only new edge is the one from the parent to $x_{new}$.`,
    });
    if (closest)
      options.push({
        text: `Remove ${edgeName(nodes, closest.id)}; add $x_{new}$–$${vx(L(closest.id))}$`,
        correct: false,
        why: `${X(closest.id)} would cost ${f1(closest.via)} through $x_{new}$, not less than its current ${f1(closest.current)}.`,
      });
    options.push({
      text: 'Make $x_{new}$ the parent of every other neighbour',
      correct: false,
      why: 'Only neighbours that become strictly cheaper through $x_{new}$ are rewired.',
    });
    options.push({
      text: `Remove ${X(parent)}–$x_{new}$ and connect $x_{new}$ to the nearest vertex`,
      correct: false,
      why: 'That would undo the choose-parent step. RRT* keeps the cheapest parent.',
    });
  }
  return { kind: 'choice', id: 'edges', label: '(c) So what changes in the tree?', options, marks: 1 };
}
