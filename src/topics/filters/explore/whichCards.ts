// which-filter data: the comparison table (summary notes §2 table, plus the two SLAM filters) and the scenario
// cards. Each card option names the table row it stands for and has its own "why"; each card names the belief shape
// (whichModel.ts) that its scenario produces, which the plot switches to once the card is answered.
import type { ShapeId } from './whichModel';

export type RowId = 'kf' | 'ekf' | 'pf' | 'ekfslam' | 'fastslam';

export interface TableRow {
  id: RowId;
  name: string;
  belief: string;
  models: string;
  good: string;
  weak: string;
}

/** Summary notes §2 table, with EKF-SLAM and FastSLAM (notes §4) as the SLAM versions of the EKF and the PF. */
export const TABLE: TableRow[] = [
  {
    id: 'kf',
    name: 'KF',
    belief: 'One Gaussian $(\\mu, \\Sigma)$',
    models: 'Linear $A, B, C$; Gaussian $R, Q$',
    good: 'Linear tracking: fast, exactly optimal',
    weak: 'One hypothesis; linear models only',
  },
  {
    id: 'ekf',
    name: 'EKF',
    belief: 'One Gaussian $(\\mu, \\Sigma)$',
    models: 'Nonlinear $g, h$ linearised at the mean ($G, H$)',
    good: 'Mildly nonlinear, pose roughly known',
    weak: 'Diverges if strongly nonlinear or a poor first guess',
  },
  {
    id: 'pf',
    name: 'PF',
    belief: '$M$ weighted particles',
    models: 'Any model you can sample and evaluate',
    good: 'Global localisation, kidnapping, multimodal',
    weak: 'Cost grows fast with dimension; deprivation',
  },
  {
    id: 'ekfslam',
    name: 'EKF-SLAM',
    belief: 'One joint Gaussian: pose + $N$ landmarks',
    models: 'As the EKF; known data association',
    good: 'Few, distinct landmarks',
    weak: '$O(N^2)$ per update; a wrong association is permanent',
  },
  {
    id: 'fastslam',
    name: 'FastSLAM',
    belief: 'Particles over paths, each with $N$ landmark EKFs',
    models: 'Sampled motion; association per particle',
    good: 'Many landmarks, ambiguous associations',
    weak: 'Needs enough particles for diverse paths',
  },
];

export interface CardOption {
  label: string;
  row: RowId;
  correct: boolean;
  why: string;
}

export interface ScenarioCard {
  id: string;
  title: string;
  text: string;
  shape: ShapeId;
  options: CardOption[];
}

