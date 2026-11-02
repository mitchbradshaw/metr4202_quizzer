// MCQs (original wording, cited to the past papers), method games and exam-style short answers for 'slam'.
// Covers every mapping/SLAM MCQ of 2023–2025 (2023 Q7, Q8; 2024 Q7, Q8; 2025 Q7, Q8), the short answers
// (2023 Q22, Q24, Q31; 2024 Q23; 2025 Q22, Q23) and the review deck's practice questions (slides 8–13), plus originals.
import type { Game, MCQ, ShortAnswer } from '../../engine/types';

export const mcqs: MCQ[] = [
  // ------------------------------------------------------------------ which problem
  {
    id: 'slam-q-satellite',
    style: 'best',
    stem: 'An Earth-observation satellite always knows its exact pose, from ground-station tracking and GPS. Its job is to combine many surface temperature readings into a single temperature image of the region below. Which problem is it solving?',
    options: [
      {
        text: 'Localisation',
        correct: false,
        why: 'Localisation estimates an unknown pose against a known map. Here the pose is already known exactly, and it is the map (the temperature image) that is missing.',
      },
      {
        text: 'Mapping',
        correct: true,
        why: 'The pose is known and only the map is unknown: building a map from known poses is exactly the mapping problem.',
      },
      {
        text: 'SLAM',
        correct: false,
        why: 'SLAM is needed only when the pose is unknown as well. Building a map is not enough to make a problem SLAM.',
      },
      {
        text: 'None of the above',
        correct: false,
        why: 'A known pose with an unknown map is one of the three standard problems: mapping.',
      },
    ],
    source: 'Recurring: 2023 Q7 (mirrored by 2024 Q7 and 2025 Q7)',
    fixedOrder: true,
    difficulty: 1,
  },
  {
    id: 'slam-q-when-slam',
    style: 'most-correct',
    stem: 'A mobile robot has to solve the SLAM problem to navigate when it:',
    options: [
      {
        text: 'knows its pose but not the map',
        correct: false,
        why: 'That is mapping: with the pose known, each part of the map can be estimated directly.',
      },
      {
        text: 'knows the map but not its pose',
        correct: false,
        why: 'That is localisation: the robot estimates its pose against the map it was given.',
      },
      {
        text: 'knows both its pose and the map',
        correct: false,
        why: 'Then there is nothing to estimate: the robot can plan and act straight away.',
      },
      {
        text: 'has neither a map nor its pose',
        correct: true,
        why: 'SLAM is the case where both are unknown, so each has to be estimated together with the other.',
      },
    ],
    source: 'Recurring: 2023 Q8 (2024 Q8 asks the same from the other side)',
    difficulty: 1,
  },
  {
    id: 'slam-q-forklift',
    style: 'best',
    stem: 'A forklift moves pallets around a warehouse. It is given the floor plan and the surveyed positions of fiducial tags fixed to the racks, which its cameras can detect. To navigate, the forklift needs to perform:',
    options: [
      {
        text: 'Localisation',
        correct: true,
        why: 'The map, tag positions included, is given; only the forklift’s pose is unknown. Detecting known tags and solving for the pose is localisation.',
      },
      {
        text: 'Mapping',
        correct: false,
        why: 'Nothing about the map is unknown: the layout and the tags were provided.',
      },
      {
        text: 'SLAM',
        correct: false,
        why: 'SLAM is for when the map has to be built as well. Here it is given.',
      },
      {
        text: 'All of the above',
        correct: false,
        why: 'Only the pose is unknown, so only localisation is needed; mapping and SLAM would re-estimate a map it already has.',
      },
    ],
    source: 'Recurring: 2024 Q7 (mirror of 2023 Q7)',
    fixedOrder: true,
    difficulty: 1,
  },
  {
    id: 'slam-q-solves',
    style: 'most-correct',
    stem: 'The SLAM problem estimates:',
    options: [
      {
        text: 'the robot’s pose only',
        correct: false,
        why: 'That is localisation, which needs the map to be given.',
      },
      {
        text: 'the map only',
        correct: false,
        why: 'That is mapping, which needs the pose to be given.',
      },
      {
        text: 'both the pose and the map',
        correct: true,
        why: 'Both are unknown and each depends on the other, so SLAM estimates them together: simultaneous localisation and mapping.',
      },
      {
        text: 'the likelihood of the sensor model',
        correct: false,
        why: 'The sensor model $p(z \\mid x)$ is an input to every estimator, not the thing SLAM solves for.',
      },
    ],
    source: 'Recurring: 2024 Q8 (2023 Q8 asks the same from the other side)',
    difficulty: 1,
  },
  {
    id: 'slam-q-lunar',
    style: 'best',
    stem: 'A rover is landed on the Moon with one job: to produce a reconstruction of the lunar surface around its landing site. To do this, the rover must perform:',
    options: [
      {
        text: 'Localisation',
        correct: false,
        why: 'Localisation needs a map to localise against, but the map is the very thing the rover has to produce.',
      },
      {
        text: 'Mapping',
        correct: false,
        why: 'Mapping assumes a known pose. There is no GPS on the Moon, and wheel odometry drifts on loose regolith, so the pose is unknown too.',
      },
      {
        text: 'SLAM',
        correct: true,
        why: 'No prior map (it is the product) and no GPS (so no external pose): both are unknown and must be estimated together.',
      },
      {
        text: 'None of the above',
        correct: false,
        why: 'An unknown pose with an unknown map is the standard SLAM problem.',
      },
    ],
    source: 'Recurring: 2025 Q7 (mirror of 2023 Q7)',
    fixedOrder: true,
    difficulty: 1,
  },
  {
    id: 'slam-q-online',
    style: 'most-correct',
    stem: 'Online SLAM estimates:',
    options: [
      {
        text: 'only the map',
        correct: false,
        why: 'That is the mapping problem, with the poses given.',
      },
      {
        text: 'only the current robot pose',
        correct: false,
        why: 'That is localisation, which needs a known map.',
      },
      {
        text: 'the current robot pose and the map',
        correct: true,
        why: 'Online SLAM keeps the latest pose and the map, $p(x_t, m \\mid z_{1:t}, u_{1:t})$; past poses are integrated out as it goes.',
      },
      {
        text: 'the full robot trajectory and the map',
        correct: false,
        why: 'That is **full** SLAM, $p(x_{1:t}, m \\mid z_{1:t}, u_{1:t})$, the distractor in this question.',
      },
    ],
    source: 'Recurring: 2025 Q8',
    difficulty: 1,
  },
  {
    id: 'slam-q-full',
    style: 'most-correct',
    stem: 'Full SLAM, as opposed to online SLAM, estimates:',
    options: [
      {
        text: 'the whole trajectory $x_{1:t}$ and the map',
        correct: true,
        why: 'Full SLAM keeps every pose, $p(x_{1:t}, m \\mid z_{1:t}, u_{1:t})$. Graph SLAM solves it by optimising the whole trajectory at once.',
      },
      {
        text: 'the current pose $x_t$ and the map',
        correct: false,
        why: 'That is online SLAM, which integrates the past poses out.',
      },
      {
        text: 'the whole trajectory $x_{1:t}$, given a known map',
        correct: false,
        why: 'With the map known this is localisation over the whole path, not SLAM.',
      },
      {
        text: 'the map, given the full trajectory',
        correct: false,
        why: 'With the trajectory given, this is mapping with known poses.',
      },
    ],
    source: 'Notes §4; review deck slide 9 (the counterpart of 2025 Q8)',
    difficulty: 2,
  },
  // ------------------------------------------------------------------ occupancy update
  {
    id: 'slam-q-prior',
    style: 'best',
    stem: 'A robot has no information at all about whether a particular grid cell is occupied. Which prior occupancy probability should it use?',
    options: [
      {
        text: '0.5, which is log-odds 0',
        correct: true,
        why: 'With no information, occupied and free are equally likely. $l_0 = 0$ adds no bias, and every later reading can move the cell.',
      },
      {
        text: '0, so that unexplored space counts as free',
        correct: false,
        why: 'A prior of 0 is certainty: the numerator $p(z \\mid m) \\cdot 0$ is 0 for every reading, so the cell could never become occupied.',
      },
      {
        text: '1, so that the robot stays cautious near unexplored space',
        correct: false,
        why: 'Certainty again (log-odds $+\\infty$): no number of FREE readings could ever clear the cell.',
      },
      {
        text: '0.7, the sensor’s true-positive rate',
        correct: false,
        why: 'TP describes the sensor, $p(\\text{occ} \\mid m)$, not the world. The prior is what you believe about the cell before any reading.',
      },
    ],
    source: 'Similar to 2023 Q31(a); review deck slide 9; 2025 Q22',
    trapId: 'prior-0-1',
    difficulty: 1,
  },
  {
    id: 'slam-q-prior01',
    style: 'incorrect',
    stem: 'About the initial occupancy probability of a cell in a binary Bayes filter:',
    options: [
      {
        text: 'A prior of 1 is a safe choice for cells beside a mapped wall, because a few FREE readings can still bring it down if the wall is moved.',
        correct: true,
        why: 'This is the FALSE statement. With $p(m) = 1$ the term $p(z \\mid \\neg m)\\,(1 - p(m))$ is 0, so every update returns exactly 1: no number of FREE readings can ever lower it.',
      },
      {
        text: 'A prior of 0 or 1 corresponds to log-odds $-\\infty$ or $+\\infty$.',
        correct: false,
        why: 'True: $\\ln(0/1) = -\\infty$ and $\\ln(1/0) = +\\infty$.',
      },
      {
        text: 'With a prior of 0, Bayes’ rule returns 0 after every reading, whatever the reading is.',
        correct: false,
        why: 'True: the numerator $p(z \\mid m) \\cdot 0$ is 0 while the denominator is not, so the posterior stays 0.',
      },
      {
        text: 'A prior of 0.5 is log-odds 0, so it adds no bias to the sum of the readings’ steps.',
        correct: false,
        why: 'True: with $l_0 = 0$ the cell’s log-odds is just the sum of the evidence from its readings.',
      },
    ],
    source: 'Similar to 2025 Q22; Notes §4',
    trapId: 'prior-0-1',
    difficulty: 1,
  },
  {
    id: 'slam-q-fp',
    style: 'value',
    stem: 'A range sensor reports an occupied cell as occupied with probability 0.8 (true positive) and a free cell as free with probability 0.9 (true negative). What is its false-positive probability $p(z = \\text{occ} \\mid \\neg m)$?',
    options: [
      {
        text: '0.1',
        correct: true,
        why: 'The $\\neg m$ row sums to 1: $p(\\text{occ} \\mid \\neg m) = 1 - p(\\text{free} \\mid \\neg m) = 1 - 0.9 = 0.1$.',
      },
      {
        text: '0.2',
        correct: false,
        why: '$1 - \\text{TP} = 0.2$ is the **miss** rate, $p(\\text{free} \\mid m)$, which lives in the $m$ row.',
      },
      {
        text: '0.9',
        correct: false,
        why: 'That is the true-negative rate itself, $p(\\text{free} \\mid \\neg m)$.',
      },
      {
        text: '0.8',
        correct: false,
        why: 'That is the true-positive rate, $p(\\text{occ} \\mid m)$: the right column but the wrong row.',
      },
    ],
    source: 'Notes §4 (sensor table); 2023 Q31; review deck slide 11',
    trapId: 'false-positive',
    difficulty: 1,
  },
  {
    id: 'slam-q-occ-value',
    style: 'value',
    stem: 'A cell starts at 0.5. The sensor has TP 0.75 and TN 0.9, and its first reading is OCCUPIED. What is the cell’s occupancy probability now?',
    options: [
      {
        text: '0.882',
        correct: true,
        why: '$\\dfrac{0.75(0.5)}{0.75(0.5) + 0.1(0.5)} = \\dfrac{0.375}{0.425} = 0.882$, with the false-positive rate $1 - \\text{TN} = 0.1$.',
      },
      {
        text: '0.750',
        correct: false,
        why: 'That is TP itself, which is also what you get by taking the false-positive rate as $1 - \\text{TP} = 0.25$: with a 0.5 prior, $0.375 / (0.375 + 0.125) = 0.75$. The false-positive rate is $1 - \\text{TN} = 0.1$.',
      },
      {
        text: '0.375',
        correct: false,
        why: 'That is only the numerator $p(\\text{occ} \\mid m)\\,p(m)$: it still has to be divided by $p(\\text{occ}) = 0.425$.',
      },
      {
        text: '0.455',
        correct: false,
        why: 'This uses TN (0.9) in place of the false-positive rate: $0.375 / (0.375 + 0.45) = 0.455$. TN is $p(\\text{free} \\mid \\neg m)$, from the other column.',
      },
    ],
    source: 'Similar to 2023 Q31(b); review deck slide 10',
    trapId: 'false-positive',
    difficulty: 2,
  },
  {
    id: 'slam-q-free-value',
    style: 'value',
    stem: 'TP 0.7, TN 0.95. After one OCCUPIED reading the cell is at 0.9333. The next reading is FREE. What is the occupancy probability now?',
    options: [
      {
        text: '0.8155',
        correct: true,
        why: '$\\dfrac{0.3(0.9333)}{0.3(0.9333) + 0.95(0.0667)} = \\dfrac{0.2800}{0.3433} = 0.8155$, using the FREE column: $1 - \\text{TP} = 0.3$ and TN $= 0.95$.',
      },
      {
        text: '0.2800',
        correct: false,
        why: 'The numerator alone: it still has to be divided by $p(\\text{free}) = 0.3433$.',
      },
      {
        text: '0.5000',
        correct: false,
        why: 'An OCCUPIED and a FREE reading cancel only when TP = TN. Here OCCUPIED is far stronger evidence (ratio 14, against about 3 for FREE).',
      },
      {
        text: '0.9949',
        correct: false,
        why: 'This reuses the OCCUPIED column (0.7 and 0.05), which pushes the cell up. A FREE reading uses $p(\\text{free} \\mid m) = 0.3$ and $p(\\text{free} \\mid \\neg m) = 0.95$.',
      },
    ],
    source: 'Similar to 2023 Q31(c); review deck slide 13',
    trapId: 'likelihood-column',
    difficulty: 2,
  },
  // ------------------------------------------------------------------ log-odds and evidence strength
  {
    id: 'slam-q-why-high',
    style: 'best',
    stem: 'With TP 0.7 and TN 0.95, a cell reads OCCUPIED then FREE and ends at 0.82, well above 0.5. Which explanation is best?',
    options: [
      {
        text: 'Misses are common (0.30) but false alarms rare (0.05), so OCCUPIED is far stronger evidence than FREE.',
        correct: true,
        why: 'Likelihood ratios: OCCUPIED $0.7/0.05 = 14$ (log-odds $+2.64$), FREE $0.3/0.95 \\approx 1/3.2$ ($-1.15$). One FREE undoes less than half of one OCCUPIED, leaving $l = 1.49$, $p = 0.8155$.',
      },
      {
        text: 'The second reading is weighted less, because Bayes’ rule discounts readings that arrive once the cell is already confident.',
        correct: false,
        why: 'Every reading adds the same log-odds step whatever the current value, and the order does not matter. The difference is in the readings’ strengths, not their timing.',
      },
      {
        text: 'The 0.5 prior pulls the estimate back up after every reading, so one FREE reading cannot take full effect.',
        correct: false,
        why: 'The prior enters once, at the start, and 0.5 is log-odds 0, which pulls nowhere.',
      },
      {
        text: 'A FREE reading carries no information about occupancy, so it leaves the cell almost where it was.',
        correct: false,
        why: 'It does carry information: it lowers the log-odds by 1.15 (0.9333 → 0.8155). It is just weaker than the OCCUPIED reading’s $+2.64$.',
      },
    ],
    source: 'Similar to 2023 Q31(d)',
    difficulty: 2,
  },
  {
    id: 'slam-q-logodds',
    style: 'incorrect',
    stem: 'About the log-odds form of the occupancy update:',
    options: [
      {
        text: 'The readings must be applied in the order they arrived, because log-odds updates do not commute.',
        correct: true,
        why: 'This is the FALSE statement. Each reading adds its own fixed step, and addition commutes: OCCUPIED then FREE and FREE then OCCUPIED both end at the same value (0.8155 for TP 0.7, TN 0.95).',
      },
      {
        text: 'A probability of 0.5 is log-odds 0.',
        correct: false,
        why: 'True: $\\ln(0.5 / 0.5) = \\ln 1 = 0$.',
      },
      {
        text: 'With a 0.5 prior, each reading adds the log of its likelihood ratio, $\\ln[p(z \\mid m) / p(z \\mid \\neg m)]$.',
        correct: false,
        why: 'True: in odds form the normaliser cancels, and the posterior odds are the likelihood ratio times the prior odds.',
      },
      {
        text: 'It avoids the precision lost by probabilities very close to 0 and 1.',
        correct: false,
        why: 'True: 0.9999999 and 0.99999999 are hard to tell apart in floating point, but their log-odds (16.1 and 18.4) are not.',
      },
      {
        text: 'The probability is recovered with $p = 1 - 1/(1 + e^{l})$.',
        correct: false,
        why: 'True: it is the inverse of $l = \\ln\\frac{p}{1 - p}$.',
      },
    ],
    source: 'Notes §4; review deck slides 11–13',
    difficulty: 2,
  },
  {
    id: 'slam-q-logodds-value',
    style: 'value',
    stem: 'TP 0.85, TN 0.99, prior 0.5 ($l_0 = 0$). What is the cell’s log-odds after one OCCUPIED reading?',
    options: [
      {
        text: '4.44',
        correct: true,
        why: '$\\ln(0.85 / 0.01) = \\ln 85 = 4.443$. The review deck reaches 4.4451 through the rounded inverse sensor model, $\\ln(0.9884 / 0.0116)$.',
      },
      {
        text: '1.73',
        correct: false,
        why: '$\\ln(0.85 / 0.15)$ divides along the row (TP over the miss rate). The step divides down the OCCUPIED column: $p(\\text{occ} \\mid m) / p(\\text{occ} \\mid \\neg m)$.',
      },
      {
        text: '0.99',
        correct: false,
        why: 'That is (rounded) the probability 0.9884, not its log-odds.',
      },
      {
        text: '−0.15',
        correct: false,
        why: '$\\ln(0.85 / 0.99)$ divides TP by TN, which come from different columns of the table.',
      },
    ],
    source: 'Similar to review deck slides 11–12',
    trapId: 'likelihood-column',
    difficulty: 2,
  },
  {
    id: 'slam-q-strength',
    style: 'correct',
    stem: 'A sonar almost never reports an obstacle that is not there (TN 0.99) but misses four real obstacles in ten (TP 0.6). For a cell starting at 0.5:',
    options: [
      {
        text: 'one OCCUPIED reading moves the cell much further than one FREE reading does',
        correct: true,
        why: 'Likelihood ratios: OCCUPIED $0.6/0.01 = 60$ (step $+4.09$), FREE $0.4/0.99 \\approx 0.40$ (step $-0.91$). Rare false alarms make OCCUPIED decisive; frequent misses make FREE weak.',
      },
      {
        text: 'one FREE reading moves the cell further, because misses are so common',
        correct: false,
        why: 'Backwards: frequent misses mean a FREE reading is quite likely even when the cell is occupied, so it says little.',
      },
      {
        text: 'OCCUPIED then FREE brings the cell back to exactly 0.5',
        correct: false,
        why: 'Only if the steps were equal and opposite, which needs TP = TN. Here the pair leaves $l = 3.19$, $p = 0.96$.',
      },
      {
        text: 'both readings move it by the same amount, in opposite directions',
        correct: false,
        why: 'The step sizes are set separately, by $\\text{TP}/(1 - \\text{TN})$ and $(1 - \\text{TP})/\\text{TN}$; they match only when TP = TN.',
      },
    ],
    source: 'Notes §4 (likelihood ratios); 2023 Q31(d)',
    difficulty: 3,
  },
  // ------------------------------------------------------------------ data association and loop closure
  {
    id: 'slam-q-association',
    style: 'most-correct',
    stem: 'In SLAM, data association means:',
    options: [
      {
        text: 'deciding which landmark or mapped place each new measurement came from, or that it is new',
        correct: true,
        why: 'It is the correspondence decision. A measurement can only correct the pose and the map once SLAM knows which landmark it belongs to.',
      },
      {
        text: 'fusing the readings of several sensors into one combined measurement before the update',
        correct: false,
        why: 'That is sensor fusion: combining readings of the same quantity. Association asks which landmark a reading is of.',
      },
      {
        text: 'linking every grid cell to the probability that it is occupied',
        correct: false,
        why: 'That is just the occupancy-grid representation; it involves no decision about which feature produced a reading.',
      },
      {
        text: 'calibrating the motion model by matching commanded and measured wheel motion',
        correct: false,
        why: 'That is motion-model calibration (the velocity and odometry models of §3), not data association.',
      },
    ],
    source: 'Notes §4; review deck slide 9; 2025 Q23',
    difficulty: 1,
  },
  {
    id: 'slam-q-loop',
    style: 'correct',
    stem: 'A robot drives a long loop through a building and comes back to its starting corridor. About loop closure:',
    options: [
      {
        text: 'A false loop closure is usually worse than a missed one.',
        correct: true,
        why: 'A missed closure only leaves the drift uncorrected. A false one forces two different places together: the map warps, the estimate becomes overconfident, and the damage is hard to undo.',
      },
      {
        text: 'A missed loop closure warps the map, because the solver forces two different places to coincide.',
        correct: false,
        why: 'That describes a **false** closure. A missed one leaves the drift in place and maps the corridor a second time, offset from the first.',
      },
      {
        text: 'A correct loop closure fixes the current pose only; the poses and landmarks from earlier in the loop keep their estimates.',
        correct: false,
        why: 'The pose and the map are correlated, so the correction spreads back along the whole loop and moves the landmarks seen on it.',
      },
      {
        text: 'Loop closure needs GPS, because only an absolute position can show that the robot is back where it started.',
        correct: false,
        why: 'Loop closure recognises the place from the robot’s own sensors (scans, images, landmarks), which is why it matters most where there is no GPS.',
      },
    ],
    source: 'Similar to 2024 Q23 and 2025 Q23; Notes §4',
    difficulty: 2,
  },
  // ------------------------------------------------------------------ techniques
  {
    id: 'slam-q-techniques',
    style: 'incorrect',
    stem: 'About SLAM techniques:',
    options: [
      {
        text: 'EKF-SLAM’s cost per update grows linearly with the number of landmarks, which is why it scales easily to city-sized maps.',
        correct: true,
        why: 'This is the FALSE statement. EKF-SLAM updates the full $(3 + 2N) \\times (3 + 2N)$ covariance, so its cost grows as $N^2$, which in practice limits it to maps of hundreds of landmarks, not city-sized ones.',
      },
      {
        text: 'In FastSLAM each particle carries a sampled robot path and a separate small EKF for every landmark.',
        correct: false,
        why: 'True: given the path the landmarks are independent, so each needs only its own 2-D EKF (Rao–Blackwellisation).',
      },
      {
        text: 'FastSLAM can make a different data association in each particle, so wrong associations tend to die out at resampling.',
        correct: false,
        why: 'True: particles that associated wrongly predict later measurements badly, get low weights and are resampled away.',
      },
      {
        text: 'Graph SLAM optimises all the poses at once, so it solves the full SLAM problem.',
        correct: false,
        why: 'True: it keeps the whole trajectory as nodes and finds the poses that best satisfy every constraint.',
      },
      {
        text: 'EKF-SLAM keeps one Gaussian over the robot pose and all the landmark positions together.',
        correct: false,
        why: 'True: the state is $(x, y, \\theta, m_1, \\dots, m_N)$ with one joint covariance.',
      },
    ],
    source: 'Notes §4 (SLAM techniques); review deck slide 8',
    difficulty: 2,
  },
  {
    id: 'slam-q-pf-benefit',
    style: 'best',
    stem: 'Which is the best example of a benefit of particle-filter SLAM (such as FastSLAM) over Kalman-filter-based EKF-SLAM?',
    options: [
      {
        text: 'It can track several hypotheses, including different data associations, at once.',
        correct: true,
        why: 'Particles represent multimodal, non-Gaussian beliefs without linearising the motion model, and each particle can make its own data association. A Kalman filter keeps one Gaussian and one association.',
      },
      {
        text: 'It needs no motion model, because the particles are spread over the map by resampling alone.',
        correct: false,
        why: 'Particles are moved through the motion model in the sampling step; resampling only redistributes the existing ones.',
      },
      {
        text: 'It always needs fewer computations than EKF-SLAM, however many particles it uses.',
        correct: false,
        why: 'Its cost grows with the number of particles, and with many particles it can be slower. Its advantage is in what it can represent.',
      },
      {
        text: 'It produces a single Gaussian estimate, which is easier to report and to plan with.',
        correct: false,
        why: 'A single Gaussian is the Kalman filter’s belief. Particles represent arbitrary, multimodal beliefs.',
      },
    ],
    source: 'Similar to 2023 Q22',
    difficulty: 2,
  },
  // ------------------------------------------------------------------ practical issues
  {
    id: 'slam-q-practical',
    style: 'incorrect',
    stem: 'About practical occupancy-grid mapping:',
    options: [
      {
        text: 'Halving the cell size of a 2-D grid doubles the memory it needs.',
        correct: true,
        why: 'This is the FALSE statement. The number of cells goes as $1/\\Delta^2$, so halving $\\Delta$ quadruples the cells (and multiplies them by 8 in 3-D).',
      },
      {
        text: 'People walking past during mapping break the static-world assumption and can leave ghost obstacles.',
        correct: false,
        why: 'True: their readings are fused as if the world were static, leaving smeared or phantom occupied cells.',
      },
      {
        text: 'A glass wall may return no echo, so the beam’s max-range reading wrongly clears the cells where the wall is.',
        correct: false,
        why: 'True: transparent and mirror-like surfaces break the sensor model, and the map gets holes where walls are.',
      },
      {
        text: 'Clamping the log-odds keeps cells able to change, which helps when doors open and close.',
        correct: false,
        why: 'True: a cell that is never allowed to become near-certain can flip back within a few readings.',
      },
      {
        text: 'An out-of-date map makes localisation against it less reliable, because the observations no longer match.',
        correct: false,
        why: 'True: moved furniture or roadworks produce readings the map cannot explain, and they mislead the correction step.',
      },
    ],
    source: 'Notes §4 (practical mapping issues); review deck slide 8',
    difficulty: 1,
  },
  {
    id: 'slam-q-car',
    style: 'incorrect',
    stem: 'A self-driving car localises itself in a lidar map of the city that was built a year ago. About the uncertainty in its pose estimate:',
    options: [
      {
        text: 'Storing the map’s cells as log-odds rather than probabilities is a major source of pose uncertainty.',
        correct: true,
        why: 'This is the FALSE statement. Log-odds is an exact re-encoding of the same probabilities; it changes nothing about what the car can infer.',
      },
      {
        text: 'GPS multipath between tall buildings can shift its position fixes by metres.',
        correct: false,
        why: 'True (sensor noise): reflected signals arrive late and bias the range to each satellite.',
      },
      {
        text: 'Roadworks and new buildings since the map was made produce scans that the map cannot explain.',
        correct: false,
        why: 'True (map mismatch): the correction step compares observations with a map that is no longer right.',
      },
      {
        text: 'Wheel slip on a wet road makes the prediction step less certain.',
        correct: false,
        why: 'True (motion uncertainty): the odometry fed to the motion model is wrong by the amount of slip.',
      },
      {
        text: 'Streets that look alike can match a scan to the wrong place on the map.',
        correct: false,
        why: 'True (perceptual aliasing): several poses explain the scan equally well.',
      },
    ],
    source: 'Similar to 2023 Q24',
    difficulty: 1,
  },
];

