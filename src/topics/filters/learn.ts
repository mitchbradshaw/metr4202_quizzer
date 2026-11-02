// Concept cards and flashcards for 'filters' (summary notes §2; 2023 Q4, Q5, Q22; 2024 Q4, Q5; 2025 Q4, Q5;
// review deck slides 5–6: how the KF implements the Bayes filter, why the EKF and the PF, and when to pick each).
// Card ids filters-kf, filters-ekf, filters-pf and filters-compare are fixed (sims and generators link to them).
// Every worked number below was recomputed by script (see the progress note of the filters-content agent).
import type { ConceptCard, Flashcard } from '../../engine/types';

export const cards: ConceptCard[] = [
  // ------------------------------------------------------------------ Kalman filter
  {
    id: 'filters-kf',
    title: 'Kalman filter: the Bayes filter with one Gaussian',
    lecture: 'Notes §2; review deck slides 5–6',
    formulas: [
      '$$x_t = A_t x_{t-1} + B_t u_t + \\varepsilon_t,\\ \\ \\varepsilon_t \\sim \\mathcal{N}(0, R_t), \\qquad z_t = C_t x_t + \\delta_t,\\ \\ \\delta_t \\sim \\mathcal{N}(0, Q_t)$$',
      '$$\\textbf{predict:}\\quad \\bar\\mu_t = A_t\\mu_{t-1} + B_t u_t, \\qquad \\bar\\Sigma_t = A_t\\Sigma_{t-1}A_t^T + R_t$$',
      '$$\\textbf{correct:}\\quad \\begin{gathered} K_t = \\bar\\Sigma_t C_t^T\\,(C_t\\bar\\Sigma_t C_t^T + Q_t)^{-1} \\\\ \\mu_t = \\bar\\mu_t + K_t\\,(z_t - C_t\\bar\\mu_t), \\qquad \\Sigma_t = (I - K_tC_t)\\,\\bar\\Sigma_t \\end{gathered}$$',
      '$$\\text{1-D } (A = B = C = 1):\\qquad \\begin{gathered} \\bar\\mu_t = \\mu_{t-1} + u_t, \\qquad \\bar\\sigma_t^2 = \\sigma_{t-1}^2 + R \\\\ K = \\frac{\\bar\\sigma_t^2}{\\bar\\sigma_t^2 + Q}, \\qquad \\mu_t = \\bar\\mu_t + K\\,(z_t - \\bar\\mu_t), \\qquad \\sigma_t^2 = (1 - K)\\,\\bar\\sigma_t^2 \\end{gathered}$$',
    ],
    what: 'The Kalman filter (KF) is the Bayes filter of §1 for one special case: **linear** motion and sensor models with additive zero-mean **Gaussian** noise, and a Gaussian initial belief. A Gaussian pushed through a linear model stays Gaussian, and a Gaussian prediction multiplied by a Gaussian likelihood is again Gaussian, so the belief is one Gaussian for ever, $bel(x_t) = \\mathcal{N}(\\mu_t, \\Sigma_t)$, and the filter only has to carry a mean and a covariance.\n\n**Prediction** moves the mean with the motion model and *adds* the actuation noise $R$, so the uncertainty grows. **Correction** moves the mean a fraction $K$ of the way along the innovation $z_t - C_t\\bar\\mu_t$ (the reading minus the reading the prediction expected) and shrinks the covariance. The Kalman gain $K$ is the **trust dial**: it weighs the predicted uncertainty $C\\bar\\Sigma C^T$ against the sensor noise $Q$. Because $Q$ sits inside $K$, and $K$ appears in both the mean update and the covariance update, changing the sensor noise changes **both** the mean and the variance of the estimate.',
    when: '- “A Bayes filter implemented as a single multivariate Gaussian for a linear system is a …” (2023 Q4); “A Kalman filter represents the state as …” (2025 Q4).\n- “What is the effect on the Kalman filter estimate if you change the noise in your sensor model?” (2024 Q5, 2025 Q5).\n- “Explain how Kalman filters implement Bayes filtering” (review deck slide 5, learning outcome).\n- A 1-D predict-then-correct by hand (exam mode, below).',
    how: [
      'Name the representation first: one Gaussian, $\\mathcal{N}(\\mu, \\Sigma)$. Then the assumptions that keep it Gaussian: linear models and additive zero-mean Gaussian noise.',
      'Label the givens. $R$ is the **actuation** (process) noise and is added in the prediction; $Q$ is the **sensor** noise and appears only in the gain. A noise quoted as a standard deviation must be squared: “±0.3 m” means $Q = 0.09\\ \\text{m}^2$.',
      'Predict: $\\bar\\mu = A\\mu + Bu$ and $\\bar\\Sigma = A\\Sigma A^T + R$ (in 1-D, $\\bar\\sigma^2 = A^2\\sigma^2 + R$). The variance can only grow here.',
      'Gain: $K = \\bar\\Sigma C^T(C\\bar\\Sigma C^T + Q)^{-1}$. In 1-D with $C = 1$ it is $K = \\bar\\sigma^2/(\\bar\\sigma^2 + Q)$, between 0 (ignore the sensor) and 1 (believe it completely).',
      'Correct: $\\mu = \\bar\\mu + K(z - C\\bar\\mu)$ and $\\Sigma = (I - KC)\\bar\\Sigma$. Check: with $C = 1$ the new mean lies between $\\bar\\mu$ and $z$, and the new variance is below both $\\bar\\sigma^2$ and $Q$.',
      'For “what changes if …?” questions, trace where the quantity enters: $R$ → $\\bar\\Sigma$ → $K$ → mean and variance; $Q$ → $K$ → mean **and** variance; the reading $z$ → the mean only (there is no $z$ in the covariance equations).',
    ],
    traps: [
      {
        title: 'Swapping R and Q',
        detail: 'In the course (Thrun) notation $R$ is the actuation noise, added in $\\bar\\Sigma = A\\Sigma A^T + R$, and $Q$ is the sensor noise, inside $K$. Some textbooks use the opposite letters, so read which noise the question describes, not just its letter.',
        trapId: 'r-vs-q',
        source: 'Notes §2',
      },
      {
        title: '“Changing the sensor noise only changes the variance”',
        detail: '$Q$ changes $K$, and $K$ scales the step $K(z - C\\bar\\mu)$ of the mean as well as the shrinkage of $\\Sigma$. Both change: the key of 2024 Q5 and 2025 Q5.',
        source: '2024 Q5, 2025 Q5',
      },
      {
        title: 'Using a standard deviation as a variance',
        detail: '$R$, $Q$ and $\\Sigma$ are (co)variances. A sensor “accurate to 0.3 m” (one standard deviation) has $Q = 0.09\\ \\text{m}^2$; plugging in 0.3 overstates the sensor variance more than threefold and makes the gain far too small.',
        trapId: 'sqrt',
      },
      {
        title: 'Computing the gain with the old variance',
        detail: 'The gain uses the **predicted** $\\bar\\Sigma_t$, after $R$ has been added. Using $\\Sigma_{t-1}$ skips the growth in uncertainty, so the filter trusts its prediction more than it should.',
      },
      {
        title: 'Naming the EKF for a linear system',
        detail: 'An EKF on linear models reduces to the KF ($G = A$, $H = C$), but the filter for “one Gaussian, linear system” is the Kalman filter; the EKF exists for nonlinear models.',
        source: '2023 Q4',
      },
    ],
    more: '**Worked 1-D example.** A robot on a rail believes $x \\sim \\mathcal{N}(2.0\\ \\text{m},\\ 0.04\\ \\text{m}^2)$. It is commanded 1.0 m forward with actuation noise $R = 0.05\\ \\text{m}^2$; then a sensor with $Q = 0.09\\ \\text{m}^2$ reads $z = 3.3$ m.\n\n$$\\begin{array}{l|l} \\text{predict} & \\bar\\mu = 2.0 + 1.0 = 3.0\\ \\text{m}, \\qquad \\bar\\sigma^2 = 0.04 + 0.05 = 0.09\\ \\text{m}^2 \\\\ \\text{gain} & K = 0.09 / (0.09 + 0.09) = 0.5 \\\\ \\text{correct} & \\mu = 3.0 + 0.5\\,(3.3 - 3.0) = 3.15\\ \\text{m}, \\qquad \\sigma^2 = (1 - 0.5)(0.09) = 0.045\\ \\text{m}^2 \\end{array}$$\n\nMake the sensor four times noisier ($Q = 0.36$): $K = 0.2$, $\\mu = 3.06$ m and $\\sigma^2 = 0.072\\ \\text{m}^2$. Both numbers moved (2024 Q5). Keep $Q = 0.09$ but let the reading be 3.6 m instead: $\\mu = 3.3$ m, while $\\sigma^2$ is still $0.045\\ \\text{m}^2$, because $z$ never enters the covariance equations.\n\n**Why the belief stays Gaussian.** Prediction adds independent Gaussian noise to a linearly transformed Gaussian, and the variances add. Correction multiplies the predicted Gaussian by the Gaussian likelihood $p(z \\mid x)$, and a product of Gaussians is a Gaussian whose precisions (inverse variances) add. A nonlinear model breaks the first fact, which is why the EKF exists.\n\n**Optimal and cheap.** Under its assumptions the KF *is* the exact Bayes filter, so no estimator can do better (it gives the minimum mean-square error). Each step costs a few small matrix products and one inversion of a matrix the size of the measurement. With constant $A$, $C$, $R$ and $Q$, $\\Sigma$ and $K$ do not depend on the readings at all; they settle to steady-state values (above, $K \\to 0.52$) that could be computed before the robot moves.',
    exploreIds: ['kf1d'],
    solveIds: ['filters-kf'],
  },

  // ------------------------------------------------------------------ the gain as a trust dial
  {
    id: 'filters-gain',
    title: 'The gain as a trust dial: what R and Q do',
    lecture: 'Notes §2 (“the gain K is the trust dial”); 2024 Q5, 2025 Q5',
    formulas: [
      '$$K = \\frac{\\bar\\sigma^2}{\\bar\\sigma^2 + Q} = \\frac{\\text{prediction variance}}{\\text{prediction variance} + \\text{sensor variance}}, \\qquad 0 \\le K \\le 1 \\quad (C = 1)$$',
      '$$\\mu = \\frac{Q\\,\\bar\\mu + \\bar\\sigma^2 z}{\\bar\\sigma^2 + Q}, \\qquad \\frac{1}{\\sigma^2} = \\frac{1}{\\bar\\sigma^2} + \\frac{1}{Q} \\;\\Rightarrow\\; \\sigma^2 = \\frac{\\bar\\sigma^2 Q}{\\bar\\sigma^2 + Q} < \\min(\\bar\\sigma^2,\\, Q)$$',
      '$$\\begin{array}{l|ccc} \\text{change} & K & \\text{step towards } z & \\text{posterior variance} \\\\ \\hline Q \\uparrow \\ (\\text{noisier sensor}) & \\downarrow & \\text{smaller} & \\uparrow \\\\ R \\uparrow \\ (\\text{more slip}) & \\uparrow & \\text{larger} & \\uparrow \\\\ \\text{only } z \\text{ changes} & \\text{same} & \\text{moves with } z & \\text{same} \\\\ Q \\to 0 & 1 & \\mu = z & 0 \\\\ Q \\to \\infty & 0 & \\mu = \\bar\\mu & \\bar\\sigma^2 \\end{array}$$',
    ],
    what: 'The gain decides how far the estimate moves towards each reading. In 1-D it is the prediction’s share of the total uncertainty, $K = \\bar\\sigma^2/(\\bar\\sigma^2 + Q)$. If the prediction is uncertain compared with the sensor, $K$ is near 1 and the estimate jumps to the reading; if the sensor is the noisier one, $K$ is near 0 and the estimate barely moves. Written out, the corrected mean is a **precision-weighted average** of the prediction and the reading, and the precisions add, so the result is always more certain than either source alone.\n\n$Q$ acts on the gain directly; $R$ acts through $\\bar\\sigma^2 = \\sigma^2 + R$. The reading itself never changes $K$: a surprising reading moves the mean further, but it is trusted by the same fraction.',
    when: '- “What is the effect on the Kalman filter estimate if you change the noise in your sensor model?” (2024 Q5, 2025 Q5).\n- Any “double $Q$”, “the wheels start slipping” or “the sensor is replaced by a better one” question, and any plot where the estimate lags the truth or jitters with the readings.\n- Explaining why fusing a prediction with a reading, or two overlapping sensors (2024 Q22), reduces the uncertainty.',
    how: [
      'Write the 1-D gain $K = \\bar\\sigma^2/(\\bar\\sigma^2 + Q)$ and ask which term the change touches: $R$ changes $\\bar\\sigma^2 = \\sigma^2 + R$; $Q$ is in the denominator; $z$ is in neither.',
      'Read off $K$: a larger $\\bar\\sigma^2$ (more slip, a long gap since the last reading, a vague initial belief) raises $K$; a larger $Q$ (a noisier sensor) lowers it.',
      'Then the mean: $\\mu = \\bar\\mu + K(z - \\bar\\mu)$ moves a fraction $K$ of the way from the prediction to the reading.',
      'Then the variance: $\\sigma^2 = (1 - K)\\bar\\sigma^2 = \\bar\\sigma^2 Q/(\\bar\\sigma^2 + Q)$. It grows with both $\\bar\\sigma^2$ and $Q$, and is always below both.',
      'Diagnose a plot: an estimate that lags behind real motion trusts its model too much ($R$ too small or $Q$ too large); one that jitters with every reading trusts the sensor too much ($Q$ too small or $R$ too large).',
    ],
    traps: [
      {
        title: '“A surprising reading is trusted more”',
        detail: 'The KF gain contains no $z$. A large innovation $z - \\bar\\mu$ moves the mean further, but by the same fraction $K$. (Rejecting outliers needs an extra gate on top of the KF, e.g. ignoring readings more than three standard deviations from the prediction.)',
      },
      {
        title: 'Making R tiny to get a smooth estimate',
        detail: 'With $R \\approx 0$ the variance keeps shrinking, $K \\to 0$, and the filter stops listening: when the robot slips, the estimate lags behind and can diverge. An overconfident filter is worse than a noisy one.',
      },
      {
        title: 'Expecting the fused variance to lie between the two',
        detail: 'Fusing does not average the variances: $1/\\sigma^2 = 1/\\bar\\sigma^2 + 1/Q$, so the result is below both. Two equal variances give half, not the same value.',
        source: '2024 Q22 (overlapping sensors)',
      },
      {
        title: 'Expecting K ≤ 1 in every filter',
        detail: 'Only the 1-D gain with $C = 1$ is a pure fraction in $[0, 1]$. In 1-D with any $C$ it is the product $KC$ that lies in $[0, 1]$; $K$ alone carries units of state per unit of reading and can exceed 1 when $C$ is below 1. The EKF range example (Jacobian $H = 0.894$) has $K = 1.065$ but $KH = 0.952$.',
      },
    ],
    more: '**Limits that settle MCQs.** $Q \\to 0$ (perfect sensor): $K \\to 1$, $\\mu = z$ and $\\sigma^2 \\to 0$. $Q \\to \\infty$ (useless sensor): $K = 0$, the correction does nothing, and $\\sigma^2$ grows by $R$ every step, exactly as in prediction-only dead reckoning.\n\n**Steady state.** With constant $R$ and $Q$ the variance converges to where the growth from $R$ in each prediction balances the shrinkage in each correction, and $K$ settles to a constant. A larger $R/Q$ gives a larger steady gain: a responsive but noisy estimate. A smaller $R/Q$ gives a smooth estimate that is slow to notice real changes. Tuning a real filter is choosing this trade-off.\n\n**The same dial in the other filters.** In an EKF the gain has the same form with the Jacobian $H$ in place of $C$. A particle filter has no gain: a noisier sensor model makes the likelihood $p(z \\mid x)$ wider, so the weights are more even and the cloud shrinks less, while too narrow a likelihood gives almost every particle a weight near zero at once (particle deprivation).',
    exploreIds: ['kf1d'],
    solveIds: ['filters-kf'],
  },

  // ------------------------------------------------------------------ EKF
  {
    id: 'filters-ekf',
    title: 'Extended Kalman filter: linearise at the mean',
    lecture: 'Notes §2; review deck slides 5–6',
    formulas: [
      '$$x_t = g(u_t, x_{t-1}) + \\varepsilon_t, \\quad z_t = h(x_t) + \\delta_t, \\qquad G_t = \\left.\\frac{\\partial g}{\\partial x}\\right|_{u_t,\\,\\mu_{t-1}}, \\quad H_t = \\left.\\frac{\\partial h}{\\partial x}\\right|_{\\bar\\mu_t}$$',
      '$$\\textbf{predict:}\\quad \\bar\\mu_t = g(u_t, \\mu_{t-1}), \\qquad \\bar\\Sigma_t = G_t\\Sigma_{t-1}G_t^T + R_t$$',
      '$$\\textbf{correct:}\\quad \\begin{gathered} K_t = \\bar\\Sigma_t H_t^T\\,(H_t\\bar\\Sigma_t H_t^T + Q_t)^{-1} \\\\ \\mu_t = \\bar\\mu_t + K_t\\,\\big(z_t - h(\\bar\\mu_t)\\big), \\qquad \\Sigma_t = (I - K_tH_t)\\,\\bar\\Sigma_t \\end{gathered}$$',
      '$$\\text{e.g. a straight step: } g = \\begin{bmatrix} x + v\\Delta t\\cos\\theta \\\\ y + v\\Delta t\\sin\\theta \\\\ \\theta + \\omega\\Delta t \\end{bmatrix} \\;\\Rightarrow\\; G_t = \\begin{bmatrix} 1 & 0 & -v\\Delta t\\sin\\mu_\\theta \\\\ 0 & 1 & v\\Delta t\\cos\\mu_\\theta \\\\ 0 & 0 & 1 \\end{bmatrix}$$',
    ],
    what: 'Real robots are nonlinear: the heading enters the motion through $\\cos\\theta$ and $\\sin\\theta$, a range reading is a square root and a bearing an $\\operatorname{atan2}$. A Gaussian pushed through a nonlinear function is no longer Gaussian (drive forward with an uncertain heading and the true cloud bends into a banana), so the KF equations no longer describe the belief.\n\nThe **extended** Kalman filter keeps the single Gaussian anyway and **linearises**: it replaces $g$ and $h$ by their first-order Taylor expansions (tangent lines and planes) **at the current mean**. The means still go through the full nonlinear functions; only the covariances and the gain use the Jacobians $G_t$ and $H_t$, which are recomputed every step. The result is an approximation that is good when the models are nearly linear over the spread of the belief, and can fail badly when they are not.',
    when: '- “Explain the motivation for extended Kalman filters and describe how they are implemented” (review deck slide 5).\n- “KF vs EKF vs PF: when would you pick each?” (review deck slide 6): the EKF answers mildly nonlinear models, a unimodal belief and a good initial guess (odometry + GPS, EKF-SLAM).\n- An MCQ distractor: the EKF is the filter for nonlinear systems, not the name for the linear one (2023 Q4).',
    how: [
      'Say why: the motion model $g$ or the sensor model $h$ is nonlinear, so a Gaussian belief does not stay Gaussian and the KF does not apply.',
      'Say how: linearise by a first-order Taylor expansion about the current estimate, $G_t = \\partial g/\\partial x$ at $\\mu_{t-1}$ (prediction) and $H_t = \\partial h/\\partial x$ at $\\bar\\mu_t$ (correction).',
      'Run the KF equations with two changes: means through the real functions ($\\bar\\mu_t = g(u_t, \\mu_{t-1})$, innovation $z_t - h(\\bar\\mu_t)$), covariances through the Jacobians ($G_t$ in place of $A$, $H_t$ in place of $C$).',
      'Recompute the Jacobians every step, because the mean they are evaluated at keeps moving.',
      'Finish with the limits: still one Gaussian (no multiple hypotheses), only approximate, and it can diverge when the nonlinearity is strong over the spread of the belief or the initial guess is poor.',
    ],
    traps: [
      {
        title: 'Pushing the mean through the Jacobian',
        detail: '$\\bar\\mu_t = G_t\\mu_{t-1}$ is wrong: the mean goes through $g$ itself, and the innovation is $z_t - h(\\bar\\mu_t)$, not $z_t - H_t\\bar\\mu_t$. The Jacobians only propagate the covariance and form the gain.',
      },
      {
        title: 'Linearising at the wrong point',
        detail: 'The Jacobians are evaluated at the current estimate ($\\mu_{t-1}$ for $G$, $\\bar\\mu_t$ for $H$): the true state is unknown, and a measurement is not a state. So a poor estimate means a poor linearisation, which is how an EKF diverges from a bad initial guess.',
      },
      {
        title: '“It handles nonlinearity, so it handles several hypotheses”',
        detail: 'Nonlinear models are allowed, but the belief is still one Gaussian with one peak. Two equally good hypotheses (two identical doorways) need a particle filter or a mixture of Gaussians.',
      },
      {
        title: '“The EKF is exact for nonlinear systems”',
        detail: 'It is exact only when the models are linear, and then it *is* the KF. Otherwise its mean and covariance are first-order approximations, and its covariance tends to be too small (overconfident).',
      },
    ],
    more: '**Why it fails, in one example.** A robot on the $x$-axis measures its range to a beacon at $(0, 1)$ m: $h(x) = \\sqrt{x^2 + 1}$, so $H = x/\\sqrt{x^2 + 1}$.\n\n- At $\\bar\\mu = 2$ m, with $\\bar\\sigma^2 = 0.25\\ \\text{m}^2$, $Q = 0.01\\ \\text{m}^2$ and $z = 2.5$ m: $h(\\bar\\mu) = 2.236$ m and $H = 0.894$, so $K = \\bar\\sigma^2 H/(H^2\\bar\\sigma^2 + Q) = 1.065$, $\\mu = 2 + 1.065\\,(0.264) = 2.281$ m and $\\sigma^2 = (1 - KH)\\,\\bar\\sigma^2 = 0.0119\\ \\text{m}^2$. The exact position for a noise-free reading is $\\sqrt{2.5^2 - 1} = 2.291$ m: close, because $h$ is nearly straight over $\\pm 0.5$ m.\n- At $\\bar\\mu = 0$ the slope is $H = 0$, so $K = 0$ and the EKF ignores the reading completely, although $z = 2.5$ m says $|x| \\approx 2.29$ m. The true posterior has two peaks, at $\\pm 2.29$ m: no single Gaussian can hold it, and the linearised one does not even move.\n\n**The banana.** Drive straight with an uncertain heading and the reachable positions lie along an arc. The EKF’s ellipse comes from the tangent model, so it pokes out beyond the arc and cannot bend, and the error grows with the heading uncertainty. Particles fill the banana as it is.\n\n**Typical uses.** Odometry fused with GPS or an IMU, and EKF-SLAM with a few distinct landmarks: smooth models, uncertainty small compared with the curvature, one obvious hypothesis. (Beyond the notes: the unscented KF pushes a few chosen “sigma points” through $g$ and $h$ instead of using Jacobians, which copes with stronger nonlinearity at a similar cost.)',
    exploreIds: ['ekf'],
    solveIds: ['filters-choice'],
  },

  // ------------------------------------------------------------------ particle filter
  {
    id: 'filters-pf',
    title: 'Particle filter: sample, weight, resample',
    lecture: 'Notes §2; 2023 Q5, Q22; review deck slides 5–6',
    formulas: [
      '$$bel(x_t) \\approx \\big\\{\\, x_t^{[m]},\\; w_t^{[m]} \\,\\big\\}_{m=1}^{M}$$',
      '$$\\begin{aligned} &\\textbf{1. sample:} && x_t^{[m]} \\sim p(x_t \\mid u_t,\\, x_{t-1}^{[m]}) \\\\ &\\textbf{2. weight:} && w_t^{[m]} = p(z_t \\mid x_t^{[m]}), \\qquad \\tilde w_t^{[m]} = w_t^{[m]} \\Big/ \\textstyle\\sum_{j} w_t^{[j]} \\\\ &\\textbf{3. resample:} && \\text{draw } M \\text{ particles with replacement, } \\Pr(\\text{pick } m) = \\tilde w_t^{[m]} \\end{aligned}$$',
      '$$\\text{expected copies of particle } m = M\\,\\tilde w^{[m]}, \\qquad N_{\\text{eff}} = \\frac{1}{\\sum_m \\big(\\tilde w^{[m]}\\big)^2} \\quad (\\text{resample when it falls below about } M/2)$$',
    ],
    what: 'A particle filter (PF) represents the belief by $M$ samples called particles: each is one complete guess of the state, and where they crowd together the belief is high. Each step runs the Bayes filter on the samples.\n\n- **Sample** (prediction): move every particle through the motion model with randomly drawn noise, so the cloud spreads.\n- **Weight** (correction): give each particle the likelihood of the actual reading if the robot were there, $w^{[m]} = p(z_t \\mid x_t^{[m]})$.\n- **Resample**: draw $M$ new particles with replacement in proportion to the weights, so unlikely guesses die out and likely ones are copied.\n\nBecause it assumes no shape, a PF can hold any belief: several separate hypotheses, a banana, a ring. It needs no linearisation; any motion model you can sample from and any sensor model you can evaluate will do. The price is computation: the number of particles needed grows exponentially with the dimension of the state.',
    when: '- “A Bayes filter implemented as a distribution of samples is a …” (2024 Q4).\n- “In the resampling step of a particle filter, the samples are weighted according to …” (2023 Q5: the sensor likelihood).\n- “Identify one benefit of particle filters for state estimation and SLAM over Kalman-filter-based methods” (2023 Q22, 1 mark).\n- “Explain the motivation for particle filters and describe how they are implemented” (review deck slide 5); global localisation, the kidnapped robot, FastSLAM.',
    how: [
      'Name the representation: $M$ weighted samples of the state, with no assumed shape.',
      'Sample: push each particle through the motion model, **drawing** fresh noise for each one. This is the prediction; identical particles become different.',
      'Weight: evaluate the sensor model at each particle for the reading actually received, $w^{[m]} = p(z_t \\mid x_t^{[m]})$, then normalise so the weights sum to 1.',
      'Resample: draw $M$ particles with replacement with probability $\\tilde w^{[m]}$. By hand, use the cumulative weights and one random number per draw, or the low-variance version with $M$ evenly spaced pointers. Particle $m$ gets about $M\\tilde w^{[m]}$ copies.',
      'Read the belief off the cloud: the densest cluster, or the weighted mean if there is only one cluster.',
      'For “one benefit over a KF” (1 mark): multimodal, non-Gaussian beliefs and nonlinear models **without linearisation**, plus an example (global localisation, the kidnapped robot, per-particle data association in FastSLAM).',
    ],
    traps: [
      {
        title: 'Weighting by the prior, the control or the posterior',
        detail: 'The weight is the **sensor likelihood** $p(z_t \\mid x_t^{[m]})$: how well this particle explains the reading. The prior is already represented by where the particles are, and the control was used to move them.',
        source: '2023 Q5',
      },
      {
        title: 'Resampling with unnormalised weights',
        detail: 'Selection probabilities must sum to 1: divide each weight by the total first. (Likelihoods are densities and need not sum to 1, or even be below 1.)',
        trapId: 'normalise',
      },
      {
        title: 'Averaging a multimodal cloud',
        detail: 'With two clusters (two identical doorways), the weighted mean can land between them, inside a wall. Report the best cluster, or keep the hypotheses apart.',
      },
      {
        title: 'Particle deprivation',
        detail: 'Resampling can only copy particles that exist. If none is near the true state (too few particles, a very peaked likelihood, resampling after every reading, or a kidnapped robot), the filter cannot recover. Fixes: more particles, resampling only when $N_{\\text{eff}}$ is low, low-variance resampling, and injecting a few random particles.',
      },
      {
        title: '“Just add particles”',
        detail: 'Covering a $d$-dimensional state with $k$ samples per axis takes about $k^d$ particles, so the cost explodes with dimension. FastSLAM samples only the robot path and handles each landmark with a small EKF.',
      },
    ],
    more: '**Worked weights: a corridor with three doors.** Five particles, three of them in front of a door. The robot sees a door; the sensor model gives $p(\\text{door} \\mid \\text{at a door}) = 0.8$ and $p(\\text{door} \\mid \\text{at a wall}) = 0.1$.\n\n$$\\begin{array}{c|ccccc} m & 1 & 2 & 3 & 4 & 5 \\\\ \\hline \\text{position} & \\text{door A} & \\text{door B} & \\text{wall} & \\text{door C} & \\text{wall} \\\\ w = p(z \\mid x^{[m]}) & 0.8 & 0.8 & 0.1 & 0.8 & 0.1 \\\\ \\tilde w = w / 2.6 & 0.308 & 0.308 & 0.038 & 0.308 & 0.038 \\\\ \\text{cumulative} & 0.308 & 0.615 & 0.654 & 0.962 & 1.000 \\\\ M\\tilde w & 1.54 & 1.54 & 0.19 & 1.54 & 0.19 \\end{array}$$\n\nLow-variance resampling with one random start $r = 0.1$ and pointers $0.1, 0.3, 0.5, 0.7, 0.9$ (each picks the first particle whose cumulative weight reaches it) selects particles 1, 1, 2, 4, 4. The wall particles die and **three** door hypotheses survive: a multimodal belief that no single Gaussian could hold. The next distinctive reading will thin them out.\n\n**Why the weight is the likelihood.** The particles were drawn from the prediction $\\overline{bel}(x_t)$, but we want samples of $bel(x_t) = \\eta\\, p(z_t \\mid x_t)\\, \\overline{bel}(x_t)$. Importance sampling corrects the mismatch with weight $=$ target $/$ proposal $= \\eta\\, p(z_t \\mid x_t)$.\n\n**Global localisation and the kidnapped robot.** Monte Carlo localisation (MCL) is the PF used for localisation in a known map. Start with particles spread uniformly over the free space and they condense onto the true pose as readings arrive; in a symmetric building several clusters survive until something breaks the symmetry. A KF cannot even begin, since it needs one Gaussian initial guess. If a converged robot is picked up and moved (kidnapped), no particle is near the new pose; injecting a few random particles every step, more when the average likelihood drops, lets it recover.\n\n**FastSLAM** uses particles for the robot path and, inside each particle, one small EKF per landmark. Each particle makes its own data associations, so wrong ones die out at resampling.',
    exploreIds: ['pf'],
    solveIds: ['filters-pf'],
  },

  // ------------------------------------------------------------------ which filter?
  {
    id: 'filters-compare',
    title: 'KF, EKF or PF? Choosing a filter',
    lecture: 'Notes §2 (filter table); review deck slide 6',
    formulas: [
      '$$\\begin{array}{l|l|l} & \\text{belief} & \\text{models allowed} \\\\ \\hline \\text{KF} & \\text{one Gaussian } \\mathcal{N}(\\mu, \\Sigma) & \\text{linear, Gaussian noise} \\\\ \\text{EKF} & \\text{one Gaussian } \\mathcal{N}(\\mu, \\Sigma) & \\text{nonlinear, linearised at the mean} \\\\ \\text{PF} & M \\text{ weighted samples} & \\text{any you can sample and evaluate} \\end{array}$$',
      '$$\\begin{array}{l|l|l} & \\text{good for} & \\text{weak spot} \\\\ \\hline \\text{KF} & \\text{exact and cheapest} & \\text{one peak only; linear models only} \\\\ \\text{EKF} & \\text{mildly nonlinear robots} & \\text{diverges: strong nonlinearity, bad start} \\\\ \\text{PF} & \\text{multimodal, global localisation} & \\text{cost vs dimension; deprivation} \\end{array}$$',
      '$$\\begin{array}{l|l|l} & \\text{predict (uses } u_t) & \\text{correct (uses } z_t) \\\\ \\hline \\text{KF} & \\bar\\mu = A\\mu + Bu,\\ \\ \\bar\\Sigma = A\\Sigma A^T + R & K \\text{ from } C, Q;\\ \\ \\mu = \\bar\\mu + K(z - C\\bar\\mu) \\\\ \\text{EKF} & \\bar\\mu = g(u, \\mu),\\ \\ \\bar\\Sigma = G\\Sigma G^T + R & K \\text{ from } H, Q;\\ \\ \\mu = \\bar\\mu + K(z - h(\\bar\\mu)) \\\\ \\text{PF} & \\text{draw } x_t^{[m]} \\sim p(x_t \\mid u_t, x_{t-1}^{[m]}) & w^{[m]} = p(z_t \\mid x_t^{[m]}),\\ \\text{resample} \\end{array}$$',
    ],
    what: 'All three are the Bayes filter: predict with the motion model, correct with the sensor model. They differ only in **how they store the belief**, and that one choice decides everything else. A single Gaussian (KF, EKF) is cheap and smooth but has exactly one peak; weighted samples (PF) can take any shape but cost more, and far more in higher dimensions. The KF is exact only for linear-Gaussian models; the EKF stretches it to nonlinear ones by linearising at the mean; the PF assumes nothing about the models at all.',
    when: '- “What is the difference between using a Kalman filter, an extended Kalman filter and a particle filter for state estimation? When would you choose one over another?” (review deck slide 6).\n- “Identify one benefit of particle filters over Kalman-filter-based methods” (2023 Q22).\n- Naming a filter from its representation (2023 Q4, 2024 Q4, 2025 Q4), or picking one for a scenario.',
    how: [
      'Belief representation first: one Gaussian (KF, EKF) or $M$ weighted samples (PF).',
      'Then the model assumptions: linear with Gaussian noise (KF), nonlinear but smooth enough to linearise at the mean (EKF), anything you can sample and evaluate (PF).',
      'Then what each is good at and its weak spot (second table).',
      'To choose for a scenario, ask in order. Could the belief have more than one peak (global localisation, a symmetric map, kidnapping, ambiguous data association)? Then a PF. If not, are the models linear? Then a KF. Mildly nonlinear with a decent initial guess? Then an EKF. Finally check the cost: a large state (hundreds of landmarks) rules out a plain PF.',
      'Give one example per filter: a KF tracking position and velocity with a position sensor; an EKF fusing wheel odometry with GPS, or EKF-SLAM with a few distinct landmarks; a PF for global localisation in a building with look-alike corridors.',
    ],
    traps: [
      {
        title: '“The particle filter is always the best”',
        detail: 'It is approximate (sampling noise), costs far more, and can lose the true state (deprivation). For a linear-Gaussian problem the KF is exact and optimal; a PF only approaches it with many particles.',
      },
      {
        title: 'Answering with the models only',
        detail: 'Start with the belief representation (one Gaussian vs samples), then the model assumptions, then an example. “The EKF is for nonlinear systems” alone is half an answer.',
        source: 'Notes §2 (typical questions)',
      },
      {
        title: '“A huge covariance lets a KF do global localisation”',
        detail: 'A wide Gaussian still has one peak, at its mean. With look-alike places the true posterior has several peaks; the (E)KF commits to one, linearised at the wrong place.',
      },
      {
        title: 'Treating KF and EKF as different representations',
        detail: 'Both store one Gaussian; the EKF changes how the models are applied (linearised), not the belief. The other non-Gaussian options on the papers are the histogram filter and the binary Bayes filter of occupancy cells.',
        source: '2023 Q4, 2024 Q4 distractors',
      },
    ],
    more: '**A fourth option: the histogram (grid) filter** of §1, as in the 2024 Q28 grid world. It stores a probability for every cell, so it is multimodal like a PF and has no sampling noise, but its cost grows as (cells per axis)$^{\\text{dimension}}$, so it suits small, low-dimensional state spaces. The binary Bayes filter of occupancy mapping (§4) is the same idea applied to one yes/no variable per map cell.\n\n**Cost in one line each.** KF and EKF: a few matrix products and one inversion the size of the measurement per step; EKF-SLAM grows as $N^2$ in the number of landmarks. PF: linear in $M$, but the $M$ needed grows exponentially with the state dimension, which is why FastSLAM samples only the robot path.\n\n**A model answer to “when would you pick each?”** “A KF when the motion and sensor models are linear with Gaussian noise and the belief is unimodal (e.g. tracking position and velocity with a position sensor): it is exact and cheap. An EKF when the models are nonlinear but smooth over the uncertainty and a good initial estimate exists (e.g. fusing odometry with GPS): it linearises with Jacobians at the mean. A PF when the belief may be multimodal or non-Gaussian, or the models are strongly nonlinear (global localisation, the kidnapped robot, ambiguous data association): it represents the belief with weighted samples, at a cost that grows with the state dimension.”',
    exploreIds: ['which-filter', 'ekf', 'pf'],
    solveIds: ['filters-choice'],
  },
];

