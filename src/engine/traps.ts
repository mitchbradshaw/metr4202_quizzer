// Named traps. The first group is the summary notes' "traps that cost marks" checklist.
import type { TrapDef } from './types';

export const CORE_TRAPS: TrapDef[] = [
  { id: 'units', title: 'Hz vs rad/s vs rpm', detail: '“Critical speed” means natural frequency. rpm ÷ 60 → Hz, × 2π → rad/s. “ω₁ (Hz)” means f₁.' },
  { id: 'absorber-lower-binds', title: 'Absorber β = 1: the lower frequency binds', detail: 'With $\\beta = 1$, $r_1 r_2 = 1$, so the lower new frequency is the binding constraint.' },
  { id: 'modal-ic-pinv', title: 'Modal ICs use P⁻¹, not Pᵀ', detail: '$Y_0 = P^{-1} X_0$. $P^T X_0$ is only right for mass-normalised modes and $M = I$.' },
  { id: 'damped-peak-shift', title: 'Damped peaks move off ωn', detail: 'Force-response and transmissibility peaks fall slightly below $\\omega_n$; the relative-deflection peak sits above it. Say which one you quote.' },
  { id: 'damping-above-root2', title: 'Damping hurts isolation above r = √2', detail: 'More damping raises the transmissibility for $r > \\sqrt2$.' },
  { id: 'matlab-unsorted', title: 'MATLAB eig output is unsorted', detail: 'Order the modes by $|s|$ (or $\\omega$), not by column position.' },
  { id: 'mode-scale', title: 'Mode shapes: only ratios matter', detail: 'Sign and scale of a mode shape are arbitrary.' },
  { id: 'rod-diameter', title: 'Rods/shafts: ω independent of diameter', detail: 'Uniform rods and shafts: frequencies do not depend on diameter. Thin tubes in bending: $\\omega \\propto d$, independent of $t$, but deflection depends on $t$.' },
  { id: 'node-no-effect', title: 'Force or mass at a node: no effect on that mode', detail: 'A force at a node does not excite that mode; a mass at a node does not change its frequency.' },
  { id: 'rigid-modes', title: 'Unrestrained ⇒ ω = 0 rigid-body modes', detail: 'Count them when asked to include rigid-body modes.' },
  { id: 'bounds-order', title: 'Dunkerley ≤ exact ≤ Rayleigh', detail: 'Holzer finds all modes of a lumped model; FEM converges with refinement.' },
  { id: 'unbalance-omega2', title: 'Unbalance force grows as Ω²', detail: 'Compare speeds with force × dynamic factor, not the dynamic factor alone.' },
  { id: 'word-limit', title: 'Word limits: key fact first', detail: 'Give the key fact and the reason in the first sentence.' },
  { id: 'read-the-stem', title: 'Correct vs incorrect vs most correct', detail: 'Re-read the instruction before choosing.' },
  // Generic answer-checking traps
  { id: 'unit-scale', title: 'Unit scale (mm vs m, g vs kg)', detail: 'An answer off by 10³ usually means a unit slipped.' },
  { id: 'percent', title: 'Percent vs fraction', detail: 'Off by 100: give a fraction when asked for a ratio, a percentage when asked for %.' },
  { id: 'sqrt', title: 'Missing or extra square root', detail: 'e.g. quoting $\\omega^2$ instead of $\\omega$, or $k/m$ instead of $\\sqrt{k/m}$.' },
  { id: 'sign', title: 'Sign convention', detail: 'Right magnitude, wrong sign: check the positive directions you chose.' },
  { id: 'factor2', title: 'Factor of 2', detail: 'Common sources: ½ in energy, $2\\zeta$, $c_c = 2\\sqrt{km}$, cross terms in $V = \\tfrac12 q^TKq$.' },
  { id: 'symmetry', title: 'M and K must be symmetric', detail: 'From quadratic forms, $K_{ij} = K_{ji}$.' },
  { id: 'offdiag-sign', title: 'Off-diagonal sign', detail: 'The sign of a coupling term follows your coordinate directions.' },
  { id: 'offdiag-factor2', title: 'Cross terms counted twice', detail: 'In $V = \\tfrac12 q^T K q$ a term $c\\,x\\theta$ gives $K_{12} = K_{21} = c$, not $c/2$ or $2c$.' },
  { id: 'lever-arm', title: 'Spring deflection = translation + rotation × lever arm', detail: 'Elastic energy cannot be split into translational and rotational parts.' },
  { id: 'parallel-axis', title: 'Parallel-axis theorem', detail: '$I_O = I_G + m d^2$; a rod about its end is $m\\ell^2/3$.' },
  { id: 'beta-not-1', title: 'Compute β; don’t assume β = 1', detail: 'When the stiffness and mass ratios are both given, compute $\\beta = \\omega_{22}/\\omega_{11}$ first.' },
  { id: 'force-vs-base', title: 'Force vs base excitation, absolute vs relative', detail: 'Decide which excitation it is and whether the question wants absolute or relative motion.' },
];

const extra = new Map<string, TrapDef>();

export function registerTraps(defs: TrapDef[] | undefined) {
  for (const d of defs || []) if (!extra.has(d.id)) extra.set(d.id, d);
}

export function trapById(id: string): TrapDef | undefined {
  return CORE_TRAPS.find((t) => t.id === id) || extra.get(id);
}

export function allTraps(): TrapDef[] {
  return [...CORE_TRAPS, ...extra.values()];
}
