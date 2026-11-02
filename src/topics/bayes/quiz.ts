// MCQs (original wording, cited to the past papers), method games and exam-style short answers for 'bayes'.
// Covers every probability / Bayes-filter MCQ of 2023–2025 (2023 Q1–Q3; 2024 Q1–Q3; 2025 Q1–Q3), the review deck
// conditional-independence question, every short answer on the topic (2023 Q21, Q24; 2024 Q21, Q22; 2025 Q21;
// 2025 Q28(b); review deck slide 4), plus originals whose products, sums and posteriors were recomputed by script.
// Trap ids 'bayes-*' are registered by solve/common.ts (registerTraps), which the topic index always loads.
import type { Game, MCQ, ShortAnswer } from '../../engine/types';

export const mcqs: MCQ[] = [
  // ------------------------------------------------------------------ belief and noise
  {
    id: 'bayes-q-belief-repr',
    style: 'most-correct',
    stem: 'In a probabilistic state estimation framework, the robot’s state is represented as:',
    options: [
      {
        text: 'a probability distribution over every possible state',
        correct: true,
        why: 'The belief $bel(x_t)$ gives every state a probability, so it keeps the best guess **and** how unsure the robot is, with several peaks if needed.',
      },
      {
        text: 'the mean of all the positions the robot might be in',
        correct: false,
        why: 'The mean is one number read off the belief. It loses the spread, and with two peaks it can land somewhere the robot cannot possibly be.',
      },
      {
        text: 'the single state with the highest likelihood so far',
        correct: false,
        why: 'The most likely state is also only a summary of the belief: it says nothing about confidence or about competing hypotheses.',
      },
      {
        text: 'a binary flag that says whether the robot is localised',
        correct: false,
        why: 'A yes/no flag says nothing about **where** the robot is. (Binary variables do appear in occupancy grids, but one per cell, held as a probability.)',
      },
    ],
    source: 'Recurring: 2023 Q1 (see also 2025 Q1)',
    difficulty: 1,
  },
  {
    id: 'bayes-q-noise-both',
    style: 'most-correct',
    stem: 'A probabilistic state estimation framework accounts for:',
    options: [
      {
        text: 'noise in the observation (sensor) data',
        correct: false,
        why: 'True, through the sensor model $p(z_t \\mid x_t)$, but only half the story: actuation noise is modelled as well.',
      },
      {
        text: 'noise in the system actuation (executing commands)',
        correct: false,
        why: 'True, through the motion model $p(x_t \\mid u_t, x_{t-1})$, but only half the story: sensor noise is modelled as well.',
      },
      {
        text: 'Neither (a) nor (b)',
        correct: false,
        why: 'Modelling noise is the whole point; an estimator that ignored both would be deterministic.',
      },
      {
        text: 'Both (a) and (b)',
        correct: true,
        why: 'The motion model captures actuation noise (the prediction spreads the belief) and the sensor model captures observation noise (the correction weights each state by how well it explains the reading).',
      },
    ],
    source: 'Recurring: 2024 Q1',
    fixedOrder: true,
    difficulty: 1,
  },
  {
    id: 'bayes-q-false-exact',
    style: 'incorrect',
    stem: 'About probabilistic state estimation frameworks (Bayes, Kalman and particle filters):',
    options: [
      {
        text: 'They model the noise in the robot’s actuation.',
        correct: false,
        why: 'True: the motion model $p(x_t \\mid u_t, x_{t-1})$ describes where a command may really take the robot.',
      },
      {
        text: 'They represent the state as a probability distribution.',
        correct: false,
        why: 'True: a histogram, a Gaussian or a set of particles, depending on the filter.',
      },
      {
        text: 'They model the effect of sensor noise.',
        correct: false,
        why: 'True: the sensor model $p(z_t \\mid x_t)$ says how likely each reading is in each state.',
      },
      {
        text: 'They recover the exact true state of the robot.',
        correct: true,
        why: 'This is the FALSE statement. The true state is never observed directly; the estimator only says how probable each state is, and with noisy sensors the belief never collapses to certainty.',
      },
    ],
    source: 'Recurring: 2025 Q1 (mirror of 2023 Q1, 2024 Q1)',
    trapId: 'read-the-stem',
    difficulty: 1,
  },

  // ------------------------------------------------------------------ Markov assumption
  {
    id: 'bayes-q-markov-heat',
    style: 'most-correct',
    stem: 'In which scenario is the Markov assumption NOT valid for a robot estimating its position?',
    options: [
      {
        text: 'A ground robot whose wheels slip now and then, at random',
        correct: false,
        why: 'Random slip is memoryless: each step’s slip is drawn afresh, so it belongs in the motion model and the assumption holds.',
      },
      {
        text: 'A ground robot whose rangefinder has random, zero-mean noise',
        correct: false,
        why: 'Random sensor noise with fixed statistics is exactly what $p(z_t \\mid x_t)$ models; nothing from the past is needed.',
      },
      {
        text: 'A drone tracking its 3D position through random wind gusts',
        correct: false,
        why: 'Independent random gusts are actuation noise. They spread the predicted belief but do not make the past matter.',
      },
      {
        text: 'A drone whose sensor gets noisier the longer it has been on',
        correct: true,
        why: 'The noise depends on how long the sensor has been running (it heats up), which is history not contained in the state $x_t$. So $p(z_t \\mid x_t)$ depends on the past and the assumption breaks. Adding the sensor temperature to the state would fix it.',
      },
    ],
    source: 'Recurring: 2023 Q2 (see also 2024 Q2)',
    trapId: 'markov',
    difficulty: 1,
  },
  {
    id: 'bayes-q-markov-motor',
    style: 'most-correct',
    stem: 'In which scenario would the Markov assumption be invalid?',
    options: [
      {
        text: 'A rover whose broken steering veers to the left or the right at random',
        correct: false,
        why: 'A fault, but a memoryless one: each veer is random with fixed odds, so the motion model can describe it. This was the tempting wrong option in 2024.',
      },
      {
        text: 'A drone estimating its 3D position in random wind gusts',
        correct: false,
        why: 'Random gusts are memoryless actuation noise: they spread the belief, but the past adds nothing.',
      },
      {
        text: 'A rover whose motor wears out as it drives over rough ground',
        correct: true,
        why: 'How worn the motor is depends on how far the rover has driven, which is not in the state. The same command then moves it differently depending on its history, so $p(x_t \\mid u_t, x_{t-1})$ is not enough and the assumption breaks.',
      },
      {
        text: 'A rover whose camera adds random noise to every image',
        correct: false,
        why: 'Random sensor noise with fixed statistics is memoryless; the sensor model handles it.',
      },
    ],
    source: 'Recurring: 2024 Q2 (see also 2023 Q2)',
    trapId: 'markov',
    difficulty: 1,
  },
  {
    id: 'bayes-q-markov-formula',
    style: 'correct',
    stem: 'For the measurement $z_t$ and the state $x_t$ at time $t$, which equation holds under the Markov assumption?',
    options: [
      {
        text: '$P(z_t \\mid x_t) = P(z_t)$',
        correct: false,
        why: 'That says the reading does not depend on the state at all: a useless sensor. Markov drops the past, not the present.',
      },
      {
        text: '${P(z_t \\mid x_t) = P(z_t, x_t)}$',
        correct: false,
        why: 'A conditional is not a joint: ${P(z_t, x_t) = P(z_t \\mid x_t)\\,P(x_t)}$, so this would need $P(x_t) = 1$.',
      },
      {
        text: '${P(z_t \\mid x_t) = P(z_t \\mid x_t, z_{t-1}, x_{t-1}, \\dots, x_0)}$',
        correct: true,
        why: 'Given the current state, the earlier states and readings add nothing: the measurement depends only on $x_t$. This is the measurement half of the Markov assumption.',
      },
      {
        text: '${P(z_t \\mid x_t) = P(z_t \\mid x_{t-1}, z_{t-1}, x_{t-2}, z_{t-2}, \\dots, x_0)}$',
        correct: false,
        why: 'The right-hand side has dropped the current state $x_t$, the one thing the reading does depend on.',
      },
    ],
    source: 'Recurring: 2025 Q3',
    difficulty: 2,
  },

  // ------------------------------------------------------------------ probability rules
  {
    id: 'bayes-q-indep-def',
    style: 'correct',
    stem: 'Two events satisfy $P(x, y) = P(x)\\,P(y)$.',
    options: [
      {
        text: '$x$ and $y$ are independent.',
        correct: true,
        why: 'This factorisation is the definition of independence. Equivalently $P(x \\mid y) = P(x)$: learning $y$ changes nothing about $x$.',
      },
      {
        text: '$x$ and $y$ are dependent.',
        correct: false,
        why: 'Dependent events have $P(x, y) \\neq P(x)\\,P(y)$: knowing one shifts the probability of the other.',
      },
      {
        text: '$P(x)$ can be worked out from $P(y)$.',
        correct: false,
        why: 'Independence means $y$ carries no information about $x$, so knowing $P(y)$ tells you nothing about $P(x)$.',
      },
      {
        text: '$P(y)$ can be worked out from $P(x)$.',
        correct: false,
        why: 'Same reason, the other way round: independent events say nothing about each other.',
      },
    ],
    source: 'Recurring: 2023 Q3 (see also 2025 Q2)',
    difficulty: 1,
  },
  {
    id: 'bayes-q-product-trap',
    style: 'incorrect',
    stem: '$x$ and $y$ are **dependent** events.',
    options: [
      {
        text: 'Learning the value of $y$ changes the probability of $x$.',
        correct: false,
        why: 'True: that is what dependent means, $P(x \\mid y) \\neq P(x)$. (The paper words it as “$P(x)$ can be inferred from $P(y)$” and counts it as true.)',
      },
      {
        text: 'Learning the value of $x$ changes the probability of $y$.',
        correct: false,
        why: 'True, by symmetry: if $P(x \\mid y) \\neq P(x)$ then $P(y \\mid x) \\neq P(y)$.',
      },
      {
        text: '${P(x, y) = P(x \\mid y)\\,P(x)}$',
        correct: true,
        why: 'This is the FALSE statement: the product rule is ${P(x, y) = P(x \\mid y)\\,P(y)}$. The second factor must be the variable you conditioned on.',
      },
      {
        text: '${P(x) = \\dfrac{P(x \\mid y)\\,P(y)}{P(y \\mid x)}}$',
        correct: false,
        why: 'True: Bayes’ rule rearranged. Write the product rule both ways, ${P(x \\mid y)P(y) = P(y \\mid x)P(x)}$, and divide by $P(y \\mid x)$.',
      },
    ],
    source: 'Recurring: 2024 Q3',
    trapId: 'bayes-product-rule',
    difficulty: 2,
  },
  {
    id: 'bayes-q-indep-true',
    style: 'correct',
    stem: '$x$ and $y$ are **independent** events.',
    options: [
      {
        text: 'Learning the value of $y$ changes the probability of $x$.',
        correct: false,
        why: 'False for independent events: $P(x \\mid y) = P(x)$. (The paper’s wording, “$P(x)$ can be inferred from $P(y)$”, is false here.)',
      },
      {
        text: 'Learning the value of $x$ changes the probability of $y$.',
        correct: false,
        why: 'False for the same reason: independence is symmetric.',
      },
      {
        text: '${P(x, y) = P(x \\mid y)\\,P(x)}$',
        correct: false,
        why: 'The wrong product rule from 2024 Q3. For independent events it would give $P(x)^2$, not $P(x)\\,P(y)$.',
      },
      {
        text: '$P(x, y) = P(x)\\,P(y)$',
        correct: true,
        why: 'The definition of independence: the joint factors into the marginals because $P(x \\mid y) = P(x)$.',
      },
    ],
    source: 'Recurring: 2025 Q2 (see also 2023 Q3, 2024 Q3)',
    difficulty: 1,
  },
  {
    id: 'bayes-q-condind',
    style: 'most-correct',
    stem: 'Two readings from a robot’s sensor satisfy ${P(z_1 \\mid x, z_0) = P(z_1 \\mid x)}$, where $x$ is the robot’s state. Then $z_0$ and $z_1$ are:',
    options: [
      {
        text: 'dependent',
        correct: false,
        why: 'Without knowing $x$ they usually are dependent (both reflect the same state), but the equation is about what happens once $x$ is known.',
      },
      {
        text: 'independent',
        correct: false,
        why: 'Independence would be $P(z_1 \\mid z_0) = P(z_1)$, with no $x$ involved. Two readings of the same state are not independent: a door seen once makes a door more likely next time.',
      },
      {
        text: 'conditionally independent given $x$',
        correct: true,
        why: 'Once the state is known, $z_0$ adds nothing about $z_1$, because each reading’s noise is drawn afresh. This is what lets the filter multiply one likelihood per reading.',
      },
      {
        text: 'mutually exclusive: they cannot both occur',
        correct: false,
        why: 'That would mean $P(z_0, z_1) = 0$; nothing in the equation says so.',
      },
    ],
    source: 'Review deck slide 4',
    difficulty: 2,
  },

  // ------------------------------------------------------------------ Bayes' rule terms
  {
    id: 'bayes-q-likelihood-term',
    style: 'most-correct',
    stem: 'A robot localises with Bayes’ rule, ${P(x \\mid z) = P(z \\mid x)\\,P(x) / P(z)}$. In this context $P(z \\mid x)$ is:',
    options: [
      {
        text: 'the sensor model: how likely the reading is in each state',
        correct: true,
        why: 'The likelihood comes from calibrating the sensor: put the robot in state $x$ and record how often it reports $z$. Evaluated at the observed $z$, it weights each state.',
      },
      {
        text: 'the belief over the states before this reading was taken into account',
        correct: false,
        why: 'That is the prior $P(x)$; in a filter, the predicted belief $\\overline{bel}(x_t)$.',
      },
      {
        text: 'the updated belief about the state after the reading',
        correct: false,
        why: 'That is the posterior $P(x \\mid z)$, the left-hand side.',
      },
      {
        text: 'the total probability of the reading, used to normalise',
        correct: false,
        why: 'That is the evidence ${P(z) = \\sum_x P(z \\mid x)\\,P(x) = 1/\\eta}$.',
      },
    ],
    source: 'Review deck slide 4; notes §1',
    difficulty: 1,
  },
  {
    id: 'bayes-q-evidence',
    style: 'correct',
    stem: 'In a discrete correction step, the evidence $P(z)$:',
    options: [
      {
        text: 'is the same for every state, so dividing by it only rescales',
        correct: true,
        why: '${P(z) = \\sum_x P(z \\mid x)\\,P(x)}$ depends only on the reading, not on the state being evaluated. It cannot change which state is most likely; it makes the posteriors sum to 1.',
      },
      {
        text: 'equals the sensor’s hit rate for the most likely state',
        correct: false,
        why: 'It is a weighted sum over **all** states, not one entry of the sensor table.',
      },
      {
        text: 'is always 1, because the sensor always returns some reading',
        correct: false,
        why: 'Summed over every possible reading, $\\sum_z P(z) = 1$. But $P(z)$ for the one reading observed is less than 1 (0.535 for “white” in 2024 Q28).',
      },
      {
        text: 'has to be computed before the prediction step is run',
        correct: false,
        why: 'It is weighted by the **predicted** belief, so it comes after the prediction: ${P(z) = \\sum_x p(z \\mid x)\\,\\overline{bel}(x)}$.',
      },
    ],
    source: 'Notes §1; 2024 Q28(b)',
    difficulty: 2,
  },

  // ------------------------------------------------------------------ the two steps
  {
    id: 'bayes-q-predict-grow',
    style: 'correct',
    stem: 'A robot with a sharp, single-peaked belief drives one metre forward on slippery wheels. No measurement arrives. After the prediction step, the belief:',
    options: [
      {
        text: 'shifts forward with the command and spreads out',
        correct: true,
        why: 'The motion model moves every state about a metre and smears it with the actuation noise. No new information arrives, so the uncertainty grows (2025 Q21).',
      },
      {
        text: 'shifts forward and becomes sharper, since the command is known',
        correct: false,
        why: 'Knowing the command gives the intended motion, not the actual one. The noise can only add uncertainty.',
      },
      {
        text: 'stays where it was until the next measurement arrives',
        correct: false,
        why: 'The prediction uses the action straight away; waiting would ignore what the robot knows about its own motion.',
      },
      {
        text: 'becomes uniform, because slip makes the position unknown',
        correct: false,
        why: 'Slip spreads the belief by about the size of the actuation noise, not across the whole map. The robot still knows roughly where it went.',
      },
    ],
    source: 'Recurring short answer: 2025 Q21; notes §1',
    difficulty: 1,
  },
  {
    id: 'bayes-q-steps-data',
    style: 'correct',
    stem: 'How does a Bayes filter use the actuation data and the sensor data?',
    options: [
      {
        text: 'Actuation drives the prediction (motion model); sensor data drives the correction (sensor model).',
        correct: true,
        why: 'The command moves the belief through $p(x_t \\mid u_t, x_{t-1})$; the reading reweights it by $p(z_t \\mid x_t)$, followed by normalisation.',
      },
      {
        text: 'Sensor data drives the prediction (sensor model) and actuation drives the correction (motion model).',
        correct: false,
        why: 'Swapped: a reading says nothing about where the robot will go next, and a command is not evidence about where it is.',
      },
      {
        text: 'Both feed the correction step; the prediction only copies the previous belief forward.',
        correct: false,
        why: 'The prediction is where the action is used: it moves and spreads the belief. Without it the robot’s motion would be ignored.',
      },
      {
        text: 'Actuation sets the initial belief once; sensor data then drives every later update.',
        correct: false,
        why: 'Every action is integrated, every step. The initial belief $bel(x_0)$ is chosen before any data (uniform if the start is unknown).',
      },
    ],
    source: 'Recurring short answer: 2023 Q21, 2024 Q21; review deck slide 4',
    difficulty: 1,
  },
  {
    id: 'bayes-q-overlap',
    style: 'correct',
    stem: 'Why is it often worth integrating several overlapping sensor readings of the same quantity?',
    options: [
      {
        text: 'Their independent errors partly cancel, so the fused estimate is less noisy.',
        correct: true,
        why: 'Multiplying independent likelihoods gives a narrower posterior: two equal-variance readings halve the variance. Redundancy (surviving a failed or occluded sensor) is the other standard reason (2024 Q22).',
      },
      {
        text: 'Fusing them removes the need for a motion model in the prediction step.',
        correct: false,
        why: 'The prediction still needs the motion model to account for how the robot moved between readings; more sensors only improve the correction.',
      },
      {
        text: 'Overlapping readings make each new measurement independent of the true state.',
        correct: false,
        why: 'A measurement that did not depend on the state would be useless. Readings are (ideally) conditionally independent **given** the state.',
      },
      {
        text: 'With enough sensors the belief collapses onto the exact true state.',
        correct: false,
        why: 'Noise never vanishes: the variance shrinks with each extra reading but stays above zero.',
      },
    ],
    source: 'Recurring short answer: 2024 Q22',
    difficulty: 1,
  },

  // ------------------------------------------------------------------ by-hand values
  {
    id: 'bayes-q-prediction-value',
    style: 'value',
    stem: 'A robot’s belief is $P(x_0 = 2) = 0.6$ and $P(x_0 = 3) = 0.4$. Told to move one cell right, it actually moves 0 cells (probability 0.2), 1 cell (0.7) or 2 cells (0.1). What is the predicted $\\overline{bel}(x_1 = 3)$?',
    options: [
      {
        text: '0.50',
        correct: true,
        why: 'Two arrows land in cell 3: from cell 2 moving one cell, $0.7 \\times 0.6 = 0.42$, and from cell 3 not moving, $0.2 \\times 0.4 = 0.08$. Contributions add: $0.42 + 0.08 = 0.50$. (Cells 2–5 get 0.12, 0.50, 0.34, 0.04, which sum to 1.)',
      },
      {
        text: '0.42',
        correct: false,
        why: 'Only the arrow from cell 2. The robot that was already in cell 3 and failed to move also ends there: add $0.2 \\times 0.4 = 0.08$.',
      },
      {
        text: '0.70',
        correct: false,
        why: 'That is the probability of moving exactly one cell, not a belief: it must be multiplied by where the robot started.',
      },
      {
        text: '0.34',
        correct: false,
        why: 'That is cell 4: ${0.1 \\times 0.6 + 0.7 \\times 0.4 = 0.34}$. Check which arrows end in cell 3.',
      },
    ],
    source: 'Similar to 2024 Q28(a)',
    trapId: 'contributions-add',
    difficulty: 2,
  },
  {
    id: 'bayes-q-likelihood-value',
    style: 'value',
    stem: 'A downward camera reports the tile colour with ${P(\\text{black} \\mid \\text{black tile}) = 0.85}$ and ${P(\\text{white} \\mid \\text{white tile}) = 0.92}$. It reports **white**. Which likelihoods go in the correction table for a black tile and for a white tile?',
    options: [
      {
        text: 'black tile 0.15, white tile 0.92',
        correct: true,
        why: 'Use the column of the observed reading: ${P(\\text{white} \\mid \\text{black}) = 1 - 0.85 = 0.15}$ and ${P(\\text{white} \\mid \\text{white}) = 0.92}$.',
      },
      {
        text: 'black tile 0.85, white tile 0.92',
        correct: false,
        why: '0.85 is the chance of reading **black** on a black tile, but the reading was white.',
      },
      {
        text: 'black tile 0.15, white tile 0.08',
        correct: false,
        why: '0.08 is $P(\\text{black} \\mid \\text{white})$, a misreading on a white tile. The reading was white, so a white tile gets 0.92.',
      },
      {
        text: 'black tile 0.08, white tile 0.92',
        correct: false,
        why: '0.08 is a white tile’s error rate. Each row of the sensor table sums to 1, so a black tile reads white with probability $1 - 0.85 = 0.15$.',
      },
    ],
    source: 'Similar to 2024 Q28(b)',
    trapId: 'likelihood-column',
    difficulty: 1,
  },
  {
    id: 'bayes-q-pz-value',
    style: 'value',
    stem: 'A robot in a corridor has predicted belief 0.2, 0.5 and 0.3 for cells 3, 4 and 5 (zero elsewhere). Cells 3 and 5 have doors and cell 4 is plain wall. Its detector says “door” with probability 0.8 at a door and 0.1 at a wall. It reports **door**. What is $P(z = \\text{door})$?',
    options: [
      {
        text: '0.45',
        correct: true,
        why: '${P(z) = \\sum_x P(\\text{door} \\mid x)\\,\\overline{bel}(x)}$ ${= {0.8(0.2) + 0.1(0.5) + 0.8(0.3)}}$ ${= {0.16 + 0.05 + 0.24} = 0.45}$.',
      },
      {
        text: '0.85',
        correct: false,
        why: 'That uses 0.9 for the wall cell, which is $P(\\text{no door} \\mid \\text{wall})$. The reading was “door”, so the wall’s likelihood is 0.1.',
      },
      {
        text: '0.40',
        correct: false,
        why: 'That drops the wall cell. It still contributes $0.1 \\times 0.5 = 0.05$: detectors give false alarms.',
      },
      {
        text: '0.57',
        correct: false,
        why: 'That averages the three likelihoods, $(0.8 + 0.1 + 0.8)/3$. Each one must be weighted by the predicted belief of its cell.',
      },
    ],
    source: 'Similar to 2024 Q28(b)',
    trapId: 'likelihood-column',
    difficulty: 2,
  },
  {
    id: 'bayes-q-posterior-value',
    style: 'value',
    stem: 'Same corridor: predicted belief 0.2, 0.5, 0.3 for cells 3, 4, 5; doors at 3 and 5; ${P(\\text{door} \\mid \\text{door}) = 0.8}$ and ${P(\\text{door} \\mid \\text{wall}) = 0.1}$. After the reading **door**, what is the posterior probability of cell 5?',
    options: [
      {
        text: '0.533',
        correct: true,
        why: 'Product $0.8 \\times 0.3 = 0.24$, divided by $P(z) = 0.45$: $0.24 / 0.45 = 0.533$. (Cell 3 gets 0.356 and cell 4 gets 0.111; the three sum to 1.)',
      },
      {
        text: '0.24',
        correct: false,
        why: 'That is the unnormalised product. Divide by $P(z) = 0.45$ so that the posteriors sum to 1.',
      },
      {
        text: '0.80',
        correct: false,
        why: 'That is the likelihood $P(\\text{door} \\mid \\text{door})$, not the posterior: it ignores the prior and the other door.',
      },
      {
        text: '0.282',
        correct: false,
        why: 'That divides by 0.85, the evidence computed with the wrong wall likelihood (0.9 instead of 0.1).',
      },
    ],
    source: 'Similar to 2024 Q28(c)',
    trapId: 'normalise',
    difficulty: 2,
  },
  {
    id: 'bayes-q-base-rate',
    style: 'value',
    stem: 'A pick-and-place cell’s camera flags 95 % of damaged parts and also flags 10 % of good parts. 2 % of parts are damaged. A part is flagged. What is the probability that it is damaged?',
    options: [
      {
        text: '0.16',
        correct: true,
        why: '${\\dfrac{0.95(0.02)}{0.95(0.02) + 0.10(0.98)} = \\dfrac{0.019}{0.117} = 0.16}$. Damaged parts are so rare that most flags are false alarms on the many good parts.',
      },
      {
        text: '0.95',
        correct: false,
        why: 'That is the likelihood $P(\\text{flag} \\mid \\text{damaged})$. Bayes’ rule needs the prior too.',
      },
      {
        text: '0.019',
        correct: false,
        why: 'That is the unnormalised product; divide by $P(\\text{flag}) = 0.117$.',
      },
      {
        text: '0.90',
        correct: false,
        why: 'That is the chance that a **good** part is not flagged, $1 - 0.10$; it is not a posterior.',
      },
    ],
    source: 'Original; notes §1 (Bayes’ rule)',
    trapId: 'bayes-inverse',
    difficulty: 2,
  },

  // ------------------------------------------------------------------ several readings and decisions
  {
    id: 'bayes-q-order',
    style: 'correct',
    stem: 'A fruit sits still under a camera while two frames are classified: first “banana”, then “apple”. Compared with processing the same two frames in the opposite order, the final belief is:',
    options: [
      {
        text: 'the same, because the two likelihoods simply multiply',
        correct: true,
        why: 'With the frames conditionally independent given the fruit, ${P(x \\mid z_1, z_2) \\propto P(x)\\,p(z_1 \\mid x)\\,p(z_2 \\mid x)}$, and multiplication commutes. 2025 Q28 gives 0.4832 / 0.5034 / 0.0134 either way.',
      },
      {
        text: 'different: the most recent frame always dominates the belief',
        correct: false,
        why: 'A static Bayes update has no recency weighting: each frame counts once, through its likelihood.',
      },
      {
        text: 'different: the first frame sets the prior, so it dominates',
        correct: false,
        why: 'The first frame’s posterior does become the next prior, but the final result is the same product either way.',
      },
      {
        text: 'the same only if both frames report the same class of fruit',
        correct: false,
        why: 'Order never matters for a static state, whatever the readings are.',
      },
    ],
    source: 'Similar to 2025 Q28(a); notes §1',
    difficulty: 2,
  },
  {
    id: 'bayes-q-gripper',
    style: 'best',
    stem: 'A parcel robot believes the item under its camera is a box (0.3), a bag (0.6) or nothing (0.1). A vacuum gripper picks boxes with probability 0.95 and bags 0.75; a finger gripper picks boxes 0.55 and bags 0.90. Nothing can be picked if no item is there. Which gripper should it use, and what is its probability of success?',
    options: [
      {
        text: 'Vacuum, 0.735',
        correct: true,
        why: 'Vacuum: ${0.95(0.3) + 0.75(0.6) = 0.285 + 0.45 = 0.735}$. Fingers: ${0.55(0.3) + 0.90(0.6) = 0.165 + 0.54 = 0.705}$. The vacuum’s big lead on boxes outweighs its smaller deficit on bags.',
      },
      {
        text: 'Fingers, 0.90',
        correct: false,
        why: 'That chooses for the most likely item (a bag) and quotes its rate. The decision must weigh every state: the fingers give 0.705 overall.',
      },
      {
        text: 'Fingers, 0.705',
        correct: false,
        why: 'The right expected value for the fingers, but the vacuum’s 0.735 is higher.',
      },
      {
        text: 'Vacuum, 0.817',
        correct: false,
        why: '$0.735 / 0.9$ is the success rate **given that an item is there**. With a 0.1 chance of nothing, the overall success is 0.735.',
      },
    ],
    source: 'Similar to 2025 Q28(b)–(c)',
    trapId: 'bayes-decision',
    difficulty: 2,
  },
];

