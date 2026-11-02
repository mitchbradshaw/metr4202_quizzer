// Pure helpers behind the A*-by-hand activities (sim "astar", generator "plan-astar", their self-tests):
// turn a core graphSearch trace into the exam's Open / Closed tables, explain each step in words, and
// judge a student's pop or typed value with the reason. No React here.
//
// Exam table format (2024 Q29): Open | Priority | Parent and Closed | Cost | Parent, one pair per step;
// the priority is written g + h = f. The goal test happens when the goal is POPPED.
import { graphSearch, type Algo, type NeighbourUpdate, type Neighbours, type SearchResult, type WeightedGraph, neighboursOf } from '../../../core/graph';
import type { Rich } from '../../../engine/types';

export interface OpenRow {
  node: string;
  /** Cost to arrive from the start along the parent chain. */
  g: number;
  h: number;
  /** g + h (whatever the algorithm ranks by). */
  f: number;
  /** What the algorithm ranks by: g + h (A*), g (Dijkstra), h (greedy), queue order (BFS). */
  prio: number;
  parent: string | null;
  /** Insertion counter: FIFO tie-breaks and the BFS queue. */
  seq: number;
  /** What the step that produced this table did to the row. */
  change: 'new' | 'improved' | null;
  /** For improved rows: the entry it replaced. */
  oldG?: number;
  oldParent?: string | null;
}

export interface ClosedRow {
  node: string;
  g: number;
  parent: string | null;
}

export interface StepUpdate extends NeighbourUpdate {
  /** Parent before this step (improve / worse). */
  oldParent?: string | null;
  /** Edge cost from the popped node. */
  cost: number;
}

export interface ExamStep {
  /** 1-based step number (= number of pops so far). */
  k: number;
  popped: string;
  /** The popped node's row at the moment it was popped. */
  row: OpenRow;
  /** Open just before the pop, in pop order (row = before[0]). */
  before: OpenRow[];
  /** Other Open nodes with exactly the same priority as the popped one. */
  ties: string[];
  updates: StepUpdate[];
  /** Open after the step, in the order it will be popped. */
  open: OpenRow[];
  /** Closed after the step, in the order nodes were closed. */
  closed: ClosedRow[];
  isGoal: boolean;
}

export interface ExamTrace {
  algo: Algo;
  start: string;
  goal: string;
  initial: OpenRow[];
  steps: ExamStep[];
  path: string[] | null;
  cost: number;
  /** When the goal first entered Open (to show why the test is at the pop). */
  goalAdded: { k: number; g: number; parent: string } | null;
}

/** Strip floating-point noise for display: 7.800000000001 → "7.8", 2600 → "2600". */
export function num(x: number): string {
  if (!Number.isFinite(x)) return x > 0 ? '∞' : '—';
  const s = String(Number(x.toFixed(4)));
  return s === '-0' ? '0' : s;
}

const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

/** Build the exam tables for every step of a search. */
export function examTrace(res: SearchResult, algo: Algo, start: string, goal: string, nb: Neighbours): ExamTrace {
  const toRow = (e: SearchResult['initialOpen'][number], change: OpenRow['change'] = null, old?: { g: number; parent: string | null }): OpenRow => ({
    node: e.node,
    g: e.g,
    h: e.h,
    f: e.g + e.h,
    prio: e.f,
    parent: e.parent,
    seq: e.seq,
    change,
    ...(old ? { oldG: old.g, oldParent: old.parent } : {}),
  });
  const initial = res.initialOpen.map((e) => toRow(e));
  const steps: ExamStep[] = [];
  let before = initial;
  let goalAdded: ExamTrace['goalAdded'] = null;
  res.steps.forEach((s, i) => {
    const prevByNode = new Map(before.map((r) => [r.node, r]));
    const added = new Set(s.updates.filter((u) => u.kind === 'add').map((u) => u.node));
    const improved = new Map(s.updates.filter((u) => u.kind === 'improve').map((u) => [u.node, u]));
    const open = s.open.map((e) => {
      if (added.has(e.node)) return toRow(e, 'new');
      const imp = improved.get(e.node);
      if (imp) {
        const old = prevByNode.get(e.node);
        return toRow(e, 'improved', { g: imp.oldG ?? old?.g ?? NaN, parent: old?.parent ?? null });
      }
      return toRow(e);
    });
    const costs = new Map(nb(s.expanded).map(([n, w]) => [n, w]));
    const updates: StepUpdate[] = s.updates.map((u) => {
      const prev = prevByNode.get(u.node);
      const closedPrev = s.closed.find((c) => c.node === u.node);
      return { ...u, cost: costs.get(u.node) ?? NaN, oldParent: u.kind === 'closed' ? closedPrev?.parent ?? null : prev?.parent };
    });
    for (const u of s.updates) if (u.node === goal && u.kind === 'add' && !goalAdded) goalAdded = { k: i + 1, g: u.g, parent: s.expanded };
    const row = before.find((r) => r.node === s.expanded) ?? before[0];
    steps.push({
      k: i + 1,
      popped: s.expanded,
      row,
      before,
      ties: before.filter((r) => r.node !== s.expanded && near(r.prio, row.prio)).map((r) => r.node),
      updates,
      open,
      closed: s.closed.map((c) => ({ node: c.node, g: c.g, parent: c.parent })),
      isGoal: s.isGoal,
    });
    before = open;
  });
  return { algo, start, goal, initial, steps, path: res.path, cost: res.cost, goalAdded };
}

