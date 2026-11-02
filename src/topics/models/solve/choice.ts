// models-choice: velocity vs odometry properties (2023 Q6 NOT-style, 2024 Q6 and 2025 Q6 TRUE-style) and
// "which model fits this scenario?" for motion models, sensor models and the parts of the beam model.
// Tier 1: one property question and one scenario. Tier 2: a property question plus two scenarios from different banks.
import type { ChoicePart, SolveGenerator, SolvePart } from '../../../engine/types';
import type { Rng } from '../../../engine/rng';

interface Stmt {
  text: string;
  true: boolean;
  why: string;
}

const VEL: Stmt[] = [
  { text: 'It can be used for motion planning', true: true, why: 'Given a candidate command it predicts where the robot will go, so a planner can use it as a steering function (2023 Q32, 2024 Q6).' },
  { text: 'It is used in the prediction step of a Bayes filter', true: true, why: 'It is a motion model $p(x_t \\mid u_t, x_{t-1})$: it moves the belief forward and uncertainty grows.' },
  { text: 'Its input is the commanded velocity $(v, \\omega)$', true: true, why: 'It assumes the commanded translational and rotational velocities are held for $\\Delta t$.' },
  { text: 'It is typically less accurate than the odometry model', true: true, why: 'Motors never deliver exactly the command; odometry measures what the wheels really did.' },
  { text: 'It relies on proprioceptive data such as wheel encoders', true: false, why: 'Its input is a command, not a sensor reading; encoders feed the odometry model (2024 Q6).' },
  { text: 'It is used to compute the measurement step of a Bayes filter', true: false, why: 'Motion models belong to the prediction step; the measurement step uses the sensor model $p(z_t \\mid x_t)$ (2024 Q6).' },
  { text: 'It is typically more accurate than the odometry model', true: false, why: 'The other way round: it cannot see actuator errors that the encoders measure (2024 Q6).' },
  { text: 'Its input is only known after the robot has moved', true: false, why: 'The command is known as soon as it is issued, before any motion.' },
];

const ODO: Stmt[] = [
  { text: 'It relies on proprioceptive data (wheel encoders)', true: true, why: 'Encoders measure the robot’s own wheel rotation: proprioceptive (2025 Q6).' },
  { text: 'It is used in the prediction step of a Bayes filter', true: true, why: 'The encoder increments are treated as the control $u_t$ of the motion model, not as a measurement $z_t$ (2023 Q6).' },
  { text: 'It is typically more accurate than the velocity model', true: true, why: 'It measures the motion the wheels actually made, so actuator errors are already in the data (2023 Q6).' },
  { text: 'Its input $(\\delta_{rot1}, \\delta_{trans}, \\delta_{rot2})$ is only known after the robot has moved', true: true, why: 'The wheels must turn before the encoders can count anything.' },
  { text: 'It can be used for motion planning', true: false, why: 'Odometry readings exist only after the move, so it cannot predict the result of a command not yet executed (2023 Q6, 2025 Q6).' },
  { text: 'It is used to compute the measurement step of a Bayes filter', true: false, why: 'Like every motion model it belongs to the prediction step (2025 Q6).' },
  { text: 'It is typically less accurate than the velocity model', true: false, why: 'It is typically MORE accurate: it sees actuator errors the commands cannot (2025 Q6).' },
  { text: 'It notices when the wheels slip on the floor', true: false, why: 'Encoders count wheel turns, not ground motion: spinning wheels look like progress. Only exteroceptive sensing in the correction step catches slip.' },
];

interface Scenario {
  text: string;
  answer: number;
  why: string;
}

interface Bank {
  id: string;
  ask: string;
  options: string[];
  /** Why each option is wrong when it is not the answer. */
  wrong: string[];
  items: Scenario[];
}

