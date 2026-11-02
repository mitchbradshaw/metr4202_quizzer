// MCQs (original wording, cited to the past papers), method games and exam-style short answers for 'rl'.
// Covers every RL MCQ of 2023–2025 (2023 Q16–Q18; 2024 Q16–Q18; 2025 Q16–Q18), every RL short answer
// (2023 Q28, Q29; 2024 Q26; 2025 Q26) and the review deck's practice questions (slide 26), plus originals.
import type { Game, MCQ, ShortAnswer } from '../../engine/types';

export const mcqs: MCQ[] = [
  // ------------------------------------------------------------------ the MDP tuple and the policy
  {
    id: 'rl-q-tuple-timestep',
    style: 'incorrect',
    stem: 'A Markov decision process is specified by a tuple of elements. Which of these is NOT one of them?',
    options: [
      {
        text: 'The timestep $t$',
        correct: true,
        why: 'Not an element: $t$ only indexes the sequence of states, actions and rewards. The tuple is $(S, A, T, R, \\gamma)$.',
      },
      { text: 'The set of states $S$', correct: false, why: 'An element: the states the agent can be in.' },
      { text: 'The reward function $R$', correct: false, why: 'An element: the immediate reward for each transition, which the agent tries to accumulate.' },
      { text: 'The set of actions $A$', correct: false, why: 'An element: the choices open to the agent in each state.' },
    ],
    source: 'Recurring: 2023 Q16',
    trapId: 'mdp-tuple',
    difficulty: 1,
  },
  {
    id: 'rl-q-tuple-return',
    style: 'incorrect',
    stem: 'Which of the following is NOT part of the tuple that defines a Markov decision process?',
    options: [
      {
        text: 'The return',
        correct: true,
        why: 'Not an element: the return $G_t = \\sum_k \\gamma^k r_{t+k+1}$ is computed from the rewards and the discount factor along a trajectory.',
      },
      { text: 'The transition function', correct: false, why: 'An element: $T(s, a, s^{\\prime})$ gives the probability of each next state.' },
      { text: 'The discount factor', correct: false, why: 'An element: $\\gamma$ is part of the problem, because it decides how future rewards are valued.' },
      { text: 'The reward function', correct: false, why: 'An element: $R$ defines the task the agent is solving.' },
    ],
    source: 'Recurring: 2024 Q16',
    trapId: 'mdp-tuple',
    difficulty: 1,
  },
  {
    id: 'rl-q-tuple-in',
    style: 'correct',
    stem: 'Which of the following IS one of the elements of a Markov decision process tuple?',
    options: [
      { text: 'The set of states $S$ the agent can be in', correct: true, why: 'The tuple is $(S, A, T, R, \\gamma)$, and the states come first.' },
      {
        text: 'The sensor model $p(z \\mid x)$',
        correct: false,
        why: 'That belongs to the Bayes filter. An MDP assumes the state is observed exactly; adding observations turns it into a POMDP.',
      },
      { text: 'The return $G_t$', correct: false, why: 'Computed from the rewards and $\\gamma$, not part of the definition.' },
      { text: 'The policy $\\pi$', correct: false, why: 'The policy is the solution of the MDP, not part of the problem.' },
    ],
    source: 'Recurring: 2025 Q16',
    trapId: 'mdp-tuple',
    difficulty: 1,
  },
  {
    id: 'rl-q-policy-maps',
    style: 'most-correct',
    stem: 'In reinforcement learning, a policy is a mapping from:',
    options: [
      { text: 'states to actions', correct: true, why: '$\\pi : S \\to A$ (or $\\pi(a \\mid s)$): in every state it says which action to take.' },
      { text: 'rewards to actions', correct: false, why: 'Rewards are the feedback used to improve the policy, not its input.' },
      { text: 'actions to rewards', correct: false, why: 'That describes the reward function $R$, which is part of the problem.' },
      { text: 'actions to states', correct: false, why: 'That describes the transition function $T$: where an action leads.' },
    ],
    source: 'Recurring: 2023 Q17',
    difficulty: 1,
  },

  // ------------------------------------------------------------------ the objective and the discount factor
  {
    id: 'rl-q-objective-none',
    style: 'most-correct',
    stem: 'A reinforcement learning policy is trained to maximise:',
    options: [
      {
        text: 'only the immediate reward',
        correct: false,
        why: 'Only an agent with $\\gamma = 0$ does that. In general a good action may cost reward now and pay off later.',
      },
      {
        text: 'the reward collected on the final step',
        correct: false,
        why: 'Every reward along the way counts, not just the last one; a continuing task has no final timestep at all.',
      },
      {
        text: 'the mean reward per step',
        correct: false,
        why: 'Average-reward formulations exist, but the course objective is the expected discounted return.',
      },
      {
        text: 'None of the above',
        correct: true,
        why: 'The objective is the expected **cumulative discounted** reward (the expected return), which none of the other options states.',
      },
    ],
    source: 'Recurring: 2024 Q17',
    fixedOrder: true,
    trapId: 'read-the-stem',
    difficulty: 2,
  },
  {
    id: 'rl-q-objective-discounted',
    style: 'most-correct',
    stem: 'In reinforcement learning, the policy is trained to maximise:',
    options: [
      {
        text: 'the total of all rewards received, with no discounting',
        correct: false,
        why: 'Close, but the course objective discounts: a reward $k$ steps ahead counts $\\gamma^k$ of its value with $\\gamma < 1$, which also keeps the sum finite.',
      },
      { text: 'only the reward of the next step', correct: false, why: 'That is the myopic objective of $\\gamma = 0$ only.' },
      {
        text: 'the expected cumulative discounted reward',
        correct: true,
        why: 'Exactly the expected return, $\\mathbb{E}\\big[\\sum_k \\gamma^k r_{t+k+1}\\big]$.',
      },
      {
        text: 'None of the above',
        correct: false,
        why: 'One option does state the objective here, so this is wrong (unlike 2024 Q17, where none did).',
      },
    ],
    source: 'Recurring: 2025 Q17',
    fixedOrder: true,
    difficulty: 1,
  },
  {
    id: 'rl-q-gamma-zero',
    style: 'correct',
    stem: 'An agent is trained with discount factor $\\gamma = 0$. Which statement is correct?',
    options: [
      { text: 'It maximises only the reward of its next step', correct: true, why: 'With $\\gamma = 0$, $G_t = r_{t+1}$: every later reward has weight 0.' },
      { text: 'It weighs a reward 100 steps away as much as the next one', correct: false, why: 'That is the far-sighted limit $\\gamma \\to 1$.' },
      {
        text: 'Its return is undefined, so it cannot learn anything',
        correct: false,
        why: 'The return is perfectly well defined, $G_t = r_{t+1}$. It is $\\gamma = 1$ on a never-ending task that can make the sum diverge.',
      },
      {
        text: 'It ignores the next reward and maximises the final one',
        correct: false,
        why: 'No discount factor does that: discounting always weights near rewards at least as much as far ones.',
      },
    ],
    source: 'Original; Notes §8; 2023 Q28',
    difficulty: 1,
  },
  {
    id: 'rl-q-gamma-false',
    style: 'incorrect',
    stem: 'About the discount factor $\\gamma \\in [0, 1)$:',
    options: [
      {
        text: 'A larger $\\gamma$ makes the agent prefer rewards that arrive sooner',
        correct: true,
        why: 'This is the FALSE statement: a larger $\\gamma$ shrinks distant rewards **less**, so the agent becomes more willing to wait for them (far-sighted).',
      },
      {
        text: 'It keeps the return of a never-ending task finite',
        correct: false,
        why: 'True: with rewards bounded by $r_{\\max}$, $|G_t| \\le r_{\\max}/(1 - \\gamma)$.',
      },
      {
        text: 'A reward received $k$ steps ahead is weighted by $\\gamma^k$',
        correct: false,
        why: 'True: that is the definition of the discounted return.',
      },
      {
        text: 'Changing $\\gamma$ can change the optimal policy, not just the values',
        correct: false,
        why: 'True: a small $\\gamma$ can make a big but distant reward worth less than a small nearby one.',
      },
    ],
    source: 'Original; Notes §8; 2023 Q28',
    trapId: 'read-the-stem',
    difficulty: 2,
  },
  {
    id: 'rl-q-return-value',
    style: 'value',
    stem: 'An episode gives rewards $r_1 = 0$, $r_2 = 0$, $r_3 = 10$ and then ends. With $\\gamma = 0.9$, what is the return $G_0$?',
    options: [
      {
        text: '7.29',
        correct: false,
        why: 'That is $0.9^3 \\times 10$: the powers were started at 1 instead of 0, discounting every reward once too often.',
      },
      { text: '8.1', correct: true, why: '$G_0 = r_1 + \\gamma r_2 + \\gamma^2 r_3 = 0 + 0 + 0.81 \\times 10 = 8.1$.' },
      { text: '9.0', correct: false, why: 'Only one factor of $\\gamma$: $r_3$ comes two steps after $r_1$, so its weight is $\\gamma^2$.' },
      { text: '10', correct: false, why: 'That is the undiscounted total; the course objective discounts.' },
    ],
    source: 'Original; exam mode (discounted return)',
    fixedOrder: true,
    difficulty: 1,
  },

  // ------------------------------------------------------------------ values and the optimal policy
  {
    id: 'rl-q-pistar',
    style: 'most-correct',
    stem: 'How is the optimal policy $\\pi^*(s)$ related to the optimal action-value function $Q^*(s, a)$?',
    options: [
      {
        text: 'They are equivalent: each one is the other written differently',
        correct: false,
        why: 'They are different objects: $Q^*$ gives a number for every state–action pair, $\\pi^*$ an action for every state.',
      },
      {
        text: 'In each state, $\\pi^*$ takes the action that maximises $Q^*$',
        correct: true,
        why: '$\\pi^*(s) = \\arg\\max_a Q^*(s, a)$: once $Q^*$ is known, acting optimally is a lookup.',
      },
      {
        text: '$Q^*(s, a)$ is the reward collected in state $s$ by following $\\pi^*$',
        correct: false,
        why: 'It is the expected discounted return (all the future rewards), not one reward, and it is for taking $a$ first.',
      },
      { text: 'All of the above', correct: false, why: 'Only one of the statements is correct.' },
    ],
    source: 'Recurring: 2025 Q18',
    fixedOrder: true,
    difficulty: 1,
  },

  // ------------------------------------------------------------------ Q-learning
  {
    id: 'rl-q-model-free',
    style: 'correct',
    stem: 'Which statement about Q-learning is correct?',
    options: [
      {
        text: 'It learns from sampled transitions, without knowing $T$',
        correct: true,
        why: 'It is model-free: each update uses one experienced $(s, a, r, s^{\\prime})$, and averaging over many of them replaces the sum over $T$.',
      },
      {
        text: 'It needs the transition probabilities $T$ to compute each update',
        correct: false,
        why: 'That is value iteration. Q-learning only needs the sample the world has just produced.',
      },
      {
        text: 'Like value iteration, it updates every state in each sweep',
        correct: false,
        why: 'It updates one state–action pair per step: the one the agent has just experienced.',
      },
      {
        text: 'It only works when every action has a single, certain outcome',
        correct: false,
        why: 'It copes with random outcomes: averaging the targets with a small $\\alpha$ is exactly what handles them.',
      },
    ],
    source: 'Original; Notes §8; review deck slide 25',
    difficulty: 1,
  },
  {
    id: 'rl-q-vi-false',
    style: 'incorrect',
    stem: 'About value iteration and Q-learning:',
    options: [
      {
        text: 'Value iteration can be run without knowing $T$ or $R$, by trying actions on the robot',
        correct: true,
        why: 'This is the FALSE statement: value iteration is model-based, and its Bellman backup sums over $T$ and uses $R$. Learning by trying actions is what Q-learning does.',
      },
      {
        text: 'Value iteration needs the transition probabilities and the reward function',
        correct: false,
        why: 'True: it computes $\\sum_{s^{\\prime}} T\\,[R + \\gamma V(s^{\\prime})]$ exactly.',
      },
      {
        text: 'Q-learning converges to $Q^*$ if it keeps trying every action in every state',
        correct: false,
        why: 'True (with a suitably decaying $\\alpha$): that is why it explores.',
      },
      {
        text: 'Both discount future value by $\\gamma$',
        correct: false,
        why: 'True: $\\gamma$ appears in the Bellman backup and in the TD target alike.',
      },
    ],
    source: 'Original; Notes §8',
    trapId: 'read-the-stem',
    difficulty: 2,
  },
  {
    id: 'rl-q-qupdate-value',
    style: 'value',
    stem: 'Q-learning with $\\alpha = 0.5$ and $\\gamma = 0.9$. The agent has $Q(s, a) = 4$, takes $a$, receives $r = 1$ and lands in $s^{\\prime}$, where $\\max_{a^{\\prime}} Q(s^{\\prime}, a^{\\prime}) = 5$. What is the updated $Q(s, a)$?',
    options: [
      {
        text: '4.3',
        correct: false,
        why: 'That bootstraps from $Q(s, a)$ instead of the best value of the **next** state: $4 + 0.5(1 + 0.9 \\times 4 - 4)$.',
      },
      {
        text: '4.75',
        correct: true,
        why: 'Target $= 1 + 0.9 \\times 5 = 5.5$; TD error $= 5.5 - 4 = 1.5$; $Q \\leftarrow 4 + 0.5 \\times 1.5 = 4.75$.',
      },
      { text: '5.0', correct: false, why: 'That drops $\\gamma$: $4 + 0.5(1 + 5 - 4)$. The next state’s value must be discounted.' },
      { text: '5.5', correct: false, why: 'That is the TD target itself, as if $\\alpha = 1$. With $\\alpha = 0.5$ the value moves only halfway.' },
      { text: '6.75', correct: false, why: 'That adds $\\alpha$ times the whole target without subtracting the old $Q(s, a)$.' },
    ],
    source: 'Original; exam mode (one Q-learning update)',
    fixedOrder: true,
    difficulty: 2,
  },
  {
    id: 'rl-q-eps-value',
    style: 'value',
    stem: 'An ε-greedy agent with $\\varepsilon = 0.2$ has 4 actions, one of them greedy. When it explores it picks uniformly among **all** 4 actions. What is the probability that it takes the greedy action?',
    options: [
      { text: '0.05', correct: false, why: 'That is the probability of each **non-greedy** action, $\\varepsilon/4$.' },
      { text: '0.20', correct: false, why: 'That is $\\varepsilon$, the probability of the random branch.' },
      { text: '0.80', correct: false, why: 'That forgets that the random branch can pick the greedy action too.' },
      { text: '0.85', correct: true, why: '$1 - \\varepsilon + \\varepsilon/|A| = 0.8 + 0.05 = 0.85$.' },
    ],
    source: 'Original; exam mode (ε-greedy probabilities)',
    fixedOrder: true,
    difficulty: 2,
  },
  {
    id: 'rl-q-alpha-one',
    style: 'correct',
    stem: 'In tabular Q-learning, setting the learning rate $\\alpha = 1$ means that:',
    options: [
      {
        text: 'each update replaces $Q(s, a)$ with the latest TD target, forgetting the old value',
        correct: true,
        why: '$Q \\leftarrow Q + 1 \\cdot (\\text{target} - Q) = \\text{target}$: old experience is forgotten. Fine in a deterministic world, noisy in a random one.',
      },
      { text: '$Q(s, a)$ never changes, whatever the agent experiences', correct: false, why: 'That is $\\alpha = 0$.' },
      {
        text: 'future rewards count fully, with no discounting at all',
        correct: false,
        why: 'That would be $\\gamma = 1$. $\\alpha$ is the step size of the update, not the discount.',
      },
      { text: 'the agent explores on every step instead of acting greedily', correct: false, why: 'That would be $\\varepsilon = 1$.' },
    ],
    source: 'Original; Notes §8',
    difficulty: 2,
  },

  // ------------------------------------------------------------------ policy vs path, Markov state
  {
    id: 'rl-q-policy-vs-path',
    style: 'correct',
    stem: 'A robot must drive to its charger. Compared with a path found by a motion planner such as A*, a policy learned by RL:',
    options: [
      {
        text: 'gives an action from whatever state the robot ends up in, even far off its intended route',
        correct: true,
        why: 'A policy covers every state: if the robot is pushed off course it simply applies $\\pi$ where it now is, while a path would have to be replanned.',
      },
      {
        text: 'needs a complete map of the environment before it can be computed',
        correct: false,
        why: 'That is the planner. RL learns from experience and reward, without an explicit map.',
      },
      {
        text: 'is guaranteed to be the shortest collision-free route',
        correct: false,
        why: 'RL offers no such guarantee; a complete, optimal planner does, for its model.',
      },
      {
        text: 'is computed once for the start state and then followed open-loop',
        correct: false,
        why: 'That describes a planned path. A policy is closed-loop: it reads the state at every step.',
      },
    ],
    source: 'Original; similar to 2023 Q29',
    difficulty: 2,
  },
  {
    id: 'rl-q-markov-best',
    style: 'best',
    stem: 'A robot arm learns by RL to intercept a ball rolling across a table. Which state description best satisfies the Markov assumption without wasting states?',
    options: [
      {
        text: 'The ball’s position and velocity, and the gripper’s position',
        correct: true,
        why: 'Position and velocity predict where the ball goes next, and the gripper position is what the actions change: sufficient and compact.',
      },
      {
        text: 'The ball’s position and the gripper’s position, measured precisely',
        correct: false,
        why: 'Precision does not help: without the velocity, the same positions can be followed by different next positions, so the history still matters. Not Markov.',
      },
      {
        text: 'The latest camera image, on its own',
        correct: false,
        why: 'One frame shows where the ball is, not where it is going: not Markov.',
      },
      {
        text: 'The complete history of every camera image since the episode began',
        correct: false,
        why: 'The full history is Markov in principle, but the state space explodes; a sufficient summary (positions and velocity) does the same job with far fewer states.',
      },
    ],
    source: 'Original; Notes §8; similar to 2024 Q26',
    trapId: 'markov',
    difficulty: 2,
  },

  // ------------------------------------------------------------------ sim-to-real and other challenges
  {
    id: 'rl-q-sim2real-slip',
    style: 'correct',
    stem: 'Which situation is an example of the sim-to-real transfer problem?',
    options: [
      {
        text: 'The simulator used to train a driving policy does not model wheel slip',
        correct: true,
        why: 'A mismatch between simulated and real physics is exactly the sim-to-real gap: the policy never experienced slip, so on a real road it misjudges braking and turning.',
      },
      {
        text: 'The policy network does not have enough layers to represent the task',
        correct: false,
        why: 'A capacity problem that would show up in simulation too; nothing to do with transfer.',
      },
      {
        text: 'Training is taking a long time because the computer has no GPU',
        correct: false,
        why: 'Slow compute delays training but does not make the simulator differ from reality.',
      },
      {
        text: 'The policy came from value iteration, and only policies from policy iteration can run on real robots',
        correct: false,
        why: 'False: a policy is a mapping from states to actions whatever algorithm produced it.',
      },
    ],
    source: 'Recurring: 2023 Q18',
    difficulty: 1,
  },
  {
    id: 'rl-q-sim2real-contact',
    style: 'correct',
    stem: 'Which of these describes an issue caused by sim-to-real transfer?',
    options: [
      {
        text: 'The grasping simulator models contact forces and friction inaccurately',
        correct: true,
        why: 'Grasps that hold in simulation slip in the real gripper: the simulator’s physics differs from reality, which is the sim-to-real gap.',
      },
      {
        text: 'Even after a huge number of simulated episodes, the training never converged',
        correct: false,
        why: 'A learning problem inside the simulator, before any transfer happens.',
      },
      {
        text: 'The training curriculum was badly designed, so the policy never converged',
        correct: false,
        why: 'A training-design problem: it would fail with a perfect simulator too.',
      },
      {
        text: 'The policy was trained with the wrong reward function',
        correct: false,
        why: 'Reward design: the policy does what it was rewarded for, in simulation or on hardware.',
      },
    ],
    source: 'Recurring: 2024 Q18',
    difficulty: 1,
  },
  {
    id: 'rl-q-domain-rand',
    style: 'most-correct',
    stem: 'In sim-to-real transfer, domain randomisation means:',
    options: [
      {
        text: 'training across many simulated variations of friction, mass, delay and appearance',
        correct: true,
        why: 'The policy must work in all of them, so it becomes robust to a range of conditions, and the real world looks like one more variation.',
      },
      {
        text: 'measuring the real robot’s friction, masses and delays and setting the simulator to match them exactly',
        correct: false,
        why: 'That is system identification: it makes the simulator accurate rather than varied.',
      },
      {
        text: 'shuffling the order in which the training episodes are run',
        correct: false,
        why: 'That changes nothing about the gap between the simulator and reality.',
      },
      {
        text: 'choosing random actions during training so that the agent explores',
        correct: false,
        why: 'That is ε-greedy exploration, which happens in any RL training.',
      },
    ],
    source: 'Original; Notes §8; 2025 Q26',
    difficulty: 2,
  },
  {
    id: 'rl-q-shaping',
    style: 'best',
    stem: 'A legged robot is rewarded only when it reaches a target 20 m away, and in training it almost never gets there. Which change is the standard fix?',
    options: [
      {
        text: 'Reward shaping: add intermediate rewards for progress towards the target',
        correct: true,
        why: 'A sparse reward gives no learning signal until the goal is found by chance. Shaping rewards progress (e.g. minus the distance to the target), so learning can start.',
      },
      {
        text: 'Lower $\\gamma$ so that the distant reward matters less',
        correct: false,
        why: 'A smaller $\\gamma$ makes the far target even less attractive and does nothing about the missing signal.',
      },
      {
        text: 'Set $\\varepsilon = 0$ so the robot stops wasting its training time on random, exploratory actions',
        correct: false,
        why: 'Without exploration it is even less likely to stumble on the target.',
      },
      {
        text: 'Raise $\\alpha$ to 1 so that every rare success is remembered in full',
        correct: false,
        why: 'A bigger step size does not help when successes almost never happen: the agent needs a signal before it reaches the goal.',
      },
    ],
    source: 'Original; Notes §8 (reward design); review deck slide 26',
    difficulty: 2,
  },
];

