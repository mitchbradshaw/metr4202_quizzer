// Self-tests for the multi-robot cores (core/multi_alloc.ts, core/multi_credit.ts), including the facts the two
// simulations quote in their predictions.
import type { SelfTest } from '../../../selftest/types';
import { isTrue, nearAbs } from '../../../selftest/assert';
import { meanMetrics, simulateAllocation } from '../../../core/multi_alloc';
import { contributionCorr, differenceReward, learnCoverage, siteValues, teamReward } from '../../../core/multi_credit';

export const tests: SelfTest[] = [
  {
    id: 'multi-alloc-explicit-no-dup',
    topic: 'multi',
    title: 'Allocation: explicit coordination with zero message loss never duplicates work (30 layouts × 5 team sizes × 3 task counts)',
    source: 'Summary notes §9: explicit coordination avoids conflicts directly',
    run: () => {
      let worst = 0;
      let unfinished = 0;
      let where = '';
      for (let seed = 1; seed <= 30; seed++)
        for (const nRobots of [2, 4, 6, 9, 12])
          for (const nTasks of [6, 12, 20]) {
            const m = simulateAllocation({ nRobots, nTasks, mode: 'explicit', dropout: 0, senseRange: 3, seed }).metrics;
            if (m.duplicates > worst) {
              worst = m.duplicates;
              where = `seed ${seed}, N ${nRobots}, M ${nTasks}`;
            }
            if (!m.finished) unfinished++;
          }
      return [isTrue('no duplicated trips anywhere', worst === 0, `${worst} at ${where}`), isTrue('every mission finished', unfinished === 0, `${unfinished} unfinished`)];
    },
  },
  {
    id: 'multi-alloc-properties',
    topic: 'multi',
    title: 'Allocation: implicit sends no messages; message loss hurts explicit; message load grows faster than the team',
    source: 'Summary notes §9 implicit vs explicit table; 2023 Q30 (bandwidth, scalability)',
    run: () => {
      const seeds = [1, 2, 3, 4, 5, 6];
      const base = { nRobots: 6, nTasks: 12, senseRange: 3 };
      const ex0 = meanMetrics({ ...base, mode: 'explicit', dropout: 0 }, seeds);
      const ex5 = meanMetrics({ ...base, mode: 'explicit', dropout: 0.5 }, seeds);
      const im0 = meanMetrics({ ...base, mode: 'implicit', dropout: 0 }, seeds);
      const im5 = meanMetrics({ ...base, mode: 'implicit', dropout: 0.5 }, seeds);
      const m6 = meanMetrics({ ...base, mode: 'explicit', dropout: 0.2 }, seeds).messages;
      const m12 = meanMetrics({ ...base, nRobots: 12, mode: 'explicit', dropout: 0.2 }, seeds).messages;
      return [
        isTrue('implicit: 0 messages at any loss', im0.messages === 0 && im5.messages === 0),
        isTrue('implicit: identical results with and without message loss', im0.wastedDist === im5.wastedDist && im0.duplicates === im5.duplicates),
        isTrue('explicit at 50 % loss: duplicated trips appear', ex5.duplicates > ex0.duplicates, `${ex5.duplicates.toFixed(2)} vs ${ex0.duplicates.toFixed(2)}`),
        isTrue('explicit at 50 % loss: more messages than at 0 %', ex5.messages > ex0.messages, `${ex5.messages.toFixed(0)} vs ${ex0.messages.toFixed(0)}`),
        isTrue('implicit with a 3 m view makes wrong guesses (duplicated trips > 0)', im0.duplicates > 0, im0.duplicates.toFixed(2)),
        isTrue('12 robots send more than twice the messages of 6 (20 % loss)', m12 > 2 * m6, `${m12.toFixed(0)} vs ${m6.toFixed(0)}`),
      ];
    },
  },
  {
    id: 'multi-alloc-prediction-facts',
    topic: 'multi',
    title: 'Allocation predictions on the default layout: 0 duplicates at 0 % loss; duplicates at 50 %; implicit duplicates; messages more than double from 6 to 12 robots',
    source: 'Allocation simulation, predictions multi-alloc-*',
    run: () => {
      const base = { nRobots: 6, nTasks: 12, senseRange: 3, seed: 1 };
      const e0 = simulateAllocation({ ...base, mode: 'explicit', dropout: 0 }).metrics;
      const e5 = simulateAllocation({ ...base, mode: 'explicit', dropout: 0.5 }).metrics;
      const i3 = simulateAllocation({ ...base, mode: 'implicit', dropout: 0.5 }).metrics;
      const e6 = simulateAllocation({ ...base, mode: 'explicit', dropout: 0.2 }).metrics;
      const e12 = simulateAllocation({ ...base, nRobots: 12, mode: 'explicit', dropout: 0.2 }).metrics;
      return [
        isTrue('explicit, 0 %: no duplicated trips, all tasks done', e0.duplicates === 0 && e0.finished),
        isTrue('explicit, 50 %: at least one duplicated trip, all tasks still done', e5.duplicates > 0 && e5.finished, `${e5.duplicates}`),
        isTrue('implicit, 3 m: 0 messages and at least one duplicated trip', i3.messages === 0 && i3.duplicates > 0, `${i3.duplicates}`),
        isTrue('explicit, 20 %: 12 robots send more than twice the messages of 6', e12.messages > 2 * e6.messages, `${e12.messages} vs ${e6.messages}`),
      ];
    },
  },
  {
    id: 'multi-credit-rewards',
    topic: 'multi',
    title: 'Credit: G counts each covered site once; D_i = v(site) when alone, 0 when shared; corr(D_i, D_i) = 1 and the global signal fades with team size',
    source: 'Difference reward D_i = G(z) − G(z_−i) (summary notes §9 credit assignment)',
    run: () => {
      const v = [1, 2, 3];
      const z = [0, 2, 2];
      return [
        nearAbs('G([0, 2, 2]) = 1 + 3 = 4 (the second robot on site 3 adds nothing)', teamReward(z, v), 4, 1e-12),
        nearAbs('robot alone at site 1: D = 1', differenceReward(z, v, 0), 1, 1e-12),
        nearAbs('robot sharing site 3: D = 0', differenceReward(z, v, 1), 0, 1e-12),
        nearAbs('difference signal reports the contribution exactly (corr = 1)', contributionCorr('difference', 10, 10), 1, 1e-9),
        isTrue('global signal: corr falls from N = 2 to N = 20', contributionCorr('global', 20, 20) < contributionCorr('global', 2, 2) - 0.3, `${contributionCorr('global', 2, 2).toFixed(2)} → ${contributionCorr('global', 20, 20).toFixed(2)}`),
        isTrue('site values are spread (no two equal) for every K up to 20', [...Array(19)].every((_, i) => new Set(siteValues(i + 2)).size === i + 2)),
      ];
    },
  },
  {
    id: 'multi-credit-prediction-facts',
    topic: 'multi',
    title: 'Credit predictions: 20 robots on G stay near random; D learns a full spread; selfish robots crowd the best site',
    source: 'Credit simulation, predictions multi-credit-global and multi-credit-local (α = 0.1, ε = 0.15, 600 episodes)',
    run: () => {
      const L = (signal: 'global' | 'difference' | 'local', N: number, seed = 1) => learnCoverage({ N, K: N, signal, alpha: 0.1, eps: 0.15, episodes: 600, seed });
      const g20 = L('global', 20);
      const d20 = L('difference', 20);
      const l4 = L('local', 4);
      const v4 = siteValues(4);
      return [
        isTrue('20 robots, global G: greedy coverage below 80 % of the best', g20.greedyPerf[599] < 0.8, g20.greedyPerf[599].toFixed(3)),
        isTrue('20 robots, difference D: greedy coverage ≥ 95 %', d20.greedyPerf[599] >= 0.95, d20.greedyPerf[599].toFixed(3)),
        nearAbs('4 robots, local reward: all on the best site, G = max v / Σ v', l4.greedyPerf[599], Math.max(...v4) / v4.reduce((a, b) => a + b, 0), 1e-6),
      ];
    },
  },
];
