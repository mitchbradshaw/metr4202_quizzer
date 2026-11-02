// MCQs (original wording, cited to the past papers), method games and exam-style short answers for 'plan'.
// Covers every planning MCQ of 2023–2025 (2023 Q9, Q10; 2024 Q9, Q10, Q11; 2025 Q9, Q10, Q11) plus originals.
import type { Game, MCQ, ShortAnswer } from '../../engine/types';

export const mcqs: MCQ[] = [
  // ------------------------------------------------------------------ graph search
  {
    id: 'plan-q-bfs-dijkstra',
    style: 'correct',
    stem: 'Suppose every edge in a search graph has the same cost.',
    options: [
      {
        text: 'BFS and Dijkstra’s algorithm expand nodes in the same order.',
        correct: true,
        why: 'With equal costs, $g(n)$ is the edge cost times the depth of $n$, so popping the lowest $g$ means popping the shallowest node: exactly BFS’s first-in, first-out order (ties aside).',
      },
      {
        text: 'BFS and DFS expand nodes in the same order.',
        correct: false,
        why: 'Neither looks at edge costs, so equal costs change nothing: BFS still takes the oldest node (FIFO), DFS the newest (LIFO).',
      },
      {
        text: 'DFS and Dijkstra’s algorithm expand nodes in the same order.',
        correct: false,
        why: 'Dijkstra expands level by level here (lowest $g$ = shallowest), while DFS dives down the newest branch first.',
      },
      {
        text: 'DFS and A* expand nodes in the same order.',
        correct: false,
        why: 'A* ranks Open by $g + h$; DFS ignores both and always takes the most recently added node.',
      },
    ],
    source: 'Recurring: 2023 Q9; 2024 Q9 (a)',
    difficulty: 1,
  },
  {
    id: 'plan-q-bfs-astar',
    style: 'incorrect',
    stem: 'About BFS, Dijkstra’s algorithm and A* on a graph with non-negative edge costs:',
    options: [
      {
        text: 'If every edge has the same cost, BFS and A* expand nodes in the same order.',
        correct: true,
        why: 'This is the FALSE statement: A*’s heuristic moves nodes that look closer to the goal to the front of Open, while BFS is blind to the goal. Only a constant $h$ (such as $h = 0$) would make them agree.',
      },
      {
        text: 'If every edge has the same cost, BFS and Dijkstra’s algorithm expand nodes in the same order.',
        correct: false,
        why: 'True: $g$ is then proportional to depth, so lowest-$g$ order is BFS order.',
      },
      {
        text: 'Dijkstra’s algorithm and A* with an admissible heuristic both return a least-cost path.',
        correct: false,
        why: 'True: Dijkstra is optimal for non-negative costs, and so is A* when $h$ never overestimates.',
      },
      {
        text: 'A* with $h(n) = 0$ for every node is Dijkstra’s algorithm.',
        correct: false,
        why: 'True: then $f = g$, which is exactly Dijkstra’s priority.',
      },
    ],
    source: 'Recurring: 2024 Q9 (mirror of 2023 Q9)',
    trapId: 'read-the-stem',
    difficulty: 1,
  },
  {
    id: 'plan-q-dijkstra-key',
    style: 'most-correct',
    stem: 'Dijkstra’s algorithm orders its priority queue by:',
    options: [
      {
        text: 'the cost to arrive at each node, $g(n)$',
        correct: true,
        why: 'It always expands the node that is cheapest to reach from the start, which is why the path is optimal the moment the goal is popped.',
      },
      { text: 'first in, first out', correct: false, why: 'That is BFS’s queue, which ignores edge costs.' },
      { text: 'last in, first out', correct: false, why: 'That is DFS’s stack.' },
      {
        text: 'the cost to arrive plus a heuristic estimate of the cost to go, $g(n) + h(n)$',
        correct: false,
        why: 'That is A*. Dijkstra is the special case $h = 0$.',
      },
      {
        text: 'the heuristic estimate of the cost to go, $h(n)$',
        correct: false,
        why: 'That is greedy best-first search, which ignores the cost already paid and is not optimal.',
      },
    ],
    source: 'Recurring: 2025 Q9',
    difficulty: 1,
  },
  {
    id: 'plan-q-astar-stop',
    style: 'correct',
    stem: 'Working A* by hand, you have just added the goal to Open with $f = 14.2$. Another node in Open has $f = 13.6$.',
    options: [
      {
        text: 'Pop the $f = 13.6$ node next; the search ends only when the goal itself is popped.',
        correct: true,
        why: 'The goal’s 14.2 is only the best route found **so far**. With an admissible $h$, the node at 13.6 might still reach the goal for less. Once the goal is popped, no Open node has a lower $f$, so nothing cheaper can remain.',
      },
      {
        text: 'Stop now: the goal is in Open, so backtracking from it gives the shortest path.',
        correct: false,
        why: 'Stopping when the goal is first added is the classic A* trap: a cheaper route may still be waiting in Open.',
      },
      {
        text: 'Stop only if the goal’s parent is the node that was expanded last.',
        correct: false,
        why: 'When the goal is added, its parent is always the node just expanded; that says nothing about optimality.',
      },
      {
        text: 'Delete the goal from Open, because the $f = 13.6$ node is sure to reach it more cheaply.',
        correct: false,
        why: '$f$ is a lower bound, not a promise: the 13.6 node may lead to the goal at more than 14.2. Open entries are only ranked, never deleted.',
      },
    ],
    source: 'Notes §5 (A* by hand); 2024 Q29(c); review deck slide 17',
    trapId: 'goal-on-insert',
    difficulty: 2,
  },
  // ------------------------------------------------------------------ heuristics
  {
    id: 'plan-q-heuristics',
    style: 'incorrect',
    stem: 'About heuristics for A*:',
    options: [
      {
        text: 'Every admissible heuristic is also consistent.',
        correct: true,
        why: 'This is the FALSE statement; it is the other way round. Consistency, $h(n) \\le c(n, m) + h(m)$ on every edge, implies admissibility, but an admissible $h$ can still drop by more than an edge’s cost between neighbours.',
      },
      {
        text: 'An admissible heuristic never overestimates the true cost from a node to the goal.',
        correct: false,
        why: 'True: that is the definition, $h(n) \\le h^*(n)$.',
      },
      {
        text: 'A consistent heuristic satisfies $h(n) \\le c(n, m) + h(m)$ on every edge, with $h(\\text{goal}) = 0$.',
        correct: false,
        why: 'True: a triangle inequality, which keeps $f$ from decreasing along any path.',
      },
      {
        text: 'Of two admissible heuristics, the one that is larger everywhere is more informed, so A* typically expands fewer nodes with it.',
        correct: false,
        why: 'True (dominance): a larger admissible $h$ is closer to $h^*$, so fewer nodes look promising.',
      },
      {
        text: 'The zero heuristic is admissible and turns A* into Dijkstra’s algorithm.',
        correct: false,
        why: 'True: $0 \\le h^*$ always holds, and with $h = 0$, $f = g$.',
      },
    ],
    source: 'Notes §5; 2024 Q29(b)',
    difficulty: 2,
  },
  {
    id: 'plan-q-manhattan',
    style: 'correct',
    stem: 'A robot can move in any direction in the plane, and the cost of a path is its Euclidean length. As an A* heuristic, the Manhattan distance $|\\Delta x| + |\\Delta y|$ to the goal:',
    options: [
      {
        text: 'can overestimate the remaining cost, so A* may return a longer path',
        correct: true,
        why: 'With free motion the true cost can be the straight line, and $|\\Delta x| + |\\Delta y| \\ge \\sqrt{\\Delta x^2 + \\Delta y^2}$: from (0, 0) to (1, 1) it says 2 when the truth is $\\sqrt2$. It is not admissible.',
      },
      {
        text: 'is admissible, because it never exceeds the straight-line distance',
        correct: false,
        why: 'Backwards: the Manhattan distance is never **less** than the straight-line distance, which is exactly why it overestimates.',
      },
      {
        text: 'is admissible, but A* expands more nodes with it than with the Euclidean heuristic',
        correct: false,
        why: 'It is not admissible here. (Being larger, it actually tends to expand fewer nodes, at the price of optimality.)',
      },
      {
        text: 'ranks Open exactly as Dijkstra’s algorithm does',
        correct: false,
        why: 'Only $h = 0$ reproduces Dijkstra’s order; any informative heuristic changes it.',
      },
    ],
    source: 'Similar to 2023 Q25 (short answer)',
    trapId: 'manhattan-diagonal',
    difficulty: 1,
  },
  {
    id: 'plan-q-inflated',
    style: 'correct',
    stem: 'A* on a grid uses the Euclidean heuristic. You multiply the heuristic by $\\varepsilon = 2$ (weighted A*). Compared with $\\varepsilon = 1$, A* typically:',
    options: [
      {
        text: 'expands fewer nodes, but its path may cost up to twice the optimum',
        correct: true,
        why: 'A larger $h$ penalises nodes far from the goal more, so the search narrows and expands fewer nodes. But $2h$ can overestimate, so optimality is lost; the cost stays within $\\varepsilon$ times the optimum.',
      },
      {
        text: 'expands fewer nodes and still always returns the least-cost path',
        correct: false,
        why: 'Optimality needs an admissible $h$. $2h$ can overestimate, so A* may pop the goal through a longer path.',
      },
      {
        text: 'expands more nodes, because every node now seems further from the goal',
        correct: false,
        why: 'The opposite: nodes towards the goal now look much better than the rest, so fewer nodes are expanded.',
      },
      {
        text: 'behaves exactly like Dijkstra’s algorithm',
        correct: false,
        why: 'Dijkstra is $\\varepsilon = 0$ (the heuristic ignored). As $\\varepsilon$ grows, A* tends towards greedy best-first search.',
      },
    ],
    source: 'Original (heuristic lab); notes §5',
    difficulty: 2,
  },
  // ------------------------------------------------------------------ C-space
  {
    id: 'plan-q-cspace-band',
    style: 'most-correct',
    stem: 'A planar 2-link arm has $L_1 = 2$ and $L_2 = 2$. A small obstacle sits 1.5 from the base, in the direction 60° from $+x$. In the $(\\theta_1, \\theta_2)$ C-space it appears mainly as:',
    options: [
      {
        text: 'a full-height vertical band near $\\theta_1 = \\pi/3$',
        correct: true,
        why: 'At 1.5 < $L_1$ it lies on link 1’s sweep: whenever $\\theta_1$ points at it (60°), link 1 hits it whatever $\\theta_2$ is. Link 2 folding back adds small bulges elsewhere.',
      },
      {
        text: 'an isolated blob near $\\theta_2 \\approx 0$, at $\\theta_1 \\approx \\pi/3$',
        correct: false,
        why: 'That is the signature of an obstacle beyond $L_1$, which only link 2 can reach, with the arm nearly straight.',
      },
      {
        text: 'a full-width horizontal band near $\\theta_2 = \\pi/3$',
        correct: false,
        why: '$\\theta_2$ alone never decides a collision: link 1 depends on $\\theta_1$, and link 2 on $\\theta_1 + \\theta_2$.',
      },
      {
        text: 'no C-space obstacle at all, since the arm can always bend around it',
        correct: false,
        why: 'The joint values fix the arm’s shape: at $\\theta_1 = \\pi/3$ link 1 passes straight through the obstacle, so those configurations are in $\\mathcal{C}_{obs}$.',
      },
    ],
    source: 'Similar to 2023 Q26, 2024 Q24, 2025 Q25',
    trapId: 'cspace-band-blob',
    difficulty: 2,
  },
  {
    id: 'plan-q-cspace-blob',
    style: 'most-correct',
    stem: 'The same arm ($L_1 = L_2 = 2$). Another small obstacle lies 3.5 from the base, straight to its left (180°). Its C-space obstacle is:',
    options: [
      {
        text: 'a blob near $\\theta_2 = 0 \\equiv 2\\pi$ around $\\theta_1 \\approx \\pi$, cut by the top and bottom edges',
        correct: true,
        why: 'Link 1 reaches only 2, so only link 2 can touch it, and only with the arm almost straight: the reach $\\sqrt{8 + 8\\cos\\theta_2}$ must be at least 3.5, so $|\\theta_2| \\lesssim 58^\\circ$. Just above 0 and just below $2\\pi$ are neighbours on the torus.',
      },
      {
        text: 'a full-height vertical band around $\\theta_1 \\approx \\pi$',
        correct: false,
        why: 'A band needs link 1 to reach the obstacle, but 3.5 is beyond $L_1 = 2$.',
      },
      {
        text: 'a blob near $\\theta_2 \\approx \\pi$, where the arm folds back on itself as far as it can',
        correct: false,
        why: 'At $\\theta_2 = \\pi$ the tip is back at the base (reach $|L_1 - L_2| = 0$), nowhere near something 3.5 away.',
      },
      {
        text: 'a full-width horizontal band along $\\theta_2 \\approx 0$, covering every value of $\\theta_1$',
        correct: false,
        why: 'A straight arm only reaches the obstacle when it points at it, i.e. for $\\theta_1$ near $\\pi$, not for every $\\theta_1$.',
      },
    ],
    source: 'Similar to 2023 Q26, 2024 Q24, 2025 Q25',
    trapId: 'cspace-band-blob',
    difficulty: 2,
  },
  {
    id: 'plan-q-straight-line',
    style: 'correct',
    stem: 'The straight line between the start and goal positions of a robot arm’s end-effector misses every obstacle in the workspace.',
    options: [
      {
        text: 'The motion can still collide: the links sweep space too, so it must be checked in C-space.',
        correct: true,
        why: 'Only the end-effector’s path was checked. The links (or a mobile robot’s body) sweep a volume, so the motion is safe only if every configuration along it lies in $\\mathcal{C}_{free}$.',
      },
      {
        text: 'The arm can follow it safely, since only the end-effector can ever touch the obstacles.',
        correct: false,
        why: 'Every link occupies space: in the exam C-spaces most regions come from link 1 or link 2 hitting an obstacle, not the tip.',
      },
      {
        text: 'The arm can follow it safely as long as the start and goal configurations are collision-free.',
        correct: false,
        why: 'Free end points say nothing about the motion between them: the same flaw as checking only the end of an RRT edge (2023 Q32c).',
      },
      {
        text: 'Its path in joint space is also a straight line, so one check covers both spaces.',
        correct: false,
        why: 'Inverse kinematics is nonlinear: a straight tip path is a curve in $(\\theta_1, \\theta_2)$, and joint limits or singularities may stop the arm following it at all.',
      },
    ],
    source: 'Review deck slide 15; notes §5',
    difficulty: 1,
  },
  // ------------------------------------------------------------------ sampling
  {
    id: 'plan-q-prm-rrt',
    style: 'incorrect',
    stem: 'About probabilistic roadmaps (PRMs) and rapidly exploring random trees (RRTs):',
    options: [
      {
        text: 'RRTs suit multi-query problems: one tree can answer queries from any start.',
        correct: true,
        why: 'This is the FALSE statement: an RRT is rooted at one start and grown towards one goal, so a new start needs a new tree. RRT is a single-query planner.',
      },
      {
        text: 'A PRM can answer many start–goal queries with the same roadmap.',
        correct: false,
        why: 'True: the roadmap does not depend on the start or goal, so it is reused (multi-query).',
      },
      {
        text: 'A PRM can also be used for a single query.',
        correct: false,
        why: 'True (2024 Q11): build it, connect the one start and goal, search it.',
      },
      {
        text: 'PRMs and RRTs both need a collision-checking routine.',
        correct: false,
        why: 'True (2023 Q10): every sample and every edge must be checked.',
      },
      {
        text: 'RRTs are probabilistically complete.',
        correct: false,
        why: 'True (2024 Q11): if a path exists, the chance of finding one tends to 1 as samples are added.',
      },
    ],
    source: 'Recurring: 2023 Q10, 2024 Q11',
    trapId: 'read-the-stem',
    difficulty: 1,
  },
  {
    id: 'plan-q-sampling-not',
    style: 'most-correct',
    stem: 'Which of these is **not** needed by a sampling-based planner such as a PRM or an RRT?',
    options: [
      {
        text: 'An explicit map of the C-space obstacles',
        correct: true,
        why: 'Avoiding it is the whole point: the planner probes C-space one sample at a time through the collision checker, which is why it scales to many DOF.',
      },
      {
        text: 'A distance metric between configurations',
        correct: false,
        why: 'Needed to find the nearest node (RRT) or the neighbours to connect (PRM).',
      },
      {
        text: 'A way of drawing random configurations',
        correct: false,
        why: 'Needed: the sampler is what makes the planner sampling-based.',
      },
      {
        text: 'A collision checker for configurations and edges',
        correct: false,
        why: 'Needed: it is the planner’s only window onto the obstacles.',
      },
    ],
    source: 'Recurring: 2024 Q10 (mirror of 2025 Q11)',
    difficulty: 1,
  },
  {
    id: 'plan-q-sampling-must',
    style: 'most-correct',
    stem: 'Which of these **must** a sampling-based planner have?',
    options: [
      {
        text: 'A collision-checking routine',
        correct: true,
        why: 'Every sample and every edge is tested with it; it stands in for an explicit model of $\\mathcal{C}_{obs}$.',
      },
      {
        text: 'A sensor model $p(z \\mid x)$',
        correct: false,
        why: 'That belongs to state estimation. The planner assumes the obstacles are known to its collision checker.',
      },
      {
        text: 'An explicit representation of the configuration space',
        correct: false,
        why: 'This is precisely what sampling avoids building.',
      },
      {
        text: 'An explicit representation of the workspace',
        correct: false,
        why: 'The geometry hides inside the collision checker; the planner itself only asks it yes-or-no questions.',
      },
    ],
    source: 'Recurring: 2025 Q11 (mirror of 2024 Q10)',
    difficulty: 1,
  },
  // ------------------------------------------------------------------ RRT and RRT*
  {
    id: 'plan-q-rrt-subopt',
    style: 'most-correct',
    stem: 'Why do the paths from basic RRT stay suboptimal, however many samples are added?',
    options: [
      {
        text: 'Each new node joins the nearest node, ignoring cost-to-come, and edges are never revised.',
        correct: true,
        why: 'Early random branches are locked in, so detours made at the start are never straightened; with probability 1, RRT converges to a suboptimal path.',
      },
      {
        text: 'Uniform samples rarely land near the optimal path, even as their number keeps growing.',
        correct: false,
        why: 'Samples become dense everywhere. The problem is how they are connected, not where they land.',
      },
      {
        text: 'It checks collisions only at the nodes, so it has to take wide detours to stay safe.',
        correct: false,
        why: 'RRT checks whole edges; collision checking affects safety, not the cost of the path.',
      },
      {
        text: 'It is not probabilistically complete, so it may never find the best route.',
        correct: false,
        why: 'RRT is probabilistically complete: it finds **a** path. Completeness is about finding one; optimality is about its cost.',
      },
    ],
    source: 'Similar to 2023 Q32(d)',
    trapId: 'rrt-nearest',
    difficulty: 2,
  },
  {
    id: 'plan-q-star-property',
    style: 'most-correct',
    stem: 'What property do PRM* and RRT* have that PRM and RRT lack?',
    options: [
      {
        text: 'Asymptotic optimality',
        correct: true,
        why: 'As samples are added, the cost of the returned path converges to the optimum (with probability 1). It comes from a connection radius that shrinks like $(\\log n / n)^{1/d}$ and, in RRT*, choose-parent and rewiring.',
      },
      {
        text: 'Probabilistic completeness',
        correct: false,
        why: 'PRM and RRT already have it: they find a path with probability tending to 1 if one exists.',
      },
      {
        text: 'Completeness: they report in finite time when no path exists',
        correct: false,
        why: 'No sampling planner can prove that a path does not exist.',
      },
      {
        text: 'An optimal path after a fixed, finite number of samples',
        correct: false,
        why: 'Optimality is only reached in the limit of infinitely many samples.',
      },
    ],
    source: 'Review deck slide 15; notes §5',
    difficulty: 1,
  },
  {
    id: 'plan-q-rrtstar-parent',
    style: 'value',
    stem: 'In an RRT*, the new node $x_{new}$ has three neighbours within the radius: $x_p$ (cost-to-come 4.0, distance to $x_{new}$ 1.2), $x_q$ (2.5, 2.4) and $x_r$ (3.1, 2.0). Every edge is collision-free. Which parent does RRT* choose, and what is $c(x_{new})$?',
    options: [
      {
        text: '$x_q$, with $c(x_{new}) = 4.9$',
        correct: true,
        why: 'Choose parent minimises $c(x_{near}) + d$: $x_p$ 4.0 + 1.2 = 5.2, $x_q$ 2.5 + 2.4 = **4.9**, $x_r$ 3.1 + 2.0 = 5.1.',
      },
      {
        text: '$x_p$, with $c(x_{new}) = 5.2$',
        correct: false,
        why: '$x_p$ is the **nearest** node, which is basic RRT’s choice. RRT* compares total cost-to-come.',
      },
      {
        text: '$x_r$, with $c(x_{new}) = 5.1$',
        correct: false,
        why: 'Close, but $x_q$’s 4.9 is lower.',
      },
      {
        text: '$x_q$, with $c(x_{new}) = 2.4$',
        correct: false,
        why: '2.4 is only the last edge: $c(x_{new})$ also includes the 2.5 it costs to reach $x_q$ from the root.',
      },
    ],
    source: 'Similar to 2025 Q29(a)–(b)',
    trapId: 'rrt-nearest',
    difficulty: 2,
  },
  {
    id: 'plan-q-rewire',
    style: 'correct',
    stem: 'RRT* has just added $x_{new}$ with $c(x_{new}) = 4.0$. A neighbour $x_k$ inside the radius has $c(x_k) = 7.2$, and $d(x_{new}, x_k) = 2.6$ along a collision-free edge.',
    options: [
      {
        text: '$x_k$ is rewired to have $x_{new}$ as its parent, and its whole subtree gets 0.6 cheaper.',
        correct: true,
        why: '$c(x_{new}) + d = 4.0 + 2.6 = 6.6 < 7.2$, so routing through $x_{new}$ saves 0.6, and every descendant of $x_k$ inherits that saving.',
      },
      {
        text: '$x_k$ keeps its parent, because the rewire step only ever changes the parent of $x_{new}$.',
        correct: false,
        why: 'That describes choose-parent. Rewiring (“from” $x_{new}$) changes the parents of the **neighbours**.',
      },
      {
        text: '$x_{new}$ is re-parented to $x_k$, since $x_k$ offers it the cheaper route.',
        correct: false,
        why: 'Backwards: through $x_k$, $x_{new}$ would cost $7.2 + 2.6 = 9.8 > 4.0$.',
      },
      {
        text: '$x_k$ is rewired, but its descendants keep their old costs until they are sampled again.',
        correct: false,
        why: 'Cost-to-come is defined through the parent chain, so the saving reaches the whole subtree at once.',
      },
    ],
    source: 'Similar to 2025 Q29(c), 2023 Q32(e)',
    trapId: 'rrt-nearest',
    difficulty: 2,
  },
  {
    id: 'plan-q-edge-check',
    style: 'most-correct',
    stem: 'An RRT for a differential-drive robot uses the velocity motion model as its steering function. For each new edge, the collision check must cover:',
    options: [
      {
        text: 'the robot’s footprint along the whole arc',
        correct: true,
        why: 'A constant $(v, \\omega)$ moves the robot along an arc of radius $v/\\omega$; an obstacle can sit on that arc even when both end poses are free.',
      },
      {
        text: 'only the pose the robot reaches at the end of the arc',
        correct: false,
        why: 'This is the 2023 Q32(c) mistake: the robot passes through every pose in between.',
      },
      {
        text: 'the two end poses of the arc, which bracket the motion',
        correct: false,
        why: 'Both ends can be free while the middle of the arc crosses an obstacle.',
      },
      {
        text: 'the straight chord joining the start and end poses',
        correct: false,
        why: 'The robot follows the arc, not the chord, so it sweeps different ground.',
      },
    ],
    source: 'Similar to 2023 Q32(a), (c)',
    trapId: 'endpoint-collision',
    difficulty: 1,
  },
  // ------------------------------------------------------------------ global vs local
  {
    id: 'plan-q-hierarchy',
    style: 'most-correct',
    stem: 'Which of the following motivates hierarchical planning, with a global planner and a local planner?',
    options: [
      {
        text: 'Searching the whole map for a route from the robot’s current pose to the goal can be computationally expensive.',
        correct: false,
        why: 'True, but only half the story: it explains running the global planner rarely, not why a fast local layer is needed.',
      },
      {
        text: 'The robot must replan at high frequency to cope with a changing environment and imperfect execution of its actions.',
        correct: false,
        why: 'True, but only half the story: it explains the fast local layer, not why the expensive global search is kept separate.',
      },
      {
        text: 'Both (a) and (b)',
        correct: true,
        why: 'The expensive global search runs rarely on the map, while a cheap local planner replans many times a second to absorb disturbances. Together the two reasons motivate the split.',
      },
      { text: 'Neither (a) nor (b)', correct: false, why: 'Both statements are genuine motivations.' },
    ],
    source: 'Recurring: 2025 Q10',
    fixedOrder: true,
    difficulty: 1,
  },
  {
    id: 'plan-q-potential',
    style: 'most-correct',
    stem: 'A robot following a potential field ($U = U_{att} + U_{rep}$, moving along $-\\nabla U$) heads for a goal behind a U-shaped obstacle and halts inside the U. Why?',
    options: [
      {
        text: 'It sits in a local minimum of $U$, where attraction and repulsion cancel',
        correct: true,
        why: 'Gradient descent stops wherever $\\nabla U = 0$. Inside the U, the pull towards the goal is balanced by the push from the walls, and no small move lowers $U$.',
      },
      {
        text: 'The attractive potential only acts within a short range of the goal',
        correct: false,
        why: 'Attraction grows with distance from the goal (quadratic, or conic far away), so it pulls everywhere.',
      },
      {
        text: 'The repulsive force only switches on once the robot touches an obstacle',
        correct: false,
        why: 'Repulsion acts throughout the influence distance $Q^*$; it is exactly that push that balances the attraction.',
      },
      {
        text: 'The planner has proved that no path to the goal exists',
        correct: false,
        why: 'A path around the U exists. A potential field is not complete and proves nothing about paths; a global planner would find the way round.',
      },
    ],
    source: 'Notes §5 (local planners); review deck slide 14',
    difficulty: 1,
  },
  {
    id: 'plan-q-dwa',
    style: 'most-correct',
    stem: 'In the dynamic window approach, the robot picks its next command from:',
    options: [
      {
        text: 'velocities $(v, \\omega)$ it can reach within one control period and still stop safely',
        correct: true,
        why: 'The acceleration limits set the window; arcs that could not stop before an obstacle are dropped; the rest are simulated and scored on heading, clearance and speed.',
      },
      {
        text: 'every velocity within its motor limits, whatever it happens to be doing right now',
        correct: false,
        why: 'Acceleration limits make most of those unreachable within one period. Restricting the search to the reachable window is the “dynamic” in the name.',
      },
      {
        text: 'the velocities outside the cones that lead to a collision with a moving obstacle',
        correct: false,
        why: 'That is the velocity-obstacle method, a different local planner.',
      },
      {
        text: 'the direction of steepest descent of an attractive-plus-repulsive potential',
        correct: false,
        why: 'That is a potential field.',
      },
      {
        text: 'a random sample joined to the nearest node of a growing tree',
        correct: false,
        why: 'That is an RRT, a global sampling-based planner.',
      },
    ],
    source: 'Notes §5; review deck slide 14',
    difficulty: 2,
  },
  {
    id: 'plan-q-warehouse',
    style: 'best',
    stem: 'A fleet of holonomic robots moves pallets around a warehouse whose shelf layout is known and fixed. Which planning design fits best?',
    options: [
      {
        text: 'A* (or a PRM) on the known map, plus velocity obstacles between the robots',
        correct: true,
        why: 'The known static map suits a global planner whose graph is reused for every task; holonomic robots can follow its geometric paths directly; the other robots move, so a reactive local layer avoids them in real time.',
      },
      {
        text: 'A potential field for each robot, with no global planner at all',
        correct: false,
        why: 'Rows of shelves create local minima that trap the robots; potential fields give no guarantee of reaching the goal.',
      },
      {
        text: 'A new RRT for every task and no local layer, since sampling copes with anything',
        correct: false,
        why: 'It throws away a known static map that could be searched (or roadmapped) once and reused, and nothing reacts to robots moving during execution.',
      },
      {
        text: 'One global A* path per task, computed at the start and followed open-loop',
        correct: false,
        why: 'The global part is right, but a path followed blindly cannot react to the other robots.',
      },
    ],
    source: 'Review deck slide 15; notes §5',
    difficulty: 2,
  },
];

