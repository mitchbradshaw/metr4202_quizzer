// Kinematics exam-mode traps that have no core entry in src/engine/traps.ts (the trap log shows them by title).
// Imported for its side effect by every kin solve generator file.
import { registerTraps } from '../../../engine/traps';

registerTraps([
  {
    id: 'kin-r-rows',
    title: 'The {b} axes are the columns of R',
    detail: 'Write $\\hat x_b, \\hat y_b, \\hat z_b$ (each in $\\{s\\}$ coordinates) as the **columns** of $R$. $R^T$ also has $\\det = +1$, so the determinant cannot catch this slip.',
  },
  {
    id: 'kin-arrow-sense',
    title: 'Read the curved arrow with the right-hand rule',
    detail: 'Curl the fingers of your right hand along the drawn arrow: your thumb points along $\\omega$. Reversing $\\omega$ reverses $v$ too.',
  },
  {
    id: 'kin-omega-flip-only',
    title: 'Flipping ω flips v',
    detail: '$v = -\\omega \\times q$ is linear in $\\omega$: change the sign of $\\omega$ and the sign of $v$ changes with it.',
  },
  {
    id: 'kin-prismatic-omega',
    title: 'A prismatic joint has ω = 0',
    detail: 'It only translates: $S = (0, v)$ with $v$ the unit direction of travel (the straight arrow).',
  },
  {
    id: 'kin-poe-order',
    title: 'PoE: rotate about the zero-configuration axes, outermost joint first',
    detail: 'In $T = e^{[S_1]\\theta_1} \\cdots e^{[S_n]\\theta_n} M$ every $S_i$ is the axis at the **zero** configuration. Apply $e^{[S_n]\\theta_n}$ to $M$ first, then work inwards to joint 1.',
  },
  {
    id: 'kin-jacobian-moved',
    title: 'J_si is joint i’s axis where it is NOW',
    detail: 'Column $i$ of the space Jacobian is $\\mathrm{Ad}_{e^{[S_1]\\theta_1}\\cdots e^{[S_{i-1}]\\theta_{i-1}}}(S_i)$: the screw axis of joint $i$ after the joints before it have moved it. Only joints $1 \\ldots i-1$ matter.',
  },
  {
    id: 'kin-camera-straight-line',
    title: 'Depth is along the optical axis, not the straight-line distance',
    detail: '$Z$ in $h\' = fh/Z$ is the component of (object − camera) along $\\hat z_b$. An object off the axis (e.g. standing on the floor below the camera height) is not at depth $\\lVert X - p \\rVert$.',
  },
  {
    id: 'kin-camera-offset',
    title: 'Distance from the base = depth + the camera’s offset along the line of sight',
    detail: 'The pinhole gives the depth from the **camera**. The base is $p \\cdot \\hat z_b$ further back (or forward) along the viewing direction.',
  },
]);