/** Run a search on a road map and build its exam tables in one go. */
export function runExam(graph: WeightedGraph, start: string, goal: string, algo: Algo, h: (n: string) => number): ExamTrace {
  const nb = neighboursOf(graph);
  return examTrace(graphSearch(nb, start, goal, algo, { h }), algo, start, goal, nb);
}

/** Open after `i` pops (i = 0: just the start). */
export const openAt = (t: ExamTrace, i: number): OpenRow[] => (i <= 0 ? t.initial : t.steps[Math.min(i, t.steps.length) - 1].open);
/** Closed after `i` pops. */
export const closedAt = (t: ExamTrace, i: number): ClosedRow[] => (i <= 0 ? [] : t.steps[Math.min(i, t.steps.length) - 1].closed);

/** The algorithm's priority as words, for explanations. */
export const RANK_WORDS: Record<Algo, string> = {
  astar: 'the lowest $f = g + h$',
  dijkstra: 'the lowest cost so far $g$',
  greedy: 'the lowest heuristic $h$',
  bfs: 'the oldest node in the queue (first in, first out)',
  dfs: 'the newest node on the stack (last in, first out)',
};

/** "g + h = f" for A*, or the single quantity the algorithm ranks by. */
export function prioText(r: Pick<OpenRow, 'g' | 'h' | 'f' | 'prio'>, algo: Algo): string {
  if (algo === 'astar') return `${num(r.g)} + ${num(r.h)} = ${num(r.f)}`;
  if (algo === 'dijkstra') return num(r.g);
  if (algo === 'greedy') return num(r.h);
  return `#${num(r.prio + 1)}`;
}

/** Path cost spelled out: 3.1 + 1.0 + 9.7 = 13.8. */
export function pathSum(graph: WeightedGraph, path: readonly string[]): { terms: number[]; total: number; text: string } {
  const nb = neighboursOf(graph);
  const terms: number[] = [];
  for (let i = 1; i < path.length; i++) terms.push(nb(path[i - 1]).find(([n]) => n === path[i])?.[1] ?? NaN);
  const total = terms.reduce((a, b) => a + b, 0);
  return { terms, total, text: `${terms.map(num).join(' + ')} = ${num(total)}` };
}

// ------------------------------------------------------------------ words for each step

export type NameOf = (id: string) => string;

/** One Rich line per neighbour: what happened to it and why. */
export function updateLine(u: StepUpdate, step: ExamStep, algo: Algo, name: NameOf): Rich {
  const P = name(step.popped);
  const Y = `**${name(u.node)}**`;
  const gExpr = `$g = ${num(step.row.g)} + ${num(u.cost)} = ${num(u.g)}$`;
  const fExpr = algo === 'astar' ? `, $f = ${num(u.g)} + ${num(u.h)} = ${num(u.f)}$` : '';
  switch (u.kind) {
    case 'closed':
      return `${Y}: already in Closed (its cost ${num(u.oldG ?? NaN)} is final), so skip it.`;
    case 'add':
      return `${Y}: new. Via ${P}, ${gExpr}${fExpr}; parent ${P}.`;
    case 'improve':
      return `${Y}: already in Open with $g = ${num(u.oldG ?? NaN)}$ (parent ${name(u.oldParent ?? '?')}). Via ${P}, ${gExpr} is **cheaper**, so its parent becomes ${P}${fExpr}.`;
    case 'worse':
      if (algo === 'bfs' || algo === 'dfs') return `${Y}: already in the ${algo === 'bfs' ? 'queue' : 'stack'}, so it is left alone (${algo === 'bfs' ? 'BFS' : 'DFS'} ignores road lengths).`;
      return `${Y}: via ${P} would be ${gExpr}, not cheaper than its current $g = ${num(u.oldG ?? NaN)}$, so no change.`;
  }
}

