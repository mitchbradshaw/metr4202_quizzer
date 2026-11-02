// Concept cards and flashcards for 'rl' (summary notes §8; 2023 Q16–Q18, Q28, Q29; 2024 Q16–Q18, Q26;
// 2025 Q16–Q18, Q26; review deck slides 25–26). Card ids are fixed: sims, generators and Home link to them.
import type { ConceptCard, Flashcard } from '../../engine/types';

export const cards: ConceptCard[] = [
  // ------------------------------------------------------------------ the RL problem and the MDP
  {
    id: 'rl-mdp',
    title: 'The RL problem and the MDP tuple',
    lecture: 'Notes §8; review deck slides 14, 25–26',
    formulas: [
      '$$\\text{MDP} = (S,\\ A,\\ T,\\ R,\\ \\gamma), \\qquad T(s, a, s^{\\prime}) = p(s^{\\prime} \\mid s, a), \\qquad \\textstyle\\sum_{s^{\\prime}} T(s, a, s^{\\prime}) = 1$$',
      '$$\\begin{array}{c|l|l} & \\text{element} & \\text{gridworld example} \\\\ \\hline S & \\text{states} & \\text{the free cells} \\\\ A & \\text{actions} & \\text{up, right, down, left} \\\\ T & \\text{transition probabilities } p(s^{\\prime} \\mid s, a) & 0.8 \\text{ as intended, } 0.1 \\text{ slip to each side} \\\\ R & \\text{reward function} & +1 \\text{ goal},\\ -1 \\text{ pit},\\ -0.04 \\text{ per step} \\\\ \\gamma & \\text{discount factor} \\in [0, 1) & 0.9 \\end{array}$$',
      '$$\\pi : S \\to A, \\qquad \\pi^* = \\arg\\max_{\\pi}\\ \\mathbb{E}_{\\pi}\\Big[\\textstyle\\sum_{k=0}^{\\infty} \\gamma^k r_{t+k+1}\\Big]$$',
      '$$\\text{not in the tuple: the timestep } t, \\text{ the return } G_t, \\text{ the policy } \\pi, \\ V, \\ Q, \\text{ a sensor model } p(z \\mid x)$$',
    ],
    what: 'Reinforcement learning (RL) finds a **policy** by trial and error. At each step the agent sees the state $s_t$ and takes an action $a_t$; the world answers with a reward $r_{t+1}$ and a next state $s_{t+1}$; the agent adjusts its behaviour to collect as much discounted reward as it can. The problem it solves is a **Markov decision process** (MDP), written as the tuple $(S, A, T, R, \\gamma)$: the states, the actions, the transition probabilities $T(s, a, s^{\\prime})$ (outcomes may be random, such as a wheel slipping), the reward function and the discount factor.\n\nThe tuple defines the **problem**. The policy $\\pi$ is its **solution**, and the return $G_t$ and the values $V$ and $Q$ are computed **from** it, so none of them is in the tuple. When $T$ and $R$ are known you can compute the optimal policy directly (value iteration: planning under uncertainty); when they are not, RL learns it from experience.',
    when: '- “Which of the following is NOT in a Markov decision process tuple?” (2023 Q16: the timestep; 2024 Q16: the return).\n- “Which of the following IS in an MDP tuple?” (2025 Q16: the state; the distractors were the sensor model, the return and the policy).\n- “A policy maps …” (2023 Q17: states to actions).\n- “What are the elements in an MDP tuple? How does RL combine the components of an MDP to learn a policy?” (review deck slide 26).',
    how: [
      'Write the tuple from memory, $(S, A, T, R, \\gamma)$, and say each element in words: states, actions, transition probabilities, reward function, discount factor.',
      'For each option ask: is it part of the **problem statement**, or something **computed from** it? The return (from the rewards and $\\gamma$), the policy (the answer), $V$ and $Q$ (computed) and the timestep (an index, not an element) are all out.',
      'A sensor model $p(z \\mid x)$ is out too: an MDP assumes the agent observes the state exactly. Observations belong to the Bayes filter, and to POMDPs, which add them to the tuple.',
      'A policy maps **states to actions**: $\\pi(s) = a$ (or a probability $\\pi(a \\mid s)$ for a stochastic policy). The objective is the expected discounted return, not the next reward.',
      'To say how RL uses the tuple: the agent acts in $S$ with $A$; the world ($T$) picks the next state and $R$ the reward; the agent turns each sample $(s, a, r, s^{\\prime})$ into a better estimate of $Q$, with $\\gamma$ weighting the future; its policy is greedy in $Q$.',
      'Choose the solver: $T$ and $R$ known → value iteration (model-based); unknown → Q-learning from samples (model-free).',
    ],
    traps: [
      {
        title: 'Timestep or return in the tuple',
        detail: 'The timestep $t$ only indexes the sequence, and $G_t$ is computed from the rewards and $\\gamma$. Each was the key of a “NOT in the tuple” question.',
        trapId: 'mdp-tuple',
        source: '2023 Q16, 2024 Q16',
      },
      {
        title: 'The policy as part of the problem',
        detail: 'The policy is what you are trying to find. Putting it in the tuple confuses the question with its answer.',
        trapId: 'mdp-tuple',
        source: '2025 Q16',
      },
      {
        title: 'A sensor model in an MDP',
        detail: 'An MDP assumes the state is observed exactly; $p(z \\mid x)$ is the Bayes filter’s sensor model. Adding observations gives a POMDP, a different and much harder problem.',
        source: '2025 Q16',
      },
      {
        title: 'A policy that maps rewards or actions',
        detail: '“Actions to states” describes the transition function and “to rewards” the reward function. The policy maps states to actions.',
        source: '2023 Q17',
      },
    ],
    more: '**The tuple on a gridworld.** The states are the free cells; the actions are up, right, down and left; with probability 0.8 the robot moves as intended and with 0.1 each it slips to one side, so $T$ is stochastic; entering the goal pays +1, the pit −1, and every other step −0.04; $\\gamma = 0.9$. Everything else (the arrows of the policy, the numbers of $V$) is computed from these five.\n\n**MDPs and planning.** Graph search is the special case of an MDP in which every action has exactly one outcome ($T$ is 0 or 1) and the reward is minus the edge cost: then a path is enough. Once outcomes are random the robot may end up anywhere, so the answer must be a policy with an action for every state (see the policy vs path card).\n\n**Reward conventions.** Lectures and textbooks write the reward as $R(s)$, $R(s, a)$ or $R(s, a, s^{\\prime})$; the exam only needs “the reward function”. Some books add a start-state distribution or a horizon to the tuple, but the course tuple is the five above.',
    exploreIds: ['mdp', 'gridworld'],
    solveIds: ['rl-vi'],
  },

  // ------------------------------------------------------------------ returns and discounting
  {
    id: 'rl-returns',
    title: 'The return and the discount factor γ',
    lecture: 'Notes §8; 2023 Q28',
    formulas: [
      '$$G_t = r_{t+1} + \\gamma\\, r_{t+2} + \\gamma^2 r_{t+3} + \\cdots = \\sum_{k=0}^{\\infty} \\gamma^k\\, r_{t+k+1} = r_{t+1} + \\gamma\\, G_{t+1}$$',
      '$$r = c \\text{ every step} \\;\\Rightarrow\\; G_t = \\frac{c}{1 - \\gamma}, \\qquad |G_t| \\le \\frac{r_{\\max}}{1 - \\gamma}, \\qquad \\text{horizon} \\approx \\frac{1}{1 - \\gamma} \\text{ steps}$$',
      '$$\\begin{array}{c|c|c|l} \\gamma & \\gamma^{10} & 1/(1-\\gamma) & \\text{behaviour} \\\\ \\hline 0 & 0 & 1 & \\text{myopic: the next reward only} \\\\ 0.5 & 0.001 & 2 & \\text{short-sighted} \\\\ 0.9 & 0.35 & 10 & \\text{looks about 10 steps ahead} \\\\ 0.99 & 0.90 & 100 & \\text{far-sighted, slower to learn} \\end{array}$$',
    ],
    what: 'The **return** $G_t$ is what RL maximises: the sum of all the rewards still to come, each one shrunk by a factor $\\gamma$ for every step of delay. The first reward, $r_{t+1}$, counts in full ($\\gamma^0 = 1$); a reward $k$ steps later counts $\\gamma^k$ of its value.\n\nThe **discount factor** $\\gamma \\in [0, 1)$ sets how far ahead the agent looks. With $\\gamma = 0$ it only cares about the next reward; with $\\gamma$ near 1 a distant reward is worth almost as much as an immediate one, so the agent will accept costs now for a payoff later. Discounting also keeps the return of a never-ending task finite, and says that a reward now is surer than one later. Because it changes what a long route to a big reward is worth compared with a short route to a small one, changing $\\gamma$ can change the optimal policy, not just the numbers.',
    when: '- “In the context of reinforcement learning, describe the role of the discount factor $\\gamma$” (2023 Q28, 1 mark).\n- “In reinforcement learning, the policy is trained …” (2024 Q17: none of immediate, final or average reward; 2025 Q17: to maximise the cumulative discounted reward).\n- Computing a discounted return from a list of rewards (exam mode).',
    how: [
      'List the rewards in time order, $r_{t+1}, r_{t+2}, \\ldots$: the reward for the first action comes first, and its weight is $\\gamma^0 = 1$.',
      'Multiply the $k$-th reward (counting from $k = 0$) by $\\gamma^k$ and add. Or work backwards from the end with $G = r + \\gamma G_{\\text{next}}$, starting from $G = 0$ after the terminal state: quicker, and it catches power slips.',
      'A constant reward $c$ forever gives $c/(1 - \\gamma)$; $n$ steps of $c$ give $c(1 - \\gamma^n)/(1 - \\gamma)$.',
      'To explain $\\gamma$ in words: it weights future rewards against immediate ones; a small $\\gamma$ makes the agent short-sighted, $\\gamma \\to 1$ far-sighted; $\\gamma < 1$ keeps an infinite sum finite.',
      'Read objective options carefully: the policy maximises the **expected cumulative discounted** reward. “Immediate”, “next-step”, “final”, “average” and plain “total” reward are all wrong.',
    ],
    traps: [
      {
        title: 'Discounting the first reward',
        detail: '$G_t$ starts with $r_{t+1}$ at weight $\\gamma^0 = 1$. Starting the powers at 1 shrinks every term by an extra $\\gamma$: for rewards 0, 0, 10 with $\\gamma = 0.9$ you get 7.29 instead of 8.1.',
        source: 'Notes §8',
      },
      {
        title: 'Maximising the immediate, final or average reward',
        detail: 'None of these is the RL objective, which is why the key of 2024 Q17 was “None of the above”. Only $\\gamma = 0$ makes an agent maximise the next reward alone.',
        trapId: 'read-the-stem',
        source: '2024 Q17',
      },
      {
        title: '“Total reward” for “cumulative discounted reward”',
        detail: '2025 Q17 offered both. The undiscounted total is the objective only when $\\gamma = 1$, and the course takes $\\gamma < 1$.',
        source: '2025 Q17',
      },
      {
        title: 'Thinking γ only rescales the values',
        detail: 'It can change which route is best: with step costs, a small $\\gamma$ makes a distant goal not worth the walk (worked example in More depth).',
        source: 'Notes §8',
      },
    ],
    more: '**Worked example.** A robot needs 4 moves to reach a fast charger: rewards $-1, -1, -1, +10$.\n\n$$\\begin{array}{c|cccc|c} \\gamma & r_1 & \\gamma r_2 & \\gamma^2 r_3 & \\gamma^3 r_4 & G_0 \\\\ \\hline 0.9 & -1 & -0.9 & -0.81 & 7.29 & \\mathbf{4.58} \\\\ 0.5 & -1 & -0.5 & -0.25 & 1.25 & \\mathbf{-0.50} \\end{array}$$\n\nBackwards with $\\gamma = 0.9$: $G_3 = 10$, $G_2 = -1 + 0.9(10) = 8$, $G_1 = -1 + 0.9(8) = 6.2$, $G_0 = -1 + 0.9(6.2) = 4.58$.\n\nNow add a slow charger one step away that pays +1 and ends the episode. With $\\gamma = 0.9$ the far charger wins ($4.58 > 1$); with $\\gamma = 0.5$ the near one wins ($1 > -0.5$). Same world, same rewards, different optimal policy. The gridworld sim has a two-exit map built for this: find the $\\gamma$ at which the best exit flips.\n\n**Why discount at all?** (1) It keeps an infinite sum finite: $|G_t| \\le r_{\\max}/(1 - \\gamma)$. (2) A reward now is more certain than one later: $\\gamma$ can be read as the probability that the episode carries on for another step. (3) It sets an effective horizon of about $1/(1 - \\gamma)$ steps. A larger $\\gamma$ also makes learning slower, because value has to propagate further back from the rewards.',
    exploreIds: ['gridworld'],
    solveIds: ['rl-return'],
  },

  // ------------------------------------------------------------------ value functions and the optimal policy
  {
    id: 'rl-values',
    title: 'Value functions V and Q, and the optimal policy',
    lecture: 'Notes §8; review deck slide 25; 2025 Q18',
    formulas: [
      '$$V^{\\pi}(s) = \\mathbb{E}_{\\pi}\\big[\\,G_t \\mid s_t = s\\,\\big], \\qquad Q^{\\pi}(s, a) = \\mathbb{E}_{\\pi}\\big[\\,G_t \\mid s_t = s,\\ a_t = a\\,\\big]$$',
      '$$Q^*(s, a) = \\sum_{s^{\\prime}} T(s, a, s^{\\prime})\\Big[R(s, a, s^{\\prime}) + \\gamma \\max_{a^{\\prime}} Q^*(s^{\\prime}, a^{\\prime})\\Big], \\qquad V^*(s) = \\max_a Q^*(s, a)$$',
      '$$\\pi^*(s) = \\arg\\max_a Q^*(s, a)$$',
      '$$\\text{value iteration: } V_{k+1}(s) = \\max_a \\sum_{s^{\\prime}} T(s, a, s^{\\prime})\\Big[R(s, a, s^{\\prime}) + \\gamma\\, V_k(s^{\\prime})\\Big], \\qquad V_0 = 0$$',
    ],
    what: 'A **value function** says how good things are in the long run, as an expected return. $V^{\\pi}(s)$: how good it is to **be in** state $s$ and follow $\\pi$ from there. $Q^{\\pi}(s, a)$: how good it is to **take action** $a$ in $s$ first, then follow $\\pi$. The optimal values $V^*$ and $Q^*$ are the best that any policy can achieve, and they satisfy the Bellman equation (formula box): the value of an action is the expected reward plus the discounted value of where it leads.\n\nOnce you have $Q^*$, acting optimally needs no model and no search: in each state take the action with the largest $Q^*$. That is why RL so often learns $Q$. With only $V^*$ you would still need $T$ and $R$ to look one step ahead. **Value iteration** finds $V^*$ when $T$ and $R$ are known, by applying the Bellman backup to every state, sweep after sweep, until the numbers stop changing.',
    when: '- “What is the relationship between the optimal policy $\\pi^*(s)$ and the optimal value function $Q^*(s, a)$?” (2025 Q18: the policy takes the action that maximises $Q^*$ in each state).\n- “Define a Markov decision process and associated terms such as the state value function and the action value function” (review deck slide 25).\n- One value-iteration sweep, or reading the greedy policy off a $Q$ table (exam mode).',
    how: [
      'Say what each function answers: $V$ “how good is this state?”, $Q$ “how good is this action here?”. Both are expected discounted returns under a stated policy, not single rewards.',
      'Policy from a $Q$ table: in each state’s row take the action (column) with the largest entry, $\\pi^*(s) = \\arg\\max_a Q^*(s, a)$; ties can go either way. $\\max_a$ gives the number $V^*(s)$, $\\arg\\max_a$ the action.',
      'Policy from $V^*$: compute $Q(s, a) = \\sum_{s^{\\prime}} T\\,[R + \\gamma V^*(s^{\\prime})]$ for each action, then take the argmax. This one-step lookahead needs the model.',
      'One value-iteration sweep: for every state and every action compute $\\sum_{s^{\\prime}} T(s, a, s^{\\prime})[R + \\gamma V_k(s^{\\prime})]$ from the **old** values $V_k$, and keep the largest as $V_{k+1}(s)$. When the reward is paid on entering a terminal state, terminal states keep $V = 0$.',
      'Repeat until $V$ stops changing. In a world with a single goal reward, value spreads backwards from the goal by one step per sweep.',
    ],
    traps: [
      {
        title: 'π* and Q* are “equivalent”',
        detail: 'They are different objects: $Q^*$ maps state–action pairs to numbers, $\\pi^*$ maps states to actions. The policy is **derived** from $Q^*$ by an argmax, so “equivalent” and “all of the above” were wrong in 2025 Q18.',
        source: '2025 Q18',
      },
      {
        title: 'A value is a reward',
        detail: '$Q^*(s, a)$ is an expected **discounted return**: the immediate reward plus everything that follows. Describing it as “the reward received by following the optimal policy” (2025 Q18 (c)) misses both the expectation and the discounting.',
        source: '2025 Q18',
      },
      {
        title: 'Mixing old and new values in one sweep',
        detail: 'The exam convention is synchronous: every $V_{k+1}$ is computed from the old $V_k$. Updating in place also converges, but gives different numbers after one sweep.',
        source: 'Exam mode convention',
      },
      {
        title: 'max vs argmax',
        detail: '$\\max_a Q^*(s, a) = V^*(s)$ is a value; $\\arg\\max_a Q^*(s, a) = \\pi^*(s)$ is an action. Answering “what is the optimal action?” with a number loses the mark.',
        source: 'Notes §8',
      },
    ],
    more: '**Worked value iteration.** A corridor A – B – C – G with deterministic moves; G is terminal. Moving into G pays +10, every other move −1 (bumping into a wall leaves the robot where it is); $\\gamma = 0.9$, $V_0 = 0$.\n\n$$\\begin{array}{c|ccc} k & V_k(A) & V_k(B) & V_k(C) \\\\ \\hline 0 & 0 & 0 & 0 \\\\ 1 & -1 & -1 & 10 \\\\ 2 & -1.9 & 8 & 10 \\\\ 3 & 6.2 & 8 & 10 \\\\ 4 & 6.2 & 8 & 10 \\end{array}$$\n\nSweep 1: only C can reach the goal, $V_1(C) = 10$; A and B can only pay for a step, $-1 + 0.9(0) = -1$. Sweep 2: $V_2(B) = -1 + 0.9\\,V_1(C) = 8$ and $V_2(A) = -1 + 0.9\\,V_1(B) = -1.9$. Sweep 3: $V_3(A) = -1 + 0.9(8) = 6.2$. Nothing changes in sweep 4, so $V^* = (6.2, 8, 10)$ and $\\pi^*$ is “right” everywhere. The goal’s value travelled one cell per sweep.\n\n**With slip.** If “right” works with probability 0.8 and otherwise leaves the robot in place, $Q(B, \\text{right}) = 0.8\\,[-1 + 0.9\\,V(C)] + 0.2\\,[-1 + 0.9\\,V(B)]$: every term of the Bellman sum is weighted by its probability.',
    exploreIds: ['gridworld', 'mdp'],
    solveIds: ['rl-vi', 'rl-policy'],
  },

  // ------------------------------------------------------------------ TD learning and Q-learning
  {
    id: 'rl-qlearning',
    title: 'TD learning, Q-learning and ε-greedy exploration',
    lecture: 'Notes §8; review deck slides 25–26',
    formulas: [
      '$$Q(s, a) \\leftarrow Q(s, a) + \\alpha\\Big[\\underbrace{r + \\gamma \\max_{a^{\\prime}} Q(s^{\\prime}, a^{\\prime})}_{\\text{TD target}} - Q(s, a)\\Big]$$',
      '$$\\delta = r + \\gamma \\max_{a^{\\prime}} Q(s^{\\prime}, a^{\\prime}) - Q(s, a) \\ \\ \\text{(TD error)}, \\qquad \\max_{a^{\\prime}} Q(s^{\\prime}, a^{\\prime}) = 0 \\text{ if } s^{\\prime} \\text{ is terminal}$$',
      '$$a_t = \\begin{cases} \\arg\\max_a Q(s_t, a) & \\text{with probability } 1 - \\varepsilon \\\\ \\text{a random action} & \\text{with probability } \\varepsilon \\end{cases} \\qquad P(\\text{greedy action}) = 1 - \\varepsilon + \\frac{\\varepsilon}{|A|}$$',
      '$$\\begin{array}{l|l|l} & \\text{value iteration} & \\text{Q-learning} \\\\ \\hline \\text{needs } T \\text{ and } R & \\text{yes (model-based)} & \\text{no (model-free)} \\\\ \\text{data} & \\text{none: it sweeps the model} & \\text{experienced transitions } (s, a, r, s^{\\prime}) \\\\ \\text{each update} & \\text{every state, every sweep} & \\text{one } (s, a) \\text{ per step} \\\\ \\text{expectation over } s^{\\prime} & \\text{exact sum with } T & \\text{averaged over samples by } \\alpha \\end{array}$$',
    ],
    what: '**Temporal-difference (TD) learning** improves a guess using a slightly better guess: after one step it compares what it predicted, $Q(s, a)$, with what it now sees, the reward $r$ plus its own estimate of what follows. **Q-learning** applies this to the action values. After each transition $(s, a, r, s^{\\prime})$ it moves $Q(s, a)$ a fraction $\\alpha$ of the way towards the **TD target** $r + \\gamma \\max_{a^{\\prime}} Q(s^{\\prime}, a^{\\prime})$. It never needs $T$ or $R$: the world supplies the samples, and averaging over many visits replaces the sum over $T$ that value iteration computes. So Q-learning is **model-free**, and its greedy policy converges to $\\pi^*$ provided every action keeps being tried in every state.\n\nThat is why the agent explores. **ε-greedy** takes the best-known action most of the time and a random one with probability $\\varepsilon$, trading **exploitation** (use what you know) against **exploration** (find out whether something else is better).',
    when: '- “Describe the computation of an optimal policy via temporal difference” (review deck slide 25).\n- “How does reinforcement learning combine the components of an MDP to learn a policy?” (review deck slide 26).\n- One Q-learning update by hand, or ε-greedy action probabilities (exam mode).\n- Contrasting model-free learning with value iteration, which needs the model.',
    how: [
      'Write down $s$, $a$, $r$, $s^{\\prime}$, $\\alpha$, $\\gamma$ and the current $Q(s, a)$.',
      'Find $\\max_{a^{\\prime}} Q(s^{\\prime}, a^{\\prime})$: the largest entry in the **next** state’s row (0 if $s^{\\prime}$ is terminal).',
      'TD target $= r + \\gamma \\max_{a^{\\prime}} Q(s^{\\prime}, a^{\\prime})$; TD error $\\delta$ = target $- Q(s, a)$.',
      'New $Q(s, a) = Q(s, a) + \\alpha\\delta$. Only this one entry changes; every other entry stays as it was.',
      'ε-greedy probabilities, with the random branch drawing from all $|A|$ actions: the greedy action $1 - \\varepsilon + \\varepsilon/|A|$, each other action $\\varepsilon/|A|$.',
      'Parameter effects. $\\alpha$ is the step size: 0 never learns; 1 overwrites with the latest target (fine in a deterministic world, noisy in a random one). $\\varepsilon$ is exploration: 0 can lock onto the first route that works; a large value keeps acting randomly, so the agent behaves badly; decay it as learning proceeds. $\\gamma$ sets the horizon, as for the return.',
    ],
    traps: [
      {
        title: 'Taking the max over the current state',
        detail: 'The max is over the actions of the **next** state $s^{\\prime}$: it estimates the value of what follows the action just taken.',
        source: 'Notes §8',
      },
      {
        title: 'Forgetting α',
        detail: 'The new value equals the target only when $\\alpha = 1$. With $Q = 2$, a target of 3.5 and $\\alpha = 0.5$, the new value is 2.75, not 3.5.',
        source: 'Exam mode',
      },
      {
        title: 'Bootstrapping past a terminal state',
        detail: 'After a terminal transition there is no future, so the target is just $r$.',
        source: 'Exam mode',
      },
      {
        title: 'P(greedy action) = 1 − ε',
        detail: 'If the random branch picks among all actions it can pick the greedy one too, giving $1 - \\varepsilon + \\varepsilon/|A|$: 0.925 for $\\varepsilon = 0.1$ and 4 actions. Check which convention a question uses.',
        source: 'Exam mode',
      },
      {
        title: 'Using the next action taken instead of the max',
        detail: 'Bootstrapping from the action the ε-greedy agent actually takes next is SARSA, a different (on-policy) method. Q-learning uses the max, so it learns the greedy policy’s values while it explores (off-policy).',
        source: 'Notes §8',
      },
    ],
    more: '**Worked update.** $Q(s, a) = 2$; the robot gets $r = -1$ and lands in $s^{\\prime}$, whose row is $Q(s^{\\prime}, \\cdot) = (5, 3, 0, 1)$; $\\gamma = 0.9$, $\\alpha = 0.5$.\n\n$$\\text{target} = -1 + 0.9 \\times 5 = 3.5, \\qquad \\delta = 3.5 - 2 = 1.5, \\qquad Q(s, a) \\leftarrow 2 + 0.5 \\times 1.5 = \\mathbf{2.75}$$\n\n**Why one sample can stand in for $T$.** Value iteration computes $\\sum_{s^{\\prime}} T(s, a, s^{\\prime})[\\ldots]$ exactly. Q-learning sees one $s^{\\prime}$ per visit, but the world draws it with exactly those probabilities, and a small $\\alpha$ makes $Q$ a running average of the targets. Visit often enough and the average becomes the expectation.\n\n**Convergence.** Tabular Q-learning converges to $Q^*$ if every state–action pair is visited infinitely often and $\\alpha$ decays suitably. Large or continuous state spaces replace the table with a function approximator such as a neural network (deep RL), which gives up that guarantee.',
    exploreIds: ['gridworld'],
    solveIds: ['rl-qupdate', 'rl-policy'],
  },

  // ------------------------------------------------------------------ policy vs planner path
  {
    id: 'rl-policy-vs-plan',
    title: 'A policy vs a motion-planner path',
    lecture: 'Notes §8; 2023 Q29',
    formulas: [
      '$$\\begin{array}{l|l|l} & \\text{motion planner (A*, RRT*)} & \\text{RL policy } \\pi(s) \\\\ \\hline \\text{output} & \\text{one path from one start} & \\text{an action for every state} \\\\ \\text{built from} & \\text{a known map and model} & \\text{experience and reward} \\\\ \\text{execution} & \\text{open loop: replan if disturbed} & \\text{closed loop: reads } s_t \\text{ every step} \\\\ \\text{random outcomes} & \\text{assumed away} & \\text{built in, through } T \\\\ \\text{cost} & \\text{a search per query} & \\text{heavy training, then a lookup} \\\\ \\text{guarantees} & \\text{complete, optimal (for the model)} & \\text{none in general} \\end{array}$$',
    ],
    what: 'Both answer “how do I reach the goal?”, in different forms. A **motion planner** searches a known map and model and returns **one path**: a sequence of configurations from one particular start to the goal. The robot follows it open-loop (or with a tracking controller); if it is pushed off the path, the map is wrong or an action turns out differently, it has to replan.\n\nAn **RL policy** $\\pi(s)$ gives an action for **every state**, learned from reward and experience rather than computed from a map. It is closed-loop by construction: at each step the robot looks at where it actually is and acts, so it works from any start and copes with random outcomes. The price is a great deal of training (usually in simulation), a reward function to design, and no hard guarantee that the result is optimal or collision-free.',
    when: '- “Consider the task of getting a mobile robot to drive autonomously to a target position. Explain how a policy found via reinforcement learning differs from a path found via a motion planning method” (2023 Q29, 2 marks).\n- “A policy maps …” (2023 Q17).\n- Choosing between them for a scenario: a known static map with reliable motion suits a planner; uncertain dynamics or many possible start states suit a policy.',
    how: [
      'Define both objects: a path is a sequence of configurations from one start; a policy is a map $\\pi : S \\to A$ over all states.',
      'Contrast where they come from: a search over a known model or map vs learning from reward by trial and error.',
      'Contrast how they are executed: open-loop following (disturbed → replan) vs closed-loop reaction (disturbed → apply $\\pi$ at the new state).',
      'Contrast uncertainty: the planner assumes each action has its planned outcome; the policy was trained with the random outcomes of $T$.',
      'Give the price of each: planners have guarantees for their model and need no training; policies need heavy training, a good reward and a good simulator, and offer no hard guarantees.',
      'For 2 marks, two clear contrasts, each with a reason, are enough: say what each produces, and how each is executed.',
    ],
    traps: [
      {
        title: '“A policy is a path stored in a table”',
        detail: 'A path covers only the states along one route. A policy also says what to do in states the robot was never meant to visit, which is what makes it robust to being knocked off course.',
        source: '2023 Q29',
      },
      {
        title: '“RL is always better”',
        detail: 'For a known, static map with reliable motion a planner is simpler, needs no training and is provably complete and optimal. RL earns its cost when the dynamics are uncertain or hard to model.',
        source: 'Notes §8',
      },
      {
        title: 'Calling a path-tracking controller a policy',
        detail: 'A controller that tracks a planned path is closed-loop only around that path; far from it, it heads back to the path, not optimally to the goal.',
        source: 'Notes §8',
      },
    ],
    more: '**Where the two meet.** Run Dijkstra backwards from the goal over every cell of a grid and you get the cost-to-go of every cell; stepping to the neighbour with the lowest cost-to-go is then a policy, from any start. That is value iteration on a deterministic MDP with reward = −(step cost). Planning becomes policy-making once you compute the answer for **all** states instead of one start; RL is what you do when you cannot write the model down.\n\n**In practice** the two are often combined: a global planner gives waypoints, and a learned policy handles the fast, hard-to-model part (legged locomotion, grasping, local obstacle avoidance).',
    exploreIds: ['gridworld', 'plan/grid'],
    solveIds: ['rl-policy'],
  },

  // ------------------------------------------------------------------ Markov assumption and the state space
  {
    id: 'rl-markov-state',
    title: 'The Markov assumption and designing the state',
    lecture: 'Notes §1, §8; 2024 Q26',
    formulas: [
      '$$P(s_{t+1}, r_{t+1} \\mid s_t, a_t, s_{t-1}, a_{t-1}, \\ldots, s_0) = P(s_{t+1}, r_{t+1} \\mid s_t, a_t)$$',
      '$$\\begin{array}{l|l|l} \\text{task} & \\text{not Markov} & \\text{Markov (sufficient)} \\\\ \\hline \\text{moving robot or ball} & \\text{position } x & (x, \\dot x) \\\\ \\text{balancing a pole on a cart} & (x, \\theta) & (x, \\dot x, \\theta, \\dot\\theta) \\\\ \\text{learning from camera images} & \\text{one frame} & \\text{the last few frames} \\\\ \\text{long missions} & \\text{pose only} & \\text{pose and battery level} \\end{array}$$',
    ],
    what: 'The **Markov assumption**: the current state and action carry everything needed to predict the next state and reward; how the agent got there adds nothing (formula box). An MDP is defined by it, and every RL method leans on it: $V(s)$, $Q(s, a)$ and the policy are functions of the state alone, and the TD target assumes that what follows $(s, a)$ does not depend on the past.\n\nSo choosing the state is a modelling decision. Put in every quantity that affects what happens next: velocity as well as position, the payload, the battery level, the goal if it moves. Leave one out and the problem becomes **partially observable**: the same “state” is followed by different outcomes depending on hidden history, its value is an average over situations the agent cannot tell apart, and learning becomes slow, unstable or wrong. But every extra variable multiplies the number of states to visit, so include what is sufficient and no more. Randomness is fine: a wheel that slips with a fixed probability keeps the problem Markov.',
    when: '- “Reinforcement learning is a strategy used to find optimal policies for an MDP. Explain the Markov assumption and its implications on defining the RL state space” (2024 Q26, 3 marks).\n- Partial observability as a challenge of real-world RL (review deck slide 26).\n- The same assumption underlies the Bayes filter (Bayes topic: “does this break the Markov assumption?”).',
    how: [
      'State the assumption in words (the future depends only on the present state and action, not on the history) and in symbols (formula box).',
      'Say why RL needs it: values and policies are indexed by state, and every update assumes the next state’s distribution depends only on $(s, a)$.',
      'Implication 1: the state must be **sufficient**. Give an example of a missing variable and what goes wrong (position without velocity: the same position can be followed by different next positions).',
      'Implication 2: if one observation cannot be made sufficient, add memory (stack recent observations) or a state estimate (a filter); otherwise the agent faces a partially observable problem.',
      'Implication 3: leave out what does not matter. The number of states grows exponentially with the number of variables, so learning needs far more experience.',
      'For 3 marks: the definition, a concrete missing variable with its consequence, and the size trade-off.',
    ],
    traps: [
      {
        title: '“Markov means deterministic”',
        detail: 'Random outcomes are allowed: $T$ is a probability. What breaks the assumption is a dependence on history that the state does not record, such as a motor that heats up or a velocity that is not in the state.',
        trapId: 'markov',
        source: 'Notes §1; 2024 Q26',
      },
      {
        title: '“Put everything in the state”',
        detail: 'Irrelevant variables multiply the size of the state space and slow learning: the state should be sufficient, not exhaustive.',
        source: '2024 Q26',
      },
      {
        title: 'Treating the observation as the state',
        detail: 'One camera image or one lidar scan is an observation: it does not show velocities or what is hidden behind an obstacle. Using it as the state quietly breaks the Markov assumption.',
        source: 'Notes §8',
      },
    ],
    more: '**Why history-dependence hurts.** Suppose the state is position only, and the robot sometimes reaches cell X moving fast (it then overshoots into the wall) and sometimes slowly (it stops at the goal). The table has a single $Q(X, \\text{forward})$ for both cases, so it learns an average that is right in neither, and it can never learn to brake earlier.\n\n**Fixes for partial observability.** Add the missing variable; stack the last few observations (two frames give a velocity); use a recurrent network that keeps a memory; or estimate the state with a Bayes filter and act on the belief. A belief $b(s)$ is itself a Markov state: that is the idea behind POMDPs and the belief-space planning of the multi-robot topic.',
    exploreIds: ['bayes/markov'],
    solveIds: [],
  },

  // ------------------------------------------------------------------ challenges and sim-to-real
  {
    id: 'rl-challenges',
    title: 'RL on real robots: challenges, sim-to-real and fixes',
    lecture: 'Notes §8; review deck slide 26; 2025 Q26',
    formulas: [
      '$$\\begin{array}{l|l|l} \\text{challenge} & \\text{why it bites on a robot} & \\text{typical fixes} \\\\ \\hline \\text{sample inefficiency} & \\text{millions of trials, slow hardware} & \\text{simulation, demonstrations} \\\\ \\text{unsafe exploration} & \\text{random actions crash and break things} & \\text{simulation, safety limits} \\\\ \\text{reward design} & \\text{sparse rewards; loopholes get exploited} & \\text{reward shaping} \\\\ \\text{partial observability} & \\text{sensors miss part of the state} & \\text{memory, state estimation} \\\\ \\text{sim-to-real gap} & \\text{physics and sensing mis-modelled} & \\text{domain randomisation, system ID, fine-tuning} \\end{array}$$',
    ],
    what: 'RL shines in games because trials are free. On a robot they are slow, expensive and sometimes dangerous, and five problems recur: **sample inefficiency** (learning takes millions of trials), **unsafe exploration** (random actions crash the robot), **reward design** (a sparse reward is almost never found by chance, and a careless one gets exploited), **partial observability** (the sensors do not give the full state) and the **sim-to-real gap**.\n\nThe usual way round the first two is to train in **simulation**: failures cost nothing, episodes reset instantly, many copies run in parallel faster than real time, and the true state and reward are known. The drawback is that no simulator matches reality. Contact, friction, wheel slip, motor dynamics, latency, sensor noise and lighting all differ, and a policy can exploit the simulator’s quirks and then fail, or behave unsafely, on hardware. **Domain randomisation** trains across many randomised versions of the simulator so the real world looks like one more variation; **system identification** measures the real robot so the simulator matches it; **fine-tuning** on hardware closes the last gap. **Demonstrations** give learning a good start, and **reward shaping** rewards progress before the goal is reached.',
    when: '- “Robot control policies can be trained in simulation via RL and then deployed on real hardware. Identify and describe one benefit and one drawback of this methodology” (2025 Q26, 4 marks).\n- “Which of the following describes an issue related to the challenge of sim-to-real transfer?” (2023 Q18: a driving simulator without wheel slip; 2024 Q18: a grasping simulator that mis-models contact forces and friction).\n- “What are some challenges related to using RL for finding robot control policies? What are some strategies for overcoming them?” (review deck slide 26).',
    how: [
      'Sim-to-real MCQ: the key is a **mismatch between the simulator’s physics or sensing and the real world**. Problems that would happen however good the simulator was (no convergence, a wrong reward, a poor curriculum, a slow computer, a small network) are training problems, not transfer problems.',
      'Benefit (2 marks): name it (safe, fast, cheap data) and say why it matters: RL needs huge numbers of trials, many of them failures, which would be slow, costly or dangerous on hardware; simulation gives instant resets, parallel runs and perfect state and reward.',
      'Drawback (2 marks): the sim-to-real gap. Name concrete mis-modelled effects (friction, contact, slip, latency, noise) and the consequence: the policy overfits to the simulator and performs poorly or unsafely on the robot.',
      'Add a mitigation to show depth: domain randomisation, system identification, fine-tuning on hardware.',
      'For “challenges and strategies”, pair each challenge with its fix (formula box) instead of two separate lists.',
    ],
    traps: [
      {
        title: 'Calling every training failure a sim-to-real problem',
        detail: 'Non-convergence, a wrong reward or a badly designed curriculum would go wrong in any simulator: they were the wrong options of 2024 Q18. Sim-to-real is about the **gap** between the simulator and the world.',
        source: '2024 Q18',
      },
      {
        title: 'Compute, network size or the training algorithm',
        detail: 'No GPU (slow training) and too few layers (a weak policy) are not transfer problems (2023 Q18 distractors), and a policy can run on a robot whatever algorithm produced it: value iteration vs policy iteration is irrelevant.',
        source: '2023 Q18',
      },
      {
        title: '“Domain randomisation makes the simulator accurate”',
        detail: 'It does the opposite: it deliberately varies the simulator so the policy becomes robust to a range of conditions, usually at the cost of a little performance at the nominal values. Making the simulator match the real robot is system identification.',
        source: 'Notes §8',
      },
      {
        title: 'A benefit without the “why”',
        detail: '“It is faster” earns little on its own. Say why speed and safety matter: RL needs millions of trials, many of them crashes.',
        source: '2025 Q26',
      },
    ],
    more: '**Reward design pitfalls.** A reward for “distance travelled” can be farmed by a robot that drives in tight circles; a reward only at the goal gives no signal until the goal is found by chance. Shaping adds intermediate rewards, such as minus the distance to the goal; a shaping term of the form $\\gamma\\Phi(s^{\\prime}) - \\Phi(s)$ adds guidance without changing which policy is optimal.\n\n**Other tools.** Learning from demonstrations (imitation learning) starts from a policy that already roughly works, so exploration is shorter and safer. Curriculum learning starts with easy versions of the task. Safety layers clip or override dangerous actions while learning on hardware. Model-based RL learns $T$ from data and plans with it, using fewer real trials.',
    exploreIds: ['sim2real'],
    solveIds: [],
  },
];

