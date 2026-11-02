// filters-choice: pick the filter for a scenario (KF, EKF, PF; at tier 2 also EKF-SLAM vs FastSLAM and the kidnapped
// robot), with a why for every option, plus a recurring recall question: tier 1 names the filter from its belief
// representation (2023 Q4, 2024 Q4), tier 2 asks for one advantage of a PF over a KF or the reverse (2023 Q22).
// The scenarios are the which-filter simulation's cards plus a few that only appear here.
import type { ChoicePart, SolveGenerator, Tier } from '../../../engine/types';
import type { Rng } from '../../../engine/rng';
import { CARDS, type ScenarioCard } from '../explore/whichCards';

const EXTRA: ScenarioCard[] = [
  {
    id: 'conveyor',
    title: 'Box on a conveyor',
    text: 'A camera above a conveyor belt tracks a box moving at a known constant speed; each frame gives the box’s position along the belt with Gaussian noise.',
    shape: 'one',
    options: [
      { label: 'KF', row: 'kf', correct: true, why: 'Constant-speed motion and a direct position reading are linear, and the noise is Gaussian: the belief stays one Gaussian and the KF is exact.' },
      { label: 'EKF', row: 'ekf', correct: false, why: 'Nothing is nonlinear, so the Jacobians are constant and the EKF reduces to the KF.' },
      { label: 'PF', row: 'pf', correct: false, why: 'It would work, but hundreds of particles approximate what the KF holds exactly with a mean and a variance.' },
    ],
  },
  {
    id: 'compass',
    title: 'Odometry and a compass',
    text: 'A rover starts from a surveyed point, predicts its pose $(x, y, \\theta)$ from wheel odometry and corrects its heading with a magnetic compass.',
    shape: 'skew',
    options: [
      { label: 'KF', row: 'kf', correct: false, why: 'Odometry moves $x$ by $\\delta_{trans}\\cos\\theta$ and $y$ by $\\delta_{trans}\\sin\\theta$: not linear in the heading, so no constant $A$ exists.' },
      { label: 'EKF', row: 'ekf', correct: true, why: 'Mildly nonlinear motion from a known start, and the compass keeps the heading tight, so the belief stays one bump: linearise at the mean.' },
      { label: 'PF', row: 'pf', correct: false, why: 'It works, but the belief never has more than one bump; the EKF is far cheaper for the same answer.' },
    ],
  },
  {
    id: 'symmetric',
    title: 'A perfectly symmetric room',
    text: 'A robot is put down in a square room with four identical walls and no other features, and must work out its pose from laser scans.',
    shape: 'doors',
    options: [
      { label: 'KF', row: 'kf', correct: false, why: 'Four mirror-image poses explain every scan equally well; one Gaussian cannot hold four hypotheses (and the scan model is not linear).' },
      { label: 'EKF', row: 'ekf', correct: false, why: 'One Gaussian must pick one of the four symmetric poses, or sit in the middle of them where the robot is not.' },
      { label: 'PF', row: 'pf', correct: true, why: 'The belief is multimodal: four clusters survive, one per symmetric pose, until something breaks the symmetry. Only particles can hold them all.' },
    ],
  },
  {
    id: 'bearing',
    title: 'Bearing only, unknown start',
    text: 'A robot that could be anywhere in a large hall measures only the bearing (not the range) to one known landmark.',
    shape: 'skew',
    options: [
      { label: 'KF', row: 'kf', correct: false, why: 'A bearing $\\operatorname{atan2}(\\Delta y, \\Delta x)$ is not linear in the position.' },
      { label: 'EKF', row: 'ekf', correct: false, why: 'Strongly nonlinear and a poor first guess: linearising $\\operatorname{atan2}$ at a mean that may be metres off gives the wrong Jacobian, and the EKF diverges or grows overconfident.' },
      { label: 'PF', row: 'pf', correct: true, why: 'A bearing only says "somewhere along this ray": a long, thin, curved belief from an unknown start. Particles can spread along it until other readings pin it down.' },
    ],
  },
];

