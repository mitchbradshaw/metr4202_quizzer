// MCQs (original wording, cited to the past papers), method games and exam-style short answers for 'multi'.
// Covers every multi-robot MCQ of 2023–2025 (Q19 and Q20 each year), every short answer (2023 Q30, 2024 Q27,
// 2025 Q27) and the review deck's practice question and learning outcomes (slides 25–26), plus originals.
// The short answers are this topic's exam mode (it has no solve generators).
import type { Game, MCQ, ShortAnswer } from '../../engine/types';

export const mcqs: MCQ[] = [
  // ------------------------------------------------------------------ implicit vs explicit coordination
  {
    id: 'multi-q-negotiate',
    style: 'most-correct',
    stem: 'A robot team in which each robot settles its task by communicating and negotiating with nearby teammates is an example of:',
    options: [
      {
        text: 'explicit coordination',
        correct: true,
        why: 'Coordinating through messages (claims, bids, negotiation) is explicit, even with no central computer.',
      },
      {
        text: 'implicit coordination',
        correct: false,
        why: 'Implicit robots exchange no messages: they infer their teammates’ intentions by observing them.',
      },
      { text: 'an adversarial team', correct: false, why: 'Adversaries compete against each other; these robots cooperate.' },
      {
        text: 'centralised control',
        correct: false,
        why: 'Nobody here is in charge: the robots negotiate among themselves, which is decentralised.',
      },
    ],
    source: 'Recurring: 2023 Q19',
    difficulty: 1,
  },
  {
    id: 'multi-q-broadcast',
    style: 'most-correct',
    stem: 'A team of drones broadcast their intended actions to one another and agree who covers which area. This is an example of:',
    options: [
      {
        text: 'explicit coordination',
        correct: true,
        why: 'They communicate and negotiate their actions, which is the definition of explicit coordination.',
      },
      {
        text: 'implicit coordination',
        correct: false,
        why: 'That would mean inferring the others’ intentions from observation, with no messages.',
      },
      {
        text: 'centralised control',
        correct: false,
        why: 'The drones agree among themselves; no central controller assigns the areas.',
      },
      {
        text: 'belief-space planning',
        correct: false,
        why: 'A way of planning under uncertainty over probability distributions; it does not describe how the drones settle who goes where.',
      },
    ],
    source: 'Recurring: 2025 Q19',
    difficulty: 1,
  },
  {
    id: 'multi-q-implicit-select',
    style: 'most-correct',
    stem: 'In a multi-robot system that uses implicit coordination, each robot chooses its task:',
    options: [
      {
        text: 'at random',
        correct: false,
        why: 'Implicit coordination is deliberate: each robot chooses from what it observes of its teammates.',
      },
      {
        text: 'by negotiating with its teammates over the network',
        correct: false,
        why: 'That is explicit coordination.',
      },
      {
        text: 'by inferring what its teammates are doing from observing them',
        correct: true,
        why: 'No messages: each robot watches its teammates, infers their intentions and picks a task that fits.',
      },
      {
        text: 'by following direct commands sent to it from a central base station',
        correct: false,
        why: 'That is centralised control, which needs communication with the base.',
      },
    ],
    source: 'Recurring: 2024 Q19',
    difficulty: 1,
  },
  {
    id: 'multi-q-explicit-drawback',
    style: 'correct',
    stem: 'Which of these is a drawback of explicit coordination?',
    options: [
      {
        text: 'It needs enough bandwidth, low latency and links that do not drop, and its message load grows with team size',
        correct: true,
        why: 'Coordination by message stalls or breaks when the network is slow or fails, and the message load grows with team size (2023 Q30).',
      },
      {
        text: 'Robots must guess their teammates’ intentions, so they often duplicate work',
        correct: false,
        why: 'That is the drawback of **implicit** coordination.',
      },
      {
        text: 'Robots cannot share maps or plans with one another',
        correct: false,
        why: 'Sharing maps and plans is one of its benefits.',
      },
      {
        text: 'It always needs a central base station to decide who does what',
        correct: false,
        why: 'Explicit coordination can be fully decentralised, with robots negotiating peer to peer.',
      },
    ],
    source: 'Original; similar to 2023 Q30',
    difficulty: 1,
  },
  {
    id: 'multi-q-implicit-false',
    style: 'incorrect',
    stem: 'About implicit coordination in a multi-robot team:',
    options: [
      {
        text: 'It guarantees that no two robots ever pick the same task',
        correct: true,
        why: 'This is the FALSE statement: inferences from observation can be wrong, so robots do sometimes duplicate work or conflict. That is its main drawback.',
      },
      { text: 'It keeps working when the radio link drops', correct: false, why: 'True: it never relied on messages.' },
      {
        text: 'It needs good perception and a model of how teammates behave',
        correct: false,
        why: 'True: inferring intent is only as good as what the robot can see and how well it predicts its teammates.',
      },
      {
        text: 'It scales to large teams because it adds no message traffic',
        correct: false,
        why: 'True: there is no bandwidth to saturate as the team grows.',
      },
    ],
    source: 'Original; Notes §9; 2024 Q27',
    trapId: 'read-the-stem',
    difficulty: 2,
  },
  {
    id: 'multi-q-scenario',
    style: 'best',
    stem: 'In which deployment would you rely most on implicit rather than explicit coordination?',
    options: [
      {
        text: 'Surveying a cave where radio fails beyond the first bend',
        correct: true,
        why: 'With no reliable link, negotiation is impossible: the robots must infer what their teammates are doing from what they observe.',
      },
      {
        text: 'A warehouse fleet with reliable Wi-Fi over the whole floor',
        correct: false,
        why: 'A dependable network makes explicit claims and shared plans cheap and effective.',
      },
      {
        text: 'Two arms passing parts across a shared bench on a wired network',
        correct: false,
        why: 'Tightly coupled work with a perfect link: negotiate explicitly.',
      },
      {
        text: 'Hospital robots that must book lifts and have building Wi-Fi',
        correct: false,
        why: 'Shared, scarce resources and a good network favour explicit booking.',
      },
    ],
    source: 'Original; Notes §9 (when each wins)',
    difficulty: 2,
  },

  // ------------------------------------------------------------------ allocation and scaling
  {
    id: 'multi-q-auction',
    style: 'correct',
    stem: 'A task is auctioned, and the robots bid their travel distances to it: $R_1$ 12 m, $R_2$ 7 m, $R_3$ 9 m. Which outcome is correct?',
    options: [
      {
        text: '$R_2$ wins: each robot bids its cost for the task, so the lowest bid takes it',
        correct: true,
        why: 'Each robot bids what the task would cost it; awarding the lowest bid gives the task to the robot that can do it most cheaply.',
      },
      {
        text: '$R_1$ wins: as in any auction, the highest bid takes the task',
        correct: false,
        why: 'These bids are costs, not offers of payment: the highest bid comes from the worst robot for the job.',
      },
      {
        text: '$R_3$ wins: the middle bid avoids overloading the nearest robot',
        correct: false,
        why: 'A single-item auction awards to the best bid; workload is handled as later tasks are auctioned, through each robot’s extra cost.',
      },
      {
        text: 'All three take it, so that the task is sure to be done',
        correct: false,
        why: 'That is the duplicated work allocation exists to prevent.',
      },
    ],
    source: 'Original; Notes §9 (task auctions)',
    difficulty: 1,
  },
  {
    id: 'multi-q-central',
    style: 'correct',
    stem: 'One central computer assigns every task in a 50-robot fleet. What is its main weakness compared with distributed allocation?',
    options: [
      {
        text: 'It is a single point of failure and a communication bottleneck',
        correct: true,
        why: 'Every robot must reach it, and if it (or its link) fails the whole fleet stops; its problem also grows quickly with the fleet.',
      },
      {
        text: 'It can never find the optimal assignment of tasks',
        correct: false,
        why: 'With every cost in one place it **can** compute the optimum: that is its main strength.',
      },
      {
        text: 'The robots can no longer share maps with one another',
        correct: false,
        why: 'Nothing stops robots sharing maps through, or alongside, the central computer.',
      },
      {
        text: 'It forces the robots to infer each other’s intentions by observation',
        correct: false,
        why: 'That is implicit coordination, the opposite of a central planner.',
      },
    ],
    source: 'Original; Notes §9; 2025 Q27',
    difficulty: 2,
  },
  {
    id: 'multi-q-messages',
    style: 'value',
    stem: 'Each of $n = 20$ robots sends its state to every other robot once per update, over point-to-point links (one message per sender–receiver pair). How many messages is that per update?',
    options: [
      { text: '20', correct: false, why: 'That counts one broadcast per robot; over point-to-point links each robot sends 19 messages.' },
      {
        text: '190',
        correct: false,
        why: 'That is the number of robot **pairs**, $n(n-1)/2$; each pair exchanges two messages, one each way.',
      },
      {
        text: '380',
        correct: true,
        why: '$n(n-1) = 20 \\times 19 = 380$: the message load grows roughly with the square of the team size.',
      },
      { text: '400', correct: false, why: 'That is $n^2$, which counts each robot sending a message to itself.' },
    ],
    source: 'Original; Notes §9 (scaling with team size)',
    fixedOrder: true,
    difficulty: 2,
  },
  {
    id: 'multi-q-joint-actions',
    style: 'value',
    stem: 'Five robots each choose one of 4 actions at every step. How many joint actions must a centralised planner consider per step?',
    options: [
      { text: '9', correct: false, why: 'Adding 5 and 4 means nothing here.' },
      {
        text: '20',
        correct: false,
        why: '$5 \\times 4$ counts each robot’s options separately; the planner must consider every **combination**.',
      },
      { text: '625', correct: false, why: 'That is $5^4$: the base and the exponent are swapped.' },
      {
        text: '1024',
        correct: true,
        why: '$|A|^n = 4^5 = 1024$: joint spaces grow exponentially with the number of robots.',
      },
    ],
    source: 'Original; Notes §9 (scaling with team size)',
    fixedOrder: true,
    difficulty: 2,
  },
  {
    id: 'multi-q-why-hard',
    style: 'incorrect',
    stem: 'Moving from one robot to a team of robots adds complications. Which of these is NOT one of them?',
    options: [
      {
        text: 'Each robot’s own forward kinematics becomes harder to compute',
        correct: true,
        why: 'This is NOT a multi-robot complication: a robot’s kinematics depend only on its own joints, however many teammates it has.',
      },
      { text: 'Deciding which robot does which task', correct: false, why: 'Task allocation: a genuine multi-robot problem.' },
      {
        text: 'Collisions and congestion between teammates in shared space',
        correct: false,
        why: 'A genuine one: interference grows with team size.',
      },
      {
        text: 'Telling which robot’s actions earned the team’s reward',
        correct: false,
        why: 'Credit assignment: a genuine one.',
      },
    ],
    source: 'Original; review deck slide 26',
    trapId: 'read-the-stem',
    difficulty: 1,
  },

  // ------------------------------------------------------------------ learning, credit assignment, belief space
  {
    id: 'multi-q-global',
    style: 'most-correct',
    stem: 'A global coordination strategy for a multi-robot team attempts to optimise:',
    options: [
      {
        text: 'the joint state–action value of the whole team',
        correct: true,
        why: 'The robots’ actions interact, so the team’s value depends on the combination of actions: $Q(s, a_1, \\ldots, a_n)$.',
      },
      {
        text: 'the sum of the individual robots’ state–action values',
        correct: false,
        why: 'Each individual value is computed as if the robot acted alone, which ignores interactions: two robots can each be “optimal” and still collide or duplicate work.',
      },
      {
        text: 'the average of the individual robots’ state–action values',
        correct: false,
        why: 'The same flaw as the sum (it is the sum divided by $n$).',
      },
      {
        text: 'the state–action value of a leader robot',
        correct: false,
        why: 'Optimising one robot’s value ignores what the rest of the team achieves.',
      },
    ],
    source: 'Recurring: 2023 Q20',
    difficulty: 2,
  },
  {
    id: 'multi-q-credit',
    style: 'most-correct',
    stem: 'Credit assignment strategies in a multi-robot team attempt to:',
    options: [
      {
        text: 'quantify how much each robot contributed to the team’s performance',
        correct: true,
        why: 'With a shared team reward, each robot needs to know whether its own actions helped; credit assignment measures exactly that.',
      },
      {
        text: 'assign each of the tasks to one of the robots',
        correct: false,
        why: 'That is task allocation, which happens before acting.',
      },
      {
        text: 'share the workload evenly so that no robot is busier than the others',
        correct: false,
        why: 'Load balancing is part of allocation, not credit assignment.',
      },
      {
        text: 'give each robot a specialised role within the team',
        correct: false,
        why: 'Role assignment: again a decision made before acting.',
      },
    ],
    source: 'Recurring: 2024 Q20',
    difficulty: 1,
  },
  {
    id: 'multi-q-structural',
    style: 'most-correct',
    stem: 'Structural credit assignment in multi-robot coordination refers to:',
    options: [
      {
        text: 'deciding which robot is given which task',
        correct: false,
        why: 'Task allocation: deciding who does what, not judging the result.',
      },
      {
        text: 'building the radio network that the robots use to talk to each other',
        correct: false,
        why: 'Infrastructure for explicit coordination, unrelated to credit.',
      },
      {
        text: 'displaying each robot’s belief about the world',
        correct: false,
        why: 'Beliefs belong to belief-space planning; nothing here judges contributions.',
      },
      {
        text: 'judging how much each individual robot added to the team’s result',
        correct: true,
        why: '“Structural” asks **which robot** earned the team’s reward; temporal credit assignment asks which earlier action did.',
      },
    ],
    source: 'Recurring: 2025 Q20',
    difficulty: 1,
  },
  {
    id: 'multi-q-temporal',
    style: 'most-correct',
    stem: 'Temporal credit assignment, as opposed to structural credit assignment, asks:',
    options: [
      {
        text: 'which earlier actions led to a reward received later',
        correct: true,
        why: 'Rewards often arrive long after the actions that earned them; discounting and TD learning spread the credit back in time.',
      },
      {
        text: 'which robot in the team earned the team’s reward',
        correct: false,
        why: 'That is structural credit assignment (2025 Q20).',
      },
      {
        text: 'how much time each robot spends working on its own assigned task',
        correct: false,
        why: 'That is a workload measure, not credit assignment.',
      },
      {
        text: 'when the next task should be put up for auction',
        correct: false,
        why: 'A scheduling question for task allocation.',
      },
    ],
    source: 'Original; Notes §8–§9',
    difficulty: 2,
  },
  {
    id: 'multi-q-ctde',
    style: 'most-correct',
    stem: 'Multi-agent RL policies for robot teams are often “trained centrally and executed independently”. This means:',
    options: [
      {
        text: 'training may use every robot’s data, but at run time each robot acts on its own observations',
        correct: true,
        why: 'Shared information during training (in simulation) helps with credit assignment and changing teammates; local execution needs no central computer or constant communication.',
      },
      {
        text: 'a central computer chooses every robot’s action at run time from the full joint state of the team',
        correct: false,
        why: 'That is centralised execution, which needs constant communication and has a single point of failure.',
      },
      {
        text: 'each robot trains alone, never sharing data, and is then deployed with the others',
        correct: false,
        why: 'That is independent training, which suffers badly from teammates changing their behaviour; central training avoids it.',
      },
      {
        text: 'the policies are trained on the real robots first and fine-tuned in simulation afterwards',
        correct: false,
        why: 'Backwards: training normally happens in simulation, with fine-tuning on hardware.',
      },
    ],
    source: 'Original; Notes §9',
    difficulty: 2,
  },
  {
    id: 'multi-q-belief',
    style: 'correct',
    stem: 'Which statement about belief-space planning for a robot team is correct?',
    options: [
      {
        text: 'Each robot plans over a probability distribution about the world and its teammates',
        correct: true,
        why: 'The belief represents what the robot does not know, so actions can be chosen for their expected reward and for the information they gather.',
      },
      {
        text: 'It needs millions of training episodes in a simulator before it can be deployed on the robots',
        correct: false,
        why: 'That is multi-agent RL. Belief-space planning plans online, from models.',
      },
      {
        text: 'It ignores uncertainty so that planning stays fast',
        correct: false,
        why: 'The opposite: it represents uncertainty explicitly, which is what makes it expensive.',
      },
      {
        text: 'Its computational cost does not grow as more robots join the team',
        correct: false,
        why: 'The belief and the planning problem grow very quickly with team size: its main drawback.',
      },
    ],
    source: 'Original; Notes §9; review deck slide 25',
    difficulty: 2,
  },
  {
    id: 'multi-q-learn-vs-belief',
    style: 'incorrect',
    stem: 'Comparing learning-based (multi-agent RL) and belief-space planning approaches to multi-robot coordination:',
    options: [
      {
        text: 'Belief-space planning does most of its computation offline, before deployment',
        correct: true,
        why: 'This is the FALSE statement: belief-space planning plans online, at every step. It is learning that moves the computation offline, into training.',
      },
      {
        text: 'Learning-based approaches do most of their computation in training, before deployment',
        correct: false,
        why: 'True: once trained, running the policy is cheap.',
      },
      {
        text: 'Belief-space planning represents uncertainty explicitly, as probability distributions',
        correct: false,
        why: 'True: that is what the belief is.',
      },
      {
        text: 'Learning from a shared team reward raises a credit assignment problem',
        correct: false,
        why: 'True: each robot cannot tell how much its own actions contributed.',
      },
    ],
    source: 'Original; review deck slide 25 (compare and contrast)',
    trapId: 'read-the-stem',
    difficulty: 2,
  },
];