export const CARDS: ScenarioCard[] = [
  {
    id: 'rail',
    title: 'Cart on a rail',
    text: 'A cart on a straight rail is pushed with a known acceleration command. An ultrasonic sensor measures its position with Gaussian noise of known variance.',
    shape: 'one',
    options: [
      { label: 'KF', row: 'kf', correct: true, why: 'Motion and sensor are linear in the state (position, velocity) and the noise is Gaussian, so the belief stays exactly one Gaussian: the KF is exact and optimal with just $\\mu$ and $\\Sigma$.' },
      { label: 'EKF', row: 'ekf', correct: false, why: 'It works, but with linear $g$ and $h$ the Jacobians are just $A$ and $C$: the EKF reduces to the KF. There is nothing to linearise.' },
      { label: 'PF', row: 'pf', correct: false, why: 'It works too, but it approximates with hundreds of samples a Gaussian the KF holds exactly, so it costs far more and adds sampling noise.' },
    ],
  },
  {
    id: 'global',
    title: 'Switched on, location unknown',
    text: 'A museum guide robot is switched on somewhere in a building whose corridors look alike. It has the map but no idea where it starts.',
    shape: 'doors',
    options: [
      { label: 'KF', row: 'kf', correct: false, why: 'One Gaussian cannot say "in one of these four corridors"; and range readings against a map are not linear in the pose anyway.' },
      { label: 'EKF', row: 'ekf', correct: false, why: 'Its single Gaussian must commit to one guess. Started in the wrong corridor, it linearises around the wrong place and has no way to jump to the right one.' },
      { label: 'PF', row: 'pf', correct: true, why: 'Global localisation: the belief starts flat and stays **multimodal** (every look-alike corridor fits the readings) until something distinctive is seen. Only particles can hold several bumps at once.' },
    ],
  },
  {
    id: 'gps',
    title: 'Odometry + GPS',
    text: 'A differential-drive robot starts from a known pose, predicts with wheel odometry and corrects with GPS fixes.',
    shape: 'skew',
    options: [
      { label: 'KF', row: 'kf', correct: false, why: 'The KF needs $\\bar\\mu = A\\mu + Bu$ with constant matrices. Odometry moves $x$ by $\\delta_{trans}\\cos\\theta$, which is not linear in the heading $\\theta$.' },
      { label: 'EKF', row: 'ekf', correct: true, why: 'Mildly nonlinear ($\\cos\\theta$, $\\sin\\theta$), but the start is known and GPS keeps the belief one bump, so linearising at the mean (Jacobian $G$) is accurate and cheap: the textbook EKF case.' },
      { label: 'PF', row: 'pf', correct: false, why: 'It works, but the belief stays one bump that a Gaussian holds with a handful of numbers; hundreds of particles buy nothing here.' },
    ],
  },
  {
    id: 'sonar',
    title: 'Sonar with missed echoes',
    text: 'The range sensor is a sonar that now and then returns its maximum range (a missed echo) or a short reading (a person walking past): its noise is far from Gaussian.',
    shape: 'skew',
    options: [
      { label: 'KF', row: 'kf', correct: false, why: 'The KF assumes Gaussian noise and linear models; neither holds here.' },
      { label: 'EKF', row: 'ekf', correct: false, why: 'The EKF copes with a nonlinear $h$ but still assumes Gaussian noise $Q$: one max-range reading is a huge innovation that drags the mean, unless it is gated out by hand.' },
      { label: 'PF', row: 'pf', correct: true, why: 'The weight $w = p(z \\mid x)$ can be any function, including the beam model’s mix of hits, short readings, max-range spikes and random noise. Nothing has to be Gaussian.' },
    ],
  },
  {
    id: 'fusion',
    title: 'Two sensors, one distance',
    text: 'A car follows another at a near-constant relative speed. A lidar and a radar both measure the gap, each with Gaussian noise of known variance.',
    shape: 'one',
    options: [
      { label: 'KF', row: 'kf', correct: true, why: 'Constant-velocity motion and direct distance readings are linear, and the noise is Gaussian: the KF fuses both sensors optimally, weighting each by its $Q$ (one correction per sensor).' },
      { label: 'EKF', row: 'ekf', correct: false, why: 'Nothing is nonlinear, so the Jacobians are constants and the EKF is just the KF.' },
      { label: 'PF', row: 'pf', correct: false, why: 'Correct in principle, but it spends hundreds of particles on what two numbers per state hold exactly.' },
    ],
  },
  {
    id: 'kidnap',
    title: 'The kidnapped vacuum',
    text: 'A robot vacuum is tracking its pose well when someone picks it up and puts it down in another room.',
    shape: 'rare',
    options: [
      { label: 'EKF', row: 'ekf', correct: false, why: 'Its Gaussian is centred on the old pose. Readings from the new room look like outliers, and linearising at the wrong pose gives it no way to jump there.' },
      { label: 'PF, as it is', row: 'pf', correct: false, why: 'Once converged, every particle sits at the old pose. None is near the new pose, so none can win a high weight there, and resampling only copies particles that exist (particle deprivation).' },
      { label: 'PF + a few random particles', row: 'pf', correct: true, why: 'Injecting a few random particles each cycle means some land near the new pose; they win high weights and resampling multiplies them, so the cloud moves there within a few cycles (try Kidnap in the particle filter simulation).' },
    ],
  },
  {
    id: 'beacon',
    title: 'Range and bearing to a beacon',
    text: 'An underwater robot whose position is known to within a metre measures the range and bearing to an acoustic beacon at a known position, 200 m away.',
    shape: 'one',
    options: [
      { label: 'KF', row: 'kf', correct: false, why: 'The KF needs $z = Cx$ with a constant $C$. Range $\\sqrt{\\Delta x^2 + \\Delta y^2}$ and bearing $\\operatorname{atan2}(\\Delta y, \\Delta x)$ are not linear in the position.' },
      { label: 'EKF', row: 'ekf', correct: true, why: 'Nonlinear, but over a 1 m belief seen from 200 m away range and bearing are almost linear, so linearising $h$ at $\\bar\\mu$ (Jacobian $H$) is accurate and cheap.' },
      { label: 'PF', row: 'pf', correct: false, why: 'It works, but the belief is one small bump, exactly where the EKF is accurate and far cheaper.' },
    ],
  },
  {
    id: 'ekfslam',
    title: 'Warehouse with 30 tagged reflectors',
    text: 'A robot maps a warehouse with 30 distinctive reflectors, each with a unique ID, starting from a known pose.',
    shape: 'one',
    options: [
      { label: 'EKF-SLAM', row: 'ekfslam', correct: true, why: 'Few landmarks and no doubt about which one was seen (known data association): one joint Gaussian over the pose and all 30 landmarks is a $63 \\times 63$ covariance, cheap at this size, and it keeps every correlation.' },
      { label: 'FastSLAM', row: 'fastslam', correct: false, why: 'It works, but its strengths (thousands of landmarks, ambiguous associations) are not needed here, and it costs $M$ particles × 30 landmark filters.' },
      { label: 'KF', row: 'kf', correct: false, why: 'The landmarks are part of the state and range-bearing readings are nonlinear: a plain linear KF cannot do SLAM.' },
    ],
  },
  {
    id: 'fastslam',
    title: 'Hall of identical shelf legs',
    text: 'A robot maps a hall with thousands of identical shelf legs, and it is often unclear which leg the laser has hit.',
    shape: 'two',
    options: [
      { label: 'EKF-SLAM', row: 'ekfslam', correct: false, why: 'Thousands of landmarks make every update $O(N^2)$ on a huge covariance, and one wrong association is baked into the single Gaussian for good.' },
      { label: 'FastSLAM', row: 'fastslam', correct: true, why: 'A particle filter over the robot’s path in which each particle carries its own small EKF per landmark: cost about $M \\log N$ instead of $N^2$, and each particle makes its own data association, so wrong guesses die out at resampling.' },
      { label: 'PF over the pose only (MCL)', row: 'pf', correct: false, why: 'Monte Carlo localisation needs a known map; here the map is what is being built.' },
    ],
  },
];