/** Why this node was popped. */
export function popLine(step: ExamStep, algo: Algo, name: NameOf, goal: string): Rich {
  const P = `**${name(step.popped)}**`;
  const r = step.row;
  const val =
    algo === 'astar'
      ? `$f = ${num(r.g)} + ${num(r.h)} = ${num(r.f)}$`
      : algo === 'dijkstra'
        ? `$g = ${num(r.g)}$`
        : algo === 'greedy'
          ? `$h = ${num(r.h)}$`
          : 'the front of the queue';
  const next = step.before.find((x) => x.node !== step.popped);
  const nextTxt =
    next && algo !== 'bfs' && algo !== 'dfs'
      ? ` (next best: ${name(next.node)} with ${algo === 'astar' ? `$f = ${num(next.f)}$` : algo === 'dijkstra' ? `$g = ${num(next.g)}$` : `$h = ${num(next.h)}$`})`
      : '';
  const tie = step.ties.length ? ` It ties with ${step.ties.map(name).join(', ')}; ties go to whichever entered Open first.` : '';
  const why =
    algo === 'bfs' || algo === 'dfs' ? `it is next in line (${RANK_WORDS[algo]})` : `${val}, ${RANK_WORDS[algo]} in Open${nextTxt}`;
  if (step.isGoal) return `Pop ${P}: ${why}. It is the **goal**, so the search **stops** here.${tie}`;
  const goalOpen = step.before.some((x) => x.node === goal);
  const wait = goalOpen ? ` The goal ${name(goal)} is already in Open, but it is not popped yet, so keep going.` : '';
  return `Pop ${P}: ${why}. Move it to Closed with $g = ${num(r.g)}$.${tie}${wait}`;
}

// ------------------------------------------------------------------ "you drive": judging the student

export interface PopVerdict {
  ok: boolean;
  /** The pick ties with the official pop (accepted; the run continues with the official one). */
  tie?: boolean;
  message: Rich;
  /** Named mistake, for scoring and trap logs. */
  trap?: 'closed' | 'unseen' | 'goal-early' | 'lowest-g' | 'lowest-h' | 'not-lowest';
}

