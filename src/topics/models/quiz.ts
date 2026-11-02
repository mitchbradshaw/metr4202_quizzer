// MCQs (original wording, cited to the past papers), method games and exam-style short answers for 'models'.
// Covers every motion- and sensor-model MCQ of 2023–2025 (2023 Q6, 2024 Q6, 2025 Q6), 2023 Q32(a, b), the review
// deck's practice questions (slides 5–7) and its learning outcomes, plus originals.
import type { Game, MCQ, ShortAnswer } from '../../engine/types';

export const mcqs: MCQ[] = [
  // ------------------------------------------------------------------ velocity vs odometry (recurring Q6)
  {
    id: 'models-q-odo-not',
    style: 'incorrect',
    stem: 'About the odometry motion model:',
    options: [
      {
        text: 'It can be used to plan motions before the robot executes them.',
        correct: true,
        why: 'This is the FALSE one. Odometry readings come from the wheel encoders while the robot moves, so they only exist **after** a motion. A planner has to predict the result of commands that have not been executed yet, which takes the velocity model.',
      },
      {
        text: 'It can be used for the prediction step of a Bayes filter.',
        correct: false,
        why: 'True: the odometry readings are fed in as the control $u_t$ of $p(x_t \\mid u_t, x_{t-1})$ in the prediction step.',
      },
      {
        text: 'It relies on proprioceptive data.',
        correct: false,
        why: 'True: wheel encoders measure the robot’s own motion (proprioception), not the environment.',
      },
      {
        text: 'It is typically more accurate than the velocity motion model.',
        correct: false,
        why: 'True: the encoders record what the wheels actually did, including motor lag and under-delivery, rather than what was commanded.',
      },
    ],
    source: 'Recurring: 2023 Q6 (the NOT form); 2024 Q6, 2025 Q6',
    trapId: 'read-the-stem',
    difficulty: 1,
  },
  {
    id: 'models-q-vel-true',
    style: 'correct',
    stem: 'About the velocity motion model:',
    options: [
      {
        text: 'It can be used for motion planning.',
        correct: true,
        why: 'Given a command $(v, \\omega)$ it predicts the resulting arc **before** the robot moves, which is exactly what a planner needs: it is the RRT steering function of 2023 Q32.',
      },
      {
        text: 'It is used to compute the measurement step of a Bayes filter.',
        correct: false,
        why: 'It is a motion model, used in the prediction step. The measurement (correction) step uses a sensor model $p(z_t \\mid x_t)$.',
      },
      {
        text: 'It relies on proprioceptive data.',
        correct: false,
        why: 'It uses the commanded velocities, not sensor readings. Proprioceptive wheel-encoder data is what the odometry model uses.',
      },
      {
        text: 'It is typically more accurate than the odometry motion model.',
        correct: false,
        why: 'A command says what was asked for, not what happened. Odometry measures the actual wheel motion and is usually the more accurate of the two.',
      },
    ],
    source: 'Recurring: 2024 Q6 (mirror of 2023 Q6 and 2025 Q6)',
    difficulty: 1,
  },
  {
    id: 'models-q-odo-true',
    style: 'correct',
    stem: 'Which of the following holds for the odometry motion model?',
    options: [
      {
        text: 'It relies on proprioceptive data.',
        correct: true,
        why: 'It uses wheel-encoder readings, which sense the robot’s own motion rather than the world around it.',
      },
      {
        text: 'It can be used for motion planning.',
        correct: false,
        why: 'The readings only exist after the robot has moved, so they cannot predict the outcome of an untried command (the key of 2023 Q6).',
      },
      {
        text: 'It is used to compute the measurement step of a Bayes filter.',
        correct: false,
        why: 'Odometry enters as the control $u_t$ of the prediction step, even though it comes from a sensor.',
      },
      {
        text: 'It is typically less accurate than the velocity motion model.',
        correct: false,
        why: 'It is typically **more** accurate, because it measures what the wheels actually did instead of what was commanded.',
      },
    ],
    source: 'Recurring: 2025 Q6 (mirror of 2023 Q6 and 2024 Q6)',
    difficulty: 1,
  },
  {
    id: 'models-q-odo-accuracy',
    style: 'most-correct',
    stem: 'Why is the odometry motion model usually more accurate than the velocity motion model?',
    options: [
      {
        text: 'It measures the wheel motion that really happened, not the command',
        correct: true,
        why: 'Motors lag, saturate and under-deliver, so the executed motion differs from the command. The encoders measure the executed wheel rotation, which captures those errors.',
      },
      {
        text: 'Wheel encoders also measure how far the wheels slip over the ground surface',
        correct: false,
        why: 'They do not: encoders count wheel rotation. A wheel spinning on a wet floor is counted as motion, so neither model sees slip.',
      },
      {
        text: 'It is an exteroceptive measurement, so it gets corrected against the map',
        correct: false,
        why: 'Encoders are proprioceptive (they sense the robot itself), and the odometry model is a motion model in the prediction step; it never uses the map.',
      },
      {
        text: 'It models each move as a single arc, with no noise on the rotations',
        correct: false,
        why: 'That describes neither model: odometry is rotate, translate, rotate, and both models carry rotation noise.',
      },
    ],
    source: 'Notes §3; 2024 Q6 (d), 2025 Q6 (d)',
    difficulty: 1,
  },
  {
    id: 'models-q-slip',
    style: 'correct',
    stem: 'A robot is commanded to drive 2 m straight ahead. On a wet floor its wheels turn as far as they would for 2 m, but it only moves 1.2 m. What do the two motion models predict for this step?',
    options: [
      {
        text: 'Both predict about 2 m; only the sensor model (correction step) can reveal the error',
        correct: true,
        why: 'The velocity model predicts the commanded 2 m, and the encoders counted 2 m of wheel rotation, so odometry also says 2 m. Slip is invisible to both; the correction step has to catch it.',
      },
      {
        text: 'The velocity model predicts the commanded 2 m, the odometry model 1.2 m',
        correct: false,
        why: 'The encoders count wheel turns, and the wheels did turn as far as 2 m; odometry cannot tell that they slipped.',
      },
      {
        text: 'The odometry model predicts 2 m, the velocity model only about 1.2 m',
        correct: false,
        why: 'The velocity model only knows the command (2 m); it has no information about the floor.',
      },
      {
        text: 'Both predict 1.2 m, because the motion noise already covers the slip',
        correct: false,
        why: 'The noise widens the predicted cloud round 2 m but does not move its centre to 1.2 m: a systematic 40 % slip is not zero-mean noise.',
      },
    ],
    source: 'Notes §3; original (the odometry sim’s wet patch)',
    difficulty: 2,
  },
  {
    id: 'models-q-odo-calc',
    style: 'value',
    stem: 'Between two time steps the robot’s odometry pose changes from $(0, 0, 0)$ to $(2, 2, \\pi/2)$ (m, m, rad). What is $u_t = (\\delta_{rot1}, \\delta_{trans}, \\delta_{rot2})$?',
    options: [
      {
        text: '$(\\pi/4,\\ 2.828\\ \\text{m},\\ \\pi/4)$',
        correct: true,
        why: '$\\delta_{rot1} = \\operatorname{atan2}(2, 2) - 0 = \\pi/4$; $\\delta_{trans} = \\sqrt{2^2 + 2^2} = 2.828$ m; $\\delta_{rot2} = \\pi/2 - 0 - \\pi/4 = \\pi/4$.',
      },
      {
        text: '$(0,\\ 4\\ \\text{m},\\ \\pi/2)$',
        correct: false,
        why: 'That drives $|\\Delta x| + |\\Delta y|$ and then turns. The robot first turns to face its direction of travel ($\\pi/4$) and drives the straight-line distance $2\\sqrt2$.',
      },
      {
        text: '$(\\pi/4,\\ 2.828\\ \\text{m},\\ \\pi/2)$',
        correct: false,
        why: '$\\delta_{rot2}$ is the turn **left over** after $\\delta_{rot1}$: $\\pi/2 - \\pi/4 = \\pi/4$. Using the whole change of heading counts the first rotation twice.',
      },
      {
        text: '$(\\pi/2,\\ 2.828\\ \\text{m},\\ 0)$',
        correct: false,
        why: 'The direction of travel is $\\operatorname{atan2}(2, 2) = \\pi/4$, not the final heading; the robot only reaches $\\pi/2$ after the second rotation.',
      },
    ],
    source: 'Notes §3 (odometry model); review deck slide 5 (learning outcome)',
    difficulty: 2,
  },
  // ------------------------------------------------------------------ velocity model by hand
  {
    id: 'models-q-arc',
    style: 'most-correct',
    stem: 'An RRT for a differential-drive robot uses the velocity motion model as its steering function, holding $(v, \\omega)$ constant along each edge. What shape is each edge?',
    options: [
      {
        text: 'A circular arc of radius $v/\\omega$ (a straight line if $\\omega = 0$)',
        correct: true,
        why: 'Constant speed and turn rate keep the robot a fixed distance $|v/\\omega|$ from its centre of rotation, so it traces a circle; $\\omega = 0$ is the limit of infinite radius.',
      },
      {
        text: 'A straight line from the parent node to the new node',
        correct: false,
        why: 'Only when $\\omega = 0$. Any nonzero turn rate curves the path for the whole edge.',
      },
      {
        text: 'A clothoid whose curvature grows steadily along the edge',
        correct: false,
        why: 'That needs $\\omega$ to ramp up during the edge. With constant $(v, \\omega)$ the curvature $\\omega/v$ is constant: a circle.',
      },
      {
        text: 'A spiral whose radius shrinks as the robot slows down',
        correct: false,
        why: '$v$ is held constant along the edge, so the radius $v/\\omega$ never changes.',
      },
    ],
    source: 'Similar to 2023 Q32(a)',
    difficulty: 1,
  },
  {
    id: 'models-q-radius',
    style: 'value',
    stem: 'Step 2 of 2023 Q32: the robot is at $(3.4642, -2.3427)$ m with heading $\\theta = 0.3$ rad and is commanded $v = 0.5$ m/s, $\\omega = -0.2$ rad/s for 2 s. What are $r = v/\\omega$ and the heading afterwards?',
    options: [
      {
        text: '$r = -2.5$ m (a clockwise turn), $\\theta\' = -0.1$ rad',
        correct: true,
        why: '$r = 0.5/(-0.2) = -2.5$ m: the minus sign puts the centre on the robot’s right, so it turns clockwise. $\\theta\' = 0.3 + (-0.2)(2) = -0.1$ rad.',
      },
      {
        text: '$r = 2.5$ m (an anticlockwise turn), $\\theta\' = 0.7$ rad',
        correct: false,
        why: 'Dropping the sign of $\\omega$ turns the robot the wrong way: its heading would rise to 0.7 rad instead of falling.',
      },
      {
        text: '$r = -2.5$ m (a clockwise turn), $\\theta\' = -0.4$ rad',
        correct: false,
        why: 'This forgets to carry the heading: $-0.4$ rad is only the change $\\omega\\Delta t$. Step 2 starts at $\\theta = 0.3$, so it ends at $-0.1$ rad.',
      },
      {
        text: '$r = -0.1$ m (a clockwise turn), $\\theta\' = -0.1$ rad',
        correct: false,
        why: '$r$ is $v/\\omega$, not $v\\omega$: $0.5 \\times (-0.2)$ is not even a length. $0.5/(-0.2) = -2.5$ m.',
      },
    ],
    source: 'Similar to 2023 Q32(b)',
    trapId: 'radius-sign',
    difficulty: 2,
  },
  {
    id: 'models-q-review-pose',
    style: 'value',
    stem: 'From $(0, 0, 0)$ a robot is commanded $v = 0.8$ m/s, $\\omega = 0.03$ rad/s and $\\gamma = 0$ for 2 s, with perfect actuation. Where does it end up?',
    options: [
      {
        text: '$(1.5990\\ \\text{m},\\ 0.0480\\ \\text{m},\\ 0.06\\ \\text{rad})$',
        correct: true,
        why: '$r = 0.8/0.03 = 26.67$ m and $\\omega\\Delta t = 0.06$ rad: $x\' = 26.67\\sin 0.06 = 1.5990$ m, $y\' = 26.67(1 - \\cos 0.06) = 0.04799$ m, $\\theta\' = 0.06$ rad.',
      },
      {
        text: '$(1.6000\\ \\text{m},\\ 0\\ \\text{m},\\ 0.06\\ \\text{rad})$',
        correct: false,
        why: 'That drives $v\\Delta t = 1.6$ m straight along the initial heading and ignores the turn. The robot curves left for the whole step, so $y\'$ cannot be 0.',
      },
      {
        text: '$(0.0279\\ \\text{m},\\ 0.0000\\ \\text{m},\\ 0.06\\ \\text{rad})$',
        correct: false,
        why: 'Calculator in degree mode: $26.67\\sin(0.06^\\circ) = 0.028$ m. The model works in radians.',
      },
      {
        text: '$(1.5990\\ \\text{m},\\ -0.0480\\ \\text{m},\\ 0.06\\ \\text{rad})$',
        correct: false,
        why: 'A positive $\\omega$ turns the robot anticlockwise (to its left), so it ends at positive $y$: $y\' = r(1 - \\cos 0.06) > 0$.',
      },
    ],
    source: 'Review deck slides 6–7',
    trapId: 'radians',
    difficulty: 1,
  },
  {
    id: 'models-q-omega-zero',
    style: 'correct',
    stem: 'A robot at $(1, 2, \\pi/6)$ (m, m, rad) is commanded $v = 0.5$ m/s and $\\omega = 0$ for 4 s. How do you find its new pose?',
    options: [
      {
        text: 'Drive straight: $(1 + 2\\cos\\frac{\\pi}{6},\\ 2 + 2\\sin\\frac{\\pi}{6}) = (2.732, 3.000)$, heading unchanged',
        correct: true,
        why: 'With $\\omega = 0$ the radius $v/\\omega$ is infinite: the arc becomes a straight line, $x\' = x + v\\Delta t\\cos\\theta$, $y\' = y + v\\Delta t\\sin\\theta$, with $v\\Delta t = 2$ m.',
      },
      {
        text: 'Substitute $\\omega = 0$ into the arc formula; the sine and cosine terms cancel and leave the answer',
        correct: false,
        why: '$v/\\omega$ is undefined at $\\omega = 0$, so nothing cancels to a number. The straight line is the **limit** $\\omega \\to 0$, and that is the formula to use.',
      },
      {
        text: 'Put a tiny $\\omega$ such as $10^{-6}$ rad/s into the arc formula, since the model cannot represent straight motion',
        correct: false,
        why: 'It can: the straight line is the exact $\\omega \\to 0$ case. A tiny $\\omega$ means a huge $r$ multiplying nearly equal sines, which rounds badly by hand.',
      },
      {
        text: 'The robot only turns on the spot, because $r = v/\\omega$ is undefined',
        correct: false,
        why: 'Turning on the spot is $v = 0$ ($r = 0$). With $\\omega = 0$ the radius is infinite and the robot drives straight.',
      },
    ],
    source: 'Notes §3 (the ω = 0 case); original',
    trapId: 'omega-zero',
    difficulty: 1,
  },
  {
    id: 'models-q-gamma',
    style: 'most-correct',
    stem: 'Why does the velocity motion model carry the extra rotation term $\\gamma$ in $\\theta\' = \\theta + \\omega\\Delta t + \\gamma\\Delta t$?',
    options: [
      {
        text: 'To let the final heading vary independently of where the robot ends up on its arc',
        correct: true,
        why: 'With noise on $v$ and $\\omega$ only, two random numbers decide three pose values, so the final heading is tied to where the robot ends up. A random final rotation $\\hat\\gamma$ frees it; with perfect actuation $\\gamma = 0$.',
      },
      {
        text: 'To convert the turn rate $\\omega$ from degrees per second to radians per second',
        correct: false,
        why: 'There is no unit conversion in the model: $\\omega$ is already in rad/s, and $\\gamma$ is a separate rotation rate.',
      },
      {
        text: 'To model wheel slip, which pushes the robot sideways off its arc',
        correct: false,
        why: '$\\gamma$ changes only the heading, never the position, so it cannot push the robot sideways; neither motion model sees slip.',
      },
      {
        text: 'To account for the time the robot needs to accelerate up to speed $v$',
        correct: false,
        why: 'The model assumes $(v, \\omega)$ are reached at once and held for $\\Delta t$; acceleration is not modelled at all.',
      },
    ],
    source: 'Notes §3; review deck slide 7 (θ′ = θ + ωΔt + γΔt)',
    difficulty: 3,
  },
  {
    id: 'models-q-banana',
    style: 'correct',
    stem: 'You sample the velocity motion model many times for the same command. Which change bends the cloud of end positions into a curved banana across the direction of travel?',
    options: [
      {
        text: 'More noise on the rotational velocity $\\omega$ ($\\alpha_3$, $\\alpha_4$)',
        correct: true,
        why: 'Each sampled $\\hat\\omega$ gives a different curvature for roughly the same distance travelled, so the end points fan out sideways along a curve: the banana.',
      },
      {
        text: 'More noise on the translational velocity $v$ ($\\alpha_1$, $\\alpha_2$)',
        correct: false,
        why: 'A different $\\hat v$ moves the robot further or less far for the same turn: the cloud stretches **along** the direction of travel, not across it.',
      },
      {
        text: 'More noise on the final rotation $\\gamma$ ($\\alpha_5$, $\\alpha_6$)',
        correct: false,
        why: '$\\hat\\gamma$ is applied after the move. It scatters the final heading only; every sample ends at the same position.',
      },
      {
        text: 'A longer time step $\\Delta t$, with all the noise switched off',
        correct: false,
        why: 'Without noise every sample is identical: one end pose, however long the step.',
      },
    ],
    source: 'Notes §3 (sampling the velocity model); original',
    difficulty: 2,
  },
  // ------------------------------------------------------------------ using the models in a filter
  {
    id: 'models-q-pf',
    style: 'correct',
    stem: 'In one cycle of a particle filter, how are the motion model and the sensor model used?',
    options: [
      {
        text: 'Each particle is moved by sampling the motion model, then weighted by the sensor model',
        correct: true,
        why: 'Sample $x_t^{[m]} \\sim p(x_t \\mid u_t, x_{t-1}^{[m]})$, then weight $w^{[m]} = p(z_t \\mid x_t^{[m]})$ (2023 Q5), then resample in proportion to the weights.',
      },
      {
        text: 'Each particle is weighted by the motion model, then moved by sampling the sensor model',
        correct: false,
        why: 'Swapped: the motion model takes the control $u_t$ and moves states; the sensor model scores a state against the reading $z_t$.',
      },
      {
        text: 'Both models are linearised at the mean particle to compute a Kalman gain',
        correct: false,
        why: 'That is the EKF. A particle filter never linearises: it pushes samples through the nonlinear models directly.',
      },
      {
        text: 'The sensor model moves the particles, and the motion model resamples them',
        correct: false,
        why: 'Resampling uses the weights, which come from the sensor model; moving the particles is the motion model’s job.',
      },
    ],
    source: 'Related: 2023 Q5; notes §2–3',
    difficulty: 1,
  },
  // ------------------------------------------------------------------ beam model
  {
    id: 'models-q-beam-not',
    style: 'incorrect',
    stem: 'Which of these is NOT one of the parts of the beam-based model of a range finder?',
    options: [
      {
        text: 'A Gaussian in the distance from the beam’s end point to the nearest obstacle',
        correct: true,
        why: 'Not a part: that is the likelihood-field (scan-based) model, which never compares the reading with a ray-cast range.',
      },
      {
        text: 'A Gaussian centred on the expected range $z^*$ found by ray casting',
        correct: false,
        why: 'A part: $p_{hit}$, the measurement noise round the true range.',
      },
      {
        text: 'An exponential that decays from 0 up to the expected range',
        correct: false,
        why: 'A part: $p_{short}$, unexpected objects in front of the mapped surface.',
      },
      {
        text: 'A spike at the maximum range $z_{max}$',
        correct: false,
        why: 'A part: $p_{max}$, missed returns reported as $z_{max}$.',
      },
      {
        text: 'A uniform density over the whole measurement range',
        correct: false,
        why: 'A part: $p_{rand}$, unexplained random readings.',
      },
    ],
    source: 'Review deck slide 6; notes §3',
    difficulty: 1,
  },
  {
    id: 'models-q-glass',
    style: 'most-correct',
    stem: 'A lidar is localising in front of a glass door. Many of its readings in that direction come back at exactly $z_{max}$. Which part of the beam model explains them?',
    options: [
      {
        text: '$p_{max}$: no echo came back from the glass, so it reports the maximum',
        correct: true,
        why: 'Glass, black and shiny surfaces often send nothing back, and the sensor then reports its maximum range: a spike exactly at $z_{max}$.',
      },
      {
        text: '$p_{hit}$: the glass is a real surface, so these are just noise round its range',
        correct: false,
        why: 'Hits cluster round the expected range $z^*$ of the door, not at the sensor’s maximum.',
      },
      {
        text: '$p_{short}$: something unexpected is standing in front of the door',
        correct: false,
        why: 'Short readings are **shorter** than $z^*$; these are as long as the sensor can report.',
      },
      {
        text: '$p_{rand}$: the readings are random, spread over the range',
        correct: false,
        why: 'Random readings are spread evenly; a pile-up at exactly one value, $z_{max}$, is the max part.',
      },
    ],
    source: 'Notes §3 (pmax: missed returns, e.g. glass)',
    difficulty: 1,
  },
  {
    id: 'models-q-crowd',
    style: 'most-correct',
    stem: 'People keep walking between a lidar and the wall it faces, which is $z^* = 6$ m away. How do the extra readings they cause look in a histogram of the ranges?',
    options: [
      {
        text: 'Shorter than 6 m, most often near the sensor, fewer towards the wall',
        correct: true,
        why: '$p_{short}$: the beam stops at the first person in its way, so nearer blockers are more likely, and nothing is read beyond the wall. The density is an exponential decay cut off at $z^*$.',
      },
      {
        text: 'Spread evenly between 0 m and 6 m, since a person could be anywhere along the beam',
        correct: false,
        why: 'A person near the sensor hides everyone behind them, so near readings are more likely: the short readings decay with range. An even spread is the $p_{rand}$ floor.',
      },
      {
        text: 'Piled up at exactly $z_{max}$, because the people block the beam',
        correct: false,
        why: 'That is $p_{max}$ (missed returns). A person reflects the beam, giving a short reading.',
      },
      {
        text: 'In a narrow peak just beyond 6 m, where the wall is',
        correct: false,
        why: 'Readings round 6 m are $p_{hit}$ noise from the wall itself; a person in front makes readings **shorter** than the wall, never longer.',
      },
    ],
    source: 'Notes §3 (pshort: unexpected objects); review deck slide 6',
    difficulty: 1,
  },
  {
    id: 'models-q-rand',
    style: 'correct',
    stem: 'Why does the beam model keep a small uniform part $z_{rand}\\, p_{rand}$?',
    options: [
      {
        text: 'So that a reading that no other part explains still gets a likelihood above zero',
        correct: true,
        why: 'A stray reading (crosstalk, a reflection) far from $z^*$ would otherwise score about 0, and multiplying it into the scan would give the true pose, and every particle near it, weight 0. The floor keeps the filter robust.',
      },
      {
        text: 'So that the four weights can add up to exactly 1 for every sensor',
        correct: false,
        why: 'The weights add to 1 whatever parts are included; $p_{rand}$ is there for robustness, not bookkeeping.',
      },
      {
        text: 'Because most real readings are spread uniformly over the whole range',
        correct: false,
        why: 'Most readings of a good sensor are hits round $z^*$; the uniform part is only a small floor.',
      },
      {
        text: 'To model the missed returns that come back at the maximum range',
        correct: false,
        why: 'Missed returns are the $p_{max}$ spike at $z_{max}$.',
      },
    ],
    source: 'Notes §3; review deck slide 6 (the flat floor of the plotted model)',
    difficulty: 2,
  },
  {
    id: 'models-q-sigma',
    style: 'correct',
    stem: 'In a beam model, $\\sigma_{hit}$ is doubled from 0.2 m to 0.4 m. What happens?',
    options: [
      {
        text: 'The hit peak becomes twice as wide and half as tall, so readings are trusted less',
        correct: true,
        why: 'The Gaussian’s area stays 1, so doubling $\\sigma$ halves its peak (from $1.99$ to $1.00\\ \\text{m}^{-1}$). Likelihoods then change more slowly with the pose: slower but more forgiving localisation.',
      },
      {
        text: 'The hit peak becomes twice as tall and half as wide, so readings are trusted more',
        correct: false,
        why: 'That is what halving $\\sigma_{hit}$ does (a more precise sensor).',
      },
      {
        text: 'The hit peak keeps its height but moves 0.2 m further from the sensor',
        correct: false,
        why: '$\\sigma_{hit}$ sets the spread, not the centre; the peak stays at $z^*$.',
      },
      {
        text: 'Only $z_{hit}$ changes; the shape of the peak stays exactly the same',
        correct: false,
        why: '$\\sigma_{hit}$ and the weight $z_{hit}$ are separate parameters: $\\sigma_{hit}$ sets the width of the peak, $z_{hit}$ how much of the probability it holds.',
      },
    ],
    source: 'Notes §3; original (see the beam sim)',
    difficulty: 1,
  },
  {
    id: 'models-q-characterise',
    style: 'most-correct',
    stem: 'How is the probabilistic beam model of a range sensor characterised in practice?',
    options: [
      {
        text: 'Fit the mixture by maximum likelihood to many readings taken at known true ranges',
        correct: true,
        why: 'Histogram the readings and choose the weights, $\\sigma_{hit}$ and $\\lambda_{short}$ that make the data most probable (in practice by expectation maximisation).',
      },
      {
        text: 'Read the noise figures from the datasheet and set every weight equal to 0.25',
        correct: false,
        why: 'A datasheet gives a range accuracy, not how often this environment produces short, max or random readings; equal weights would be arbitrary.',
      },
      {
        text: 'Take a single reading at a known distance and set $z^*$ equal to it',
        correct: false,
        why: 'One reading says nothing about the spread or the failure modes, and $z^*$ comes from ray casting the map, not from a reading.',
      },
      {
        text: 'Choose the parameters that make localisation converge fastest in the field',
        correct: false,
        why: 'Tuning for fast convergence makes the model overconfident; it should describe how the sensor really behaves.',
      },
    ],
    source: 'Review deck slide 5 (learning outcome); notes §3',
    difficulty: 1,
  },
  // ------------------------------------------------------------------ likelihood field and landmarks
  {
    id: 'models-q-field',
    style: 'incorrect',
    stem: 'About the likelihood-field (scan-based) sensor model:',
    options: [
      {
        text: 'It ray-casts every beam through the map to find the expected range $z^*$.',
        correct: true,
        why: 'This is the FALSE one: that is the beam model. The likelihood field only looks at where each beam ended.',
      },
      {
        text: 'It scores each beam’s end point by its distance to the nearest obstacle.',
        correct: false,
        why: 'True: a Gaussian in that distance, plus a random floor.',
      },
      {
        text: 'It is smoother in the robot’s pose than the beam model.',
        correct: false,
        why: 'True: the distance to the nearest obstacle changes continuously as the pose moves, while $z^*$ can jump at corners.',
      },
      {
        text: 'It ignores what the beam passed through on its way.',
        correct: false,
        why: 'True: it can “see through walls”, scoring an end point next to an obstacle the beam could never have reached.',
      },
      {
        text: 'It can be precomputed for the whole map as a lookup table.',
        correct: false,
        why: 'True: the distance to the nearest obstacle depends only on the map, so it is computed once.',
      },
    ],
    source: 'Notes §3 (scan-based model); review deck slide 5',
    difficulty: 2,
  },
  {
    id: 'models-q-forklift',
    style: 'best',
    stem: 'An autonomous forklift localises in a warehouse whose layout and tag locations are known. Its cameras detect each tag’s ID, range and bearing. Which measurement model fits best?',
    options: [
      {
        text: 'A landmark model on the tags, with the IDs settling data association',
        correct: true,
        why: 'The tags are distinct features at known places, and their IDs solve the correspondence problem, so comparing measured with predicted range and bearing is cheap and accurate.',
      },
      {
        text: 'A beam model on the camera images, ray casting each pixel through the map',
        correct: false,
        why: 'A camera does not give a range for every pixel, and ray casting would throw away exactly what makes the tags useful: their identities.',
      },
      {
        text: 'A likelihood field built from the tag positions alone',
        correct: false,
        why: 'A likelihood field scores range end points against obstacles in an occupancy map; a few isolated tags make a poor field, and the IDs would be wasted.',
      },
      {
        text: 'No sensor model: the known layout makes localisation a planning problem',
        correct: false,
        why: 'A known map makes it a localisation problem (2024 Q7), and localisation still needs a sensor model for the correction step.',
      },
    ],
    source: 'Scenario of 2024 Q7; notes §3 (landmark model)',
    difficulty: 2,
  },
  {
    id: 'models-q-realtime',
    style: 'best',
    stem: 'A particle filter with 3000 particles must localise a robot in real time from a 360-beam lidar in a static office whose occupancy map is known. Which sensor model fits best?',
    options: [
      {
        text: 'The likelihood field: one lookup per beam, and smooth in the pose',
        correct: true,
        why: 'With the distance table precomputed, scoring a beam is a lookup, so $360 \\times 3000$ beams per scan is affordable, and the smooth likelihood suits particles. A static office has few unexpected objects to model.',
      },
      {
        text: 'The beam model: ray cast all 360 beams for each of the 3000 particles',
        correct: false,
        why: 'About $10^6$ ray casts per scan is the expensive option, and its spiky likelihood is harder on particles. Its extra modelling of people and glass buys little in a static office.',
      },
      {
        text: 'A landmark model that treats every lidar return as a separate landmark',
        correct: false,
        why: 'Raw returns are not distinctive features: there is no way to tell which return belongs to which landmark (no data association).',
      },
      {
        text: 'No sensor model at all: indoor odometry is accurate enough',
        correct: false,
        why: 'Odometry drifts without bound; without a sensor model there is no correction step.',
      },
    ],
    source: 'Notes §3; review deck slide 5 (learning outcome)',
    difficulty: 2,
  },
];

