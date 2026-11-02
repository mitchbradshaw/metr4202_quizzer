// Concept cards and flashcards for 'kin' (summary notes §6; 2023 Q11, Q12, Q33; 2024 Q12, Q30; 2025 Q12, Q30;
// the 2022 kinematics questions; review deck slides 18–20). Card ids are fixed: sims, generators and Home link to them.
import type { ConceptCard, Flashcard } from '../../engine/types';

export const cards: ConceptCard[] = [
  // ------------------------------------------------------------------ forward vs inverse
  {
    id: 'kin-fk-ik',
    title: 'Forward vs inverse kinematics',
    lecture: 'Notes §6; review deck slides 18–19',
    formulas: [
      '$$\\text{FK: } \\theta \\in \\mathbb{R}^n \\;\\longmapsto\\; T_{sb}(\\theta) \\in SE(3) \\qquad\\qquad \\text{IK: given } T_{sd}, \\text{ find } \\theta \\text{ with } T_{sb}(\\theta) = T_{sd}$$',
      '$$\\begin{aligned} \\text{planar 2R, FK:}\\quad & x = L_1\\cos\\theta_1 + L_2\\cos(\\theta_1 + \\theta_2), \\qquad y = L_1\\sin\\theta_1 + L_2\\sin(\\theta_1 + \\theta_2) \\\\ \\text{IK:}\\quad & \\cos\\theta_2 = \\frac{x^2 + y^2 - L_1^2 - L_2^2}{2L_1L_2}, \\qquad \\theta_1 = \\operatorname{atan2}(y, x) - \\operatorname{atan2}(L_2\\sin\\theta_2,\\ L_1 + L_2\\cos\\theta_2) \\end{aligned}$$',
      '$$\\begin{array}{l|l} \\text{target pose} & \\text{number of IK solutions} \\\\ \\hline \\text{outside the workspace} & \\text{none} \\\\ \\text{inside, non-redundant arm } (n = \\text{task DOF}) & \\text{finitely many (elbow up / down, wrist flip)} \\\\ \\text{inside, redundant arm } (n > \\text{task DOF}) & \\text{infinitely many (self-motion)} \\end{array}$$',
    ],
    what: '**Forward kinematics** (FK) runs from the joints to the tool: given every joint value $\\theta$ (angles for revolute joints, extensions for prismatic ones), find the pose $T_{sb}(\\theta)$ of the end-effector frame {b}, or of any other link frame, in the fixed frame {s}. It always has exactly one answer, found by direct substitution (the product of exponentials). **Inverse kinematics** (IK) runs the other way: given a desired pose $T_{sd}$, find joint values that achieve it. That is a set of nonlinear equations with no solution, a few, or infinitely many, so it is solved in closed form when the geometry allows (Pieper) and numerically otherwise (Newton–Raphson).\n\nThe same split applies to a mobile robot: integrating known wheel speeds or velocity commands to get the final pose is the forward problem; choosing the commands that reach a pose or track a path is the inverse one.',
    when: '- “Which of the following does NOT describe a forward kinematics problem?” (2023 Q11).\n- “Which of the following describes an inverse kinematics problem?” (2024 Q12) and “… a forward kinematics problem?” (2025 Q12): the same four options rotate between key and distractor.\n- “Classify as forward or inverse: where a ground robot ends up after a sequence of velocity commands; the arm configuration that lets a robot reach a door handle” (review deck slide 19).\n- “A redundant arm has ___ IK solutions” and “is there always one?” (2022 Q4, Q18).',
    how: [
      'Ask what is **given** and what is **unknown**. Joint values, wheel speeds or velocity commands given, pose unknown: forward. Desired pose or path given, joint values or commands unknown: inverse.',
      'Remember that FK covers every frame on the arm: “the pose of any joint given its joint angles” is still forward kinematics, not only the end-effector.',
      'Rule out the impostors: forces and torques at the end-effector belong to statics or dynamics, not kinematics; steering commands that make a robot track a path are an inverse (control) problem.',
      'Before solving an IK problem, count its solutions: a target outside the workspace has none; a non-redundant arm has finitely many (elbow up or down); a redundant arm has infinitely many.',
      'Pick the method: closed form when Pieper’s criterion holds (or the arm is a simple planar chain), otherwise Newton–Raphson from a good initial guess.',
    ],
    traps: [
      {
        title: 'Missing the NOT',
        detail: '2023 asked which option does NOT describe FK, 2024 which describes IK, 2025 which describes FK, with almost the same four options. Underline the instruction before you read the options.',
        trapId: 'read-the-stem',
        source: '2023 Q11, 2024 Q12, 2025 Q12',
      },
      {
        title: '“The pose of any joint” is not forward kinematics',
        detail: 'It is. FK maps joint values to the pose of any frame fixed to a link; the end-effector is just the last one. In 2023 Q11 the odd one out was “joint angles from a desired end-effector pose”.',
        source: '2023 Q11',
      },
      {
        title: 'Thinking a mobile robot has no forward kinematics',
        detail: 'Wheel velocities in, final pose out is exactly the forward direction (the key of 2025 Q12). Choosing the steering commands that track a path is the inverse direction.',
        source: '2025 Q12; review deck slide 19',
      },
      {
        title: 'Calling forces kinematics',
        detail: 'Forces and torques at the end-effector involve statics or dynamics, not FK or IK (a 2025 Q12 distractor).',
        source: '2025 Q12',
      },
      {
        title: '“A redundant arm can always solve IK”',
        detail: 'Spare joints give infinitely many solutions **inside** the workspace; a pose out of reach, or an orientation the wrist cannot produce, still has none.',
        source: '2022 Q4, Q18',
      },
    ],
    more: 'Why IK is the hard direction: FK composes rotations and translations, so it is a direct formula. Inverting it means solving trigonometric equations in which the joint angles sit inside sines and cosines, coupled across joints. The planar 2-link arm in the formula box shows all three cases: if $|\\cos\\theta_2| > 1$ the point is out of reach (no solution); otherwise $\\theta_2 = \\pm\\arccos(\\cdot)$ gives elbow down and elbow up (two solutions), which merge into one when the arm is fully stretched ($\\theta_2 = 0$) on the edge of the workspace, a singular configuration.\n\nA general 6R arm can have up to 16 solutions; a typical industrial arm with a spherical wrist has up to 8 (shoulder left or right × elbow up or down × wrist flipped or not). A 7-DOF arm has a one-parameter family for every reachable pose: it can swing its elbow while the tool stays still (self-motion), which is why the redundant answer is “infinitely many” (2022 Q18).\n\nVocabulary (2022 Q23): the **workspace** is the set of end-effector configurations the robot can reach; the **task space** is the space in which the task is described; the **configuration space** is the set of all joint configurations.',
    exploreIds: ['ik', 'viewer'],
    solveIds: ['kin-fk-or-ik', 'kin-ik-solutions'],
  },

  // ------------------------------------------------------------------ M
  {
    id: 'kin-m',
    title: 'Reading the frames and writing M',
    lecture: 'Notes §6 (steps 1–2); 2023 Q33(a), 2024 Q30(a), 2025 Q30(a)',
    formulas: [
      '$$M = T_{sb}(0) = \\begin{bmatrix} R & p \\\\ 0 & 1 \\end{bmatrix} = \\begin{bmatrix} \\hat x_b & \\hat y_b & \\hat z_b & p \\\\ 0 & 0 & 0 & 1 \\end{bmatrix} \\qquad \\text{(every column written in } \\{s\\} \\text{ coordinates)}$$',
      '$$\\text{checks:} \\qquad R^TR = I, \\qquad \\det R = +1, \\qquad \\hat x_b \\times \\hat y_b = \\hat z_b$$',
      '$$\\text{2023 Q33: } \\hat x_b = -\\hat z_s,\\ \\ \\hat y_b = -\\hat x_s,\\ \\ \\hat z_b = +\\hat y_s,\\ \\ p = (-L_2, L_3, L_1) \\;\\Rightarrow\\; M = \\begin{bmatrix} 0 & -1 & 0 & -L_2 \\\\ 0 & 0 & 1 & L_3 \\\\ -1 & 0 & 0 & L_1 \\\\ 0 & 0 & 0 & 1 \\end{bmatrix}$$',
    ],
    what: '$M$ is the pose of the end-effector frame {b} in the fixed frame {s} when every joint is at zero, which is the configuration the paper draws. Its rotation block $R$ says which way {b}’s axes point and its last column $p$ says where {b}’s origin is, both in {s} coordinates. It is the starting point of the product of exponentials ($T(0) = M$), and in the arm question it also tells you where the camera is ($p$) and which way it looks ($\\hat z_b$).',
    when: '- “Compute the initial configuration $M$ of the body frame in the static frame” (4 marks in 2023 Q33(a), 2024 Q30(a) and 2025 Q30(a)).\n- “What is the orientation of the end-effector {b} relative to the fixed frame {s}?” (2022 Q3).\n- Any later part that needs the camera’s position or viewing direction.',
    how: [
      'Decode {s} first: write down in words where $\\hat x_s$, $\\hat y_s$ and $\\hat z_s$ point. The axis drawn **diagonally** (down-left or up-right) points **out of or into the page**; confirm with the right-hand rule, $\\hat x_s \\times \\hat y_s = \\hat z_s$.',
      'Find $p$ by walking along the arm from the {s} origin to the {b} origin, adding each link as its length times a signed unit axis: up the column ($+L_1\\hat z_s$), across ($\\pm L_2\\hat y_s$), and a link drawn parallel to the diagonal arrow runs into or out of the page.',
      'Write $R$ **column by column**: column 1 is $\\hat x_b$ in {s} coordinates (“$\\hat x_b$ points down” gives $(0, 0, -1)$), column 2 is $\\hat y_b$, column 3 is $\\hat z_b$.',
      'Check $R$: for these axis-aligned arms each column has a single $\\pm 1$ and no two columns share a row; and $\\hat x_b \\times \\hat y_b = \\hat z_b$, so $\\det R = +1$. A failed check almost always means the diagonal axis was misread.',
      'Assemble $M$ with the bottom row $(0, 0, 0, 1)$. Keep the symbols $L_1, L_2, \\dots$ unless numbers are given, and show your axis-by-axis reading: it earns marks even if one sign slips.',
    ],
    traps: [
      {
        title: 'Reading a diagonal arrow as an in-plane direction',
        detail: 'In 2023 Q33 and 2024 Q30, $\\hat x_s$ is drawn down-left: it points **out of** the page. A link drawn up-right therefore runs **into** the page, along $-\\hat x_s$, which is why $p$ starts with $-L_2$ (2023) and $-L_3$ (2024). In 2025 Q30 it is $\\hat y_s$ that is drawn up-right, pointing into the page.',
        trapId: 'diagonal-axis',
        source: '2023 Q33, 2024 Q30, 2025 Q30',
      },
      {
        title: 'Rows instead of columns',
        detail: 'Writing {b}’s axes as rows gives $R^T = R_{bs}$, the orientation of {s} in {b}. The columns of $R_{sb}$ are {b}’s axes expressed in {s}; in 2022 Q3 the transpose was one of the options.',
        source: '2022 Q3',
      },
      {
        title: '“det R = 1, so it is a rotation”',
        detail: 'Necessary, not sufficient: $\\mathrm{diag}(2, \\tfrac12, 1)$ has determinant 1 and is not a rotation. A rotation also needs orthonormal columns, $R^TR = I$.',
        source: '2022 Q7',
      },
      {
        title: 'A left-handed {b}',
        detail: 'If $\\hat x_b \\times \\hat y_b = -\\hat z_b$ then $\\det R = -1$: one axis has been read backwards. Fix it before the screw axes and the camera part, because the camera’s viewing direction $\\hat z_b$ comes from this matrix.',
        source: 'Notes §6 step 2',
      },
    ],
    more: 'Why the columns: $R$ turns {b}-coordinates into {s}-coordinates, $x_s = R\\,x_b$. Feed in $x_b = (1, 0, 0)$, the unit vector along $\\hat x_b$, and you get the first column of $R$, so that column must be $\\hat x_b$ written in {s}.\n\nThe three exam matrices (the camera looks along the third column, $\\hat z_b$):\n\n$$\\begin{array}{c|c|c} \\text{2023 Q33 (RPRR)} & \\text{2024 Q30 (PRR)} & \\text{2025 Q30 (RRRRR)} \\\\ \\hline \\begin{bmatrix} 0 & -1 & 0 & -L_2 \\\\ 0 & 0 & 1 & L_3 \\\\ -1 & 0 & 0 & L_1 \\\\ 0 & 0 & 0 & 1 \\end{bmatrix} & \\begin{bmatrix} 0 & 0 & -1 & -L_3 \\\\ 0 & 1 & 0 & L_2 \\\\ 1 & 0 & 0 & L_1 \\\\ 0 & 0 & 0 & 1 \\end{bmatrix} & \\begin{bmatrix} 0 & 0 & 1 & L_2 + L_3 + L_4 \\\\ 1 & 0 & 0 & 0 \\\\ 0 & 1 & 0 & L_1 \\\\ 0 & 0 & 0 & 1 \\end{bmatrix} \\\\ \\hat z_b = +\\hat y_s & \\hat z_b = -\\hat x_s & \\hat z_b = +\\hat x_s \\end{array}$$\n\nThe review deck’s 6-DOF arm has {b} parallel to {0}, so $R = I$ and $M$ only carries the offset $p = (L_1, L_3 + L_4, -L_5 - L_6)$.\n\nOther frame conventions in the 2022 paper: Denavit–Hartenberg fixes the intermediate link frames by rules ($\\hat x_i$ along the common normal of $\\hat z_{i-1}$ and $\\hat z_i$), which is why it needs only 4 numbers per link, while the base and end-effector frames remain free choices (2022 Q5, Q6). The product of exponentials needs no intermediate frames at all: only {s}, {b} and the joint axes.',
    exploreIds: ['build-m', 'viewer'],
    solveIds: ['kin-m', 'kin-arm-camera'],
  },

  // ------------------------------------------------------------------ screw axes
  {
    id: 'kin-screws',
    title: 'Screw axes: revolute and prismatic joints',
    lecture: 'Notes §6 (steps 3–5); 2023 Q33(b), 2024 Q30(b), 2025 Q30(b); 2022 Q11, Q33, Q35',
    formulas: [
      '$$\\mathcal{S} = \\begin{bmatrix} \\omega \\\\ v \\end{bmatrix} \\in \\mathbb{R}^6: \\qquad \\text{revolute: } \\|\\omega\\| = 1,\\ \\ v = -\\omega \\times q = q \\times \\omega \\qquad\\quad \\text{prismatic: } \\omega = 0,\\ \\ \\|v\\| = 1$$',
      '$$\\begin{array}{c|c} \\omega & v = -\\omega \\times q, \\ \\ q = (q_x, q_y, q_z) \\\\ \\hline (1, 0, 0) & (0,\\ \\ q_z,\\ -q_y) \\\\ (0, 1, 0) & (-q_z,\\ \\ 0,\\ \\ q_x) \\\\ (0, 0, 1) & (q_y,\\ -q_x,\\ \\ 0) \\end{array}$$',
      '$$\\omega \\to -\\omega \\;\\Rightarrow\\; v \\to -v, \\qquad q \\to q + t\\,\\omega \\;\\Rightarrow\\; v \\text{ unchanged}, \\qquad \\omega \\cdot v = 0 \\ \\text{(revolute)}$$',
    ],
    what: 'A screw axis $\\mathcal{S} = (\\omega, v)$ describes the motion one joint produces when it turns or slides at unit rate, written in a chosen frame ({s} for the space form). For a **revolute** joint, $\\omega$ is the unit vector along the joint axis, its sign set by the right-hand rule and the drawn rotation arrow, and $v = -\\omega \\times q$ for any point $q$ on the axis. For a **prismatic** joint nothing rotates, so $\\omega = 0$ and $v$ is the unit direction of travel.\n\nWhat $v$ means: imagine the moving link extended rigidly out to the frame origin. When the joint turns at 1 rad/s, $v$ is the velocity of that imaginary point at the origin, $v = \\omega \\times (0 - q)$. That is why it depends on where the axis is, but not on which point of the axis you pick.',
    when: '- “With the screw axes defined in frame {s}, fill in the values for Table 1” (8 marks in 2023 Q33(b), 6 in 2024 Q30(b), 5 in 2025 Q30(b); the table has columns $i$, $\\omega_i$, $q_i$, $v_i$).\n- Picking the screw-axis table of a SCARA arm (2022 Q33), or the screw axis of one tilted joint (2022 Q35).\n- “For a screw that is a pure translation, the pitch is …” (2022 Q11).',
    how: [
      'Classify each joint from the drawing: a cylinder with a curved arrow is revolute (R), a box with a straight arrow is prismatic (P). The arm’s name lists them in order (RPRR, PRR, RRRRR).',
      'Revolute: write $\\omega_i$ as the unit vector along the axis, in {s}. For its sign, curl the fingers of your right hand along the drawn rotation arrow: your thumb is $+\\omega_i$. A tilted axis must be normalised, e.g. $\\tfrac{1}{\\sqrt2}(-1, 0, 1)$.',
      'Choose $q_i$: any point on the axis, in {s} coordinates. Its component along $\\omega_i$ never matters, so set that component to zero: for 2023 Q33 joint 4 ($\\omega = \\hat y_s$), $(-L_2, L_3, L_1)$ and $(-L_2, 0, L_1)$ give the same $v$. A corner you already located while finding $p$ works too.',
      'Compute $v_i = -\\omega_i \\times q_i$ with the shortcut table, and write the cross product out: the working is where the marks are.',
      'Prismatic: $\\omega_i = (0, 0, 0)$ and $v_i$ is the unit direction of its arrow; write “—” for $q_i$, because its position does not matter.',
      'Check every row: a revolute joint has $\\|\\omega\\| = 1$ and $\\omega \\cdot v = 0$; an axis through the origin has $v = 0$; parallel axes share $\\omega$, and their $v$ differ only through $q$.',
    ],
    traps: [
      {
        title: 'Dropping the minus sign',
        detail: '$v = -\\omega \\times q$, equivalently $q \\times \\omega$. Writing $\\omega \\times q$ negates every revolute $v$ in the table. Check: 2023 Q33 joint 3 has $\\omega = (1, 0, 0)$ and $q = (0, 0, L_1)$, so $v = (0, L_1, 0)$, not $(0, -L_1, 0)$.',
        trapId: 'v-cross-sign',
        source: 'Notes §6; 2023 Q33(b)',
      },
      {
        title: 'Reading the rotation arrow backwards',
        detail: 'This negates $\\omega$, and $v$ flips with it, so the row stays self-consistent: the joint simply turns the other way for positive $\\theta$. Show the working so the marker can follow your convention; the worked solutions accept the flipped pair.',
        source: '2023 Q33(b), 2024 Q30(b), 2025 Q30(b) solutions',
      },
      {
        title: 'Treating a prismatic joint like a revolute one',
        detail: 'Its $\\omega$ is zero, so $-\\omega \\times q$ would give $v = 0$, a joint that does nothing. Its $v$ is the unit direction of travel, wherever the joint sits.',
        source: '2023 Q33 joint 2; 2024 Q30 joint 1',
      },
      {
        title: 'An un-normalised tilted axis',
        detail: 'An axis at 45° in the $x$–$z$ plane is $\\omega = \\tfrac{1}{\\sqrt2}(-1, 0, 1)$, not $(-1, 0, 1)$; otherwise $\\theta$ no longer measures the joint angle. In 2022 Q35 (an axis in {b}) the key was $\\omega_5 = \\tfrac{1}{\\sqrt2}(-1, 0, 1)$ with $v_5 = (0, \\sqrt2, 0)$; the un-normalised axis gives $v = (0, 2, 0)$.',
        source: '2022 Q35',
      },
      {
        title: 'Using a point that is not on the axis',
        detail: 'A frame origin or a link corner is only a valid $q$ if the axis passes through it. In 2025 Q30, joint 5 runs along $\\hat x_s$ at height $L_1$, so $(0, 0, L_1)$ and $(L_2 + L_3 + L_4, 0, L_1)$ both work; $(0, 0, 0)$ does not.',
        source: '2025 Q30(b)',
      },
    ],
    more: 'General screw: $v = -\\omega \\times q + h\\,\\omega$ with pitch $h$ (translation per radian of rotation). A revolute joint has $h = 0$; a pure translation has $\\omega = 0$, the limit $h \\to \\infty$ (2022 Q11). A screw axis is normalised ($\\|\\omega\\| = 1$, or $\\omega = 0$ and $\\|v\\| = 1$); multiplied by the joint rate it gives the joint’s twist $\\mathcal{V} = \\mathcal{S}\\dot\\theta$, the angular and linear velocity it produces.\n\nThe three exam tables in {s}, each cell $\\omega_i;\\ v_i$:\n\n$$\\begin{array}{c|c|c|c} i & \\text{2023 Q33 (RPRR)} & \\text{2024 Q30 (PRR)} & \\text{2025 Q30 (RRRRR)} \\\\ \\hline 1 & (0,0,1);\\ (0,0,0) & (0,0,0);\\ (0,0,1) & (0,0,1);\\ (0,0,0) \\\\ 2 & (0,0,0);\\ (0,0,1) & (0,1,0);\\ (-L_1,0,0) & (0,1,0);\\ (-L_1,0,0) \\\\ 3 & (1,0,0);\\ (0,L_1,0) & (-1,0,0);\\ (0,-L_1,L_2) & (0,1,0);\\ (-L_1,0,L_2) \\\\ 4 & (0,1,0);\\ (-L_1,0,-L_2) & & (0,1,0);\\ (-L_1,0,L_2+L_3) \\\\ 5 & & & (1,0,0);\\ (0,L_1,0) \\end{array}$$\n\nTwo patterns to notice: joints with parallel axes share $\\omega$ and differ only in $v$ (2025 joints 2–4, whose $v$ grows by $L_2$, then $L_3$, as the axis moves out along $\\hat x_s$); and a revolute joint whose axis passes through the origin, joint 1 in 2023 and 2025, has $v = 0$.\n\nThe 2022 SCARA (Q33): three vertical revolute axes at $q = (0, y_i, 0)$ give $v_i = (y_i, 0, 0)$ by the $\\hat z$ shortcut, and the vertical prismatic joint gives $\\mathcal{S}_4 = (0, 0, 0, 0, 0, 1)$.',
    exploreIds: ['screws', 'viewer'],
    solveIds: ['kin-screws', 'kin-arm-camera'],
  },

  // ------------------------------------------------------------------ product of exponentials
  {
    id: 'kin-poe',
    title: 'Product of exponentials: space and body forms',
    lecture: 'Notes §6; review deck slide 20; 2022 Q8, Q9, Q24, Q27, Q34',
    formulas: [
      '$$T(\\theta) = e^{[\\mathcal{S}_1]\\theta_1} e^{[\\mathcal{S}_2]\\theta_2} \\cdots e^{[\\mathcal{S}_n]\\theta_n} M \\;=\\; M e^{[\\mathcal{B}_1]\\theta_1} e^{[\\mathcal{B}_2]\\theta_2} \\cdots e^{[\\mathcal{B}_n]\\theta_n}$$',
      '$$[\\mathcal{S}] = \\begin{bmatrix} [\\omega] & v \\\\ 0 & 0 \\end{bmatrix} \\in se(3), \\qquad [\\omega] = \\begin{bmatrix} 0 & -\\omega_3 & \\omega_2 \\\\ \\omega_3 & 0 & -\\omega_1 \\\\ -\\omega_2 & \\omega_1 & 0 \\end{bmatrix} \\in so(3)$$',
      '$$e^{[\\mathcal{S}]\\theta} = \\begin{bmatrix} e^{[\\omega]\\theta} & \\big(I\\theta + (1 - \\cos\\theta)[\\omega] + (\\theta - \\sin\\theta)[\\omega]^2\\big)\\,v \\\\ 0 & 1 \\end{bmatrix} \\ \\ (\\|\\omega\\| = 1), \\qquad e^{[\\mathcal{S}]\\theta} = \\begin{bmatrix} I & v\\theta \\\\ 0 & 1 \\end{bmatrix} \\ \\ (\\omega = 0)$$',
      '$$e^{[\\omega]\\theta} = I + \\sin\\theta\\,[\\omega] + (1 - \\cos\\theta)\\,[\\omega]^2 \\qquad \\text{(Rodrigues)}$$',
      '$$\\begin{gathered} \\mathcal{B}_i = [\\mathrm{Ad}_{M^{-1}}]\\,\\mathcal{S}_i, \\qquad [\\mathrm{Ad}_T] = \\begin{bmatrix} R & 0 \\\\ [p]R & R \\end{bmatrix} \\\\ \\text{directly:} \\quad \\omega_b = R^T\\omega, \\qquad q_b = R^T(q - p), \\qquad v_b = -\\omega_b \\times q_b \\end{gathered}$$',
    ],
    what: 'The product of exponentials (PoE) builds forward kinematics from one matrix exponential per joint. Each $e^{[\\mathcal{S}_i]\\theta_i}$ is the rigid motion produced by turning joint $i$ through $\\theta_i$ about its screw axis: a rotation about a line in space, or a translation for a prismatic joint. In the **space form** the screw axes are written in {s} at the zero configuration and the exponentials pre-multiply $M$; in the **body form** they are written in {b} at the zero configuration and post-multiply $M$. Both give the same $T(\\theta)$, and both collapse to $M$ when $\\theta = 0$.',
    when: '- Evaluating the end-effector pose at a given configuration, or picking it from options (2022 Q34).\n- “Fill in the values in the table with the screw axes defined in frame {b}” (review deck slide 20), or “what is $\\mathcal{B}_5$?” (2022 Q35): the body form.\n- Matching SO(3), SE(3), so(3), se(3), twist, screw axis, Rodrigues’ formula and PoE to their meanings (2022 Q8, Q9).\n- Building or converting a Jacobian (2022 Q10, Q27): its columns are the PoE’s screw axes moved to the current configuration.',
    how: [
      'Get $M$ and one screw axis per joint: $\\mathcal{S}_i$ in {s} for the space form, $\\mathcal{B}_i$ in {b} for the body form.',
      'Write the product in **joint order**, base joint first: $e^{[\\mathcal{S}_1]\\theta_1} \\cdots e^{[\\mathcal{S}_n]\\theta_n} M$ (space) or $M e^{[\\mathcal{B}_1]\\theta_1} \\cdots e^{[\\mathcal{B}_n]\\theta_n}$ (body). Matrix products do not commute, so the order matters.',
      'Evaluate each factor: for a revolute joint, Rodrigues gives the rotation block and the formula box the translation column; a prismatic joint gives a pure translation by $v\\theta$. Joints at $\\theta_i = 0$ contribute $I$ and can be skipped.',
      'For {b}-frame axes, write $\\omega$ in {b}’s axes and measure $q$ from the {b} origin, $q_b = R^T(q - p)$, then $v_b = -\\omega_b \\times q_b$. This is the same as $\\mathcal{B}_i = [\\mathrm{Ad}_{M^{-1}}]\\mathcal{S}_i$.',
      'Sanity-check by geometry: $\\theta = 0$ must give $M$, and a chain of parallel revolute axes adds its angles (in 2022 Q34 the SCARA’s tool turns by $\\theta_1 + \\theta_2 + \\theta_3 = \\pi$).',
    ],
    traps: [
      {
        title: 'Swapping the order of the exponentials',
        detail: 'Rotations about different axes do not commute. Keep joint order in both forms; only the side on which $M$ sits changes.',
        source: 'Notes §6',
      },
      {
        title: '{b}-frame screw axes measured from {s}',
        detail: 'In the body form $q$ is measured from the **{b} origin** and every vector is written in **{b} axes**. The review deck’s arm has {b} parallel to {0}, yet every revolute $v$ differs from the {s} version because the origin moved to $p = (L_1, L_3 + L_4, -L_5 - L_6)$.',
        trapId: 'b-frame-q',
        source: 'Review deck slide 20; 2022 Q35',
      },
      {
        title: 'Using the adjoint of the wrong transform',
        detail: '$\\mathcal{B}_i = [\\mathrm{Ad}_{M^{-1}}]\\mathcal{S}_i$ goes from {s} to {b}; $[\\mathrm{Ad}_M]$ goes back, $\\mathcal{S}_i = [\\mathrm{Ad}_M]\\mathcal{B}_i$. The same rule converts Jacobians: $J_b = [\\mathrm{Ad}_{T_{bs}}]J_s$.',
        source: '2022 Q27',
      },
      {
        title: 'Putting M on the wrong side',
        detail: 'Space form: $M$ last, on the right. Body form: $M$ first, on the left. Writing $M e^{[\\mathcal{S}_1]\\theta_1} \\cdots$ applies {s}-frame axes as if they were in {b} and gives a wrong pose.',
        source: 'Notes §6',
      },
    ],
    more: 'Why the space form works. Read $e^{[\\mathcal{S}_1]\\theta_1} \\cdots e^{[\\mathcal{S}_n]\\theta_n} M$ from the right. $M$ puts {b} at its home pose. Then turn the **last** joint: nothing inboard has moved yet, so its axis is exactly where $\\mathcal{S}_n$ says. Then joint $n-1$ carries joint $n$ and {b} together about its own axis, which is also still at home, and so on down to joint 1. Every axis is used before anything moves it, so the zero-configuration axes in {s} are always the right ones.\n\nA check you can do in your head, the planar 2R arm in PoE form: $\\mathcal{S}_1 = (0, 0, 1,\\ 0, 0, 0)$ (axis through the origin), $\\mathcal{S}_2 = (0, 0, 1,\\ 0, -L_1, 0)$ (axis through $(L_1, 0, 0)$, $v = (q_y, -q_x, 0)$), and $M$ with $R = I$, $p = (L_1 + L_2, 0, 0)$. Reading from the right, joint 2 swings the tip about its home axis to $(L_1 + L_2\\cos\\theta_2,\\ L_2\\sin\\theta_2,\\ 0)$; then joint 1 turns everything about the origin by $\\theta_1$:\n\n$$p(\\theta) = \\big(L_1\\cos\\theta_1 + L_2\\cos(\\theta_1 + \\theta_2),\\ \\ L_1\\sin\\theta_1 + L_2\\sin(\\theta_1 + \\theta_2),\\ \\ 0\\big), \\qquad R(\\theta) = \\mathrm{Rot}(\\hat z,\\ \\theta_1 + \\theta_2)$$\n\nThat is the familiar 2R formula, recovered without a single intermediate frame.\n\nWhy the body form works. Read $M e^{[\\mathcal{B}_1]\\theta_1} \\cdots e^{[\\mathcal{B}_n]\\theta_n}$ from the left: start at $M$ and turn the **first** joint. A joint carries its outboard axes and {b} together, so seen from {b} the axes of joints $2, \\dots, n$ have not moved, and each $\\mathcal{B}_i$ is still valid when its turn comes.\n\nA body-frame row worked (review deck slide 20, joint 4): $\\omega = (1, 0, 0)$ and, from the {b} origin, $q = (0, -L_4, L_5 + L_6)$, so $v = (0, q_z, -q_y) = (0, L_5 + L_6, L_4)$.\n\nThe groups (2022 Q8): SO(3) holds rotation matrices and SE(3) homogeneous transforms (poses); so(3) holds 3 × 3 skew-symmetric matrices $[\\omega]$ and se(3) the 4 × 4 matrices $[\\mathcal{V}]$ of twists (velocities). The matrix exponential maps each velocity space onto its group, which is why a joint motion is $e^{[\\mathcal{S}]\\theta}$. Angular velocity of a rotating frame (2022 Q24): $[\\omega_s] = \\dot R R^T$ in {s} and $[\\omega_b] = R^T\\dot R$ in {b}.\n\nJacobian from the PoE: column $i$ of the space Jacobian is joint $i$’s screw axis moved to the current configuration, $J_{s1} = \\mathcal{S}_1$ and $J_{si} = [\\mathrm{Ad}_{e^{[\\mathcal{S}_1]\\theta_1} \\cdots e^{[\\mathcal{S}_{i-1}]\\theta_{i-1}}}]\\,\\mathcal{S}_i$. Then $\\mathcal{V}_s = J_s(\\theta)\\dot\\theta$, and at $\\theta = 0$ simply $J_s = [\\mathcal{S}_1 \\cdots \\mathcal{S}_n]$.',
    exploreIds: ['poe', 'viewer'],
    solveIds: ['kin-poe', 'kin-jacobian'],
  },

  // ------------------------------------------------------------------ the 15-mark arm question
  {
    id: 'kin-arm-camera',
    title: 'The arm + camera long answer (15 marks)',
    lecture: 'Notes §6 and §7 (pinhole); 2023 Q33, 2024 Q30, 2025 Q30',
    formulas: [
      '$$\\begin{array}{l|c|c|c} \\text{part} & \\text{2023 Q33 (RPRR)} & \\text{2024 Q30 (PRR)} & \\text{2025 Q30 (RRRRR)} \\\\ \\hline \\text{(a) } M & 4 & 4 & 4 \\\\ \\text{(b) screw table in } \\{s\\} & 8 & 6 & 5 \\\\ \\text{(c), (d) camera} & 3 & 3 + 2 & 3 + 3 \\end{array}$$',
      '$$M = \\begin{bmatrix} \\hat x_b & \\hat y_b & \\hat z_b & p \\\\ 0 & 0 & 0 & 1 \\end{bmatrix}, \\qquad \\text{R: } v_i = -\\omega_i \\times q_i, \\qquad \\text{P: } \\omega_i = 0,\\ v_i = \\text{direction of travel}$$',
      '$$\\text{camera at } p, \\text{ looking along } \\hat z_b: \\qquad Z = (x_{\\text{object}} - p)\\cdot\\hat z_b, \\qquad h^{\\prime} = \\frac{f\\,h}{Z}$$',
    ],
    what: 'Every paper from 2023 to 2025 ends with the same 15-mark arm question: a robot drawn in its zero configuration with {s} and {b} marked, then (a) $M$, (b) the screw-axis table in {s}, and (c)–(d) a camera on the end-effector photographing something, solved with the pinhole model. The parts chain together: $M$ gives the camera’s position $p$ and viewing direction $\\hat z_b$, and those set the depth $Z$ in $h^{\\prime} = fh/Z$. It is the most predictable 15 marks on the paper, so make the method mechanical.',
    when: '- 2023 Q33: RPRR arm; $M$ (4), screw table (8), image height of a 1.7 m person standing at (−0.2, 5, 0) with $f$ = 50 mm (3).\n- 2024 Q30: PRR camera boom; $M$ (4), screw table (6), distance from the base to the 60 m Wheel of Brisbane imaged at 38 mm (3), image height after moving 20 m closer (2).\n- 2025 Q30: Perseverance RRRRR arm; $M$ (4), screw table (5), lateral distance with the arm fully extended to mast height (3), focal length from a 7.06 mm image of a 163 mm mast head (3).',
    how: [
      'Read the figure: write where $\\hat x_s$, $\\hat y_s$, $\\hat z_s$ point (the diagonal arrow is out of or into the page), list the joints in order with their type, and note every length symbol.',
      '(a) $M$: walk from {s} to {b} to get $p$; write {b}’s axes in {s} as the columns of $R$; check $\\hat x_b \\times \\hat y_b = \\hat z_b$. Keep the symbols.',
      '(b) Screw table: for each joint, $\\omega_i$ from the axis and the right-hand rule, $q_i$ any point on the axis, $v_i = -\\omega_i \\times q_i$ (shortcut table); prismatic $\\omega_i = 0$ and $v_i$ = direction. Write one cross product out in full per joint.',
      '(c) Camera geometry: put the given lengths into $p$ to get the camera position; the optical axis is $\\hat z_b$. The depth $Z$ is the distance from the **camera** to the object along $\\hat z_b$: subtract the camera’s coordinate along that axis from the object’s.',
      'Pinhole: rearrange $h^{\\prime} = fh/Z$ for the unknown (image height, depth or focal length) with every length in metres. If the question asks about the robot’s base, convert at the end by adding or subtracting the arm’s offset along the line of sight.',
      'State the assumptions in one line: ideal pinhole with no distortion; object in focus, centred and perpendicular to the optical axis, so all of it is at depth $Z$.',
    ],
    traps: [
      {
        title: 'Depth measured from the base',
        detail: 'The pinhole $Z$ is measured from the camera along its optical axis. In 2023 Q33 the camera is at $y = L_3 = 0.4$ m, so the person at $y = 5$ m is at $Z = 4.6$ m, not 5 m: 18.5 mm, not 17.0 mm.',
        trapId: 'depth-from-camera',
        source: '2023 Q33(c)',
      },
      {
        title: 'Giving the camera distance when the base was asked for',
        detail: '2024 Q30(c) asked how far the **base** is from the Wheel: $Z = 0.050 \\times 60 / 0.038 = 78.95$ m from the camera, and the camera is $L_3 = 1.5$ m further along the line of sight than the base, so about 80.4 m. In (d), “20 m closer” makes $Z = 58.95$ m and the image 50.9 mm.',
        source: '2024 Q30(c)–(d)',
      },
      {
        title: 'Mixing mm and m',
        detail: 'Convert $f$ and $h^{\\prime}$ to metres before substituting (50 mm = 0.050 m, 38 mm = 0.038 m); an answer off by $10^3$ is a unit slip.',
        trapId: 'unit-scale',
        source: 'Notes §7',
      },
      {
        title: 'Using the full height as the rise',
        detail: 'In 2025 Q30(c) the straight arm pivots at joint 2, already $L_1 = 0.1$ m up, so it rises only $1.1 - 0.1 = 1.0$ m over its 2.1 m length: $\\sqrt{2.1^2 - 1.0^2} = 1.85$ m. Using 1.1 m gives 1.79 m.',
        source: '2025 Q30(c)',
      },
      {
        title: 'Letting one sign slip run through every part',
        detail: 'A misread diagonal axis moves the camera in $p$ or flips $\\hat z_b$, and part (c) inherits the error. Do the right-handed check on $M$ before moving on.',
        trapId: 'diagonal-axis',
        source: 'Notes §6',
      },
    ],
    more: 'The three camera parts worked through (numbers from the papers):\n\n$$\\begin{array}{l|l|l} & \\text{depth } Z \\text{ from the camera} & \\text{result} \\\\ \\hline \\text{2023 (c)} & 5 - 0.4 = 4.6\\ \\text{m} & h^{\\prime} = 0.050 \\times 1.7 / 4.6 = 18.5\\ \\text{mm} \\\\ \\text{2024 (c)} & 0.050 \\times 60 / 0.038 = 78.95\\ \\text{m} & \\text{base} \\approx 78.95 + 1.5 = 80.4\\ \\text{m} \\\\ \\text{2024 (d)} & 78.95 - 20 = 58.95\\ \\text{m} & h^{\\prime\\prime} = 0.050 \\times 60 / 58.95 = 50.9\\ \\text{mm} \\\\ \\text{2025 (c)} & \\sqrt{2.1^2 - 1.0^2} = 1.85\\ \\text{m} & \\text{lateral distance } 1.85\\ \\text{m} \\\\ \\text{2025 (d)} & 1.85\\ \\text{m} & f = 7.06\\ \\text{mm} \\times 1.85 / 0.163 = 80\\ \\text{mm} \\end{array}$$\n\nWhy the depth is along $\\hat z_b$: the pinhole model divides by the distance along the optical axis, and a camera frame’s $\\hat z$ is its optical axis by convention. When the object sits straight ahead, as in all three papers, $Z$ is a difference of one coordinate; otherwise take the dot product $(x_{\\text{object}} - p)\\cdot\\hat z_b$.\n\nQuick checks: image size is inversely proportional to depth, so in 2024 (d) $38 \\times 78.95 / 58.95 = 50.9$ mm; a 50 mm lens imaging a person a few metres away gives tens of millimetres, not metres. Away from the zero configuration the camera pose is $T(\\theta)$ from the product of exponentials rather than $M$.',
    exploreIds: ['build-m', 'screws', 'viewer'],
    solveIds: ['kin-arm-camera', 'kin-m', 'kin-screws'],
  },

  // ------------------------------------------------------------------ Pieper
  {
    id: 'kin-pieper',
    title: 'Closed-form IK: Pieper’s criterion',
    lecture: 'Notes §6; review deck slide 19; 2023 Q12',
    formulas: [
      '$$\\text{a 6-DOF arm has closed-form IK if three consecutive revolute axes } \\begin{cases} \\text{intersect at one point (a spherical wrist), or} \\\\ \\text{are parallel to each other} \\end{cases}$$',
      '$$\\text{spherical wrist:} \\quad p_w = p_d - d\\,\\hat z_d \\;\\to\\; (\\theta_1, \\theta_2, \\theta_3), \\qquad R_{\\text{wrist}}(\\theta_4, \\theta_5, \\theta_6) = R_{\\text{arm}}(\\theta_1, \\theta_2, \\theta_3)^T R_d$$',
    ],
    what: 'Pieper’s criterion says when a 6-DOF arm’s inverse kinematics can be solved analytically, by geometry and trigonometry rather than iteration: when three **consecutive** revolute joint axes intersect at a common point (a spherical wrist) or are mutually parallel. Either way the six coupled equations **decouple** into two 3-unknown problems. With a spherical wrist, the last three joints only rotate the tool about the wrist centre, so the wrist centre’s position depends on joints 1–3 alone: solve those for position, then joints 4–6 for orientation.',
    when: '- “Which of the following 6DOF robot arm configurations has a closed-form inverse kinematics solution?” (2023 Q12, four sketches).\n- “For a 6DOF robot arm, what are the conditions that permit a closed-form inverse kinematics solution?” (review deck slide 19).\n- Deciding between closed-form and numerical IK for a given arm.',
    how: [
      'List the joints in order and mark which are revolute. The condition is about three **consecutive** revolute axes; prismatic joints may sit elsewhere in the chain, as in the Stanford arm (R–R–P, then a wrist).',
      'Look at the last three axes: do they all pass through one point? In a sketch, the three wrist cylinders must meet with no offset link between them.',
      'Otherwise look for three consecutive parallel axes, such as the shoulder, elbow and wrist-pitch joints of a UR-style arm.',
      'If either holds, name it and give the decoupling: the wrist centre $p_w$ from the desired pose (step back from the tool along the approach axis), joints 1–3 from $p_w$ by planar geometry (law of cosines, atan2), then joints 4–6 from $R_{\\text{arm}}^T R_d$ like a set of Euler angles.',
      'If neither holds, there is no general closed form: use numerical IK (Newton–Raphson).',
    ],
    traps: [
      {
        title: 'Parallel but not consecutive',
        detail: 'Joints 1, 3 and 5 being parallel does not count: the three axes must be neighbours in the chain.',
        source: 'Notes §6',
      },
      {
        title: 'An offset hiding in the wrist',
        detail: 'In 2023 Q12 (a), the last link is offset along joint 5’s axis, so axes 4, 5 and 6 never meet at one point: no spherical wrist. Look for that offset before you call a wrist spherical.',
        source: '2023 Q12 worked solution',
      },
      {
        title: '“Closed form means one answer”',
        detail: 'A closed form lists every solution branch explicitly, and there are usually several (shoulder left or right, elbow up or down, wrist flipped or not): up to 8 for a typical industrial arm.',
        source: 'Notes §6 (number of IK solutions)',
      },
      {
        title: 'Treating Pieper as necessary',
        detail: 'It is **sufficient**: an arm that fails it may still have a special analytic solution, but there is no general recipe, so numerical IK is the default.',
        source: 'Notes §6',
      },
    ],
    more: 'Why intersecting axes decouple: a rotation about an axis through a point leaves that point where it is. Whatever $\\theta_4, \\theta_5, \\theta_6$ do, the wrist centre stays put, so its position is a function of $\\theta_1, \\theta_2, \\theta_3$ only. Given the desired tool pose $(R_d, p_d)$, the wrist centre is $p_w = p_d - d\\,\\hat z_d$ (step back along the approach axis by the wrist-to-tool distance $d$): 3 equations in 3 unknowns, usually a triangle. The rotation still missing, $R_{\\text{arm}}^T R_d$, is then produced by three intersecting axes, which behave like a set of Euler angles.\n\nWhy parallel axes help: three parallel revolute joints move their links in one plane, like a planar 3R arm. Its position follows from the law of cosines and its orientation in that plane is just the sum of the three angles.\n\nRecognising the layouts (2023 Q12, as read in the worked solutions): sketch (c) is R–R–P followed by three revolute axes meeting at one point, the Stanford-arm layout, so it decouples. In (a) the last link is offset along joint 5’s axis, so axes 4, 5 and 6 never meet. (b) has no three consecutive revolute axes that intersect or are parallel. In (d) every revolute axis is parallel to the same direction, so the tool can only ever turn about that one direction: most target orientations cannot be reached at all, so it is not a working 6-DOF arm. (The worked solutions flag that this relies on reading small drawing details.)',
    exploreIds: ['pieper'],
    solveIds: ['kin-pieper'],
  },

  // ------------------------------------------------------------------ numerical IK
  {
    id: 'kin-numerical-ik',
    title: 'Numerical IK: Newton–Raphson, the Jacobian and singularities',
    lecture: 'Notes §6; review deck slide 18; 2022 Q12, Q21, Q26, Q27, Q29',
    formulas: [
      '$$\\theta^{k+1} = \\theta^k + J^{\\dagger}(\\theta^k)\\,\\big(x_d - f(\\theta^k)\\big), \\qquad J(\\theta) = \\frac{\\partial f}{\\partial \\theta}$$',
      '$$[\\mathcal{V}_b] = \\log\\!\\big(T_{sb}^{-1}(\\theta^k)\\,T_{sd}\\big), \\qquad \\theta^{k+1} = \\theta^k + J_b^{\\dagger}(\\theta^k)\\,\\mathcal{V}_b, \\qquad \\text{stop when } \\|\\omega_b\\| < \\varepsilon_\\omega \\text{ and } \\|v_b\\| < \\varepsilon_v$$',
      '$$J^{\\dagger} = \\begin{cases} J^{-1} & n = m \\ \\text{(square)} \\\\ J^T(JJ^T)^{-1} & n > m \\ \\text{(redundant)} \\end{cases} \\qquad\\qquad \\text{singular configuration: } \\operatorname{rank} J(\\theta) \\text{ drops}$$',
      '$$\\text{planar 2R:} \\quad J = \\begin{bmatrix} -L_1 s_1 - L_2 s_{12} & -L_2 s_{12} \\\\ L_1 c_1 + L_2 c_{12} & L_2 c_{12} \\end{bmatrix}, \\qquad \\det J = L_1 L_2 \\sin\\theta_2 = 0 \\iff \\theta_2 = 0 \\text{ or } \\pi$$',
    ],
    what: 'When there is no closed form, IK is solved with Newton–Raphson: start from a guess $\\theta^0$, compute where the arm actually is with forward kinematics, and correct the joints by the Jacobian (pseudo)inverse times the remaining error, $\\Delta\\theta = J^{\\dagger}e$. The Jacobian $J(\\theta)$ maps joint velocities to end-effector velocity ($\\mathcal{V} = J\\dot\\theta$), so each step is the joint change that would remove the error if the arm were linear. Close to a solution the error shrinks very fast; far from one, or near a singularity, that linear prediction is poor and the iteration can jump, oscillate or end at a different solution.',
    when: '- “Describe the process of solving the inverse kinematics of a robot arm using the Newton–Raphson method” (review deck slide 18, learning outcome).\n- “One advantage of Newton–Raphson for IK is that it always converges: true or false?” (2022 Q12).\n- “A singularity happens when the Jacobian matrix loses rank” (2022 Q21) and “can singularities be overcome by choosing the base and end-effector frames?” (2022 Q29).\n- Converting or ranking Jacobians (2022 Q26, Q27).',
    how: [
      'Choose an initial guess $\\theta^0$: the current configuration, or one near the solution you want (elbow up or elbow down).',
      'Run forward kinematics at $\\theta^k$ and form the error: $e = x_d - f(\\theta^k)$ for a position target, or the body twist $\\mathcal{V}_b$ from $\\log(T_{sb}^{-1}T_{sd})$ for a full pose.',
      'If the error is below the tolerance, stop: $\\theta^k$ is the solution.',
      'Otherwise evaluate the Jacobian at $\\theta^k$ and update $\\theta^{k+1} = \\theta^k + J^{\\dagger}e$ ($J^{-1}e$ when $J$ is square and invertible).',
      'Repeat. If it diverges, oscillates or stalls, restart from another guess, check that the target is reachable, and keep clear of singular configurations.',
    ],
    traps: [
      {
        title: '“Newton–Raphson always converges”',
        detail: 'False (2022 Q12). It converges only from a guess close enough to a solution; otherwise it can diverge, oscillate or stall.',
        source: '2022 Q12',
      },
      {
        title: 'Expecting the solution you had in mind',
        detail: 'Different initial guesses converge to different solutions (elbow up vs elbow down): Newton–Raphson returns the one whose basin of attraction contains $\\theta^0$.',
        source: 'Notes §6',
      },
      {
        title: 'Iterating near a singularity',
        detail: 'As $J$ loses rank, $J^{\\dagger}$ blows up and a small error demands huge joint steps. Damped least squares, $J^T(JJ^T + \\lambda^2 I)^{-1}$, keeps the steps bounded.',
        source: 'Notes §6; 2022 Q21',
      },
      {
        title: '“Better frames remove singularities”',
        detail: 'False (2022 Q29): $J_b = [\\mathrm{Ad}_{T_{bs}}]J_s$ and the adjoint is invertible, so the rank, and with it every singularity, is the same in any frame. Singularities belong to the configuration of the mechanism.',
        source: '2022 Q29',
      },
      {
        title: 'Seeing a singularity that is not there',
        detail: 'The RP arm with $x = (L_1 + L_2 + \\theta_2)\\cos\\theta_1$, $y = (L_1 + L_2 + \\theta_2)\\sin\\theta_1$, $\\phi = \\theta_1$ keeps rank 2 at $\\theta_2 = 0$, because its reach $L_1 + L_2$ is still nonzero.',
        source: '2022 Q26',
      },
    ],
    more: 'One-joint picture: to solve $f(\\theta) = x_d$, Newton–Raphson follows the tangent, $\\theta^{k+1} = \\theta^k + (x_d - f(\\theta^k))/f^{\\prime}(\\theta^k)$. Where the slope $f^{\\prime}$ is near zero (a singularity) the step is enormous; where $f$ curves strongly, the tangent overshoots. The Jacobian is the many-joint version of that slope.\n\nWhat a singularity looks like: some end-effector direction cannot be produced by any joint velocity. A planar 2R arm stretched straight ($\\theta_2 = 0$) cannot move its tip radially outwards, and folded back ($\\theta_2 = \\pi$) neither; these are also where the elbow-up and elbow-down solutions merge.\n\nThe Jacobian of an $n$-joint spatial arm is $6 \\times n$, so its rank is at most $\\min(6, n)$: a 9-DOF arm still has rank at most 6 (2022 Q26), and the 3 extra dimensions are self-motion (the null space). Its columns come from the PoE: $J_{si}$ is joint $i$’s screw axis at the current configuration, and $J_b = [\\mathrm{Ad}_{T_{bs}}]J_s$ (2022 Q27). For a tall $J$ ($n < m$, fewer joints than task coordinates) the left pseudoinverse $(J^TJ)^{-1}J^T$ gives the least-squares step.\n\nMore limits: each run returns one solution and ignores joint limits unless you clamp the steps; a target outside the workspace leaves a residual error that never reaches zero.',
    exploreIds: ['ik'],
    solveIds: ['kin-nr-step', 'kin-ik-solutions', 'kin-jacobian'],
  },
];