/** Judge "which node is popped next?" before step `step.k`. */
export function judgePop(step: ExamStep, pick: string, algo: Algo, name: NameOf, goal: string): PopVerdict {
  const P = name(step.popped);
  const pickRow = step.before.find((r) => r.node === pick);
  const best = step.row;
  const val = (r: OpenRow) => (algo === 'astar' ? `$f = ${num(r.f)}$` : algo === 'dijkstra' ? `$g = ${num(r.g)}$` : algo === 'greedy' ? `$h = ${num(r.h)}$` : `queue place ${num(r.prio + 1)}`);
  if (pick === step.popped) {
    const why =
      algo === 'bfs' || algo === 'dfs'
        ? `it has been waiting longest (${RANK_WORDS[algo]}).`
        : `it has ${RANK_WORDS[algo]} in Open, ${val(best)}.`;
    return { ok: true, message: `Right: **${P}** is popped because ${why}${step.isGoal ? ' It is the goal, so the search stops.' : ''}` };
  }
  if (!pickRow) {
    if (closedBefore(step).has(pick))
      return { ok: false, trap: 'closed', message: `**${name(pick)}** is already in Closed: it was expanded earlier and its cost is final. A node is never popped twice.` };
    return { ok: false, trap: 'unseen', message: `**${name(pick)}** is not in Open yet: no expanded node has a road to it. Only Open nodes can be popped.` };
  }
  if (near(pickRow.prio, best.prio) && algo !== 'bfs' && algo !== 'dfs')
    return {
      ok: true,
      tie: true,
      message: `**${name(pick)}** ties with **${P}** (${val(best)}). Either is fine in the exam; this run breaks ties by whichever entered Open first, so it pops **${P}**.`,
    };
  if (pick === goal && algo !== 'bfs')
    return {
      ok: false,
      trap: 'goal-early',
      message: `**${name(pick)}** is the goal and it is in Open, but its ${val(pickRow)} is not the lowest: **${P}** has ${val(best)}. The search only stops when the goal is **popped**; a cheaper route through ${P} might still exist.`,
    };
  if (algo === 'astar') {
    const minG = Math.min(...step.before.map((r) => r.g));
    const minH = Math.min(...step.before.map((r) => r.h));
    if (near(pickRow.g, minG))
      return {
        ok: false,
        trap: 'lowest-g',
        message: `**${name(pick)}** has the lowest $g$ (cheapest to reach so far), but A* ranks by $f = g + h$: ${name(pick)} has $f = ${num(pickRow.f)}$, ${P} has $f = ${num(best.f)}$. Lowest $g$ is Dijkstra's rule.`,
      };
    if (near(pickRow.h, minH))
      return {
        ok: false,
        trap: 'lowest-h',
        message: `**${name(pick)}** looks closest to the goal (lowest $h$), but that is greedy best-first. A* adds the cost already paid: ${name(pick)} has $f = ${num(pickRow.f)}$, ${P} has $f = ${num(best.f)}$.`,
      };
  }
  if (algo === 'bfs')
    return { ok: false, trap: 'not-lowest', message: `BFS pops in arrival order, not by cost: **${P}** entered the queue before **${name(pick)}**.` };
  return { ok: false, trap: 'not-lowest', message: `**${name(pick)}** has ${val(pickRow)}, but **${P}** has ${val(best)}. Always pop ${RANK_WORDS[algo]}.` };
}

function closedBefore(step: ExamStep): Set<string> {
  const s = new Set(step.closed.map((c) => c.node));
  s.delete(step.popped);
  return s;
}

/** A neighbour whose Open entry the student must write after the pop (closed neighbours are skipped). */
export interface ExpectedEntry {
  node: string;
  kind: 'add' | 'improve' | 'worse';
  /** Value in Open after the step: f for A*, g for Dijkstra. */
  value: number;
  /** g and parent in Open after the step. */
  g: number;
  h: number;
  parent: string | null;
  /** Value the student gets if they always overwrite (worse) or never update (improve). */
  wrongValue: number;
  explain: Rich;
}

/** Which quantity the student types for each neighbour (none for greedy/BFS: their priority needs no arithmetic). */
export const typedQuantity = (algo: Algo): 'f' | 'g' | null => (algo === 'astar' ? 'f' : algo === 'dijkstra' ? 'g' : null);

export function expectedEntries(step: ExamStep, algo: Algo, name: NameOf): ExpectedEntry[] {
  const q = typedQuantity(algo);
  const out: ExpectedEntry[] = [];
  for (const u of step.updates) {
    if (u.kind === 'closed') continue;
    const row = step.open.find((r) => r.node === u.node);
    const g = row ? row.g : u.g;
    const value = q === 'g' ? g : g + u.h;
    const newValue = q === 'g' ? u.g : u.g + u.h;
    const oldValue = q === 'g' ? u.oldG ?? NaN : (u.oldG ?? NaN) + u.h;
    out.push({
      node: u.node,
      kind: u.kind,
      value,
      g,
      h: u.h,
      parent: row?.parent ?? null,
      wrongValue: u.kind === 'worse' ? newValue : u.kind === 'improve' ? oldValue : NaN,
      explain: updateLine(u, step, algo, name),
    });
  }
  return out;
}

/** Tolerance used for typed table values: 1 % or 0.05 absolute, whichever is larger. */
export const valueOk = (typed: number, ans: number) => Number.isFinite(typed) && Math.abs(typed - ans) <= Math.max(0.01 * Math.abs(ans), 0.05);