export const games: Game[] = [
  {
    kind: 'sort',
    id: 'slam-g-which',
    title: 'Localisation, mapping or SLAM?',
    prompt: 'For each robot, ask two questions: is the **map** given, and is the **pose** given by something accurate (GPS, ground tracking, motion capture)? Odometry alone drifts, so it does not count. Sort each scenario.',
    buckets: [
      { id: 'loc', label: 'Localisation (map known, pose unknown)' },
      { id: 'map', label: 'Mapping (pose known, map unknown)' },
      { id: 'slam', label: 'SLAM (both unknown)' },
    ],
    items: [
      { id: 'l1', text: 'A forklift with the warehouse layout and the surveyed positions of the tags its cameras detect', bucket: 'loc', why: 'The map, tags included, is given; only the pose is unknown (2024 Q7).' },
      { id: 'l2', text: 'A self-driving car crossing a city with a lidar map that was built last year', bucket: 'loc', why: 'A pre-built map is a known map: the car only has to find itself in it (the setting of 2023 Q24).' },
      { id: 'l3', text: 'A robot vacuum on its fiftieth run, using the floor map it saved on its first run', bucket: 'loc', why: 'The saved map is now the known map, so each later run is localisation (plus small map updates).' },
      { id: 'l4', text: 'A museum guide robot switched on at an unknown spot in a building whose floor plan it has', bucket: 'loc', why: 'Global localisation: no initial pose, but the map is known. Still localisation, not SLAM.' },
      { id: 'm1', text: 'A satellite with an exact pose from ground tracking and GPS stitches surface temperatures into one image', bucket: 'map', why: 'The pose is known, so building the temperature map is mapping (2023 Q7).' },
      { id: 'm2', text: 'A drone in a motion-capture arena, its pose known to the millimetre, builds an occupancy map of a cardboard maze', bucket: 'map', why: 'Motion capture supplies the pose; only the map is estimated: mapping with known poses.' },
      { id: 'm3', text: 'A survey car with centimetre-accurate RTK-GPS and an inertial unit builds a 3-D lidar map of a highway', bucket: 'map', why: 'RTK-GPS plus inertial sensing gives a near-exact pose outdoors, so the car only has to map.' },
      { id: 'm4', text: 'A farm robot with RTK-GPS records weed density across a paddock', bucket: 'map', why: 'The map here is weed density rather than obstacles, but the logic is the same: known pose, unknown map.' },
      { id: 's1', text: 'A rover on the Moon reconstructs the lunar surface', bucket: 'slam', why: 'No prior map and no GPS on the Moon: both unknown (2025 Q7).' },
      { id: 's2', text: 'A robot vacuum just unboxed in a new house that has to clean every room', bucket: 'slam', why: 'No map yet and no GPS indoors, and odometry drifts: it must build the map while localising in it.' },
      { id: 's3', text: 'An underwater vehicle surveys an uncharted shipwreck', bucket: 'slam', why: 'GPS does not work underwater and the wreck is uncharted: both unknown.' },
      { id: 's4', text: 'A drone explores a collapsed mine tunnel for rescuers, far beyond GPS reach', bucket: 'slam', why: 'No map of the collapse and no GPS underground: SLAM.' },
    ],
    source: 'Recurring: 2023 Q7, 2024 Q7, 2025 Q7; Notes §4 table',
  },
  {
    kind: 'match',
    id: 'slam-g-loop',
    title: 'Loop-closure outcome → effect on the map',
    prompt: 'Match each data-association or loop-closure outcome to what it does to the map and the pose estimate.',
    pairs: [
      {
        id: 'p1',
        left: 'Correct loop closure',
        right: 'Drift is spread back along the loop; the map snaps into one consistent shape and the uncertainty shrinks',
        why: 'The new constraint ties the current pose to an old one, and the correlations carry the correction back through every pose and landmark on the loop.',
      },
      {
        id: 'p2',
        left: 'Missed loop closure',
        right: 'Drift keeps growing, and the revisited corridor is drawn a second time, offset from the first',
        why: 'Nothing is wrong locally; the map simply never learns that the two places are one.',
      },
      {
        id: 'p3',
        left: 'False loop closure',
        right: 'Two different places are glued together: the map folds, and the estimate becomes confidently wrong',
        why: 'A wrong constraint is treated as true and the covariance shrinks around it, which makes it hard to detect and undo: the worst case.',
      },
      {
        id: 'p4',
        left: 'A re-observed landmark mistaken for a new one',
        right: 'A duplicate landmark appears, and the revisit gives no correction',
        why: 'The landmark-level version of a missed association: information that could have reduced the drift is wasted.',
      },
      {
        id: 'p5',
        left: 'A measurement matched to the wrong look-alike landmark',
        right: 'The pose is dragged towards the wrong landmark, and that landmark’s estimate is corrupted',
        why: 'The landmark-level version of a false association; enough of them can make the filter diverge.',
      },
      {
        id: 'p6',
        left: 'A very strict threshold for accepting loop closures',
        right: 'Almost no false closures, at the price of some missed ones: drift is corrected late rather than wrongly',
        why: 'False closures are far more damaging than missed ones, so SLAM systems tune for precision over recall.',
      },
    ],
    source: 'Notes §4; 2024 Q23; 2025 Q23',
  },
  {
    kind: 'sort',
    id: 'slam-g-technique',
    title: 'EKF-SLAM, FastSLAM or graph SLAM?',
    prompt: 'Each statement describes one SLAM technique. Sort it under the technique it describes.',
    buckets: [
      { id: 'ekf', label: 'EKF-SLAM' },
      { id: 'fast', label: 'FastSLAM' },
      { id: 'graph', label: 'Graph SLAM' },
    ],
    items: [
      { id: 'e1', text: 'One joint Gaussian over the robot pose and every landmark', bucket: 'ekf', why: 'The state stacks the pose and all $N$ landmarks, with one $(3 + 2N) \\times (3 + 2N)$ covariance.' },
      { id: 'e2', text: 'Each update touches the whole covariance, so the cost grows as $N^2$', bucket: 'ekf', why: 'Every landmark is correlated with the pose, so one measurement changes every entry of the covariance.' },
      { id: 'e3', text: 'Linearises both the motion and the sensor model of the whole joint state, once, at the current estimate', bucket: 'ekf', why: 'A filter cannot go back and relinearise past updates, so the errors are baked in and make it overconfident. (FastSLAM samples the motion instead of linearising it; graph SLAM relinearises at every iteration.)' },
      { id: 'e4', text: 'A filter that keeps only the current pose: it solves online SLAM', bucket: 'ekf', why: 'Past poses are marginalised out at every prediction step.' },
      { id: 'f1', text: 'Each particle is a sampled robot path with a small EKF for every landmark', bucket: 'fast', why: 'Given the path, the landmarks are independent (Rao–Blackwellisation), so each gets its own 2-D EKF.' },
      { id: 'f2', text: 'Each particle makes its own data associations; wrong ones die out at resampling', bucket: 'fast', why: 'Particles whose associations were wrong predict later measurements badly, so they get low weights.' },
      { id: 'f3', text: 'Can lose the true path on a long loop if too few particles survive resampling', bucket: 'fast', why: 'Particle depletion: by the time the loop closes, the right hypothesis may have been resampled away.' },
      { id: 'g1', text: 'Poses are nodes; odometry, observations and loop closures are edges', bucket: 'graph', why: 'Each measurement becomes a constraint (like a spring) between the nodes it links.' },
      { id: 'g2', text: 'Finds the whole trajectory at once by sparse least squares: full SLAM', bucket: 'graph', why: 'It optimises all the poses together, exploiting the fact that each constraint touches only two nodes.' },
      { id: 'g3', text: 'A wrong loop-closure edge can be detected and removed, then the whole problem re-solved', bucket: 'graph', why: 'Constraints are kept separately, unlike a filter that folds each one in irreversibly.' },
    ],
    source: 'Notes §4 (SLAM techniques); review deck slide 8; 2023 Q22',
  },
];

