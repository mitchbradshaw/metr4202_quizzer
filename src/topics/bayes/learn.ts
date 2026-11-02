// Concept cards and flashcards for 'bayes' (summary notes §1; 2023 Q1–Q3, Q21, Q24; 2024 Q1–Q3, Q21, Q22, Q28;
// 2025 Q1–Q3, Q21, Q28; review deck slides 3–4). Card ids are fixed: sims, generators and Home link to them.
import type { ConceptCard, Flashcard } from '../../engine/types';

export const cards: ConceptCard[] = [
  // ------------------------------------------------------------------ belief
  {
    id: 'bayes-belief',
    title: 'Belief: a distribution, not a best guess',
    lecture: 'Notes §1; review deck slide 3',
    formulas: [
      '$$bel(x_t) = p(x_t \\mid z_{1:t},\\, u_{1:t}), \\qquad \\sum_{x_t} bel(x_t) = 1 \\ \\ \\text{(discrete)}, \\qquad \\int bel(x_t)\\, dx_t = 1 \\ \\ \\text{(continuous)}$$',
      '$$\\underbrace{p(x_t \\mid u_t, x_{t-1})}_{\\text{motion model: actuation noise}} \\qquad\\qquad \\underbrace{p(z_t \\mid x_t)}_{\\text{sensor model: observation noise}}$$',
    ],
    what: 'A robot never knows its true state $x_t$ (its pose, which cell it is in, which fruit is on the belt). It keeps a **belief** $bel(x_t)$ instead: a probability for **every** possible state, given all the measurements $z_{1:t}$ and actions $u_{1:t}$ so far. Two kinds of noise make this necessary. **Actuation** noise (wheels slip, a motor or gripper does not do exactly what it was told) lives in the motion model; **observation** noise (sensors misread) lives in the sensor model.\n\nWhy not keep one best guess? A single number throws away how sure the robot is, and it cannot hold two hypotheses at once: in a corridor with identical doors the belief has a peak at every door until the robot sees something that tells them apart. A mean or a most likely state can always be read off the belief later; the reverse is impossible.',
    when: '- “In a probabilistic state estimation framework, the state is represented as …” (2023 Q1): a distribution over the entire state space.\n- “A probabilistic state estimation framework accounts for …” (2024 Q1): noise in both the actuation and the observations.\n- “Which is FALSE regarding probabilistic state estimation frameworks?” (2025 Q1): that they exactly represent the true state.\n- “Describe two sources of uncertainty that may impact a self-driving car’s ability to localise itself within a pre-built map” (2023 Q24, 2 marks).',
    how: [
      'Name the state $x$ (what is unknown) and the two inputs: actions $u_t$ and measurements $z_t$.',
      'Sort every source of uncertainty into one of the two models: anything that makes the motion differ from the command goes into $p(x_t \\mid u_t, x_{t-1})$; anything that makes a reading differ from the truth goes into $p(z_t \\mid x_t)$.',
      'MCQs: the belief is a **distribution over the whole state space**; it models **both** kinds of noise; it is never exact. The mean, the most likely state and a binary “localised or not” are summaries of it, not the representation.',
      'Sources-of-uncertainty short answers (2 marks = two sources): name each source, give a concrete example and say which step it hurts. Pick them from different families: sensor noise (GPS multipath, rain on the lidar), motion noise (wheel slip, odometry drift), a map that no longer matches the street (roadworks, parked cars), or perceptual aliasing (two streets that look alike).',
    ],
    traps: [
      {
        title: 'Calling the belief “the most likely state”',
        detail: 'The mean and the maximum-likelihood state are read off the belief, but they lose the spread and any second peak. The 2023 key is “a distribution over the entire state space”.',
        source: '2023 Q1',
      },
      {
        title: 'Only one kind of noise',
        detail: 'The framework models noise in **both** the actuation (motion model) and the observations (sensor model): the 2024 key is “Both”.',
        source: '2024 Q1',
      },
      {
        title: '“It recovers the true state exactly”',
        detail: 'FALSE, and the key of 2025 Q1, which asked for the false statement. The true state is never observed directly; the belief only says how probable each state is.',
        trapId: 'read-the-stem',
        source: '2025 Q1',
      },
      {
        title: 'Two examples of the same source',
        detail: 'For “two sources of uncertainty”, GPS noise and lidar noise are both sensor noise. Take them from different families (sensor, motion, map mismatch, aliasing) to earn both marks.',
        source: '2023 Q24',
      },
    ],
    more: 'Three ways to store a belief, all running the same Bayes filter (Notes §2): a **histogram** over grid cells (the exam’s grid world and fruit classifier), a single **Gaussian** (Kalman filter: mean $\\mu$, covariance $\\Sigma$) and a set of weighted **particles** (particle filter). The histogram and the particles can hold several peaks; one Gaussian cannot.\n\nWhy the whole belief pays off when acting: the best action depends on the full distribution, not only on its peak. In 2025 Q28 the most likely fruit is a banana, yet the suction gripper, which suits apples, has the higher expected success, because the belief is close to 50/50 (card “Decisions from a belief”).',
    exploreIds: ['grid1d', 'grid2d'],
    solveIds: ['bayes-grid', 'bayes-predict-correct'],
  },

  // ------------------------------------------------------------------ probability rules
  {
    id: 'bayes-rules',
    title: 'Probability rules: product, independence, marginalisation',
    lecture: 'Notes §1; review deck slides 3–4',
    formulas: [
      '$$\\begin{aligned} \\text{product rule:}\\quad & P(x, y) = P(x \\mid y)\\,P(y) = P(y \\mid x)\\,P(x) \\\\ \\text{independence:}\\quad & P(x, y) = P(x)\\,P(y) \\iff P(x \\mid y) = P(x) \\\\ \\text{conditional independence:}\\quad & P(x \\mid y, z) = P(x \\mid z) \\iff P(x, y \\mid z) = P(x \\mid z)\\,P(y \\mid z) \\\\ \\text{marginalisation:}\\quad & P(x) = \\textstyle\\sum_y P(x, y) = \\sum_y P(x \\mid y)\\,P(y) \\end{aligned}$$',
      '$$P(x \\mid y) = \\frac{P(y \\mid x)\\,P(x)}{P(y)} \\qquad \\text{(the product rule written both ways, divided by } P(y)\\text{)}$$',
    ],
    what: 'Four rules carry every calculation in this topic. The **product rule** splits a joint probability into a conditional times a marginal. **Independence** means knowing $y$ tells you nothing about $x$, so the joint is just the product of the marginals. **Conditional independence** is weaker: $x$ and $y$ may well be related, but only through a third variable $z$; once $z$ is known, $y$ adds nothing about $x$. **Marginalisation** (the law of total probability) removes a variable by summing over its values, each weighted by its probability.\n\nWhy conditional independence matters: two readings of the same door are dependent (both depend on where the robot is), but **given the position** they are independent, because each one’s noise is drawn fresh. That is exactly what lets the Bayes filter multiply one likelihood per measurement, and the Markov assumption is a statement of the same kind.',
    when: '- “If $P(x, y) = P(x)P(y)$, which of the following statements is true?” (2023 Q3): $x$ and $y$ are independent.\n- “If $x$ and $y$ are dependent events, which is FALSE?” (2024 Q3): the wrong product rule ${P(x, y) = P(x \\mid y)P(x)}$.\n- “If $x$ and $y$ are independent events, which is TRUE?” (2025 Q2): $P(x, y) = P(x)P(y)$.\n- “If ${P(z_1 \\mid x, z_0) = P(z_1 \\mid x)}$ then $z_0$ and $z_1$ are …” (review deck slide 4): conditionally independent given $x$.\n- “Calculate the total probability $P(z_1 = \\text{white})$” (2024 Q28(b), 3 marks): marginalisation.',
    how: [
      'Product rule check: the variable behind the bar in the first factor must be the variable of the second factor, $P(x \\mid \\mathbf{y})\\,P(\\mathbf{y})$. Any option shaped like $P(x \\mid y)\\,P(x)$ is wrong.',
      'Independence test: does the joint factor, $P(x, y) = P(x)P(y)$? Equivalently, is $P(x \\mid y) = P(x)$? If so, learning $y$ changes nothing about $x$, so neither probability can be inferred from the other.',
      'Conditional independence: look for a variable that drops out from behind the bar. ${P(z_1 \\mid x, z_0) = P(z_1 \\mid x)}$ says that once $x$ is known, $z_0$ is irrelevant to $z_1$: conditionally independent **given** $x$, which is not the same as independent.',
      'Marginalisation: to get $P(x)$ from a model written case by case in $y$, sum over every value of $y$ weighted by its probability, ${P(x) = \\sum_y P(x \\mid y)P(y)}$. In the filter this gives the evidence $P(z)$ (a sum over states) and the prediction (a sum over previous states).',
      'Rearranging: check any “is this equation true?” option by writing the product rule both ways, ${P(x \\mid y)P(y) = P(y \\mid x)P(x)}$, and dividing. That is how ${P(x) = P(x \\mid y)P(y) / P(y \\mid x)}$ (2024 Q3(d)) turns out to be true.',
    ],
    traps: [
      {
        title: 'The 2024 product-rule trap',
        detail: '${P(x, y) = P(x \\mid y)\\,P(x)}$ is FALSE (the key of 2024 Q3, which asked for the false statement). The correct form is $P(x \\mid y)\\,P(y)$.',
        trapId: 'bayes-product-rule',
        source: '2024 Q3',
      },
      {
        title: 'Conditionally independent is not independent',
        detail: 'Two readings of the same state are dependent (a door seen once makes a door more likely next time), yet conditionally independent given the state. The review deck’s answer is “conditionally independent”.',
        source: 'Review deck slide 4',
      },
      {
        title: 'Marginalising without the weights',
        detail: 'Each term must be weighted by the probability of its case, ${P(z) = \\sum_x P(z \\mid x)\\,P(x)}$. With a belief of 0.9 on a white tile and 0.1 on a black one, seeing white has ${P(z) = 0.9(0.90) + 0.1(0.17) = 0.827}$, not the plain average $(0.90 + 0.17)/2 = 0.535$. (2024 Q28(b) also came to 0.535, but only because its predicted belief happened to be split 0.5 / 0.5 between black and white tiles.)',
        source: '2024 Q28(b)',
      },
      {
        title: 'Independent vs mutually exclusive',
        detail: 'Mutually exclusive events cannot happen together, $P(x, y) = 0$, so (with non-zero marginals) they are strongly **dependent**: knowing one happened rules the other out.',
        source: 'Review deck slide 3 (probability revision)',
      },
    ],
    more: 'What “$P(x)$ can be inferred from $P(y)$” means on the papers. 2025 Q2 marks it FALSE for independent events (one tells you nothing about the other), and 2024 Q3 treats it as TRUE for dependent events (only the wrong product rule was false). Read it as “information about $y$ tells you something about $x$”, which is what dependence means; the link is ${P(x) = \\sum_y P(x \\mid y)P(y)}$.\n\nA joint table makes all four rules concrete. With ${P(\\text{door}, \\text{beep}) = 0.24}$, ${P(\\text{door}, \\text{silent}) = 0.06}$, ${P(\\text{wall}, \\text{beep}) = 0.07}$, ${P(\\text{wall}, \\text{silent}) = 0.63}$: marginalising gives $P(\\text{door}) = 0.30$ and $P(\\text{beep}) = 0.31$; the product rule gives ${P(\\text{beep} \\mid \\text{door}) = 0.24/0.30 = 0.8}$; and since ${0.30 \\times 0.31 = 0.093 \\neq 0.24}$, door and beep are dependent, which is what makes the beep useful.',
    exploreIds: ['bayes-rule'],
    solveIds: ['bayes-rules'],
  },

  // ------------------------------------------------------------------ Bayes' rule terms
  {
    id: 'bayes-rule-terms',
    title: 'Bayes’ rule: prior, likelihood, evidence, posterior',
    lecture: 'Notes §1; review deck slide 4',
    formulas: [
      '$$\\underbrace{P(x \\mid z)}_{\\text{posterior: new belief}} \\;=\\; \\frac{\\overbrace{P(z \\mid x)}^{\\text{likelihood: sensor model}} \\;\\; \\overbrace{P(x)}^{\\text{prior: belief before } z}}{\\underbrace{P(z)}_{\\text{evidence: normaliser } 1/\\eta}}$$',
      '$$P(z) = \\sum_{x} P(z \\mid x)\\,P(x), \\qquad \\eta = \\frac{1}{P(z)}, \\qquad P(x \\mid z) = \\eta\\, P(z \\mid x)\\, P(x) \\;\\propto\\; \\text{likelihood} \\times \\text{prior}$$',
    ],
    what: 'Bayes’ rule turns what a sensor model gives you, $P(z \\mid x)$ (“if I were in state $x$, how likely is this reading?”), into what you want, $P(x \\mid z)$ (“given this reading, how likely is each state?”). In state estimation the four terms are:\n\n- **Prior** $P(x)$: the belief before the reading; in a filter, the predicted belief $\\overline{bel}(x_t)$.\n- **Likelihood** $P(z \\mid x)$: the sensor model evaluated at the reading actually observed, one number per state. It weights the states; it is not a distribution over them and need not sum to 1.\n- **Evidence** $P(z)$: the total probability of that reading, ${\\sum_x P(z \\mid x)P(x)}$. It is the same for every state, so it only rescales: ${\\eta = 1/P(z)}$.\n- **Posterior** $P(x \\mid z)$: the new belief, which becomes the prior for the next step. That is what makes the estimation recursive.\n\nWhy the rule is needed: a sensor is calibrated in the forward direction (put the robot on a black tile and count how often it reads black), but localisation asks the inverse question. The prior matters as much as the sensor: a detector that catches 95 % of damaged parts can still be wrong about most of the parts it flags, if damaged parts are rare.',
    when: '- “Bayes’ rule is written as … What do each of the four terms represent in a recursive state estimation context?” (review deck slide 4).\n- “Calculate the total probability $P(z_1 = \\text{white})$” (2024 Q28(b), 3 marks): the evidence.\n- “Calculate all of the non-zero posterior probabilities” (2024 Q28(c), 6 marks) and “the updated state estimates after each measurement” (2025 Q28(a), 10 marks).',
    how: [
      'Name the hidden variable $x$ (tile, fruit, cell) and the observed one $z$ (colour seen, class detected).',
      'Prior: the current belief over $x$, after the prediction step if the robot moved.',
      'Likelihood: in the sensor table (rows = true state, columns = reading, each row sums to 1) take the **column of the reading actually observed**, one entry per true state. Fill a missing entry from its row: ${P(\\text{white} \\mid \\text{black}) = 1 - P(\\text{black} \\mid \\text{black})}$.',
      'Multiply prior × likelihood for each state. The sum of the products is the evidence $P(z)$: quote it, as it is often a part of its own.',
      'Posterior = product ÷ $P(z)$. Check that the posteriors sum to 1 and that the states which agree with the reading went up.',
    ],
    traps: [
      {
        title: 'Reading a row instead of the observed column',
        detail: 'The likelihood is $P(z_{\\text{observed}} \\mid x)$ for each $x$. 2024 Q28 gave only the hit rates, so seeing white on a black tile needs $1 - 0.83 = 0.17$, not 0.83.',
        trapId: 'likelihood-column',
        source: '2024 Q28(b)',
      },
      {
        title: 'Forgetting to normalise',
        detail: 'The products alone do not sum to 1 (in 2024 Q28 they sum to 0.535). Divide each one by $P(z)$; the unnormalised products earn no posterior marks.',
        trapId: 'normalise',
        source: '2024 Q28(c), 2025 Q28(a)',
      },
      {
        title: 'Taking the likelihood for the posterior',
        detail: 'A camera flags 95 % of damaged parts and 10 % of good ones; 2 % of parts are damaged. For a flagged part, ${P(\\text{damaged} \\mid \\text{flag}) = 0.019/0.117 = 0.16}$, not 0.95: most flags are false alarms on the many good parts.',
        trapId: 'bayes-inverse',
        source: 'Notes §1 (Bayes’ rule)',
      },
      {
        title: 'Expecting a likelihood column to sum to 1',
        detail: 'Rows of a sensor table sum to 1 (each true state must give some reading); columns need not. The banana column of 2025 Table 1 sums to $0.1 + 0.75 + 0.05 = 0.9$.',
        source: '2025 Q28',
      },
    ],
    more: 'The odds form shows how strong a single reading is, and $P(z)$ cancels:\n\n$$\\underbrace{\\frac{P(x_1 \\mid z)}{P(x_2 \\mid z)}}_{\\text{posterior odds}} = \\underbrace{\\frac{P(z \\mid x_1)}{P(z \\mid x_2)}}_{\\text{likelihood ratio}} \\times \\underbrace{\\frac{P(x_1)}{P(x_2)}}_{\\text{prior odds}}$$\n\nIn 2025 Q28 the second frame detects an apple. The likelihood ratio apple : banana is $0.6 / 0.05 = 12$, so the odds $0.0723 / 0.9036 = 0.08$ become $0.96$, almost even. A detector that rarely calls a banana an apple makes one “apple” strong evidence.\n\nDeriving the rule: write the product rule both ways, ${P(x \\mid z)P(z) = P(z \\mid x)P(x)}$, and divide by $P(z)$.',
    exploreIds: ['bayes-rule', 'classifier'],
    solveIds: ['bayes-rules', 'bayes-classifier'],
  },

  // ------------------------------------------------------------------ Markov assumption
  {
    id: 'bayes-markov',
    title: 'The Markov assumption: what breaks it and what does not',
    lecture: 'Notes §1; 2023 Q2; 2024 Q2; 2025 Q3',
    formulas: [
      '$$\\begin{aligned} \\text{motion:}\\quad & p(x_t \\mid x_{0:t-1},\\, z_{1:t-1},\\, u_{1:t}) = p(x_t \\mid x_{t-1},\\, u_t) \\\\ \\text{measurement:}\\quad & p(z_t \\mid x_{0:t},\\, z_{1:t-1},\\, u_{1:t}) = p(z_t \\mid x_t) \\end{aligned}$$',
    ],
    what: 'The Markov assumption says the **current state summarises the whole history**. Given $x_{t-1}$ and $u_t$, nothing earlier helps predict $x_t$; given $x_t$, the measurement $z_t$ does not depend on earlier states or readings. It is a conditional-independence statement: the future and the past are independent **given the present**. It is what makes the Bayes filter **recursive**: the filter stores only $bel(x_{t-1})$, never the full history.\n\nIt **breaks** when something that changes over time and affects the motion or the readings is **left out of the state**: a sensor whose noise grows as it heats up, a motor that wears or decays, a battery that sags, people who linger in front of the robot but are not in its map, a velocity missing from a position-only state. The past then carries information the state does not. It is **not** broken by random, memoryless noise (wheel slip, gusts, zero-mean sensor noise, a steering fault that picks left or right at random): each step’s noise is drawn fresh, and modelling exactly that is the job of the motion and sensor models.',
    when: '- “In which of the following scenarios would the Markov assumption be invalid?” (2023 Q2, 2024 Q2): a near-certain MCQ.\n- “Which of the following is TRUE given the Markov assumption?”, with $P(z_t \\mid x_t)$ written four ways (2025 Q3).\n- “Explain the Markov assumption and its implications on defining the state space” (2024 Q26, 3 marks, in the reinforcement-learning section).',
    how: [
      'Ask: does the effect depend on **history that is not in the state**, such as time switched on, distance driven, temperature, wear or charge? Then the Markov assumption is invalid.',
      'Ask: is the effect **random and memoryless**, drawn afresh each step with the same statistics (slip, gusts, random noise, random left/right failures)? Then it is fine: the probabilistic models absorb it.',
      'Formula questions: the true statement keeps the **current** state behind the bar and lets the past drop out, ${P(z_t \\mid x_t, z_{t-1}, x_{t-1}, \\dots, x_0) = P(z_t \\mid x_t)}$. Reject options that drop $x_t$ itself or condition on $x_{t-1}$ instead.',
      'To repair a violation, add the missing quantity to the state (sensor temperature, motor health, battery level, velocity) and model how it evolves. The state grows, so add what is needed and no more.',
    ],
    traps: [
      {
        title: 'Random noise “breaks” Markov',
        detail: 'Memoryless noise is exactly what $p(x_t \\mid u_t, x_{t-1})$ and $p(z_t \\mid x_t)$ model. Slip, gusts and random sensor noise were the wrong options in both 2023 and 2024.',
        trapId: 'markov',
        source: '2023 Q2, 2024 Q2',
      },
      {
        title: 'A broken part sounds like a violation',
        detail: 'A steering fault that turns left or right **at random** is still memoryless (2024 Q2(a)). What matters is whether the behaviour depends on the past, not whether something is broken.',
        trapId: 'markov',
        source: '2024 Q2',
      },
      {
        title: 'Dropping the current state too',
        detail: '$P(z_t \\mid x_t) = P(z_t)$ would make the sensor useless (2025 Q3(a)), and conditioning only on the past, $P(z_t \\mid x_{t-1}, z_{t-1}, \\dots)$, loses the one thing the reading depends on (2025 Q3(d)). Markov drops the **past**, never the present.',
        source: '2025 Q3',
      },
    ],
    more: 'Where the filter uses it. Deriving ${bel(x_t) = p(x_t \\mid z_{1:t}, u_{1:t})}$ takes Bayes’ rule, then two Markov steps: in the correction, $p(z_t \\mid x_t, z_{1:t-1}, u_{1:t})$ becomes $p(z_t \\mid x_t)$; in the prediction, $p(x_t \\mid x_{t-1}, z_{1:t-1}, u_{1:t})$ becomes $p(x_t \\mid u_t, x_{t-1})$. Without them, every update would need the whole history.\n\nIn practice violations are everywhere (unmodelled dynamics, approximate models, people in the scene) and filters tolerate mild ones; the exam asks you to spot the textbook cases. The same idea defines a good state in reinforcement learning (2024 Q26): position alone is not Markov for a moving robot, because where it goes next also depends on its velocity.',
    exploreIds: ['markov'],
    solveIds: ['bayes-rules'],
  },

  // ------------------------------------------------------------------ the Bayes filter
  {
    id: 'bayes-filter',
    title: 'The Bayes filter: predict, then correct',
    lecture: 'Notes §1; review deck slide 4',
    formulas: [
      '$$\\text{Prediction } (u_t):\\quad \\overline{bel}(x_t) = \\int p(x_t \\mid u_t, x_{t-1})\\, bel(x_{t-1})\\, dx_{t-1} \\qquad \\Big(\\text{discrete: } \\textstyle\\sum_{x_{t-1}}\\Big)$$',
      '$$\\text{Correction } (z_t):\\quad bel(x_t) = \\eta\\, p(z_t \\mid x_t)\\, \\overline{bel}(x_t), \\qquad \\eta = \\Big(\\textstyle\\sum_{x_t} p(z_t \\mid x_t)\\, \\overline{bel}(x_t)\\Big)^{-1}$$',
      '$$\\text{Kalman form:}\\quad \\bar\\Sigma_t = A\\Sigma_{t-1}A^T + R \\ \\ (\\text{grows}), \\qquad \\Sigma_t = (I - K_t C)\\,\\bar\\Sigma_t \\ \\ (\\text{shrinks})$$',
    ],
    what: 'Each time step integrates two kinds of data, in two steps.\n\n**Prediction** (the action $u_t$, through the motion model): each possible previous state is pushed through $p(x_t \\mid u_t, x_{t-1})$ and the results are added up, a total-probability sum over $x_{t-1}$. The belief moves with the command and **spreads out**, because actuation noise is added and no new information arrives: a robot cannot become more certain of where it is just by moving.\n\n**Correction** (the reading $z_t$, through the sensor model): the predicted belief is multiplied by the likelihood $p(z_t \\mid x_t)$ and normalised by $\\eta$. States that explain the reading gain probability and the others lose it, so the belief **sharpens**. The result $bel(x_t)$ is the prior for the next step.\n\nWhy several overlapping sensors help (2024 Q22): their independent errors partly cancel when the likelihoods are multiplied (two equal-variance readings halve the variance), and redundancy keeps the estimate going when one sensor fails, is occluded or returns an outlier.',
    when: '- “Explain how sensor data and actuation data are used for state estimation in a Bayes filter” (2023 Q21, 2 marks).\n- “Describe the two data integration steps of a Bayes filter” (2024 Q21, 2 marks); “What are the two key steps of Bayes filtering?” (review deck slide 4).\n- “Explain how a Bayes filter incorporates the effect of a control action on the state estimate. Does the uncertainty grow or shrink?” (2025 Q21, 2 marks).\n- “Provide two reasons why it is often beneficial to integrate multiple overlapping sensor readings” (2024 Q22, 2 marks).',
    how: [
      'Name the two steps and the data each one uses: **prediction** ← the action $u_t$ (motion model); **correction** ← the reading $z_t$ (sensor model).',
      'Write both equations from the formula box, with $\\overline{bel}$ for the predicted belief and $\\eta$ for the normaliser.',
      'Say what happens to the uncertainty and **why**: the prediction grows it (noise is added, no information arrives), the correction shrinks it (the reading rules states out).',
      'Say that the posterior becomes the next prior, so the filter is recursive (thanks to the Markov assumption).',
      '“Two reasons” questions: give two **different** reasons, each with its mechanism, e.g. noise reduction (independent errors average out) and robustness (redundancy against failure, occlusion or outliers; different sensor types cover each other’s weaknesses).',
    ],
    traps: [
      {
        title: 'Swapping the models',
        detail: 'The motion model belongs to the prediction and the sensor model to the correction. “Sensor data predicts, actuation data corrects” loses both marks.',
        source: '2023 Q21, 2024 Q21',
      },
      {
        title: '“Moving makes the robot more certain”',
        detail: 'Knowing the command does not remove the actuation noise; the prediction blurs the belief with it, so it spreads (in a Kalman filter ${\\bar\\Sigma_t = A\\Sigma_{t-1}A^T + R}$ only adds $R$). 2025 Q21 asks exactly this: the uncertainty **grows**.',
        source: '2025 Q21',
      },
      {
        title: 'One reason given twice',
        detail: '“More accurate” and “less noise” are the same reason. 2024 Q22 wants two: noise reduction **and** robustness through redundancy (or complementary coverage).',
        source: '2024 Q22',
      },
    ],
    more: 'A correction shrinks the uncertainty **on average**, but one surprising reading can flatten a discrete belief. In 2025 Q28 the belief after the banana detection was 0.90 on banana (entropy 0.54 bits); the apple detection then pulled it to almost 50/50 (1.09 bits), because it contradicted a confident belief. A Kalman filter’s variance, by contrast, always shrinks in the correction: ${\\Sigma_t = (I - K_tC)\\bar\\Sigma_t}$ does not depend on the value of $z_t$.\n\nFusing two independent Gaussian readings with variances $\\sigma_1^2$ and $\\sigma_2^2$ gives ${1/\\sigma^2 = 1/\\sigma_1^2 + 1/\\sigma_2^2}$: two equal readings halve the variance, and a correctly modelled extra sensor never makes the estimate worse.',
    exploreIds: ['grid1d', 'grid2d'],
    solveIds: ['bayes-predict-correct', 'bayes-grid'],
  },

  // ------------------------------------------------------------------ discrete Bayes by hand
  {
    id: 'bayes-by-hand',
    title: 'Discrete Bayes by hand: the 15-mark long answer',
    lecture: 'Notes §1; 2024 Q28; 2025 Q28',
    formulas: [
      '$$\\begin{aligned} \\text{predict:}\\quad & P(x_1) = \\textstyle\\sum_{x_0} p(x_1 \\mid u_1, x_0)\\, P(x_0) && \\text{(contributions to one cell add)} \\\\ \\text{evidence:}\\quad & P(z) = \\textstyle\\sum_{x} P(z \\mid x)\\, P(x) && \\text{(the sum of the product column)} \\\\ \\text{correct:}\\quad & P(x \\mid z) = P(z \\mid x)\\, P(x) \\,/\\, P(z) && \\text{(the posteriors sum to 1)} \\end{aligned}$$',
      '$$\\begin{array}{l|c|c|c|c} x_1 & P(x_1) & P(\\text{white} \\mid x_1) & \\text{product} & \\text{product} \\div 0.535 \\\\ \\hline \\text{C2 (black)} & 0.40 & 0.17 & 0.068 & 0.1271 \\\\ \\text{B2 (black)} & 0.10 & 0.17 & 0.017 & 0.0318 \\\\ \\text{G3 (white)} & 0.40 & 0.90 & 0.360 & 0.6729 \\\\ \\text{F3 (white)} & 0.10 & 0.90 & 0.090 & 0.1682 \\\\ \\hline \\Sigma & 1 & & 0.535 = P(z) & 1 \\end{array}$$',
    ],
    what: 'The discrete long answer (2024 Q28 grid world, 2025 Q28 fruit classifier) is the same table exercise every year, worth 15 marks. The belief is a short list of states with non-zero probability. The prediction moves probability along the motion model’s arrows; the correction is a four-column table: prior, likelihood, product, product ÷ sum, where the sum of the products is $P(z)$. Every stage can be checked: the predicted belief sums to 1, the posteriors sum to 1, and the states that match the reading go up.\n\nThe table above is 2024 Q28(c). The robot started at C3 or G4 (0.5 each), moved up with 80 % up and 20 % up-left, giving C2 0.4, B2 0.1, G3 0.4, F3 0.1, and then saw white.',
    when: '- Grid-world localisation: “calculate all of the non-zero probabilities after taking action $u_1$” (6 marks), “the total probability $P(z_1 = \\text{white})$” (3 marks), “all of the non-zero posterior probabilities” (6 marks) (2024 Q28).\n- A classifier with a confusion table: “calculate the updated state estimates after each measurement” (2025 Q28(a), 10 marks), followed by a decision (card “Decisions from a belief”).\n- The same correction table drives the occupancy-cell update (2023 Q31, Mapping and SLAM).',
    how: [
      '**List the states with non-zero probability.** Nothing else needs tracking: a state with probability 0 contributes nothing.',
      '**Prediction:** push each state’s probability through the motion model (from C3: up 0.8 → C2, up-left 0.2 → B2). Where two starts land in the same cell, **add** the contributions. The colour of the starting tile plays no part here.',
      '**Correction:** build the table prior · likelihood · product · product ÷ sum. The sum of the products is $P(z)$; write it down separately, as it is often a part of its own.',
      '**Read likelihoods carefully:** $P(z \\mid x)$ is the entry for the **observed** $z$ given each true $x$. If the sheet gives ${P(\\text{black} \\mid \\text{black}) = 0.83}$, then ${P(\\text{white} \\mid \\text{black}) = 0.17}$.',
      '**Several measurements:** the posterior becomes the next prior; repeat the correction. If nothing moves between frames (a fruit under the camera), there is no prediction step in between.',
      '**Decision questions:** compute the expected outcome $\\sum_x P(\\text{success} \\mid x)\\,P(x)$ for each option and pick the larger.',
      '**Check** that every column of probabilities sums to 1, keep 4 significant figures until the end, and state your assumptions (measurements conditionally independent given the state; the object does not change between frames).',
    ],
    traps: [
      {
        title: 'Not adding contributions that land in the same cell',
        detail: 'If two starting cells can reach the same cell, its predicted probability is the **sum** of both arrows’ $p(x_1 \\mid u_1, x_0)\\,P(x_0)$. Keeping only one loses probability, and the column no longer sums to 1.',
        trapId: 'contributions-add',
        source: 'Notes §1; 2024 Q28(a)',
      },
      {
        title: 'Using the hit rate for every tile',
        detail: 'Seeing white: white tiles get 0.90, but black tiles get $1 - 0.83 = 0.17$. Using 0.83 for the black tiles gives $P(z) = 0.865$ instead of 0.535.',
        trapId: 'likelihood-column',
        source: '2024 Q28(b)',
      },
      {
        title: 'Using the start tile’s colour in the prediction',
        detail: 'Colours only enter through the likelihood of the reading taken **after** the move. In 2024 the start tile G4 was black and C3 white; neither fact matters for part (a).',
        trapId: 'bayes-start-colour',
        source: '2024 Q28(a)',
      },
      {
        title: 'Rounding too early',
        detail: 'The second update of 2025 Q28 starts from 0.0723 / 0.9036 / 0.0241. Rounded to 0.07 / 0.90 / 0.02, it ends at 0.477 / 0.511 / 0.011 instead of 0.483 / 0.503 / 0.013. Keep 4 significant figures.',
        source: '2025 Q28(a)',
      },
    ],
    more: '2025 Q28(a): two corrections in a row, with no prediction between them because the fruit does not move. First frame, a banana detection (likelihoods from the B column of the table):\n\n$$\\begin{array}{c|c|c|c|c} x & P(x) & P(z = \\text{B} \\mid x) & \\text{product} & P(x \\mid \\text{B}) \\\\ \\hline \\text{A} & 0.3 & 0.10 & 0.030 & 0.0723 \\\\ \\text{B} & 0.5 & 0.75 & 0.375 & 0.9036 \\\\ \\text{N} & 0.2 & 0.05 & 0.010 & 0.0241 \\\\ \\hline \\Sigma & 1 & & 0.415 & 1 \\end{array}$$\n\nSecond frame, an apple detection, with the posterior above as the prior:\n\n$$\\begin{array}{c|c|c|c|c} x & P(x \\mid \\text{B}) & P(z = \\text{A} \\mid x) & \\text{product} & P(x \\mid \\text{B}, \\text{A}) \\\\ \\hline \\text{A} & 0.0723 & 0.60 & 0.04337 & 0.4832 \\\\ \\text{B} & 0.9036 & 0.05 & 0.04518 & 0.5034 \\\\ \\text{N} & 0.0241 & 0.05 & 0.00120 & 0.0134 \\\\ \\hline \\Sigma & 1 & & 0.08976 & 1 \\end{array}$$\n\nThe order of the two detections does not matter: the final posterior is proportional to $P(x)\\,P(\\text{B} \\mid x)\\,P(\\text{A} \\mid x)$ either way.',
    exploreIds: ['grid2d', 'grid1d', 'classifier'],
    solveIds: ['bayes-grid', 'bayes-classifier', 'bayes-predict-correct'],
  },

  // ------------------------------------------------------------------ decisions
  {
    id: 'bayes-decisions',
    title: 'Decisions from a belief: expected value and total probability',
    lecture: 'Notes §1 (decision questions); 2025 Q28(b)–(c)',
    formulas: [
      '$$P(\\text{success} \\mid a) = \\sum_x P(\\text{success} \\mid x, a)\\, P(x), \\qquad a^{*} = \\arg\\max_a\\, P(\\text{success} \\mid a)$$',
      '$$\\begin{array}{l|c|c|l} \\text{gripper} & \\text{apple } (0.483) & \\text{banana } (0.503) & \\text{expected success} \\\\ \\hline \\text{suction} & 0.95 & 0.70 & 0.95(0.483) + 0.70(0.503) = \\mathbf{0.811} \\\\ \\text{pinch} & 0.60 & 0.90 & 0.60(0.483) + 0.90(0.503) = 0.743 \\end{array}$$',
    ],
    what: 'A belief is only useful if the robot acts on it. When the outcome of an action depends on the unknown state, weight the outcome in each state by that state’s probability and add: the **law of total probability** applied to “success”. Choose the action with the larger expected success, **not** the action that suits the single most likely state.\n\nIn 2025 Q28 the belief after two frames was apple 0.483, banana 0.503, nothing 0.013. Banana is (just) the most likely fruit, which tempts you towards the pinch gripper (0.90 on bananas). But the belief is nearly 50/50, the pinch gripper is poor on apples (0.60) and suction is good on both (0.95 and 0.70), so suction wins, 0.811 to 0.743. The same sum, for the gripper actually used, is the probability of retrieving the fruit: part (c).',
    when: '- “Which gripper type should the system use in this case and why?” (2025 Q28(b), 2 marks).\n- “Calculate the probability that the system successfully retrieves a piece of fruit” (2025 Q28(c), 3 marks).\n- Any “what is the overall probability of …” over an uncertain state: marginalise over the state.',
    how: [
      'Take the **final** posterior, after every measurement, as $P(x)$.',
      'For each option $a$, list $P(\\text{success} \\mid x, a)$ for every state. A state in which success is impossible (no fruit present) gets 0; say so as an assumption.',
      'Expected success: $\\sum_x P(\\text{success} \\mid x, a)\\,P(x)$ for each option. Write the sum out with the numbers.',
      'Pick the larger and justify it with the numbers **and** the reason (here: the belief is nearly even, and suction is strong on apples while pinch is weak on them).',
      'Sanity check: each expected success must lie between that option’s worst and best per-state rate (counting any zero-success state).',
    ],
    traps: [
      {
        title: 'Choosing for the most likely state',
        detail: 'Banana is the most likely fruit (0.503), but the pinch gripper’s expected success is lower (0.743 vs 0.811). The decision weighs every state, not only the peak.',
        trapId: 'bayes-decision',
        source: '2025 Q28(b)',
      },
      {
        title: 'Averaging the success rates',
        detail: '$(0.95 + 0.70)/2 = 0.825$ ignores the belief; the weights must be the state probabilities.',
        source: '2025 Q28(c)',
      },
      {
        title: 'Dropping the “nothing” state, or renormalising without saying so',
        detail: 'With no fruit present the grasp cannot succeed, so $N$ contributes $0 \\times 0.0134$. Dividing by $P(A) + P(B)$ answers a different question (success given that a fruit is there); say which one you computed.',
        source: '2025 Q28(c)',
      },
    ],
    more: 'Where the decision flips. With the 2025 rates, suction − pinch ${= 0.35\\,P(A) - 0.20\\,P(B)}$, so suction is better whenever ${P(A)/P(B) > 0.20/0.35 \\approx 0.57}$. Follow the belief through the question: at the start (0.3, 0.5, 0.2) the ratio is 0.6, a near tie (0.635 vs 0.630); after the banana detection it is 0.08, so pinch wins clearly (0.857 vs 0.701); after the apple detection it is 0.96, so suction wins. Each measurement can change the best action, which is why the camera takes several frames before the arm commits.',
    exploreIds: ['classifier'],
    solveIds: ['bayes-classifier'],
  },
];