export const games: Game[] = [
  {
    kind: 'sort',
    id: 'rl-g-tuple',
    title: 'In the MDP tuple or not?',
    prompt: 'The course writes a Markov decision process as the 5-tuple $(S, A, T, R, \\gamma)$. Sort each item: is it one of the five elements, or something else (computed from the MDP, part of its solution, a setting of a learning algorithm, or from another topic)?',
    buckets: [
      { id: 'in', label: 'In the tuple $(S, A, T, R, \\gamma)$' },
      { id: 'out', label: 'Not in the tuple' },
    ],
    items: [
      { id: 't1', text: 'The set of states $S$', bucket: 'in', why: 'Every MDP starts with the states the agent can be in (the key of 2025 Q16).' },
      { id: 't2', text: 'The set of actions $A$', bucket: 'in', why: 'The choices open to the agent in each state.' },
      {
        id: 't3',
        text: 'The transition function $T(s, a, s^{\\prime}) = p(s^{\\prime} \\mid s, a)$',
        bucket: 'in',
        why: 'How the world responds to an action, random outcomes such as wheel slip included.',
      },
      { id: 't4', text: 'The reward function $R$', bucket: 'in', why: 'The immediate signal the agent is trying to accumulate: it defines the task.' },
      { id: 't5', text: 'The discount factor $\\gamma$', bucket: 'in', why: 'Part of the problem definition: it says how much future reward is worth.' },
      { id: 'o1', text: 'The timestep $t$', bucket: 'out', why: 'Only an index into the sequence of states and actions (the key of 2023 Q16).' },
      { id: 'o2', text: 'The return $G_t$', bucket: 'out', why: 'Computed from the rewards and $\\gamma$ during an episode (the key of 2024 Q16).' },
      { id: 'o3', text: 'The policy $\\pi(s)$', bucket: 'out', why: 'The solution of the MDP, not part of its definition (a 2025 Q16 distractor).' },
      {
        id: 'o4',
        text: 'The sensor model $p(z \\mid x)$',
        bucket: 'out',
        why: 'Belongs to the Bayes filter: an MDP assumes the state is observed exactly. Adding observations gives a POMDP.',
      },
      { id: 'o5', text: 'The value function $V^{\\pi}(s)$', bucket: 'out', why: 'Computed from $T$, $R$, $\\gamma$ and a policy.' },
      {
        id: 'o6',
        text: 'The learning rate $\\alpha$',
        bucket: 'out',
        why: 'A setting of Q-learning, not of the problem: value iteration solves the same MDP without any $\\alpha$.',
      },
      {
        id: 'o7',
        text: 'The exploration rate $\\varepsilon$',
        bucket: 'out',
        why: 'Also a learning setting: it controls how the agent gathers experience, not what the task is.',
      },
    ],
    source: 'Notes §8; 2023 Q16, 2024 Q16, 2025 Q16; review deck slide 26',
  },
  {
    kind: 'sort',
    id: 'rl-g-sim2real',
    title: 'Sim-to-real issue or not?',
    prompt: 'A policy is trained in simulation and deployed on a robot. Which problems come from the **gap between the simulator and the real world**, and which are training or design problems that would happen with a perfect simulator too?',
    buckets: [
      { id: 'gap', label: 'Sim-to-real gap' },
      { id: 'other', label: 'Another RL problem (not sim-to-real)' },
    ],
    items: [
      {
        id: 'g1',
        text: 'A driving simulator does not model wheel slip',
        bucket: 'gap',
        why: 'The policy never learned to cope with slip, so it misjudges braking and turning on real roads (the key of 2023 Q18).',
      },
      {
        id: 'g2',
        text: 'A grasping simulator mis-models contact forces and friction',
        bucket: 'gap',
        why: 'Grasps that hold in simulation slide out of the real gripper (the key of 2024 Q18).',
      },
      {
        id: 'g3',
        text: 'The simulated camera has perfect lighting and no motion blur',
        bucket: 'gap',
        why: 'A vision policy trained on clean renders can fail on real, noisy images; randomising textures and lighting helps.',
      },
      {
        id: 'g4',
        text: 'The real motors respond 30 ms later than the simulated ones',
        bucket: 'gap',
        why: 'Unmodelled latency makes a fast feedback policy overshoot or oscillate; randomise or identify the delay.',
      },
      {
        id: 'g5',
        text: 'The real robot carries a payload twice as heavy as the simulated one',
        bucket: 'gap',
        why: 'Wrong mass and inertia change the dynamics the policy relies on; system identification would catch it.',
      },
      {
        id: 'g6',
        text: 'The simulated lidar returns perfect, noise-free ranges',
        bucket: 'gap',
        why: 'Real sensors are noisy and drop returns; a policy that trusts perfect ranges can be brittle on hardware.',
      },
      {
        id: 'n1',
        text: 'Training did not converge even after a very large number of episodes',
        bucket: 'other',
        why: 'A learning problem inside the simulator, before any transfer (a 2024 Q18 distractor).',
      },
      {
        id: 'n2',
        text: 'The reward function rewarded the wrong behaviour',
        bucket: 'other',
        why: 'Reward design: the policy does what it was paid for in any world, simulated or real (a 2024 Q18 distractor).',
      },
      {
        id: 'n3',
        text: 'Training is slow because the computer has no GPU',
        bucket: 'other',
        why: 'A compute problem, not a mismatch with reality (a 2023 Q18 distractor).',
      },
      {
        id: 'n4',
        text: 'The policy network has too few layers to represent the task',
        bucket: 'other',
        why: 'A function-approximation problem that would show up in simulation too (a 2023 Q18 distractor).',
      },
      {
        id: 'n5',
        text: 'ε was set to 0, so the agent never found the better route',
        bucket: 'other',
        why: 'An exploration setting: it fails in simulation just the same.',
      },
      {
        id: 'n6',
        text: 'The curriculum of training tasks was badly designed',
        bucket: 'other',
        why: 'A training-design problem (a 2024 Q18 distractor).',
      },
    ],
    source: 'Notes §8; 2023 Q18, 2024 Q18, 2025 Q26',
  },
  {
    kind: 'match',
    id: 'rl-g-terms',
    title: 'RL terms and what they mean',
    prompt: 'Match each term to its definition.',
    pairs: [
      { id: 'p1', left: 'Policy $\\pi$', right: 'A rule that picks an action in every state', why: '$\\pi : S \\to A$: the solution of the MDP.' },
      {
        id: 'p2',
        left: 'Return $G_t$',
        right: 'The discounted sum of the rewards still to come',
        why: '$G_t = \\sum_k \\gamma^k r_{t+k+1}$: what the agent maximises, in expectation.',
      },
      {
        id: 'p3',
        left: 'State value $V^{\\pi}(s)$',
        right: 'The expected return from a state when following the policy',
        why: 'How good it is to be in $s$.',
      },
      {
        id: 'p4',
        left: 'Action value $Q^{\\pi}(s, a)$',
        right: 'The expected return from taking one action in a state, then following the policy',
        why: 'How good it is to do $a$ in $s$; the greedy policy takes its argmax.',
      },
      {
        id: 'p5',
        left: 'Discount factor $\\gamma$',
        right: 'The factor that shrinks a reward for each step of delay',
        why: 'Small: short-sighted; near 1: far-sighted.',
      },
      {
        id: 'p6',
        left: 'Exploration rate $\\varepsilon$',
        right: 'The probability of taking a random action instead of the greedy one',
        why: 'Exploration against exploitation in ε-greedy action selection.',
      },
      {
        id: 'p7',
        left: 'Learning rate $\\alpha$',
        right: 'How far each update moves $Q(s, a)$ towards the TD target',
        why: '0: nothing is learned; 1: the old value is replaced by the latest target.',
      },
      {
        id: 'p8',
        left: 'TD error $\\delta$',
        right: 'The target $r + \\gamma \\max_{a^{\\prime}} Q(s^{\\prime}, a^{\\prime})$ minus the current $Q(s, a)$',
        why: 'The surprise that drives every Q-learning update.',
      },
    ],
    source: 'Notes §8; review deck slide 25',
  },
];

