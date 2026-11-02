// "Localisation, mapping or SLAM?": the scenario bank shared by the which-problem simulation and the slam-which
// generator. Original wording; the scenarios mirror 2023 Q7-8, 2024 Q7-8, 2025 Q7-8 and the summary notes §4 table.
// The answer always follows from two facts: is the pose known, and is the map known?

export type Known = 'known' | 'unknown';
export type Problem = 'none' | 'localisation' | 'mapping' | 'slam';
export type SlamKind = 'online' | 'full';

export interface Scenario {
  id: string;
  /** Short card title. */
  title: string;
  /** The situation (Rich). */
  text: string;
  pose: Known;
  map: Known;
  /** SLAM only: online (current pose + map, while moving) or full (whole trajectory + map). */
  slam?: SlamKind;
  /** Why the pose / map are known or not (Rich). */
  poseWhy: string;
  mapWhy: string;
  source?: string;
}

/** The 2 × 2 table of the summary notes: what is unknown decides the problem. */
export function problemOf(pose: Known, map: Known): Problem {
  if (pose === 'known') return map === 'known' ? 'none' : 'mapping';
  return map === 'known' ? 'localisation' : 'slam';
}

export const PROBLEM_LABEL: Record<Problem, string> = {
  none: 'Neither: just plan and control',
  localisation: 'Localisation',
  mapping: 'Mapping',
  slam: 'SLAM',
};

/** What each problem estimates, in the course's notation (TeX, no $). */
export const POSTERIOR: Record<Problem | 'online' | 'full', string> = {
  none: '\\text{nothing to estimate: } x_t \\text{ and } m \\text{ are given}',
  localisation: 'p(x_t \\mid m, z_{1:t}, u_{1:t})',
  mapping: 'p(m \\mid x_{1:t}, z_{1:t})',
  slam: 'p(x_t, m \\mid z_{1:t}, u_{1:t})',
  online: 'p(x_t, m \\mid z_{1:t}, u_{1:t})',
  full: 'p(x_{1:t}, m \\mid z_{1:t}, u_{1:t})',
};

export const SCENARIOS: Scenario[] = [
  {
    id: 'satellite',
    title: 'Satellite temperature map',
    text: 'A satellite in low Earth orbit knows its pose precisely from GPS and ground tracking. Its job is to stitch surface-temperature readings into one global image.',
    pose: 'known',
    map: 'unknown',
    poseWhy: 'GPS and ground tracking give the pose directly: nothing to estimate.',
    mapWhy: 'The temperature image is what it is building.',
    source: 'Like 2023 Q7',
  },
  {
    id: 'forklift',
    title: 'Warehouse forklift with tags',
    text: 'An autonomous forklift moves pallets around a warehouse. It has the building layout, including the surveyed positions of fiducial tags that its cameras can detect.',
    pose: 'unknown',
    map: 'known',
    poseWhy: 'It must work out where it is from the tags it sees.',
    mapWhy: 'The layout and the tag positions are given in advance.',
    source: 'Like 2024 Q7',
  },
  {
    id: 'lunar',
    title: 'Lunar rover',
    text: 'A rover on the Moon must reconstruct the terrain around its landing site while it drives. There is no prior map, and there is no GPS on the Moon.',
    pose: 'unknown',
    map: 'unknown',
    slam: 'online',
    poseWhy: 'No GPS: the pose has to be estimated from odometry and what it sees.',
    mapWhy: 'There is no prior map: the map is the goal.',
    source: 'Like 2025 Q7',
  },
  {
    id: 'drone',
    title: 'Drone in a motion-capture arena',
    text: 'A drone flies inside a motion-capture arena that reports its exact pose 200 times a second, and builds a temperature map of the greenhouse plants below it.',
    pose: 'known',
    map: 'unknown',
    poseWhy: 'The motion-capture system measures the pose: it is given.',
    mapWhy: 'The temperature map is being built.',
    source: 'Summary notes §4 table',
  },
  {
    id: 'vacuum',
    title: 'Robot vacuum, first run',
    text: 'A robot vacuum is switched on for the first time in a new house. It has to cover every room and keep track of where it is as it goes.',
    pose: 'unknown',
    map: 'unknown',
    slam: 'online',
    poseWhy: 'Wheel odometry drifts and there is no external positioning indoors.',
    mapWhy: 'It has never seen the house.',
  },
  {
    id: 'museum',
    title: 'Museum guide robot',
    text: 'A museum guide robot is given an accurate floor plan of the galleries and carries a lidar. Each morning it is switched on wherever the staff left it.',
    pose: 'unknown',
    map: 'known',
    poseWhy: 'It starts somewhere unknown (global localisation): matching lidar scans to the plan finds it.',
    mapWhy: 'The floor plan is given.',
  },
  {
    id: 'survey',
    title: 'Mine survey, processed overnight',
    text: 'A survey van drives a lidar rig through an underground mine for an hour, logging everything. Back at the office the team computes, from the logs, the most accurate map of the tunnels and the path the van took.',
    pose: 'unknown',
    map: 'unknown',
    slam: 'full',
    poseWhy: 'No GPS underground: the van’s path must be estimated from the scans and odometry.',
    mapWhy: 'Producing the tunnel map is the point of the survey.',
  },
  {
    id: 'auv',
    title: 'Underwater shipwreck survey',
    text: 'An autonomous underwater vehicle explores an uncharted shipwreck, steering around it as it builds a model. GPS does not work underwater.',
    pose: 'unknown',
    map: 'unknown',
    slam: 'online',
    poseWhy: 'GPS does not reach underwater and inertial dead reckoning drifts.',
    mapWhy: 'Nobody has mapped the wreck.',
  },
  {
    id: 'arm',
    title: 'Factory arm in a surveyed cell',
    text: 'A factory arm with joint encoders works inside a cell whose fixtures all sit at surveyed CAD positions. It must move a part from one fixture to another without hitting anything.',
    pose: 'known',
    map: 'known',
    poseWhy: 'Encoders plus forward kinematics give the end-effector pose.',
    mapWhy: 'The CAD model gives every fixture.',
  },
  {
    id: 'car',
    title: 'Self-driving car with an HD map',
    text: 'A self-driving car carries a centimetre-accurate map of the city’s lane markings and poles, built months earlier. Its GPS drifts by metres between tall buildings, so it matches what its lidar sees to the map.',
    pose: 'unknown',
    map: 'known',
    poseWhy: 'GPS is too coarse: the pose comes from matching the lidar to the map.',
    mapWhy: 'The HD map is given (assumed still up to date).',
  },
  {
    id: 'mars',
    title: 'Mars rover data, reprocessed',
    text: 'On Earth, a team reprocesses a week of Mars rover images and wheel odometry, adjusting every past rover pose and every terrain landmark together to publish the best possible map.',
    pose: 'unknown',
    map: 'unknown',
    slam: 'full',
    poseWhy: 'Odometry drifts and there is no GPS on Mars: every past pose is being re-estimated.',
    mapWhy: 'The terrain map is the product.',
  },
];

export function scenarioById(id: string): Scenario {
  return SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0];
}
