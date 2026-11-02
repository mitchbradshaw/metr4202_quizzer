// Concept cards and flashcards for 'slam' (summary notes §4; 2023 Q7, Q8, Q22, Q24, Q31; 2024 Q7, Q8, Q23;
// 2025 Q7, Q8, Q22, Q23; review deck slides 8–13). Card ids are fixed: sims, generators and Home link to them.
import type { ConceptCard, Flashcard } from '../../engine/types';

export const cards: ConceptCard[] = [
  // ------------------------------------------------------------------ which problem
  {
    id: 'slam-problems',
    title: 'Localisation, mapping or SLAM? Online vs full SLAM',
    lecture: 'Notes §4; review deck slides 8–9',
    formulas: [
      '$$\\begin{array}{l|c|c|l} \\text{problem} & \\text{pose } x & \\text{map } m & \\text{estimates} \\\\ \\hline \\text{localisation} & \\text{unknown} & \\text{known} & p(x_t \\mid z_{1:t}, u_{1:t}, m) \\\\ \\text{mapping} & \\text{known} & \\text{unknown} & p(m \\mid z_{1:t}, x_{1:t}) \\\\ \\text{SLAM} & \\text{unknown} & \\text{unknown} & p(x_t, m \\mid z_{1:t}, u_{1:t}) \\end{array}$$',
      '$$\\underbrace{p(x_t, m \\mid z_{1:t}, u_{1:t})}_{\\text{online SLAM}} = \\int \\!\\cdots\\! \\int \\underbrace{p(x_{1:t}, m \\mid z_{1:t}, u_{1:t})}_{\\text{full SLAM}}\\, dx_1\\, dx_2 \\cdots dx_{t-1}$$',
    ],
    what: 'Navigation involves two unknowns: where the robot is (its pose $x$) and what the world looks like (the map $m$). **Localisation** estimates the pose against a map it is given; **mapping** builds the map from poses it is given; **SLAM** (simultaneous localisation and mapping) must estimate both at once. That is a chicken-and-egg problem: to localise you need a map, and to map you need your pose, so errors in one leak into the other and the two estimates become correlated.\n\n**Online SLAM** estimates the current pose and the map, $p(x_t, m \\mid z_{1:t}, u_{1:t})$. **Full SLAM** estimates the whole trajectory $x_{1:t}$ and the map. Online SLAM is full SLAM with the past poses integrated out (second formula).',
    when: '- A scenario MCQ asking which problem a robot faces: localisation, mapping, SLAM or none (2023 Q7: a satellite with a precise pose stitches temperature readings into an image → **mapping**).\n- When a robot has to solve SLAM (2023 Q8 → when it knows **neither** its pose nor the map), and what SLAM solves for (2024 Q8 → **both** the pose and the map).\n- What a warehouse forklift must perform to navigate (2024 Q7: the layout and the tag locations are given → **localisation**).\n- What a Moon rover must perform to reconstruct the surface (2025 Q7: no map, no GPS on the Moon → **SLAM**), and what online SLAM solves for (2025 Q8 → the **current** pose and the map).\n- The review deck’s practice questions (slide 9): the difference between localisation, mapping and SLAM, and between online and full SLAM.',
    how: [
      'Ask whether the **map** is given. A floor plan, surveyed tag or landmark positions, a pre-built city map, or the map saved on the last run all count as known. If the task’s output *is* the map (reconstruct, survey, stitch an image), the map is unknown.',
      'Ask whether the **pose** is given by something external and accurate: GPS or ground tracking outdoors on Earth, motion capture indoors. Odometry alone does not count, because it drifts without bound. Indoors, underground, underwater and on the Moon there is no GPS, so the pose is unknown.',
      'Read the answer off the table: map known, pose unknown → localisation; pose known, map unknown → mapping; both unknown → SLAM. (Both known → nothing to estimate: just plan.)',
      'Online or full: online SLAM keeps only the current pose $x_t$ (a filter, such as EKF-SLAM); full SLAM keeps the whole path $x_{1:t}$ (graph SLAM). The map $m$ is in both.',
      'In a short answer, define each problem by what is unknown, give the distribution it estimates, and add the exam’s own examples: localisation, a forklift with a map of its tags (2024 Q7); mapping, a satellite with a precise pose (2023 Q7); SLAM, a lunar rover with no map and no GPS (2025 Q7).',
    ],
    traps: [
      {
        title: 'Building a map does not make it SLAM',
        detail: 'The satellite in 2023 Q7 builds a temperature image, but its pose is known exactly from ground tracking and GPS, so it solves **mapping**. SLAM needs the pose to be unknown as well.',
        source: '2023 Q7',
      },
      {
        title: '“All of the above” for the forklift',
        detail: 'The layout and the tag positions are given, so nothing about the map is unknown: the forklift only localises. Choose SLAM only when the map must be estimated too.',
        source: '2024 Q7',
      },
      {
        title: 'Online SLAM is not the full trajectory',
        detail: 'Online SLAM keeps the **current** pose and the map. The whole trajectory plus the map is full SLAM, which was the distractor in 2025 Q8.',
        source: '2025 Q8',
      },
      {
        title: 'Odometry is not a known pose',
        detail: 'Wheel odometry adds up noisy increments, so its error grows without bound. A lunar rover with only odometry still has an unknown pose, which is why 2025 Q7 is SLAM.',
        source: '2025 Q7',
      },
    ],
    more: 'Why the three problems differ in difficulty. In localisation the map is fixed, so each measurement only constrains the pose. In mapping with known poses, every cell or landmark can be estimated on its own (the occupancy grid’s independent cells). In SLAM a landmark’s estimated position inherits the error of the pose it was seen from, so every landmark becomes correlated with the pose and with every other landmark. That correlation is what lets one loop closure correct the whole map at once, and it is also why EKF-SLAM has to carry a full covariance matrix.\n\nWhy integrating out the past poses matters. Full SLAM’s posterior is sparse: each measurement links one pose to one landmark, which graph SLAM exploits. Marginalising the old poses away (online SLAM) links every landmark to every other, so the online belief is dense.\n\nWhy robots need maps at all: to localise (compare what is sensed with what should be there), to plan routes beyond sensor range (a global planner searches the map), and to reason about the task (where the shelves or the charging dock are). Global localisation (no initial guess) and the kidnapped-robot problem are still **localisation**, because the map is known.',
    exploreIds: ['which-problem'],
    solveIds: ['slam-which'],
  },

  // ------------------------------------------------------------------ occupancy update
  {
    id: 'slam-occupancy',
    title: 'Occupancy grids: the binary Bayes update',
    lecture: 'Notes §4; review deck slides 9–10, 13; 2023 Q31',
    formulas: [
      '$$\\begin{array}{c|cc|c} & z = \\text{occ} & z = \\text{free} & \\\\ \\hline m & \\text{TP} & 1 - \\text{TP} & \\Sigma = 1 \\\\ \\neg m & 1 - \\text{TN} & \\text{TN} & \\Sigma = 1 \\end{array} \\qquad \\text{false-positive rate} = p(\\text{occ} \\mid \\neg m) = 1 - \\text{TN}$$',
      '$$p(m \\mid z) = \\frac{p(z \\mid m)\\, p(m)}{p(z \\mid m)\\, p(m) + p(z \\mid \\neg m)\\,\\big(1 - p(m)\\big)}$$',
      '$$\\text{TP } 0.85,\\ \\text{TN } 0.99\\text{:} \\qquad \\frac{0.85(0.5)}{0.85(0.5) + 0.01(0.5)} = 0.9884, \\qquad \\frac{0.15(0.9884)}{0.15(0.9884) + 0.99(0.0116)} = 0.9281$$',
    ],
    what: 'An occupancy grid splits the world into cells and gives each cell $m$ one number: the probability that it is occupied. Each cell is a **binary**, static state (occupied or free), so its Bayes filter has no prediction step: every reading is one correction by Bayes’ rule, and the posterior becomes the prior for the next reading. Cells are updated **independently** of each other, and the robot’s poses are assumed known (this is mapping, not SLAM). A cell with no information starts at 0.5.',
    when: '- Choose and justify a prior for a cell the robot knows nothing about (2023 Q31a, 2 marks; review deck slide 9).\n- Two readings, occupied then free: calculate the occupancy after each (2023 Q31b–c, 3 + 3 marks; review deck slides 10–13 with TP 0.85, TN 0.99).\n- What starting a cell at 0 or 1 does to a binary Bayes filter (2025 Q22, 2 marks).\n- Any sensor specified by a true-positive and a true-negative probability.',
    how: [
      'Prior: $p(m) = 0.5$, because with no information occupied and free are equally likely. It is log-odds 0, so it adds no bias. Never 0 or 1 (see the log-odds card).',
      'Sensor table: rows are the **true** state ($m$, $\\neg m$), columns the **reading**, and each row sums to 1. So $p(\\text{occ} \\mid m) = \\text{TP}$, $p(\\text{free} \\mid m) = 1 - \\text{TP}$ (a miss), $p(\\text{occ} \\mid \\neg m) = 1 - \\text{TN}$ (a false positive) and $p(\\text{free} \\mid \\neg m) = \\text{TN}$.',
      'For each reading, take the **column of the reading you observed**: $p(z \\mid m)$ and $p(z \\mid \\neg m)$.',
      'Bayes: the numerator is $p(z \\mid m)\\,p(m)$; the denominator is the numerator plus $p(z \\mid \\neg m)(1 - p(m))$. Write the substitution out, because it carries most of the marks.',
      'The posterior is the prior for the next reading. Repeat once per reading, carrying four decimal places.',
      'Check with log-odds (the readings’ steps must add up to the same answer) and, if asked why, explain with the likelihood ratios (log-odds card).',
    ],
    traps: [
      {
        title: 'False positive = 1 − TP',
        detail: 'The false-positive rate is $p(\\text{occ} \\mid \\neg m) = 1 - \\text{TN}$ (0.05 in 2023 Q31), from the $\\neg m$ row. $1 - \\text{TP}$ is the **miss** rate, $p(\\text{free} \\mid m)$.',
        trapId: 'false-positive',
        source: '2023 Q31; review deck slide 11',
      },
      {
        title: 'Stopping at the numerator',
        detail: '$0.7 \\times 0.5 = 0.35$ is not an occupancy probability: divide by $p(z) = 0.35 + 0.05 \\times 0.5 = 0.375$ to get 0.9333.',
        trapId: 'normalise',
        source: '2023 Q31(b)',
      },
      {
        title: 'Using the occupied column for a free reading',
        detail: 'A FREE reading uses $p(\\text{free} \\mid m) = 1 - \\text{TP}$ and $p(\\text{free} \\mid \\neg m) = \\text{TN}$. Reusing 0.7 and 0.05 pushes the cell **up** to 0.9949 instead of down to 0.8155.',
        trapId: 'likelihood-column',
        source: '2023 Q31(c)',
      },
      {
        title: 'Restarting each reading from 0.5',
        detail: 'The second reading’s prior is the first posterior (0.9333), not 0.5. Starting again from 0.5 throws the first reading away.',
        source: '2023 Q31(c)',
      },
    ],
    more: 'Why there is no prediction step: the binary Bayes filter is for a **static** state. Walls do not move; the robot’s motion only changes which cells a beam passes through, not the cells themselves.\n\nWhat one lidar beam does to the grid (the inverse sensor model): the cells the beam passed through get a FREE update, the cell where it ended gets an OCCUPIED update, and the cells beyond the hit (or outside the field of view) get no update and stay at 0.5. **Unknown is not free**: 0.5 means “never observed”.\n\nThe two independence assumptions: (1) each cell is estimated on its own, which keeps the update cheap but ignores that a wall is a line of cells; (2) readings are independent given the map (a static world), which is what lets one reading’s posterior serve as the next reading’s prior. Moving people and cars break (2): see the practical-issues card.\n\nA note on the review-deck numbers: the slide carries the first posterior rounded to 0.9884 and gets 0.9281; carrying full precision (0.98837) gives 0.92795. Both round to 0.928, and the Solve tab accepts both.',
    exploreIds: ['occupancy', 'raycast'],
    solveIds: ['slam-occupancy'],
  },

  // ------------------------------------------------------------------ log-odds
  {
    id: 'slam-logodds',
    title: 'Log-odds: the additive update, and why OCCUPIED then FREE stays high',
    lecture: 'Notes §4; review deck slides 11–13; 2023 Q31(d); 2025 Q22',
    formulas: [
      '$$l = \\ln\\frac{p}{1 - p}, \\qquad p = 1 - \\frac{1}{1 + e^{l}}, \\qquad p = 0.5 \\;\\Leftrightarrow\\; l = 0, \\qquad p \\to 0 \\text{ or } 1 \\;\\Leftrightarrow\\; l \\to \\mp\\infty$$',
      '$$l_t = l_{t-1} + \\ln\\frac{p(m \\mid z_t)}{1 - p(m \\mid z_t)} - l_0$$',
      '$$\\text{prior } 0.5\\ (l_0 = 0)\\text{:} \\quad l_t = l_{t-1} + \\ln\\underbrace{\\frac{p(z_t \\mid m)}{p(z_t \\mid \\neg m)}}_{\\text{likelihood ratio}}, \\qquad \\text{occ: } \\ln\\frac{\\text{TP}}{1 - \\text{TN}}, \\quad \\text{free: } \\ln\\frac{1 - \\text{TP}}{\\text{TN}}$$',
      '$$\\begin{array}{l|c|c|c} \\text{sensor} & \\text{occ step} & \\text{free step} & \\text{occ, then free} \\\\ \\hline \\text{TP } 0.7,\\ \\text{TN } 0.95 \\ (2023) & \\ln(0.7/0.05) = +2.639 & \\ln(0.3/0.95) = -1.153 & l = 1.486,\\ p = 0.8155 \\\\ \\text{TP } 0.85,\\ \\text{TN } 0.99 \\ (\\text{deck}) & \\ln(0.85/0.01) = +4.443 & \\ln(0.15/0.99) = -1.887 & l = 2.556,\\ p = 0.928 \\end{array}$$',
    ],
    what: 'Bayes’ rule in **odds** form multiplies the prior odds by the reading’s **likelihood ratio** $p(z \\mid m) / p(z \\mid \\neg m)$, and the normaliser cancels. Taking logs turns that product into a sum: each reading **adds a fixed step**, the log of its likelihood ratio, whatever the cell’s current value. The size of the step is the strength of the evidence, and the sensor’s error rates set it: an OCCUPIED step is large when false positives are rare, and a FREE step is large when misses are rare.',
    when: '- Explain why one FREE reading after an OCCUPIED one barely lowers the cell (2023 Q31d, 2 marks).\n- The log-odds route on review deck slides 11–13 (inverse sensor model 0.9884 and 0.1316, steps 4.4451 and −1.8869).\n- The effect of a 0 or 1 starting probability (2025 Q22, 2 marks): log-odds $\\mp\\infty$.\n- “Why use log-odds?” or “how many free readings would clear this cell?”',
    how: [
      'Convert the prior: $l_0 = \\ln(0.5 / 0.5) = 0$.',
      'Work out one step per kind of reading: OCCUPIED adds $\\ln[\\text{TP} / (1 - \\text{TN})]$, FREE adds $\\ln[(1 - \\text{TP}) / \\text{TN}]$ (negative). The review deck reaches the same steps through the inverse sensor model, $\\ln(0.9884 / 0.0116)$ and $\\ln(0.1316 / 0.8684)$.',
      'Add the steps of all the readings (the order does not matter), then convert back with $p = 1 - 1/(1 + e^{l})$.',
      'To explain a result, compare the step sizes. In 2023 Q31 an OCCUPIED reading is 14× evidence ($+2.64$) and a FREE reading only about 3× ($-1.15$), so one FREE undoes less than half of one OCCUPIED and the cell stays at 0.82.',
      'To count readings, divide the steps: $2.64 / 1.15 = 2.3$, so it takes **three** FREE readings to bring that cell below 0.5 (0.58 after two, 0.31 after three).',
    ],
    traps: [
      {
        title: '“One OCCUPIED and one FREE cancel out”',
        detail: 'Only if the two steps are the same size, which needs $\\text{TP} = \\text{TN}$. With TP 0.7 and TN 0.95 the steps are $+2.64$ and $-1.15$, so the pair leaves $l = 1.49$ ($p = 0.8155$).',
        source: '2023 Q31(d)',
      },
      {
        title: 'Later readings count less',
        detail: 'In log-odds every reading adds the same step, whatever the cell’s current value. The change only *looks* smaller near 1 because probability is squashed there: the same ×9 odds step ($+2.20$) takes 0.5 to 0.9, but 0.9 only to 0.988.',
      },
      {
        title: 'Using the row ratio instead of the likelihood ratio',
        detail: 'The OCCUPIED step is $\\ln[p(\\text{occ} \\mid m) / p(\\text{occ} \\mid \\neg m)] = \\ln(0.85 / 0.01)$, a ratio **down the column**. $\\ln(0.85 / 0.15)$ (along the row) is the log-odds of the sensor being right about an occupied cell, not of the cell being occupied.',
        trapId: 'likelihood-column',
        source: 'Review deck slides 11–12',
      },
      {
        title: 'A prior of 0 or 1',
        detail: '$l_0 = \\mp\\infty$, and adding a finite step leaves it there: the cell can never be updated, however much evidence arrives (in probability form, $0 \\times$ anything $= 0$).',
        trapId: 'prior-0-1',
        source: '2025 Q22',
      },
    ],
    more: 'Where the additive form comes from. Write Bayes’ rule for $m$ and for $\\neg m$ and divide one by the other: the normaliser $p(z)$ cancels, leaving\n\n$$\\frac{p(m \\mid z)}{p(\\neg m \\mid z)} = \\frac{p(z \\mid m)}{p(z \\mid \\neg m)} \\cdot \\frac{p(m)}{p(\\neg m)}$$\n\nPosterior odds = likelihood ratio × prior odds. Taking logs gives $l_t = l_{t-1} + \\ln(\\text{likelihood ratio})$.\n\nWhy the course formula subtracts $l_0$: it is written with the **inverse sensor model** $p(m \\mid z_t)$, which already contains the prior once; without the $-l_0$ the prior would be added again at every reading. With the 0.5 prior, $l_0 = 0$ and the term vanishes. (The deck’s 4.4451 comes from the rounded 0.9884 and 0.0116; exactly, the step is $\\ln 85 = 4.4427$.)\n\nWhy real mappers use log-odds: one addition per cell per beam (no normalising, millions of cells a second), and no numerical trouble near 0 and 1, where a probability like 0.9999999 loses precision but its log-odds (16.1) does not. Most mappers also **clamp** $l$ between limits (say $\\pm 3.5$, about 0.03 to 0.97), so that a cell seen as free a thousand times can still flip when a door closes.\n\nThe sensor-design view: raising TN (fewer false alarms) makes OCCUPIED readings much stronger (at TP 0.7, TN 0.95 → 0.99 takes the step from $+2.64$ to $+4.25$) but barely changes FREE readings; raising TP (fewer misses) is what strengthens FREE readings.',
    exploreIds: ['occupancy'],
    solveIds: ['slam-logodds', 'slam-occupancy'],
  },

  // ------------------------------------------------------------------ data association and loop closure
  {
    id: 'slam-association',
    title: 'Data association and loop closure',
    lecture: 'Notes §4; review deck slide 9; 2024 Q23; 2025 Q23',
    formulas: [
      '$$c_t \\in \\{1, \\dots, N\\} \\ \\ (\\text{an existing landmark}) \\qquad \\text{or} \\qquad c_t = N + 1 \\ \\ (\\text{a new one})$$',
      '$$\\begin{array}{l|l|l} \\text{outcome} & \\text{pose estimate} & \\text{map} \\\\ \\hline \\text{correct closure} & \\text{drift spread back, uncertainty shrinks} & \\text{snaps into a consistent shape} \\\\ \\text{missed closure} & \\text{drift keeps growing} & \\text{places duplicated, offset} \\\\ \\text{false closure} & \\text{wrong, and overconfident} & \\text{warped; hard to undo} \\end{array}$$',
    ],
    what: '**Data association** is deciding which landmark, feature or already-mapped place produced each new measurement, or whether it came from something new (the correspondence $c_t$ in the first formula). SLAM can only use a measurement once that decision is made, and it then treats the decision as true. **Loop closure** is data association with a place visited long ago: recognising “I have been here before” links the current pose to a much older one, across all the drift accumulated in between.',
    when: '- Explain how data association, and loop closure in particular, affects the quality of the map and of the pose estimate (2024 Q23, 3 marks).\n- Describe the data-association problem and what getting it wrong does to the SLAM solution (2025 Q23, 3 marks).\n- What data association is, and how it affects the quality of the SLAM solution (review deck slide 9).',
    how: [
      'Define it in one sentence: which landmark or place each observation belongs to, or whether it is new.',
      'Say why it is hard: landmarks look alike (perceptual aliasing), measurements are noisy, and by the time the robot returns its pose has drifted, so old landmarks are not where it predicts them.',
      'Name loop closure as the special case of matching to a place seen long ago.',
      'Give the three outcomes with their effect on **both** the pose and the map (table): correct, missed, false.',
      'Say which is worst and why: a false association injects a confident, wrong constraint. The map warps and the covariance shrinks around the wrong answer, so later data struggles to fix it, and a filter cannot take it back. That is why SLAM systems would rather miss a closure than accept a doubtful one.',
      'For a spare mark, add one mitigation: unique IDs (AprilTags), gating on the predicted measurement, keeping several hypotheses (FastSLAM associates per particle), or a back end that can reject bad edges.',
    ],
    traps: [
      {
        title: 'Data association is not sensor fusion',
        detail: 'Combining two sensors’ readings of the same quantity is fusion. Data association asks **which** landmark or place a reading came from.',
      },
      {
        title: 'Swapping missed and false closures',
        detail: 'A **missed** closure leaves the drift in place and duplicates the revisited area; it is a **false** one that forces two different places together and warps the map.',
        source: '2024 Q23',
      },
      {
        title: 'A correct closure fixes more than the current pose',
        detail: 'The pose and the landmarks are correlated, so the correction spreads back along the whole loop and moves every landmark seen on it. Saying only “the current pose is corrected” loses the mark about the map.',
        source: '2024 Q23; 2025 Q23',
      },
      {
        title: 'Leaving out uncertainty',
        detail: 'A wrong association also makes the estimate **overconfident**: the covariance shrinks as if the evidence were good. That is why the error is hard to detect and undo, which is what the third mark rewards.',
        source: '2025 Q23',
      },
    ],
    more: 'How association is decided in practice: predict where each known landmark should appear from the current pose estimate, and accept a match only if the measurement falls inside a gate around that prediction, sized by the predicted uncertainty (a Mahalanobis-distance test). Large drift means large gates, and large gates admit wrong matches, which is why loop closures are the hardest associations of all. Place recognition (matching whole scans or images by appearance) proposes loop closures; a geometric check (do the two scans actually align?) confirms them.\n\nWhy a false closure is so damaging in a filter: EKF-SLAM folds every update into its single mean and covariance straight away, so there is nothing left to remove later. Graph SLAM keeps every constraint as an edge, so a bad edge can still be detected (it disagrees with all the others) and switched off before re-optimising.\n\nThe decision-theory view: the threshold for accepting a closure trades missed closures (false negatives: more drift) against false closures (false positives: a broken map). Because the costs are so unequal, SLAM systems set it for high precision.',
    exploreIds: ['loop'],
  },

  // ------------------------------------------------------------------ techniques
  {
    id: 'slam-techniques',
    title: 'SLAM techniques: EKF-SLAM, FastSLAM, graph SLAM',
    lecture: 'Notes §2, §4; review deck slide 8; 2023 Q22',
    formulas: [
      '$$\\begin{array}{l|l|l|l} & \\text{EKF-SLAM} & \\text{FastSLAM} & \\text{graph SLAM} \\\\ \\hline \\text{belief} & \\text{one joint Gaussian} & M \\text{ particles (paths)} & \\text{graph of constraints} \\\\ \\text{landmarks} & \\text{in the state vector} & \\text{a small EKF each, per particle} & \\text{nodes (or scan matches)} \\\\ \\text{solves} & \\text{online SLAM} & \\text{full and online} & \\text{full SLAM} \\\\ \\text{cost} & O(N^2) \\text{ per update} & O(MN);\\ O(M \\log N) \\text{ with trees} & \\text{sparse least squares} \\\\ \\text{association} & \\text{one fixed choice} & \\text{per particle} & \\text{bad edges can be rejected} \\end{array}$$',
      '$$\\text{EKF-SLAM:} \\quad \\mu = (x,\\ y,\\ \\theta,\\ m_{1,x},\\ m_{1,y},\\ \\dots,\\ m_{N,x},\\ m_{N,y})^T, \\qquad \\Sigma \\in \\mathbb{R}^{(3 + 2N) \\times (3 + 2N)}$$',
      '$$\\text{FastSLAM:} \\quad p(x_{1:t}, m \\mid z_{1:t}, u_{1:t}) = p(x_{1:t} \\mid z_{1:t}, u_{1:t}) \\prod_{n=1}^{N} p(m_n \\mid x_{1:t}, z_{1:t})$$',
      '$$\\text{graph SLAM:} \\quad x_{1:t}^{\\ast},\\, m^{\\ast} = \\arg\\min_{x_{1:t},\\, m} \\sum_{\\text{constraints } k} e_k^T\\, \\Omega_k\\, e_k$$',
    ],
    what: 'All three represent the SLAM posterior with the filters of §2; they differ in how. **EKF-SLAM** stacks the pose and every landmark into one Gaussian, so it tracks all their correlations, at a cost that grows with the square of the number of landmarks $N$. **FastSLAM** samples the robot’s path with particles; given a path (and the data associations) the landmarks are independent, so each particle carries one small EKF per landmark and makes its own associations. **Graph SLAM** stores the poses (and landmarks) as nodes and each odometry reading or measurement as a constraint edge, then solves for the whole trajectory at once by least squares: full SLAM.',
    when: '- “Describe and compare the implementation of different SLAM techniques” (review deck slide 8, learning outcome).\n- One benefit of particle filters over Kalman-filter methods for state estimation and SLAM (2023 Q22, 1 mark).\n- Choosing a technique for a scenario: a few distinct landmarks and good odometry, look-alike landmarks, or a large area with many loops.',
    how: [
      'Start with the belief: one Gaussian (EKF-SLAM), a set of sampled paths each with its own landmark filters (FastSLAM), or a graph of constraints (graph SLAM).',
      'Say what it solves: EKF-SLAM is a filter, so online SLAM; graph SLAM keeps the trajectory, so full SLAM; FastSLAM’s particles are whole paths, so it covers both.',
      'Say how the cost grows with the number of landmarks $N$: EKF-SLAM updates a $(3 + 2N) \\times (3 + 2N)$ covariance, so $O(N^2)$ per update; FastSLAM costs $O(MN)$ for $M$ particles ($O(M \\log N)$ with tree-shared maps); graph SLAM exploits sparsity.',
      'Say how each handles data association: EKF-SLAM commits to one association per measurement; FastSLAM lets each particle choose, so wrong choices die out at resampling; graph SLAM can test and reject bad edges before optimising.',
      'Finish with the weak spot and a fitting scenario: EKF-SLAM for small feature maps with mild nonlinearity; FastSLAM when associations are ambiguous or the belief is multimodal; graph SLAM for large maps with many loop closures.',
    ],
    traps: [
      {
        title: '“EKF-SLAM scales linearly with the map”',
        detail: 'Every update touches the full $(3 + 2N) \\times (3 + 2N)$ covariance, so time and memory grow as $N^2$, which in practice limits it to maps of hundreds of landmarks, not hundreds of thousands.',
      },
      {
        title: 'One particle per landmark',
        detail: 'In FastSLAM a particle is a **path** hypothesis carrying $N$ small (2 × 2) landmark EKFs. Landmarks are not particles.',
      },
      {
        title: 'Graph SLAM as a filter',
        detail: 'Graph SLAM keeps and re-optimises the whole trajectory (full SLAM); it does not marginalise old poses away the way a filter does.',
      },
      {
        title: '“A particle filter is always better”',
        detail: 'FastSLAM needs enough particles to keep the right path alive round a long loop; resampling can discard that hypothesis before the loop closes (particle depletion). The 1-mark answer to 2023 Q22 is **multimodal, non-Gaussian beliefs without linearisation** (and per-particle data association), not “more accurate”.',
        source: '2023 Q22',
      },
    ],
    more: 'Why EKF-SLAM’s covariance is dense: every landmark is measured from an uncertain pose, so all landmarks share that pose error and become correlated with one another. The good side of that density: re-observing one old landmark corrects all of them at once, which is how an EKF closes a loop. The bad side: $N^2$ cost, a single linearisation at the current estimate (its errors are baked in, and the filter becomes overconfident), and one fixed data association per measurement.\n\nWhy FastSLAM’s factorisation works (Rao–Blackwellisation): if the robot’s path were known, each landmark could be estimated on its own from the measurements of it. So the path is sampled with particles and each landmark is solved analytically with a 2-D EKF. Each particle carries its own map, so grid-based versions (one occupancy grid per particle) exist too.\n\nGraph SLAM in practice: a **front end** turns sensor data into constraints (odometry edges, landmark observations, scan matches, loop closures); a **back end** finds the poses that best satisfy all the constraints at once. Each constraint’s error $e_k$ is weighted by its information matrix $\\Omega_k$, the inverse of its noise covariance: $R^{-1}$ for an odometry edge, $Q^{-1}$ for a measurement edge in the course’s notation. Because each constraint touches only two nodes, the problem is sparse and large maps solve quickly; relinearising at every iteration also avoids the EKF’s baked-in linearisation error.',
    exploreIds: ['loop'],
  },

  // ------------------------------------------------------------------ practical issues
  {
    id: 'slam-practical',
    title: 'Mapping in the real world: practical issues and sources of uncertainty',
    lecture: 'Notes §4; review deck slide 8; 2023 Q24',
    formulas: [
      '$$\\begin{array}{l|l|l} \\text{issue} & \\text{assumption it breaks} & \\text{what goes wrong} \\\\ \\hline \\text{dynamic objects} & \\text{static world} & \\text{ghost obstacles, smeared cells} \\\\ \\text{resolution} & \\text{each cell wholly free or occupied} & \\text{thin obstacles lost, or memory blows up} \\\\ \\text{sensor noise} & \\text{the sensor matches its table} & \\text{holes in walls (glass), false hits} \\\\ \\text{out-of-date map} & \\text{the map is still true} & \\text{localisation mismatches, bad plans} \\end{array}$$',
      '$$\\text{cells} = \\frac{W}{\\Delta} \\times \\frac{H}{\\Delta} \\ \\Big(\\times \\frac{D}{\\Delta} \\text{ in 3-D}\\Big)\\text{:} \\qquad \\Delta \\to \\tfrac{\\Delta}{2} \\;\\Rightarrow\\; 4\\times \\text{ the cells in 2-D},\\ 8\\times \\text{ in 3-D}$$',
      '$$100 \\text{ m} \\times 100 \\text{ m at } \\Delta = 5 \\text{ cm}\\text{:} \\ 2000 \\times 2000 = 4 \\times 10^6 \\text{ cells}; \\qquad \\text{with 10 m of height: } 8 \\times 10^8 \\text{ cells}$$',
      '$$l \\leftarrow \\min\\big(\\max(l,\\, l_{\\min}),\\, l_{\\max}\\big) \\qquad \\text{(clamping keeps every cell able to change)}$$',
    ],
    what: 'The occupancy update assumes a static world, known poses, cells that are wholly occupied or free, and a sensor that behaves like its table. Real environments break each of these, and an exam answer earns its marks by naming the issue **and** its effect on the map or on localisation. The same issues are the sources of uncertainty when a robot localises in a map built earlier.',
    when: '- “Discuss the practical considerations of mapping in real-world environments” and “Explain the need for maps in robot navigation” (review deck slide 8, learning outcomes).\n- Two sources of uncertainty for a self-driving car localising itself in a pre-built map of a city (2023 Q24, 2 marks).\n- Choosing a cell size, or explaining a map with ghost obstacles or holes in its walls.',
    how: [
      'Name the issue, the assumption it breaks and the effect (first table), one sentence each.',
      '**Dynamic objects** (people, cars, doors) break the static-world assumption: they leave ghost obstacles or smeared trails and mislead scan matching. Remedies: clamp the log-odds so cells can change back, and filter moving objects out.',
      '**Resolution vs memory**: halving the cell size gives 4× the cells in 2-D and 8× in 3-D. Too coarse, and thin obstacles or narrow doorways vanish; too fine, and memory and update time grow while each cell gets fewer hits, so it stays noisy.',
      '**Sensor noise and failures**: beam width blurs edges; glass, mirrors and black surfaces return nothing (max range), which wrongly clears cells; multipath gives false hits.',
      '**Out-of-date maps**: furniture moves, roadworks and parked cars appear, seasons change. A robot localising against the old map meets mismatches, and a planner may route through a path that is now closed.',
      'For 2023 Q24 (a car localising in a pre-built city map), describe two of: sensor noise (GPS multipath in urban canyons, lidar or cameras degraded by rain and glare), map mismatch (an out-of-date map; parked cars and pedestrians hiding landmarks), motion uncertainty (wheel slip, odometry drift) and perceptual aliasing (streets that look alike), each with its effect on the pose estimate.',
    ],
    traps: [
      {
        title: 'Naming an issue without its effect',
        detail: '“Dynamic objects” alone is half an answer. Say what they do: ghost obstacles in the map, wrong scan matches, a pose pulled off course.',
        source: '2023 Q24 (“any two, each described”)',
      },
      {
        title: '“A finer grid is always better”',
        detail: 'Memory and update cost grow as $1/\\Delta^2$ (2-D) or $1/\\Delta^3$ (3-D), and smaller cells each get fewer readings. Pick the coarsest cell that still resolves the narrowest gap the robot must pass through.',
      },
      {
        title: 'Treating unknown as free',
        detail: 'Cells never observed stay at 0.5. A planner that treats them as free can drive into an obstacle it has not seen yet; one that treats them as occupied may find no path at all. Say which you assume.',
      },
      {
        title: 'Answering a localisation question with mapping issues',
        detail: '2023 Q24 asks what makes the **pose** uncertain in a map that already exists: sensor noise, map mismatch, motion noise, aliasing. “Memory for the grid” earns nothing there.',
        source: '2023 Q24',
      },
    ],
    more: 'Why robots need maps at all: to localise (compare what the sensors see with what the map says should be there), to plan beyond sensor range (the global planner searches the map; the local planner sees only the latest scan), and to reason about the task.\n\nMap types and when each fits. An **occupancy grid** is dense and metric, natural for lidar and for planning, but its memory grows with the area covered (3-D mappers use octrees to store only the space they have observed). A **landmark (feature) map** is sparse and compact, which suits EKF-SLAM, but it needs data association and says nothing about free space. A **topological map** (a graph of places and connections) is tiny and good for route-level planning, but carries no geometry.\n\nThe pose-uncertainty issue: occupancy mapping assumes known poses. Small pose errors blur walls into thick bands, and a drifted pose draws the same corridor twice. That is the point where mapping has to become SLAM.',
    exploreIds: ['raycast', 'occupancy'],
  },
];