export const games: Game[] = [
  {
    kind: 'sort',
    id: 'models-g-vel-odo',
    title: 'Velocity model, odometry model, or both?',
    prompt: 'Both motion models feed the prediction step; they differ in where their control comes from and when it is known (2023 Q6, 2024 Q6, 2025 Q6). Sort each property: is it true of the velocity model only, the odometry model only, or both?',
    buckets: [
      { id: 'vel', label: 'Velocity model only' },
      { id: 'odo', label: 'Odometry model only' },
      { id: 'both', label: 'Both models' },
    ],
    items: [
      { id: 'v1', text: 'Its control is the commanded $(v, \\omega)$', bucket: 'vel', why: 'The velocity model takes the command itself, held constant for $\\Delta t$.' },
      { id: 'v2', text: 'Its control is known before the robot moves', bucket: 'vel', why: 'A command exists before it is executed, so its outcome can be predicted in advance.' },
      { id: 'v3', text: 'Can be used for motion planning', bucket: 'vel', why: 'It predicts where an untried command will go: the RRT steering function of 2023 Q32 (the key of 2024 Q6).' },
      { id: 'v4', text: 'Each path segment is a circular arc of radius $v/\\omega$', bucket: 'vel', why: 'Constant $(v, \\omega)$ traces a circle (2023 Q32(a)).' },
      { id: 'v5', text: 'Has an extra final rotation term $\\gamma$', bucket: 'vel', why: '$\\theta\' = \\theta + \\omega\\Delta t + \\gamma\\Delta t$: $\\gamma$ frees the final heading in the noisy model.' },
      { id: 'v6', text: 'Needs a separate formula when the turn rate is zero', bucket: 'vel', why: 'The arc formula divides by $\\omega$; at $\\omega = 0$ use the straight line.' },
      { id: 'o1', text: 'Relies on proprioceptive data', bucket: 'odo', why: 'Wheel encoders sense the robot’s own motion (the key of 2025 Q6).' },
      { id: 'o2', text: 'Its control only exists after the robot has moved', bucket: 'odo', why: 'Encoder counts build up during the motion, which is why it cannot plan (2023 Q6).' },
      { id: 'o3', text: 'Usually the more accurate of the two', bucket: 'odo', why: 'It measures what the wheels actually did rather than what was commanded (2024 Q6 (d), 2025 Q6 (d) are false).' },
      { id: 'o4', text: 'Splits each motion into rotate, translate, rotate', bucket: 'odo', why: '$u_t = (\\delta_{rot1}, \\delta_{trans}, \\delta_{rot2})$, with independent noise on each piece.' },
      { id: 'b1', text: 'Used in the prediction step of a Bayes filter', bucket: 'both', why: 'Both are motion models $p(x_t \\mid u_t, x_{t-1})$; neither is used in the measurement step (2024 Q6 (a), 2025 Q6 (c)).' },
      { id: 'b2', text: 'Blind to wheel slip', bucket: 'both', why: 'The command and the encoder count both describe the wheels, not the ground: slip is only caught by the sensor model.' },
      { id: 'b3', text: 'Its noise grows with the size of the motion', bucket: 'both', why: 'Both scale their noise with speed or distance through $\\alpha$ parameters: a robot standing still does not drift.' },
    ],
    source: 'Notes §3; 2023 Q6, 2024 Q6, 2025 Q6; 2023 Q32(a)',
  },
  {
    kind: 'match',
    id: 'models-g-beam-causes',
    title: 'Beam model: what causes each part?',
    prompt: 'Each part of the beam model $p(z \\mid x, m)$ stands for a physical effect, and its shape follows from that effect (review deck slide 6). Match each part or parameter to its cause.',
    pairs: [
      {
        id: 'p1',
        left: '$p_{hit}$: a Gaussian round the expected range $z^*$',
        right: 'A correct return from the mapped surface, blurred by measurement noise',
        why: 'Correct readings scatter symmetrically round the true range, hence a Gaussian centred on $z^*$.',
      },
      {
        id: 'p2',
        left: '$p_{short}$: an exponential from 0 up to $z^*$',
        right: 'People or clutter that are not on the map, standing in front of the wall',
        why: 'The beam stops at the first unexpected object, so near ones are more likely, and none can be beyond the wall.',
      },
      {
        id: 'p3',
        left: '$p_{max}$: a spike at $z_{max}$',
        right: 'No echo came back (glass, black or shiny surfaces), so the maximum is reported',
        why: 'A failure always gives the same value, $z_{max}$, hence a spike rather than a spread.',
      },
      {
        id: 'p4',
        left: '$p_{rand}$: a uniform floor over $[0, z_{max}]$',
        right: 'Unexplained readings: crosstalk, multiple reflections, sunlight',
        why: 'With no structure to model, spread them evenly; the floor also keeps every likelihood above zero.',
      },
      {
        id: 'p5',
        left: 'A large $\\sigma_{hit}$',
        right: 'An imprecise sensor, or a map that is only roughly right',
        why: '$\\sigma_{hit}$ is the spread of correct readings: larger for a coarse sensor or an inaccurate map.',
      },
      {
        id: 'p6',
        left: 'A large $\\lambda_{short}$',
        right: 'A cluttered space, where blockers are usually met close to the sensor',
        why: 'The exponential decays faster: the more unexpected objects per metre, the sooner the beam meets one.',
      },
    ],
    source: 'Notes §3; review deck slide 6',
  },
  {
    kind: 'sort',
    id: 'models-g-which-sensor',
    title: 'Beam, likelihood field or landmark model?',
    prompt: 'The three measurement models trade physical fidelity, speed and the need for features (review deck slide 5). Sort each property or scenario into the model it describes or suits best.',
    buckets: [
      { id: 'beam', label: 'Beam-based' },
      { id: 'field', label: 'Likelihood field (scan-based)' },
      { id: 'landmark', label: 'Landmark-based' },
    ],
    items: [
      { id: 's1', text: 'Ray-casts each beam through the map to get $z^*$', bucket: 'beam', why: 'The expected range comes from tracing the ray: faithful, but expensive.' },
      { id: 's2', text: 'Has a spike at $z_{max}$ for missed returns', bucket: 'beam', why: 'That is $p_{max}$; the likelihood field instead discards max-range readings.' },
      { id: 's3', text: 'Models people passing in front of the sensor explicitly', bucket: 'beam', why: '$p_{short}$ captures unexpected objects; the likelihood field lumps them into random noise.' },
      { id: 's4', text: 'Its likelihood can jump as the pose slides past a corner', bucket: 'beam', why: '$z^*$ changes abruptly when a beam starts or stops grazing an edge, so the likelihood is spiky in the pose.' },
      { id: 'f1', text: 'Scores each beam’s end point by its distance to the nearest obstacle', bucket: 'field', why: 'That distance, through a Gaussian plus a random floor, is the whole model.' },
      { id: 'f2', text: 'Is a lookup table precomputed over the map', bucket: 'field', why: 'The distance to the nearest obstacle depends only on the map, so it is computed once.' },
      { id: 'f3', text: 'Can “see through walls”', bucket: 'field', why: 'It ignores the ray’s path: an end point next to an unreachable obstacle still scores well.' },
      { id: 'f4', text: 'Best fit for thousands of particles and a dense lidar in real time', bucket: 'field', why: 'One lookup per beam and a likelihood that is smooth in the pose.' },
      { id: 'l1', text: 'Needs data association: which measurement belongs to which feature', bucket: 'landmark', why: 'Each measured range and bearing must be matched to the right landmark before it can be scored.' },
      { id: 'l2', text: 'Compares measured and predicted range and bearing', bucket: 'landmark', why: 'The prediction comes from the pose and the landmark’s position on the map.' },
      { id: 'l3', text: 'A forklift seeing ID tags at known places (2024 Q7)', bucket: 'landmark', why: 'Distinct features with IDs: compact, and the IDs solve data association.' },
      { id: 'l4', text: 'Throws away everything that is not a recognised feature', bucket: 'landmark', why: 'Compact, but walls and clutter that are not features carry no information in it.' },
    ],
    source: 'Notes §3; review deck slide 5; 2024 Q7 scenario',
  },
];

