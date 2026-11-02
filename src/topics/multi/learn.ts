// Concept cards and flashcards for 'multi' (summary notes §9; 2023 Q19, Q20, Q30; 2024 Q19, Q20, Q27;
// 2025 Q19, Q20, Q27; review deck slides 25–26). Card ids are fixed: sims and Home link to them.
import type { ConceptCard, Flashcard } from '../../engine/types';

export const cards: ConceptCard[] = [
  // ------------------------------------------------------------------ why teams are hard
  {
    id: 'multi-why-hard',
    title: 'What gets harder with many robots',
    lecture: 'Notes §9; review deck slides 25–26',
    formulas: [
      '$$|A_{\\text{joint}}| = |A_1| \\times |A_2| \\times \\cdots \\times |A_n| = |A|^n \\qquad (4 \\text{ actions each, } 5 \\text{ robots: } 4^5 = 1024)$$',
      '$$\\text{all-to-all sharing: } n(n-1) \\text{ messages per update} \\qquad (10 \\text{ robots: } 90; \\ \\ 100 \\text{ robots: } 9900)$$',
      '$$\\begin{array}{l|l} \\text{what gets harder} & \\text{the usual remedy} \\\\ \\hline \\text{task allocation} & \\text{auctions, or a central optimiser} \\\\ \\text{duplicated work, collisions, congestion} & \\text{explicit claims, or inferring intent} \\\\ \\text{limited, unreliable communication} & \\text{implicit coordination} \\\\ \\text{scaling with team size} & \\text{local, decentralised decisions} \\\\ \\text{unknown teammate knowledge and intent} & \\text{communication, or belief-space planning} \\\\ \\text{credit assignment} & \\text{difference rewards, centralised training} \\end{array}$$',
    ],
    what: 'Each robot still runs its own see–think–act loop, but now its best action depends on what the others do. The notes list what gets harder: **task allocation** (who does what), **duplicated work** and **collisions or congestion** in shared space, **limited and unreliable communication**, **scaling** with team size, **not knowing what teammates know or intend**, and **credit assignment** (which robot’s actions earned the team’s reward).\n\nThe root cause is that the problem is now joint. The team’s state and action spaces are products of the robots’ own, so they grow exponentially with the number of robots, and a planner that reasons about every combination soon becomes impossible. Information is spread across the robots, so each one decides with a partial picture unless it is told or can infer the rest. And from any one robot’s point of view the world no longer stands still: its teammates move, change their plans and, if they are learning, change their behaviour.',
    when: '- “What are some additional complexities that arise when moving from single robot to multi-robot systems?” (review deck slide 26).\n- “Outline the challenges of multi-robot coordination” (review deck slide 25).\n- Background for every multi-robot MCQ (Q19 and Q20 in 2023, 2024 and 2025).',
    how: [
      'Start from what a single robot needs (its own state, map and plan) and ask what changes when others share the space and the task.',
      'List the notes’ six: task allocation; duplicated work and collisions or congestion; limited, unreliable communication; scaling with team size; not knowing what teammates know or intend; credit assignment.',
      'Give each one a concrete example: two drones surveying the same field, a queue at the only charger, a radio that drops in a tunnel.',
      'Say **why** it is hard: joint spaces grow as $|A|^n$, information is distributed, and changing teammates make the world non-stationary.',
      'If the question allows, pair each challenge with its remedy (formula box): it shows where the rest of the topic fits.',
    ],
    traps: [
      {
        title: 'A team is n copies of one robot',
        detail: 'The interactions are the whole difficulty: two robots that each act optimally on their own can still collide, queue or duplicate each other’s work.',
        source: 'Notes §9',
      },
      {
        title: '“More robots always finish faster”',
        detail: 'Congestion, interference and message load grow with team size, so the gain from each extra robot shrinks, and past some size it can turn negative.',
        source: 'Notes §9',
      },
      {
        title: '“Just centralise everything”',
        detail: 'A central planner must hear from every robot, reasons over a joint space that grows exponentially, and is a single point of failure.',
        source: 'Notes §9; 2025 Q27',
      },
      {
        title: 'Listing without explaining',
        detail: 'For 3 marks, three challenges each with a reason or an example beat six bare names.',
        source: 'Review deck slide 26',
      },
    ],
    more: '**Why the joint space explodes.** With 5 robots and 4 actions each there are $4^5 = 1024$ joint actions per step; with 10 robots, over a million ($4^{10} \\approx 1.05 \\times 10^6$). A planner or learner that reasons about every combination is hopeless beyond a handful of robots, which is why practical schemes decompose the problem: allocate the tasks first and let each robot plan its own route, or give each robot its own policy that sees only local information.\n\n**Heterogeneous teams.** Teams often mix robots with different abilities (a drone that sees over rubble, a ground robot that opens doors), so allocation must also match tasks to capabilities.\n\n**Non-stationarity.** If teammates are learning, the outcomes one robot experiences keep shifting, which breaks the fixed-MDP assumption behind single-agent RL (see the multi-agent RL card).',
    exploreIds: ['allocation', 'credit'],
    solveIds: [],
  },

  // ------------------------------------------------------------------ implicit vs explicit coordination
  {
    id: 'multi-implicit-explicit',
    title: 'Implicit vs explicit coordination',
    lecture: 'Notes §9; 2023 Q19, Q30; 2024 Q19, Q27; 2025 Q19, Q27',
    formulas: [
      '$$\\begin{array}{l|l|l} & \\text{implicit} & \\text{explicit} \\\\ \\hline \\text{how} & \\text{observe teammates, infer their intent} & \\text{communicate and negotiate (e.g. auctions)} \\\\ \\text{benefits} & \\text{robust to link loss, cheap, scales} & \\text{avoids conflicts directly, near-optimal, shares maps} \\\\ \\text{drawbacks} & \\text{wrong inferences: duplication, conflicts} & \\text{needs bandwidth, low latency; load grows with } n \\\\ \\text{wins when} & \\text{no or poor comms; very large teams} & \\text{a reliable network; tightly coupled tasks} \\end{array}$$',
    ],
    what: 'The two differ in **how a robot finds out what its teammates will do**. In **implicit coordination** it observes them (their positions, their headings, what they have already explored) and infers their intentions, then picks its own task to fit: no messages are exchanged. In **explicit coordination** the robots communicate and negotiate: they broadcast claims, bid in task auctions, and share maps and plans.\n\nImplicit coordination keeps working when the radio dies, costs nothing in bandwidth and scales to large teams. But inferences can be wrong, so robots sometimes duplicate work or get in each other’s way, and it needs good perception and a model of how teammates behave. Explicit coordination avoids conflicts directly and can reach near-optimal allocations, and shared information improves every robot’s picture of the world. But it depends on the network: bandwidth, latency and dropped links limit it, the message load grows with team size, and it degrades badly when communication fails. Explicit does **not** mean centralised: robots can negotiate peer to peer.',
    when: '- “A multi-robot system in which each robot negotiates its task by communicating with nearby team members is an example of …” (2023 Q19; 2025 Q19: explicit coordination).\n- “In a multi-robot system that uses implicit coordination, each robot selects its task …” (2024 Q19: by inferring teammates’ actions through observation).\n- “Identify one drawback of using explicit coordination in a multi-robot system” (2023 Q30, 1 mark).\n- “Discuss the benefits and drawbacks of using implicit vs. explicit coordination” (2024 Q27, 3 marks); “Explain the benefits and drawbacks of using communication for multi-robot coordination” (2025 Q27, 3 marks).',
    how: [
      'Classify by the mechanism: messages, bids or negotiation → explicit; observation and inference with no messages → implicit. “Randomly”, “centralised control” and “belief-space planning” are something else (distractors in 2024 Q19, 2023 Q19 and 2025 Q19).',
      'For a comparison, define each in one sentence, then give at least one benefit and one drawback of each, every one with a “because”.',
      'Name a scenario where each wins: implicit underground, underwater, under jamming or for very large swarms; explicit in a warehouse with reliable Wi-Fi, or when tasks are tightly coupled (sharing lifts, handing over parts).',
      '“Benefits and drawbacks of communication” (2025 Q27) is the explicit column: sharing intentions, claims, maps and observations vs dependence on the network and a growing message load.',
      'For 1 mark (“one drawback of explicit coordination”) write one precise sentence: it depends on communication, so bandwidth limits, latency and dropped links can stall it, and the load grows with team size.',
    ],
    traps: [
      {
        title: 'Explicit = centralised',
        detail: 'Robots that negotiate with their neighbours are coordinating explicitly and are fully decentralised. “Centralised control” was a separate, wrong option.',
        source: '2023 Q19, 2025 Q19',
      },
      {
        title: 'Implicit = random',
        detail: 'Implicit robots choose deliberately, from what they observe of their teammates; “randomly” was a distractor.',
        source: '2024 Q19',
      },
      {
        title: '“Implicit has no drawbacks because it needs no comms”',
        detail: 'Inferences can be wrong (duplicated work, conflicts), allocations are usually less efficient, and it needs good perception and models of teammates.',
        source: '2024 Q27',
      },
      {
        title: 'Benefits only',
        detail: 'Both comparison questions ask for benefits **and** drawbacks; an answer that only praises one side earns at most half the marks.',
        source: '2024 Q27, 2025 Q27',
      },
    ],
    more: '**A 3-mark structure** (2024 Q27). One line defining each. For implicit, a benefit (robust to link loss, scales) and a drawback (wrong inferences duplicate work). For explicit, a benefit (conflicts avoided directly, near-optimal allocation, shared maps) and a drawback (needs reliable, low-latency links; the load grows with team size). Finish with when each wins.\n\n**Hybrids are normal.** Real teams communicate when they can and fall back on implicit rules when they cannot. Robots exploring a mine, for example, share their maps whenever they meet within radio range, and in between infer each other’s progress from the explored map.',
    exploreIds: ['allocation'],
    solveIds: [],
  },

  // ------------------------------------------------------------------ task allocation
  {
    id: 'multi-allocation',
    title: 'Task allocation, auctions and communication load',
    lecture: 'Notes §9; 2024 Q27, 2025 Q27',
    formulas: [
      '$$\\text{single-item auction: robot } i \\text{ bids its cost } c_{ij} \\text{ for task } j, \\qquad \\text{winner } i^* = \\arg\\min_i c_{ij}$$',
      '$$\\text{messages per auctioned task} = \\underbrace{1}_{\\text{announce}} + \\underbrace{n}_{\\text{bids}} + \\underbrace{1}_{\\text{award}}, \\qquad \\text{all-to-all state sharing} = n(n-1) \\text{ per update}$$',
      '$$\\begin{array}{c|cc} c_{ij} & T_1 & T_2 \\\\ \\hline R_1 & 1 & 2 \\\\ R_2 & 2 & 10 \\end{array} \\qquad \\begin{aligned} &\\text{auction } T_1 \\text{ first: } R_1 \\to T_1,\\ R_2 \\to T_2: \\ 1 + 10 = 11 \\\\ &\\text{best assignment: } R_1 \\to T_2,\\ R_2 \\to T_1: \\ 2 + 2 = 4 \\end{aligned}$$',
    ],
    what: '**Task allocation** decides which robot does which task, so that every task is covered, none is done twice and the total cost (distance, time, energy) is low. A **central optimiser** that knows every robot’s cost for every task can compute the best assignment, but it needs all that information in one place, scales poorly and is a single point of failure. **Market-based allocation (auctions)** spreads the work: a task is announced, each robot bids its own cost for doing it, and the lowest bid wins. Each robot only evaluates its own costs, and the result is usually close to optimal, but every announcement, bid and award is a message.\n\nThat is the price of explicit allocation: **communication load**. It grows with the number of robots and tasks, and when links drop, auctions stall or robots act on stale claims and duplicate work. Implicit allocation needs no messages at all (each robot takes, say, the nearest task it does not see a teammate heading for), at the cost of occasional duplication.',
    when: '- Explicit coordination “e.g. task auctions” in the comparison questions (2024 Q27, 2025 Q27).\n- Scenario questions about duplicated work, congestion or communication dropout.\n- Telling allocation apart from credit assignment: “assign tasks to each of the robots” was a wrong option for credit assignment (2024 Q20, 2025 Q20).',
    how: [
      'Write the cost table: one row per robot, one column per task (travel distance, time or energy).',
      'Auction a task: each free robot bids its cost (or, if it already holds tasks, the **extra** cost of adding this one); award the task to the lowest bid; repeat for the next task.',
      'Check the result: every task covered once, no robot overloaded. If the table is small, compare with the best assignment: one-at-a-time awards are greedy and can miss it.',
      'Count the messages: announce + $n$ bids + award per task; sharing every robot’s state with every other robot costs $n(n-1)$ messages per update.',
      'Ask what happens when communication fails: an auction cannot run, so fall back on implicit rules and accept some duplicated work.',
    ],
    traps: [
      {
        title: 'Task allocation ≠ credit assignment',
        detail: 'Allocation decides who does what **before** acting; credit assignment judges how much each robot contributed **after** the team is rewarded.',
        source: '2024 Q20, 2025 Q20',
      },
      {
        title: 'The highest bid wins',
        detail: 'When robots bid costs, the task goes to the **lowest** bid. (If bids are utilities, the highest wins: check which the question uses.)',
        source: 'Notes §9',
      },
      {
        title: '“Auctions are optimal”',
        detail: 'Awarding tasks one at a time is greedy. In the formula box the first award looks cheap (cost 1) but forces a cost-10 assignment later: 11 in total against a best of 4.',
        source: 'Notes §9',
      },
      {
        title: '“More communication is always better”',
        detail: 'Bandwidth saturates and latency grows with team size; past that point extra messages slow the team down.',
        source: '2023 Q30, 2025 Q27',
      },
    ],
    more: '**Worked auction** (formula box). Auction $T_1$ first: $R_1$ bids 1 and $R_2$ bids 2, so $R_1$ wins. Only $R_2$ is left for $T_2$, at cost 10: total 11. Assigning $R_1 \\to T_2$ and $R_2 \\to T_1$ costs $2 + 2 = 4$. The greedy award looked best locally and made the whole worse. Re-auctioning, bidding for bundles of tasks, or a central solver (the assignment problem can be solved exactly, e.g. by the Hungarian algorithm) avoid this, at the price of more computation or communication.\n\n**Message counts.** With $n = 10$ robots an auctioned task costs $1 + 10 + 1 = 12$ messages, while sharing full state all-to-all costs $10 \\times 9 = 90$ messages per update, and $100 \\times 99 = 9900$ for 100 robots. Exchanging messages only with near neighbours keeps the load per robot roughly constant as the team grows.\n\n**Try it** in the allocation sim: raise the message dropout until the explicit team wastes more distance than the implicit one.',
    exploreIds: ['allocation'],
    solveIds: [],
  },

  // ------------------------------------------------------------------ learning-based vs belief-space approaches
  {
    id: 'multi-learning-belief',
    title: 'Multi-agent RL, credit assignment and belief-space planning',
    lecture: 'Notes §9; review deck slide 25; 2023 Q20, 2024 Q20, 2025 Q20',
    formulas: [
      '$$\\text{team objective: } Q(s, a_1, a_2, \\ldots, a_n) \\text{ (the joint state-action value)}, \\qquad \\text{not } \\textstyle\\sum_i Q_i(s, a_i) \\text{ or their average}$$',
      '$$D_i = G(z) - G(z_{-i}) \\qquad \\text{difference reward: the team reward with robot } i \\text{, minus the team reward without it}$$',
      '$$b(s) = P(s \\mid z_{1:t}, u_{1:t}), \\qquad \\text{choose actions to maximise } \\mathbb{E}_{s \\sim b}\\big[\\,\\text{return}\\,\\big]$$',
      '$$\\begin{array}{l|l|l} & \\text{learning-based (multi-agent RL)} & \\text{belief-space planning} \\\\ \\hline \\text{computation} & \\text{offline training; cheap at run time} & \\text{online planning at every step} \\\\ \\text{uncertainty} & \\text{implicit, learned from experience} & \\text{explicit probability distributions} \\\\ \\text{needs} & \\text{a simulator, a reward, many episodes} & \\text{models of sensing, motion, teammates} \\\\ \\text{hard part} & \\text{credit assignment, non-stationarity} & \\text{cost grows fast with team and horizon} \\\\ \\text{strength} & \\text{fast, captures unmodelled effects} & \\text{principled, values information} \\end{array}$$',
    ],
    what: 'Two families of methods coordinate a team under uncertainty. **Multi-agent RL** learns joint behaviour from a team reward. It is usually **trained centrally and executed independently**: during training (in simulation) a central learner may use every robot’s observations and the global state, for example to learn the team’s **joint state–action value**; at run time each robot acts on its own observations with its own policy. Its key difficulty is **credit assignment**: with one shared reward, every robot receives the same signal whether or not its own actions helped. *Structural* credit assignment quantifies each robot’s contribution to the team’s performance; a **difference reward** does this by comparing the team reward with and without that robot.\n\n**Belief-space planning** is model-based instead. Each robot keeps a probabilistic **belief** about the world and about its teammates’ states and intentions, and plans over that belief, choosing actions that maximise expected reward, including actions that gather useful information. It is principled and handles uncertainty explicitly, with no training, but planning over beliefs is very expensive and grows quickly with the team size and the planning horizon.',
    when: '- “Global coordination strategies in multi-robot systems attempt to optimise …” (2023 Q20: the joint state–action value).\n- “Credit assignment strategies in multi-robot systems attempt to …” (2024 Q20) and “Structural credit assignment in multi-robot coordination refers to …” (2025 Q20): quantify, or evaluate, each robot’s contribution to the team.\n- “Compare and contrast learning-based and belief space planning-based approaches to multi-robot coordination” (review deck slide 25).',
    how: [
      'Name the team objective: the **joint** state–action value $Q(s, a_1, \\ldots, a_n)$, because the robots’ actions interact; not one robot’s value, nor a sum or average of individual values.',
      'Learning-based: say how it is trained (centrally, in simulation, from a team reward) and executed (independently, on local observations), then its costs: many episodes, a good simulator and reward, credit assignment, teammates that keep changing, no guarantees.',
      'Credit assignment: define it (how much did each robot contribute?), tell structural (which robot) from temporal (which earlier action), and give a fix such as a difference reward.',
      'Belief-space: define the belief (a probability distribution over the world and the teammates), say that actions are planned over it, then its strengths (principled, explicit uncertainty, information gathering, no training) and its cost (computation that explodes with team size and horizon; it needs models).',
      'Compare on the same axes (formula box): where the computation happens, how uncertainty is handled, what each needs, what is hard, and when each wins (a good simulator and fast reactions → learning; few robots, high stakes and good models → belief-space).',
    ],
    traps: [
      {
        title: 'A sum or an average of individual values',
        detail: 'The team objective is the **joint** state–action value: two robots that each maximise their own value can still collide or chase the same task. The sum, the average and a leader’s value were the wrong options.',
        source: '2023 Q20',
      },
      {
        title: 'Credit assignment = allocation, workload or roles',
        detail: 'Assigning tasks, balancing the workload and defining roles all happen before acting. Credit assignment measures each robot’s contribution to the result.',
        source: '2024 Q20, 2025 Q20',
      },
      {
        title: '“Belief-space planning needs training data”',
        detail: 'It plans online from models; it is multi-agent RL that needs many training episodes.',
        source: 'Notes §9',
      },
      {
        title: 'Decentralised execution means uncoordinated training',
        detail: 'Only execution is local. Training may use every robot’s information, which is exactly what makes the learned policies work together.',
        source: 'Notes §9',
      },
    ],
    more: '**Difference rewards, worked.** Three robots search a building and the team reward is the number of people found, $G = 5$. Re-score the same run with robot 1 removed: if the others would still have found 2, then $D_1 = 5 - 2 = 3$. With robot 2 removed the team still finds 5 (it searched rooms the others also covered), so $D_2 = 0$. With the global reward both robots would have received 5, and robot 2 would have learned that its behaviour was fine; the difference reward tells it otherwise.\n\n**Non-stationarity.** While teammates are learning, the outcome of one robot’s action depends on policies that keep changing, so from that robot’s point of view the environment is not a fixed MDP. Centralised training with a joint critic sees all the actions, which removes this problem during training.\n\n**Belief-space planning in practice.** Robots can exchange compressed probability distributions over their intended plans, and each improves its own plan against what the others are likely to do. Exact planning over beliefs (a POMDP) is intractable, so practical methods sample or approximate.',
    exploreIds: ['credit'],
    solveIds: [],
  },
];

