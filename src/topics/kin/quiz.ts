// MCQs (original wording, cited to the past papers), method games and exam-style short answers for 'kin'.
// Covers every kinematics MCQ of 2023–2025 (2023 Q11, Q12; 2024 Q12; 2025 Q12), the 2022 kinematics questions,
// the arm + camera long answers (2023 Q33, 2024 Q30, 2025 Q30) and the review deck's practice questions (slides 18–20).
import type { Game, MCQ, ShortAnswer } from '../../engine/types';

export const mcqs: MCQ[] = [
  // ------------------------------------------------------------------ forward vs inverse
  {
    id: 'kin-q-not-fk',
    style: 'incorrect',
    stem: 'Each option is offered as an example of a **forward kinematics** problem. One of them is NOT forward kinematics: which?',
    options: [
      {
        text: 'Finding the joint angles that place an arm’s end-effector at a desired pose',
        correct: true,
        why: 'This is the one: the pose is given and the joint values are unknown, which is INVERSE kinematics.',
      },
      {
        text: 'Finding the pose of an intermediate joint’s frame from the arm’s joint angles',
        correct: false,
        why: 'Forward kinematics: it covers every frame along the chain, not only the end-effector (stop the product of exponentials earlier).',
      },
      {
        text: 'Finding an arm’s end-effector pose from its joint angles',
        correct: false,
        why: 'The textbook definition of forward kinematics.',
      },
      {
        text: 'Finding a mobile robot’s final pose from its wheel velocities',
        correct: false,
        why: 'Forward: the inputs are known and are integrated through the motion model to give the pose.',
      },
    ],
    source: 'Recurring: 2023 Q11 (the NOT form), 2024 Q12, 2025 Q12',
    trapId: 'read-the-stem',
    difficulty: 1,
  },
  {
    id: 'kin-q-is-ik',
    style: 'most-correct',
    stem: 'Which of these describes an inverse kinematics problem?',
    options: [
      {
        text: 'Choosing the joint angles that bring an arm’s gripper to a given pose',
        correct: true,
        why: 'Desired pose in, joint values out: inverse kinematics. It may have several solutions, or none.',
      },
      {
        text: 'Computing where an arm’s gripper is from its joint encoder readings',
        correct: false,
        why: 'Joint values in, pose out: that is forward kinematics.',
      },
      {
        text: 'Computing where an arm’s elbow frame is from its joint angles',
        correct: false,
        why: 'Still forward kinematics, just for an intermediate frame.',
      },
      {
        text: 'Computing a mobile robot’s final pose from its wheel speeds',
        correct: false,
        why: 'Forward: known inputs are integrated through the motion model to give the pose.',
      },
    ],
    source: 'Recurring: 2024 Q12 (the IK form), 2023 Q11, 2025 Q12',
    difficulty: 1,
  },
  {
    id: 'kin-q-is-fk',
    style: 'most-correct',
    stem: 'Which of these describes a forward kinematics problem?',
    options: [
      {
        text: 'Predicting a mobile robot’s final pose from its wheel velocities',
        correct: true,
        why: 'Known inputs (wheel speeds) in, pose out: the forward direction, even though the robot is not an arm.',
      },
      {
        text: 'Finding the steering commands that make a mobile robot follow a given path',
        correct: false,
        why: 'A desired motion is given and the inputs are found: the inverse direction (path tracking, a control problem).',
      },
      {
        text: 'Finding the joint angles an arm needs to put its end-effector at a desired pose',
        correct: false,
        why: 'That is inverse kinematics.',
      },
      {
        text: 'Finding the forces and torques that act at the end-effector of a robot arm',
        correct: false,
        why: 'Forces and torques belong to statics and dynamics, not kinematics.',
      },
    ],
    source: 'Recurring: 2025 Q12 (the FK form), 2023 Q11, 2024 Q12; review deck slide 19',
    difficulty: 1,
  },
  {
    id: 'kin-q-ik-solutions',
    style: 'correct',
    stem: 'About the number of inverse kinematics solutions:',
    options: [
      {
        text: 'A target pose outside the workspace has no solution, even for a redundant arm',
        correct: true,
        why: 'Spare joints cannot reach past the workspace: an out-of-reach position or an orientation the wrist cannot make has no solution at all (2022 Q4).',
      },
      {
        text: 'A redundant arm always has at least one solution, because it has more joints than the task needs',
        correct: false,
        why: 'False (2022 Q4): redundancy only helps for poses inside the workspace.',
      },
      {
        text: 'A non-redundant arm has exactly one solution for every pose inside its workspace',
        correct: false,
        why: 'Usually several: a planar 2-link arm has elbow up and elbow down, and a 6R arm with a spherical wrist up to 8.',
      },
      {
        text: 'A redundant arm has finitely many solutions inside its workspace',
        correct: false,
        why: 'Infinitely many (2022 Q18): with extra joints the arm can move internally (self-motion) while the end-effector stays still.',
      },
    ],
    source: 'Similar to 2022 Q4, Q18; notes §6',
    difficulty: 1,
  },
  // ------------------------------------------------------------------ Pieper
  {
    id: 'kin-q-pieper',
    style: 'most-correct',
    stem: 'Each option describes a 6-DOF arm, base joint first. Which one is guaranteed a closed-form inverse kinematics solution by Pieper’s criterion?',
    options: [
      {
        text: 'Revolute, revolute, prismatic, then three revolute joints whose axes all pass through one point',
        correct: true,
        why: 'The last three revolute axes intersect at one point, a spherical wrist (this is the Stanford arm), so position and orientation decouple.',
      },
      {
        text: 'Six revolute joints, with the last link offset along joint 5’s axis so that the three wrist axes never meet',
        correct: false,
        why: 'With that offset, axes 4, 5 and 6 share no point, and no other three consecutive axes are parallel or intersecting.',
      },
      {
        text: 'Six revolute joints with joints 1, 3 and 5 parallel, every neighbouring pair perpendicular and offset',
        correct: false,
        why: 'Parallel, but not consecutive: Pieper needs three neighbouring axes, and here neighbours are perpendicular and offset.',
      },
      {
        text: 'Two prismatic joints, then four revolute joints, no three of which meet at a point or are parallel',
        correct: false,
        why: 'Neither condition holds for any three consecutive revolute axes, so Pieper guarantees nothing.',
      },
    ],
    source: 'Similar to 2023 Q12; review deck slide 19',
    difficulty: 2,
  },
  {
    id: 'kin-q-pieper-why',
    style: 'most-correct',
    stem: 'Why does a spherical wrist make a closed-form inverse kinematics solution possible for a 6-DOF arm?',
    options: [
      {
        text: 'The wrist centre’s position depends only on joints 1–3, so position and orientation are solved separately',
        correct: true,
        why: 'Rotations about axes through one point leave that point fixed. Solve joints 1–3 for the wrist centre (3 equations, 3 unknowns), then joints 4–6 for the remaining rotation.',
      },
      {
        text: 'The wrist keeps the Jacobian invertible in every configuration, so Newton–Raphson converges in a single step',
        correct: false,
        why: 'A closed form needs no iteration at all, and a spherical wrist has its own singularity (when axes 4 and 6 line up).',
      },
      {
        text: 'The three wrist joints only add translations, so the position equations become linear in the joint angles',
        correct: false,
        why: 'The wrist joints are revolute: they add rotation only, and they do not move the wrist centre.',
      },
      {
        text: 'It removes three degrees of freedom from the arm, leaving fewer unknowns than there are equations to solve',
        correct: false,
        why: 'The arm still has 6 DOF. The six unknowns are split into two groups of three, not reduced.',
      },
    ],
    source: 'Notes §6; review deck slide 19; 2023 Q12 reasoning',
    difficulty: 2,
  },
  // ------------------------------------------------------------------ M and rotations
  {
    id: 'kin-q-m-columns',
    style: 'value',
    stem: 'In the zero configuration, $\\hat x_b$ points along $+\\hat y_s$, $\\hat y_b$ along $-\\hat x_s$ and $\\hat z_b$ along $+\\hat z_s$. What is the rotation $R$ in $M$, the orientation of {b} in {s}?',
    options: [
      {
        text: '$\\begin{bmatrix} 0 & -1 & 0 \\\\ 1 & 0 & 0 \\\\ 0 & 0 & 1 \\end{bmatrix}$',
        correct: true,
        why: 'The columns are {b}’s axes written in {s}: $\\hat x_b = (0, 1, 0)$, $\\hat y_b = (-1, 0, 0)$, $\\hat z_b = (0, 0, 1)$. A +90° rotation about $\\hat z$, with $\\det R = +1$.',
      },
      {
        text: '$\\begin{bmatrix} 0 & 1 & 0 \\\\ -1 & 0 & 0 \\\\ 0 & 0 & 1 \\end{bmatrix}$',
        correct: false,
        why: 'The transpose: {b}’s axes written as rows. That is $R_{bs}$, the orientation of {s} in {b}.',
      },
      {
        text: '$\\begin{bmatrix} 0 & -1 & 0 \\\\ 1 & 0 & 0 \\\\ 0 & 0 & -1 \\end{bmatrix}$',
        correct: false,
        why: 'Left-handed: $\\hat x_b \\times \\hat y_b = (0, 0, 1)$ but the third column says $(0, 0, -1)$, so $\\det R = -1$ and it is not a rotation.',
      },
      {
        text: '$\\begin{bmatrix} 0 & 1 & 0 \\\\ 1 & 0 & 0 \\\\ 0 & 0 & -1 \\end{bmatrix}$',
        correct: false,
        why: 'A valid rotation, but its second column says $\\hat y_b = +\\hat x_s$ and its third flips $\\hat z_b$: not the frame described.',
      },
    ],
    source: 'Similar to 2022 Q3',
    difficulty: 1,
  },
  {
    id: 'kin-q-diagonal-read',
    style: 'value',
    stem: 'An exam figure draws $\\hat x_s$ pointing down-left, $\\hat y_s$ to the right and $\\hat z_s$ up. From the top of the vertical column, a link of length $L_2$ is drawn running up-right. As a displacement in {s}, that link is:',
    options: [
      {
        text: '$(-L_2,\\ 0,\\ 0)$',
        correct: true,
        why: 'The down-left arrow is $\\hat x_s$ coming out of the page, so up-right goes into the page, along $-\\hat x_s$ (2023 Q33: $p$ starts with $-L_2$).',
      },
      {
        text: '$(L_2,\\ 0,\\ 0)$',
        correct: false,
        why: 'Right axis, wrong sign: the link runs away from the viewer, opposite to the drawn $\\hat x_s$ arrow.',
      },
      {
        text: '$(0,\\ L_2,\\ 0)$',
        correct: false,
        why: '$\\hat y_s$ is drawn horizontally; a link drawn up-right is the depth direction of the oblique sketch.',
      },
      {
        text: '$\\tfrac{L_2}{\\sqrt2}(0,\\ 1,\\ 1)$',
        correct: false,
        why: 'Treats the slanted line as a real 45° direction. In these oblique sketches the slant means into or out of the page.',
      },
    ],
    source: 'Similar to 2023 Q33(a), 2024 Q30(a)',
    trapId: 'diagonal-axis',
    difficulty: 2,
  },
  {
    id: 'kin-q-rotation',
    style: 'incorrect',
    stem: 'About rotation matrices and other ways of representing orientation:',
    options: [
      {
        text: 'Any 3 × 3 matrix with determinant 1 is a rotation matrix',
        correct: true,
        why: 'This is the false one: $\\det R = 1$ is necessary but not sufficient. $\\mathrm{diag}(2, \\tfrac12, 1)$ has determinant 1 and stretches space; a rotation also needs $R^TR = I$ (2022 Q7).',
      },
      {
        text: 'The set of all 3 × 3 rotation matrices forms the group SO(3)',
        correct: false,
        why: 'True: the special orthogonal group, $R^TR = I$ and $\\det R = +1$.',
      },
      {
        text: 'A rotation matrix is an implicit representation: 9 numbers tied by 6 constraints, leaving 3 DOF',
        correct: false,
        why: 'True (2022 Q7): the constraints $R^TR = I$ leave 3 independent numbers.',
      },
      {
        text: 'Exponential coordinates $\\hat\\omega\\theta \\in \\mathbb{R}^3$ are an alternative representation of a rotation',
        correct: false,
        why: 'True (2022 Q15): axis times angle, turned back into $R = e^{[\\hat\\omega]\\theta}$ by Rodrigues’ formula.',
      },
    ],
    source: 'Similar to 2022 Q7, Q15',
    difficulty: 1,
  },
  // ------------------------------------------------------------------ screw axes
  {
    id: 'kin-q-revolute-v',
    style: 'value',
    stem: 'A revolute joint has $\\omega = (0, 1, 0)$, and its axis passes through $q = (L_2, 0, L_1)$ (both in {s}). What is $v$ in its screw axis?',
    options: [
      {
        text: '$(-L_1,\\ 0,\\ L_2)$',
        correct: true,
        why: '$v = -\\omega \\times q$; for $\\omega = \\hat y$ the shortcut is $(-q_z, 0, q_x) = (-L_1, 0, L_2)$ (2025 Q30, joint 3).',
      },
      {
        text: '$(L_1,\\ 0,\\ -L_2)$',
        correct: false,
        why: 'That is $\\omega \\times q$: the minus sign was dropped.',
      },
      {
        text: '$(0,\\ L_1,\\ 0)$',
        correct: false,
        why: 'That is the $\\omega = \\hat x$ shortcut, $(0, q_z, -q_y)$, applied to the wrong axis.',
      },
      {
        text: '$(0,\\ 0,\\ 0)$',
        correct: false,
        why: 'Only an axis through the origin has $v = 0$, and this axis misses the origin.',
      },
    ],
    source: 'Similar to 2025 Q30(b)',
    trapId: 'v-cross-sign',
    difficulty: 1,
  },
  {
    id: 'kin-q-flip',
    style: 'correct',
    stem: 'A screw-axis table has joint 3 as $\\omega_3 = (1, 0, 0)$, $q_3 = (0, 0, L_1)$, $v_3 = (0, L_1, 0)$. You then notice that its rotation arrow points the other way.',
    options: [
      {
        text: '$\\omega_3$ and $v_3$ both change sign, to $(-1, 0, 0)$ and $(0, -L_1, 0)$, while $q_3$ stays where it is',
        correct: true,
        why: '$v = -\\omega \\times q$ is linear in $\\omega$, so negating $\\omega$ negates $v$. The point on the axis does not change, and the joint simply turns the other way for positive $\\theta_3$.',
      },
      {
        text: 'Only $\\omega_3$ changes sign, because $v_3$ depends only on where the joint axis is located',
        correct: false,
        why: '$v$ depends on the direction of the axis as well as its location: $v = -\\omega \\times q$.',
      },
      {
        text: '$q_3$ must be negated as well, to $(0, 0, -L_1)$, so that $v_3$ keeps its value',
        correct: false,
        why: '$q$ is a point on the axis, fixed by the geometry; $(0, 0, -L_1)$ is not on this axis.',
      },
      {
        text: 'The row cannot be fixed, because $\\omega$ must point along a positive coordinate axis',
        correct: false,
        why: 'Any unit vector is a valid $\\omega$; its sign comes from the drawn arrow and the right-hand rule.',
      },
    ],
    source: 'Notes §6 step 5; 2023 Q33(b) worked solution',
    difficulty: 1,
  },
  {
    id: 'kin-q-prismatic',
    style: 'incorrect',
    stem: 'About the screw axis of a prismatic joint:',
    options: [
      {
        text: 'Its $v$ is $-\\omega \\times q$ for a point $q$ on the joint, exactly as for a revolute joint',
        correct: true,
        why: 'This is the false one: with $\\omega = 0$ that formula gives $v = 0$, a joint that does nothing. A prismatic joint’s $v$ is the unit direction of travel.',
      },
      {
        text: 'Its $\\omega$ is zero',
        correct: false,
        why: 'True: a prismatic joint rotates nothing.',
      },
      {
        text: 'Its $v$ is a unit vector along the direction of travel, e.g. $(0, 0, 1)$ for a joint that slides straight up',
        correct: false,
        why: 'True: like the vertical joint 2 of 2023 Q33, or joint 1 of 2024 Q30.',
      },
      {
        text: 'Where the joint sits on the arm does not change its screw axis',
        correct: false,
        why: 'True: a translation moves every point by the same vector, so only the direction matters.',
      },
      {
        text: 'Its pitch is infinite',
        correct: false,
        why: 'True (2022 Q11): pitch is translation per radian of rotation, and there is no rotation.',
      },
    ],
    source: 'Notes §6; 2022 Q11; 2023 Q33(b), 2024 Q30(b)',
    difficulty: 1,
  },
  // ------------------------------------------------------------------ PoE and the groups
  {
    id: 'kin-q-groups',
    style: 'most-correct',
    stem: 'The set of all 4 × 4 matrices $[\\mathcal{V}] = \\begin{bmatrix} [\\omega] & v \\\\ 0 & 0 \\end{bmatrix}$ that represent twists is called:',
    options: [
      {
        text: 'se(3)',
        correct: true,
        why: 'Rigid-body velocities in matrix form (the Lie algebra of SE(3)); the exponential $e^{[\\mathcal{S}]\\theta}$ maps it onto SE(3).',
      },
      {
        text: 'SE(3)',
        correct: false,
        why: 'SE(3) holds the 4 × 4 homogeneous transforms (poses), with a rotation block and the bottom row $(0, 0, 0, 1)$.',
      },
      {
        text: 'so(3)',
        correct: false,
        why: 'so(3) holds the 3 × 3 skew-symmetric matrices $[\\omega]$: angular velocities only.',
      },
      {
        text: 'SO(3)',
        correct: false,
        why: 'SO(3) holds the 3 × 3 rotation matrices.',
      },
    ],
    source: 'Similar to 2022 Q8, Q20',
    difficulty: 1,
  },
  {
    id: 'kin-q-rodrigues',
    style: 'most-correct',
    stem: 'Rodrigues’ formula is used to compute:',
    options: [
      {
        text: 'the rotation matrix for a rotation by $\\theta$ about a unit axis $\\hat\\omega$',
        correct: true,
        why: '$e^{[\\hat\\omega]\\theta} = I + \\sin\\theta[\\hat\\omega] + (1 - \\cos\\theta)[\\hat\\omega]^2$: axis and angle in, rotation matrix out (2022 Q9).',
      },
      {
        text: 'the end-effector transform produced by the screw motions of all the joints in turn',
        correct: false,
        why: 'That is the product of exponentials formula, which uses Rodrigues inside each factor.',
      },
      {
        text: 'the time derivative of a rotation matrix from the angular velocity of the rotating frame',
        correct: false,
        why: 'That is $\\dot R = [\\omega_s]R$, not Rodrigues.',
      },
      {
        text: 'the joint angles of a serial arm that reach a desired end-effector pose',
        correct: false,
        why: 'That is inverse kinematics.',
      },
    ],
    source: 'Similar to 2022 Q9',
    difficulty: 1,
  },
  {
    id: 'kin-q-body',
    style: 'correct',
    stem: 'You need the body-frame screw axes for $T(\\theta) = M e^{[\\mathcal{B}_1]\\theta_1} \\cdots e^{[\\mathcal{B}_n]\\theta_n}$.',
    options: [
      {
        text: '$\\mathcal{B}_i = [\\mathrm{Ad}_{M^{-1}}]\\mathcal{S}_i$: $\\omega$ in {b} axes, $q$ measured from the {b} origin',
        correct: true,
        why: 'The body axes are the same physical joint axes, expressed in {b} at the zero configuration (review deck slide 20).',
      },
      {
        text: 'If {b} is parallel to {s}, then $\\mathcal{B}_i = \\mathcal{S}_i$ and the {s} table can be copied over unchanged',
        correct: false,
        why: 'Only $\\omega$ carries over. The origin has moved to $p$, so every $q$, and with it every revolute $v$, changes: the review deck’s arm has $R = I$ and different $v$s.',
      },
      {
        text: '$\\mathcal{B}_i = [\\mathrm{Ad}_M]\\mathcal{S}_i$, because $M$ is the transform that takes {s} to {b}',
        correct: false,
        why: 'Backwards: $[\\mathrm{Ad}_M]$ takes body-frame twists to the space frame, $\\mathcal{S}_i = [\\mathrm{Ad}_M]\\mathcal{B}_i$.',
      },
      {
        text: 'The body form reverses the joint order, so $\\mathcal{B}_n$ is the factor written next to $M$',
        correct: false,
        why: 'The order is the same in both forms (joint 1 first); only the side of $M$ changes.',
      },
    ],
    source: 'Review deck slide 20; notes §6 step 4; 2022 Q35',
    trapId: 'b-frame-q',
    difficulty: 2,
  },
  {
    id: 'kin-q-poe-order',
    style: 'incorrect',
    stem: 'About the space-form product of exponentials $T(\\theta) = e^{[\\mathcal{S}_1]\\theta_1} \\cdots e^{[\\mathcal{S}_n]\\theta_n} M$:',
    options: [
      {
        text: 'The exponentials may be multiplied in any order, since every $\\mathcal{S}_i$ is written in the same fixed frame',
        correct: true,
        why: 'This is the false one: rigid motions about different axes do not commute. The factors stay in joint order, base first.',
      },
      {
        text: 'At $\\theta = 0$ every factor is the identity, so $T(0) = M$',
        correct: false,
        why: 'True, and the quickest check of any PoE answer.',
      },
      {
        text: 'Each $\\mathcal{S}_i$ is joint $i$’s screw axis at the zero configuration, written in {s}, so one table serves every configuration',
        correct: false,
        why: 'True: each axis is applied before any inboard joint has moved it away from its zero-configuration place.',
      },
      {
        text: 'For a prismatic joint, $e^{[\\mathcal{S}_i]\\theta_i}$ is a pure translation by $v_i\\theta_i$',
        correct: false,
        why: 'True: with $\\omega = 0$ the exponential is $\\begin{bmatrix} I & v\\theta \\\\ 0 & 1 \\end{bmatrix}$.',
      },
    ],
    source: 'Notes §6 (product of exponentials)',
    difficulty: 2,
  },
  // ------------------------------------------------------------------ numerical IK and the Jacobian
  {
    id: 'kin-q-nr',
    style: 'correct',
    stem: 'About Newton–Raphson inverse kinematics:',
    options: [
      {
        text: 'Started from different initial guesses, it may converge to different solutions, such as elbow up and elbow down',
        correct: true,
        why: 'Each solution has its own basin of attraction, and the guess decides which one you land in (elbow up vs elbow down).',
      },
      {
        text: 'It always converges, because every step uses the exact Jacobian at the current guess',
        correct: false,
        why: 'False (2022 Q12): the Jacobian is only a local linearisation; from a poor guess the iteration can overshoot, oscillate or diverge.',
      },
      {
        text: 'It can only be used on arms that satisfy Pieper’s criterion for a closed-form solution',
        correct: false,
        why: 'Backwards: numerical IK is what you use when Pieper does NOT hold. It works for any arm whose FK and Jacobian you can compute.',
      },
      {
        text: 'It converges fastest close to a singularity, where the Jacobian’s inverse is largest',
        correct: false,
        why: 'Near a singularity $J$ loses rank, $J^{\\dagger}$ blows up and the steps become huge and erratic.',
      },
    ],
    source: 'Similar to 2022 Q12; notes §6',
    difficulty: 1,
  },
  {
    id: 'kin-q-singularity',
    style: 'incorrect',
    stem: 'About kinematic singularities:',
    options: [
      {
        text: 'They can be avoided by choosing suitable base and end-effector frames',
        correct: true,
        why: 'This is the false one (2022 Q29): changing frames multiplies the Jacobian by an invertible adjoint, which does not change its rank. Singularities belong to the configuration.',
      },
      {
        text: 'At a singularity the Jacobian loses rank',
        correct: false,
        why: 'True: that is the definition (2022 Q21).',
      },
      {
        text: 'At a singularity the end-effector cannot move instantaneously in some direction',
        correct: false,
        why: 'True: losing rank means some twist is outside the range of $J$.',
      },
      {
        text: 'Near a singularity, small end-effector velocities can demand very large joint velocities',
        correct: false,
        why: 'True: $\\dot\\theta = J^{\\dagger}\\mathcal{V}$ blows up as $J$ approaches the loss of rank.',
      },
      {
        text: 'A planar 2-link arm is singular when fully stretched out or folded back on itself',
        correct: false,
        why: 'True: $\\det J = L_1L_2\\sin\\theta_2 = 0$ at $\\theta_2 = 0$ or $\\pi$, where the tip cannot move radially.',
      },
    ],
    source: 'Similar to 2022 Q21, Q29',
    difficulty: 1,
  },
  {
    id: 'kin-q-jacobian-convert',
    style: 'most-correct',
    stem: 'How is the body Jacobian $J_b$ obtained from the space Jacobian $J_s$?',
    options: [
      {
        text: '$J_b = [\\mathrm{Ad}_{T_{bs}}]\\,J_s$',
        correct: true,
        why: 'Every column is a twist, and twists change frame through the 6 × 6 adjoint of the transform between the frames (2022 Q27).',
      },
      {
        text: '$J_b = T_{sb}\\,J_s$',
        correct: false,
        why: 'The sizes do not even match: $T$ is 4 × 4 and the Jacobian is $6 \\times n$.',
      },
      {
        text: '$J_b = J_s^{-1} = J_s^T$',
        correct: false,
        why: 'The Jacobian is not a rotation matrix, and it is not even square in general.',
      },
      {
        text: 'It cannot be converted: $J_b$ has to be rebuilt from the body-frame screw axes',
        correct: false,
        why: 'Rebuilding works but is unnecessary: the adjoint converts every column at once.',
      },
    ],
    source: 'Similar to 2022 Q27',
    difficulty: 2,
  },
  {
    id: 'kin-q-jacobian-rank',
    style: 'incorrect',
    stem: 'About the geometric Jacobian:',
    options: [
      {
        text: 'An RP arm with $x = (L_1 + L_2 + \\theta_2)\\cos\\theta_1$, $y = (L_1 + L_2 + \\theta_2)\\sin\\theta_1$, $\\phi = \\theta_1$ loses rank at $\\theta_2 = 0$',
        correct: true,
        why: 'This is the false one (2022 Q26): column 2 is $(\\cos\\theta_1, \\sin\\theta_1, 0)$ and column 1 has a 1 in the $\\phi$ row, so they are never parallel; $\\theta_2 = 0$ just means the reach is $L_1 + L_2$.',
      },
      {
        text: 'It maps joint velocities to the end-effector twist, $\\mathcal{V} = J(\\theta)\\dot\\theta$',
        correct: false,
        why: 'True: that is what it is for.',
      },
      {
        text: 'For a 9-DOF arm its rank is at most 6',
        correct: false,
        why: 'True: it is $6 \\times 9$, and a twist has only 6 components.',
      },
      {
        text: 'For a 6-DOF arm its rank is at most 6',
        correct: false,
        why: 'True: rank 6 away from singularities, less at them.',
      },
    ],
    source: 'Similar to 2022 Q26',
    difficulty: 2,
  },
  // ------------------------------------------------------------------ camera and foundations
  {
    id: 'kin-q-depth',
    style: 'value',
    stem: 'A camera on the end-effector sits at $p = (-0.2, 0.4, 1.5)$ m and looks along $+\\hat y_s$. A person 1.7 m tall stands upright at $(-0.2, 5, 0)$ m. With $f$ = 50 mm, how tall is the person in the image?',
    options: [
      {
        text: '18.5 mm',
        correct: true,
        why: 'Depth from the camera along its optical axis: $Z = 5 - 0.4 = 4.6$ m, so $h^{\\prime} = 0.050 \\times 1.7 / 4.6 = 0.0185$ m (2023 Q33(c)).',
      },
      {
        text: '17.0 mm',
        correct: false,
        why: 'Uses $Z = 5$ m, the distance from the base rather than from the camera.',
      },
      {
        text: '17.6 mm',
        correct: false,
        why: 'Uses the straight-line distance from the camera to the person’s feet (4.84 m). The pinhole model divides by depth along the optical axis.',
      },
      {
        text: '0.0185 mm',
        correct: false,
        why: 'The right number in metres, labelled as millimetres: 0.0185 m is 18.5 mm.',
      },
    ],
    source: 'Similar to 2023 Q33(c)',
    trapId: 'depth-from-camera',
    difficulty: 2,
  },
  {
    id: 'kin-q-foundations',
    style: 'correct',
    stem: 'About degrees of freedom and the spaces a robot works in:',
    options: [
      {
        text: 'A free rigid body in 3-D has 6 DOF, and a prismatic joint provides 1',
        correct: true,
        why: 'Three translations plus three rotations; a prismatic joint allows one sliding motion (2022 Q1).',
      },
      {
        text: 'A revolute joint provides 2 DOF: one rotation and one slide',
        correct: false,
        why: 'That is a cylindrical joint. A revolute joint provides 1 DOF (2022 Q1).',
      },
      {
        text: 'A rigid body moving in a plane has 4 DOF: two positions and two angles',
        correct: false,
        why: 'It has 3: $(x, y, \\theta)$ (2022 Q1).',
      },
      {
        text: 'The set of end-effector configurations a robot can reach is called its task space',
        correct: false,
        why: 'That is the workspace; the task space is the space in which the task is described (2022 Q23).',
      },
    ],
    source: 'Similar to 2022 Q1, Q23',
    difficulty: 1,
  },
];