const BANKS: Bank[] = [
  {
    id: 'motion',
    ask: 'Which motion model fits?',
    options: ['The velocity motion model', 'The odometry motion model', 'Neither: only a correction step with an exteroceptive sensor can help'],
    wrong: [
      'The velocity model only knows the command, which says nothing about this.',
      'Odometry needs encoder readings and only measures the wheels themselves.',
      'A motion model can handle this, so no correction step is needed for it.',
    ],
    items: [
      { text: 'An RRT planner needs a steering function that predicts where a candidate command will take the robot **before** it moves.', answer: 0, why: 'Only the command exists before the move: the velocity model turns it into an arc (2023 Q32).' },
      { text: 'A particle filter on a wheeled robot with good wheel encoders wants the most accurate prediction step it can get.', answer: 1, why: 'Encoder increments capture what the wheels really did, so odometry is typically the more accurate motion model.' },
      { text: 'A quadrotor has no wheels (so no wheel encoders), only the velocities it commands.', answer: 0, why: 'With no encoders there is no odometry; the commanded velocities are all the prediction step has.' },
      { text: 'A robot’s wheels spin on an icy patch: they turn, but the robot barely moves.', answer: 2, why: 'Both motion models assume the wheels grip: the command and the encoders both report progress that never happened. A lidar or camera in the correction step has to catch it.' },
    ],
  },
  {
    id: 'sensor',
    ask: 'Which sensor model fits best?',
    options: ['The beam model', 'The likelihood field (scan-based) model', 'A landmark (feature-based) model'],
    wrong: [
      'The beam model ray-casts every beam: exact about occlusion but slow, and its score jumps as the pose moves.',
      'The likelihood field scores end points by their distance to the nearest obstacle; it ignores what each ray passed through.',
      'A landmark model needs identifiable features and data association; a dense range scan of walls has no landmarks.',
    ],
    items: [
      { text: 'Fast localisation in a large occupancy-grid map with a 360-beam lidar, where a smooth score helps the optimiser.', answer: 1, why: 'One distance-transform lookup per beam, and the score changes smoothly with the pose.' },
      { text: 'A museum robot sees a few AprilTags at known positions, each with a unique ID, and measures range and bearing to them.', answer: 2, why: 'Range and bearing to identified features is exactly the landmark model; unique IDs even solve data association.' },
      { text: 'The model must treat a reading from beyond a wall as impossible, because the wall would have stopped the beam.', answer: 0, why: 'Only the beam model follows each ray through the map (ray casting), so it knows what the beam should have hit first.' },
    ],
  },
  {
    id: 'parts',
    ask: 'Which part of the beam model explains these readings?',
    options: ['$p_{hit}$ (Gaussian round $z^*$)', '$p_{short}$ (exponential on $[0, z^*]$)', '$p_{max}$ (point mass at $z_{max}$)', '$p_{rand}$ (uniform)'],
    wrong: [
      '$p_{hit}$ covers readings near the true range $z^*$ with ordinary measurement noise.',
      '$p_{short}$ covers readings shorter than $z^*$, caused by objects in front of the mapped one.',
      '$p_{max}$ covers readings of exactly $z_{max}$, when no echo returns.',
      '$p_{rand}$ covers unexplained readings anywhere in the range.',
    ],
    items: [
      { text: 'People keep walking between the sensor and the mapped wall.', answer: 1, why: 'They block the beam before the wall: short readings, more likely near than far.' },
      { text: 'The beam hits a glass door and no echo returns.', answer: 2, why: 'A missed return is reported as the maximum range: the $z_{max}$ spike.' },
      { text: 'The beam reaches the wall and the reading is a few centimetres off $z^*$.', answer: 0, why: 'That is ordinary measurement noise round the true range.' },
      { text: 'Sunlight triggers a reading that would put the wall 2 m behind where the map has it.', answer: 3, why: 'Nothing physical explains it: only the uniform part gives it non-zero probability.' },
    ],
  },
];

function propertyPart(rng: Rng, notStyle: boolean, id: string): { part: ChoicePart; model: 'velocity' | 'odometry'; key: Stmt } {
  const model = rng.chance(0.5) ? 'velocity' : 'odometry';
  const bank = model === 'velocity' ? VEL : ODO;
  const keys = bank.filter((s) => s.true === !notStyle);
  const others = bank.filter((s) => s.true === notStyle);
  const key = rng.pick(keys);
  // Never offer two statements about the same property (accuracy, planning, step) that contradict each other.
  const topic = (s: Stmt) => (/accurate/.test(s.text) ? 'acc' : /planning/.test(s.text) ? 'plan' : /step/.test(s.text) ? 'step' : /proprioceptive|input/i.test(s.text) ? 'input' : s.text);
  const pool = rng.shuffle(others).filter((s) => topic(s) !== topic(key));
  const picked: Stmt[] = [];
  for (const s of pool) if (picked.length < 3 && !picked.some((q) => topic(q) === topic(s))) picked.push(s);
  for (const s of pool) if (picked.length < 3 && !picked.includes(s)) picked.push(s);
  const opts = [key, ...picked];
  return {
    model,
    key,
    part: {
      kind: 'choice',
      id,
      label: notStyle ? `Which of the following is **NOT** true of the ${model} motion model?` : `Which of the following is **TRUE** of the ${model} motion model?`,
      options: opts.map((s) => ({
        text: s.text,
        correct: s === key,
        why: s === key ? (notStyle ? `Not true: ${s.why}` : `True: ${s.why}`) : notStyle ? `True, so not the answer: ${s.why}` : `False: ${s.why}`,
      })),
      marks: 1,
    },
  };
}