export const flashcards: Flashcard[] = [
  // Which problem
  {
    id: 'slam-f-unknown',
    front: 'Localisation, mapping, SLAM: what is unknown in each?',
    back: 'Localisation: the **pose** (map known). Mapping: the **map** (pose known). SLAM: **both**. Settle every scenario by asking “is the map given?” and “is the pose given by something accurate, such as GPS or motion capture?”',
    tags: ['problems'],
  },
  {
    id: 'slam-f-online-full',
    front: 'Online SLAM vs full SLAM: what does each estimate?',
    back: 'Online: the **current** pose and the map, $p(x_t, m \\mid z_{1:t}, u_{1:t})$ (2025 Q8). Full: the **whole trajectory** and the map, $p(x_{1:t}, m \\mid z_{1:t}, u_{1:t})$. Online SLAM is full SLAM with the past poses integrated out.',
    tags: ['problems'],
  },
  {
    id: 'slam-f-chicken',
    front: 'Why is SLAM harder than localisation or mapping on its own?',
    back: 'Chicken and egg: localising needs a map, and mapping needs the pose. Each landmark’s position inherits the error of the pose it was seen from, so pose and map errors are **correlated** and must be estimated together, and odometry drift builds up until a loop closure corrects it.',
    tags: ['problems'],
  },
  {
    id: 'slam-f-satellite',
    front: 'A satellite knows its exact pose from ground tracking and GPS, and stitches surface temperature readings into one image. Which problem?',
    back: '**Mapping**: the pose is known; only the map (the temperature image) is unknown. Building a map does not make it SLAM (2023 Q7).',
    tags: ['problems'],
  },
  {
    id: 'slam-f-forklift',
    front: 'A warehouse forklift has the layout and the surveyed positions of the tags its cameras detect. To navigate it must perform …?',
    back: '**Localisation**: the map, tags included, is given, so only the pose is unknown. Not “all of the above” (2024 Q7).',
    tags: ['problems'],
  },
  {
    id: 'slam-f-lunar',
    front: 'A rover on the Moon must reconstruct the lunar surface. Which problem?',
    back: '**SLAM**: the map is the product (unknown), and there is no GPS on the Moon, so the pose is unknown too; odometry alone drifts (2025 Q7).',
    tags: ['problems'],
  },
  // Occupancy update
  {
    id: 'slam-f-grid',
    front: 'What does an occupancy grid store, and what does its update assume?',
    back: 'One probability of occupancy per cell. Each cell is a static binary state, updated **independently** by Bayes’ rule with no prediction step, assuming known robot poses and readings that are independent given the map (a static world).',
    tags: ['occupancy'],
  },
  {
    id: 'slam-f-prior',
    front: 'No information about a cell: which prior, and why?',
    back: '$p(m) = 0.5$: occupied and free are equally likely (maximum uncertainty). It is log-odds $l_0 = 0$, so it adds no bias, and every later reading can move it (2023 Q31a).',
    tags: ['occupancy'],
  },
  {
    id: 'slam-f-prior-01',
    front: 'What happens if a cell is initialised to 0 or 1?',
    back: 'It can **never** change. Bayes multiplies by the prior ($0 \\times$ anything $= 0$), and in log-odds $\\mp\\infty$ plus any finite step is still $\\mp\\infty$. A wrong initial guess becomes a permanent map error (2025 Q22).',
    tags: ['occupancy'],
  },
  {
    id: 'slam-f-table',
    front: 'TP 0.7, TN 0.95: write the sensor table.',
    back: '$$\\begin{array}{c|cc} & \\text{occ} & \\text{free} \\\\ \\hline m & 0.70 & 0.30 \\\\ \\neg m & 0.05 & 0.95 \\end{array}$$\n\nRows are the true state and each sums to 1. False positive $= 1 - \\text{TN} = 0.05$; miss $= 1 - \\text{TP} = 0.30$.',
    tags: ['occupancy'],
  },
  {
    id: 'slam-f-bayes-cell',
    front: 'The binary Bayes update of a cell for one reading $z$?',
    back: '$$p(m \\mid z) = \\frac{p(z \\mid m)\\,p(m)}{p(z \\mid m)\\,p(m) + p(z \\mid \\neg m)\\,(1 - p(m))}$$\n\nUse the column of the reading observed (OCC: TP and $1 - \\text{TN}$; FREE: $1 - \\text{TP}$ and TN). The posterior is the next reading’s prior.',
    tags: ['occupancy'],
  },
  {
    id: 'slam-f-review',
    front: 'Review deck: TP 0.85, TN 0.99, prior 0.5. OCCUPIED, then FREE?',
    back: 'OCC: $\\dfrac{0.85(0.5)}{0.85(0.5) + 0.01(0.5)} = 0.9884$.\n\nFREE: $\\dfrac{0.15(0.9884)}{0.15(0.9884) + 0.99(0.0116)} = 0.928$ (the slide’s 0.9281 uses the rounded 0.9884; full precision gives 0.9279).',
    tags: ['occupancy'],
  },
  {
    id: 'slam-f-2023',
    front: '2023 Q31: TP 0.70, TN 0.95, prior 0.5. OCCUPIED, then FREE?',
    back: 'OCC: $\\dfrac{0.7(0.5)}{0.7(0.5) + 0.05(0.5)} = \\dfrac{0.35}{0.375} = 0.9333$.\n\nFREE: $\\dfrac{0.3(0.9333)}{0.3(0.9333) + 0.95(0.0667)} = \\dfrac{0.28}{0.3433} = 0.8155$.',
    tags: ['occupancy'],
  },
  // Log-odds
  {
    id: 'slam-f-logodds',
    front: 'Log-odds of $p$, and back again? The values at 0.5, 0.9 and 0.99?',
    back: '$l = \\ln\\dfrac{p}{1 - p}$ and $p = 1 - \\dfrac{1}{1 + e^{l}}$. $l(0.5) = 0$, $l(0.9) = 2.20$, $l(0.99) = 4.60$, $l(0.1) = -2.20$; 0 and 1 map to $\\mp\\infty$.',
    tags: ['logodds'],
  },
  {
    id: 'slam-f-logodds-update',
    front: 'The course’s log-odds occupancy update, and why use it?',
    back: '$l_t = l_{t-1} + \\ln\\dfrac{p(m \\mid z_t)}{1 - p(m \\mid z_t)} - l_0$, with $p(m \\mid z_t)$ the inverse sensor model. One addition per cell per reading: no normalising, and no precision lost near 0 and 1. With prior 0.5, $l_0 = 0$.',
    tags: ['logodds'],
  },
  {
    id: 'slam-f-lr',
    front: 'What is a reading’s likelihood ratio, and what does it tell you?',
    back: '$\\dfrac{p(z \\mid m)}{p(z \\mid \\neg m)}$: how many times likelier the reading is if the cell is occupied. Its log is the reading’s log-odds step. OCC: $\\dfrac{\\text{TP}}{1 - \\text{TN}}$; FREE: $\\dfrac{1 - \\text{TP}}{\\text{TN}}$. The further from 1, the stronger the evidence.',
    tags: ['logodds'],
  },
  {
    id: 'slam-f-occ-free',
    front: 'Why does OCCUPIED then FREE leave the cell high (0.8155) with TP 0.7, TN 0.95?',
    back: 'The readings are unequal evidence. False positives are rare (0.05), so OCC is strong: ratio 14, step $+2.64$. Misses are common (0.30), so FREE is weak: ratio 0.32 (about 3×), step $-1.15$. One weak FREE cannot cancel one strong OCC (2023 Q31d).',
    tags: ['logodds'],
  },
  {
    id: 'slam-f-order',
    front: 'A cell receives FREE then OCCUPIED instead of OCCUPIED then FREE. Does the answer change?',
    back: 'No. The log-odds steps add, and addition commutes: both orders give 0.8155 with TP 0.7, TN 0.95 (FREE first gives 0.24, then 0.8155). Only how many readings of each kind matters.',
    tags: ['logodds'],
  },
  {
    id: 'slam-f-how-many',
    front: 'TP 0.7, TN 0.95: how many FREE readings does it take to undo one OCCUPIED?',
    back: '$2.64 / 1.15 = 2.3$, so **three**: after OCC, FREE, FREE the cell is at 0.58, and a third FREE takes it to 0.31.',
    tags: ['logodds'],
  },
  {
    id: 'slam-f-tn-effect',
    front: 'TP stays 0.7; TN rises from 0.95 to 0.99. What happens to each reading’s strength?',
    back: 'OCC gets much stronger: ratio $0.7 / 0.01 = 70$ (step $+4.25$, was $+2.64$), because false alarms are now rarer. FREE barely changes: $0.3 / 0.99$ (step $-1.19$, was $-1.15$). TN sets what an OCCUPIED reading is worth.',
    tags: ['logodds'],
  },
  {
    id: 'slam-f-tp-effect',
    front: 'TN stays 0.95; TP rises from 0.7 to 0.95. What happens?',
    back: 'FREE gets much stronger: ratio $0.05 / 0.95$ (step $-2.94$, was $-1.15$), because misses are now rare. OCC only rises to $0.95 / 0.05 = 19$ ($+2.94$). With TP = TN the two steps are equal and opposite, so OCC then FREE returns exactly to 0.5.',
    tags: ['logodds'],
  },
  {
    id: 'slam-f-clamp',
    front: 'Why do mappers clamp each cell’s log-odds between limits?',
    back: 'So that no cell becomes too certain to change back: a door that closes or a chair that moves can flip within a few readings. Clamping also limits overconfidence from readings that are not truly independent.',
    tags: ['logodds', 'practical'],
  },
  // Data association and loop closure
  {
    id: 'slam-f-association',
    front: 'Data association: what is it, and why is it hard?',
    back: 'Deciding which landmark or mapped place each measurement came from, or whether it is new. It is hard because landmarks look alike, measurements are noisy, and a drifted pose puts old landmarks in the wrong predicted place.',
    tags: ['association'],
  },
  {
    id: 'slam-f-loop',
    front: 'Loop closure: what is it, and what does a correct one do?',
    back: 'Recognising a return to an already-mapped place: data association with an old pose. It adds a constraint across the loop, so the accumulated drift is spread back along the trajectory, the map snaps into a consistent shape and the uncertainty shrinks.',
    tags: ['association'],
  },
  {
    id: 'slam-f-false-missed',
    front: 'Missed vs false loop closure: the effect of each, and which is worse?',
    back: 'Missed: drift keeps growing and the revisited area is drawn twice. False: two different places are forced together, so the map warps and the estimate becomes **overconfident**, which makes it hard to undo. False is worse (2024 Q23, 2025 Q23).',
    tags: ['association'],
  },
  // Techniques
  {
    id: 'slam-f-ekf',
    front: 'EKF-SLAM: its belief, its cost and its weak spots?',
    back: 'One Gaussian over the pose and all $N$ landmarks (state size $3 + 2N$). Cost $O(N^2)$ per update, because the full covariance is updated. Weak spots: linearisation errors, one fixed data association, no multimodal beliefs. It solves online SLAM.',
    tags: ['techniques'],
  },
  {
    id: 'slam-f-fastslam',
    front: 'FastSLAM: what does each particle hold, and what is one benefit over EKF-SLAM?',
    back: 'A sampled robot **path** plus one small EKF per landmark (landmarks are independent given the path). Benefit: multimodal, non-Gaussian beliefs with no linearised motion model, and per-particle data association, so wrong associations die out at resampling (2023 Q22).',
    tags: ['techniques'],
  },
  {
    id: 'slam-f-graph',
    front: 'Graph SLAM: what are the nodes and edges, and which SLAM problem does it solve?',
    back: 'Nodes: robot poses (and landmarks). Edges: constraints from odometry, observations and loop closures. It optimises all the poses at once by sparse least squares, so it solves **full SLAM**, and a bad edge can be removed and the graph re-optimised.',
    tags: ['techniques'],
  },
  // Practical issues
  {
    id: 'slam-f-practical',
    front: 'Four practical issues in real-world mapping?',
    back: 'Dynamic objects (ghost obstacles), resolution vs memory (halving the cell size gives 4× the cells in 2-D, 8× in 3-D), sensor noise (glass and black surfaces return max range) and out-of-date maps (moved furniture, roadworks). Give each one’s effect.',
    tags: ['practical'],
  },
  {
    id: 'slam-f-car',
    front: 'Two sources of uncertainty for a self-driving car localising in a pre-built city map?',
    back: 'Any two, each with its effect: sensor noise (GPS multipath in urban canyons, lidar in rain), map mismatch (out-of-date map; parked cars and pedestrians hiding landmarks), motion uncertainty (wheel slip, odometry drift), perceptual aliasing (streets that look alike) (2023 Q24).',
    tags: ['practical'],
  },
];
