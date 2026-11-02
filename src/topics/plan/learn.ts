// Concept cards and flashcards for 'plan' (summary notes §5; 2023 Q9, Q10, Q25, Q26, Q32; 2024 Q9–Q11, Q24, Q29;
// 2025 Q9–Q11, Q24, Q25, Q29; review deck slides 14–17). Card ids are fixed: sims, generators and Home link to them.
import type { ConceptCard, Flashcard } from '../../engine/types';

export const cards: ConceptCard[] = [
  // ------------------------------------------------------------------ C-space
  {
    id: 'plan-cspace',
    title: 'Workspace vs configuration space (2-link arm)',
    lecture: 'Notes §5; review deck slides 14–16',
    formulas: [
      '$$\\mathcal{C}_{obs} = \\{\\, q \\in \\mathcal{C} : \\mathcal{A}(q) \\cap \\mathcal{O} \\neq \\emptyset \\,\\}, \\qquad \\mathcal{C}_{free} = \\mathcal{C} \\setminus \\mathcal{C}_{obs}$$',
      '$$\\text{elbow} = \\text{base} + L_1\\begin{bmatrix}\\cos\\theta_1 \\\\ \\sin\\theta_1\\end{bmatrix}, \\qquad \\text{tip} = \\text{elbow} + L_2\\begin{bmatrix}\\cos(\\theta_1 + \\theta_2) \\\\ \\sin(\\theta_1 + \\theta_2)\\end{bmatrix}$$',
    ],
    what: 'The **workspace** is the physical space the robot’s body moves through, with the obstacles drawn as they are. The **configuration space** (C-space) has one axis per joint (degree of freedom): a single point $q$ fixes where every part of the robot is. $\\mathcal{A}(q)$ is the region the robot occupies at $q$; the configurations where it overlaps an obstacle $\\mathcal{O}$ form $\\mathcal{C}_{obs}$. Planning in C-space turns “move a whole arm without touching anything” into “move a point through $\\mathcal{C}_{free}$”.\n\nFor a planar 2-link arm, $q = (\\theta_1, \\theta_2)$ with $\\theta_1$ measured from $+x$ and $\\theta_2$ relative to link 1. Both are angles, so $0 \\equiv 2\\pi$ on each axis: the square plot is really a torus, and regions run off one edge and back in at the opposite one.',
    when: '- “Label the corresponding configuration space obstacles in the boxes” (2023 Q26, 5 marks; 2024 Q24, 4 marks; 2025 Q25, 3 marks).\n- “Match the following workspaces to their configuration spaces” (review deck slide 16).\n- “If a collision-free straight-line path exists in the workspace, can the robot move along it without collision?” (review deck slide 15).',
    how: [
      'Mark the base and draw the circle of radius $L_1$ around it: link 1 can never leave that disc.',
      'An obstacle that crosses the circle is hit by link 1 whatever $\\theta_2$ is, so it is a **full-height vertical band** over the range of $\\theta_1$ that points at it (angles from $+x$, anticlockwise). Bulges on the sides of the band are link 2 hitting the same obstacle.',
      'An obstacle wholly outside the circle can only be reached by link 2, so it is an **isolated blob** near $\\theta_2 \\approx 0 \\equiv 2\\pi$ (arm nearly straight) at $\\theta_1 \\approx$ the obstacle’s direction. It is usually cut in two by the top and bottom edges.',
      'Use the wrap-around: a band at $\\theta_1 \\to 2\\pi$ continues at $\\theta_1 = 0$, and a blob leaving the top edge re-enters at the bottom. Two pieces on opposite edges are often one obstacle.',
      'Check one point per label with forward kinematics (formula box): take a $(\\theta_1, \\theta_2)$ inside the region and confirm that link 1 or link 2 really lands in the obstacle you named.',
      'Write each label with its reason (band = link 1, blob = link 2) and its rough angle range in multiples of $\\pi$.',
      'Matching several workspaces to several plots: ignore the features they all share and decide on the ones that differ (see More depth for review deck slide 16).',
    ],
    traps: [
      {
        title: 'Treating θ₂ as an absolute angle',
        detail: '$\\theta_2$ is measured **from link 1**, so link 2 points along $\\theta_1 + \\theta_2$. A blob at $\\theta_2 \\approx 0$ means “arm straight”, not “link 2 along $+x$”.',
        source: '2023 Q26, 2024 Q24',
      },
      {
        title: 'Calling a link-2 blob a band',
        detail: 'Only an obstacle that link 1 can reach (inside radius $L_1$) gives a full-height band. In 2025 Q25 nothing crossed the circle, so there were no bands at all: every region was a link-2 blob.',
        trapId: 'cspace-band-blob',
        source: '2025 Q25',
      },
      {
        title: 'Forgetting the wrap',
        detail: 'In 2023 Q26 the blob on the left edge ($\\theta_1 \\approx 0.1\\pi$) belongs to obstacle C, whose band sits on the right edge ($\\theta_1 \\in [7\\pi/4, 2\\pi]$): $\\theta_1$ runs past $2\\pi$ back to 0.',
        source: '2023 Q26',
      },
      {
        title: 'A straight workspace line is not a safe motion',
        detail: 'The links sweep a volume, and a straight tip path is a curve in joint space. Only a path through $\\mathcal{C}_{free}$ guarantees no collision.',
        source: 'Review deck slide 15',
      },
    ],
    more: 'Why bands are full height: link 1’s position depends only on $\\theta_1$, so if link 1 touches an obstacle at some $\\theta_1$, every $\\theta_2$ at that $\\theta_1$ collides. Link 2 depends on both angles, so its collisions form bounded blobs.\n\nHow tall is a blob? The tip’s distance from the base is $\\sqrt{L_1^2 + L_2^2 + 2L_1L_2\\cos\\theta_2}$, largest when $\\theta_2 = 0$. An obstacle near full reach $L_1 + L_2$ needs an almost straight arm, so its blob hugs $\\theta_2 = 0$; one just outside $L_1$ can be reached with the arm well bent, so its blob is tall.\n\nWorked (2023 Q26, base (5, 5), $L_1 \\approx 2.83$): B lies inside the circle, giving the band $\\theta_1 \\in [5\\pi/4, 3\\pi/2]$; C gives the band $[7\\pi/4, 2\\pi]$ plus the left-edge blob; A is beyond $L_1$, giving the top and bottom blobs near $\\theta_1 \\approx 0.75\\pi$–$\\pi$.\n\nWorked (review deck slide 16, match three workspaces to three C-spaces): the small obstacle beside the base is in all three workspaces, so its band at $\\theta_1 \\approx 0.75\\pi$–$\\pi$ is in all three plots and decides nothing. Decide on the rest: A’s square on the right crosses the circle (a band at $\\theta_1 \\approx 0$, wrapping to $2\\pi$) and its block below is outside it (blobs near $1.5\\pi$), so A is plot 1. B’s tall block below crosses the circle (a second band, about $1.3\\pi$–$1.7\\pi$), so B is plot 3. C’s block below is outside (blobs only), so C is plot 2.\n\nFor a mobile robot the C-space is $(x, y, \\theta)$. For a round robot $\\theta$ does not matter, and growing every obstacle by the robot’s radius turns the robot into a point.',
    exploreIds: ['cspace'],
    solveIds: ['plan-cspace'],
  },

  // ------------------------------------------------------------------ graph search
  {
    id: 'plan-search',
    title: 'Graph search: BFS, DFS, Dijkstra and A*',
    lecture: 'Notes §5; review deck slide 15',
    formulas: [
      '$$\\begin{array}{l|l|l} \\text{Search} & \\text{Pops next from Open} & \\text{Optimal?} \\\\ \\hline \\text{BFS} & \\text{oldest node (FIFO queue)} & \\text{fewest edges only} \\\\ \\text{DFS} & \\text{newest node (LIFO stack)} & \\text{no} \\\\ \\text{Dijkstra} & \\text{lowest } g(n) & \\text{yes, costs} \\ge 0 \\\\ \\text{A*} & \\text{lowest } f(n) = g(n) + h(n) & \\text{yes, } h \\text{ admissible} \\\\ \\text{Greedy} & \\text{lowest } h(n) & \\text{no} \\end{array}$$',
      '$$\\begin{gathered} \\text{all edges cost } c \\;\\Rightarrow\\; g(n) = c \\cdot \\text{depth}(n) \\;\\Rightarrow\\; \\text{Dijkstra pops in BFS order} \\\\ h(n) = 0 \\ \\ \\forall n \\;\\Rightarrow\\; f = g \\;\\Rightarrow\\; \\text{A*} = \\text{Dijkstra} \\end{gathered}$$',
    ],
    what: 'All four keep an **Open** list (found, not yet expanded) and a **Closed** list (expanded). Each step pops one node from Open, moves it to Closed and adds its neighbours. They differ only in **which** node they pop. BFS and DFS ignore edge costs; Dijkstra pops the node that is cheapest to reach so far, $g(n)$; A* adds $h(n)$, an estimate of the cost still to go, so it heads for the goal and still returns the cheapest path when $h$ never overestimates.',
    when: '- “X and Y are the same if the edge costs are uniform” (2023 Q9 TRUE, 2024 Q9 FALSE).\n- “Dijkstra’s search orders its priority queue according to …” (2025 Q9).\n- “Explain why BFS would NOT be appropriate for finding the shortest path over this graph” (2024 Q29a, 1 mark).\n- “What is the main difference between how BFS, DFS, Dijkstra and A* perform graph search?” (review deck slide 15).',
    how: [
      'Ask what each search uses as its priority: insertion order (BFS oldest first, DFS newest first), $g$ (Dijkstra), $g + h$ (A*) or $h$ alone (greedy best-first).',
      'Ask what “shortest” means here: fewest edges (BFS is enough) or least total cost (Dijkstra or A*). Unequal edge costs rule BFS out.',
      'Quote the equivalences: equal edge costs make $g$ proportional to depth, so Dijkstra pops in BFS order; $h = 0$ turns A* into Dijkstra. BFS and A* are **not** the same under equal costs, because $h$ reorders Open.',
      'Quote the guarantees: BFS finds the fewest-edge path; Dijkstra the cheapest path when costs are non-negative; A* the cheapest when $h$ is admissible. DFS and greedy promise nothing.',
      'Quote the cost: A* with a good heuristic expands far fewer nodes than Dijkstra, which spreads out evenly in every direction; DFS uses the least memory.',
    ],
    traps: [
      {
        title: '“BFS and A* are the same when costs are uniform”',
        detail: 'FALSE (the key of 2024 Q9): the heuristic changes the order. The true pairs are BFS ≡ Dijkstra (uniform costs) and Dijkstra ≡ A* ($h = 0$).',
        trapId: 'read-the-stem',
        source: '2023 Q9, 2024 Q9',
      },
      {
        title: 'BFS on a weighted map',
        detail: 'BFS returns the fewest-hop route. On the 2024 Brisbane map, from KG to SL it gives KG → H → SL (8.6 km), but KG → GP → SB → SL is 7.8 km.',
        trapId: 'bfs-weights',
        source: '2024 Q29(a)',
      },
      {
        title: 'Dijkstra’s key mixed up with A*’s',
        detail: 'Dijkstra ranks by cost to arrive $g$ only. Adding the heuristic cost to go is what makes it A*.',
        source: '2025 Q9',
      },
    ],
    more: 'Completeness: on a finite graph BFS, Dijkstra and A* always find a path if one exists; DFS does too if it remembers visited nodes, but can run forever down an infinite branch.\n\n**Planning under uncertainty (MDPs).** Graph search assumes every action has one known outcome. When outcomes are uncertain (wheels slip, a door may be shut), the problem becomes a Markov decision process $(S, A, T, R, \\gamma)$ with $T(s, a, s^{\\prime}) = p(s^{\\prime} \\mid s, a)$. The answer is then a **policy** $\\pi(s)$, an action for every state, because the robot may end up anywhere; it is found by value iteration when $T$ is known, or learned by reinforcement learning when it is not. Shortest-path search is the special case where each action has one outcome and the reward is minus the edge cost.',
    exploreIds: ['grid'],
    solveIds: ['plan-search-order', 'plan-bfs-weighted'],
  },

  // ------------------------------------------------------------------ heuristics
  {
    id: 'plan-heuristics',
    title: 'Heuristics: admissible, consistent, inflated',
    lecture: 'Notes §5; 2023 Q25; 2024 Q29(b)',
    formulas: [
      '$$\\text{admissible: } h(n) \\le h^*(n) \\ \\ \\forall n, \\qquad \\text{consistent: } h(n) \\le c(n, m) + h(m),\\ \\ h(\\text{goal}) = 0$$',
      '$$\\begin{aligned} h_{\\text{Euc}} &= \\sqrt{\\Delta x^2 + \\Delta y^2} \\\\ h_{\\text{oct}} &= \\max(|\\Delta x|, |\\Delta y|) + (\\sqrt2 - 1)\\min(|\\Delta x|, |\\Delta y|) \\\\ h_{\\text{Man}} &= |\\Delta x| + |\\Delta y| \\end{aligned} \\qquad h_{\\text{Euc}} \\le h_{\\text{oct}} \\le h_{\\text{Man}}$$',
      '$$\\begin{array}{l|ccc} \\text{the robot can move} & h_{\\text{Euc}} & h_{\\text{oct}} & h_{\\text{Man}} \\\\ \\hline \\text{4-connected grid} & \\checkmark & \\checkmark & \\checkmark \\text{ exact} \\\\ \\text{8-connected grid, diagonal } \\sqrt2 & \\checkmark & \\checkmark \\text{ exact} & \\times \\\\ \\text{in any direction} & \\checkmark \\text{ exact} & \\times & \\times \\end{array}$$',
      '$$\\begin{gathered} f(n) = g(n) + \\varepsilon\\, h(n), \\quad \\varepsilon > 1,\\ \\ h \\text{ admissible} \\\\ \\Rightarrow\\ \\text{path cost} \\le \\varepsilon \\times \\text{optimum, usually with far fewer expansions} \\end{gathered}$$',
    ],
    what: 'A heuristic $h(n)$ estimates the cost still to go from $n$ to the goal. It is **admissible** if it never overestimates the true remaining cost $h^*(n)$, and **consistent** if it obeys the triangle inequality along every edge. Admissibility is what keeps A* optimal: $f = g + h$ then never overestimates the cost of completing the route found so far to $n$. Within that limit, a larger $h$ (closer to $h^*$) focuses the search and expands fewer nodes. In the table, “exact” means $h = h^*$ on a map with no obstacles.',
    when: '- “Explain why the Manhattan distance would not be a valid heuristic for a robot using A* in Euclidean space” (2023 Q25, 1 mark).\n- “Explain why the straight-line distances in Table 1 are a valid A* heuristic” (2024 Q29b, 2 marks).\n- Choosing a heuristic for a grid with or without diagonal moves, or judging an inflated one.',
    how: [
      'Work out how the robot really moves: 4-connected grid, 8-connected grid, free motion in the plane, or along roads.',
      'Find the cheapest possible cost from $n$ to the goal **ignoring obstacles** under that motion. Any $h$ that never exceeds it is admissible, because obstacles can only make the true cost larger.',
      'Free motion or roads: the straight-line (Euclidean) distance is admissible, since nothing is shorter than a straight line. Manhattan is admissible only for 4-connected moves; with diagonal or free motion it overestimates. Diagonal moves costing $\\sqrt2$: octile.',
      'To prove admissibility in words: “the true path can never be shorter than $h$ because …, so $h$ never overestimates; and $h(\\text{goal}) = 0$.” Add consistency if asked (triangle inequality).',
      'To disprove it, give one counterexample: from (0, 0) to (1, 1) Manhattan gives 2, but the true cost is $\\sqrt2 \\approx 1.41$.',
    ],
    traps: [
      {
        title: 'Manhattan with diagonal or free motion',
        detail: '$|\\Delta x| + |\\Delta y| \\ge \\sqrt{\\Delta x^2 + \\Delta y^2}$, so it overestimates whenever the robot can cut corners, and A* may pop the goal through a longer path.',
        trapId: 'manhattan-diagonal',
        source: '2023 Q25',
      },
      {
        title: 'A bigger heuristic is always better',
        detail: 'Only while it stays admissible. Inflating $h$ (say $2h$) speeds the search up, but the path can then cost up to twice the optimum.',
        source: 'Notes §5 (admissibility)',
      },
      {
        title: 'Admissible and consistent are the same',
        detail: 'Consistent implies admissible, not the reverse. With an admissible but inconsistent $h$, a Closed node can later be reached more cheaply and would have to be reopened.',
        source: '2024 Q29(b) solution',
      },
      {
        title: 'Forgetting h(goal) = 0',
        detail: 'The true cost from the goal is 0, so any $h(\\text{goal}) > 0$ already overestimates.',
        source: '2024 Q29(b) solution',
      },
    ],
    more: 'Dominance: if $h_1 \\le h_2 \\le h^*$ everywhere, A* with $h_2$ expands no more nodes than with $h_1$ (ties aside). The extremes: $h = 0$ is Dijkstra (no guidance at all) and $h = h^*$ walks straight down the optimal path. Greedy best-first ($f = h$) is the limit $\\varepsilon \\to \\infty$ of weighted A*: fast, but not optimal.\n\nWhy consistency matters by hand: with a consistent $h$, $f$ never decreases along a path, so the first time a node is popped its $g$ is final and Closed nodes never need reopening. Both exam heuristics (2024 Brisbane, review-deck Australia) are consistent, so the Open/Closed tables never reopen a node.',
    exploreIds: ['heuristics', 'grid'],
    solveIds: ['plan-admissible'],
  },

  // ------------------------------------------------------------------ A* by hand
  {
    id: 'plan-astar',
    title: 'A* by hand: Open and Closed tables',
    lecture: 'Notes §5; 2024 Q29; review deck slide 17',
    formulas: [
      '$$f(n) = g(n) + h(n), \\qquad g(m) = g(n) + c(n, m) \\ \\text{ for each neighbour } m \\text{ of the popped node } n$$',
      '$$\\text{goal popped:}\\quad g(\\text{goal}) \\le f(n) = g(n) + h(n) \\le g(n) + h^*(n) \\quad \\forall n \\in \\text{Open}$$',
    ],
    what: 'A* repeatedly pops the Open node with the lowest $f = g + h$, moves it to Closed and relaxes its neighbours. By hand the exam wants one Open table (node, $f$, parent) and one Closed table (node, $g$, parent) per expansion, then the path read back through the parents and its length. The second formula is why it may stop when the goal is popped: no node left in Open has a lower $f$, and with an admissible $h$, $f(n)$ never overestimates the cost of finishing a route through $n$, so no cheaper route can be hiding behind any of them.',
    when: '- “Compute the shortest path … using A*. Show all your working in the tables provided”, with a road map and a table of straight-line distances to the goal (2024 Q29c, 7 marks; review deck slide 17).\n- Any question that gives edge costs plus a heuristic table.',
    how: [
      'List every edge and the $h$ table. Start with Open = {start: $g = 0$, $f = h(\\text{start})$, no parent} and Closed empty.',
      'Pop the Open node with the lowest $f$ (say how you break ties) and move it to Closed with its $g$ and parent.',
      'For each neighbour not in Closed, compute $g = g(\\text{current}) + c$. New: add it with $f = g + h$ and its parent. Already in Open with a larger $g$: replace its $g$, $f$ and parent. Otherwise leave it alone.',
      'Draw both tables after every expansion. That is where the marks are.',
      'Stop when the **goal is popped**, not when it first appears in Open: a node with a lower $f$ may still lead to a cheaper path.',
      'Backtrack the parents from the goal and state the path and its length with units. Check that the length equals the goal’s $g$.',
    ],
    traps: [
      {
        title: 'Stopping when the goal enters Open',
        detail: 'Its first $g$ is only the best found so far. Pop every node with a lower $f$ first: on the review-deck map, Adelaide ($f = 2550$) is popped before Alice Springs (2600).',
        trapId: 'goal-on-insert',
        source: 'Notes §5; review deck slide 17',
      },
      {
        title: 'Not updating a parent',
        detail: 'In 2024 Q29, St Lucia enters Open via Herston with $g = 8.6$; expanding South Bank offers $4.1 + 3.7 = 7.8$, so its $g$, $f$ and parent must change to SB.',
        source: '2024 Q29(c)',
      },
      {
        title: 'Putting h into g',
        detail: 'A child’s $g$ is $g(\\text{parent}) + c$. Never add the parent’s $f$ or $h$; the heuristic is added once, only to rank Open.',
        source: 'Notes §5 (A* by hand)',
      },
      {
        title: 'Re-opening Closed nodes',
        detail: 'With a consistent heuristic (both exam maps), a Closed node’s $g$ is already optimal: skip it.',
        source: '2024 Q29(c) solution',
      },
    ],
    more: '2024 Q29 (Kelvin Grove to Mount Gravatt) in five pops: KG ($f$ = 11.0) → GP (11.2) → H (12.0) → SB (12.6) → MG (13.8, goal popped). The tables after expanding SB, the step that decides it:\n\n$$\\begin{array}{l|l|l} \\text{Open} & f = g + h & \\text{parent} \\\\ \\hline \\text{MG} & 13.8 + 0 = 13.8 & \\text{SB} \\\\ \\text{DP} & 7.5 + 6.4 = 13.9 & \\text{SB} \\\\ \\text{SL} & 7.8 + 7.1 = 14.9 & \\text{SB} \\\\ \\text{N} & 15.3 + 1.9 = 17.2 & \\text{SB} \\end{array} \\qquad \\begin{array}{l|l|l} \\text{Closed} & g & \\text{parent} \\\\ \\hline \\text{KG} & 0 & - \\\\ \\text{GP} & 3.1 & \\text{KG} \\\\ \\text{H} & 0.9 & \\text{KG} \\\\ \\text{SB} & 4.1 & \\text{GP} \\end{array}$$\n\nPath KG → GP → SB → MG = 3.1 + 1.0 + 9.7 = **13.8 km**. The runner-up, via Dutton Park, is 14.4 km.\n\nReview deck (Hobart to Alice Springs): Hobart (2400) → Melbourne (2400) → Broken Hill (2500) → Adelaide (2550) → Alice Springs (2600, popped). Path Hobart → Melbourne → Broken Hill → Alice Springs = **2600 km**.',
    exploreIds: ['astar', 'grid'],
    solveIds: ['plan-astar'],
  },

  // ------------------------------------------------------------------ sampling
  {
    id: 'plan-sampling',
    title: 'Sampling-based planning: PRM and RRT',
    lecture: 'Notes §5; 2025 Q24; review deck slides 14–15',
    formulas: [
      '$$\\underbrace{k^n}_{\\text{grid cells}} \\text{ for } n \\text{ joints at } k \\text{ cells each:} \\qquad 100^2 = 10^4, \\qquad 100^7 = 10^{14}$$',
      '$$x_{near} = \\arg\\min_{x \\in \\mathcal{T}} d(x, x_{rand}), \\qquad x_{new} = \\text{steer}(x_{near}, x_{rand}) \\ \\text{(at most one step)}$$',
      '$$\\lim_{n \\to \\infty} P(\\text{a path is found with } n \\text{ samples}) = 1 \\quad \\text{whenever a path exists}$$',
    ],
    what: 'Building C-space and its obstacles explicitly is hopeless for a 6- or 7-DOF arm. Sampling planners **probe** C-space instead: draw random configurations, keep the collision-free ones and join them with short collision-checked motions. They need only a **sampler**, a **distance metric**, a **local planner** (steering function) and a **collision checker**. A probabilistic roadmap (PRM) joins samples into a reusable graph (multi-query); a rapidly exploring random tree (RRT) grows one tree from the start towards one goal (single-query). Both are probabilistically complete (last formula).',
    when: '- “Which of the following is NOT required / is required by a sampling-based planner?” (2024 Q10, 2025 Q11).\n- “Which is FALSE: PRMs / RRTs can be used for multi-query problems, need collision checking, are probabilistically complete” (2023 Q10, 2024 Q11).\n- “Explain the motivation for a PRM compared with a grid-based decomposition” (2025 Q24, 3 marks).\n- “Describe the process of constructing a PRM and an RRT” (review deck slide 14).',
    how: [
      'PRM, build phase: sample $N$ configurations, discard those in collision, and connect each to its nearest neighbours (the $k$ nearest, or all within a radius) whenever the local path between them is collision-free.',
      'PRM, query phase: connect the start and goal to nearby roadmap nodes, then run A* or Dijkstra on the roadmap. Reuse it for the next query in the same static environment.',
      'RRT iteration: sample $x_{rand}$ (now and then the goal itself: goal bias), find the nearest tree node $x_{near}$, steer at most one step towards $x_{rand}$ to get $x_{new}$, and add the edge if it is collision-free. Stop when $x_{new}$ can be joined to the goal.',
      'Choose single-query (RRT) when every problem is new: one start and goal, a changing scene, or steering with a motion model. Choose multi-query (PRM) when one static environment will be queried many times.',
      'PRM vs grid (2025 Q24): grid cells grow as $k^n$ and need the C-obstacles computed; a PRM needs only collision checks, puts its nodes in free space, scales to many DOF, is probabilistically complete and can be reused.',
    ],
    traps: [
      {
        title: '“RRTs suit multi-query problems”',
        detail: 'An RRT is rooted at one start, so a new start means a new tree. This is the FALSE option in both 2023 Q10 and 2024 Q11.',
        trapId: 'read-the-stem',
        source: '2023 Q10, 2024 Q11',
      },
      {
        title: '“Sampling planners need an explicit C-space”',
        detail: 'That is exactly what they avoid: the collision checker answers “is this configuration (or edge) free?” on demand. They do not need a sensor model either.',
        source: '2024 Q10, 2025 Q11',
      },
      {
        title: 'Probabilistically complete means complete',
        detail: 'It finds a path with probability tending to 1 if one exists, but it can never prove that no path exists, and narrow passages need very many samples.',
        source: '2024 Q11(b)',
      },
      {
        title: 'A PRM is only for many queries',
        detail: 'It can serve a single query too (2024 Q11c is TRUE); multi-query is simply where it pays off.',
        source: '2024 Q11',
      },
    ],
    more: 'Why it is efficient: collision checks are spent only where samples land, so the effort goes into free space, and the roadmap is far sparser than a full grid. Why an RRT explores so fast: the node nearest a uniform random sample is usually on the frontier next to a large empty region (the Voronoi bias), so the tree is pulled into unexplored space.\n\nWeaknesses: narrow passages (few samples land inside them) and jagged paths, which are usually shortened afterwards. Completeness compared: a grid is **resolution complete** (it finds a path if one exists at that resolution); a sampler is **probabilistically complete**.',
    exploreIds: ['sampling'],
    solveIds: ['plan-steer', 'plan-rrtstar'],
  },

  // ------------------------------------------------------------------ RRT*
  {
    id: 'plan-rrtstar',
    title: 'RRT*: choose parent, rewire, steer',
    lecture: 'Notes §5; 2023 Q32; 2025 Q29; review deck slide 15',
    formulas: [
      '$$\\text{choose parent:}\\quad x_{parent} = \\arg\\min_{x_{near} \\in X_{near}} \\big[\\, c(x_{near}) + d(x_{near}, x_{new}) \\,\\big]$$',
      '$$\\text{rewire:}\\quad c(x_{new}) + d(x_{new}, x_{near}) < c(x_{near}) \\;\\Rightarrow\\; \\text{parent}(x_{near}) := x_{new}$$',
      "$$\\begin{aligned} x' &= x - \\tfrac{v}{\\omega}\\sin\\theta + \\tfrac{v}{\\omega}\\sin(\\theta + \\omega\\Delta t) \\\\ y' &= y + \\tfrac{v}{\\omega}\\cos\\theta - \\tfrac{v}{\\omega}\\cos(\\theta + \\omega\\Delta t) \\\\ \\theta' &= \\theta + \\omega\\Delta t + \\gamma\\Delta t \\end{aligned} \\qquad r = \\frac{v}{\\omega},\\ \\ \\gamma = 0 \\text{ when steering}$$",
    ],
    what: 'Basic RRT joins each new node to the **nearest** node and never changes an edge, so its first jagged path is never repaired. RRT* adds two steps among the nodes within a radius $r$ of each new node $x_{new}$, using the cost-to-come $c(x)$ from the root: **choose parent** (connect $x_{new}$ through the neighbour that makes it cheapest) and **rewire** (re-parent any neighbour that becomes cheaper through $x_{new}$). Its best path’s cost then converges to the optimum as samples grow: **asymptotic optimality**, which PRM* adds to PRM in the same way.',
    when: '- 2025 Q29 (10 marks): which vertex RRT connects to, which RRT* connects to and the new cost, then which edges are rewired.\n- 2023 Q32 (15 marks): the shape of velocity-model steering segments, two steering steps, collision checking at the end pose only, why RRT is suboptimal, and the “to” and “from” rewiring calculations.\n- “What additional property do PRM* and RRT* have over PRM and RRT?” (review deck slide 15).',
    how: [
      'Write down the cost-to-come $c(x)$ of every neighbour first, adding edge lengths from the root (2025 Q29: $c(x_b) = 2.8$, $c(x_a) = 6.0$, $c(x_c) = 5.8$, $c(x_d) = 9.9$).',
      'Basic RRT: the parent is the **nearest** neighbour by distance, whatever its cost ($x_a$, at 1.5).',
      'RRT* choose parent (“to” $x_{new}$): tabulate $c(x_{near}) + d(x_{near}, x_{new})$ for every collision-free neighbour and take the minimum (for $x_b$, $2.8 + 2.2 = \\mathbf{5.0}$).',
      'Rewire (“from” $x_{new}$): for every other neighbour compare $c(x_{new}) + d(x_{new}, x_{near})$ with $c(x_{near})$. If it is smaller and the edge is free, delete the neighbour’s old parent edge and connect it to $x_{new}$ (for $x_d$, $5.0 + 3.5 = 8.5 < 9.9$: rewired; for $x_a$, $6.5 > 6.0$ and for $x_c$, $7.8 > 5.8$: kept).',
      'Lower the cost of the rewired node’s whole subtree by the same saving (here $9.9 - 8.5 = 1.4$).',
      'With velocity-model steering each edge is an arc of radius $v/\\omega$: collision-check the robot’s footprint along the **whole** arc, not just at its end pose.',
    ],
    traps: [
      {
        title: 'Taking the nearest node in RRT*',
        detail: 'That is basic RRT. RRT* minimises the total cost-to-come, so a farther neighbour with a cheap route from the root can win.',
        trapId: 'rrt-nearest',
        source: '2025 Q29(a)–(b)',
      },
      {
        title: 'Comparing d alone',
        detail: 'Ranking neighbours by $d(x_{near}, x_{new})$ alone ignores how far each one already is from the root: always add $c(x_{near})$.',
        source: '2025 Q29(b)',
      },
      {
        title: 'Rewiring the wrong way round',
        detail: 'Rewiring changes a **neighbour’s** parent to $x_{new}$; $x_{new}$’s own parent was already fixed by choose-parent, and that parent is not tested again.',
        source: '2023 Q32(e), 2025 Q29(c)',
      },
      {
        title: 'Checking only the end pose',
        detail: 'The robot sweeps the whole edge; an obstacle can sit on the arc while both ends are free.',
        trapId: 'endpoint-collision',
        source: '2023 Q32(c)',
      },
    ],
    more: 'The 2025 Q29 tables, as you would write them:\n\n$$\\begin{array}{c|c|c|c} x_{near} & c(x_{near}) & d(x_{near}, x_{new}) & c + d \\\\ \\hline x_a & 6.0 & 1.5 & 7.5 \\\\ x_b & 2.8 & 2.2 & \\mathbf{5.0} \\\\ x_c & 5.8 & 2.8 & 8.6 \\\\ x_d & 9.9 & 3.5 & 13.4 \\end{array} \\qquad \\begin{array}{c|c|c|c} x_{near} & c(x_{new}) + d & c(x_{near}) & \\text{rewire?} \\\\ \\hline x_a & 6.5 & 6.0 & \\text{no} \\\\ x_c & 7.8 & 5.8 & \\text{no} \\\\ x_d & 8.5 & 9.9 & \\text{yes} \\end{array}$$\n\nWhy RRT is suboptimal (2023 Q32d): the nearest-neighbour rule ignores cost-to-come and edges are never revisited, so early random branches are locked in; with probability 1 RRT converges to a suboptimal path. RRT* repairs the tree locally at every insertion. Its radius shrinks like $(\\log n / n)^{1/d}$: small enough to keep each iteration cheap, large enough to still guarantee convergence.\n\nVelocity-model steering (2023 Q32b): from $(1.1, -2.7, 0)$, $(v, \\omega) = (1.2, 0.15)$ for 2 s gives $(3.4642, -2.3427, 0.3)$; then $(0.5, -0.2)$ for 2 s gives $(4.4525, -2.2435, -0.1)$.',
    exploreIds: ['rrtstar', 'sampling'],
    solveIds: ['plan-rrtstar', 'plan-steer'],
  },

  // ------------------------------------------------------------------ local planning
  {
    id: 'plan-local',
    title: 'Global vs local: potential fields, DWA, velocity obstacles',
    lecture: 'Notes §5; 2025 Q10; review deck slides 14–15',
    formulas: [
      '$$U(q) = \\underbrace{\\tfrac12 \\zeta\\, d(q, q_{goal})^2}_{U_{att}} + \\underbrace{\\tfrac12 \\eta \\Big(\\frac{1}{D(q)} - \\frac{1}{Q^*}\\Big)^2}_{U_{rep},\\ \\text{only where } D(q) \\le Q^*}, \\qquad F(q) = -\\nabla U(q)$$',
      '$$V_d = [\\,v - \\dot v_{max}\\Delta t,\\ v + \\dot v_{max}\\Delta t\\,] \\times [\\,\\omega - \\dot\\omega_{max}\\Delta t,\\ \\omega + \\dot\\omega_{max}\\Delta t\\,]$$',
      '$$G(v, \\omega) = w_h\\,\\text{heading} + w_c\\,\\text{clearance} + w_v\\,\\text{velocity}, \\qquad \\text{maximised over the admissible } (v, \\omega) \\in V_s \\cap V_d$$',
      '$$\\text{admissible (can still stop):}\\quad \\frac{v^2}{2\\dot v_b} \\le \\mathrm{dist}(v, \\omega) \\quad \\text{(free distance along the arc)}$$',
    ],
    what: 'A **global** planner (A*, PRM, RRT*) searches the whole known map for a complete route to the goal, but it is slow, so it runs rarely. A **local** planner runs many times a second on fresh sensor data, following that route while dodging whatever the map did not show. Three local methods: a **potential field** slides down $U = U_{att} + U_{rep}$ (attractive gain $\\zeta$, repulsive gain $\\eta$, obstacle influence distance $Q^*$, $D(q)$ the distance to the nearest obstacle); the **dynamic window approach** (DWA) picks the best $(v, \\omega)$ it can actually reach in the next control period; **velocity obstacles** rule out the velocities that would hit a moving obstacle.',
    when: '- “Which of the following motivates hierarchical (global and local) planning?” (2025 Q10: both the expense of global search and the need for high-frequency replanning).\n- “Plan paths for a fleet of holonomic robots in a warehouse: which algorithm and why?” (review deck slide 15).\n- Learning outcome: collision avoidance (velocity obstacles, dynamic window) and hybrid methods (potential fields) (review deck slide 14).',
    how: [
      'Split what is known in advance (the static map: global planner) from what changes during motion (people, other robots, execution error: local planner).',
      'Potential field: an attractive bowl centred on the goal plus repulsive hills within $Q^*$ of each obstacle; move along $-\\nabla U$. Fast and smooth, but it halts wherever the forces cancel (a local minimum), so pair it with a global planner or an escape move.',
      'DWA: take the window of $(v, \\omega)$ reachable within one control period under the acceleration limits, drop those that could not stop before an obstacle ($v^2/2\\dot v_b$ longer than the free distance along the arc), simulate a short arc for each of the rest, and pick the best weighted score of heading, clearance and velocity. Execute it for one period, then repeat.',
      'Velocity obstacles: for each moving obstacle, mark the cone of robot velocities that collide within the time horizon; choose the allowed velocity closest to the one you want. The reciprocal version splits the avoidance between two robots.',
      'Design answer: name the global planner for the known map and the local method for the moving things, and justify each in one clause.',
    ],
    traps: [
      {
        title: 'Potential fields as a complete planner',
        detail: 'Gradient descent stops in any local minimum (inside a U-shaped obstacle, or in a gap where two repulsions balance the pull), so it cannot guarantee reaching the goal.',
        source: 'Notes §5 (local planners)',
      },
      {
        title: 'DWA chooses from every velocity',
        detail: 'Only from the dynamic window reachable in one period, and only the admissible ones that can still stop in time. That restriction is what makes it safe for a robot with limited acceleration.',
        source: 'Notes §5 (local planners)',
      },
      {
        title: 'Only one reason for the hierarchy',
        detail: 'Both count in 2025 Q10: global search is expensive, **and** fast replanning is needed for environment and execution uncertainty.',
        source: '2025 Q10',
      },
      {
        title: 'A global path followed blindly',
        detail: 'An open-loop global path cannot react to the other robots; a fleet needs a local layer.',
        source: 'Review deck slide 15',
      },
    ],
    more: 'Warehouse fleet, model answer: the shelves are known and static, so plan each robot’s route globally with A* on a grid or PRM roadmap of the floor plan, built once and queried for every task (multi-query). Holonomic robots can move in any direction, so these geometric paths can be executed directly, with no kinodynamic steering. The other robots move, so add a local layer, such as reciprocal velocity obstacles or DWA, replanning at high frequency to avoid robot–robot collisions. A central scheduler that reserves aisles in time can also prevent deadlocks.\n\nParameter effects. Raising $\\eta$ or $Q^*$ keeps the robot further from obstacles but closes narrow gaps and deepens local minima; raising $\\zeta$ pulls harder towards the goal. Many fields switch to a conic (linear) attraction far from the goal so the pull stays bounded. In DWA, a larger clearance weight $w_c$ gives wider berths but slower progress and refuses tight gaps; a larger heading weight $w_h$ turns towards the goal sooner and cuts closer to obstacles.',
    exploreIds: ['potential', 'dwa'],
    solveIds: ['plan-local-choice', 'plan-dwa-window'],
  },
];