export const games: Game[] = [
  {
    kind: 'sort',
    id: 'multi-g-coord',
    title: 'Implicit or explicit coordination?',
    prompt: 'Implicit coordination: robots infer what their teammates will do by observing them, with no messages. Explicit coordination: robots communicate and negotiate. Sort each item by the coordination it describes or, for a deployment, the one that suits it best.',
    buckets: [
      { id: 'implicit', label: 'Implicit (observe and infer)' },
      { id: 'explicit', label: 'Explicit (communicate and negotiate)' },
    ],
    items: [
      {
        id: 'i1',
        text: 'Each robot watches where its teammates are heading and picks a different area to search',
        bucket: 'implicit',
        why: 'Intent is inferred from observation alone (the key of 2024 Q19).',
      },
      {
        id: 'i2',
        text: 'Searching a collapsed mine where radio dies a few metres into the tunnels',
        bucket: 'implicit',
        why: 'There is no link to negotiate over; observation-based coordination keeps working without one.',
      },
      {
        id: 'i3',
        text: 'Underwater robots whose acoustic link carries a few bytes per second',
        bucket: 'implicit',
        why: 'Messages are too slow and sparse to negotiate every decision, so the robots must mostly infer.',
      },
      {
        id: 'i4',
        text: 'A swarm of 200 cheap drones with short-range radios',
        bucket: 'implicit',
        why: 'Message load would explode with team size; simple observation-based rules scale to large swarms.',
      },
      {
        id: 'i5',
        text: 'A contested site where the radio is jammed',
        bucket: 'implicit',
        why: 'Communication cannot be relied on, so the robots must coordinate by observation.',
      },
      {
        id: 'e1',
        text: 'Robots bid for delivery jobs and the lowest-cost bid wins',
        bucket: 'explicit',
        why: 'An auction is negotiation by message: the classic explicit scheme.',
      },
      {
        id: 'e2',
        text: 'Each robot negotiates its task with nearby teammates over a mesh radio',
        bucket: 'explicit',
        why: 'Negotiating by communication is explicit, even with no central computer (the key of 2023 Q19 and 2025 Q19).',
      },
      {
        id: 'e3',
        text: 'A warehouse fleet of 30 robots on reliable Wi-Fi sharing one floor',
        bucket: 'explicit',
        why: 'The network is dependable, so robots can claim aisles, share plans and avoid conflicts directly.',
      },
      {
        id: 'e4',
        text: 'Two farm drones with good LTE share their partial maps so that no field is surveyed twice',
        bucket: 'explicit',
        why: 'Sharing maps over a working link prevents duplicated work.',
      },
      {
        id: 'e5',
        text: 'Hospital delivery robots that book the lifts with one another over building Wi-Fi',
        bucket: 'explicit',
        why: 'Shared, scarce resources (the lifts) are best negotiated directly when the network is reliable.',
      },
    ],
    source: 'Notes §9; 2023 Q19, 2024 Q19, 2025 Q19; 2024 Q27',
  },
  {
    kind: 'match',
    id: 'multi-g-challenges',
    title: 'What makes a team harder than one robot?',
    prompt: 'Match each multi-robot challenge to an example of it.',
    pairs: [
      {
        id: 'c1',
        left: 'Task allocation',
        right: 'Twelve parcels and four robots: who delivers which?',
        why: 'Deciding who does what, usually by an auction or a central optimiser.',
      },
      {
        id: 'c2',
        left: 'Duplicated work',
        right: 'Two drones both map the north paddock while the south one is never covered',
        why: 'Each acted sensibly on its own; without coordination they overlapped.',
      },
      {
        id: 'c3',
        left: 'Collisions and congestion',
        right: 'Five robots queue at the only charging dock and block the corridor',
        why: 'Shared space and resources create interference that a single robot never meets.',
      },
      {
        id: 'c4',
        left: 'Limited, unreliable communication',
        right: 'A robot’s task claim never arrives because the radio dropped inside a tunnel',
        why: 'Explicit schemes depend on messages getting through.',
      },
      {
        id: 'c5',
        left: 'Scaling with team size',
        right: 'Going from 10 to 100 robots multiplies the all-to-all messages by more than 100',
        why: '$n(n-1)$: from 90 to 9900 messages per update.',
      },
      {
        id: 'c6',
        left: 'Not knowing what teammates know or intend',
        right: 'A robot cannot tell whether its teammate has already checked the room ahead',
        why: 'Teammates’ beliefs and plans are hidden unless they are observed or communicated.',
      },
      {
        id: 'c7',
        left: 'Credit assignment',
        right: 'The team found every survivor: which robot’s actions earned the reward?',
        why: 'A shared reward hides each robot’s contribution, which makes learning hard.',
      },
    ],
    source: 'Notes §9; review deck slide 26',
  },
];

