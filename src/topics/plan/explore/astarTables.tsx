// The exam's Open and Closed tables (2024 Q29 answer sheet): Open | Priority | Parent and Closed | Cost | Parent.
import { memo } from 'react';
import type { Algo } from '../../../core/graph';
import { num, type ClosedRow, type NameOf, type OpenRow } from './astarTable';
import '../astar.css';

const PRIO_HEAD: Record<Algo, string> = { astar: 'f = g + h', dijkstra: 'g', greedy: 'h', bfs: 'queue', dfs: 'stack' };

export const OpenTable = memo(function OpenTable({
  rows,
  algo,
  name,
  unsorted,
  showNext = true,
  hideChanges,
}: {
  rows: readonly OpenRow[];
  algo: Algo;
  name: NameOf;
  /** Insertion order instead of pop order (so the student must find the lowest f). */
  unsorted?: boolean;
  /** Mark the row that will be popped next. */
  showNext?: boolean;
  hideChanges?: boolean;
}) {
  const shown = unsorted ? rows.slice().sort((a, b) => a.seq - b.seq) : rows;
  const nextNode = !unsorted && showNext ? rows[0]?.node : undefined;
  return (
    <table className="plan-astar-table" aria-label="Open list">
      <thead>
        <tr>
          <th scope="col">Open</th>
          <th scope="col">
            Priority <span className="plan-astar-th-sub">{PRIO_HEAD[algo]}</span>
          </th>
          <th scope="col">Parent</th>
        </tr>
      </thead>
      <tbody>
        {shown.length === 0 && (
          <tr>
            <td colSpan={3} className="muted">
              (empty)
            </td>
          </tr>
        )}
        {shown.map((r) => {
          const ch = hideChanges ? null : r.change;
          return (
            <tr key={r.node} className={`${ch === 'new' ? 'is-new' : ch === 'improved' ? 'is-improved' : ''}${r.node === nextNode ? ' is-next' : ''}`}>
              <th scope="row">
                {r.node === nextNode && (
                  <span className="plan-astar-next" title="popped next" aria-label="popped next">
                    ▸
                  </span>
                )}
                {name(r.node)}
              </th>
              <td className="mono">
                {algo === 'astar' ? (
                  <>
                    {num(r.g)} + {num(r.h)} = <b>{num(r.f)}</b>
                  </>
                ) : algo === 'dijkstra' ? (
                  <b>{num(r.g)}</b>
                ) : algo === 'greedy' ? (
                  <b>{num(r.h)}</b>
                ) : (
                  <b>#{num(r.prio + 1)}</b>
                )}
                {ch === 'new' && <span className="plan-astar-chip is-new">new</span>}
                {ch === 'improved' && (
                  <span className="plan-astar-chip is-improved" title={`was g = ${num(r.oldG ?? NaN)} via ${name(r.oldParent ?? '?')}`}>
                    ↓ was {num(r.oldG ?? NaN)} via {name(r.oldParent ?? '?')}
                  </span>
                )}
              </td>
              <td>{r.parent ? name(r.parent) : '–'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
});

export const ClosedTable = memo(function ClosedTable({ rows, name, just }: { rows: readonly ClosedRow[]; name: NameOf; just?: string | null }) {
  return (
    <table className="plan-astar-table" aria-label="Closed list">
      <thead>
        <tr>
          <th scope="col">Closed</th>
          <th scope="col">
            Cost <span className="plan-astar-th-sub">g</span>
          </th>
          <th scope="col">Parent</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && (
          <tr>
            <td colSpan={3} className="muted">
              (empty)
            </td>
          </tr>
        )}
        {rows.map((r) => (
          <tr key={r.node} className={r.node === just ? 'is-just' : ''}>
            <th scope="row">{name(r.node)}</th>
            <td className="mono">{num(r.g)}</td>
            <td>{r.parent ? name(r.parent) : '–'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
});