export const games: Game[] = [
  {
    kind: 'sort',
    id: 'kin-g-fk-ik',
    title: 'Forward or inverse kinematics?',
    prompt: '**Forward**: joint values (or wheel inputs) in, pose out. **Inverse**: a desired pose (or motion) in, joint values (or inputs) out. Sort each problem (2023 Q11, 2024 Q12, 2025 Q12, review deck slide 19).',
    buckets: [
      { id: 'fk', label: 'Forward kinematics (inputs known, pose found)' },
      { id: 'ik', label: 'Inverse kinematics (pose wanted, inputs found)' },
    ],
    items: [
      { id: 'f1', text: 'Where a ground robot ends up after a sequence of velocity commands', bucket: 'fk', why: 'The commands are known; integrating them through the motion model gives the final pose (review deck slide 19).' },
      { id: 'f2', text: 'The pose of joint 3’s frame, given all six joint angles', bucket: 'fk', why: 'FK gives the pose of every link frame, not only the end-effector: stop the product after joint 3 (2023 Q11).' },
      { id: 'f3', text: 'A mobile robot’s final pose from its wheel velocities', bucket: 'fk', why: 'Known inputs, unknown pose: the key of 2025 Q12.' },
      { id: 'f4', text: 'Evaluating $e^{[\\mathcal{S}_1]\\theta_1} \\cdots e^{[\\mathcal{S}_n]\\theta_n} M$ at the measured joint angles', bucket: 'fk', why: 'The product of exponentials is forward kinematics by definition.' },
      { id: 'f5', text: 'Where the end-effector camera is, from the joint encoder readings', bucket: 'fk', why: 'Encoder readings are joint values, so the camera pose follows directly (at the zero configuration it is $p$ in $M$).' },
      { id: 'f6', text: 'Checking whether a configuration $(\\theta_1, \\theta_2)$ puts link 2 inside an obstacle', bucket: 'fk', why: 'Every C-space collision check runs FK on the configuration to place the links in the workspace.' },
      { id: 'i1', text: 'The arm configuration that lets a robot reach a door handle', bucket: 'ik', why: 'The gripper pose is specified and the joints are unknown (review deck slide 19).' },
      { id: 'i2', text: 'The joint angles that put a welding torch at a given pose', bucket: 'ik', why: 'Desired pose in, joint values out.' },
      { id: 'i3', text: 'The steering commands that make a mobile robot track a path', bucket: 'ik', why: 'The desired motion is given and the inputs are found: the inverse direction (a 2025 Q12 distractor).' },
      { id: 'i4', text: 'Iterating $\\theta \\leftarrow \\theta + J^{\\dagger}e$ until the tool reaches a target', bucket: 'ik', why: 'Newton–Raphson is a numerical IK method.' },
      { id: 'i5', text: 'Finding $\\theta_1, \\theta_2$ so a 2-link arm’s tip is at $(x, y)$, elbow up or elbow down', bucket: 'ik', why: 'The tip position is given; the law of cosines gives the two joint solutions.' },
      { id: 'i6', text: 'Choosing joint values so an end-effector camera sits 1.1 m up, aimed at a mast', bucket: 'ik', why: 'A desired camera pose is given and the joint values are unknown (the set-up of 2025 Q30(c)).' },
    ],
    source: 'Notes §6; 2023 Q11, 2024 Q12, 2025 Q12; review deck slide 19',
  },
  {
    kind: 'sort',
    id: 'kin-g-closed-numerical',
    title: 'Closed form or numerical IK?',
    prompt: 'Pieper’s criterion: a 6-DOF arm has a closed-form IK solution if three **consecutive** revolute axes intersect at one point or are parallel. Otherwise the default is numerical IK (Newton–Raphson). Sort each arm or task.',
    buckets: [
      { id: 'closed', label: 'Closed form (the geometry decouples)' },
      { id: 'num', label: 'Numerical (Newton–Raphson)' },
    ],
    items: [
      { id: 'c1', text: '6R arm whose last three axes meet at one point (a spherical wrist)', bucket: 'closed', why: 'Pieper’s first condition: the wrist centre depends on joints 1–3 only, so position and orientation decouple.' },
      { id: 'c2', text: 'R–R–P arm followed by a spherical wrist (the Stanford arm)', bucket: 'closed', why: 'The wrist axes intersect; a prismatic joint before the wrist does not matter (2023 Q12 (c)).' },
      { id: 'c3', text: '6R arm with joints 2, 3 and 4 parallel (a UR-style arm)', bucket: 'closed', why: 'Pieper’s second condition: three consecutive parallel axes act like a planar arm, solved with the law of cosines.' },
      { id: 'c4', text: 'Planar 2-link arm placing its tip at $(x, y)$', bucket: 'closed', why: 'Law of cosines for $\\theta_2$ (two signs: elbow up or down), then atan2 for $\\theta_1$.' },
      { id: 'n1', text: '6R arm whose last link is offset along joint 5’s axis, so axes 4, 5 and 6 never meet', bucket: 'num', why: 'The offset breaks the spherical wrist, and no other three consecutive axes are parallel or intersecting (2023 Q12 (a)).' },
      { id: 'n2', text: '6R arm in which joints 1, 3 and 5 are parallel but no three consecutive axes are', bucket: 'num', why: 'Pieper needs **consecutive** axes, so this arm does not qualify.' },
      { id: 'n3', text: '6R arm whose neighbouring axes are all perpendicular and offset, so no three meet', bucket: 'num', why: 'Neither condition holds anywhere along the chain.' },
      { id: 'n4', text: '7-DOF arm asked for a pose, with no extra condition to choose among its solutions', bucket: 'num', why: 'Pieper’s criterion is for 6-DOF arms. A redundant arm has infinitely many solutions; Newton–Raphson with the pseudoinverse converges to one near the initial guess.' },
    ],
    source: 'Notes §6; 2023 Q12; review deck slide 19',
  },
  {
    kind: 'match',
    id: 'kin-g-groups',
    title: 'Groups and objects: what does each represent?',
    prompt: 'The 2022 paper matched these terms to their meanings (Q8, Q9). Match each term to what it represents.',
    pairs: [
      { id: 'p1', left: 'SO(3)', right: '3 × 3 rotation matrices ($R^TR = I$, $\\det R = +1$)', why: 'The special orthogonal group: orientations.' },
      { id: 'p2', left: 'SE(3)', right: '4 × 4 homogeneous transforms: poses such as $M$ and $T(\\theta)$', why: 'The special Euclidean group: a rotation and a position together.' },
      { id: 'p3', left: 'so(3)', right: '3 × 3 skew-symmetric matrices $[\\omega]$', why: 'Angular velocities in matrix form, $[\\omega]x = \\omega \\times x$; their exponentials are rotations.' },
      { id: 'p4', left: 'se(3)', right: '4 × 4 matrix representations of twists, $[\\mathcal{V}]$', why: 'Rigid-body velocities in matrix form; $e^{[\\mathcal{S}]\\theta}$ lands in SE(3).' },
      { id: 'p5', left: 'Screw axis $\\mathcal{S}$', right: 'A normalised 6-vector $(\\omega, v)$ that describes a joint’s axis', why: 'Normalised: $\\|\\omega\\| = 1$, or $\\omega = 0$ and $\\|v\\| = 1$ for a prismatic joint.' },
      { id: 'p6', left: 'Twist $\\mathcal{V}$', right: 'A 6-vector of angular velocity and linear velocity', why: '$\\mathcal{V} = \\mathcal{S}\\dot\\theta$: the screw axis scaled by the joint rate.' },
      { id: 'p7', left: 'Rodrigues’ formula', right: 'The rotation matrix for a given axis and angle', why: '$e^{[\\hat\\omega]\\theta} = I + \\sin\\theta[\\hat\\omega] + (1 - \\cos\\theta)[\\hat\\omega]^2$.' },
      { id: 'p8', left: 'Product of exponentials', right: 'The end-effector pose from every joint’s screw motion', why: '$T(\\theta) = e^{[\\mathcal{S}_1]\\theta_1} \\cdots e^{[\\mathcal{S}_n]\\theta_n} M$.' },
    ],
    source: 'Similar to 2022 Q8, Q9',
  },
];