function scenarioPart(rng: Rng, bank: Bank, id: string): { part: ChoicePart; item: Scenario } {
  const item = rng.pick(bank.items);
  return {
    item,
    part: {
      kind: 'choice',
      id,
      label: `${item.text} ${bank.ask}`,
      options: bank.options.map((o, i) => ({ text: o, correct: i === item.answer, why: i === item.answer ? `Yes: ${item.why}` : `No: ${bank.wrong[i]}` })),
      fixedOrder: bank.id === 'parts',
      marks: 1,
    },
  };
}

export const generators: SolveGenerator[] = [
  {
    id: 'models-choice',
    title: 'Which model? Velocity, odometry and sensor models',
    summary: 'The recurring Q6 facts (planning, proprioceptive data, filter step, accuracy) and matching scenarios to motion models, sensor models and the parts of the beam model.',
    tiers: [1, 2],
    source: 'Recurring: 2023 Q6, 2024 Q6, 2025 Q6; summary notes §3 (sensor models); review deck learning outcomes',
    cardId: 'models-role',
    marks: 3,
    generate(rng, tier) {
      const prop = propertyPart(rng, tier === 2 ? rng.chance(0.6) : rng.chance(0.3), 'prop');
      const banks = rng.shuffle(BANKS).slice(0, tier === 1 ? 1 : 2);
      const scen = banks.map((b, i) => ({ bank: b, ...scenarioPart(rng, b, `scen${i + 1}`) }));
      const parts: SolvePart[] = [prop.part, ...scen.map((s) => s.part)];
      const prompt =
        tier === 1
          ? 'Two multiple-choice questions on motion and sensor models (1 mark each). Pick one option in each.'
          : 'Three multiple-choice questions on motion and sensor models (1 mark each). Read each stem carefully: one asks for a statement that is NOT true.';
      const table =
        '$$\\begin{array}{l|l|l} & \\text{velocity model} & \\text{odometry model} \\\\ \\hline \\text{input} & \\text{commanded } (v, \\omega) & \\text{encoder increments } (\\delta_{rot1}, \\delta_{trans}, \\delta_{rot2}) \\\\ \\text{data} & \\text{a command} & \\text{proprioceptive (wheel encoders)} \\\\ \\text{known} & \\text{before moving} & \\text{after moving} \\\\ \\text{planning?} & \\text{yes} & \\text{no} \\\\ \\text{accuracy} & \\text{lower} & \\text{usually higher} \\\\ \\text{filter step} & \\text{prediction} & \\text{prediction} \\end{array}$$';
      const hints: [string, string, string, string] = [
        'Motion models drive the **prediction** step; sensor models drive the **correction** step. The velocity model uses the command (known before moving, so it can plan); the odometry model uses wheel-encoder increments (proprioceptive, known only after moving, usually more accurate). Sensor models: the beam model ray-casts each beam and mixes four parts; the likelihood field scores end points by their distance to the nearest obstacle; landmark models use range and bearing to features and need data association.',
        `${table} Beam model parts: $p_{hit}$ (noise round $z^*$), $p_{short}$ (objects in front, $z < z^*$), $p_{max}$ (no return: $z = z_{max}$), $p_{rand}$ (unexplained).`,
        [
          `Question 1 is about the **${prop.model}** model and asks for the ${tier === 2 && prop.part.label.includes('NOT') ? 'one FALSE statement' : 'one TRUE statement'}: check each option against its column of the table.`,
          ...scen.map((s, i) => `Question ${i + 2}: look for the cue in “${s.item.text.replace(/\*\*/g, '')}” and match it to ${s.bank.id === 'motion' ? 'what each motion model knows and when' : s.bank.id === 'sensor' ? 'what each sensor model computes per beam or feature' : 'the cause of each kind of reading'}.`),
        ].join('\n\n'),
        [
          `1. **${prop.key.text}**. ${prop.key.why}`,
          ...scen.map((s, i) => `${i + 2}. **${s.bank.options[s.item.answer]}**. ${s.item.why}`),
        ].join('\n\n'),
      ];
      return { prompt, parts, hints };
    },
  },
];