export const flashcards: Flashcard[] = [
  // C-space
  {
    id: 'plan-f-cspace',
    front: 'Workspace vs configuration space?',
    back: 'Workspace: the physical space the robot’s body moves through. C-space: one axis per joint (DOF); one point $q$ fixes the whole robot, so planning becomes moving a point through $\\mathcal{C}_{free}$. A 2-link arm’s C-space is $(\\theta_1, \\theta_2) \\in [0, 2\\pi)^2$, a torus.',
    tags: ['cspace'],
  },
  {
    id: 'plan-f-band',
    front: '2-link arm: an obstacle crosses the circle of radius $L_1$ around the base. What does it look like in C-space?',
    back: 'A **full-height vertical band** over the $\\theta_1$ range that points at it: link 1 hits it whatever $\\theta_2$ is. Bulges on the band are link 2 hitting it as well.',
    tags: ['cspace'],
  },
  {
    id: 'plan-f-blob',
    front: '2-link arm: an obstacle lies wholly outside the $L_1$ circle. What does it look like in C-space?',
    back: 'An **isolated blob** (link 2 only) near $\\theta_2 \\approx 0 \\equiv 2\\pi$, the arm nearly straight, at $\\theta_1 \\approx$ the obstacle’s direction. It is usually split between the top and bottom edges, because $\\theta_2$ wraps round.',
    tags: ['cspace'],
  },
  {
    id: 'plan-f-straight',
    front: 'A collision-free straight line joins two points in the workspace. Can the robot move along it without collision?',
    back: 'Not necessarily. The robot is not a point: its links or body sweep a volume, and a straight tip path is a curve in joint space. Only a path through $\\mathcal{C}_{free}$ guarantees a collision-free motion (review deck slide 15).',
    tags: ['cspace'],
  },
  // Graph search
  {
    id: 'plan-f-bfs-dfs',
    front: 'BFS vs DFS: what does each pop next, and is either optimal?',
    back: 'BFS pops the **oldest** node (FIFO queue) and finds the fewest-edge path. DFS pops the **newest** (LIFO stack): little memory, no optimality. Neither looks at edge costs.',
    tags: ['search'],
  },
  {
    id: 'plan-f-dijkstra',
    front: 'Dijkstra’s algorithm: priority, optimality and two equivalences?',
    back: 'Pops the lowest cost-to-arrive $g(n)$; optimal for non-negative edge costs. With uniform costs it pops in BFS order, and it is A* with $h = 0$ (2023 Q9, 2025 Q9).',
    tags: ['search'],
  },
  {
    id: 'plan-f-astar',
    front: 'A*: priority, and when is it optimal?',
    back: 'Pops the lowest $f = g + h$. Optimal when $h$ is admissible (and consistent, if Closed nodes are never reopened). With a good $h$ it expands far fewer nodes than Dijkstra.',
    tags: ['search'],
  },
  {
    id: 'plan-f-bfs-astar',
    front: 'TRUE or FALSE: BFS and A* are the same when every edge has the same cost.',
    back: '**FALSE** (2024 Q9): the heuristic reorders Open towards the goal. The true pairs are BFS ≡ Dijkstra (uniform costs) and Dijkstra ≡ A* ($h = 0$).',
    tags: ['search', 'mcq'],
  },
  // Heuristics
  {
    id: 'plan-f-admissible',
    front: 'Admissible heuristic: definition, and why A* needs it?',
    back: '$h(n) \\le h^*(n)$ for every $n$: it never overestimates the true remaining cost. Then $f = g + h$ never overestimates the cost of completing the route to $n$, so when the goal is popped no cheaper route can be left in Open.',
    tags: ['heuristics'],
  },
  {
    id: 'plan-f-consistent',
    front: 'Consistent heuristic?',
    back: '$h(n) \\le c(n, m) + h(m)$ on every edge, with $h(\\text{goal}) = 0$ (a triangle inequality). Consistent ⇒ admissible, not the reverse. $f$ never decreases along a path, so a popped node’s $g$ is final.',
    tags: ['heuristics'],
  },
  {
    id: 'plan-f-manhattan',
    front: 'Is the Manhattan distance admissible for a robot moving freely in the plane?',
    back: 'No: $|\\Delta x| + |\\Delta y| \\ge \\sqrt{\\Delta x^2 + \\Delta y^2}$. From (0, 0) to (1, 1) it gives 2 but the true cost is $\\sqrt2$ (2023 Q25). It is admissible only for 4-connected grid moves.',
    tags: ['heuristics', 'mcq'],
  },
  {
    id: 'plan-f-sld',
    front: 'Why is the straight-line distance a valid A* heuristic on a road map?',
    back: 'No road route can be shorter than the straight line between two places, so it never overestimates, and it is 0 at the goal (2024 Q29b). It also satisfies the triangle inequality, so it is consistent.',
    tags: ['heuristics'],
  },
  {
    id: 'plan-f-inflated',
    front: 'Multiply an admissible heuristic by $\\varepsilon = 2$ (weighted A*). Effect?',
    back: 'Faster: fewer expansions, more goal-directed. But it is no longer admissible, so the path can cost up to $2\\times$ the optimum. As $\\varepsilon \\to \\infty$ it becomes greedy best-first (lowest $h$ only); $\\varepsilon = 0$ is Dijkstra.',
    tags: ['heuristics', 'parameters'],
  },
  // A* by hand
  {
    id: 'plan-f-stop',
    front: 'A* by hand: when do you stop?',
    back: 'When the goal is **popped** from Open (moved to Closed), not when it is first added. Then backtrack the parents and give the path length with units.',
    tags: ['astar'],
  },
  {
    id: 'plan-f-update',
    front: 'A* by hand: a node already in Open is reached again with a lower $g$. What changes?',
    back: 'Its $g$, $f$ and parent all switch to the cheaper route (2024 Q29: St Lucia from 8.6 via Herston to 7.8 via South Bank). A higher $g$ changes nothing.',
    tags: ['astar'],
  },
  // Sampling
  {
    id: 'plan-f-needs',
    front: 'What does a sampling-based planner need, and what does it not need?',
    back: 'Needs a sampler, a distance metric, a local planner (steering) and a collision checker. Does **not** need an explicit C-space or workspace representation, nor a sensor model (2024 Q10, 2025 Q11).',
    tags: ['sampling', 'mcq'],
  },
  {
    id: 'plan-f-why-sampling',
    front: 'Why sample instead of decomposing C-space into a grid?',
    back: 'A grid needs $k^n$ cells for $n$ joints and the C-obstacles computed explicitly: hopeless beyond 2–3 DOF. Sampling only calls a collision checker, puts nodes in free space, and scales to 6–7-DOF arms (2025 Q24).',
    tags: ['sampling'],
  },
  {
    id: 'plan-f-prm',
    front: 'PRM: the two phases?',
    back: 'Build: sample free configurations and connect near neighbours with collision-free local paths. Query: connect the start and goal to the roadmap, then run A* or Dijkstra. Later queries reuse the same roadmap.',
    tags: ['sampling'],
  },
  {
    id: 'plan-f-rrt',
    front: 'One RRT iteration?',
    back: 'Sample $x_{rand}$ (sometimes the goal), find the nearest tree node $x_{near}$, steer at most one step towards $x_{rand}$ to get $x_{new}$, and add the edge $x_{near} \\to x_{new}$ if it is collision-free.',
    tags: ['sampling'],
  },
  {
    id: 'plan-f-query',
    front: 'PRM or RRT: which is single-query and which multi-query?',
    back: 'RRT is single-query: rooted at one start, grown towards one goal. PRM is multi-query: its roadmap does not depend on the start, though it can serve one query too. “RRTs suit multi-query problems” is the FALSE option in 2023 Q10 and 2024 Q11.',
    tags: ['sampling', 'mcq'],
  },
  {
    id: 'plan-f-probcomplete',
    front: 'Probabilistically complete?',
    back: 'If a path exists, the probability of finding one tends to 1 as the number of samples grows. PRM and RRT both are. It can never prove that no path exists, and narrow passages need many samples.',
    tags: ['sampling'],
  },
  // RRT*
  {
    id: 'plan-f-rrt-subopt',
    front: 'Why is RRT suboptimal, however long it runs?',
    back: 'Each node joins the **nearest** node, ignoring cost-to-come, and edges are never revised, so early jagged branches stay. With probability 1 it converges to a suboptimal path (2023 Q32d).',
    tags: ['rrtstar'],
  },
  {
    id: 'plan-f-parent',
    front: 'RRT* choose parent (“to” $x_{new}$)?',
    back: 'Among collision-free neighbours within the radius, the parent minimises $c(x_{near}) + d(x_{near}, x_{new})$. 2025 Q29: $x_b$ with 2.8 + 2.2 = 5.0, not the nearest node $x_a$.',
    tags: ['rrtstar'],
  },
  {
    id: 'plan-f-rewire',
    front: 'RRT* rewire (“from” $x_{new}$)?',
    back: 'For every other neighbour: if $c(x_{new}) + d(x_{new}, x_{near}) < c(x_{near})$ and the edge is free, make $x_{new}$ its parent; its subtree gets cheaper by the same amount. 2025 Q29: $x_d$, since 8.5 < 9.9.',
    tags: ['rrtstar'],
  },
  {
    id: 'plan-f-star',
    front: 'What do PRM* and RRT* add over PRM and RRT?',
    back: '**Asymptotic optimality**: the best path’s cost converges to the optimum as the number of samples grows. They connect within a radius that shrinks like $(\\log n / n)^{1/d}$, and RRT* also chooses parents and rewires.',
    tags: ['rrtstar', 'mcq'],
  },
  {
    id: 'plan-f-radius',
    front: 'RRT*: enlarge the neighbourhood radius $r$. Effect?',
    back: 'More candidate parents and more rewires per sample: better paths sooner, but more collision checks per iteration. As $r \\to 0$ RRT* falls back to plain RRT.',
    tags: ['rrtstar', 'parameters'],
  },
  {
    id: 'plan-f-arc',
    front: 'RRT steering with the velocity motion model: what shape is each edge, and what must be collision-checked?',
    back: 'A circular arc of radius $r = v/\\omega$, or a straight line when $\\omega = 0$ (2023 Q32a). Check the robot’s footprint along the **whole** arc, not just its end pose (2023 Q32c).',
    tags: ['rrtstar'],
  },
  // Local planning
  {
    id: 'plan-f-hierarchy',
    front: 'Why split planning into a global and a local layer?',
    back: 'Global search across the map is expensive, so it runs rarely; and fast replanning is needed for environment and execution uncertainty, so a cheap local layer runs every cycle. 2025 Q10: **both** reasons.',
    tags: ['local', 'mcq'],
  },
  {
    id: 'plan-f-potential',
    front: 'Potential fields: how do they work, and what does raising the repulsive gain $\\eta$ or influence distance $Q^*$ do?',
    back: 'The goal attracts, obstacles repel, and the robot follows $-\\nabla U$: fast and smooth, but it stalls in local minima where the forces cancel. A larger $\\eta$ or $Q^*$ gives more clearance, but closes narrow gaps and deepens the minima.',
    tags: ['local', 'parameters'],
  },
  {
    id: 'plan-f-dwa',
    front: 'The dynamic window approach in one line, and the effect of a larger clearance weight?',
    back: 'Score each $(v, \\omega)$ reachable within one control period that can still stop in time, by simulating a short arc: $G = w_h\\,\\text{heading} + w_c\\,\\text{clearance} + w_v\\,\\text{velocity}$. A larger clearance weight keeps further from obstacles but moves more slowly and may refuse narrow gaps; with $w_v = 0$ nothing rewards moving and the robot never sets off.',
    tags: ['local', 'parameters'],
  },
  {
    id: 'plan-f-vo',
    front: 'Velocity obstacle?',
    back: 'The set of the robot’s velocities that would collide with a moving obstacle within the time horizon if both keep their velocities. Pick an allowed velocity closest to the preferred one; the reciprocal version shares the avoidance between robots.',
    tags: ['local'],
  },
  {
    id: 'plan-f-mdp',
    front: 'How does a Markov decision process relate to planning under uncertainty?',
    back: 'When actions have uncertain outcomes, plan over $(S, A, T, R, \\gamma)$ with $T(s, a, s^{\\prime}) = p(s^{\\prime} \\mid s, a)$. The result is a **policy** $\\pi(s)$, an action for every state, not one path; graph search is the special case where every action has one outcome.',
    tags: ['local', 'rl'],
  },
];