export const flashcards: Flashcard[] = [
  // the MDP
  {
    id: 'rl-f-tuple',
    front: 'The MDP tuple, element by element?',
    back: '$(S, A, T, R, \\gamma)$: the states, the actions, the transition probabilities $T(s, a, s^{\\prime}) = p(s^{\\prime} \\mid s, a)$, the reward function and the discount factor.',
    tags: ['mdp', 'mcq'],
  },
  {
    id: 'rl-f-not-tuple',
    front: 'Name five things that are NOT in the MDP tuple.',
    back: 'The timestep $t$ (2023 Q16), the return $G_t$ (2024 Q16), the policy $\\pi$ and the sensor model $p(z \\mid x)$ (2025 Q16 distractors), and the value functions $V$, $Q$. Also the learning settings $\\alpha$ and $\\varepsilon$.',
    tags: ['mdp', 'mcq'],
  },
  {
    id: 'rl-f-T',
    front: 'What does $T(s, a, s^{\\prime})$ give, and what must hold for each $(s, a)$?',
    back: 'The probability of landing in $s^{\\prime}$ after taking $a$ in $s$. Over all next states it sums to 1. With slip 0.8 / 0.1 / 0.1, one action has three possible outcomes.',
    tags: ['mdp'],
  },
  {
    id: 'rl-f-policy',
    front: 'A policy maps … to …?',
    back: 'States to actions: $\\pi : S \\to A$, or $\\pi(a \\mid s)$ for a stochastic policy (2023 Q17). It is the solution of the MDP, not part of it.',
    tags: ['mdp', 'mcq'],
  },
  {
    id: 'rl-f-objective',
    front: 'What is an RL policy trained to maximise?',
    back: 'The expected cumulative discounted reward, i.e. the expected return (2025 Q17). Not the immediate, next-step, final or average reward (2024 Q17: “None of the above”), and not the undiscounted total.',
    tags: ['returns', 'mcq'],
  },
  // returns
  {
    id: 'rl-f-return',
    front: 'Write the return $G_t$, and its one-step recursion.',
    back: '$$G_t = \\sum_{k=0}^{\\infty} \\gamma^k r_{t+k+1} = r_{t+1} + \\gamma\\, G_{t+1}$$ The first reward has weight $\\gamma^0 = 1$.',
    tags: ['returns'],
  },
  {
    id: 'rl-f-gamma-role',
    front: 'The role of the discount factor γ, in one mark’s worth.',
    back: 'It weights future rewards relative to immediate ones (a reward $k$ steps ahead counts $\\gamma^k$). Small $\\gamma$: short-sighted; $\\gamma \\to 1$: far-sighted. $\\gamma < 1$ also keeps the infinite-horizon return finite (2023 Q28).',
    tags: ['returns', 'short-answer'],
  },
  {
    id: 'rl-f-gamma0',
    front: 'γ = 0: what does the agent optimise?',
    back: 'Only the next reward, $G_t = r_{t+1}$: it is completely myopic and ignores every later consequence of its action.',
    tags: ['returns', 'parameters'],
  },
  {
    id: 'rl-f-geometric',
    front: 'A reward of 1 every step forever, γ = 0.9: the return?',
    back: '$$G = \\frac{1}{1 - \\gamma} = \\frac{1}{0.1} = 10$$ With $\\gamma = 0.99$ it would be 100.',
    tags: ['returns', 'numbers'],
  },
  {
    id: 'rl-f-horizon',
    front: 'Raise γ from 0.9 to 0.99: what happens to the agent and to learning?',
    back: 'The effective horizon $1/(1 - \\gamma)$ grows from about 10 to about 100 steps: the agent will accept costs now for distant rewards. Learning gets slower, because value must propagate further back from the rewards.',
    tags: ['returns', 'parameters'],
  },
  {
    id: 'rl-f-return-num',
    front: 'Rewards 0, 0, 10 (then the episode ends), γ = 0.9: $G_0$?',
    back: '$G_0 = 0 + 0.9(0) + 0.9^2(10) = 8.1$. Starting the powers at 1 (giving 7.29) is the classic slip.',
    tags: ['returns', 'numbers'],
  },
  // values
  {
    id: 'rl-f-V',
    front: '$V^{\\pi}(s)$ in words?',
    back: 'The expected return when starting in state $s$ and following $\\pi$: how good it is to **be in** $s$.',
    tags: ['values'],
  },
  {
    id: 'rl-f-Q',
    front: '$Q^{\\pi}(s, a)$ in words?',
    back: 'The expected return when taking action $a$ in state $s$ and following $\\pi$ afterwards: how good it is to **do** $a$ in $s$.',
    tags: ['values'],
  },
  {
    id: 'rl-f-argmax',
    front: 'How is $\\pi^*$ obtained from $Q^*$?',
    back: '$\\pi^*(s) = \\arg\\max_a Q^*(s, a)$: in each state, take the action with the largest optimal action value (2025 Q18). They are not “equivalent”: one maps to actions, the other to numbers.',
    tags: ['values', 'mcq'],
  },
  {
    id: 'rl-f-V-to-pi',
    front: 'Can you act optimally from $V^*$ alone, with no model?',
    back: 'No. From $V^*$ you need a one-step lookahead, $\\arg\\max_a \\sum_{s^{\\prime}} T[R + \\gamma V^*(s^{\\prime})]$, which needs $T$ and $R$. From $Q^*$ the argmax is enough, which is why model-free RL learns $Q$.',
    tags: ['values', 'method'],
  },
  {
    id: 'rl-f-vi',
    front: 'The value-iteration update?',
    back: '$$V_{k+1}(s) = \\max_a \\sum_{s^{\\prime}} T(s, a, s^{\\prime})\\big[R + \\gamma V_k(s^{\\prime})\\big]$$ Model-based (needs $T$ and $R$); every state is updated each sweep, from the old values.',
    tags: ['values'],
  },
  {
    id: 'rl-f-vi-spread',
    front: 'Deterministic gridworld, a single goal reward, $V_0 = 0$: after $k$ sweeps of value iteration, which states know about the goal?',
    back: 'Only those within $k$ steps of it: value spreads backwards from the goal by one step per sweep.',
    tags: ['values', 'parameters'],
  },
  // Q-learning
  {
    id: 'rl-f-qupdate',
    front: 'The Q-learning update?',
    back: '$$Q(s, a) \\leftarrow Q(s, a) + \\alpha\\big[r + \\gamma \\max_{a^{\\prime}} Q(s^{\\prime}, a^{\\prime}) - Q(s, a)\\big]$$ The max is over the **next** state’s actions; only $Q(s, a)$ changes.',
    tags: ['qlearning'],
  },
  {
    id: 'rl-f-qnum',
    front: '$Q(s, a) = 2$, $r = -1$, $\\max_{a^{\\prime}} Q(s^{\\prime}, a^{\\prime}) = 5$, $\\gamma = 0.9$, $\\alpha = 0.5$: new $Q(s, a)$?',
    back: 'Target $= -1 + 0.9(5) = 3.5$; TD error $= 1.5$; new $Q = 2 + 0.5(1.5) = 2.75$.',
    tags: ['qlearning', 'numbers'],
  },
  {
    id: 'rl-f-terminal',
    front: 'In a Q-learning update, $s^{\\prime}$ is terminal. What is the target?',
    back: 'Just $r$: there is no future after a terminal state, so $\\max_{a^{\\prime}} Q(s^{\\prime}, a^{\\prime})$ is taken as 0.',
    tags: ['qlearning'],
  },
  {
    id: 'rl-f-alpha',
    front: 'Learning rate α = 0, and α = 1?',
    back: '$\\alpha = 0$: nothing is ever learned. $\\alpha = 1$: each update replaces $Q(s, a)$ with the latest target; fine if the world is deterministic, noisy if outcomes are random (a small $\\alpha$ averages them).',
    tags: ['qlearning', 'parameters'],
  },
  {
    id: 'rl-f-eps',
    front: 'ε-greedy with ε = 0.1 and 4 actions: probability of the greedy action?',
    back: '$1 - \\varepsilon + \\varepsilon/|A| = 0.9 + 0.025 = 0.925$; each other action $0.025$ (when the random branch draws from all actions).',
    tags: ['qlearning', 'numbers'],
  },
  {
    id: 'rl-f-eps-effect',
    front: 'ε = 0 vs a large ε?',
    back: '$\\varepsilon = 0$: no exploration, so the agent can lock onto the first route that works and never find a better one. Large $\\varepsilon$: it keeps acting randomly and performs badly. Common fix: start high and decay $\\varepsilon$.',
    tags: ['qlearning', 'parameters'],
  },
  {
    id: 'rl-f-model-free',
    front: 'Model-free vs model-based: which is Q-learning, which is value iteration?',
    back: 'Q-learning is model-free: it learns from sampled transitions $(s, a, r, s^{\\prime})$ without $T$ or $R$. Value iteration is model-based: it sweeps the Bellman backup using $T$ and $R$.',
    tags: ['qlearning', 'method'],
  },
  // policy vs plan, Markov, challenges
  {
    id: 'rl-f-policy-path',
    front: 'An RL policy vs a motion-planner path, in one line each?',
    back: 'Path: one open-loop sequence from one start, computed from a known map or model. Policy: an action for every state, learned from reward, closed-loop, works from any start; but costly to train and without guarantees (2023 Q29).',
    tags: ['policy', 'short-answer'],
  },
  {
    id: 'rl-f-markov',
    front: 'The Markov assumption, and what it means for the RL state?',
    back: 'The next state and reward depend only on the current state and action, not on the history. So the state must hold everything that affects what happens next (velocity, not just position), but no more, because every variable multiplies the state space (2024 Q26).',
    tags: ['markov', 'short-answer'],
  },
  {
    id: 'rl-f-velocity',
    front: 'Why is position alone not a Markov state for a moving robot?',
    back: 'The next position depends on the velocity too: the same position can be followed by different next positions, so the history (how it got there) still matters. Add $\\dot x$, or stack recent observations.',
    tags: ['markov'],
  },
  {
    id: 'rl-f-sim',
    front: 'Training in simulation: one benefit and one drawback?',
    back: 'Benefit: safe, fast, cheap data (free failures, instant resets, parallel and faster than real time). Drawback: the sim-to-real gap; friction, contact, latency and sensor noise are mis-modelled, so the policy can fail on hardware (2025 Q26).',
    tags: ['sim2real', 'short-answer'],
  },
  {
    id: 'rl-f-dr-sysid',
    front: 'Domain randomisation vs system identification?',
    back: 'Domain randomisation varies the simulator’s physics and visuals during training so the policy is robust to a range (reality becomes one more variation). System identification measures the real robot’s parameters so the simulator matches it.',
    tags: ['sim2real'],
  },
  {
    id: 'rl-f-shaping',
    front: 'A sparse reward (only at the goal) is almost never found. The standard fix?',
    back: 'Reward shaping: add intermediate rewards for progress (e.g. minus the distance to the goal). Demonstrations, which start learning near a good policy, also help.',
    tags: ['challenges'],
  },
];
