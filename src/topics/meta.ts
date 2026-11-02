// Fixed metadata for every topic (numbers and titles follow the exam summary notes' sections 1-9).
import type { Part, TopicCode } from '../engine/codes';

export interface TopicMeta {
  code: TopicCode;
  /** Section number in the summary notes (shown as the tile badge). */
  num: number;
  part: Part;
  title: string;
  short: string;
  lectures: string;
  blurb: string;
  exam: string;
}

export const TOPIC_META: Record<TopicCode, TopicMeta> = {
  bayes: { code: 'bayes', num: 1, part: 'estimate', title: 'Probability and the Bayes filter', short: 'Bayes', lectures: 'Notes §1', blurb: 'Beliefs, Bayes’ rule, the Markov assumption, and the predict and correct steps by hand.', exam: '3 MCQs · 2-mark short answer · 15-mark long answer' },
  filters: { code: 'filters', num: 2, part: 'estimate', title: 'Kalman, EKF and particle filters', short: 'Filters', lectures: 'Notes §2', blurb: 'Three ways to represent a belief: one Gaussian, a linearised Gaussian, or weighted samples.', exam: '2 MCQs · 1-mark short answer' },
  models: { code: 'models', num: 3, part: 'estimate', title: 'Motion and sensor models', short: 'Models', lectures: 'Notes §3', blurb: 'Velocity vs odometry models, arcs of radius v/ω, and the four-part beam model.', exam: '1 MCQ · 6-mark velocity model in a long answer' },
  slam: { code: 'slam', num: 4, part: 'estimate', title: 'Mapping and SLAM', short: 'SLAM', lectures: 'Notes §4', blurb: 'Occupancy grids in log-odds, localisation vs mapping vs SLAM, data association and loop closure.', exam: '2 MCQs · 2–3-mark short answers · 10-mark long answer' },
  plan: { code: 'plan', num: 5, part: 'decide', title: 'Motion planning', short: 'Planning', lectures: 'Notes §5', blurb: 'C-space, BFS/Dijkstra/A*, PRM, RRT and RRT*, potential fields and the dynamic window.', exam: '2–3 MCQs · C-space short answer · 10–15-mark long answer' },
  kin: { code: 'kin', num: 6, part: 'act', title: 'Forward and inverse kinematics', short: 'Kinematics', lectures: 'Notes §6', blurb: 'M, screw axes in {s} and {b}, the product of exponentials, Pieper and Newton–Raphson.', exam: '2 MCQs · 9–12 marks of the arm long answer' },
  vision: { code: 'vision', num: 7, part: 'see', title: 'Robot perception and vision', short: 'Vision', lectures: 'Notes §7', blurb: 'Sensors, the pinhole model, intrinsics vs extrinsics, world to pixel, and visual servoing.', exam: '3 MCQs · 3-mark sensor comparison · 3–6 marks of the arm long answer' },
  rl: { code: 'rl', num: 8, part: 'decide', title: 'Reinforcement learning', short: 'RL', lectures: 'Notes §8', blurb: 'MDPs, returns and discounting, Q-learning, policies vs plans, and sim-to-real.', exam: '3 MCQs · 1–4-mark short answer' },
  multi: { code: 'multi', num: 9, part: 'team', title: 'Multi-robot and multi-agent systems', short: 'Multi-robot', lectures: 'Notes §9', blurb: 'Implicit vs explicit coordination, task allocation, communication and credit assignment.', exam: '2 MCQs · 3-mark comparison' },
};