export const games: Game[] = [
  {
    kind: 'sort',
    id: 'plan-g-global-local',
    title: 'Global or local planner?',
    prompt: 'A hierarchical planner has a slow **global** layer that searches the known map and a fast **local** layer that reacts to what the map missed (2025 Q10). Sort each method or job into its layer.',
    buckets: [
      { id: 'global', label: 'Global (whole known map, runs rarely)' },
      { id: 'local', label: 'Local (latest sensor data, runs every cycle)' },
    ],
    items: [
      { id: 'g1', text: 'A* over the warehouse floor plan', bucket: 'global', why: 'Searches the whole known map for a complete, optimal route: too slow to rerun every cycle.' },
      { id: 'g2', text: 'A probabilistic roadmap built once for a factory cell', bucket: 'global', why: 'A roadmap of the static environment, queried for whole routes: global and multi-query.' },
      { id: 'g3', text: 'RRT* to a goal on the far side of the map', bucket: 'global', why: 'Plans the full route through the known C-space and improves it over many samples, not within milliseconds.' },
      { id: 'g4', text: 'Dijkstra’s algorithm on the road network', bucket: 'global', why: 'Graph search over the whole map: a global route.' },
      { id: 'g5', text: 'Rerun only when the goal changes or the map is updated', bucket: 'global', why: 'Global search is expensive (2025 Q10 (a)), so it is run rarely.' },
      { id: 'l1', text: 'Dynamic window approach', bucket: 'local', why: 'Picks the next $(v, \\omega)$ from the velocities reachable within one control period, using the latest scan.' },
      { id: 'l2', text: 'Velocity obstacles', bucket: 'local', why: 'Rules out velocities that would hit a moving obstacle within a short horizon: a reactive, per-cycle decision.' },
      { id: 'l3', text: 'A potential field around the robot’s current position', bucket: 'local', why: 'Follows $-\\nabla U$ from where the robot is now: fast and reactive, but it can stall in local minima, so it needs a global layer above it.' },
      { id: 'l4', text: 'Swerving round a pallet that is not on the map', bucket: 'local', why: 'Unmapped obstacles only appear in the sensor data while moving: that is the local layer’s job.' },
      { id: 'l5', text: 'Replanning 20 times a second from the latest laser scan', bucket: 'local', why: 'High-frequency replanning is the local layer’s job (2025 Q10 (b)).' },
    ],
    source: 'Notes §5; 2025 Q10; review deck slides 14–15',
  },
  {
    kind: 'sort',
    id: 'plan-g-query',
    title: 'Explicit grid, roadmap or tree?',
    prompt: 'Does the planner build the C-space explicitly, or only sample it? And if it samples, is it built for **many** queries (a roadmap that does not depend on the start) or **one** (a tree grown from the start)? Sort each planner or scenario.',
    buckets: [
      { id: 'grid', label: 'Explicit C-space grid' },
      { id: 'multi', label: 'Sampling, multi-query' },
      { id: 'single', label: 'Sampling, single-query' },
    ],
    items: [
      { id: 'q1', text: 'PRM: sample free configurations, link near neighbours, search the roadmap', bucket: 'multi', why: 'The roadmap does not depend on the start or the goal, so it is reused for every query in the same environment.' },
      { id: 'q2', text: 'RRT grown from the start until it reaches the goal', bucket: 'single', why: 'The tree is rooted at one start and biased towards one goal: a new start needs a new tree (2023 Q10, 2024 Q11).' },
      { id: 'q3', text: 'RRT*, choosing parents and rewiring as it grows from the start', bucket: 'single', why: 'Still one rooted tree: it improves paths from that start only.' },
      { id: 'q4', text: 'PRM*, with a connection radius shrinking like $(\\log n / n)^{1/d}$', bucket: 'multi', why: 'An asymptotically optimal roadmap, still independent of the start, so still multi-query.' },
      { id: 'q5', text: 'Mark every 1° × 1° cell of $(\\theta_1, \\theta_2)$ as free or blocked, then run A*', bucket: 'grid', why: 'Builds the C-space obstacle map explicitly: fine for 2 DOF ($360^2$ cells), hopeless for 7 ($360^7$).' },
      { id: 'q6', text: 'An occupancy grid with obstacles grown by a round robot’s radius, searched with A*', bucket: 'grid', why: 'Growing the obstacles by the radius builds the $(x, y)$ C-space of a round robot explicitly; easy in 2-D.' },
      { id: 'q7', text: 'A 6-DOF arm in a fixed work cell that must serve hundreds of pick-and-place requests', bucket: 'multi', why: 'Static scene, many start–goal pairs: build a roadmap once and query it each time. A grid over 6 joints would be far too big.' },
      { id: 'q8', text: 'A differential-drive robot plans once to a single waypoint, steering along velocity-model arcs', bucket: 'single', why: 'One query, and a motion-model steering function (arcs of radius $v/\\omega$) fits tree extension naturally (2023 Q32).' },
      { id: 'q9', text: 'A 7-DOF arm reaching into a cluttered shelf that is rearranged before every task', bucket: 'single', why: 'Too many DOF for a grid, and the scene changes, so a roadmap could not be reused: grow a tree for each task.' },
    ],
    source: 'Notes §5; 2023 Q10, 2024 Q10–Q11, 2025 Q11, 2025 Q24',
  },
  {
    kind: 'match',
    id: 'plan-g-pops',
    title: 'What does it pop next?',
    prompt: 'Every one of these searches keeps an Open list and pops one node from it per step. Match each algorithm to the node it pops next.',
    pairs: [
      { id: 'p1', left: 'Breadth-first search (BFS)', right: 'The oldest node in Open (FIFO queue)', why: 'It expands level by level, so it finds the path with the fewest edges.' },
      { id: 'p2', left: 'Depth-first search (DFS)', right: 'The newest node in Open (LIFO stack)', why: 'It dives down one branch first: little memory, no optimality.' },
      { id: 'p3', left: 'Dijkstra’s algorithm', right: 'The node with the lowest cost-to-arrive $g(n)$', why: 'It expands in order of cost from the start: optimal for non-negative costs, and the same as BFS when every edge costs the same.' },
      { id: 'p4', left: 'A*', right: 'The node with the lowest $g(n) + h(n)$', why: 'Cost so far plus an estimate of the cost to go: optimal with an admissible $h$, and goal-directed.' },
      { id: 'p5', left: 'Greedy best-first search', right: 'The node with the lowest heuristic $h(n)$', why: 'It heads straight for the goal but ignores the cost already paid: fast, not optimal.' },
    ],
    source: 'Notes §5 (graph search table); 2025 Q9; review deck slide 15',
  },
];