export const flashcards: Flashcard[] = [
  // Forward vs inverse
  {
    id: 'kin-f-fk-ik',
    front: 'Forward vs inverse kinematics: what is given, what is found, and how many answers?',
    back: '**Forward:** joint values $\\theta$ given, pose $T_{sb}(\\theta)$ found; always exactly one answer, by direct substitution (PoE). **Inverse:** desired pose $T_{sd}$ given, joint values found; none, finitely many or infinitely many answers (closed form if Pieper holds, otherwise Newton–Raphson).',
    tags: ['fk-ik'],
  },
  {
    id: 'kin-f-review',
    front: 'Forward or inverse? (a) where a ground robot ends up after a sequence of velocity commands; (b) the arm configuration that lets a robot reach a door handle.',
    back: '(a) **Forward**: the inputs are known and you integrate them to get the pose. (b) **Inverse**: the pose (gripper at the handle) is specified and you solve for the joints (review deck slide 19).',
    tags: ['fk-ik'],
  },
  {
    id: 'kin-f-impostors',
    front: 'Forward, inverse or neither? (a) the pose of joint 3’s frame from all the joint angles; (b) steering commands that make a mobile robot track a path; (c) forces and torques at the end-effector.',
    back: '(a) **Forward**: FK gives the pose of any link frame, not only the tool (2023 Q11). (b) **Inverse**: a desired motion is given and the inputs are found (2025 Q12). (c) **Neither**: that is statics or dynamics (2025 Q12).',
    tags: ['fk-ik', 'mcq'],
  },
  {
    id: 'kin-f-ik-count',
    front: 'How many IK solutions for a target outside the workspace, for a non-redundant arm, and for a redundant arm?',
    back: 'Outside the workspace: **none**. Non-redundant (joints = task DOF): **finitely many**, e.g. elbow up and elbow down. Redundant (joints > task DOF): **infinitely many** inside the workspace (self-motion).',
    tags: ['fk-ik'],
  },
  {
    id: 'kin-f-redundant',
    front: 'TRUE or FALSE: a redundant (over-actuated) arm always has an IK solution.',
    back: '**FALSE** (2022 Q4): the spare joints give infinitely many solutions only for poses inside the workspace (2022 Q18). A pose out of reach, or an orientation the wrist cannot make, has none.',
    tags: ['fk-ik', 'mcq'],
  },
  // M
  {
    id: 'kin-f-m',
    front: 'What is $M$, and what are its columns?',
    back: 'The pose of {b} in {s} at the zero configuration, $M = T_{sb}(0)$. Columns 1–3 are $\\hat x_b$, $\\hat y_b$, $\\hat z_b$ written in {s} coordinates; column 4 is $p$, the {b} origin in {s}; the bottom row is $(0, 0, 0, 1)$.',
    tags: ['m'],
  },
  {
    id: 'kin-f-diagonal',
    front: 'An exam figure draws $\\hat x_s$ pointing down-left. Which way does it really point, and where does a link drawn up-right go?',
    back: '$\\hat x_s$ points **out of the page**, so a link drawn up-right runs **into the page**, along $-\\hat x_s$. That is why $p$ has $-L_2$ in 2023 Q33 and $-L_3$ in 2024 Q30. Confirm with $\\hat x_s \\times \\hat y_s = \\hat z_s$.',
    tags: ['m'],
  },
  {
    id: 'kin-f-handed',
    front: 'How do you check the $R$ you wrote in $M$?',
    back: 'Orthonormal columns ($R^TR = I$; for the exam arms each column has a single $\\pm 1$) that are right-handed: $\\hat x_b \\times \\hat y_b = \\hat z_b$, so $\\det R = +1$. $\\det R = 1$ alone is **not** enough: $\\mathrm{diag}(2, \\tfrac12, 1)$ has determinant 1 (2022 Q7).',
    tags: ['m', 'mcq'],
  },
  {
    id: 'kin-f-rot-rep',
    front: 'Is a 3 × 3 rotation matrix an explicit or an implicit representation of orientation? Name an alternative.',
    back: '**Implicit**: 9 numbers tied by 6 constraints ($R^TR = I$) leave 3 DOF (2022 Q7). Exponential coordinates $\\hat\\omega\\theta \\in \\mathbb{R}^3$ (unit axis times angle) are an alternative representation of the same rotation, $R = e^{[\\hat\\omega]\\theta}$ (2022 Q15).',
    tags: ['poe', 'mcq'],
  },
  // Screw axes
  {
    id: 'kin-f-revolute',
    front: 'Screw axis of a revolute joint?',
    back: '$\\mathcal{S} = (\\omega, v)$ with $\\omega$ the unit vector along the joint axis (sign from the right-hand rule on the drawn arrow) and $v = -\\omega \\times q$ for **any** point $q$ on the axis.',
    tags: ['screws'],
  },
  {
    id: 'kin-f-prismatic',
    front: 'Screw axis of a prismatic joint? Does where the joint sits matter?',
    back: '$\\omega = (0, 0, 0)$ and $v$ = the unit direction of travel. Its position does not matter (a translation moves every point by the same vector), so $q$ is left blank.',
    tags: ['screws'],
  },
  {
    id: 'kin-f-shortcuts',
    front: 'Shortcuts for $v = -\\omega \\times q$ when $\\omega = \\hat x$, $\\hat y$ or $\\hat z$, with $q = (q_x, q_y, q_z)$?',
    back: '$$\\begin{array}{c|c} \\omega & v \\\\ \\hline (1, 0, 0) & (0,\\ q_z,\\ -q_y) \\\\ (0, 1, 0) & (-q_z,\\ 0,\\ q_x) \\\\ (0, 0, 1) & (q_y,\\ -q_x,\\ 0) \\end{array}$$\n\nCheck: $\\omega = (1, 0, 0)$ and $q = (0, 0, L_1)$ give $v = (0, L_1, 0)$ (2023 Q33 joint 3).',
    tags: ['screws'],
  },
  {
    id: 'kin-f-flip',
    front: 'You read a rotation arrow backwards. What happens to that row of the table? And if you choose a different point $q$ on the same axis?',
    back: 'Flipping $\\omega$ flips $v$ (the whole screw axis changes sign): the joint just turns the other way, and consistent working still earns marks. Sliding $q$ along the axis, $q + t\\omega$, leaves $v$ unchanged because $\\omega \\times \\omega = 0$.',
    tags: ['screws'],
  },
  {
    id: 'kin-f-v-meaning',
    front: 'Physically, what is the $v$ part of a revolute joint’s screw axis?',
    back: 'The velocity of the point at the frame origin, imagined rigidly attached to the moving link, when the joint turns at 1 rad/s: $v = \\omega \\times (0 - q)$. An axis through the origin gives $v = 0$; the farther the axis from the origin, the larger $v$.',
    tags: ['screws'],
  },
  {
    id: 'kin-f-pitch',
    front: 'What is the screw pitch of a revolute joint, and of a pure translation?',
    back: 'Pitch $h$ = translation per radian of rotation ($v = -\\omega \\times q + h\\omega$). Revolute: $h = 0$. Pure translation: $\\omega = 0$, so the pitch is **infinite** (2022 Q11).',
    tags: ['screws', 'mcq'],
  },
  // PoE and the groups
  {
    id: 'kin-f-groups',
    front: 'SO(3), SE(3), so(3), se(3): what does each contain?',
    back: 'SO(3): 3 × 3 rotation matrices. SE(3): 4 × 4 homogeneous transforms. so(3): 3 × 3 skew-symmetric matrices $[\\omega]$, with $[\\omega]x = \\omega \\times x$. se(3): 4 × 4 matrices $[\\mathcal{V}]$ representing twists (2022 Q8, Q20). Capitals are poses, lower case are velocities.',
    tags: ['poe', 'mcq'],
  },
  {
    id: 'kin-f-twist-screw',
    front: 'Twist vs screw axis?',
    back: 'A **twist** $\\mathcal{V} = (\\omega, v)$ is a 6-vector of angular and linear velocity. A **screw axis** $\\mathcal{S}$ is its normalised version ($\\|\\omega\\| = 1$, or $\\omega = 0$ and $\\|v\\| = 1$) that describes the joint’s axis, so $\\mathcal{V} = \\mathcal{S}\\dot\\theta$ (2022 Q9).',
    tags: ['poe', 'mcq'],
  },
  {
    id: 'kin-f-rodrigues',
    front: 'What does Rodrigues’ formula compute? Write it.',
    back: 'The rotation matrix for a rotation by $\\theta$ about a unit axis $\\hat\\omega$ (2022 Q9):\n\n$$R = e^{[\\hat\\omega]\\theta} = I + \\sin\\theta\\,[\\hat\\omega] + (1 - \\cos\\theta)\\,[\\hat\\omega]^2$$\n\nThe product of exponentials chains one such motion per joint.',
    tags: ['poe', 'mcq'],
  },
  {
    id: 'kin-f-poe-space',
    front: 'Space-form product of exponentials: the formula, the order, and the check at $\\theta = 0$?',
    back: '$T(\\theta) = e^{[\\mathcal{S}_1]\\theta_1} \\cdots e^{[\\mathcal{S}_n]\\theta_n} M$: axes in {s} at the zero configuration, joint order from the base, $M$ on the right. At $\\theta = 0$ every factor is $I$, so $T = M$.',
    tags: ['poe'],
  },
  {
    id: 'kin-f-poe-body',
    front: 'Body-form product of exponentials: the formula, and how $\\mathcal{B}_i$ relates to $\\mathcal{S}_i$?',
    back: '$T(\\theta) = M e^{[\\mathcal{B}_1]\\theta_1} \\cdots e^{[\\mathcal{B}_n]\\theta_n}$, with $\\mathcal{B}_i = [\\mathrm{Ad}_{M^{-1}}]\\mathcal{S}_i$: the same joint axes, written in {b} at the zero configuration. Same joint order; only the side of $M$ changes.',
    tags: ['poe'],
  },
  {
    id: 'kin-f-b-frame-q',
    front: 'Filling a screw-axis table in {b}: what changes from the {s} method?',
    back: 'Write $\\omega$ in {b}’s axes and measure $q$ **from the {b} origin** in {b}’s axes, $q_b = R^T(q_s - p)$; then $v_b = -\\omega_b \\times q_b$ as usual (review deck slide 20). Even when $R = I$ the $v$ column changes, because the origin has moved.',
    tags: ['poe'],
  },
  {
    id: 'kin-f-ang-vel',
    front: 'Angular velocity of a rotating frame $R(t)$, in {s} and in {b}?',
    back: '$[\\omega_s] = \\dot R R^T$ in {s} and $[\\omega_b] = R^T\\dot R$ in {b} (2022 Q24). Euler-angle rates are not the components of $\\omega$: converting them needs an angle-dependent matrix.',
    tags: ['poe', 'mcq'],
  },
  // Pieper
  {
    id: 'kin-f-pieper',
    front: 'Pieper’s criterion: when does a 6-DOF arm have a closed-form IK solution?',
    back: 'When three **consecutive** revolute axes **intersect at one point** (a spherical wrist) **or** are **parallel** (notes §6; review deck slide 19; 2023 Q12). It is sufficient, not necessary.',
    tags: ['pieper', 'mcq'],
  },
  {
    id: 'kin-f-decouple',
    front: 'Why does a spherical wrist make closed-form IK possible?',
    back: 'Rotations about axes through one point leave it fixed, so the wrist centre’s position depends on joints 1–3 only. Step back from the tool to the wrist centre, solve joints 1–3 for that **position**, then joints 4–6 for the remaining **orientation** $R_{\\text{arm}}^TR_d$: two 3-unknown problems instead of one 6-unknown problem.',
    tags: ['pieper'],
  },
  // Numerical IK
  {
    id: 'kin-f-nr',
    front: 'Newton–Raphson IK in four steps?',
    back: '1. Guess $\\theta^0$.\n2. Run FK at $\\theta^k$ and form the error $e = x_d - f(\\theta^k)$ (for a full pose, $\\mathcal{V}_b$ from $\\log(T_{sb}^{-1}T_{sd})$).\n3. Update $\\theta^{k+1} = \\theta^k + J^{\\dagger}(\\theta^k)\\,e$.\n4. Repeat until the error is below the tolerance.',
    tags: ['nr'],
  },
  {
    id: 'kin-f-nr-guess',
    front: 'TRUE or FALSE: Newton–Raphson IK always converges. And what decides which solution it finds?',
    back: '**FALSE** (2022 Q12): it needs a guess close enough to a solution, and it can diverge, oscillate or stall near singularities. The initial guess decides which solution it converges to (elbow up vs elbow down).',
    tags: ['nr', 'mcq'],
  },
  {
    id: 'kin-f-singularity',
    front: 'What is a kinematic singularity, and can a better choice of frames remove one?',
    back: 'A configuration where the Jacobian **loses rank** (2022 Q21): the end-effector cannot move in some direction, and nearby joint speeds blow up. **No** (2022 Q29): changing frames multiplies $J$ by an invertible adjoint, which keeps its rank. Planar 2R: $\\det J = L_1L_2\\sin\\theta_2$, singular at $\\theta_2 = 0$ or $\\pi$.',
    tags: ['nr', 'mcq'],
  },
  {
    id: 'kin-f-jacobian',
    front: 'The Jacobian: what does it map, how is $J_s$ converted to $J_b$, and what is its largest possible rank?',
    back: '$\\mathcal{V} = J(\\theta)\\dot\\theta$: joint velocities to the end-effector twist. $J_b = [\\mathrm{Ad}_{T_{bs}}]J_s$, since every column is a twist (2022 Q27). It is $6 \\times n$, so its rank is at most $\\min(6, n)$: 6 even for a 9-DOF arm (2022 Q26).',
    tags: ['nr', 'mcq'],
  },
  // Arm + camera
  {
    id: 'kin-f-camera',
    front: 'Arm + camera question: where is the camera, which way does it look, and what is $Z$?',
    back: 'At $p$, the last column of $M$ (zero configuration), looking along $\\hat z_b$, the third column. $Z$ is the distance **from the camera** along $\\hat z_b$ to the object, e.g. $5 - 0.4 = 4.6$ m in 2023 Q33. Then $h^{\\prime} = fh/Z$ with every length in metres. Image size goes as $1/Z$: moving 20 m closer in 2024 Q30(d) took the Wheel from 38 mm to $38 \\times 78.95/58.95 = 50.9$ mm.',
    tags: ['camera'],
  },
  {
    id: 'kin-f-dh',
    front: 'Why does the D-H convention need only 4 parameters per link? Does it fix the base and end-effector frames?',
    back: 'Because it imposes **rules** on where each link frame goes ($\\hat x_i$ along the common normal of $\\hat z_{i-1}$ and $\\hat z_i$), which removes 2 of the 6 numbers of a general transform (2022 Q5). The base and end-effector frames remain free choices (2022 Q6). The product of exponentials needs no such rules: only {s}, {b} and the joint axes.',
    tags: ['m', 'mcq'],
  },
];