/** The deciding cue of each scenario, without naming the filter (hint 3). */
const CUES: Record<string, string> = {
  rail: 'position–velocity motion and a direct position reading are linear, and the noise is Gaussian.',
  global: 'the start is unknown and several corridors look alike, so the belief has several bumps.',
  gps: 'the start is known and GPS keeps the belief one bump, but the heading enters through $\\cos\\theta$ and $\\sin\\theta$.',
  sonar: 'the sensor noise is far from Gaussian (max-range spikes, short readings).',
  fusion: 'everything is linear with Gaussian noise; there are just two sensors to fuse.',
  kidnap: 'the robot is moved to a pose the converged filter gives no probability to.',
  beacon: 'range and bearing are nonlinear, but the belief is one small bump far from the beacon.',
  ekfslam: 'few landmarks, each uniquely identified (known data association).',
  fastslam: 'thousands of landmarks and ambiguous data association.',
  conveyor: 'constant-speed motion and a direct position reading: linear, Gaussian.',
  compass: 'known start and a tight heading: one bump, but odometry is nonlinear in $\\theta$.',
  symmetric: 'four mirror-image poses explain every scan equally well.',
  bearing: 'unknown start and a strongly nonlinear, range-free reading.',
};

const TIER1 = ['rail', 'global', 'gps', 'sonar', 'fusion', 'beacon', 'conveyor', 'compass', 'symmetric', 'bearing'];
const ALL = [...CARDS, ...EXTRA];

function scenarioPart(card: ScenarioCard): ChoicePart {
  return {
    kind: 'choice',
    id: 'filter',
    label: `**${card.title}.** ${card.text} Which filter would you use?`,
    options: card.options.map((o) => ({ text: o.label, correct: o.correct, why: o.why })),
    fixedOrder: true,
    compact: true,
    marks: 1,
  };
}

interface Recall {
  part: ChoicePart;
  answer: string;
}

/** 2023 Q4 / 2024 Q4: name the filter from how it represents the belief. */
function namePart(rng: Rng): Recall {
  const variants = [
    { key: 'kf', stem: 'A Bayes filter that holds its belief as **one multivariate Gaussian**, for a **linear** system, is a …' },
    { key: 'pf', stem: 'A Bayes filter that holds its belief as a **set of weighted samples** is a …' },
    { key: 'ekf', stem: 'A Bayes filter that holds one Gaussian but **linearises** nonlinear motion and sensor models about the current mean is a …' },
    { key: 'bin', stem: 'A Bayes filter for a **static binary** state (is this map cell occupied?), usually run in log-odds, is a …' },
  ] as const;
  const v = rng.pick(variants);
  const opts = [
    { key: 'kf', text: 'Kalman filter', why: 'One Gaussian $(\\mu, \\Sigma)$ propagated exactly by linear models with Gaussian noise.' },
    { key: 'ekf', text: 'Extended Kalman filter', why: 'Also one Gaussian, but for **nonlinear** models, linearised with Jacobians at the mean (for a linear system it reduces to the KF).' },
    { key: 'pf', text: 'Particle filter', why: 'The belief is $M$ weighted samples (particles), so it can take any shape.' },
    { key: 'bin', text: 'Binary Bayes filter', why: 'Estimates one static yes/no state, such as a cell’s occupancy, by adding log-odds.' },
  ];
  const ans = opts.find((o) => o.key === v.key)!;
  return {
    part: {
      kind: 'choice',
      id: 'name',
      label: v.stem,
      options: opts.map((o) => ({ text: o.text, correct: o.key === v.key, why: o.key === v.key ? `Yes. ${o.why}` : `${o.why} Not what the stem describes.` })),
      compact: true,
      marks: 1,
    },
    answer: ans.text,
  };
}