export const shortAnswers: ShortAnswer[] = [
  {
    id: 'plan-sa-manhattan',
    prompt: '**(1 mark)** In no more than 50 words: why would the Manhattan distance not be a valid heuristic for a robot using A* to plan in Euclidean space?',
    wordLimit: 50,
    model: 'A* needs an admissible heuristic, one that never overestimates the cost to go. In Euclidean space the robot can move diagonally, so the Manhattan distance overestimates: from (0, 0) to (1, 1) it gives 2, but the true cost is $\\sqrt2$. A* may then return a suboptimal path.',
    keyPoints: [
      'A* needs an admissible heuristic (never overestimates)',
      'with diagonal or free motion, $|\\Delta x| + |\\Delta y| \\ge \\sqrt{\\Delta x^2 + \\Delta y^2}$',
      'a counterexample, e.g. (0, 0) → (1, 1): 2 > $\\sqrt2$',
      'consequence: A* can return a suboptimal path',
    ],
    source: 'Similar to 2023 Q25',
    marks: 1,
  },
  {
    id: 'plan-sa-prm-grid',
    prompt: '**(3 marks)** In no more than 100 words: explain the motivation for building a search graph with a probabilistic roadmap (PRM) rather than a grid-based decomposition of the configuration space.',
    wordLimit: 100,
    model: 'A grid decomposition discretises the whole C-space: with $k$ cells per joint it needs $k^n$ cells for $n$ DOF, so it is impractical beyond 2–3 DOF, and every cell must be labelled free or occupied by computing the C-space obstacles explicitly. Its resolution also trades missed narrow passages against run time. A PRM instead samples random configurations, keeps the collision-free ones and joins nearby ones with collision-checked local paths. It needs only a collision checker, concentrates its nodes in free space, scales to high-DOF arms, is probabilistically complete, and its roadmap can be reused for many queries.',
    keyPoints: [
      'grid size grows exponentially with DOF ($k^n$ cells)',
      'a grid needs the C-space obstacles computed explicitly (and a resolution trade-off)',
      'PRM samples free configurations and links neighbours with a local planner, needing only a collision checker',
      'PRM scales to high-DOF robots and is probabilistically complete',
      'the roadmap is reused for many queries (multi-query)',
    ],
    source: 'Similar to 2025 Q24',
    marks: 3,
  },
  {
    id: 'plan-sa-bfs-weighted',
    prompt: '**(1 mark)** A shuttle road map has edges of very different lengths (0.9 km to 11.2 km). In no more than 50 words: why would breadth-first search NOT be an appropriate algorithm for finding the shortest route between two campuses?',
    wordLimit: 50,
    model: 'BFS ignores edge costs: it expands nodes in order of how many edges they are from the start, so it returns the fewest-hop route, not the shortest one. With road lengths this unequal, more but shorter edges can win (7.8 km over three edges vs 8.6 km over two).',
    keyPoints: [
      'BFS ignores edge weights (costs)',
      'it finds the fewest-edge (fewest-hop) path',
      'with unequal lengths, fewest hops ≠ shortest distance',
      'use Dijkstra or A* instead',
    ],
    source: 'Similar to 2024 Q29(a)',
    marks: 1,
  },
  {
    id: 'plan-sa-sld',
    prompt: '**(2 marks)** A table lists the straight-line distance from every campus to the goal campus. In no more than 60 words: explain why these values are a valid heuristic for A* on the road map.',
    wordLimit: 60,
    model: 'A* needs an admissible heuristic, $h(n) \\le h^*(n)$: it must never overestimate the remaining cost. The shuttle drives along roads, and no road route between two points can be shorter than the straight line between them, so the straight-line distance never overestimates, and it is 0 at the goal. (It also obeys the triangle inequality, so it is consistent.)',
    keyPoints: [
      'admissible: never overestimates the true remaining cost',
      'a road route can never be shorter than the straight line',
      '$h(\\text{goal}) = 0$',
      'bonus: triangle inequality ⇒ consistent',
    ],
    source: 'Similar to 2024 Q29(b)',
    marks: 2,
  },
  {
    id: 'plan-sa-edge-check',
    prompt: '**(2 marks)** An RRT for a differential-drive robot checks for collisions only at the final pose reached by each steering command. In no more than 60 words: is that enough? Why or why not?',
    wordLimit: 60,
    model: 'No. Each steering command moves the robot along a whole arc, sweeping its footprint over everything in between. An obstacle can lie on the arc even when both end poses are free, so the edge would pass straight through it. The footprint must be checked along the entire edge, e.g. at poses spaced more finely than the smallest obstacle.',
    keyPoints: [
      'No',
      'the robot sweeps the whole arc between the two poses',
      'an obstacle can lie on the edge while both ends are free',
      'check the footprint along the whole edge (finer than the smallest obstacle)',
    ],
    source: 'Similar to 2023 Q32(c)',
    marks: 2,
  },
  {
    id: 'plan-sa-rrt-subopt',
    prompt: '**(2 marks)** RRTs produce suboptimal paths. In no more than 50 words: describe one reason for this suboptimality, in terms of how the RRT algorithm builds its tree.',
    wordLimit: 50,
    model: 'RRT connects each new sample to the nearest tree node by distance, ignoring the cost-to-come from the root, and never revisits existing edges. Early random branches are therefore locked in, giving jagged detours; more samples do not fix them, so RRT converges to a suboptimal path.',
    keyPoints: [
      'connects to the NEAREST node, ignoring cost-to-come',
      'edges are never revised (no rewiring)',
      'early random branches are locked in, giving jagged detours',
      'more samples do not fix it: it converges to a suboptimal path',
    ],
    source: 'Similar to 2023 Q32(d)',
    marks: 2,
  },
  {
    id: 'plan-sa-rewire',
    prompt: '**(4 marks)** RRT* achieves asymptotic optimality by rewiring the tree in a neighbourhood around each newly added node. In no more than 130 words: explain the “to” and the “from” calculations that make up the rewiring. (In the exam you may add a sketch.)',
    wordLimit: 130,
    model: 'Let $c(x)$ be the cost-to-come from the root and $d(\\cdot, \\cdot)$ the edge cost, and consider every node $x_{near}$ within radius $r$ of $x_{new}$.\n\n1. “To” $x_{new}$ (choose parent): for each $x_{near}$ compute $c(x_{near}) + d(x_{near}, x_{new})$, and connect $x_{new}$ to the collision-free neighbour with the smallest total, not simply the nearest node.\n2. “From” $x_{new}$ (rewire): for every other neighbour, test $c(x_{new}) + d(x_{new}, x_{near}) < c(x_{near})$. If true and the edge is collision-free, delete $x_{near}$’s old parent edge and make $x_{new}$ its parent; the costs of its subtree fall by the same amount.\n\nRepeated at every insertion, this keeps the tree locally optimal, so the path cost converges to the optimum.',
    keyPoints: [
      'cost-to-come $c(x)$ and the neighbourhood of radius $r$',
      '“to”: parent = the neighbour minimising $c(x_{near}) + d(x_{near}, x_{new})$',
      '“from”: rewire $x_{near}$ if $c(x_{new}) + d(x_{new}, x_{near}) < c(x_{near})$',
      'collision-free edges only; the old edge is removed and the subtree’s costs drop',
      'repeated at every insertion ⇒ asymptotic optimality',
    ],
    source: 'Similar to 2023 Q32(e); 2025 Q29(b)–(c)',
    marks: 4,
  },
  {
    id: 'plan-sa-straight-line',
    prompt: '**(2 marks)** A collision-free straight-line path exists between two points in a robot’s workspace. In no more than 70 words: does this mean the robot can move between them without collision? Explain.',
    wordLimit: 70,
    model: 'Not necessarily. The line only shows that a point (e.g. the end-effector) can pass. The robot has a body: its links or chassis sweep a volume that can hit obstacles, and moving the tip straight needs every joint to change, a curved path in C-space. Joint limits or a nonholonomic base may even make the line impossible to follow. The motion must be collision-free in C-space.',
    keyPoints: [
      'No (not necessarily)',
      'the robot is not a point: its links or body sweep a volume',
      'the path must be collision-free in C-space, for every configuration along it',
      'kinematic limits (joint limits, nonholonomic constraints) may make the line infeasible',
    ],
    source: 'Review deck slide 15',
    marks: 2,
  },
  {
    id: 'plan-sa-warehouse',
    prompt: '**(4 marks)** You need to plan paths for a fleet of holonomic robots moving pallets in a warehouse whose shelf layout is known and fixed. In no more than 130 words: which planning approach would you use, and why?',
    wordLimit: 130,
    model: 'A hierarchy. **Global:** the shelf map is known and static, so build a graph once (a grid or a PRM roadmap of the floor plan) and run A* with a straight-line heuristic for each task: optimal on the graph, complete, and the graph is reused for every query. Holonomic robots can move in any direction, so these geometric paths can be followed directly. **Local:** the other robots (and people) move, so a fast reactive layer, such as reciprocal velocity obstacles or the dynamic window approach, replans at high frequency to avoid collisions while tracking the global path. This separates the expensive search, run rarely, from cheap reactive replanning, run every cycle.',
    keyPoints: [
      'global planner on the known static map (A* on a grid or PRM roadmap), reused across tasks',
      'justified: optimal / complete on the graph; the fixed map suits multi-query',
      'holonomic ⇒ geometric paths are directly executable',
      'a local layer (velocity obstacles / DWA) for the other moving robots, at high frequency',
      'why a hierarchy: expensive global search run rarely, fast local replanning run often (2025 Q10)',
    ],
    source: 'Review deck slide 15; 2025 Q10',
    marks: 4,
  },
  {
    id: 'plan-sa-star',
    prompt: '**(2 marks)** In no more than 60 words: what additional property do PRM* and RRT* have over PRM and RRT, and what change to the algorithms provides it?',
    wordLimit: 60,
    model: 'Asymptotic optimality: as the number of samples grows, the cost of the returned path converges (with probability 1) to the optimal cost, whereas PRM and RRT are only probabilistically complete. PRM* connects each sample to every neighbour within a radius shrinking like $(\\log n / n)^{1/d}$; RRT* adds choose-parent and rewiring within such a radius.',
    keyPoints: [
      'asymptotic optimality',
      'the path cost tends to the optimum as samples → ∞ (with probability 1)',
      'PRM and RRT are probabilistically complete but not optimal',
      'mechanism: a connection radius ∝ $(\\log n / n)^{1/d}$; RRT* chooses parents and rewires',
    ],
    source: 'Review deck slide 15',
    marks: 2,
  },
];