export const games: Game[] = [
  {
    kind: 'sort',
    id: 'bayes-g-markov',
    title: 'Does it break the Markov assumption?',
    prompt: 'The state is the robot’s pose (or, for the classifier, the fruit type). Does each situation **break** the Markov assumption, because something that matters depends on history not held in the state? Or is it **fine**, because it is random, memoryless noise that the motion and sensor models absorb?',
    buckets: [
      { id: 'breaks', label: 'Breaks it: history matters' },
      { id: 'fine', label: 'Fine: memoryless noise' },
    ],
    items: [
      { id: 'm1', text: 'A drone’s altimeter gets noisier the longer it has been switched on, as it warms up', bucket: 'breaks', why: 'The noise depends on elapsed time, which the state does not hold (2023 Q2). Adding the temperature to the state would fix it.' },
      { id: 'm2', text: 'A rover’s motor delivers less torque the further it has driven over rough ground', bucket: 'breaks', why: 'The same command moves the rover less as wear builds up: the motion depends on the distance driven so far (2024 Q2).' },
      { id: 'm3', text: 'The battery sags during the mission, so each command moves the robot a little less than the last', bucket: 'breaks', why: 'Battery charge is history not in the state, so $p(x_t \\mid u_t, x_{t-1})$ changes with how long the robot has been running.' },
      { id: 'm4', text: 'The state is position only, but the robot coasts: how far it moves depends on how fast it was already going', bucket: 'breaks', why: 'Velocity is missing from the state, so earlier positions carry information the current one does not. Add velocity to the state.' },
      { id: 'm5', text: 'Visitors crowd round a museum robot for minutes at a time, blocking its laser; they are not in its map', bucket: 'breaks', why: 'People who stay put for many steps make each reading depend on earlier ones (someone seen a moment ago is probably still there), and they are not part of the state.' },
      { id: 'f1', text: 'The wheels slip now and then, at random', bucket: 'fine', why: 'Each slip is drawn afresh: memoryless actuation noise, captured by the motion model (2023 Q2).' },
      { id: 'f2', text: 'A drone is pushed about by random wind gusts', bucket: 'fine', why: 'Independent random gusts are actuation noise; the past adds nothing (2023 Q2, 2024 Q2).' },
      { id: 'f3', text: 'A broken steering linkage makes the rover veer left or right at random', bucket: 'fine', why: 'A fault, but a memoryless one: each veer is random with fixed odds (2024 Q2), so the motion model can describe it.' },
      { id: 'f4', text: 'A rangefinder adds zero-mean noise with the same spread to every reading', bucket: 'fine', why: 'Noise with fixed statistics is exactly what $p(z_t \\mid x_t)$ models.' },
      { id: 'f5', text: 'A fruit classifier calls a banana an apple 5 % of the time, independently in every frame', bucket: 'fine', why: 'A fixed confusion table with independent errors: the readings are conditionally independent given the fruit (2025 Q28).' },
    ],
    source: 'Notes §1; 2023 Q2, 2024 Q2',
  },
  {
    kind: 'match',
    id: 'bayes-g-terms',
    title: 'Bayes’ rule: term to meaning',
    prompt: 'In state estimation $x$ is the state and $z$ the measurement. Match each term to what it represents (review deck slide 4).',
    pairs: [
      { id: 't1', left: '$P(x \\mid z)$', right: 'Posterior: the new belief after the reading', why: 'The left-hand side of Bayes’ rule, $bel(x_t)$ in the filter; it becomes the next prior.' },
      { id: 't2', left: '$P(z \\mid x)$', right: 'Likelihood: the sensor model', why: 'How probable the observed reading is in each state, from the sensor’s calibration: the column of that reading in the sensor table.' },
      { id: 't3', left: '$P(x)$', right: 'Prior: the belief before the reading', why: 'In a filter this is the predicted belief $\\overline{bel}(x_t)$ from the motion step.' },
      { id: 't4', left: '$P(z)$', right: 'Evidence: the total probability of the reading', why: '$\\sum_x P(z \\mid x)\\,P(x)$, the sum of the product column; the same for every state.' },
      { id: 't5', left: '$\\eta$', right: 'Normaliser: makes the belief sum to 1', why: '$\\eta = 1/P(z)$: multiplying by it is the same as dividing the products by their sum.' },
      { id: 't6', left: '$p(x_t \\mid u_t, x_{t-1})$', right: 'Motion model, used in the prediction step', why: 'Where the command $u_t$ may take the robot from each previous state; its noise makes the prediction spread.' },
    ],
    source: 'Notes §1; review deck slide 4',
  },
  {
    kind: 'sort',
    id: 'bayes-g-steps',
    title: 'Prediction step or correction step?',
    prompt: 'Each time step of a Bayes filter has a **prediction** (the action $u_t$ and the motion model) and a **correction** (the reading $z_t$ and the sensor model). Sort each item into the step where it happens.',
    buckets: [
      { id: 'predict', label: 'Prediction (action, motion model)' },
      { id: 'correct', label: 'Correction (reading, sensor model)' },
    ],
    items: [
      { id: 's1', text: '${\\overline{bel}(x_t) = \\int p(x_t \\mid u_t, x_{t-1})\\, bel(x_{t-1})\\, dx_{t-1}}$', bucket: 'predict', why: 'The prediction equation: a total-probability sum over every previous state.' },
      { id: 's2', text: '${bel(x_t) = \\eta\\, p(z_t \\mid x_t)\\, \\overline{bel}(x_t)}$', bucket: 'correct', why: 'The correction equation: likelihood times prediction, normalised.' },
      { id: 's3', text: 'The belief spreads out: uncertainty grows', bucket: 'predict', why: 'Actuation noise is added and no information arrives (2025 Q21).' },
      { id: 's4', text: 'States that disagree with the reading lose probability, so uncertainty usually shrinks', bucket: 'correct', why: 'The likelihood reweights the states and the normaliser rescales the survivors.' },
      { id: 's5', text: 'Two start cells can land in the same cell, so their contributions are added', bucket: 'predict', why: 'Adding the arrows into a cell is the discrete form of the prediction integral (2024 Q28(a)).' },
      { id: 's6', text: 'Every product is divided by ${P(z) = \\sum_x p(z \\mid x)\\,\\overline{bel}(x)}$', bucket: 'correct', why: 'Normalising with $\\eta = 1/P(z)$ belongs to the correction (2024 Q28(b)–(c)).' },
      { id: 's7', text: 'The colour of the tile the robot is on now matters', bucket: 'correct', why: 'Colour enters only through the likelihood of the camera reading; the prediction ignores it.' },
      { id: 's8', text: 'Kalman filter: ${\\bar\\Sigma_t = A\\Sigma_{t-1}A^T + R}$', bucket: 'predict', why: 'The KF prediction adds the actuation noise covariance $R$, so the covariance grows.' },
      { id: 's9', text: 'Kalman filter: the gain ${K_t = \\bar\\Sigma_t C^T (C\\bar\\Sigma_t C^T + Q)^{-1}}$ is applied', bucket: 'correct', why: 'The KF correction blends the prediction with the measurement; $Q$ is the sensor noise covariance.' },
      { id: 's10', text: 'Particle filter: every particle is moved through the motion model with sampled noise', bucket: 'predict', why: 'Sampling from $p(x_t \\mid u_t, x_{t-1})$ is the particle filter’s prediction.' },
      { id: 's11', text: 'Particle filter: each particle is weighted by $p(z_t \\mid x_t)$', bucket: 'correct', why: 'The importance weights are the likelihood of the reading (2023 Q5); resampling follows.' },
      { id: 's12', text: 'The wheel-encoder odometry or the velocity command is used', bucket: 'predict', why: 'Odometry and commands are actuation data $u_t$, fed through the motion model.' },
    ],
    source: 'Notes §1–2; 2023 Q21, 2024 Q21, 2025 Q21',
  },
];