export const flashcards: Flashcard[] = [
  // Kalman filter
  {
    id: 'filters-f-kf-belief',
    front: 'Kalman filter: how is the belief represented, and what must hold for the KF to be exact?',
    back: 'One Gaussian, $\\mathcal{N}(\\mu, \\Sigma)$: a multivariate Gaussian (2025 Q4). Exact when the motion and sensor models are **linear** with additive zero-mean **Gaussian** noise and the initial belief is Gaussian; every predict and correct step then returns a Gaussian, and the KF is the optimal estimator.',
    tags: ['kf', 'mcq'],
  },
  {
    id: 'filters-f-name',
    front: 'A Bayes filter that uses one multivariate Gaussian for a linear system is called? And one that uses a set of samples?',
    back: 'A Kalman filter (2023 Q4); a particle filter (2024 Q4). The EKF is the single-Gaussian filter for **nonlinear** systems, and the binary Bayes filter tracks one yes/no state such as an occupancy cell.',
    tags: ['compare', 'mcq'],
  },
  {
    id: 'filters-f-r-q',
    front: 'Course notation: which of $R$ and $Q$ is the sensor noise?',
    back: '$Q$ is the sensor (measurement) noise covariance, inside the gain. $R$ is the actuation (process) noise covariance, added in the prediction $\\bar\\Sigma = A\\Sigma A^T + R$. Some textbooks swap the letters.',
    tags: ['kf'],
  },
  {
    id: 'filters-f-predict',
    front: 'KF prediction: the two equations, and does the uncertainty grow or shrink?',
    back: '$\\bar\\mu_t = A_t\\mu_{t-1} + B_t u_t$ and $\\bar\\Sigma_t = A_t\\Sigma_{t-1}A_t^T + R_t$. It grows: the actuation noise $R$ is added every step.',
    tags: ['kf'],
  },
  {
    id: 'filters-f-correct',
    front: 'KF correction: the three equations?',
    back: '$K_t = \\bar\\Sigma_t C_t^T(C_t\\bar\\Sigma_t C_t^T + Q_t)^{-1}$, $\\mu_t = \\bar\\mu_t + K_t(z_t - C_t\\bar\\mu_t)$, $\\Sigma_t = (I - K_tC_t)\\bar\\Sigma_t$. The term $z_t - C_t\\bar\\mu_t$ is the innovation: the reading minus the reading the prediction expected.',
    tags: ['kf'],
  },
  {
    id: 'filters-f-1d',
    front: 'A 1-D Kalman filter by hand ($A = B = C = 1$): the four lines?',
    back: '$\\bar\\mu_t = \\mu_{t-1} + u_t$ and $\\bar\\sigma_t^2 = \\sigma_{t-1}^2 + R$; $K = \\bar\\sigma_t^2/(\\bar\\sigma_t^2 + Q)$; $\\mu_t = \\bar\\mu_t + K(z_t - \\bar\\mu_t)$; $\\sigma_t^2 = (1 - K)\\,\\bar\\sigma_t^2$. Square any standard deviations first.',
    tags: ['kf', 'by-hand'],
  },
  {
    id: 'filters-f-trust',
    front: 'Why is the Kalman gain called the trust dial?',
    back: 'It is the fraction of the innovation that is applied: $K \\approx 1$ believes the reading (uncertain prediction, precise sensor), $K \\approx 0$ keeps the prediction (noisy sensor). In 1-D, $K = \\bar\\sigma^2/(\\bar\\sigma^2 + Q)$ is the prediction’s share of the total uncertainty.',
    tags: ['gain'],
  },
  {
    id: 'filters-f-q-both',
    front: 'You change the sensor noise in a Kalman filter. Does the mean change, the variance, or both?',
    back: '**Both** (2024 Q5, 2025 Q5). $Q$ is inside $K$, and $K$ scales the mean step $K(z - C\\bar\\mu)$ and sets $\\Sigma = (I - KC)\\bar\\Sigma$.',
    tags: ['gain', 'mcq'],
  },
  {
    id: 'filters-f-z-only',
    front: 'Same filter, same $R$ and $Q$, but the reading $z$ comes out different. What changes?',
    back: 'Only the mean. $z$ appears in the mean update and in none of the covariance equations, so $K$ and $\\Sigma$ are identical. (In a linear KF the covariances could even be computed before the robot moves.)',
    tags: ['gain'],
  },
  {
    id: 'filters-f-double-q',
    front: 'Double $Q$: what happens to $K$, to the step towards $z$, and to the posterior variance?',
    back: '$K$ falls, so the mean moves a smaller fraction of the way to $z$, and the posterior variance is larger (it shrinks less from $\\bar\\sigma^2$). With $\\bar\\sigma^2 = 0.09$: $Q = 0.09$ gives $K = 0.5$; $Q = 0.18$ gives $K = 0.33$.',
    tags: ['gain', 'parameters'],
  },
  {
    id: 'filters-f-big-r',
    front: 'The wheels start slipping, so you increase $R$. Effect on the estimate?',
    back: '$\\bar\\sigma^2$ grows, so $K$ rises: the estimate follows the readings more closely, and the posterior variance is larger. More responsive, but noisier.',
    tags: ['gain', 'parameters'],
  },
  {
    id: 'filters-f-limits',
    front: '1-D KF with $C = 1$: what happens as $Q \\to 0$, and as $Q \\to \\infty$?',
    back: '$Q \\to 0$: $K \\to 1$, $\\mu = z$ and $\\sigma^2 \\to 0$ (a perfect sensor). $Q \\to \\infty$: $K \\to 0$, the reading is ignored and $\\sigma^2$ keeps growing by $R$ each step (dead reckoning).',
    tags: ['gain', 'parameters'],
  },
  {
    id: 'filters-f-fusion',
    front: 'Why is the corrected variance smaller than both $\\bar\\sigma^2$ and $Q$?',
    back: 'Precisions add: $1/\\sigma^2 = 1/\\bar\\sigma^2 + 1/Q$. Two independent sources of information beat either alone; two equal variances give half the variance (the reason overlapping sensors help, 2024 Q22).',
    tags: ['gain'],
  },
  {
    id: 'filters-f-overconfident',
    front: 'What goes wrong if $R$ is set far too small?',
    back: 'The filter becomes overconfident: $\\bar\\Sigma$ stays tiny, $K \\to 0$, and readings are ignored. When the robot slips, the estimate lags behind the truth and can diverge.',
    tags: ['gain', 'parameters'],
  },
  {
    id: 'filters-f-steady',
    front: 'Constant $R$ and $Q$: what happens to $K$ over time?',
    back: 'It settles to a steady-state value, where the growth from $R$ in each prediction balances the shrinkage in each correction. A larger $R/Q$ gives a larger steady gain (responsive, noisy); a smaller one a smooth but sluggish estimate.',
    tags: ['gain'],
  },
  // EKF
  {
    id: 'filters-f-ekf-why',
    front: 'Why can a plain KF not track a robot whose heading enters the motion through $\\cos\\theta$?',
    back: 'A Gaussian pushed through a nonlinear function is not Gaussian (an uncertain heading bends the cloud into a banana), so the KF equations no longer describe the belief. The EKF linearises instead.',
    tags: ['ekf'],
  },
  {
    id: 'filters-f-ekf-how',
    front: 'EKF: what is linearised, where, and what still uses the full nonlinear model?',
    back: '$g$ and $h$, by a first-order Taylor expansion at the current mean: $G_t = \\partial g/\\partial x$ at $\\mu_{t-1}$, $H_t = \\partial h/\\partial x$ at $\\bar\\mu_t$. The means use the real functions, $\\bar\\mu_t = g(u_t, \\mu_{t-1})$ and the innovation $z_t - h(\\bar\\mu_t)$; only the covariances and the gain use $G$ and $H$.',
    tags: ['ekf'],
  },
  {
    id: 'filters-f-ekf-fail',
    front: 'Three ways an EKF fails?',
    back: 'Strong nonlinearity over the spread of the belief (the tangent is a poor fit); a poor initial guess (linearised at the wrong point, so it can diverge); a multimodal true belief (one Gaussian cannot hold it). Wrong data association in EKF-SLAM is a fourth.',
    tags: ['ekf'],
  },
  {
    id: 'filters-f-ekf-linear',
    front: 'Run an EKF on linear models. What do you get?',
    back: 'Exactly the Kalman filter: the Jacobians are constant, $G = A$ and $H = C$.',
    tags: ['ekf'],
  },
  {
    id: 'filters-f-zero-slope',
    front: 'An EKF with a range sensor $h(x) = \\sqrt{x^2 + 1}$ is linearised at $\\bar\\mu = 0$. What does the correction do?',
    back: 'Nothing: $H = 0$ there, so $K = 0$ and the reading is ignored, although it says $|x|$ is large. The true posterior has two peaks ($\\pm x$), which a linearised single Gaussian cannot see.',
    tags: ['ekf'],
  },
  // Particle filter
  {
    id: 'filters-f-pf-loop',
    front: 'Particle filter: the three steps of one update?',
    back: '1. **Sample**: move each particle through the motion model with drawn noise (prediction).\n2. **Weight**: $w^{[m]} = p(z_t \\mid x_t^{[m]})$ (correction).\n3. **Resample**: draw $M$ new particles with replacement, in proportion to the normalised weights.',
    tags: ['pf'],
  },
  {
    id: 'filters-f-weights',
    front: 'Particle weights are set by?',
    back: 'The **sensor likelihood** $p(z_t \\mid x_t^{[m]})$: how well each particle explains the reading (2023 Q5). Not the prior, the control or the posterior.',
    tags: ['pf', 'mcq'],
  },
  {
    id: 'filters-f-resample-why',
    front: 'Why resample at all?',
    back: 'Without it, a few particles soon carry almost all the weight and the rest are wasted on unlikely states. Resampling copies likely particles and drops unlikely ones, so the particles go where the probability is: particle $m$ gets about $M\\tilde w^{[m]}$ copies.',
    tags: ['pf'],
  },
  {
    id: 'filters-f-benefit',
    front: 'One benefit of a particle filter over a Kalman filter (1 mark)?',
    back: 'It can represent arbitrary, non-Gaussian and **multimodal** beliefs and uses nonlinear models **without linearisation**: e.g. several pose hypotheses in global localisation, or per-particle data association in FastSLAM (2023 Q22).',
    tags: ['pf', 'compare'],
  },
  {
    id: 'filters-f-global',
    front: 'Global localisation with a particle filter: how does it start, and what does the cloud look like early on?',
    back: 'Particles are spread uniformly over the free space of the map. Readings kill the poses that disagree; in a symmetric building several clusters survive until a distinctive reading breaks the tie. A KF cannot start without one Gaussian guess.',
    tags: ['pf'],
  },
  {
    id: 'filters-f-kidnapped',
    front: 'Kidnapped robot: why does a converged particle filter fail, and what fixes it?',
    back: 'All particles sit at the old pose, so none is near the new one, and resampling can only copy what exists. Inject a few random particles every step (more when the average likelihood drops), or reinitialise.',
    tags: ['pf'],
  },
  {
    id: 'filters-f-deprivation',
    front: 'Particle deprivation: what is it, and three causes?',
    back: 'No particles near the true state, so the filter can neither represent it nor recover. Causes: too few particles for the state dimension, a very peaked (overconfident) likelihood, and resampling after every reading even when the weights are nearly equal.',
    tags: ['pf', 'parameters'],
  },
  {
    id: 'filters-f-m',
    front: 'More particles: what improves, what does it cost, and how does the number needed scale?',
    back: 'A closer approximation and less risk of deprivation, at a cost linear in $M$ per step. But covering a $d$-dimensional state takes roughly $k^d$ particles, so PFs suit low-dimensional states such as a planar pose $(x, y, \\theta)$.',
    tags: ['pf', 'parameters'],
  },
  {
    id: 'filters-f-fastslam',
    front: 'FastSLAM in one line?',
    back: 'Particles sample the robot **path**; each particle carries one small EKF per landmark and makes its own data associations, so wrong associations die out at resampling.',
    tags: ['pf', 'slam'],
  },
  // Choosing
  {
    id: 'filters-f-choose',
    front: 'When would you pick a KF, an EKF or a PF? (one line each)',
    back: 'KF: linear models, Gaussian noise, one hypothesis; exact and cheapest. EKF: mildly nonlinear models and a good initial guess (odometry + GPS, EKF-SLAM). PF: multimodal or non-Gaussian beliefs, strong nonlinearity (global localisation, kidnapped robot), and a low-dimensional state.',
    tags: ['compare'],
  },
];