export const shortAnswers: ShortAnswer[] = [
  {
    id: 'rl-sa-discount',
    prompt: '**(1 mark)** In no more than 50 words: in the context of reinforcement learning, describe the role of the discount factor $\\gamma$.',
    wordLimit: 50,
    model: 'The discount factor $\\gamma \\in [0, 1)$ weights future rewards relative to immediate ones in the return $G_t = \\sum_k \\gamma^k r_{t+k+1}$. A small $\\gamma$ gives a short-sighted agent and $\\gamma$ near 1 a far-sighted one; $\\gamma < 1$ also keeps the infinite-horizon return finite.',
    keyPoints: [
      'it weights future rewards relative to immediate ones (a reward $k$ steps ahead counts $\\gamma^k$)',
      'small $\\gamma$: short-sighted; $\\gamma \\to 1$: far-sighted',
      '$\\gamma < 1$ keeps the infinite-horizon return finite',
    ],
    source: 'Similar to 2023 Q28',
    marks: 1,
  },
  {
    id: 'rl-sa-policy-plan',
    prompt: '**(2 marks)** Consider getting a mobile robot to drive autonomously to a target position. In no more than 90 words: explain how a policy found via reinforcement learning differs from a path found via a motion planning method.',
    wordLimit: 90,
    model: 'A motion planner uses a known map and model to compute one path, a sequence of configurations from one particular start to the goal. It is followed open-loop: if the robot is disturbed or an action turns out differently, it must replan. An RL policy $\\pi(s)$ instead gives an action for every state and is learned from reward through experience. It is closed-loop, works from any start state and handles random outcomes, but needs a lot of training and gives no hard guarantee of optimality or collision-freeness.',
    keyPoints: [
      'a path is one sequence of configurations from one start; a policy gives an action for every state',
      'the path comes from a known map or model; the policy is learned from reward and experience',
      'the path is followed open-loop and needs replanning; the policy is closed-loop and works from any start',
      'the price of the policy: heavy training and no guarantees',
    ],
    source: 'Similar to 2023 Q29',
    marks: 2,
  },
  {
    id: 'rl-sa-markov',
    prompt: '**(3 marks)** Reinforcement learning is used to find optimal policies for a Markov decision process. In no more than 120 words: explain the Markov assumption and its implications for defining the RL state space.',
    wordLimit: 120,
    model: 'The Markov assumption: the next state and reward depend only on the current state and action, not on the earlier history, $P(s_{t+1} \\mid s_t, a_t, \\ldots, s_0) = P(s_{t+1} \\mid s_t, a_t)$. RL relies on it because values and policies are functions of the state alone. So the state must contain everything that affects what happens next: for a moving robot, velocity as well as position (or a stack of recent observations), plus quantities such as battery level or payload. Leaving something out makes the problem partially observable: the same state leads to different outcomes, the values become inconsistent and learning degrades. Extra variables enlarge the state space and slow learning, so include what is sufficient and no more.',
    keyPoints: [
      'definition: the next state (and reward) depends only on the current state and action, not the history',
      'so the state must hold everything that affects what happens next (e.g. velocity as well as position)',
      'leaving something out makes the problem partially observable and learning degrades',
      'but every extra variable enlarges the state space and slows learning: sufficient, not exhaustive',
    ],
    source: 'Similar to 2024 Q26',
    marks: 3,
  },
  {
    id: 'rl-sa-sim',
    prompt: '**(4 marks)** Robot control policies can be trained in simulation via reinforcement learning and then deployed on real robot hardware. In no more than 130 words: identify and describe one benefit and one drawback of this methodology.',
    wordLimit: 130,
    model: '**Benefit: safe, fast, cheap data.** RL needs millions of trials, many of them failures such as crashes or falls. In simulation a failure costs nothing and breaks no hardware, episodes reset instantly, and many environments run in parallel faster than real time, with perfect knowledge of the state and reward.\n\n**Drawback: the sim-to-real gap.** No simulator models reality exactly: contact, friction, wheel slip, motor dynamics, latency, sensor noise and lighting all differ. The policy can overfit to the simulator’s quirks and then perform poorly or unsafely on the real robot. Domain randomisation, system identification and fine-tuning on hardware reduce the gap, at extra effort.',
    keyPoints: [
      'benefit named: safe, fast and cheap data (no damage, instant resets, parallel, faster than real time)',
      'why it matters: RL needs huge numbers of trials, many of them failures',
      'drawback named: the sim-to-real gap, with concrete mis-modelled effects (friction, contact, latency, noise)',
      'consequence: the policy overfits to the simulator and performs poorly or unsafely on hardware',
      'a mitigation: domain randomisation, system identification or fine-tuning',
    ],
    source: 'Similar to 2025 Q26',
    marks: 4,
  },
  {
    id: 'rl-sa-tuple',
    prompt: '**(2 marks)** In no more than 70 words: what are the elements of a Markov decision process tuple?',
    wordLimit: 70,
    model: 'An MDP is the tuple $(S, A, T, R, \\gamma)$: the set of states $S$; the set of actions $A$; the transition function $T(s, a, s^{\\prime}) = p(s^{\\prime} \\mid s, a)$, the probability of each next state; the reward function $R$, the immediate reward for a transition; and the discount factor $\\gamma \\in [0, 1)$, which weights future rewards. The policy, the return and the value functions are not part of it: they are computed from it.',
    keyPoints: [
      'states $S$ and actions $A$',
      'transition function $T(s, a, s^{\\prime}) = p(s^{\\prime} \\mid s, a)$',
      'reward function $R$ and discount factor $\\gamma$',
      'the policy, the return and the values are not in the tuple',
    ],
    source: 'Review deck slide 26',
    marks: 2,
  },
  {
    id: 'rl-sa-combine',
    prompt: '**(3 marks)** In no more than 110 words: how does reinforcement learning combine the components of an MDP to learn a policy?',
    wordLimit: 110,
    model: 'The agent observes its state $s \\in S$ and chooses an action $a \\in A$, usually ε-greedily from its current $Q$ values. The environment, through $T$, moves it to $s^{\\prime}$, and $R$ gives it a reward $r$. From each sample $(s, a, r, s^{\\prime})$ it updates $Q(s, a) \\leftarrow Q(s, a) + \\alpha[r + \\gamma \\max_{a^{\\prime}} Q(s^{\\prime}, a^{\\prime}) - Q(s, a)]$, so $\\gamma$ discounts the estimated future value. It never needs $T$ or $R$ explicitly: repeated experience averages over them. As $Q$ converges to $Q^*$, the greedy policy $\\pi(s) = \\arg\\max_a Q(s, a)$ becomes optimal, maximising the expected discounted return.',
    keyPoints: [
      'the agent acts in $S$ with $A$ (ε-greedy: explore and exploit)',
      'the world ($T$) gives the next state and $R$ the reward: a sample $(s, a, r, s^{\\prime})$',
      'the TD / Q-learning update towards $r + \\gamma \\max_{a^{\\prime}} Q(s^{\\prime}, a^{\\prime})$, with $\\gamma$ discounting the future',
      'model-free: $T$ and $R$ are never needed explicitly',
      'the policy is greedy in $Q$: $\\pi(s) = \\arg\\max_a Q(s, a)$, optimal as $Q \\to Q^*$',
    ],
    source: 'Review deck slide 26',
    marks: 3,
  },
  {
    id: 'rl-sa-challenges',
    prompt: '**(4 marks)** In no more than 130 words: what are some challenges of using reinforcement learning to find robot control policies, and what strategies help overcome them?',
    wordLimit: 130,
    model: '**Sample inefficiency:** RL needs millions of trials, too slow and costly on hardware; train in simulation and use demonstrations to start from a reasonable policy. **Unsafe exploration:** random actions can damage the robot or its surroundings; explore in simulation and add safety limits or a fallback controller. **Reward design:** sparse rewards are rarely found and badly specified ones are exploited; use reward shaping (intermediate rewards for progress). **Partial observability:** the sensors do not reveal the full Markov state; add velocity or recent history, or use a state estimator. **Sim-to-real gap:** simulated physics and sensing differ from reality; use domain randomisation, system identification and fine-tuning on the real robot.',
    keyPoints: [
      'sample inefficiency → simulation, demonstrations',
      'unsafe exploration → simulation, safety limits',
      'reward design → reward shaping',
      'partial observability → richer state, memory or state estimation',
      'sim-to-real gap → domain randomisation, system identification, fine-tuning',
    ],
    source: 'Review deck slide 26; Notes §8',
    marks: 4,
  },
  {
    id: 'rl-sa-explore',
    prompt: '**(2 marks)** In no more than 80 words: why does a Q-learning agent need to explore, and how does ε-greedy action selection achieve it?',
    wordLimit: 80,
    model: 'Q-learning only improves the values of the actions it actually tries. If it always took the action that currently looks best, an early, mediocre route could lock in and better actions would never be discovered. ε-greedy takes the greedy action with probability $1 - \\varepsilon$ and a random action with probability $\\varepsilon$, so every action keeps being tried. A large $\\varepsilon$ wastes effort on random moves, so $\\varepsilon$ is often decayed as the values improve.',
    keyPoints: [
      'values only improve for actions that are tried; pure exploitation can lock in a mediocre route',
      'ε-greedy: greedy with probability $1 - \\varepsilon$, random with probability $\\varepsilon$',
      'every action keeps being tried (needed for convergence)',
      'trade-off: a large $\\varepsilon$ performs badly, so decay it',
    ],
    source: 'Original; Notes §8; review deck slide 25',
    marks: 2,
  },
  {
    id: 'rl-sa-vi-vs-q',
    prompt: '**(2 marks)** In no more than 80 words: contrast value iteration with Q-learning. When would you use each?',
    wordLimit: 80,
    model: 'Value iteration is model-based: it needs the transition probabilities $T$ and the rewards $R$, and sweeps the Bellman backup $V(s) \\leftarrow \\max_a \\sum_{s^{\\prime}} T[R + \\gamma V(s^{\\prime})]$ over every state until it converges. Q-learning is model-free: it learns $Q(s, a)$ from experienced transitions $(s, a, r, s^{\\prime})$, one update at a time, so it needs exploration and many samples. Use value iteration when an accurate model is available; use Q-learning when the dynamics are unknown or too hard to model.',
    keyPoints: [
      'value iteration is model-based: it needs $T$ and $R$ and updates every state each sweep',
      'Q-learning is model-free: it learns from sampled transitions, one entry at a time',
      'Q-learning needs exploration and many samples',
      'choice: accurate model → value iteration; unknown dynamics → Q-learning',
    ],
    source: 'Original; Notes §8',
    marks: 2,
  },
];