export const shortAnswers: ShortAnswer[] = [
  {
    id: 'bayes-sa-sensor-actuation',
    prompt: '**(2 marks)** In no more than 80 words: explain how sensor data and actuation data are used for state estimation in a Bayes filter.',
    wordLimit: 80,
    model: 'A Bayes filter alternates two steps. **Prediction** uses the actuation data $u_t$: the previous belief is pushed through the motion model, ${\\overline{bel}(x_t) = \\int p(x_t \\mid u_t, x_{t-1})\\,bel(x_{t-1})\\,dx_{t-1}}$, so it moves with the command and spreads because of actuation noise (uncertainty grows). **Correction** uses the sensor data $z_t$: the prediction is weighted by the measurement likelihood and normalised, ${bel(x_t) = \\eta\\,p(z_t \\mid x_t)\\,\\overline{bel}(x_t)}$, so states consistent with the reading gain probability (uncertainty shrinks).',
    keyPoints: [
      'prediction uses the actuation data $u_t$ through the motion model $p(x_t \\mid u_t, x_{t-1})$',
      'correction uses the sensor data $z_t$ through the sensor model (likelihood) $p(z_t \\mid x_t)$',
      'prediction spreads the belief: uncertainty grows',
      'correction reweights and normalises ($\\eta$): uncertainty shrinks',
    ],
    source: '2023 Q21',
    marks: 2,
  },
  {
    id: 'bayes-sa-two-steps',
    prompt: '**(2 marks)** In no more than 80 words: describe the two data integration steps of a Bayes filter. (The review deck asks the same thing as “What are the two key steps of Bayes filtering?”)',
    wordLimit: 80,
    model: '1. **Prediction (control update):** integrate the action $u_t$ through the motion model, summing over every previous state: ${\\overline{bel}(x_t) = \\int p(x_t \\mid u_t, x_{t-1})\\,bel(x_{t-1})\\,dx_{t-1}}$. Actuation noise is added, so uncertainty grows.\n2. **Correction (measurement update):** integrate the observation $z_t$ through the sensor model with Bayes’ rule, ${bel(x_t) = \\eta\\,p(z_t \\mid x_t)\\,\\overline{bel}(x_t)}$, where $\\eta$ normalises. Uncertainty shrinks, and the result is the prior for the next step.',
    keyPoints: [
      'names both steps: prediction (control update) and correction (measurement update)',
      'prediction: motion model, summed or integrated over $x_{t-1}$',
      'correction: likelihood × predicted belief, normalised by $\\eta$ (Bayes’ rule)',
      'uncertainty grows in the prediction and shrinks in the correction',
    ],
    source: '2024 Q21; review deck slide 4',
    marks: 2,
  },
  {
    id: 'bayes-sa-control',
    prompt: '**(2 marks)** In no more than 70 words: explain how a Bayes filter incorporates the effect of a control action on the state estimate. Does the uncertainty of the estimate grow or shrink?',
    wordLimit: 70,
    model: 'Through the **prediction** step: the previous belief is pushed through the probabilistic motion model, ${\\overline{bel}(x_t) = \\int p(x_t \\mid u_t, x_{t-1})\\,bel(x_{t-1})\\,dx_{t-1}}$. Every possible previous state is moved by the action and blurred by the actuation noise, and the contributions are summed. The uncertainty **grows**: moving brings no new information, it only adds noise (in a Kalman filter, ${\\bar\\Sigma_t = A\\Sigma_{t-1}A^T + R}$).',
    keyPoints: [
      'through the prediction step',
      'motion model $p(x_t \\mid u_t, x_{t-1})$ applied to every previous state and summed (integrated)',
      'actuation noise blurs the belief',
      'uncertainty grows, because no new information arrives',
    ],
    source: '2025 Q21',
    marks: 2,
  },
  {
    id: 'bayes-sa-overlap',
    prompt: '**(2 marks)** In no more than 70 words: give two reasons why it is often beneficial in robot state estimation to integrate multiple overlapping sensor readings.',
    wordLimit: 70,
    model: '1. **Noise reduction:** readings with independent errors partly cancel when fused (their likelihoods multiply), so the estimate is more precise; two equal-variance readings halve the variance.\n2. **Robustness and redundancy:** if one sensor fails, is occluded or returns an outlier, the others still constrain the state, and disagreement exposes the fault. Different sensor types also cover each other’s weaknesses (a camera in darkness, a lidar on glass).',
    keyPoints: [
      'noise reduction: independent errors average out (likelihoods multiply)',
      'e.g. two equal-variance readings halve the variance',
      'robustness: redundancy against a failed, occluded or outlying sensor',
      'complementary sensors cover each other’s weaknesses',
    ],
    source: '2024 Q22',
    marks: 2,
  },
  {
    id: 'bayes-sa-car',
    prompt: '**(2 marks)** In no more than 80 words: describe two sources of uncertainty that may impact a self-driving car’s ability to localise itself within a pre-built map of a city.',
    wordLimit: 80,
    model: '1. **Sensor noise and degradation:** GPS suffers multipath between tall buildings, and rain, fog or glare corrupt lidar and camera readings, so the sensor model is broad or wrong.\n2. **Map mismatch:** the map is out of date (roadworks, parked cars, seasonal change) and the scene contains moving cars and pedestrians, so observations do not match what the map predicts.\n\nAlso accepted: wheel slip and odometry drift in the prediction; perceptual aliasing, where different streets look alike.',
    keyPoints: [
      'two distinct sources, each described with an example',
      'sensor noise or degradation (GPS multipath, weather on the lidar or camera)',
      'map mismatch or dynamic objects (outdated map, cars, pedestrians)',
      'or motion uncertainty (wheel slip, odometry drift) or perceptual aliasing',
      'says how each one affects localisation',
    ],
    source: '2023 Q24',
    marks: 2,
  },
  {
    id: 'bayes-sa-terms',
    prompt: '**(2 marks)** Bayes’ rule is written ${P(x \\mid y) = \\dfrac{P(y \\mid x)\\,P(x)}{P(y)}}$. In no more than 80 words: what does each of the four terms represent in a recursive state estimation context?',
    wordLimit: 80,
    model: 'With $x$ the state and $y$ the measurement: $P(x \\mid y)$ is the **posterior**, the updated belief after the measurement. $P(y \\mid x)$ is the **likelihood**, the sensor model: how probable this measurement is in each state. $P(x)$ is the **prior**, the belief before the measurement (the prediction from the motion step). $P(y)$ is the **evidence**, the total probability of the measurement, $\\sum_x P(y \\mid x)P(x)$, which normalises the posterior ($\\eta = 1/P(y)$). Each posterior becomes the next prior.',
    keyPoints: [
      'posterior: the updated belief after the measurement',
      'likelihood: the sensor model, the probability of the reading in each state',
      'prior: the belief before the measurement (the prediction)',
      'evidence: the total probability of the reading, the normaliser $1/\\eta$',
      'recursive: the posterior becomes the next prior',
    ],
    source: 'Review deck slide 4',
    marks: 2,
  },
  {
    id: 'bayes-sa-condind',
    prompt: '**(2 marks)** In no more than 60 words: if ${P(z_1 \\mid x, z_0) = P(z_1 \\mid x)}$, how are the measurements $z_0$ and $z_1$ related? Why does a Bayes filter rely on this?',
    wordLimit: 60,
    model: '$z_0$ and $z_1$ are **conditionally independent given the state $x$**: once $x$ is known, the earlier reading adds nothing about the next (they are generally not independent, since both depend on $x$). The filter relies on it so that likelihoods multiply, ${p(z_0, z_1 \\mid x) = p(z_0 \\mid x)\\,p(z_1 \\mid x)}$: each new reading is one more correction, with the previous posterior as the prior.',
    keyPoints: [
      'conditionally independent given $x$',
      'not unconditionally independent: both depend on $x$',
      'their likelihoods multiply',
      'so each reading is a separate correction (a recursive update)',
    ],
    source: 'Review deck slide 4',
    marks: 2,
  },
  {
    id: 'bayes-sa-gripper',
    prompt: '**(2 marks)** After two camera frames, a fruit-packing robot believes $P(A) = 0.483$ (apple), $P(B) = 0.503$ (banana) and $P(N) = 0.013$ (no fruit). A suction gripper succeeds on 95 % of apples and 70 % of bananas; a pinch gripper on 60 % of apples and 90 % of bananas. In no more than 60 words: which gripper should it use, and why?',
    wordLimit: 60,
    model: 'Compare the expected success over the belief: suction ${= 0.95(0.483) + 0.70(0.503) = 0.811}$; pinch ${= 0.60(0.483) + 0.90(0.503) = 0.743}$. Use **suction**. Banana is only marginally more likely, so the belief is nearly 50/50; suction is excellent on apples and still reasonable on bananas, while pinch is poor on apples.',
    keyPoints: [
      'expected success ${= \\sum_x P(\\text{success} \\mid x)\\,P(x)}$ for each gripper',
      'suction 0.811',
      'pinch 0.743',
      'suction, because the belief is nearly 50/50 and pinch is weak on apples (not “banana is most likely”)',
    ],
    source: '2025 Q28(b)',
    marks: 2,
  },
  {
    id: 'bayes-sa-markov',
    prompt: '**(2 marks)** A delivery drone estimates its altitude with a barometer whose readings drift more and more as the barometer warms up during the flight. In no more than 70 words: explain why this violates the Markov assumption, and how the estimator could be fixed.',
    wordLimit: 70,
    model: 'The Markov assumption requires each reading to depend only on the current state, $p(z_t \\mid x_t)$. Here the error depends on how long the barometer has been running, history that the state (altitude) does not contain, so past readings carry information the state lacks. Random, memoryless noise would have been fine. Fix: add the sensor temperature (or bias) to the state and model how it evolves.',
    keyPoints: [
      'Markov: the reading depends only on the current state, which summarises the history',
      'the drift depends on elapsed time or temperature: history not in the state',
      'random, memoryless noise would not break it',
      'fix: add temperature or bias to the state and model its evolution',
    ],
    source: 'Similar to 2023 Q2 and 2024 Q2, asked as a short answer',
    marks: 2,
  },
  {
    id: 'bayes-sa-belief',
    prompt: '**(2 marks)** In no more than 70 words: why does a probabilistic robot keep a belief (a distribution over states) instead of a single best estimate of its state?',
    wordLimit: 70,
    model: 'Actuation and sensing are noisy, so the true state is never known exactly. A belief records both the best guess and how uncertain it is, and it can hold several hypotheses at once (two identical doorways give two peaks) until a measurement separates them. The uncertainty is needed to weigh each new reading correctly and to decide well, e.g. choosing the action with the highest expected success.',
    keyPoints: [
      'noise in actuation and sensing: the true state is never known exactly',
      'a belief keeps the uncertainty, not only a best guess',
      'it can represent several hypotheses (multimodal)',
      'needed to weigh new readings and to make expected-value decisions',
    ],
    source: 'Similar to 2023 Q1, 2024 Q1, 2025 Q1, asked as a short answer; review deck slide 3',
    marks: 2,
  },
];
