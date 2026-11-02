// Topic 'plan'. See docs/AUTHORING.md; src/topics/plan/ is the reference implementation.
import type { TopicDef } from '../../engine/types';
import { TOPIC_META } from '../meta';
import { cards, flashcards } from './learn';
import { games, mcqs, shortAnswers } from './quiz';
import { generators } from './solve';
import { explore } from './explore';

const topic: TopicDef = {
  ...TOPIC_META.plan,
  cards,
  flashcards,
  mcqs,
  games,
  shortAnswers,
  solve: generators,
  explore,
  // A* and RRT* traps are registered next to their generators (solve/astar.ts, solve/rrtstar.ts).
  traps: [
    { id: 'dwa-window', title: 'Dynamic window: multiply the acceleration limits by Δt, then clip to the velocity limits', detail: '$V_d = [v - \\dot v_b\\Delta t,\\ v + \\dot v_a\\Delta t] \\times [\\omega - \\dot\\omega_b\\Delta t,\\ \\omega + \\dot\\omega_a\\Delta t]$, intersected with $[0, v_{max}] \\times [-\\omega_{max}, \\omega_{max}]$.' },
    { id: 'dwa-weights', title: 'DWA objective: weight each term before adding', detail: '$G(v, \\omega) = \\alpha\\,\\text{heading} + \\beta\\,\\text{clearance} + \\gamma\\,\\text{velocity}$, each term normalised first.' },
    { id: 'dwa-stop', title: 'Braking distance is v²/(2v̇_b)', detail: 'A velocity is admissible only if the robot can stop before the obstacle on that arc: $v^2/(2\\dot v_b) \\le \\text{dist}(v, \\omega)$.' },
  ],
};

export default topic;