export const shortAnswers: ShortAnswer[] = [
  {
    id: 'models-sa-arc',
    prompt: '**(1 mark)** In no more than 30 words: an RRT for a differential-drive robot uses the velocity motion model as its steering function. What shape will each path segment be?',
    wordLimit: 30,
    model: 'Circular arcs: with $(v, \\omega)$ held constant the robot turns about a fixed centre at radius $r = v/\\omega$ (a straight line if $\\omega = 0$).',
    keyPoints: ['circular arcs', 'radius $r = v/\\omega$, because $v$ and $\\omega$ are constant', 'a straight line when $\\omega = 0$'],
    source: 'Similar to 2023 Q32(a)',
    marks: 1,
  },
  {
    id: 'models-sa-two-step',
    prompt: '**(6 marks)** A differential-drive robot starts at $(1.1, -2.7)$ m with a heading of 0 rad and executes two steering commands for $\\Delta t = 2$ s each: $(v, \\omega, \\gamma) = (1.2, 0.15, 0)$, then $(0.5, -0.2, 0)$. Show that after 4 s it is at $(4.45, -2.24)$ m with a heading of $-0.1$ rad. Show your working (no more than 150 words and numbers).',
    wordLimit: 150,
    model: 'Velocity model with $\\gamma = 0$ and $r = v/\\omega$, angles in radians:\n\n$$x\' = x - r\\sin\\theta + r\\sin(\\theta + \\omega\\Delta t), \\qquad y\' = y + r\\cos\\theta - r\\cos(\\theta + \\omega\\Delta t), \\qquad \\theta\' = \\theta + \\omega\\Delta t$$\n\n**Step 1**, from $(1.1, -2.7, 0)$: $r = 1.2/0.15 = 8$ m and $\\omega\\Delta t = 0.3$ rad.\n\n$$\\begin{aligned} x_1 &= 1.1 - 8\\sin 0 + 8\\sin 0.3 = 1.1 + 2.36416 = 3.4642\\ \\text{m} \\\\ y_1 &= -2.7 + 8\\cos 0 - 8\\cos 0.3 = -2.7 + 0.35731 = -2.3427\\ \\text{m} \\\\ \\theta_1 &= 0 + 0.3 = 0.3\\ \\text{rad} \\end{aligned}$$\n\n**Step 2**, from step 1’s pose, carrying $\\theta_1 = 0.3$ rad: $r = 0.5/(-0.2) = -2.5$ m (clockwise) and $\\omega\\Delta t = -0.4$ rad, so $\\theta_1 + \\omega\\Delta t = -0.1$ rad.\n\n$$\\begin{aligned} x_2 &= 3.46416 + 2.5\\sin 0.3 - 2.5\\sin(-0.1) = 3.46416 + 0.73880 + 0.24958 = 4.4525\\ \\text{m} \\\\ y_2 &= -2.34269 - 2.5\\cos 0.3 + 2.5\\cos(-0.1) = -2.34269 - 2.38834 + 2.48751 = -2.2435\\ \\text{m} \\\\ \\theta_2 &= 0.3 - 0.4 = -0.1\\ \\text{rad} \\end{aligned}$$\n\nSo after 4 s the robot is at **(4.45, −2.24) m with a heading of −0.1 rad**, as required.',
    keyPoints: [
      'the velocity-model equations with $r = v/\\omega$, in radians',
      'step 1: $r = 8$ m, $\\omega\\Delta t = 0.3$ rad, giving $(3.4642, -2.3427, 0.3)$',
      'step 2 starts from step 1’s pose, carrying $\\theta_1 = 0.3$ rad',
      'step 2: $r = -2.5$ m (sign kept), $\\omega\\Delta t = -0.4$ rad',
      'final pose $(4.4525, -2.2435)$ m with $\\theta = -0.1$ rad',
    ],
    source: 'Similar to 2023 Q32(b)',
    marks: 6,
  },
  {
    id: 'models-sa-one-step',
    prompt: '**(3 marks)** In no more than 100 words: how does the velocity motion model simulate the movement of a 2D planar robot over a single timestep?',
    wordLimit: 100,
    model: 'The control is a commanded translational velocity $v$ and rotational velocity $\\omega$, held constant over the timestep $\\Delta t$. With both constant, the robot moves on a circular arc of radius $r = v/\\omega$ about a centre beside it, $(x - r\\sin\\theta,\\ y + r\\cos\\theta)$, turning through $\\omega\\Delta t$: $x\' = x - r\\sin\\theta + r\\sin(\\theta + \\omega\\Delta t)$ and $y\' = y + r\\cos\\theta - r\\cos(\\theta + \\omega\\Delta t)$. A final rotation $\\gamma$ gives $\\theta\' = \\theta + \\omega\\Delta t + \\gamma\\Delta t$. In the probabilistic version, $v$, $\\omega$ and $\\gamma$ are first perturbed by zero-mean noise whose variance grows with the speeds, giving a distribution of end poses.',
    keyPoints: [
      'control $(v, \\omega)$ held constant over $\\Delta t$',
      'the robot follows a circular arc of radius $v/\\omega$ about a centre of rotation (straight if $\\omega = 0$)',
      'the update equations for $x\'$ and $y\'$, and $\\theta\' = \\theta + \\omega\\Delta t + \\gamma\\Delta t$',
      'noise on $v$, $\\omega$ and $\\gamma$ (growing with speed) gives a distribution of end poses',
    ],
    source: 'Review deck slide 6',
    marks: 3,
  },
  {
    id: 'models-sa-review-pose',
    prompt: '**(3 marks)** A robot with initial state $(0, 0, 0)$ is commanded to move at $v = 0.8$ m/s, $\\omega = 0.03$ rad/s and $\\gamma = 0$ rad/s. Calculate its pose after 2 s, assuming perfect actuation. Show your working (no more than 60 words and numbers).',
    wordLimit: 60,
    model: '$r = v/\\omega = 0.8/0.03 = 26.67$ m and $\\omega\\Delta t = 0.06$ rad.\n\n$x\' = 0 - 26.67\\sin 0 + 26.67\\sin 0.06 = 1.5990$ m\n\n$y\' = 0 + 26.67\\cos 0 - 26.67\\cos 0.06 = 0.04799$ m\n\n$\\theta\' = 0 + 0.03 \\times 2 + 0 \\times 2 = 0.06$ rad\n\nThe pose is **(1.5990 m, 0.0480 m, 0.06 rad)**.',
    keyPoints: [
      '$r = 26.67$ m and $\\omega\\Delta t = 0.06$ rad (in radians)',
      '$x\' = 1.5990$ m',
      '$y\' = 0.04799$ m',
      '$\\theta\' = 0.06$ rad',
    ],
    source: 'Review deck slides 6–7',
    marks: 3,
  },
  {
    id: 'models-sa-beam',
    prompt: '**(4 marks)** In no more than 100 words: what are the components that make up the beam-based sensor model? Name the physical effect each one represents.',
    wordLimit: 100,
    model: 'The beam model is a weighted mixture of four densities over $[0, z_{max}]$, with weights that add to 1, built round the expected range $z^*$ from ray casting the map. (1) $p_{hit}$, a Gaussian centred on $z^*$: measurement noise. (2) $p_{short}$, an exponential decaying from 0 to $z^*$: unexpected objects such as people in front of the mapped surface, nearer ones more likely to be hit first. (3) $p_{max}$, a spike at $z_{max}$: missed returns from glass, black or shiny surfaces. (4) $p_{rand}$, a uniform density: unexplained random readings such as crosstalk.',
    keyPoints: [
      'a weighted mixture (weights add to 1) round the ray-cast expected range $z^*$',
      '$p_{hit}$: Gaussian at $z^*$, measurement noise',
      '$p_{short}$: exponential below $z^*$, unexpected objects',
      '$p_{max}$: spike at $z_{max}$, missed returns (glass, black surfaces)',
      '$p_{rand}$: uniform, unexplained random readings',
    ],
    source: 'Review deck slide 6; notes §3',
    marks: 4,
  },
  {
    id: 'models-sa-vel-odo',
    prompt: '**(3 marks)** In no more than 100 words: compare the velocity and odometry motion models. When would you use each?',
    wordLimit: 100,
    model: 'Both are motion models $p(x_t \\mid u_t, x_{t-1})$ used in the prediction step. The **velocity model** takes the commanded $(v, \\omega)$, known before the robot moves, and predicts an arc of radius $v/\\omega$, so it can be used for planning and control (for example as an RRT steering function). The **odometry model** takes the wheel-encoder motion $(\\delta_{rot1}, \\delta_{trans}, \\delta_{rot2})$, which is proprioceptive and only available after moving, so it cannot plan; but it is usually more accurate, because it measures what the wheels really did. Use odometry for state estimation when encoders are available. Neither sees wheel slip.',
    keyPoints: [
      'both are motion models used in the prediction step',
      'velocity: commanded $(v, \\omega)$, known in advance, usable for planning',
      'odometry: proprioceptive encoder readings, only after the motion, not for planning',
      'odometry is usually more accurate (it measures the actual wheel motion)',
      'use the velocity model to predict or plan ahead, odometry for estimation',
    ],
    source: 'Review deck slide 5 (learning outcome); 2023 Q6, 2024 Q6, 2025 Q6',
    marks: 3,
  },
  {
    id: 'models-sa-sample',
    prompt: '**(3 marks)** In no more than 100 words: describe how a particle filter samples a new pose for one particle from the odometry motion model.',
    wordLimit: 100,
    model: 'From the odometry readings $\\bar x_{t-1}$ and $\\bar x_t$, compute the relative motion: $\\delta_{rot1} = \\operatorname{atan2}(\\Delta\\bar y, \\Delta\\bar x) - \\bar\\theta$, $\\delta_{trans} = \\sqrt{\\Delta\\bar x^2 + \\Delta\\bar y^2}$ and $\\delta_{rot2} = \\Delta\\bar\\theta - \\delta_{rot1}$. Perturb each of the three with zero-mean noise whose variance grows with the rotations and the translation ($\\alpha_1 \\dots \\alpha_4$). Then apply the noisy rotate–translate–rotate to the particle’s own pose: $x\' = x + \\hat\\delta_{trans}\\cos(\\theta + \\hat\\delta_{rot1})$, $y\' = y + \\hat\\delta_{trans}\\sin(\\theta + \\hat\\delta_{rot1})$, $\\theta\' = \\theta + \\hat\\delta_{rot1} + \\hat\\delta_{rot2}$. Fresh noise for every particle spreads the set into the predicted distribution.',
    keyPoints: [
      'compute $(\\delta_{rot1}, \\delta_{trans}, \\delta_{rot2})$ from consecutive odometry readings',
      'add zero-mean noise to each, with variance growing with the motion ($\\alpha$ parameters)',
      'apply rotate–translate–rotate to the particle’s own pose',
      'fresh noise per particle gives the predicted distribution',
    ],
    source: 'Review deck slide 5 (learning outcome: sampling the motion models); notes §3',
    marks: 3,
  },
  {
    id: 'models-sa-characterise',
    prompt: '**(3 marks)** In no more than 80 words: describe the process of characterising a range sensor’s probabilistic (beam) model.',
    wordLimit: 80,
    model: 'Place the sensor at a set of known distances from a target, so the true range $z^*$ is known, and record many readings at each. Histogram them: they show the hit peak, short readings, max-range spikes and a random floor. Then choose the parameters (the weights $z_{hit}, z_{short}, z_{max}, z_{rand}$, $\\sigma_{hit}$ and $\\lambda_{short}$) that maximise the likelihood of the recorded data, in practice by expectation maximisation, and check that the fitted mixture matches the histogram.',
    keyPoints: [
      'many readings at known true ranges',
      'histogram the readings',
      'fit the weights, $\\sigma_{hit}$ and $\\lambda_{short}$ by maximum likelihood (EM)',
      'check that the fitted mixture matches the histogram',
    ],
    source: 'Review deck slide 5 (learning outcome); notes §3',
    marks: 3,
  },
  {
    id: 'models-sa-compare-sensors',
    prompt: '**(4 marks)** In no more than 120 words: describe and compare beam-based, scan-based (likelihood field) and landmark-based measurement models.',
    wordLimit: 120,
    model: 'The **beam model** ray-casts each beam through the map from the pose to get the expected range, then scores the reading with a four-part mixture (hit noise, short readings from unexpected objects, max-range misses, random readings). It models the physics best but is expensive and spiky in the pose. The **likelihood field** scores each beam’s end point by its distance to the nearest obstacle, a lookup precomputed for the map: fast and smooth, but it ignores the free space the beam crossed and drops max-range readings. The **landmark model** compares the measured range and bearing to detected features with those predicted from the map: compact and cheap, but it needs feature detection and correct data association, and discards the rest of the data.',
    keyPoints: [
      'beam: ray cast plus four-part mixture; most faithful, but slow and not smooth in the pose',
      'likelihood field: end-point distance to the nearest obstacle; precomputed, fast, smooth',
      'likelihood field ignores the ray’s path (sees through walls) and drops max-range readings',
      'landmark: range and bearing to features; compact',
      'landmark needs feature detection and data association',
    ],
    source: 'Review deck slide 5 (learning outcome); notes §3',
    marks: 4,
  },
  {
    id: 'models-sa-fiducials',
    prompt: '**(2 marks)** In no more than 60 words: a robot localises from fiducial markers (such as AprilTags) whose poses and sizes are known. In theory, how many markers must it observe to localise itself? Why might it be a good idea to observe more?',
    wordLimit: 60,
    model: 'In theory **one**: with the marker’s pose and size known, its four detected corners give enough 2D–3D correspondences to solve for the camera’s full pose (PnP), and hence the robot’s. Observing more helps because every detection is noisy and a single small marker is ambiguous at range or face-on; redundant markers average out noise, widen the baseline and survive occlusion or a misdetection.',
    keyPoints: [
      'one marker (pose and size known)',
      'its corners give the full 6-DOF pose (PnP)',
      'each detection is noisy, and one marker can be ambiguous',
      'more markers: averaging, a wider baseline, robustness to occlusion or misdetection',
    ],
    source: 'Similar to 2023 Q23',
    marks: 2,
  },
];
