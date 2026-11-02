// Concept cards and flashcards for 'models' (summary notes §3; 2023 Q6, Q32(a, b); 2024 Q6; 2025 Q6; review deck
// slides 5–7: learning outcomes, the velocity model over one timestep, the beam model's parts, the worked velocity
// example). Card ids are fixed: sims, generators and Home link to them.
import type { ConceptCard, Flashcard } from '../../engine/types';

export const cards: ConceptCard[] = [
  // ------------------------------------------------------------------ role in the Bayes filter
  {
    id: 'models-role',
    title: 'Motion and sensor models in the Bayes filter',
    lecture: 'Notes §3 (and §1); review deck slide 5',
    formulas: [
      '$$\\overline{bel}(x_t) = \\int p(x_t \\mid u_t, x_{t-1})\\, bel(x_{t-1})\\, dx_{t-1} \\qquad \\text{(prediction: motion model)}$$',
      '$$bel(x_t) = \\eta\\, p(z_t \\mid x_t)\\, \\overline{bel}(x_t) \\qquad \\text{(correction: sensor model)}$$',
      '$$\\begin{array}{l|l|l} & \\text{motion model} & \\text{sensor model} \\\\ \\hline \\text{form} & p(x_t \\mid u_t, x_{t-1}) & p(z_t \\mid x_t) \\text{ or } p(z_t \\mid x_t, m) \\\\ \\text{input} & \\text{control or odometry } u_t & \\text{measurement } z_t \\\\ \\text{filter step} & \\text{prediction: uncertainty grows} & \\text{correction: uncertainty shrinks} \\\\ \\text{Kalman filter} & A,\\ B \\text{ with noise } R & C \\text{ with noise } Q \\\\ \\text{particle filter} & \\text{sampled to move each particle} & \\text{weight } w = p(z_t \\mid x_t) \\\\ \\text{examples} & \\text{velocity, odometry} & \\text{beam, likelihood field, landmark} \\end{array}$$',
    ],
    what: 'A **motion model** $p(x_t \\mid u_t, x_{t-1})$ is the probability of ending in state $x_t$ when control $u_t$ is applied in state $x_{t-1}$: what actuation does, noise included. A **sensor model** (measurement model) $p(z_t \\mid x_t)$ is the probability of getting reading $z_t$ if the robot is in state $x_t$ (with a map $m$, $p(z_t \\mid x_t, m)$). The Bayes filter needs both. The motion model pushes the belief forward in the **prediction** step, where actuation noise makes it spread out; the sensor model scores every state against the reading in the **correction** step, where the belief sharpens. Both are probability distributions rather than functions because wheels slip and sensors are noisy: a deterministic model would claim a certainty the robot does not have.',
    when: '- “Which of the following is TRUE of a velocity (or odometry) motion model?”, with a distractor about the measurement step (2024 Q6 (a), 2025 Q6 (c)).\n- “Explain how sensor data and actuation data are used for state estimation in a Bayes filter” (2023 Q21), and “does the uncertainty grow or shrink?” (2025 Q21).\n- “In a particle filter, each particle’s weight is computed according to …” (2023 Q5: the sensor likelihood).\n- “Describe how to sample from / compute the posterior probability using the velocity or odometry motion model” (review deck slide 5, learning outcome).',
    how: [
      'Sort the data first: commands and wheel-encoder odometry are **actuation** data $u_t$; ranges, images and landmark sightings are **measurements** $z_t$.',
      'Actuation goes through the motion model in the **prediction** step, $\\overline{bel}(x_t) = \\int p(x_t \\mid u_t, x_{t-1})\\, bel(x_{t-1})\\, dx_{t-1}$. Say that the belief spreads: actuation noise is added and nothing new is learned.',
      'Measurements go through the sensor model in the **correction** step, $bel(x_t) = \\eta\\, p(z_t \\mid x_t)\\, \\overline{bel}(x_t)$. Say that the belief sharpens round the states that explain the reading, and that $\\eta$ makes it sum to 1.',
      'Name how each filter uses the pair: a grid (histogram) filter **evaluates** both for every cell; a particle filter **samples** the motion model to move each particle and **evaluates** the sensor model for its weight; a Kalman filter has them as the linear $A, B$ with noise $R$ and $C$ with noise $Q$.',
      'To **sample** a motion model (what a particle filter needs): perturb the control with zero-mean noise whose spread grows with the size of the motion (the $\\alpha$ parameters), then push the pose through the noise-free formula.',
      'To **evaluate** $p(x_t \\mid u_t, x_{t-1})$ for a given pair of poses (what a grid filter needs): work out the control that would have produced that motion and score its difference from the actual control under the same noise.',
    ],
    traps: [
      {
        title: 'Odometry is a measurement, so it belongs in the correction step',
        detail: 'Wheel-encoder odometry comes from a sensor, but the filter treats it as the control $u_t$: it goes through the odometry **motion** model in the prediction step. Only exteroceptive readings (lidar, camera, landmarks) go through a sensor model.',
        source: '2025 Q6 (c); 2024 Q6 (a)',
      },
      {
        title: 'Prediction makes the belief sharper',
        detail: 'The motion model only adds actuation noise and brings in no new information, so the belief always spreads in prediction. It can only sharpen in correction.',
        source: '2025 Q21',
      },
      {
        title: 'Weighting particles with the motion model',
        detail: 'The motion model **moves** (samples) the particles; each moved particle is weighted by the sensor likelihood $w = p(z_t \\mid x_t)$.',
        source: '2023 Q5',
      },
      {
        title: 'p(z | x) is not p(x | z)',
        detail: 'The sensor model is a likelihood: how probable this reading is **if** the robot were at $x$. The posterior $p(x \\mid z)$ is what the filter computes from it with Bayes’ rule, and the occupancy-grid inverse sensor model $p(m \\mid z)$ is a different object again.',
        trapId: 'likelihood-column',
        source: 'Notes §1, §4',
      },
    ],
    more: '**Why both are needed.** With only a motion model the robot is dead reckoning, and its uncertainty grows without bound. With only a sensor model every reading is interpreted from scratch, so places that look alike (two identical corridors) can never be told apart. Prediction carries the history forward; correction pins it down.\n\n**The Markov assumption is built into both.** The motion model depends only on the last state and the current control, and the sensor model only on the current state, so $p(z_t \\mid x_t) = p(z_t \\mid x_t, z_{1:t-1}, u_{1:t})$ (2025 Q3). Random, memoryless noise is allowed. Effects that persist and are not in the state (a person standing in front of the sensor for many scans, a slowly deflating tyre) violate it, which is one reason the models are deliberately broad.\n\n**Why the noise grows with the motion.** A robot that stands still gathers no odometry error, while a long, fast move slips more. That is why the variances are written in terms of the motion itself ($\\alpha_1 v^2 + \\alpha_2 \\omega^2$ and so on) rather than as constants.\n\n**The same models elsewhere in the course.** The velocity model is the steering function of an RRT (2023 Q32) and the forward kinematics of a mobile robot: final pose from wheel velocities (2025 Q12). The beam model is the likelihood used in Monte Carlo localisation.',
    exploreIds: ['velocity', 'odometry', 'beam', 'bayes/grid1d'],
    solveIds: ['models-choice'],
  },

  // ------------------------------------------------------------------ velocity model
  {
    id: 'models-velocity',
    title: 'Velocity motion model: arcs of radius v/ω',
    lecture: 'Notes §3; 2023 Q32(a, b); review deck slides 6–7',
    formulas: [
      '$$\\begin{aligned} x\' &= x - \\frac{v}{\\omega}\\sin\\theta + \\frac{v}{\\omega}\\sin(\\theta + \\omega\\Delta t) \\\\ y\' &= y + \\frac{v}{\\omega}\\cos\\theta - \\frac{v}{\\omega}\\cos(\\theta + \\omega\\Delta t) \\\\ \\theta\' &= \\theta + \\omega\\Delta t + \\gamma\\Delta t \\end{aligned}$$',
      '$$r = \\frac{v}{\\omega}, \\qquad (x_c,\\ y_c) = (x - r\\sin\\theta,\\ \\ y + r\\cos\\theta), \\qquad \\text{chord} = 2|r|\\sin\\tfrac{|\\omega|\\Delta t}{2}$$',
      '$$\\omega = 0:\\quad x\' = x + v\\Delta t\\cos\\theta, \\quad y\' = y + v\\Delta t\\sin\\theta, \\quad \\theta\' = \\theta$$',
      '$$\\begin{aligned} \\hat v &= v + \\varepsilon(\\alpha_1 v^2 + \\alpha_2\\omega^2) & \\hat\\omega &= \\omega + \\varepsilon(\\alpha_3 v^2 + \\alpha_4\\omega^2) \\\\ \\hat\\gamma &= \\varepsilon(\\alpha_5 v^2 + \\alpha_6\\omega^2) & \\varepsilon(b^2) &: \\text{zero-mean noise of variance } b^2 \\end{aligned}$$',
    ],
    what: 'The control is a **commanded** pair $u_t = (v, \\omega)$: forward speed $v$ (m/s) and turn rate $\\omega$ (rad/s), held constant for $\\Delta t$. A differential-drive robot doing that drives round a circle of radius $r = v/\\omega$ about the centre $(x_c, y_c)$, which sits $|r|$ to its left when $\\omega > 0$ (anticlockwise) and to its right when $\\omega < 0$. The formulas simply rotate the robot about that centre by $\\omega\\Delta t$; $\\omega = 0$ is the straight-line limit $r \\to \\infty$. $\\gamma$ is an extra rotation rate applied at the end of the step: zero for a perfect robot, and in the noisy model it lets the final heading vary on its own. The probabilistic version samples noisy $\\hat v$, $\\hat\\omega$, $\\hat\\gamma$ (variances set by $\\alpha_1 \\dots \\alpha_6$) and applies the same formulas, giving a curved, banana-shaped cloud of end poses.',
    when: '- “Show that after 4 s the robot ends up at (4.45, −2.24) with a heading of −0.1 rad”, from two steering commands (2023 Q32(b), 6 marks).\n- “Calculate its pose after 2 s assuming perfect actuation”, from $(0, 0, 0)$ with $v = 0.8$ m/s and $\\omega = 0.03$ rad/s (review deck slides 6–7).\n- “The planner uses a velocity motion model as its steering function. What shape will each path segment be?” (2023 Q32(a), 1 mark).\n- “How does the velocity motion model simulate the movement of a 2D planar robot over a single timestep?” (review deck slide 6).',
    how: [
      'Write the three equations (formula box) and list every step’s $(v, \\omega, \\gamma, \\Delta t)$ with the start pose $(x, y, \\theta)$. Take $\\gamma = 0$ unless it is given.',
      'For each step compute $r = v/\\omega$ and $\\omega\\Delta t$ first. Keep the sign: $\\omega < 0$ gives $r < 0$, a clockwise turn.',
      'Put the calculator in **radians**. The new heading is $\\theta + \\omega\\Delta t$; then $x\' = x - r\\sin\\theta + r\\sin(\\theta + \\omega\\Delta t)$ and $y\' = y + r\\cos\\theta - r\\cos(\\theta + \\omega\\Delta t)$. Keep four or five significant figures.',
      'Carry the whole new pose, **including the new $\\theta$**, into the next step as its start pose.',
      'If $\\omega = 0$ the formula divides by zero: use the straight line $x\' = x + v\\Delta t\\cos\\theta$, $y\' = y + v\\Delta t\\sin\\theta$, $\\theta\' = \\theta$.',
      'Sanity-check each step: the robot turns left when $\\omega > 0$; the straight-line distance between the poses (the chord) is $2|r|\\sin(|\\omega|\\Delta t/2)$, a little less than $v\\Delta t$; both poses are $|r|$ from the centre.',
      'Present a table with one row per step ($r$, $\\omega\\Delta t$, $x\'$, $y\'$, $\\theta\'$) and give the final pose in bold with units (m, rad).',
    ],
    traps: [
      {
        title: 'Calculator in degrees',
        detail: 'In the review-deck example $\\omega\\Delta t = 0.06$ is in radians. In degree mode, $x\' = 26.67\\sin(0.06^\\circ) = 0.028$ m instead of 1.599 m.',
        trapId: 'radians',
        source: 'Review deck slide 7',
      },
      {
        title: 'Restarting each step at θ = 0',
        detail: 'Step 2 of 2023 Q32 starts at $\\theta_1 = 0.3$ rad. Starting it at 0 lands at $(4.438, -2.540)$ with heading $-0.4$ instead of $(4.4525, -2.2435)$ with $-0.1$.',
        trapId: 'carry-theta',
        source: '2023 Q32(b)',
      },
      {
        title: 'Dropping the sign of r',
        detail: 'With $v = 0.5$ and $\\omega = -0.2$, $r = -2.5$ m. Using $+2.5$ with $\\omega\\Delta t = -0.4$ lands at $(2.476, -2.442)$, behind where the robot started the step.',
        trapId: 'radius-sign',
        source: '2023 Q32(b)',
      },
      {
        title: 'Plugging ω = 0 into the arc formula',
        detail: '$v/\\omega$ blows up. The straight line is the limit $r \\to \\infty$: use $x\' = x + v\\Delta t\\cos\\theta$, $y\' = y + v\\Delta t\\sin\\theta$.',
        trapId: 'omega-zero',
        source: 'Notes §3',
      },
      {
        title: 'Treating the arc as a straight line',
        detail: 'Driving $v\\Delta t$ along the initial heading ignores the turn. For step 1 of 2023 Q32 it gives $(3.5, -2.7)$ instead of $(3.4642, -2.3427)$: the robot curves for the whole step.',
        source: '2023 Q32(b)',
      },
    ],
    more: '**Where the formula comes from.** With constant $v$ and $\\omega$ the heading grows linearly, $\\theta(t) = \\theta + \\omega t$, while $\\dot x = v\\cos\\theta(t)$ and $\\dot y = v\\sin\\theta(t)$. Integrating from 0 to $\\Delta t$:\n\n$$x\' = x + \\frac{v}{\\omega}\\big[\\sin(\\theta + \\omega\\Delta t) - \\sin\\theta\\big], \\qquad y\' = y - \\frac{v}{\\omega}\\big[\\cos(\\theta + \\omega\\Delta t) - \\cos\\theta\\big]$$\n\nwhich is the formula box rearranged. Geometrically, the robot stays $|r|$ from the centre $(x_c, y_c)$ and sweeps the angle $\\omega\\Delta t$ round it.\n\n**Why γ?** Without it, two noisy numbers $(\\hat v, \\hat\\omega)$ decide three numbers $(x\', y\', \\theta\')$, so the sampled end poses lie on a 2-D surface inside the 3-D pose space: the final heading would be fixed by where the robot ends up. The extra rotation $\\hat\\gamma$ (noise $\\alpha_5, \\alpha_6$) gives the model a full 3-D spread. With perfect actuation $\\gamma = 0$.\n\n**What the α parameters do.** $\\alpha_1, \\alpha_2$ set the noise on $v$: the end poses spread **along** the direction of travel. $\\alpha_3, \\alpha_4$ set the noise on $\\omega$: the end poses fan out **across** it and the cloud bends into a banana. $\\alpha_5, \\alpha_6$ scatter only the final heading, not the position. Every variance grows with $v^2$ and $\\omega^2$, so a robot told to stand still does not drift.\n\n**2023 Q32(b), worked.**\n\n$$\\begin{array}{c|cc|ccc} \\text{step } (v,\\ \\omega) & r = v/\\omega & \\omega\\Delta t & x\' & y\' & \\theta\' \\\\ \\hline 1:\\ (1.2,\\ 0.15) & 8 & 0.3 & 3.4642 & -2.3427 & 0.3 \\\\ 2:\\ (0.5,\\ -0.2) & -2.5 & -0.4 & 4.4525 & -2.2435 & -0.1 \\end{array}$$\n\nStep 2 in full: $x_2 = 3.46416 - (-2.5)\\sin 0.3 + (-2.5)\\sin(-0.1) = 3.46416 + 0.73880 + 0.24958 = 4.4525$ m and $y_2 = -2.34269 + (-2.5)\\cos 0.3 - (-2.5)\\cos(-0.1) = -2.34269 - 2.38834 + 2.48751 = -2.2435$ m.\n\n**Review deck, worked.** $r = 0.8/0.03 = 26.67$ m and $\\omega\\Delta t = 0.06$ rad, so $x\' = 26.67\\sin 0.06 = 1.5990$ m, $y\' = 26.67(1 - \\cos 0.06) = 0.04799$ m and $\\theta\' = 0.06$ rad. It is a gentle turn: the chord $2r\\sin 0.03 = 1.5998$ m is almost exactly $v\\Delta t = 1.6$ m.',
    exploreIds: ['velocity', 'odometry'],
    solveIds: ['models-velocity'],
  },

  // ------------------------------------------------------------------ odometry model
  {
    id: 'models-odometry',
    title: 'Odometry motion model: rotate, translate, rotate',
    lecture: 'Notes §3; 2023 Q6, 2024 Q6, 2025 Q6; review deck slide 5',
    formulas: [
      '$$\\begin{aligned} \\delta_{rot1} &= \\operatorname{atan2}(\\bar y\' - \\bar y,\\ \\bar x\' - \\bar x) - \\bar\\theta \\\\ \\delta_{trans} &= \\sqrt{(\\bar x\' - \\bar x)^2 + (\\bar y\' - \\bar y)^2} \\\\ \\delta_{rot2} &= \\bar\\theta\' - \\bar\\theta - \\delta_{rot1} \\end{aligned} \\qquad \\begin{aligned} x\' &= x + \\delta_{trans}\\cos(\\theta + \\delta_{rot1}) \\\\ y\' &= y + \\delta_{trans}\\sin(\\theta + \\delta_{rot1}) \\\\ \\theta\' &= \\theta + \\delta_{rot1} + \\delta_{rot2} \\end{aligned}$$',
      '$$\\begin{array}{l|l|l} & \\text{velocity model} & \\text{odometry model} \\\\ \\hline \\text{control } u_t & \\text{commanded } (v, \\omega) & \\text{measured } (\\delta_{rot1}, \\delta_{trans}, \\delta_{rot2}) \\\\ \\text{data} & \\text{a command, known before moving} & \\text{proprioceptive encoders, after moving} \\\\ \\text{filter step} & \\text{prediction} & \\text{prediction} \\\\ \\text{for planning?} & \\text{yes (RRT steering, 2023 Q32)} & \\text{no} \\\\ \\text{accuracy} & \\text{lower} & \\text{usually higher} \\\\ \\text{blind to} & \\text{motor errors and wheel slip} & \\text{wheel slip} \\end{array}$$',
    ],
    what: 'Instead of the command, the odometry model uses what the wheel encoders **measured**: the robot’s internal odometry pose went from $(\\bar x, \\bar y, \\bar\\theta)$ to $(\\bar x\', \\bar y\', \\bar\\theta\')$. That frame drifts, so only the **relative** motion is used, split into three pieces: turn by $\\delta_{rot1}$ to face where the robot went, drive straight for $\\delta_{trans}$, then turn by $\\delta_{rot2}$ to the final heading. The control $u_t = (\\delta_{rot1}, \\delta_{trans}, \\delta_{rot2})$ is applied to the belief’s pose in the prediction step, with independent noise on each piece ($\\alpha_1 \\dots \\alpha_4$). Encoders are **proprioceptive** (they sense the robot’s own wheels) and their readings only exist **after** the motion. Because they record what the wheels really did, the model is usually more accurate than the velocity model, but it cannot be used to plan.',
    when: '- “Which of the following is NOT true of an odometry motion model?” (2023 Q6: it cannot be used for motion planning).\n- “Which of the following is TRUE of an odometry motion model?” (2025 Q6: it relies on proprioceptive data), and its mirror for the velocity model (2024 Q6: it can be used for motion planning).\n- “Analyse the differences between velocity and odometry motion models” (review deck slide 5, learning outcome).\n- Turning two odometry readings into $(\\delta_{rot1}, \\delta_{trans}, \\delta_{rot2})$ and applying them to a pose.',
    how: [
      'Read the cue words: “wheel encoders”, “proprioceptive” and “measured after moving” mean odometry; “commanded velocities”, “steering function” and “planning” mean the velocity model.',
      'For the MCQ, test each option against the four facts in the table: both are used in the **prediction** step; odometry is **proprioceptive** and known only **after** moving; only the velocity model can **plan**; odometry is **usually more accurate**.',
      'To get the control from two odometry poses: $\\delta_{trans}$ is the distance between them, $\\delta_{rot1} = \\operatorname{atan2}(\\Delta\\bar y, \\Delta\\bar x) - \\bar\\theta$ and $\\delta_{rot2} = \\Delta\\bar\\theta - \\delta_{rot1}$. Wrap both angles into $(-\\pi, \\pi]$.',
      'Apply the three pieces to the **belief’s** pose $(x, y, \\theta)$, not to the odometry frame: rotate by $\\delta_{rot1}$, move $\\delta_{trans}$ along the new heading, rotate by $\\delta_{rot2}$.',
      'A turn on the spot ($\\delta_{trans} \\approx 0$) leaves the direction of travel undefined: put the whole turn into one rotation (the sim sets $\\delta_{rot1} = 0$).',
      'Back the accuracy claim with the reason: the encoders measure the actual wheel rotation, so motor lag and under-delivery are captured, whereas a command only says what was asked for.',
    ],
    traps: [
      {
        title: '“Odometry can be used for motion planning”',
        detail: 'FALSE, the key of 2023 Q6. The readings only exist after the robot has moved, so they cannot predict where an untried command would go. Planning needs the velocity model.',
        source: '2023 Q6',
      },
      {
        title: '“The velocity model is more accurate”',
        detail: 'Usually the reverse (2024 Q6 (d), 2025 Q6 (d)): odometry measures what the wheels did, a command only what was asked for. Neither model sees **wheel slip**: encoders count wheel turns, not ground travelled.',
        source: '2024 Q6, 2025 Q6',
      },
      {
        title: '“The velocity model relies on proprioceptive data”',
        detail: 'It uses the **commanded** $(v, \\omega)$, not sensor readings. Relying on proprioceptive data is the odometry model’s property: the key of 2025 Q6 and a distractor in 2024 Q6.',
        source: '2024 Q6 (c), 2025 Q6 (a)',
      },
      {
        title: 'Odometry in the measurement step',
        detail: 'Odometry is fed in as the control $u_t$ of the prediction step, even though it comes from a sensor, so “it is used to compute the measurement step” is false.',
        source: '2025 Q6 (c)',
      },
      {
        title: 'Forgetting to subtract the old heading',
        detail: '$\\operatorname{atan2}(\\Delta\\bar y, \\Delta\\bar x)$ is the direction of travel in the odometry frame; $\\delta_{rot1}$ is that **minus** $\\bar\\theta$. Skip it and both rotations come out wrong by $\\bar\\theta$.',
        source: 'Notes §3',
      },
    ],
    more: '**Worked example.** The odometry pose goes from $(1.0, 2.0, 0)$ to $(3.0, 3.0, 0.6)$. Then $\\delta_{trans} = \\sqrt{2^2 + 1^2} = 2.2361$ m, $\\delta_{rot1} = \\operatorname{atan2}(1, 2) - 0 = 0.4636$ rad and $\\delta_{rot2} = 0.6 - 0 - 0.4636 = 0.1364$ rad. Applied to a belief pose $(0, 0, \\pi/2)$: the heading after the first turn is $\\pi/2 + 0.4636 = 2.0344$ rad, so $x\' = 2.2361\\cos 2.0344 = -1.000$ m, $y\' = 2.2361\\sin 2.0344 = 2.000$ m and $\\theta\' = \\pi/2 + 0.6 = 2.1708$ rad. The same relative motion, expressed in the belief’s frame: that is why only differences between odometry readings matter.\n\n**Sampling it with noise** (as a particle filter does): perturb each piece, then apply it.\n\n$$\\begin{aligned} \\hat\\delta_{rot1} &= \\delta_{rot1} - \\varepsilon(\\alpha_1\\delta_{rot1}^2 + \\alpha_2\\delta_{trans}^2) \\\\ \\hat\\delta_{trans} &= \\delta_{trans} - \\varepsilon(\\alpha_3\\delta_{trans}^2 + \\alpha_4(\\delta_{rot1}^2 + \\delta_{rot2}^2)) \\\\ \\hat\\delta_{rot2} &= \\delta_{rot2} - \\varepsilon(\\alpha_1\\delta_{rot2}^2 + \\alpha_2\\delta_{trans}^2) \\end{aligned}$$\n\nRotation noise grows with the rotation ($\\alpha_1$) and with the distance driven ($\\alpha_2$); translation noise grows with the distance ($\\alpha_3$) and with the turning ($\\alpha_4$).\n\n**Why rotate, translate, rotate?** Any planar change of pose can be written this way, and each piece has its own physical error source (turning errors, distance errors), so independent noise on each piece is a sensible model.\n\n**Why odometry still drifts.** Each step’s small errors, and any slip, add up with nothing to correct them, so dead reckoning from odometry alone drifts without bound. That is why it only drives the prediction step and is always paired with a sensor model (see SLAM).',
    exploreIds: ['odometry', 'velocity'],
    solveIds: ['models-odometry', 'models-choice'],
  },

  // ------------------------------------------------------------------ beam model
  {
    id: 'models-beam',
    title: 'Beam-based sensor model: a four-part mixture',
    lecture: 'Notes §3 (sensor models); review deck slides 5–6',
    formulas: [
      '$$\\begin{gathered} p(z \\mid x, m) = z_{hit}\\, p_{hit}(z) + z_{short}\\, p_{short}(z) + z_{max}\\, p_{max}(z) + z_{rand}\\, p_{rand}(z) \\\\ z_{hit} + z_{short} + z_{max} + z_{rand} = 1 \\end{gathered}$$',
      '$$\\begin{array}{l|l|l} \\text{part} & \\text{shape on } [0, z_{max}] & \\text{physical cause} \\\\ \\hline p_{hit} & \\text{Gaussian } \\mathcal{N}(z^*, \\sigma_{hit}^2) & \\text{measurement noise round the true range} \\\\ p_{short} & \\text{exponential } \\eta\\,\\lambda_{short} e^{-\\lambda_{short} z} \\text{ on } [0, z^*] & \\text{unexpected objects in front} \\\\ p_{max} & \\text{spike: 1 at } z = z_{max} & \\text{missed returns (glass, black surfaces)} \\\\ p_{rand} & \\text{uniform } 1/z_{max} & \\text{unexplained random readings} \\end{array}$$',
      '$$p(z_t \\mid x_t, m) = \\prod_{k=1}^{K} p(z_t^k \\mid x_t, m) \\qquad \\text{(beams independent, given the pose and the map)}$$',
    ],
    what: 'A model of one range-finder beam (lidar or sonar). From the pose $x$ and the map $m$, ray casting gives the **expected range** $z^*$: what a perfect sensor would read. Real readings scatter for four separate physical reasons, so the likelihood $p(z \\mid x, m)$ is a weighted **mixture** of four densities, each normalised over its own range, with weights that add to 1. The shape of each part follows from its cause (table). A whole scan multiplies the likelihoods of its beams, which assumes their errors are independent.',
    when: '- “What are the components that make up the beam-based sensor model?”, drawn as a curve over $0 \\dots z_{exp} \\dots z_{max}$ (review deck slide 6).\n- “Describe the properties of beam-based, scan-based and landmark-based measurement models and analyse their differences” (review deck slide 5, learning outcome).\n- “Describe the process of characterising probabilistic sensor models” (review deck slide 5, learning outcome).\n- A reading or a situation (a glass door, a crowd, sunlight) and which part of the model explains it.',
    how: [
      'Draw the axis from 0 to $z_{max}$ and mark $z^*$, the range found by ray casting the map from the pose.',
      'Add the four parts with their shapes and causes: a Gaussian peak at $z^*$ (hit), a decaying exponential from 0 up to $z^*$ (short), a spike at $z_{max}$ (max) and a flat floor (rand).',
      'Say why each shape: noise is symmetric round the true range; the beam stops at the **first** unexpected object, so near ones are more likely; a missed echo is always reported as exactly $z_{max}$; anything else is spread evenly.',
      'To evaluate $p(z \\mid x, m)$ for one reading, evaluate each part at $z$ (most are zero there), weight them and add. Away from $z^*$ the hit term is tiny, so the short and random parts set the value.',
      'For a scan, multiply the beams (add the log-likelihoods). Mention the independence assumption and its cost: correlated errors make the product overconfident, so in practice only a subset of beams is used.',
      'To characterise a sensor: place it at known distances, record many readings, histogram them, and fit the weights, $\\sigma_{hit}$ and $\\lambda_{short}$ by **maximum likelihood** (expectation maximisation: share each reading out among the parts, re-estimate, repeat).',
    ],
    traps: [
      {
        title: 'The max spike is an object at maximum range',
        detail: 'It is a **failure**: no echo came back (glass, black or shiny surfaces, or nothing within range), and the sensor reports $z_{max}$. That is why it is a spike rather than a spread.',
        source: 'Notes §3',
      },
      {
        title: 'Short readings are uniform',
        detail: 'They decay exponentially. The beam stops at the first unexpected object, so a near object is more likely to be the one hit, and nothing is read beyond the real wall, so $p_{short}$ is cut off at $z^*$.',
        source: 'Notes §3',
      },
      {
        title: 'Leaving out the random floor',
        detail: 'Without $p_{rand}$, a reading that no other part explains gets a likelihood of about 0, which can wipe out the correct hypothesis in one scan (every particle weighted 0). The floor keeps the model robust.',
        source: 'Review deck slide 6',
      },
      {
        title: 'Weights that do not add to 1',
        detail: 'Each part integrates to 1 over its own range and the weights must add to 1; otherwise $p(z \\mid x, m)$ is not a probability density.',
        source: 'Notes §3',
      },
      {
        title: 'Treating every beam as independent evidence',
        detail: 'A person in front of the sensor blocks several neighbouring beams at once. Multiplying them all as if independent makes the filter far too confident: use a subset of beams or inflate the noise.',
        source: 'Review deck slide 5 (properties)',
      },
    ],
    more: '**Evaluating it, worked.** $z^* = 4$ m, $z_{max} = 10$ m, $\\sigma_{hit} = 0.2$ m, $\\lambda_{short} = 0.5\\ \\text{m}^{-1}$ and weights $(z_{hit}, z_{short}, z_{max}, z_{rand}) = (0.7, 0.1, 0.05, 0.15)$:\n\n$$\\begin{array}{c|cccc|l} z\\ (\\text{m}) & p_{hit} & p_{short} & p_{max} & p_{rand} & p(z \\mid x, m) \\\\ \\hline 4.1 & 1.760 & 0 & 0 & 0.1 & 0.7(1.760) + 0.15(0.1) = 1.247 \\\\ 2.0 & \\approx 0 & 0.2127 & 0 & 0.1 & 0.1(0.2127) + 0.15(0.1) = 0.0363 \\\\ 10 & \\approx 0 & 0 & 1 & 0 & 0.05(1) = 0.05 \\end{array}$$\n\nHere $p_{short}(2) = \\eta\\lambda e^{-\\lambda z} = \\dfrac{0.5\\, e^{-1}}{1 - e^{-0.5 \\times 4}} = 0.2127\\ \\text{m}^{-1}$: the $\\eta = 1/(1 - e^{-\\lambda z^*})$ makes the cut-off exponential integrate to 1 over $[0, z^*]$. The hit Gaussian’s $\\eta$ is about 1 because almost all of it lies inside $[0, z_{max}]$. A reading of exactly $z_{max}$ is a point mass: $p_{max} = 1$ there and 0 everywhere else (the sim draws it as a narrow spike).\n\n**What the parameters do.** A larger $\\sigma_{hit}$ widens and lowers the peak (its area stays 1): a less precise sensor, likelihoods that change slowly with the pose, and slower but more forgiving localisation. A larger $\\lambda_{short}$ crowds the short readings closer to the sensor (a more cluttered space). A larger $z_{rand}$ raises the floor: more tolerance of outliers, less sharp localisation.\n\n**Why it is costly and spiky.** Every beam of every particle needs a ray cast through the map, and $z^*$ can jump as the pose moves past a corner or a doorway, so the likelihood is not smooth in the pose. Those two weaknesses motivate the likelihood field.\n\n**Characterising the sensor by EM** (the sim’s fitting mode): start from a guess; for each reading compute each part’s share of $p(z)$ (its responsibility); set each weight to the average share, $\\sigma_{hit}$ from the readings weighted by their hit share and $\\lambda_{short}$ from those weighted by their short share; repeat until the log-likelihood stops rising.',
    exploreIds: ['beam', 'likelihood-field'],
    solveIds: ['models-beam'],
  },

  // ------------------------------------------------------------------ likelihood field and landmarks
  {
    id: 'models-other-sensors',
    title: 'Likelihood-field (scan-based) and landmark models',
    lecture: 'Notes §3 (sensor models); review deck slide 5',
    formulas: [
      '$$\\begin{gathered} (x_k,\\ y_k) = \\big(x + z^k\\cos(\\theta + \\phi_k),\\ \\ y + z^k\\sin(\\theta + \\phi_k)\\big), \\qquad d_k = \\text{distance from } (x_k, y_k) \\text{ to the nearest obstacle} \\\\ p(z^k \\mid x, m) = z_{hit}\\, \\mathcal{N}(d_k;\\ 0,\\ \\sigma_{hit}^2) + \\frac{z_{rand}}{z_{max}} \\qquad (\\text{max-range readings skipped}) \\end{gathered}$$',
      '$$\\begin{gathered} \\hat r = \\sqrt{(m_x - x)^2 + (m_y - y)^2}, \\qquad \\hat\\phi = \\operatorname{atan2}(m_y - y,\\ m_x - x) - \\theta \\\\ p(r, \\phi \\mid x, m) = \\mathcal{N}(r - \\hat r;\\ 0,\\ \\sigma_r^2)\\ \\mathcal{N}(\\phi - \\hat\\phi;\\ 0,\\ \\sigma_\\phi^2) \\end{gathered}$$',
      '$$\\begin{array}{l|l|l|l} & \\text{beam} & \\text{likelihood field} & \\text{landmark} \\\\ \\hline \\text{compares} & z \\text{ with ray-cast } z^* & \\text{end point with map} & r, \\phi \\text{ with predicted} \\\\ \\text{cost} & \\text{a ray cast per beam} & \\text{a table lookup} & \\text{a few features} \\\\ \\text{smooth in pose} & \\text{no} & \\text{yes} & \\text{yes} \\\\ \\text{path of the ray} & \\text{used} & \\text{ignored} & \\text{not applicable} \\\\ \\text{max-range readings} & p_{max} \\text{ spike} & \\text{dropped} & \\text{not applicable} \\\\ \\text{needs} & \\text{a map} & \\text{map + distance table} & \\text{features, data association} \\end{array}$$',
    ],
    what: 'Two cheaper alternatives to ray casting every beam. The **likelihood field** (scan-based model) projects the end point of each beam into the map and scores it by its distance $d$ to the **nearest obstacle**, read from a table computed once for the map: a Gaussian in $d$ plus a random floor, with max-range readings thrown away. It is fast and smooth in the pose, but it ignores what the beam passed through, so it cannot tell a wall the beam should have hit from one hidden behind it. The **landmark (feature-based) model** first extracts distinct features (corners, posts, fiducial tags) with a range, a bearing and perhaps an identity, then compares them with the range and bearing predicted from the pose to each landmark on the map. It is compact and cheap, but it needs reliable feature detection and **data association** (which landmark is which), and it ignores everything that is not a feature.',
    when: '- “Describe the properties of beam-based, scan-based and landmark-based measurement models and analyse their differences” (review deck slide 5, learning outcome).\n- Choosing a measurement model for a scenario: a lidar particle filter that must run in real time, a warehouse with tags at known places (the 2024 Q7 forklift), a robot near glass or crowds.\n- “How many fiducial markers of known pose and size must a robot observe to localise itself, and why observe more?” (2023 Q23, 2 marks).',
    how: [
      'Ask what the sensor delivers: raw ranges in many directions (lidar, sonar) suit the beam model or the likelihood field; identified features (tags, reflectors, recognised objects) suit the landmark model.',
      'Ask what matters most: modelling the physics (people in the way, glass) points to the beam model; speed with many particles and a smooth likelihood to the likelihood field; a small state and a few distinctive features to the landmark model.',
      'Likelihood field by hand: compute each beam’s end point from the pose, look up its distance $d$ to the nearest obstacle, score $z_{hit}\\mathcal{N}(d; 0, \\sigma_{hit}^2) + z_{rand}/z_{max}$, skip max-range readings, and multiply over the beams.',
      'Landmark model by hand: predict $\\hat r$ and $\\hat\\phi$ from the pose to the landmark (formula box), score the measured $r$ and $\\phi$ under Gaussian noise, and multiply over landmarks. Settle the correspondence first: known IDs (tags) make it trivial.',
      'Finish the comparison with one trade-off each: beam = faithful but slow and spiky; likelihood field = fast and smooth but blind to free space; landmark = compact but dependent on detection and data association.',
    ],
    traps: [
      {
        title: 'The likelihood field ray-casts each beam',
        detail: 'It never traces the ray; it only looks at where the beam **ended**. That is what makes it fast, and also why it can “see through walls”: an end point next to any obstacle scores well, even one the beam could not have reached.',
        source: 'Notes §3',
      },
      {
        title: 'Max-range readings in the likelihood field',
        detail: 'A missed return has no meaningful end point (it would land in free space and be penalised), so the likelihood field discards max-range readings; the beam model explains them with $p_{max}$.',
        source: 'Notes §3',
      },
      {
        title: 'Landmarks without data association',
        detail: 'The landmark likelihood is only right if each measurement is matched to the right landmark. A wrong match gives a confident, wrong pose, the same failure as a false loop closure in SLAM.',
        source: 'Notes §3, §4',
      },
      {
        title: 'One landmark always fixes the pose',
        detail: 'Range and bearing to a single **point** landmark leave the robot anywhere on a circle round it (with a heading to match). A fiducial **tag** of known pose and size is different: its four corners give the full camera pose, so in theory one tag is enough.',
        source: '2023 Q23',
      },
    ],
    more: '**Why the likelihood field is smooth.** The distance to the nearest obstacle changes continuously as the pose moves, so the score does too. The beam model’s $z^*$ can jump when a beam slides off a corner or through a doorway, so its likelihood is spiky in the pose, which makes particle filters fragile and gradient-based scan matching impossible.\n\n**Why it is fast.** The distance to the nearest obstacle depends only on the map, so it is computed once for every cell (a distance transform) and stored. Scoring a beam is then one lookup instead of a ray cast.\n\n**Worked (likelihood field).** $z_{hit} = 0.8$, $z_{rand} = 0.2$, $z_{max} = 10$ m, $\\sigma_{hit} = 0.2$ m. An end point $d = 0.1$ m from a wall scores $0.8\\,\\mathcal{N}(0.1; 0, 0.2^2) + 0.2/10 = 0.8(1.760) + 0.02 = 1.428$; one $d = 1$ m away scores about $0.02$, the random floor.\n\n**Worked (landmark).** Pose $(1, 1, \\pi/4)$ and a landmark at $(4, 5)$: $\\hat r = \\sqrt{3^2 + 4^2} = 5$ m and $\\hat\\phi = \\operatorname{atan2}(4, 3) - \\pi/4 = 0.927 - 0.785 = 0.142$ rad. A measurement $(r, \\phi)$ is scored by how far it is from $(5, 0.142)$ in units of $\\sigma_r$ and $\\sigma_\\phi$.\n\n**2023 Q23 (fiducials).** In theory one marker: with its pose and size known, its four detected corners give enough 2-D to 3-D correspondences to solve for the full camera pose (a PnP problem), and hence the robot’s. Observing more helps because every detection is noisy, a single small tag is ambiguous at range or seen face-on, and redundant markers give a wider baseline and survive occlusion or a misdetection.',
    exploreIds: ['likelihood-field', 'beam'],
    solveIds: ['models-choice', 'models-beam'],
  },
];