export function judgeEntry(e: ExpectedEntry, typed: number, algo: Algo, name: NameOf): { ok: boolean; message: Rich } {
  const q = typedQuantity(algo) ?? 'f';
  if (valueOk(typed, e.value)) return { ok: true, message: `✓ ${e.explain}` };
  if (Number.isFinite(e.wrongValue) && valueOk(typed, e.wrongValue)) {
    if (e.kind === 'worse')
      return { ok: false, message: `✗ ${name(e.node)}: you replaced its entry with a **worse** route. Keep the cheaper one: $${q} = ${num(e.value)}$. ${e.explain}` };
    return { ok: false, message: `✗ ${name(e.node)}: you kept the old entry, but the new route is **cheaper**: $${q} = ${num(e.value)}$. ${e.explain}` };
  }
  if (q === 'f' && valueOk(typed, e.g)) return { ok: false, message: `✗ ${name(e.node)}: that is $g$; the priority adds the heuristic, $f = g + h = ${num(e.g)} + ${num(e.h)} = ${num(e.value)}$.` };
  return { ok: false, message: `✗ ${name(e.node)}: should be $${q} = ${num(e.value)}$. ${e.explain}` };
}

// ------------------------------------------------------------------ TeX tables (worked solutions, prompts)

/** Text inside TeX \text{…}. */
export function texText(s: string): string {
  return s.replace(/[\\{}$&#^_%~]/g, (c) => `\\${c}`);
}

const dash = '\\text{–}';

/** Open table as a TeX array (exam columns: Open | Priority | Parent). */
export function openTeX(rows: readonly OpenRow[], algo: Algo, name: NameOf): string {
  const head = algo === 'astar' ? 'g + h = f' : algo === 'dijkstra' ? 'g' : algo === 'greedy' ? 'h' : '\\#';
  const body = rows.length
    ? rows
        .map((r) => {
          const pr = algo === 'astar' ? `${num(r.g)} + ${num(r.h)} = ${num(r.f)}` : algo === 'dijkstra' ? num(r.g) : algo === 'greedy' ? num(r.h) : num(r.prio + 1);
          const mark = r.change === 'improved' ? `\\ \\downarrow` : '';
          return `\\text{${texText(name(r.node))}} & ${pr}${mark} & ${r.parent ? `\\text{${texText(name(r.parent))}}` : dash}`;
        })
        .join(' \\\\ ')
    : `\\text{(empty)} & & `;
  return `\\begin{array}{l|l|l} \\textbf{Open} & ${head} & \\text{Parent} \\\\ \\hline ${body} \\end{array}`;
}

/** Closed table as a TeX array (exam columns: Closed | Cost | Parent). */
export function closedTeX(rows: readonly ClosedRow[], name: NameOf): string {
  const body = rows.length
    ? rows.map((r) => `\\text{${texText(name(r.node))}} & ${num(r.g)} & ${r.parent ? `\\text{${texText(name(r.parent))}}` : dash}`).join(' \\\\ ')
    : `\\text{(empty)} & & `;
  return `\\begin{array}{l|l|l} \\textbf{Closed} & g & \\text{Parent} \\\\ \\hline ${body} \\end{array}`;
}

/** Both tables side by side, as display maths. */
export function tablesTeX(open: readonly OpenRow[], closed: readonly ClosedRow[], algo: Algo, name: NameOf): string {
  return `$$${openTeX(open, algo, name)} \\qquad ${closedTeX(closed, name)}$$`;
}

/** Heuristic table (the exam's "Table 1") as TeX. */
export function hTableTeX(ids: readonly string[], h: (n: string) => number, name: NameOf, goal: string, unit: string): string {
  const rows = ids.map((n) => `\\text{${texText(name(n))}} & ${num(h(n))}`).join(' \\\\ ');
  return `$$\\begin{array}{l|r} \\text{Node} & h \\text{ (${texText(unit)} to ${texText(name(goal))})} \\\\ \\hline ${rows} \\end{array}$$`;
}

/** Every step of a run, written out as the exam's working (for the worked solution). */
export function workedSteps(t: ExamTrace, name: NameOf): Rich {
  const parts: string[] = [];
  parts.push(`**Start.** Open = {${name(t.start)}}: $g = 0$, $f = 0 + ${num(t.initial[0]?.h ?? 0)} = ${num(t.initial[0]?.f ?? 0)}$. Closed is empty.`);
  for (const s of t.steps) {
    const lines = s.updates.filter((u) => u.kind !== 'closed').map((u) => `- ${updateLine(u, s, t.algo, name)}`);
    parts.push(`**Step ${s.k}.** ${popLine(s, t.algo, name, t.goal)}${lines.length ? `\n\n${lines.join('\n')}` : ''}\n\n${tablesTeX(s.open, s.closed, t.algo, name)}`);
  }
  return parts.join('\n\n');
}
