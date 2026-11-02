// "Write down the expansion order" as an exam answer (plan-search-order): the student builds the whole pop
// sequence from S until G is popped, by clicking nodes or typing letters. Unlike an "order these steps" part it
// does not give away WHICH nodes get expanded (the hard part for Dijkstra and A*, which may never expand some).
// A wrong answer is explained at the first slip, with the Open list as it stood at that pop.
import type { ComponentType } from 'react';
import type { CustomPartProps, Rich as RichText } from '../../../engine/types';
import type { Algo, OpenEntry, SearchResult } from '../../../core/graph';
import { usePersisted } from '../../../ui/persist';
import { Button, Callout } from '../../../ui/kit';
import { Rich } from '../../../ui/Rich';
import '../astar.css';

export interface SeqSpec {
  algo: Algo;
  /** The reference run (core graphSearch). */
  run: SearchResult;
  /** Node ids in display order (one button each). */
  ids: string[];
  start: string;
  goal: string;
}

export interface SeqVerdict {
  correct: boolean;
  message: RichText;
  trapId?: string;
  /** Index (0 = the first pop) of the first wrong entry; -1 when right. */
  at: number;
}

const NAME: Record<Algo, string> = { bfs: 'BFS', dfs: 'DFS', dijkstra: 'Dijkstra', astar: 'A*', greedy: 'Greedy best-first' };

const fmt = (x: number) => {
  const s = String(Number(x.toFixed(4)));
  return s === '-0' ? '0' : s;
};

/** "S, A C;B → G" or "SACBG" → ['S', 'A', 'C', 'B', 'G'] (unknown tokens are kept, so they can be reported). */
export function parseSeq(text: string, ids: readonly string[]): string[] {
  const known = new Set(ids.map((i) => i.toUpperCase()));
  const byUpper = new Map(ids.map((i) => [i.toUpperCase(), i]));
  const out: string[] = [];
  for (const raw of text.split(/[^A-Za-z0-9]+/).filter(Boolean)) {
    const tok = raw.toUpperCase();
    if (known.has(tok)) out.push(byUpper.get(tok)!);
    else if ([...tok].every((c) => known.has(c))) for (const c of tok) out.push(byUpper.get(c)!);
    else out.push(raw);
  }
  return out;
}

/** The Open list just before pop i (0-based), in the order it would be popped. */
function openBefore(run: SearchResult, i: number): OpenEntry[] {
  return i === 0 ? run.initialOpen : run.steps[i - 1]?.open ?? [];
}

function openWords(algo: Algo, open: readonly OpenEntry[]): string {
  const rows = open.map((e) => {
    if (algo === 'bfs' || algo === 'dfs') return e.node;
    if (algo === 'dijkstra') return `${e.node} ($g = ${fmt(e.g)}$)`;
    if (algo === 'greedy') return `${e.node} ($h = ${fmt(e.h)}$)`;
    return `${e.node} ($f = ${fmt(e.g)} + ${fmt(e.h)} = ${fmt(e.g + e.h)}$)`;
  });
  const head = algo === 'bfs' ? 'the queue, front first' : algo === 'dfs' ? 'the stack, top first' : 'in pop order';
  return `Open just before that pop (${head}): ${rows.join(', ')}.`;
}

const RULE: Record<Algo, string> = {
  bfs: 'BFS pops the front of the queue (the oldest entry)',
  dfs: 'DFS pops the top of the stack (the newest entry)',
  dijkstra: 'Dijkstra pops the lowest $g$',
  astar: 'A* pops the lowest $f = g + h$',
  greedy: 'greedy best-first pops the lowest $h$',
};

/** Judge a typed pop sequence against the reference run (a leading start node may be left out). */
export function judgeSeq(spec: SeqSpec, typed: readonly string[]): SeqVerdict {
  const want = spec.run.expandedOrder;
  const seq = typed.length && typed[0] !== spec.start && want[0] === spec.start ? [spec.start, ...typed] : [...typed];
  const algo = spec.algo;
  for (let i = 0; i < Math.max(seq.length, want.length); i++) {
    const X = seq[i];
    const Y = want[i];
    if (X === Y) continue;
    const n = i + 1;
    if (X === undefined)
      return { correct: false, at: i, message: `Your sequence stops after pop ${i}, but ${spec.goal} has not been popped yet. The search keeps popping until ${spec.goal} itself comes off Open (pop ${want.length}).` };
    if (Y === undefined)
      return { correct: false, at: i, message: `${spec.goal} is popped at pop ${want.length} and the search **stops** there: nothing after it is expanded.` };
    if (!spec.ids.includes(X)) return { correct: false, at: i, message: `Pop ${n}: "${X}" is not a node of this graph.` };
    const open = openBefore(spec.run, i);
    const done = want.slice(0, i);
    if (done.includes(X))
      return { correct: false, at: i, message: `Pop ${n}: ${X} was already popped (pop ${done.indexOf(X) + 1}), so it is in Closed and is never popped again. ${RULE[algo]}: **${Y}**.` };
    const inOpen = open.find((e) => e.node === X);
    if (!inOpen)
      return { correct: false, at: i, message: `Pop ${n}: ${X} is not in Open yet: none of the nodes popped so far (${done.join(', ')}) has a road to it. ${openWords(algo, open)}` };
    let trapId: string | undefined;
    let extra = '';
    if (X === spec.goal && algo !== 'bfs' && algo !== 'dfs') {
      trapId = 'goal-on-insert';
      extra = ` ${spec.goal} is already in Open, but it is popped only when it has the lowest priority: the goal test is at the **pop**, not when it enters Open.`;
    } else if (algo === 'astar') {
      const lowG = open.reduce((b, e) => (e.g < b.g ? e : b), open[0]);
      const lowH = open.reduce((b, e) => (e.h < b.h ? e : b), open[0]);
      if (X === lowG.node && X !== Y) {
        trapId = 'plan-astar-lowest-g';
        extra = ` ${X} has the lowest $g$, which is Dijkstra’s rule; A* adds $h$.`;
      } else if (X === lowH.node && X !== Y) {
        trapId = 'plan-astar-lowest-h';
        extra = ` ${X} has the lowest $h$, which is greedy best-first’s rule; A* adds the distance already driven.`;
      }
    } else if (algo === 'dijkstra' && open[0] && X !== open[0].node) {
      const oldest = open.reduce((b, e) => (e.seq < b.seq ? e : b), open[0]);
      if (X === oldest.node) extra = ` ${X} entered Open first, but Dijkstra ranks by cost, not arrival order.`;
    }
    return { correct: false, at: i, trapId, message: `${i === 1 ? 'Pop 1 is' : `Pops 1–${i} are`} right. At pop ${n} you have ${X}, but ${RULE[algo]}: **${Y}**.${extra} ${openWords(algo, open)}` };
  }
  return { correct: true, at: -1, message: `Right: ${want.join(' → ')} (${want.length} pops).` };
}