export const flashcards: Flashcard[] = [
  // Role in the Bayes filter
  {
    id: 'models-f-role',
    front: 'Motion model vs sensor model: what does each give, and which Bayes-filter step uses it?',
    back: 'Motion model $p(x_t \\mid u_t, x_{t-1})$: where the robot ends up after control $u_t$; used in **prediction** (the belief spreads). Sensor model $p(z_t \\mid x_t)$: how likely the reading is from each state; used in **correction** (the belief sharpens).',
    tags: ['role'],
  },
  {
    id: 'models-f-uncertainty',
    front: 'Does the prediction step make the belief more or less certain? And the correction step?',
    back: 'Prediction: **less** certain, because the motion model adds actuation noise and no new information arrives. Correction: **more** certain, because the sensor model concentrates the belief on states that explain $z_t$ (2025 Q21).',
    tags: ['role'],
  },
  {
    id: 'models-f-pf',
    front: 'Particle filter: which model moves the particles, and which gives their weights?',
    back: 'The motion model is **sampled** to move each particle (with noise). The sensor model gives each moved particle its weight $w = p(z_t \\mid x_t)$ (2023 Q5). Then resample in proportion to the weights.',
    tags: ['role', 'mcq'],
  },
  {
    id: 'models-f-sample-eval',
    front: 'Two ways to use a motion model: what are they, and which filter needs which?',
    back: '**Sample** an end pose (perturb the control with noise, apply the formula): what a particle filter needs. **Evaluate** $p(x_t \\mid u_t, x_{t-1})$ for a given pair of poses (recover the control that explains them and score its error): what a grid filter needs.',
    tags: ['role'],
  },
  // Velocity model
  {
    id: 'models-f-vel-input',
    front: 'Velocity motion model: what is the control, and when is it known?',
    back: 'The **commanded** forward and turn rates $u_t = (v, \\omega)$, held for $\\Delta t$. It is known **before** the robot moves, so the model can predict the outcome of a command and can be used for planning (2024 Q6).',
    tags: ['velocity'],
  },
  {
    id: 'models-f-arc',
    front: 'Constant $(v, \\omega)$: what path does a differential-drive robot trace?',
    back: 'A **circular arc** of radius $r = v/\\omega$ about the centre $(x - r\\sin\\theta,\\ y + r\\cos\\theta)$ (2023 Q32(a)). $\\omega > 0$ turns left, $\\omega < 0$ right; $\\omega = 0$ is a straight line; $v = 0$ is a turn on the spot.',
    tags: ['velocity', 'mcq'],
  },
  {
    id: 'models-f-vel-eqs',
    front: 'Write the velocity motion model update for $(x\', y\', \\theta\')$.',
    back: '$x\' = x - \\frac{v}{\\omega}\\sin\\theta + \\frac{v}{\\omega}\\sin(\\theta + \\omega\\Delta t)$\n\n$y\' = y + \\frac{v}{\\omega}\\cos\\theta - \\frac{v}{\\omega}\\cos(\\theta + \\omega\\Delta t)$\n\n$\\theta\' = \\theta + \\omega\\Delta t + \\gamma\\Delta t$',
    tags: ['velocity'],
  },
  {
    id: 'models-f-gamma',
    front: 'What is $\\gamma$ in the velocity model, and why is it there?',
    back: 'An extra rotation rate applied at the end of the step: $\\theta\' = \\theta + \\omega\\Delta t + \\gamma\\Delta t$. With noise on $(v, \\omega)$ alone, the final heading would be fixed by the final position; $\\gamma$ lets it vary on its own. With perfect actuation, $\\gamma = 0$.',
    tags: ['velocity'],
  },
  {
    id: 'models-f-omega-zero',
    front: 'Velocity model with $\\omega = 0$: what do you do?',
    back: 'The arc formula divides by zero ($r \\to \\infty$). Use the straight line: $x\' = x + v\\Delta t\\cos\\theta$, $y\' = y + v\\Delta t\\sin\\theta$, $\\theta\' = \\theta$.',
    tags: ['velocity'],
  },
  {
    id: 'models-f-method',
    front: 'Multi-step velocity-model question: the four habits of the method?',
    back: '1. Compute $r = v/\\omega$ and $\\omega\\Delta t$ first.\n2. Keep the sign of $r$ when $\\omega < 0$ (clockwise).\n3. Work in radians.\n4. Carry each step’s new pose, **including $\\theta$**, into the next step (Notes §3).',
    tags: ['velocity'],
  },
  {
    id: 'models-f-review',
    front: 'Review deck: from $(0, 0, 0)$ with $v = 0.8$ m/s and $\\omega = 0.03$ rad/s for 2 s. Where does the robot end up?',
    back: '$r = 26.67$ m and $\\omega\\Delta t = 0.06$ rad, so $x\' = 26.67\\sin 0.06 = 1.5990$ m, $y\' = 26.67(1 - \\cos 0.06) = 0.04799$ m and $\\theta\' = 0.06$ rad.',
    tags: ['velocity'],
  },
  {
    id: 'models-f-2023',
    front: '2023 Q32(b): from $(1.1, -2.7, 0)$, commands $(v, \\omega) = (1.2, 0.15)$ then $(0.5, -0.2)$, 2 s each. The pose after each step?',
    back: 'Step 1: $r = 8$, $\\omega\\Delta t = 0.3$, giving $(3.4642, -2.3427, 0.3)$. Step 2: $r = -2.5$, $\\omega\\Delta t = -0.4$, starting from $\\theta = 0.3$, giving $(4.4525, -2.2435, -0.1)$ (m, m, rad).',
    tags: ['velocity'],
  },
  {
    id: 'models-f-alphas',
    front: 'Sampled velocity model: what does noise on $v$ do to the cloud of end poses? And noise on $\\omega$?',
    back: 'Noise on $v$ ($\\alpha_1, \\alpha_2$) spreads the end poses **along** the direction of travel (further or shorter). Noise on $\\omega$ ($\\alpha_3, \\alpha_4$) fans them **across** it, bending the cloud into a banana. Noise on $\\gamma$ ($\\alpha_5, \\alpha_6$) scatters only the final heading.',
    tags: ['velocity'],
  },
  // Odometry model
  {
    id: 'models-f-odo-input',
    front: 'Odometry motion model: what is the control?',
    back: 'The motion **measured** by the wheel encoders between two odometry poses, written $u_t = (\\delta_{rot1}, \\delta_{trans}, \\delta_{rot2})$: turn to face the direction of travel, drive straight, turn to the final heading. Proprioceptive, and only available **after** moving.',
    tags: ['odometry'],
  },
  {
    id: 'models-f-odo-eqs',
    front: 'Odometry poses go from $(\\bar x, \\bar y, \\bar\\theta)$ to $(\\bar x\', \\bar y\', \\bar\\theta\')$: write $\\delta_{rot1}$, $\\delta_{trans}$ and $\\delta_{rot2}$.',
    back: '$\\delta_{rot1} = \\operatorname{atan2}(\\bar y\' - \\bar y,\\ \\bar x\' - \\bar x) - \\bar\\theta$\n\n$\\delta_{trans} = \\sqrt{(\\bar x\' - \\bar x)^2 + (\\bar y\' - \\bar y)^2}$\n\n$\\delta_{rot2} = \\bar\\theta\' - \\bar\\theta - \\delta_{rot1}$',
    tags: ['odometry'],
  },
  {
    id: 'models-f-odo-calc',
    front: 'The odometry pose goes from $(0, 0, 0)$ to $(2, 2, \\pi/2)$. What are $\\delta_{rot1}$, $\\delta_{trans}$ and $\\delta_{rot2}$?',
    back: '$\\delta_{rot1} = \\operatorname{atan2}(2, 2) - 0 = \\pi/4 = 0.785$ rad, $\\delta_{trans} = 2\\sqrt2 = 2.828$ m, $\\delta_{rot2} = \\pi/2 - 0 - \\pi/4 = 0.785$ rad.',
    tags: ['odometry'],
  },
  {
    id: 'models-f-accuracy',
    front: 'Which is usually more accurate, the velocity or the odometry motion model? Why?',
    back: '**Odometry** (so 2024 Q6 (d) and 2025 Q6 (d) are false). The encoders measure what the wheels actually did, including motor lag and under-delivery; a command only says what was asked for. Neither model sees wheel slip.',
    tags: ['odometry', 'mcq'],
  },
  {
    id: 'models-f-vel-true',
    front: 'Velocity motion model, TRUE or FALSE: (a) used in the measurement step; (b) usable for motion planning; (c) relies on proprioceptive data; (d) more accurate than odometry.',
    back: 'Only **(b)** is true (2024 Q6). It is used in prediction, it takes commanded velocities rather than sensor data, and it is typically less accurate than odometry.',
    tags: ['odometry', 'velocity', 'mcq'],
  },
  {
    id: 'models-f-odo-true',
    front: 'Odometry motion model, TRUE or FALSE: (a) relies on proprioceptive data; (b) usable for motion planning; (c) used in the measurement step; (d) less accurate than the velocity model.',
    back: 'Only **(a)** is true (2025 Q6): wheel encoders sense the robot’s own motion. It cannot plan, because the readings exist only after moving (the key of 2023 Q6); it belongs to the prediction step; and it is usually **more** accurate.',
    tags: ['odometry', 'mcq'],
  },
  {
    id: 'models-f-slip',
    front: 'The wheels spin on a wet patch while the robot barely moves. What do the velocity and odometry models predict?',
    back: 'Both get it wrong. The velocity model predicts the commanded motion; the odometry model reports the wheel rotation the encoders counted. Neither measures ground travelled, so only the sensor model (the correction step) can catch the error.',
    tags: ['odometry'],
  },
  // Beam model
  {
    id: 'models-f-beam-four',
    front: 'Beam-based sensor model: the four components and their shapes?',
    back: '$p_{hit}$: a Gaussian round the expected range $z^*$. $p_{short}$: an exponential decaying from 0 to $z^*$. $p_{max}$: a spike at $z_{max}$. $p_{rand}$: uniform over $[0, z_{max}]$. Mixed with weights $z_{hit} + z_{short} + z_{max} + z_{rand} = 1$ (review deck slide 6).',
    tags: ['beam', 'mcq'],
  },
  {
    id: 'models-f-beam-causes',
    front: 'What physical effect does each part of the beam model stand for?',
    back: 'hit: measurement noise round the true range. short: unexpected objects in front of the mapped surface (people, clutter). max: missed returns, reported as $z_{max}$ (glass, black or shiny surfaces). rand: unexplained random readings (crosstalk, reflections, sunlight).',
    tags: ['beam'],
  },
  {
    id: 'models-f-short-exp',
    front: 'Why is the short-reading part exponential, and why does it stop at $z^*$?',
    back: 'The beam stops at the **first** unexpected object, so nearer objects are more likely to be the one hit: the chance decays with range. Nothing beyond the real surface can cause a short reading, so the exponential is cut off at $z^*$ (and renormalised).',
    tags: ['beam'],
  },
  {
    id: 'models-f-rand-floor',
    front: 'Why keep the uniform $p_{rand}$ floor in the beam model?',
    back: 'So that no reading ever has (near) zero likelihood. Without it, one unexplained reading could give the true pose weight 0 and wipe out the correct particles; the floor makes the filter robust to outliers.',
    tags: ['beam'],
  },
  {
    id: 'models-f-sigma',
    front: 'Beam model: double $\\sigma_{hit}$. What happens to the hit peak, and to localisation?',
    back: 'The peak becomes twice as wide and half as tall (its area stays 1). Readings near $z^*$ are scored less sharply: the filter trusts each reading less and converges more slowly, but tolerates small map errors better.',
    tags: ['beam'],
  },
  {
    id: 'models-f-characterise',
    front: 'How do you characterise a range sensor’s probabilistic model?',
    back: 'Place it at known distances, record many readings, histogram them, and fit the mixture weights, $\\sigma_{hit}$ and $\\lambda_{short}$ by **maximum likelihood** (in practice by expectation maximisation), so that the model best explains the data.',
    tags: ['beam'],
  },
  {
    id: 'models-f-independence',
    front: 'How does the beam model score a whole scan, and what does that assume?',
    back: 'It multiplies the beams’ likelihoods, $\\prod_k p(z^k \\mid x, m)$ (adds their logs). That assumes the beams’ errors are independent given the pose and the map. One person blocking many beams breaks it and makes the result overconfident, so in practice only a subset of beams is used.',
    tags: ['beam'],
  },
  // Likelihood field and landmarks
  {
    id: 'models-f-field',
    front: 'Likelihood-field (scan-based) model: how does it score a beam, and what are its main pro and con?',
    back: 'Project the beam’s end point into the map and score its distance $d$ to the nearest obstacle: $z_{hit}\\mathcal{N}(d; 0, \\sigma_{hit}^2) + z_{rand}/z_{max}$, with max-range readings dropped. Pro: a precomputed lookup, fast and smooth in the pose. Con: it ignores the path of the ray, so it can “see through walls”.',
    tags: ['field'],
  },
  {
    id: 'models-f-landmark',
    front: 'Landmark (feature-based) model: what does it compare, and what does it need?',
    back: 'The measured range and bearing to each detected feature against those predicted from the pose to that landmark on the map, under Gaussian noise. Compact and cheap, but it needs feature detection and **data association** (which landmark is which).',
    tags: ['field'],
  },
  {
    id: 'models-f-which',
    front: 'Which measurement model? (a) 2000 particles and a 360-beam lidar in real time; (b) a forklift seeing ID tags at known places; (c) an office full of glass walls and crowds.',
    back: '(a) The **likelihood field**: one lookup per beam, smooth in the pose. (b) A **landmark** model: the tag IDs settle data association. (c) The **beam** model: $p_{max}$ explains the glass and $p_{short}$ the people.',
    tags: ['field'],
  },
];