/** 2023 Q22 (1 mark): one advantage of a PF over a KF, or the reverse. */
function advantagePart(rng: Rng): Recall {
  if (rng.chance(0.6)) {
    const right = { text: 'It can represent arbitrary, multimodal beliefs and use nonlinear, non-Gaussian models without linearising them', correct: true, why: 'Yes: several pose hypotheses at once (global localisation, kidnapping) and per-particle data association in FastSLAM. A KF is limited to one Gaussian (2023 Q22).' };
    const wrong = rng.shuffle([
      { text: 'It is always cheaper to run than a Kalman filter', correct: false, why: 'The opposite: its cost grows with the number of particles, and the particles needed grow fast with the state dimension. A KF is a few small matrix products.' },
      { text: 'It gives the exact optimal estimate for linear Gaussian systems', correct: false, why: 'That is the KF. A PF only approximates the belief with finitely many samples.' },
      { text: 'It does not need a motion model', correct: false, why: 'The sample step moves every particle through the (noisy) motion model.' },
      { text: 'It can never suffer from particle deprivation', correct: false, why: 'Deprivation (no particles near the truth) is precisely the PF’s weak spot; random-particle injection is the usual fix.' },
    ]).slice(0, 3);
    return {
      part: { kind: 'choice', id: 'adv', label: 'Which is **one advantage of a particle filter over a Kalman filter** for state estimation and SLAM?', options: rng.shuffle([right, ...wrong]), marks: 1 },
      answer: 'PF advantage: multimodal, non-Gaussian beliefs and nonlinear models without linearisation',
    };
  }
  const right = { text: 'For a linear Gaussian system it is exact and optimal, and it needs only a mean and a covariance', correct: true, why: 'Yes: a few small matrix products per step, even in high dimensions, with no sampling noise.' };
  const wrong = rng.shuffle([
    { text: 'It can track several pose hypotheses at once', correct: false, why: 'One Gaussian has one peak: tracking several hypotheses is the PF’s strength.' },
    { text: 'It handles any nonlinear sensor model without approximation', correct: false, why: 'The KF needs linear models; the EKF linearises them, which is an approximation.' },
    { text: 'It recovers from a kidnapped robot by itself', correct: false, why: 'Its Gaussian stays centred on the old pose; recovering needs something like the PF’s random particles.' },
    { text: 'It needs no knowledge of the noise', correct: false, why: 'It needs both noise covariances: $R$ (actuation) and $Q$ (sensor).' },
  ]).slice(0, 3);
  return {
    part: { kind: 'choice', id: 'adv', label: 'Which is **one advantage of a Kalman filter over a particle filter**?', options: rng.shuffle([right, ...wrong]), marks: 1 },
    answer: 'KF advantage: exact, optimal and cheap for linear Gaussian systems',
  };
}

export const generators: SolveGenerator[] = [
  {
    id: 'filters-choice',
    title: 'Which filter, and why?',
    summary: 'A scenario: KF, EKF or PF (or EKF-SLAM vs FastSLAM), with a reason for every option; then a recurring recall question.',
    tiers: [1, 2],
    source: 'Summary notes §2 table; 2023 Q4 and 2024 Q4 (name the filter); 2023 Q22 (one advantage of a PF over a KF)',
    cardId: 'filters-compare',
    marks: 2,
    generate(rng, tier: Tier) {
      const pool = tier === 1 ? ALL.filter((c) => TIER1.includes(c.id)) : ALL;
      const card = rng.pick(pool);
      const recall = tier === 1 ? namePart(rng) : advantagePart(rng);
      const right = card.options.find((o) => o.correct)!;
      const others = card.options.filter((o) => !o.correct);
      const hints: [string, string, string, string] = [
        'All three filters implement the Bayes filter; they differ in how they hold the belief. The KF and EKF keep **one Gaussian** $(\\mu, \\Sigma)$; the PF keeps **$M$ weighted samples**. Choose by what the belief will look like and what the models are.',
        'Ask in order: (1) Can the belief have **several bumps** (unknown start, look-alike places, a kidnapped robot, ambiguous data association) or very non-Gaussian noise? Then a **PF** (FastSLAM for mapping). (2) Otherwise, are motion and sensor **linear with Gaussian noise**? Then a **KF**. (3) Otherwise (mildly nonlinear, one bump, pose roughly known) an **EKF** (EKF-SLAM for a few distinct landmarks).',
        `The deciding feature here: ${CUES[card.id] ?? card.text}`,
        [
          `**${right.label}.** ${right.why}`,
          `Why not the others: ${others.map((o) => `**${o.label}**: ${o.why}`).join(' ')}`,
          `Second part: **${recall.answer}**.`,
        ].join('\n\n'),
      ];
      return {
        prompt: tier === 1 ? 'Choose the filter for the scenario, then answer the recall question (1 mark each).' : 'Choose the filter for the scenario and give one advantage (1 mark each, as in the short-answer section).',
        parts: [scenarioPart(card), recall.part],
        hints,
      };
    },
  },
];