export const shortAnswers: ShortAnswer[] = [
  {
    id: 'multi-sa-explicit-drawback',
    prompt: '**(1 mark)** In no more than 50 words: identify one drawback of using explicit coordination in a multi-robot system.',
    wordLimit: 50,
    model: 'Explicit coordination depends on communication: limited bandwidth, latency and dropped links can stall or break the coordination (for example underground, where radio fails), and the message load grows quickly with team size, so it scales poorly.',
    keyPoints: [
      'it depends on communication (bandwidth, latency, reliable links)',
      'coordination stalls or fails when links drop',
      'message load grows with team size (poor scalability)',
    ],
    source: 'Similar to 2023 Q30',
    marks: 1,
  },
  {
    id: 'multi-sa-implicit-explicit',
    prompt: '**(3 marks)** In no more than 130 words: discuss the benefits and drawbacks of using implicit vs explicit coordination in a multi-robot system.',
    wordLimit: 130,
    model: '**Implicit coordination:** each robot infers its teammates’ intentions by observing them, with no messages. Benefits: robust to communication loss, cheap, needs no network infrastructure and scales to large teams. Drawbacks: inferences can be wrong, so robots duplicate work or conflict; allocation is usually less efficient; and it needs good perception and models of teammates.\n\n**Explicit coordination:** robots communicate and negotiate, for example through task auctions. Benefits: conflicts and duplication are avoided directly, allocation can be near-optimal, and maps and plans are shared. Drawbacks: it depends on reliable, low-latency links; message load and computation grow with team size; and it degrades badly if the network drops.\n\nImplicit suits an underground search with no comms; explicit suits a warehouse with reliable Wi-Fi.',
    keyPoints: [
      'implicit: inferring teammates’ intent from observation, no messages',
      'implicit benefit (robust to comms loss, cheap, scales) and drawback (wrong inferences: duplication, conflicts)',
      'explicit: communicate and negotiate (e.g. auctions)',
      'explicit benefit (avoids conflicts directly, near-optimal, shared maps) and drawback (needs reliable links; load grows with team size)',
      'a scenario where each wins',
    ],
    source: 'Similar to 2024 Q27',
    marks: 3,
  },
  {
    id: 'multi-sa-communication',
    prompt: '**(3 marks)** In no more than 110 words: explain the benefits and drawbacks of using communication for multi-robot coordination.',
    wordLimit: 110,
    model: '**Benefits:** robots can share intentions, task claims, maps and observations. This avoids duplicated work and collisions, enables near-optimal allocation (for example auctions), and improves every robot’s estimate of the world through pooled sensing.\n\n**Drawbacks:** the team becomes dependent on the network. Bandwidth limits, latency and dropped or corrupted messages degrade performance, and coordination can fail entirely where links drop (underground, underwater). Message load and computation grow with team size, and a central node, if one is used, is a single point of failure.',
    keyPoints: [
      'sharing intentions and claims avoids duplicated work and collisions',
      'enables near-optimal allocation (e.g. auctions) and pooled maps or observations',
      'depends on the network: bandwidth, latency, dropped messages',
      'coordination can fail where links drop (underground, underwater)',
      'message load grows with team size; a central node is a single point of failure',
    ],
    source: 'Similar to 2025 Q27',
    marks: 3,
  },
  {
    id: 'multi-sa-complexities',
    prompt: '**(3 marks)** In no more than 100 words: what additional complexities arise when moving from a single robot to a multi-robot system?',
    wordLimit: 100,
    model: '**Task allocation:** deciding which robot does which task. **Interference:** avoiding duplicated work, and collisions or congestion in shared space. **Communication:** limited bandwidth and unreliable links constrain what the robots can share. **Scalability:** joint state and action spaces, and the message load, grow rapidly with team size. **Partial knowledge of teammates:** a robot does not know what the others know or intend, so it must infer it or be told. **Credit assignment:** with a shared team reward it is hard to tell which robot’s actions earned it, which makes learning harder.',
    keyPoints: [
      'task allocation',
      'duplicated work, collisions and congestion',
      'limited, unreliable communication',
      'scaling: joint spaces and message load grow with team size',
      'not knowing teammates’ knowledge or intentions; credit assignment',
    ],
    source: 'Review deck slide 26; Notes §9',
    marks: 3,
  },
  {
    id: 'multi-sa-credit',
    prompt: '**(2 marks)** In no more than 80 words: what is the credit assignment problem in multi-robot learning, and how can it be addressed?',
    wordLimit: 80,
    model: 'When a team is trained with one shared reward, each robot receives the same signal whether or not its own actions helped, so it cannot tell good behaviour from bad and learning is slow. Structural credit assignment quantifies each robot’s contribution to the team’s performance. One approach is a difference reward, $D_i = G(z) - G(z_{-i})$: the team reward minus the reward the team would have earned without robot $i$, which isolates that robot’s contribution.',
    keyPoints: [
      'a shared team reward gives every robot the same signal',
      'so a robot cannot tell whether its own actions helped',
      'credit assignment quantifies each robot’s contribution to team performance',
      'a fix: difference rewards $D_i = G(z) - G(z_{-i})$ (or centralised training with a joint critic)',
    ],
    source: 'Original; Notes §9; 2024 Q20, 2025 Q20',
    marks: 2,
  },
  {
    id: 'multi-sa-learn-belief',
    prompt: '**(3 marks)** In no more than 130 words: compare and contrast learning-based (multi-agent RL) and belief-space planning approaches to multi-robot coordination.',
    wordLimit: 130,
    model: '**Learning-based** approaches train policies from a team reward, usually in simulation, often with centralised training and decentralised execution. After training, acting is a fast policy lookup, and they can capture complex, hard-to-model behaviour; but they need many episodes, a good reward and simulator, face credit assignment and non-stationary teammates, and give no guarantees.\n\n**Belief-space planning** keeps a probability distribution over the world and the teammates’ states or plans, and plans the actions that maximise expected reward over that belief. It handles uncertainty explicitly and in a principled way, needs no training and can value information-gathering; but it requires models, and its online computation grows rapidly with team size and planning horizon.\n\nLearning pays its cost offline; belief-space planning pays online.',
    keyPoints: [
      'learning: policies trained from a team reward (centralised training, decentralised execution)',
      'learning: cheap at run time, but data-hungry, credit assignment, non-stationarity, no guarantees',
      'belief-space: plans over probability distributions of the world and teammates',
      'belief-space: principled, explicit uncertainty, no training; but computation explodes with team size and horizon',
      'contrast: offline (training) vs online (planning) computation',
    ],
    source: 'Review deck slide 25 (learning outcome); Notes §9',
    marks: 3,
  },
  {
    id: 'multi-sa-mine',
    prompt: '**(2 marks)** Four robots must search a collapsed mine for survivors. Radio works near the entrance but fails a few metres into the tunnels. In no more than 80 words: which kind of coordination would you rely on in the tunnels, and why?',
    wordLimit: 80,
    model: 'Implicit coordination. In the tunnels the radio fails, so an explicit scheme such as task auctions would stall or act on stale claims. With implicit coordination each robot infers what its teammates are doing from what it observes (their positions, explored areas, direction of travel) and takes a different branch, which keeps working without messages. The cost is some duplicated search when inferences are wrong; the robots can share maps explicitly whenever they return within radio range.',
    keyPoints: [
      'choose implicit coordination',
      'reason: no reliable link, so explicit negotiation (auctions) would stall',
      'how: infer teammates’ intent from observation and pick different branches',
      'the cost (duplicated search), with explicit map sharing near the entrance',
    ],
    source: 'Original; Notes §9 (scenario guidance)',
    marks: 2,
  },
  {
    id: 'multi-sa-auction',
    prompt: '**(2 marks)** In no more than 80 words: describe how an auction allocates tasks in a multi-robot team, and give one weakness.',
    wordLimit: 80,
    model: 'A task is announced to the team; each robot computes its cost for doing it (the travel distance, or the extra cost given the tasks it already holds) and sends that as a bid; the task is awarded to the lowest bidder, and the process repeats for the remaining tasks. It is distributed and usually near-optimal. Weaknesses: every announcement, bid and award must get through, the message load grows with team size, and greedy one-at-a-time awards can be suboptimal.',
    keyPoints: [
      'announce the task; each robot bids its own cost',
      'the lowest bid wins; repeat for each task',
      'distributed, usually near-optimal',
      'a weakness: needs reliable communication, load grows with team size, or greedy awards can be suboptimal',
    ],
    source: 'Original; Notes §9 (task auctions)',
    marks: 2,
  },
  {
    id: 'multi-sa-ctde',
    prompt: '**(2 marks)** Multi-agent RL policies are often trained centrally and executed in a decentralised way. In no more than 80 words: explain what this means and why it is done.',
    wordLimit: 80,
    model: 'During training, usually in simulation, a central learner can use every robot’s observations and actions and the global state, for example to learn the joint state–action value that evaluates the team. This eases credit assignment and copes with teammates changing their behaviour as they learn. At run time each robot executes its own policy from its local observations only, so no central computer or constant communication is needed, which makes the team robust to communication loss and scalable.',
    keyPoints: [
      'training uses global information (all observations and actions, joint value)',
      'this helps credit assignment and non-stationary teammates',
      'execution: each robot acts on its own local observations',
      'why: no central computer or constant comms at run time, so robust and scalable',
    ],
    source: 'Original; Notes §9',
    marks: 2,
  },
  {
    id: 'multi-sa-marl-hard',
    prompt: '**(3 marks)** In no more than 100 words: give three reasons why multi-agent RL for a robot team is harder than single-agent RL.',
    wordLimit: 100,
    model: 'First, the joint state and action spaces grow exponentially with team size ($|A|^n$ joint actions), so far more experience is needed. Second, non-stationarity: while teammates learn, their behaviour changes, so from one robot’s view the dynamics keep shifting and the fixed-MDP assumption breaks. Third, credit assignment: with a shared team reward, a robot cannot tell how much its own actions contributed. In addition, each robot sees only part of the world and cannot observe what its teammates know or intend.',
    keyPoints: [
      'joint state and action spaces grow exponentially ($|A|^n$)',
      'non-stationarity: teammates’ learning changes the dynamics each robot sees',
      'credit assignment with a shared team reward',
      'partial observability of the world and of teammates’ intentions',
    ],
    source: 'Original; Notes §9; review deck slide 26',
    marks: 3,
  },
];