export const flashcards: Flashcard[] = [
  // Belief and noise
  {
    id: 'bayes-f-belief',
    front: 'What is a robot’s **belief** $bel(x_t)$?',
    back: 'A probability distribution over **every** possible state, given all the measurements and actions so far: ${bel(x_t) = p(x_t \\mid z_{1:t}, u_{1:t})}$. Not the average state, not the most likely state, not a binary flag (2023 Q1).',
    tags: ['belief', 'mcq'],
  },
  {
    id: 'bayes-f-noise',
    front: 'Which two kinds of noise does a probabilistic state estimator model, and in which models?',
    back: '**Actuation** noise in the motion model $p(x_t \\mid u_t, x_{t-1})$ and **observation** noise in the sensor model $p(z_t \\mid x_t)$. “Both” is the key of 2024 Q1.',
    tags: ['belief', 'mcq'],
  },
  {
    id: 'bayes-f-exact',
    front: 'TRUE or FALSE: probabilistic state estimation frameworks represent the true state exactly.',
    back: '**FALSE** (2025 Q1). They represent a distribution over the possible states; the true state is never observed directly.',
    tags: ['belief', 'mcq'],
  },
  {
    id: 'bayes-f-why-dist',
    front: 'Why keep a whole distribution instead of one best estimate?',
    back: 'It keeps **how sure** the robot is, and it can hold **several hypotheses** at once (two identical doors give two peaks) until a reading tells them apart. Decisions need it too: the best action weighs every state (2025 Q28(b)).',
    tags: ['belief'],
  },
  // Probability rules
  {
    id: 'bayes-f-product',
    front: 'The product rule, and the wrong version from the 2024 paper?',
    back: '${P(x, y) = P(x \\mid y)\\,P(y) = P(y \\mid x)\\,P(x)}$. The trap ${P(x, y) = P(x \\mid y)\\,P(x)}$ is FALSE (2024 Q3): the second factor must be the variable you conditioned on.',
    tags: ['rules', 'mcq'],
  },
  {
    id: 'bayes-f-indep',
    front: 'Independence: the definition, and what it means in words?',
    back: '$P(x, y) = P(x)\\,P(y)$, equivalently $P(x \\mid y) = P(x)$: learning $y$ tells you nothing about $x$ (2023 Q3, 2025 Q2). So for independent events neither probability can be inferred from the other.',
    tags: ['rules', 'mcq'],
  },
  {
    id: 'bayes-f-dependent',
    front: 'The papers say “$P(x)$ can be inferred from $P(y)$”. Is that counted true for dependent or for independent events?',
    back: '**True for dependent** events (2024 Q3, where only the wrong product rule was FALSE) and **false for independent** ones (2025 Q2). Dependence means $y$ carries information about $x$, linked by ${P(x) = \\sum_y P(x \\mid y)\\,P(y)}$.',
    tags: ['rules', 'mcq'],
  },
  {
    id: 'bayes-f-condind',
    front: 'If ${P(z_1 \\mid x, z_0) = P(z_1 \\mid x)}$, how are $z_0$ and $z_1$ related?',
    back: '**Conditionally independent given $x$** (review deck slide 4): once the state is known, the earlier reading adds nothing. On their own they are usually **not** independent, because both depend on $x$.',
    tags: ['rules', 'mcq'],
  },
  {
    id: 'bayes-f-condind-why',
    front: 'Why does the Bayes filter need measurements to be conditionally independent given the state?',
    back: 'So that their likelihoods multiply: ${p(z_1, z_2 \\mid x) = p(z_1 \\mid x)\\,p(z_2 \\mid x)}$. Each new reading is then one more correction, with the previous posterior as the prior (the stated assumption in 2025 Q28).',
    tags: ['rules'],
  },
  {
    id: 'bayes-f-marginal',
    front: 'Marginalisation (total probability), and the two places the Bayes filter uses it?',
    back: '${P(x) = \\sum_y P(x \\mid y)\\,P(y)}$. The **prediction** sums over the previous states $x_{t-1}$; the **evidence** ${P(z) = \\sum_x P(z \\mid x)\\,P(x)}$ sums over the states (2024 Q28(b)).',
    tags: ['rules'],
  },
  // Bayes' rule terms
  {
    id: 'bayes-f-terms',
    front: 'The four terms of ${P(x \\mid z) = \\dfrac{P(z \\mid x)\\,P(x)}{P(z)}}$ in state estimation?',
    back: '$P(x \\mid z)$ **posterior**: the new belief. $P(z \\mid x)$ **likelihood**: the sensor model. $P(x)$ **prior**: the belief before the reading (the prediction). $P(z)$ **evidence**: the normaliser, $1/\\eta$ (review deck slide 4).',
    tags: ['terms'],
  },
  {
    id: 'bayes-f-likelihood-sum',
    front: 'Does the likelihood $P(z \\mid x)$ sum to 1 over the states $x$?',
    back: 'No. Each **row** of a sensor table (one true state) sums to 1 over the readings; a **column** (one reading, every state) need not: the banana column of the 2025 table sums to 0.9. That is why the products must be normalised.',
    tags: ['terms'],
  },
  {
    id: 'bayes-f-eta',
    front: 'What is $\\eta$, and why is it the same for every state?',
    back: '${\\eta = 1/P(z) = 1/\\sum_x p(z \\mid x)\\,\\overline{bel}(x)}$. It depends only on the reading actually observed, not on the state being evaluated, so it just rescales the products to sum to 1.',
    tags: ['terms'],
  },
  {
    id: 'bayes-f-column',
    front: 'Sensor: ${P(\\text{black} \\mid \\text{black}) = 0.83}$ and ${P(\\text{white} \\mid \\text{white}) = 0.90}$. The robot sees **white**. The likelihood for a black tile, and for a white tile?',
    back: 'Black tile: ${P(\\text{white} \\mid \\text{black}) = 1 - 0.83 = \\mathbf{0.17}}$. White tile: $\\mathbf{0.90}$. Take the column of the **observed** reading (2024 Q28(b)).',
    tags: ['terms', 'by-hand'],
  },
  {
    id: 'bayes-f-base-rate',
    front: 'A camera flags 95 % of damaged parts and 10 % of good ones; 2 % of parts are damaged. Is a flagged part 95 % likely to be damaged?',
    back: 'No: ${P(\\text{damaged} \\mid \\text{flag}) = \\dfrac{0.95(0.02)}{0.95(0.02) + 0.10(0.98)} = \\dfrac{0.019}{0.117} = 0.16}$. The likelihood is not the posterior; a rare state needs strong evidence.',
    tags: ['terms'],
  },
  // Markov
  {
    id: 'bayes-f-markov',
    front: 'State the Markov assumption (both halves).',
    back: 'The current state summarises all of the history: ${p(x_t \\mid x_{0:t-1}, z_{1:t-1}, u_{1:t}) = p(x_t \\mid x_{t-1}, u_t)}$ and ${p(z_t \\mid x_{0:t}, z_{1:t-1}, u_{1:t}) = p(z_t \\mid x_t)}$.',
    tags: ['markov'],
  },
  {
    id: 'bayes-f-markov-heat',
    front: 'Which breaks the Markov assumption: random wheel slip, random gusts, random sensor noise, or sensor noise that grows as the sensor heats up?',
    back: '**The heating sensor** (2023 Q2): its noise depends on how long it has been running, history that is not in the state. Random, memoryless noise is exactly what the filter’s models describe.',
    tags: ['markov', 'mcq'],
  },
  {
    id: 'bayes-f-markov-motor',
    front: 'Which breaks the Markov assumption: steering that randomly veers left or right, or a motor whose performance decays as it drives over bumpy terrain?',
    back: '**The decaying motor** (2024 Q2): the same command now moves the robot differently depending on how far it has driven. A random steering fault is still memoryless.',
    tags: ['markov', 'mcq'],
  },
  {
    id: 'bayes-f-markov-formula',
    front: 'Under the Markov assumption, $P(z_t \\mid x_t)$ equals which: $P(z_t)$, $P(z_t \\mid x_t, z_{t-1}, x_{t-1}, \\dots, x_0)$, or $P(z_t \\mid x_{t-1}, z_{t-1}, \\dots, x_0)$?',
    back: '$P(z_t \\mid x_t, z_{t-1}, x_{t-1}, \\dots, x_0)$ (2025 Q3): given the **current** state, the past adds nothing. Dropping $x_t$ itself is wrong.',
    tags: ['markov', 'mcq'],
  },
  {
    id: 'bayes-f-markov-fix',
    front: 'A sensor’s noise grows as it warms up. How do you restore the Markov assumption?',
    back: 'Add the missing quantity (sensor temperature, or time since switch-on) to the state and model how it evolves. The cost is a bigger state, so add what is needed and no more.',
    tags: ['markov'],
  },
  {
    id: 'bayes-f-recursive',
    front: 'Why does the Bayes filter need the Markov assumption?',
    back: 'To be **recursive**: with it, $bel(x_t)$ depends only on $bel(x_{t-1})$, $u_t$ and $z_t$, so the filter stores one belief instead of the whole history of states, actions and readings.',
    tags: ['markov', 'filter'],
  },
  // The filter
  {
    id: 'bayes-f-predict',
    front: 'Prediction step: the equation, the data it uses, and its effect on uncertainty?',
    back: '${\\overline{bel}(x_t) = \\int p(x_t \\mid u_t, x_{t-1})\\, bel(x_{t-1})\\, dx_{t-1}}$. It uses the **action** $u_t$ and the motion model. Uncertainty **grows**: actuation noise is added and no new information arrives (2025 Q21).',
    tags: ['filter'],
  },
  {
    id: 'bayes-f-correct',
    front: 'Correction step: the equation, the data it uses, and its effect on uncertainty?',
    back: '${bel(x_t) = \\eta\\, p(z_t \\mid x_t)\\, \\overline{bel}(x_t)}$. It uses the **measurement** $z_t$ and the sensor model. Uncertainty usually **shrinks**: states that disagree with the reading lose probability.',
    tags: ['filter'],
  },
  {
    id: 'bayes-f-surprise',
    front: 'Can one measurement make a discrete belief **more** uncertain?',
    back: 'Yes, if it contradicts a confident belief. In 2025 Q28 the apple detection moved the belief from 0.90 banana to almost 50/50 (entropy 0.54 → 1.09 bits). On average a reading reduces uncertainty, and a Kalman filter’s variance always shrinks in the correction.',
    tags: ['filter'],
  },
  {
    id: 'bayes-f-overlap',
    front: 'Two reasons to integrate multiple overlapping sensor readings (2024 Q22)?',
    back: '1. **Noise reduction:** independent errors partly cancel (two equal-variance readings halve the variance).\n2. **Robustness:** redundancy survives a failure, occlusion or outlier, and different sensors cover each other’s weaknesses (a camera in the dark, a lidar on glass).',
    tags: ['filter'],
  },
  {
    id: 'bayes-f-zero',
    front: 'A state has probability exactly 0 in the belief. Can a correction step bring it back?',
    back: 'No: ${0 \\times p(z \\mid x) = 0}$ whatever the reading. Only a prediction step can move probability into it. That is why a prior should never be exactly 0 or 1 unless the state is truly impossible or certain (the occupancy-grid version is 2025 Q22).',
    tags: ['filter'],
  },
  // By hand
  {
    id: 'bayes-f-contrib',
    front: 'By hand: two starting cells can both land in the same cell after the move. What do you do?',
    back: '**Add** the contributions: ${P(x_1) = \\sum_{x_0} p(x_1 \\mid u_1, x_0)\\,P(x_0)}$. Then check that the predicted belief sums to 1.',
    tags: ['by-hand'],
  },
  {
    id: 'bayes-f-colour',
    front: 'Grid world: does the colour of the tile the robot **starts** on matter in the prediction step?',
    back: 'No. The prediction uses only the motion model. Colours enter in the correction, through the likelihood of the reading taken after the move (2024 Q28(a)).',
    tags: ['by-hand'],
  },
  {
    id: 'bayes-f-order',
    front: 'A static object is observed twice. Does the order of the two readings change the final posterior?',
    back: 'No: ${P(x \\mid z_1, z_2) \\propto P(x)\\,p(z_1 \\mid x)\\,p(z_2 \\mid x)}$, and multiplication commutes. In 2025 Q28, B then A or A then B both give 0.4832 / 0.5034 / 0.0134.',
    tags: ['by-hand'],
  },
  {
    id: 'bayes-f-decide',
    front: 'How do you choose between two grippers from a belief over the fruit type?',
    back: 'For each gripper compute the expected success $\\sum_x P(\\text{success} \\mid x)\\,P(x)$ and pick the larger, not the gripper that suits the most likely fruit. 2025 Q28: suction 0.811 > pinch 0.743, although banana was (just) the most likely.',
    tags: ['decisions'],
  },
];