export const shortAnswers: ShortAnswer[] = [
  {
    id: 'kin-sa-classify',
    prompt: '**(2 marks)** In no more than 60 words: classify each as a forward or an inverse kinematics problem, and justify: (i) working out where a ground robot ends up after it executes a sequence of velocity commands; (ii) working out the arm configuration that lets a robot reach a door handle.',
    wordLimit: 60,
    model: '(i) **Forward**: the inputs (velocity commands) are known, and integrating them through the motion model gives the final pose. (ii) **Inverse**: the desired end-effector pose (the gripper on the handle) is known and the joint values that achieve it are unknown; there may be several solutions, or none if the handle is out of reach.',
    keyPoints: [
      '(i) forward kinematics',
      'justified: known inputs → resulting pose',
      '(ii) inverse kinematics',
      'justified: desired pose → unknown joint values (several or no solutions possible)',
    ],
    source: 'Review deck slide 19',
    marks: 2,
  },
  {
    id: 'kin-sa-pieper',
    prompt: '**(3 marks)** In no more than 100 words: for a 6-DOF robot arm, what conditions permit a closed-form inverse kinematics solution, and why do they make one possible?',
    wordLimit: 100,
    model: 'Pieper’s criterion: three **consecutive** revolute joint axes either **intersect at one point** (a spherical wrist) or are **parallel**. Either condition decouples the problem. With a spherical wrist, the wrist joints rotate the tool about a fixed point, so the wrist centre’s position depends only on joints 1–3: find it by stepping back from the desired pose along the approach axis, solve joints 1–3 geometrically, then solve joints 4–6 for the remaining orientation. Three parallel axes behave like a planar arm, solved with the law of cosines.',
    keyPoints: [
      'three consecutive revolute axes intersect at one point (spherical wrist)',
      'OR three consecutive revolute axes are parallel',
      'position and orientation decouple: the wrist centre depends only on joints 1–3',
      'solve joints 1–3 for position (geometry), then joints 4–6 for orientation',
    ],
    source: 'Review deck slide 19; notes §6; 2023 Q12',
    marks: 3,
  },
  {
    id: 'kin-sa-m',
    prompt: '**(4 marks)** A PRR camera boom is drawn in its zero configuration with $\\hat x_s$ out of the page, $\\hat y_s$ to the right and $\\hat z_s$ up. From {s} the arm rises $L_1$ (joint 1, prismatic), runs $L_2$ to the right to joint 2, then $L_3$ into the page to the end-effector frame {b}. At {b}, $\\hat x_b$ points up, $\\hat y_b$ to the right and $\\hat z_b$ into the page. Compute the initial configuration $M$ of {b} in {s}, showing how you read each axis.',
    wordLimit: 100,
    model: 'Into the page is $-\\hat x_s$. The columns of $R$ are {b}’s axes in {s}: $\\hat x_b = (0, 0, 1)$, $\\hat y_b = (0, 1, 0)$, $\\hat z_b = (-1, 0, 0)$. The origin is $p = L_1\\hat z_s + L_2\\hat y_s - L_3\\hat x_s = (-L_3, L_2, L_1)$, so\n\n$$M = \\begin{bmatrix} 0 & 0 & -1 & -L_3 \\\\ 0 & 1 & 0 & L_2 \\\\ 1 & 0 & 0 & L_1 \\\\ 0 & 0 & 0 & 1 \\end{bmatrix}$$\n\nCheck: $\\hat x_b \\times \\hat y_b = (0, 0, 1) \\times (0, 1, 0) = (-1, 0, 0) = \\hat z_b$, so $\\det R = +1$.',
    keyPoints: [
      '“into the page” read as $-\\hat x_s$',
      'columns of $R$: $\\hat x_b = (0, 0, 1)$, $\\hat y_b = (0, 1, 0)$, $\\hat z_b = (-1, 0, 0)$',
      '$p = (-L_3, L_2, L_1)$',
      'right-handed check ($\\hat x_b \\times \\hat y_b = \\hat z_b$, $\\det R = +1$) and bottom row $(0, 0, 0, 1)$',
    ],
    source: 'Similar to 2024 Q30(a)',
    marks: 4,
  },
  {
    id: 'kin-sa-screws',
    prompt: '**(5 marks)** A rover’s 5-DOF RRRRR arm is drawn in its zero configuration with $\\hat x_s$ to the right, $\\hat y_s$ into the page and $\\hat z_s$ up. Joint 1 turns about $\\hat z_s$ at the origin. Joint 2 sits $L_1$ above the origin and turns about $\\hat y_s$. The arm then runs along $+\\hat x_s$: $L_2$ to joint 3 and a further $L_3$ to joint 4 (both about $\\hat y_s$), then $L_4$ to the tip, where joint 5 turns about $\\hat x_s$, the arm’s own axis. Taking every rotation as positive about the named axis, fill in $\\omega_i$, $q_i$ and $v_i$ for the screw axes in {s}, showing your working.',
    wordLimit: 150,
    model: 'Use $v_i = -\\omega_i \\times q_i$; for $\\omega = \\hat y$ this is $(-q_z, 0, q_x)$ and for $\\omega = \\hat x$ it is $(0, q_z, -q_y)$.\n\n$$\\begin{array}{c|c|c|c} i & \\omega_i & q_i & v_i \\\\ \\hline 1 & (0, 0, 1) & (0, 0, 0) & (0, 0, 0) \\\\ 2 & (0, 1, 0) & (0, 0, L_1) & (-L_1, 0, 0) \\\\ 3 & (0, 1, 0) & (L_2, 0, L_1) & (-L_1, 0, L_2) \\\\ 4 & (0, 1, 0) & (L_2 + L_3, 0, L_1) & (-L_1, 0, L_2 + L_3) \\\\ 5 & (1, 0, 0) & (0, 0, L_1) & (0, L_1, 0) \\end{array}$$\n\nJoint 5 written out: $-(1, 0, 0) \\times (0, 0, L_1) = -(0, -L_1, 0) = (0, L_1, 0)$. Any point on its axis works: $(L_2 + L_3 + L_4, 0, L_1)$ gives the same $v_5$. (If an arrow is read the other way, negate that row’s $\\omega$ and $v$ together.)',
    keyPoints: [
      '$v_i = -\\omega_i \\times q_i$ stated, with a cross product written out',
      'joint 1: $\\omega = (0, 0, 1)$, $v = 0$ (axis through the origin)',
      'joints 2–4: $\\omega = (0, 1, 0)$ with $v = (-L_1, 0, 0)$, $(-L_1, 0, L_2)$, $(-L_1, 0, L_2 + L_3)$',
      'joint 5: $\\omega = (1, 0, 0)$, $v = (0, L_1, 0)$',
      'a valid point $q_i$ on every axis',
    ],
    source: 'Similar to 2025 Q30(b)',
    marks: 5,
  },
  {
    id: 'kin-sa-body',
    prompt: '**(3 marks)** In no more than 100 words: how do screw axes defined in the body frame {b} differ from those defined in {s}, and how do you compute them? Illustrate with a revolute joint whose axis is parallel to $\\hat y_b$ and passes $L_6$ from the {b} origin along $\\hat z_b$.',
    wordLimit: 100,
    model: 'They describe the same physical joint axes at the zero configuration, but written in {b}: $\\omega$ in {b}’s axes and $q$ measured from the **{b} origin**, $q_b = R^T(q_s - p)$, then $v_b = -\\omega_b \\times q_b$. Equivalently $\\mathcal{B}_i = [\\mathrm{Ad}_{M^{-1}}]\\mathcal{S}_i$, used in $T(\\theta) = M e^{[\\mathcal{B}_1]\\theta_1} \\cdots e^{[\\mathcal{B}_n]\\theta_n}$. Example: $\\omega = (0, 1, 0)$ and $q = (0, 0, L_6)$ give $v = (-q_z, 0, q_x) = (-L_6, 0, 0)$.',
    keyPoints: [
      'same joint axes, expressed in {b} coordinates at the zero configuration',
      '$q$ measured from the {b} origin ($q_b = R^T(q_s - p)$) and $\\omega_b = R^T\\omega_s$',
      '$v_b = -\\omega_b \\times q_b$, or $\\mathcal{B}_i = [\\mathrm{Ad}_{M^{-1}}]\\mathcal{S}_i$',
      'example: $v = (-L_6, 0, 0)$',
    ],
    source: 'Review deck slide 20 (joint 6)',
    marks: 3,
  },
  {
    id: 'kin-sa-camera',
    prompt: '**(3 marks)** An RPRR arm in its zero configuration has $M$ with $p = (-L_2, L_3, L_1)$ and $\\hat z_b = +\\hat y_s$, where $L_1 = 1.5$ m, $L_2 = 0.2$ m and $L_3 = 0.4$ m. A camera at the end-effector frame (focal length 50 mm) observes a 1.7 m tall person standing at $(-0.2, 5, 0)$ in {s}. Assuming the person is in focus and entirely in the image, how tall are they in the image plane? List any additional assumptions you make.',
    wordLimit: 90,
    model: 'The camera is at $p = (-0.2, 0.4, 1.5)$ m and looks along $\\hat z_b = +\\hat y_s$. The person has the same $x$, so they are straight ahead at depth $Z = 5 - 0.4 = 4.6$ m, measured from the camera, not the base.\n\n$$h^{\\prime} = \\frac{fh}{Z} = \\frac{0.050 \\times 1.7}{4.6} = 0.0185\\ \\text{m} \\approx \\textbf{18.5 mm}$$\n\nAssumptions: ideal pinhole camera with no lens distortion; optical axis along $\\hat z_b$; the person stands upright in a plane perpendicular to the optical axis, so their whole body is at depth 4.6 m.',
    keyPoints: [
      'camera position from $p$: $(-0.2, 0.4, 1.5)$ m, looking along $+\\hat y_s$',
      'depth from the camera: $Z = 5 - 0.4 = 4.6$ m',
      '$h^{\\prime} = fh/Z = 0.050 \\times 1.7 / 4.6 \\approx 18.5$ mm',
      'assumptions: ideal pinhole, no distortion, person perpendicular to the optical axis at one depth',
    ],
    source: 'Similar to 2023 Q33(c)',
    marks: 3,
  },
  {
    id: 'kin-sa-wheel',
    prompt: '**(3 + 2 marks)** A PRR camera boom is in its zero configuration with $L_1 = 1.5$ m, $L_2 = 0.1$ m and $L_3 = 1.5$ m. Its end-effector camera sits at $p = (-L_3, L_2, L_1)$ and looks along $\\hat z_b = -\\hat x_s$, away from the base. (c) The camera ($f$ = 50 mm) sees the 60 m tall Wheel of Brisbane at a height of 38 mm in the image. How far is the base of the arm from the Wheel? List your assumptions. (d) If the camera moves 20 m closer to the Wheel, how tall does the Wheel appear?',
    wordLimit: 110,
    model: '(c) Pinhole: $Z = fh/h^{\\prime} = 0.050 \\times 60 / 0.038 = 78.95$ m from the camera. The camera is $L_3 = 1.5$ m further along the line of sight than the base, so the base is about $78.95 + 1.5 \\approx$ **80.4 m** from the Wheel. Assumptions: ideal pinhole; the Wheel centred on and perpendicular to the optical axis; the 0.1 m sideways and height offsets negligible at 80 m.\n\n(d) $Z^{\\prime} = 78.95 - 20 = 58.95$ m, so $h^{\\prime\\prime} = 0.050 \\times 60 / 58.95 = 0.0509$ m ≈ **50.9 mm** (check: $38 \\times 78.95 / 58.95 = 50.9$).',
    keyPoints: [
      '$Z = fh/h^{\\prime} = 0.050 \\times 60 / 0.038 = 78.95$ m, from the camera',
      'base distance ≈ 78.95 + 1.5 = 80.4 m (the camera looks away from the base)',
      'assumptions: ideal pinhole, Wheel centred on and perpendicular to the optical axis',
      '(d) $Z^{\\prime} = 58.95$ m, so $h^{\\prime\\prime} \\approx 50.9$ mm',
    ],
    source: 'Similar to 2024 Q30(c)–(d)',
    marks: 5,
  },
  {
    id: 'kin-sa-mast',
    prompt: '**(3 marks)** A rover’s RRRRR arm has joint 2 (its shoulder pitch) $L_1 = 0.1$ m directly above the arm’s static frame {s}; beyond it, links of $L_2 = 0.9$ m, $L_3 = 1.0$ m and $L_4 = 0.2$ m lead to the camera at {b}. The mast head sits 1.1 m directly above {s}. A selfie is taken with the arm fully extended and the camera at the height of the mast head. What is the lateral (horizontal) distance from the camera to the mast head?',
    wordLimit: 80,
    model: '“Fully extended” means joints 3 and 4 are straight, so $L_2 + L_3 + L_4 = 2.1$ m form one straight segment pivoting at joint 2, which is already 0.1 m up. To reach 1.1 m the segment rises $1.1 - 0.1 = 1.0$ m, so by Pythagoras\n\n$$d = \\sqrt{2.1^2 - 1.0^2} = \\sqrt{3.41} \\approx \\textbf{1.85 m}$$\n\nThe mast head is directly above {s}, and so above joint 2, at the camera’s height: this horizontal offset is the camera-to-mast-head distance.',
    keyPoints: [
      'fully extended ⇒ one straight 2.1 m segment pivoting at joint 2',
      'rise = 1.1 − 0.1 = 1.0 m (joint 2 is already at $L_1$)',
      '$d = \\sqrt{2.1^2 - 1.0^2} \\approx 1.85$ m',
      'mast head above joint 2 at the same height, so $d$ is the camera-to-mast-head distance',
    ],
    source: 'Similar to 2025 Q30(c)',
    marks: 3,
  },
  {
    id: 'kin-sa-focal',
    prompt: '**(3 marks)** The rover’s arm camera has an adjustable focal length. The mast head is truly 163 mm tall and appears 7.06 mm tall in the image, taken from the 1.85 m lateral distance found in the previous part. Compute the focal length used, and list any assumptions you make.',
    wordLimit: 70,
    model: 'Pinhole: $h^{\\prime} = fh/Z$, so\n\n$$f = \\frac{h^{\\prime} Z}{h} = \\frac{0.00706 \\times 1.847}{0.163} = 0.0800\\ \\text{m} = \\textbf{80 mm}$$\n\nAssumptions: ideal pinhole with no distortion, image in focus; the camera points straight at the mast head, whose face is perpendicular to the optical axis at depth $Z = 1.85$ m (the depth of the box itself ignored).',
    keyPoints: [
      'rearranged pinhole: $f = h^{\\prime}Z/h$',
      'lengths in metres: $0.00706 \\times 1.847 / 0.163$',
      '$f \\approx 80$ mm',
      'assumptions: ideal pinhole, camera aimed at the mast head, face perpendicular to the optical axis',
    ],
    source: 'Similar to 2025 Q30(d)',
    marks: 3,
  },
  {
    id: 'kin-sa-newton',
    prompt: '**(4 marks)** In no more than 130 words: describe how the inverse kinematics of a robot arm is solved with the Newton–Raphson method, and state two of its limitations.',
    wordLimit: 130,
    model: 'Newton–Raphson solves $f(\\theta) = x_d$ (or $T_{sb}(\\theta) = T_{sd}$) iteratively:\n\n1. Choose an initial guess $\\theta^0$, e.g. the current configuration.\n2. Compute the forward kinematics $f(\\theta^k)$ and the error $e = x_d - f(\\theta^k)$ (for a full pose, the twist $\\mathcal{V}_b$ from $\\log(T_{sb}^{-1}(\\theta^k)T_{sd})$).\n3. Update $\\theta^{k+1} = \\theta^k + J^{\\dagger}(\\theta^k)\\,e$, where $J^{\\dagger}$ is the (pseudo)inverse of the Jacobian at $\\theta^k$.\n4. Repeat until $\\|e\\|$ is below a tolerance.\n\nLimitations: it converges only from a good initial guess and may diverge or oscillate; it returns one solution, which depends on the guess; near singularities $J^{\\dagger}$ blows up and the steps become erratic; it cannot succeed if the target is outside the workspace.',
    keyPoints: [
      'an initial guess $\\theta^0$',
      'the error from forward kinematics at the current guess ($e = x_d - f(\\theta)$ or $\\mathcal{V}_b$)',
      'update $\\theta \\leftarrow \\theta + J^{\\dagger}e$ with the Jacobian (pseudo)inverse, repeated until the error is small',
      'limitations: needs a good guess or may not converge; finds one solution; struggles near singularities',
    ],
    source: 'Review deck slide 18 (learning outcome); notes §6; 2022 Q12',
    marks: 4,
  },
];
