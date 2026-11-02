// Self-tests for the IK track of kinematics: Pieper layouts vs the automatic axis check. (More added below.)
import type { SelfTest, CheckResult } from '../../../selftest/types';
import { isTrue } from '../../../selftest/assert';
import { LAYOUTS, pieperCheck, tripleName } from '../../../core/kin_pieper';

export const tests: SelfTest[] = [
  {
    id: 'kin-ik-pieper-labels',
    topic: 'kin',
    title: 'Pieper deck: every layout’s hand-written label matches the automatic consecutive-axes check',
    source: '2023 Q12 worked solution; summary notes §6',
    run: () => {
      const out: CheckResult[] = [];
      for (const L of LAYOUTS) {
        const r = pieperCheck(L.joints);
        const desc = `auto: ${r.closedForm ? 'closed form' : 'no'} (${r.reason}${r.triple ? ` ${tripleName(r.triple)}` : ''}), rank ${r.rank}, ω-rank ${r.wRank}; triples ${r.triples.map((t) => `${tripleName([t.start, t.start + 1, t.start + 2])}:${t.kind}`).join(' ')}`;
        const ok = r.closedForm === L.closedForm && r.reason === L.reason && (!L.closedForm || (r.triple ?? []).join() === (L.triple ?? []).join());
        out.push(isTrue(`${L.id}: ${L.closedForm ? 'closed form' : 'no closed form'} (${L.reason})`, ok, desc));
      }
      return out;
    },
  },
];