export const flashcards: Flashcard[] = [
  // why teams are hard
  {
    id: 'multi-f-challenges',
    front: 'The six things that get harder with many robots (notes §9)?',
    back: 'Task allocation; duplicated work and collisions or congestion; limited, unreliable communication; scaling with team size; not knowing what teammates know or intend; credit assignment.',
    tags: ['challenges', 'short-answer'],
  },
  {
    id: 'multi-f-joint',
    front: '5 robots with 4 actions each: how many joint actions per step?',
    back: '$4^5 = 1024$. Joint spaces grow exponentially with team size ($|A|^n$), which is why teams decompose the problem.',
    tags: ['challenges', 'numbers'],
  },
  {
    id: 'multi-f-messages',
    front: '$n$ robots each send their state to every other robot: messages per update?',
    back: '$n(n-1)$: 90 for 10 robots, 9900 for 100. Message load grows roughly with the square of the team size.',
    tags: ['challenges', 'numbers'],
  },
  {
    id: 'multi-f-central',
    front: 'Main weaknesses of a single central coordinator?',
    back: 'A single point of failure, a communication bottleneck (every robot must reach it), and a joint problem that grows exponentially with team size.',
    tags: ['challenges'],
  },
  // implicit vs explicit
  {
    id: 'multi-f-implicit',
    front: 'Implicit coordination: how does a robot decide what to do?',
    back: 'It observes its teammates, infers their intentions, then picks its own task to fit. No messages are exchanged (2024 Q19).',
    tags: ['coordination', 'mcq'],
  },
  {
    id: 'multi-f-explicit',
    front: 'Explicit coordination: how does a robot decide what to do?',
    back: 'By communicating and negotiating with its teammates: claims, bids in task auctions, shared maps and plans (2023 Q19, 2025 Q19).',
    tags: ['coordination', 'mcq'],
  },
  {
    id: 'multi-f-implicit-pro',
    front: 'Benefits of implicit coordination?',
    back: 'Robust to communication loss; cheap (no bandwidth or network infrastructure); scales to large teams.',
    tags: ['coordination', 'short-answer'],
  },
  {
    id: 'multi-f-implicit-con',
    front: 'Drawbacks of implicit coordination?',
    back: 'Inferences can be wrong, so robots duplicate work or conflict; allocations are less efficient; it needs good perception and models of how teammates behave.',
    tags: ['coordination', 'short-answer'],
  },
  {
    id: 'multi-f-explicit-pro',
    front: 'Benefits of explicit coordination (or of communication)?',
    back: 'Conflicts and duplicated work are avoided directly; allocation can be near-optimal (auctions); maps, plans and observations are shared, improving every robot’s picture of the world.',
    tags: ['coordination', 'short-answer'],
  },
  {
    id: 'multi-f-explicit-con',
    front: 'One drawback of explicit coordination (1 mark)?',
    back: 'It depends on communication: bandwidth limits, latency and dropped links can stall or break it, and the message load grows with team size (2023 Q30).',
    tags: ['coordination', 'short-answer'],
  },
  {
    id: 'multi-f-mine',
    front: 'An underground search where the radio dies beyond the first bend: implicit or explicit?',
    back: 'Implicit: there is no link to negotiate over, so robots infer their teammates’ progress from what they observe. They can still share maps explicitly whenever they meet within range.',
    tags: ['coordination', 'method'],
  },
  {
    id: 'multi-f-warehouse',
    front: '30 robots in a warehouse with reliable Wi-Fi: implicit or explicit?',
    back: 'Explicit: the network is dependable, so robots can claim aisles and tasks and share plans, avoiding conflicts directly.',
    tags: ['coordination', 'method'],
  },
  {
    id: 'multi-f-decentral',
    front: 'Robots negotiate their tasks with their neighbours, with no central computer. Explicit, or centralised?',
    back: 'Explicit, and decentralised. Explicit means coordinating by communication, not by a central controller; “centralised control” was a wrong option in 2023 Q19 and 2025 Q19.',
    tags: ['coordination', 'mcq'],
  },
  // allocation
  {
    id: 'multi-f-alloc-vs-credit',
    front: 'Task allocation vs credit assignment?',
    back: 'Allocation decides who does which task, before acting. Credit assignment measures how much each robot contributed to the team’s result, afterwards.',
    tags: ['allocation', 'mcq'],
  },
  {
    id: 'multi-f-auction',
    front: 'One round of a single-item task auction?',
    back: 'Announce the task; each robot bids its cost (distance, or the extra cost given the tasks it already holds); award the task to the lowest bid. Repeat for the next task.',
    tags: ['allocation'],
  },
  {
    id: 'multi-f-greedy',
    front: 'Are one-task-at-a-time auctions optimal?',
    back: 'No, they are greedy: a cheap early award can force an expensive one later (11 against a best of 4 in the allocation card’s example). Usually close to optimal, and fully distributed.',
    tags: ['allocation'],
  },
  {
    id: 'multi-f-dropout',
    front: 'The radio drops while tasks are being auctioned. What happens?',
    back: 'Announcements, bids or awards are lost: allocation stalls, or robots act on stale claims and duplicate work. Fall back on implicit rules.',
    tags: ['allocation', 'coordination'],
  },
  // learning and belief
  {
    id: 'multi-f-global',
    front: 'Global coordination strategies attempt to optimise …?',
    back: 'The joint state–action value of the team (2023 Q20), not a sum or average of the robots’ individual values, nor a leader robot’s value.',
    tags: ['learning', 'mcq'],
  },
  {
    id: 'multi-f-credit',
    front: 'Credit assignment strategies attempt to …?',
    back: 'Quantify each robot’s contribution to the team’s performance (2024 Q20); structural credit assignment evaluates the contribution of each robot to the team (2025 Q20).',
    tags: ['learning', 'mcq'],
  },
  {
    id: 'multi-f-structural-temporal',
    front: 'Structural vs temporal credit assignment?',
    back: 'Structural: **which robot** earned the team’s reward. Temporal: **which earlier action** led to a reward that arrived later.',
    tags: ['learning'],
  },
  {
    id: 'multi-f-difference',
    front: 'What is a difference reward $D_i$?',
    back: '$D_i = G(z) - G(z_{-i})$: the team reward minus the reward the team would have earned without robot $i$. It isolates robot $i$’s own contribution.',
    tags: ['learning'],
  },
  {
    id: 'multi-f-shared-reward',
    front: 'Why is training every robot on the shared team reward a problem?',
    back: 'Every robot receives the same signal whether or not its own actions helped, so the signal is noisy for each individual and learning is slow: the credit assignment problem.',
    tags: ['learning'],
  },
  {
    id: 'multi-f-ctde',
    front: '“Centralised training, decentralised execution” means?',
    back: 'Training (usually in simulation) may use every robot’s observations and the global state; at run time each robot acts on its own observations, so no central computer or constant communication is needed.',
    tags: ['learning'],
  },
  {
    id: 'multi-f-nonstationary',
    front: 'Why is multi-agent RL non-stationary from one robot’s point of view?',
    back: 'Its teammates are learning too, so the outcomes of its actions keep changing: the transition probabilities it experiences are not fixed.',
    tags: ['learning'],
  },
  {
    id: 'multi-f-belief',
    front: 'Belief-space planning: what does each robot plan over?',
    back: 'A probability distribution (belief) over the world state and its teammates’ states or plans. It chooses actions that maximise expected reward over that belief, including information-gathering ones.',
    tags: ['belief'],
  },
  {
    id: 'multi-f-belief-con',
    front: 'The main drawback of belief-space planning?',
    back: 'Computation: planning over beliefs grows very quickly with team size and horizon (exact POMDP solutions are intractable), and it needs good models of sensing, motion and teammates.',
    tags: ['belief'],
  },
  {
    id: 'multi-f-learn-vs-belief',
    front: 'Learning-based vs belief-space planning: where is the computation spent?',
    back: 'Learning: offline, in training; running the policy is cheap. Belief-space planning: online, planning at every step; no training is needed.',
    tags: ['learning', 'belief'],
  },
];