interface SeqState {
  text: string;
  verdict: SeqVerdict | null;
  checks: number;
  shown: boolean;
}

/** The custom part. `spec` rides along on the component (seqPartData) so self-tests can run the same judge. */
export function makeSequencePart(spec: SeqSpec): ComponentType<CustomPartProps> {
  function SequencePart({ onResult, pkey, disabled }: CustomPartProps) {
    const [s, setS] = usePersisted<SeqState>(`${pkey}:x`, { text: '', verdict: null, checks: 0, shown: false });
    const seq = parseSeq(s.text, spec.ids);
    const add = (id: string) => setS({ ...s, text: seq.length ? `${seq.join(', ')}, ${id}` : id, verdict: null });
    const back = () => setS({ ...s, text: seq.slice(0, -1).join(', '), verdict: null });
    const check = () => {
      const v = judgeSeq(spec, seq);
      setS({ ...s, verdict: v, checks: s.checks + 1 });
      onResult({ correct: v.correct, trapId: v.trapId });
    };
    const reveal = () => setS({ ...s, text: spec.run.expandedOrder.join(', '), shown: true, verdict: { correct: true, at: -1, message: `The reference run: ${spec.run.expandedOrder.join(' → ')} (${spec.run.expandedOrder.length} pops). The worked solution (last hint) explains each pop.` } });
    const locked = disabled || (s.verdict?.correct ?? false);
    return (
      <div className="plan-seq">
        <div className="plan-seq-picks" role="group" aria-label={`Add a node to the ${NAME[spec.algo]} pop sequence`}>
          {spec.ids.map((id) => (
            <button key={id} type="button" className="plan-astar-pick" disabled={locked} onClick={() => add(id)} aria-label={`append ${id}`}>
              {id}
            </button>
          ))}
          <Button size="sm" variant="ghost" disabled={locked || !seq.length} onClick={back} aria-label="remove the last node">
            ⌫
          </Button>
        </div>
        <div className="plan-seq-row">
          <input
            className={`plan-seq-in${s.verdict ? (s.verdict.correct ? ' is-ok' : ' is-bad') : ''}`}
            value={s.text}
            disabled={locked}
            autoComplete="off"
            spellCheck={false}
            placeholder={`${spec.start}, …, ${spec.goal}`}
            aria-label={`${NAME[spec.algo]} pop sequence, comma separated`}
            onChange={(e) => setS({ ...s, text: e.target.value, verdict: null })}
            onKeyDown={(e) => e.key === 'Enter' && seq.length > 0 && !locked && check()}
          />
          <Button variant="primary" disabled={locked || !seq.length} onClick={check}>
            Check
          </Button>
          {s.checks > 0 && !s.verdict?.correct && (
            <Button size="sm" variant="ghost" onClick={reveal}>
              Show the order
            </Button>
          )}
        </div>
        {seq.length > 0 && !s.verdict && <div className="muted small plan-seq-echo">{seq.join(' → ')}</div>}
        {s.verdict && (
          <Callout kind={s.verdict.correct ? 'ok' : 'bad'} title={s.shown ? 'The order' : s.verdict.correct ? 'Right' : `First slip at pop ${s.verdict.at + 1}`}>
            <Rich text={s.verdict.message} />
            {!s.verdict.correct && s.checks === 1 && <p className="small muted">Only the first check counts for marks; fix it and check again to see where it goes next.</p>}
          </Callout>
        )}
      </div>
    );
  }
  return Object.assign(SequencePart, { seqSpec: spec });
}

/** The reference spec attached to a part made by makeSequencePart (for self-tests). */
export function seqPartData(render: unknown): SeqSpec | null {
  const r = render as { seqSpec?: SeqSpec };
  return r && r.seqSpec ? r.seqSpec : null;
}