export const shortAnswers: ShortAnswer[] = [
  {
    id: 'slam-sa-problems',
    prompt: '**(3 marks)** In no more than 90 words: what is the difference between localisation, mapping and SLAM? Give an example of each.',
    wordLimit: 90,
    model: 'They differ in what is unknown. **Localisation** estimates the robot’s pose given a known map, $p(x_t \\mid z_{1:t}, u_{1:t}, m)$: a forklift with a map of the warehouse tags. **Mapping** builds the map given known poses, $p(m \\mid z_{1:t}, x_{1:t})$: a satellite with a GPS-accurate pose stitching a temperature map. **SLAM** estimates both at once, $p(x_t, m \\mid z_{1:t}, u_{1:t})$, because neither is known: a lunar rover with no map and no GPS. SLAM is harder because pose and map errors are correlated.',
    keyPoints: [
      'localisation: pose unknown, map known',
      'mapping: map unknown, pose known',
      'SLAM: both unknown, estimated together',
      'one valid example of each',
    ],
    source: 'Review deck slide 9; Notes §4',
    marks: 3,
  },
  {
    id: 'slam-sa-online-full',
    prompt: '**(2 marks)** In no more than 60 words: what is the difference between online SLAM and full SLAM?',
    wordLimit: 60,
    model: 'Online SLAM estimates the **current** pose and the map, $p(x_t, m \\mid z_{1:t}, u_{1:t})$, integrating past poses out as it goes (filters such as EKF-SLAM). Full SLAM estimates the **whole trajectory** and the map, $p(x_{1:t}, m \\mid z_{1:t}, u_{1:t})$ (graph SLAM optimises all the poses at once). Online SLAM is full SLAM with $x_{1:t-1}$ integrated out.',
    keyPoints: [
      'online: current pose $x_t$ and the map',
      'full: whole trajectory $x_{1:t}$ and the map',
      'online = full with the past poses integrated out',
      'a method for each (EKF-SLAM online; graph SLAM full)',
    ],
    source: 'Review deck slide 9; 2025 Q8',
    marks: 2,
  },
  {
    id: 'slam-sa-prior',
    prompt: '**(2 marks)** A robot is about to map a cell it knows nothing about. In no more than 50 words: what is an appropriate prior occupancy probability, and why?',
    wordLimit: 50,
    model: '$p(m) = 0.5$. With no information, occupied and free are equally likely, so 0.5 is the uninformative (maximum-uncertainty) prior. It is log-odds $l_0 = 0$, so it adds no bias to the updates. A prior of 0 or 1 would be certainty, and the cell could never be updated.',
    keyPoints: [
      '0.5',
      'no information: occupied and free equally likely (uninformative prior)',
      'log-odds 0, so no bias',
      'not 0 or 1: those could never be updated',
    ],
    source: 'Similar to 2023 Q31(a); review deck slide 9',
    marks: 2,
  },
  {
    id: 'slam-sa-prior-01',
    prompt: '**(2 marks)** In occupancy-grid mapping with a binary Bayes filter, explain in no more than 70 words the impact of initialising the cells’ occupancy probabilities to 0 or 1.',
    wordLimit: 70,
    model: 'A probability of 0 or 1 is absolute certainty: log-odds $-\\infty$ or $+\\infty$. Bayes’ rule multiplies by the prior, so $0 \\times$ anything stays 0, and adding any finite log-odds step to $\\pm\\infty$ leaves it unchanged. The cell can never be updated, however many contradicting readings arrive, so a wrong initial value becomes a permanent map error. Use 0.5 instead.',
    keyPoints: [
      '0 or 1 means certainty: log-odds $\\pm\\infty$',
      'prior 0 gives posterior 0 for any reading (and $\\pm\\infty$ + finite step = $\\pm\\infty$)',
      'the cell can never be updated by new evidence',
      'errors become permanent: start at 0.5 instead',
    ],
    source: 'Similar to 2025 Q22',
    marks: 2,
  },
  {
    id: 'slam-sa-occ-free',
    prompt: '**(2 marks)** A sensor has TP 0.7 and TN 0.95. A cell at 0.5 reads OCCUPIED (→ 0.9333) and then FREE (→ 0.8155). In no more than 70 words: explain why the occupancy probability does not fall much after the FREE reading.',
    wordLimit: 70,
    model: 'The two readings carry very different amounts of evidence. False positives are rare (0.05), so an OCCUPIED reading is strong: likelihood ratio $0.7/0.05 = 14$, log-odds $+2.64$. Misses are common (0.30), so a FREE reading is weak: ratio $0.3/0.95 \\approx 1/3.2$, log-odds $-1.15$. One weak FREE removes less than half of what one strong OCCUPIED added, so the cell stays high (0.82).',
    keyPoints: [
      'the readings have unequal strength (likelihood ratios)',
      'rare false positives (0.05) make OCCUPIED strong: ratio 14, $+2.64$',
      'common misses (0.30) make FREE weak: ratio ≈ 1/3, $-1.15$',
      'so one FREE cannot cancel one OCCUPIED',
    ],
    source: 'Similar to 2023 Q31(d)',
    marks: 2,
  },
  {
    id: 'slam-sa-loop',
    prompt: '**(3 marks)** In no more than 100 words: explain how data association affects the quality of a SLAM map and of the robot’s pose estimate, with particular reference to loop closure.',
    wordLimit: 100,
    model: 'Data association decides which landmark or previously mapped place each observation corresponds to, or whether it is new. Loop closure is association with a place visited long ago. A **correct** closure adds a constraint to that old pose, so the accumulated drift is spread back along the trajectory: the pose estimate and the map snap into a consistent shape and uncertainty shrinks. A **missed** closure lets drift keep growing and duplicates places in the map. A **false** association forces two different places together: the map warps and the estimate becomes overconfident and hard to correct, the worst case.',
    keyPoints: [
      'definition: which landmark or place each observation belongs to, or new',
      'correct closure: drift spread back, map and pose consistent, uncertainty shrinks',
      'missed closure: drift keeps growing, places duplicated',
      'false closure or association: map warped, pose wrong and overconfident (worst, hard to undo)',
    ],
    source: 'Similar to 2024 Q23',
    marks: 3,
  },
  {
    id: 'slam-sa-association',
    prompt: '**(3 marks)** In no more than 100 words: describe the data-association problem in SLAM and explain what an incorrect association does to the SLAM solution.',
    wordLimit: 100,
    model: 'Data association is deciding which landmark produced each measurement, or whether it is a new one. It is hard because landmarks look alike, measurements are noisy and the pose itself is uncertain. An incorrect association applies a measurement to the wrong landmark, adding a false constraint: the pose is pulled to the wrong place, landmark positions are corrupted or duplicated, and the covariance becomes overconfident. Because SLAM couples pose and landmarks, the error spreads through the map. A wrong loop closure is worst: it can warp the whole map or make the filter diverge, and is hard to undo.',
    keyPoints: [
      'definition: matching each measurement to a landmark (or declaring it new)',
      'why it is hard: look-alike landmarks, noise, uncertain (drifted) pose',
      'a wrong association is a false constraint: pose and landmarks corrupted',
      'the estimate becomes overconfident and the error spreads through the map',
      'a false loop closure warps the map or makes the filter diverge, and is hard to undo',
    ],
    source: 'Similar to 2025 Q23; review deck slide 9',
    marks: 3,
  },
  {
    id: 'slam-sa-car',
    prompt: '**(2 marks)** In no more than 70 words: describe two sources of uncertainty that could affect a self-driving car’s ability to localise itself in a pre-built map of a city.',
    wordLimit: 70,
    model: '(1) **Sensor noise**: GPS suffers multipath between tall buildings, and lidar and cameras degrade in rain or glare, so the measurements used in the correction step are noisy or biased. (2) **Map mismatch**: the map is out of date (roadworks, new buildings, parked cars) and traffic and pedestrians hide landmarks, so observations do not match the map and can pull the pose estimate off. (Also valid: wheel slip, perceptual aliasing.)',
    keyPoints: [
      'a first source named, e.g. sensor noise (GPS multipath, lidar in rain)',
      'a second source named, e.g. map out of date or dynamic objects',
      'each one’s effect on the pose estimate described',
      'other valid sources: wheel slip or odometry drift, perceptual aliasing',
    ],
    source: 'Similar to 2023 Q24',
    marks: 2,
  },
  {
    id: 'slam-sa-techniques',
    prompt: '**(3 marks)** In no more than 100 words: compare EKF-SLAM, FastSLAM and graph SLAM.',
    wordLimit: 100,
    model: '**EKF-SLAM** keeps one Gaussian over the pose and all $N$ landmarks: it tracks every correlation but costs $O(N^2)$ per update, linearises once and commits to one data association. **FastSLAM** samples robot paths with particles, each carrying a small EKF per landmark (landmarks are independent given the path): it handles multimodal beliefs and per-particle data association, but can suffer particle depletion on long loops. **Graph SLAM** stores poses as nodes and measurements as constraint edges, then optimises the whole trajectory by sparse least squares: it solves full SLAM, scales to large maps and can reject bad loop closures.',
    keyPoints: [
      'EKF-SLAM: one joint Gaussian, $O(N^2)$ per update, one fixed association, linearisation errors',
      'FastSLAM: particles for the path plus an EKF per landmark, per-particle association',
      'graph SLAM: pose graph optimised by least squares (full SLAM)',
      'a valid trade-off or fitting scenario for each',
    ],
    source: 'Review deck slide 8 (learning outcome); Notes §4; 2023 Q22',
    marks: 3,
  },
  {
    id: 'slam-sa-practical',
    prompt: '**(3 marks)** In no more than 100 words: discuss three practical considerations when building an occupancy-grid map of a real environment.',
    wordLimit: 100,
    model: '**Dynamic objects**: people, cars and doors break the static-world assumption, leaving ghost obstacles or smeared cells; clamp the log-odds so cells can change back, or filter moving objects out. **Resolution vs memory**: halving the cell size quadruples the cells in 2-D (8× in 3-D); too coarse loses thin obstacles and narrow doorways, too fine wastes memory and leaves cells noisy. **Sensor noise and failures**: glass, mirrors and dark surfaces return max range and wrongly clear cells, so the sensor model must allow for misses. (Also: maps go out of date, and pose errors blur the map.)',
    keyPoints: [
      'dynamic objects break the static-world assumption (ghosts); clamp or filter',
      'resolution vs memory trade-off (4× the cells per halving in 2-D)',
      'sensor noise and failures (glass, max range) need a good sensor model',
      'any further valid issue: out-of-date maps, pose errors',
    ],
    source: 'Review deck slide 8 (learning outcome); Notes §4',
    marks: 3,
  },
];
