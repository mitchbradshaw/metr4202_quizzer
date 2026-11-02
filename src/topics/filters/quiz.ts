// MCQs (original wording, cited to the past papers), method games and exam-style short answers for 'filters'.
// Covers every filter MCQ of 2023–2025 (2023 Q4, Q5; 2024 Q4, Q5; 2025 Q4, Q5), the 2023 Q22 short answer and the
// review deck's filter questions (slides 5–6), plus originals on the gain, the EKF and particle deprivation.
// Every number in a 'value' item was recomputed by script.
import type { Game, MCQ, ShortAnswer } from '../../engine/types';

export const mcqs: MCQ[] = [
  // ------------------------------------------------------------------ naming the filter
  {
    id: 'filters-q-name-kf',
    style: 'most-correct',
    stem: 'A Bayes filter keeps its belief as one multivariate Gaussian and is used on a system whose motion and sensor models are linear. It is called:',
    options: [
      {
        text: 'a Kalman filter',
        correct: true,
        why: 'One Gaussian plus linear models is exactly the KF’s setting: the belief stays Gaussian through every step, so the mean and covariance are all it has to track.',
      },
      {
        text: 'an extended Kalman filter',
        correct: false,
        why: 'Also one Gaussian, but the EKF exists for **nonlinear** models, which it linearises with Jacobians. On linear models it reduces to the KF, so the name for this case is the Kalman filter.',
      },
      {
        text: 'a particle filter',
        correct: false,
        why: 'A particle filter stores a set of weighted samples, not a Gaussian.',
      },
      {
        text: 'a binary Bayes filter',
        correct: false,
        why: 'That filter estimates one yes/no state, such as whether a map cell is occupied, usually in log-odds; it has no Gaussian.',
      },
    ],
    source: 'Recurring: 2023 Q4',
    difficulty: 1,
  },
  {
    id: 'filters-q-name-pf',
    style: 'most-correct',
    stem: 'A Bayes filter that stores its belief as a collection of sampled states is known as:',
    options: [
      {
        text: 'a particle filter',
        correct: true,
        why: 'Each particle is one sampled state (with a weight); the density of the cloud is the belief, so it can take any shape.',
      },
      {
        text: 'a Kalman filter',
        correct: false,
        why: 'A KF stores one Gaussian (a mean and a covariance), not samples.',
      },
      {
        text: 'an extended Kalman filter',
        correct: false,
        why: 'Still one Gaussian; the EKF only changes how nonlinear models are applied to it (by linearising).',
      },
      {
        text: 'a binary Bayes filter',
        correct: false,
        why: 'It tracks the probability of a single binary state (occupied or free), not a set of samples.',
      },
    ],
    source: 'Recurring: 2024 Q4',
    difficulty: 1,
  },
  {
    id: 'filters-q-kf-represents',
    style: 'most-correct',
    stem: 'A Kalman filter represents the state as:',
    options: [
      {
        text: 'a multivariate Gaussian: a mean vector and a covariance',
        correct: true,
        why: 'With linear models and Gaussian noise every prediction and correction returns a Gaussian, so $\\mu$ and $\\Sigma$ describe the whole belief.',
      },
      {
        text: 'a set of weighted samples drawn from the belief',
        correct: false,
        why: 'That is a particle filter (2024 Q4).',
      },
      {
        text: 'a sensor model linearised about the current estimate',
        correct: false,
        why: 'Linearising models is what the EKF does to *apply* nonlinear models; it is not a representation of the state.',
      },
      {
        text: 'a bimodal distribution, one peak per hypothesis',
        correct: false,
        why: 'A single Gaussian has exactly one peak. Holding two hypotheses needs samples (or a mixture of Gaussians).',
      },
    ],
    source: 'Recurring: 2025 Q4 (mirror of 2023 Q4)',
    difficulty: 1,
  },

  // ------------------------------------------------------------------ particle weights
  {
    id: 'filters-q-weights',
    style: 'most-correct',
    stem: 'Before a particle filter resamples, each particle receives a weight. The weight comes from:',
    options: [
      {
        text: 'the sensor likelihood of the actual reading at that particle, $p(z_t \\mid x_t^{[m]})$',
        correct: true,
        why: 'Each particle is weighted by how well it explains the reading actually received; resampling then copies particles in proportion to these (normalised) weights.',
      },
      {
        text: 'the prior: how probable that state was before the reading',
        correct: false,
        why: 'The prior is already represented by where the particles are (their density); weighting by it again would count it twice.',
      },
      {
        text: 'the control action $u_t$ that moved the particle',
        correct: false,
        why: 'The control is used in the sampling (prediction) step to move each particle; it does not tell you which particles fit the reading.',
      },
      {
        text: 'the posterior: its probability after the update',
        correct: false,
        why: 'The weighted, resampled set **is** the posterior; the weight is the factor $p(z_t \\mid x_t)$ that turns the prediction into it.',
      },
    ],
    source: 'Recurring: 2023 Q5',
    difficulty: 1,
  },

  // ------------------------------------------------------------------ the gain
  {
    id: 'filters-q-sensor-noise',
    style: 'most-correct',
    stem: 'You change the amount of noise assumed in the sensor model ($Q$) of a Kalman filter. What happens to the estimate?',
    options: [
      {
        text: 'There is no change to the estimate',
        correct: false,
        why: '$Q$ is inside the gain $K = \\bar\\Sigma C^T(C\\bar\\Sigma C^T + Q)^{-1}$, so changing it changes $K$, and $K$ appears in both update equations.',
      },
      {
        text: 'Only the mean changes, because the reading is weighted differently',
        correct: false,
        why: 'Half right: the mean does move, because $K$ scales the innovation. But the covariance update $\\Sigma = (I - KC)\\bar\\Sigma$ uses the same $K$, so the variance changes too.',
      },
      {
        text: 'Only the variance changes, since $Q$ enters only the covariance update',
        correct: false,
        why: '$Q$ never appears in the covariance update directly; it enters through $K$, and $K$ also scales the mean step $K(z - C\\bar\\mu)$.',
      },
      {
        text: 'Both the mean and the variance change',
        correct: true,
        why: 'A noisier sensor (larger $Q$) gives a smaller $K$: the mean moves less towards the reading and the variance shrinks less. E.g. $\\bar\\sigma^2 = 0.09$ and $z - \\bar\\mu = 0.3$: $Q = 0.09$ gives a step of 0.15 and $\\sigma^2 = 0.045$; $Q = 0.36$ gives 0.06 and 0.072.',
      },
    ],
    source: 'Recurring: 2024 Q5, 2025 Q5',
    fixedOrder: true,
    difficulty: 1,
  },
  {
    id: 'filters-q-reading-only',
    style: 'most-correct',
    stem: 'A linear Kalman filter receives a reading $z_t$ much further from its prediction than usual; $R$ and $Q$ are unchanged. Compared with an ordinary reading, the corrected estimate has:',
    options: [
      {
        text: 'a different mean and a different variance',
        correct: false,
        why: 'Only the mean equation contains $z_t$; the gain and $\\Sigma_t = (I - K_tC_t)\\bar\\Sigma_t$ do not.',
      },
      {
        text: 'a mean that moves further, but exactly the same variance',
        correct: true,
        why: 'The innovation $z_t - C_t\\bar\\mu_t$ is larger, so the mean moves further, by the same fraction $K$. The covariance equations never see $z$, so the variance is identical. (Contrast 2024 Q5, where changing $Q$ changes both.)',
      },
      {
        text: 'the same mean but a larger variance, as the reading is less believable',
        correct: false,
        why: 'A KF has no notion of a reading being less believable: its gain is fixed by $\\bar\\Sigma$ and $Q$. Rejecting outliers needs an extra gate on top of the filter.',
      },
      {
        text: 'the same mean and variance, because $K$ is unchanged',
        correct: false,
        why: '$K$ is indeed unchanged, but it multiplies a larger innovation, so the mean moves further.',
      },
    ],
    source: 'Original (the contrast to 2024 Q5, 2025 Q5)',
    difficulty: 2,
  },
  {
    id: 'filters-q-r-up',
    style: 'correct',
    stem: 'In a 1-D Kalman filter the wheels start slipping more, so you increase the actuation noise $R$ and leave $Q$ unchanged. At the next correction:',
    options: [
      {
        text: '$K$ increases, so the estimate moves further towards the reading',
        correct: true,
        why: '$R$ enlarges the predicted variance $\\bar\\sigma^2 = \\sigma^2 + R$, and $K = \\bar\\sigma^2/(\\bar\\sigma^2 + Q)$ grows with it: when the prediction is less reliable, the reading counts for more.',
      },
      {
        text: '$K$ decreases, because the robot’s own motion is now less certain',
        correct: false,
        why: 'Backwards: a less certain prediction makes the reading relatively more trustworthy, so $K$ rises.',
      },
      {
        text: '$K$ is unchanged, because $R$ is not written in the gain formula',
        correct: false,
        why: '$R$ is not written in $K$, but it enters through $\\bar\\Sigma$, which is.',
      },
      {
        text: 'the posterior variance ends up smaller than it was with the old $R$',
        correct: false,
        why: '$\\sigma^2 = \\bar\\sigma^2 Q/(\\bar\\sigma^2 + Q)$ grows with $\\bar\\sigma^2$: more actuation noise always leaves more uncertainty, even after the correction.',
      },
    ],
    source: 'Original; Notes §2 (the gain is the trust dial)',
    difficulty: 2,
  },
  {
    id: 'filters-q-gain-false',
    style: 'incorrect',
    stem: 'About the gain $K = \\bar\\sigma^2/(\\bar\\sigma^2 + Q)$ of a 1-D Kalman filter with $C = 1$:',
    options: [
      {
        text: 'A reading far from the prediction raises $K$, so the filter trusts it more.',
        correct: true,
        why: 'This is the FALSE statement: $z$ does not appear in $K$. A large innovation moves the mean further, but by the same fraction.',
      },
      {
        text: 'As $Q \\to 0$, $K \\to 1$ and the estimate jumps to the reading.',
        correct: false,
        why: 'True: a perfect sensor is believed completely, $\\mu = z$ and $\\sigma^2 \\to 0$.',
      },
      {
        text: 'As $Q \\to \\infty$, $K \\to 0$ and the reading is ignored.',
        correct: false,
        why: 'True: a useless sensor leaves the prediction untouched, so the variance keeps growing by $R$ each step.',
      },
      {
        text: '$K$ always lies between 0 and 1, whatever the (non-negative) values of $\\bar\\sigma^2$ and $Q$.',
        correct: false,
        why: 'True for this 1-D case: the numerator $\\bar\\sigma^2$ is part of the denominator $\\bar\\sigma^2 + Q$, so the ratio cannot leave $[0, 1]$.',
      },
    ],
    source: 'Original; Notes §2',
    trapId: 'read-the-stem',
    difficulty: 2,
  },
  {
    id: 'filters-q-r-q-notation',
    style: 'correct',
    stem: 'In the Kalman filter notation used in this course (Thrun), which statement is TRUE?',
    options: [
      {
        text: '$R$ is added to the predicted covariance; $Q$ appears inside the Kalman gain',
        correct: true,
        why: '$\\bar\\Sigma_t = A_t\\Sigma_{t-1}A_t^T + R_t$ (actuation noise grows the uncertainty) and $K_t = \\bar\\Sigma_tC_t^T(C_t\\bar\\Sigma_tC_t^T + Q_t)^{-1}$ (sensor noise sets the trust).',
      },
      {
        text: '$Q$ is added to the predicted covariance; $R$ appears inside the Kalman gain',
        correct: false,
        why: 'The letters are swapped. Some textbooks do use this convention, which is exactly why it is a trap: in this course $R$ is actuation, $Q$ is sensor.',
      },
      {
        text: '$R$ and $Q$ are both added during the prediction step',
        correct: false,
        why: 'Only the actuation noise belongs to the prediction; the sensor noise matters only once a reading arrives.',
      },
      {
        text: '$R$ is the sensor noise and $Q$ the actuation noise',
        correct: false,
        why: 'Swapped: $R$ is the actuation (process) noise, $Q$ the sensor (measurement) noise.',
      },
    ],
    source: 'Notes §2 (course notation)',
    trapId: 'r-vs-q',
    difficulty: 1,
  },
  {
    id: 'filters-q-gain-value',
    style: 'value',
    stem: 'A 1-D Kalman filter ($C = 1$) has predicted variance $\\bar\\sigma^2 = 4\\ \\text{m}^2$, and the sensor variance is $Q = 1\\ \\text{m}^2$. The Kalman gain is:',
    options: [
      {
        text: '0.2',
        correct: false,
        why: 'That is $Q/(\\bar\\sigma^2 + Q)$, the sensor’s share, i.e. $1 - K$. The gain is the prediction’s share.',
      },
      {
        text: '0.25',
        correct: false,
        why: 'That is $1/\\bar\\sigma^2$, the precision of the prediction, not the gain.',
      },
      {
        text: '0.8',
        correct: true,
        why: '$K = \\bar\\sigma^2/(\\bar\\sigma^2 + Q) = 4/5 = 0.8$: the prediction is four times less certain than the sensor, so the estimate moves 80 % of the way to the reading, and $\\sigma^2 = (1 - 0.8)(4) = 0.8\\ \\text{m}^2$.',
      },
      {
        text: '4',
        correct: false,
        why: 'That is the ratio $\\bar\\sigma^2/Q$. A gain of 4 would overshoot the reading by a factor of four.',
      },
    ],
    source: 'Original; exam mode “1-D Kalman filter by hand”',
    fixedOrder: true,
    difficulty: 1,
  },
  {
    id: 'filters-q-mean-value',
    style: 'value',
    stem: 'The predicted belief is $\\mathcal{N}(10\\ \\text{m},\\ 4\\ \\text{m}^2)$ and a sensor with variance $Q = 2\\ \\text{m}^2$ reads $z = 13$ m ($C = 1$). The corrected mean is:',
    options: [
      {
        text: '11 m',
        correct: false,
        why: 'That uses $Q/(\\bar\\sigma^2 + Q) = 1/3$ as the gain: the weights are swapped, so the noisier source is trusted more.',
      },
      {
        text: '11.5 m',
        correct: false,
        why: 'The plain average of 10 and 13, which is only right when both variances are equal.',
      },
      {
        text: '12 m',
        correct: true,
        why: '$K = 4/(4 + 2) = 2/3$, so $\\mu = 10 + \\tfrac23(13 - 10) = 12$ m. The sensor is twice as precise as the prediction, so the estimate ends up twice as close to the reading. The variance is $(1 - \\tfrac23)(4) = 1.33\\ \\text{m}^2$.',
      },
      {
        text: '13 m',
        correct: false,
        why: 'Jumping all the way to the reading assumes a perfect sensor ($Q = 0$, $K = 1$).',
      },
    ],
    source: 'Original; exam mode “1-D Kalman filter by hand”',
    fixedOrder: true,
    difficulty: 2,
  },
  {
    id: 'filters-q-kf-true',
    style: 'correct',
    stem: 'Which statement about the Kalman filter is TRUE?',
    options: [
      {
        text: 'With linear models and Gaussian noise it computes the exact Bayes posterior',
        correct: true,
        why: 'Under those assumptions the belief stays Gaussian, so tracking $\\mu$ and $\\Sigma$ loses nothing: the KF is the exact (and optimal) Bayes filter.',
      },
      {
        text: 'It can keep two separate hypotheses alive if its covariance is made large enough',
        correct: false,
        why: 'A large covariance makes one wide peak, not two peaks. Separate hypotheses need samples or a mixture.',
      },
      {
        text: 'Its covariance shrinks in the prediction step and grows again in the correction step',
        correct: false,
        why: 'Backwards: prediction adds $R$ (grows), correction multiplies by $(I - KC)$ (shrinks).',
      },
      {
        text: 'It needs a set of samples drawn from the prior to start',
        correct: false,
        why: 'It needs one Gaussian initial belief, $\\mathcal{N}(\\mu_0, \\Sigma_0)$; samples are the particle filter’s representation.',
      },
    ],
    source: 'Original; Notes §2 (filter table)',
    difficulty: 1,
  },

  // ------------------------------------------------------------------ EKF
  {
    id: 'filters-q-ekf-how',
    style: 'most-correct',
    stem: 'How does an extended Kalman filter handle a nonlinear motion model $g(u_t, x_{t-1})$?',
    options: [
      {
        text: 'The mean goes through $g$ itself; the covariance through the Jacobian $G_t$ taken at $\\mu_{t-1}$',
        correct: true,
        why: 'A first-order Taylor expansion at the current estimate: $\\bar\\mu_t = g(u_t, \\mu_{t-1})$ and $\\bar\\Sigma_t = G_t\\Sigma_{t-1}G_t^T + R_t$, with $G_t$ recomputed every step.',
      },
      {
        text: 'It fits one straight line to $g$ offline and uses that as $A$ at every step',
        correct: false,
        why: 'A fixed linearisation goes wrong as soon as the robot turns: the Jacobian depends on the heading, so it is re-evaluated at each new mean.',
      },
      {
        text: 'It pushes a cloud of samples through $g$ and refits a Gaussian to the cloud',
        correct: false,
        why: 'That describes sampling-based filters (a particle filter, or the unscented KF with its sigma points), not the EKF, which uses Jacobians.',
      },
      {
        text: 'It skips the nonlinearity when predicting and removes the resulting error at the correction',
        correct: false,
        why: 'The prediction must use the motion model, nonlinear part included; the correction only compares the prediction with a reading.',
      },
    ],
    source: 'Original; Notes §2; review deck slide 5',
    difficulty: 2,
  },
  {
    id: 'filters-q-ekf-h-point',
    style: 'most-correct',
    stem: 'Where does an EKF evaluate the Jacobian $H_t$ of its sensor model $h(x)$?',
    options: [
      {
        text: 'At the predicted mean $\\bar\\mu_t$',
        correct: true,
        why: 'The correction linearises $h$ about the best estimate available before the reading: $H_t = \\partial h/\\partial x$ at $\\bar\\mu_t$, with innovation $z_t - h(\\bar\\mu_t)$.',
      },
      {
        text: 'At the true state $x_t$',
        correct: false,
        why: 'The true state is unknown; if we had it there would be nothing to estimate.',
      },
      {
        text: 'At the reading $z_t$',
        correct: false,
        why: '$z_t$ is a measurement, not a state: $h$ maps states to readings, so its Jacobian is taken at a state.',
      },
      {
        text: 'At the previous corrected mean $\\mu_{t-1}$, before the motion',
        correct: false,
        why: 'That is where the motion Jacobian $G_t$ is evaluated. After the prediction, the newer estimate $\\bar\\mu_t$ is the right point.',
      },
    ],
    source: 'Original; Notes §2',
    difficulty: 2,
  },
  {
    id: 'filters-q-ekf-not-cause',
    style: 'incorrect',
    stem: 'Which of these is NOT a typical reason for an extended Kalman filter to give a poor or diverging estimate?',
    options: [
      {
        text: 'The motion and sensor models are linear, with Gaussian noise.',
        correct: true,
        why: 'This is the one that is NOT a problem: with linear models the Jacobians are exact ($G = A$, $H = C$) and the EKF is the optimal Kalman filter.',
      },
      {
        text: 'The models curve strongly over the spread of the belief.',
        correct: false,
        why: 'A real cause: a tangent is a poor stand-in for a curve over a wide spread, so the predicted mean and covariance are wrong.',
      },
      {
        text: 'The initial estimate is far from the true state, so the models are linearised at the wrong point.',
        correct: false,
        why: 'A real cause: the Jacobians are evaluated at the estimate, so at the wrong point the linearisation is wrong, and the errors can feed on themselves.',
      },
      {
        text: 'The true belief has two separate peaks.',
        correct: false,
        why: 'A real cause: one Gaussian cannot hold two hypotheses, so the EKF commits to one, possibly the wrong one, and becomes overconfident.',
      },
    ],
    source: 'Original; Notes §2 (EKF weak spot); review deck slide 5',
    trapId: 'read-the-stem',
    difficulty: 2,
  },

  // ------------------------------------------------------------------ particle filter
  {
    id: 'filters-q-pf-benefit',
    style: 'best',
    stem: 'Which is the best one-line answer to “identify one benefit of particle filters over Kalman-filter-based methods for state estimation and SLAM”?',
    options: [
      {
        text: 'It can hold multimodal, non-Gaussian beliefs without linearising the models',
        correct: true,
        why: 'The 2023 Q22 answer: samples can take any shape (several pose hypotheses in global localisation, per-particle data association in FastSLAM), and nonlinear models are used as they are.',
      },
      {
        text: 'It is always cheaper to run, whatever the dimension of the state',
        correct: false,
        why: 'The opposite: the number of particles needed grows exponentially with the state dimension, so a PF usually costs far more than a KF.',
      },
      {
        text: 'It is the exact, optimal estimate whenever the models are linear with Gaussian noise',
        correct: false,
        why: 'That is the Kalman filter’s strength. A PF only approaches the exact answer as the number of particles grows.',
      },
      {
        text: 'It needs no motion model, because the particles carry the history',
        correct: false,
        why: 'Every particle is moved through the motion model in the sampling step; without it there is no prediction.',
      },
    ],
    source: 'Similar to 2023 Q22 (1-mark short answer)',
    difficulty: 1,
  },
  {
    id: 'filters-q-global',
    style: 'best',
    stem: 'A robot is switched on somewhere in a known office building with no idea where it is, and several corridors look identical. Which filter suits this best?',
    options: [
      {
        text: 'A particle filter whose initial particles are spread uniformly over the whole map',
        correct: true,
        why: 'Global localisation: uniform particles represent “anywhere”, readings kill the wrong poses, and one cluster per look-alike corridor survives until a distinctive reading decides. Only a multimodal representation can hold that belief.',
      },
      {
        text: 'A Kalman filter started at the centre of the map with a very large covariance',
        correct: false,
        why: 'A wide Gaussian still has one peak. With identical corridors the true posterior has several, and the filter collapses onto one of them, possibly the wrong one.',
      },
      {
        text: 'An EKF started at the robot’s charging dock with a small covariance',
        correct: false,
        why: 'That assumes the answer: if the robot is not at the dock, a confident EKF linearised at the wrong pose may never recover.',
      },
      {
        text: 'A Kalman filter whose sensor noise $Q$ is set close to zero',
        correct: false,
        why: 'Trusting the sensor completely does not help when the same reading fits several places; it only makes the single Gaussian jump between them.',
      },
    ],
    source: 'Original; Notes §2 (PF: global localisation)',
    difficulty: 2,
  },
  {
    id: 'filters-q-kidnapped',
    style: 'best',
    stem: 'A particle filter has converged on the robot’s true pose when the robot is picked up and carried to another room. Which change lets the filter recover?',
    options: [
      {
        text: 'Inject a few random particles at every step, more when the readings fit badly',
        correct: true,
        why: 'Random particles give the filter a chance to place a guess near the new pose; once one lands there its weight is high and resampling multiplies it. Adaptive versions inject more when the average likelihood drops.',
      },
      {
        text: 'Resample after every reading, even when the weights are nearly equal',
        correct: false,
        why: 'Resampling only copies existing particles, all of which are in the wrong room; doing it more often just removes diversity faster.',
      },
      {
        text: 'Shrink the motion noise so the particles stay tightly clustered',
        correct: false,
        why: 'Tighter clusters make it worse: the particles spread even less, so none reaches the new pose.',
      },
      {
        text: 'Halve the number of particles to speed up each update',
        correct: false,
        why: 'Fewer particles make deprivation more likely, not less.',
      },
    ],
    source: 'Original; Notes §2 (PF: kidnapped robot)',
    difficulty: 2,
  },
  {
    id: 'filters-q-deprivation',
    style: 'incorrect',
    stem: 'Which change does NOT help against particle deprivation (no particles left near the true state)?',
    options: [
      {
        text: 'Resampling after every reading, even when the weights are almost equal.',
        correct: true,
        why: 'This is the one that does NOT help: every resample discards some particles at random, so resampling without need removes diversity and speeds deprivation up.',
      },
      {
        text: 'Using more particles.',
        correct: false,
        why: 'Helps: more particles cover the state space more densely, so one is more likely to sit near the truth.',
      },
      {
        text: 'Resampling only when the effective sample size $N_{\\text{eff}}$ falls low.',
        correct: false,
        why: 'Helps: when the weights are nearly even the set is already a good sample, and resampling would only add sampling noise.',
      },
      {
        text: 'Low-variance (systematic) resampling instead of drawing every particle independently.',
        correct: false,
        why: 'Helps: one random number and evenly spaced pointers keep each particle’s copies close to $M\\tilde w^{[m]}$, so fewer distinct particles are lost by chance.',
      },
    ],
    source: 'Original; Notes §2 (PF weak spot: particle deprivation)',
    trapId: 'read-the-stem',
    difficulty: 2,
  },
  {
    id: 'filters-q-dimension',
    style: 'most-correct',
    stem: 'Why is a plain particle filter rarely used to estimate a robot’s pose together with the positions of 200 landmarks?',
    options: [
      {
        text: 'The particles needed grow exponentially with state dimension',
        correct: true,
        why: 'The state has $3 + 2 \\times 200 = 403$ dimensions, far too many to cover with samples. FastSLAM avoids this by sampling only the robot path and giving each landmark its own small EKF inside each particle.',
      },
      {
        text: 'Particle weights cannot be computed when the state contains landmarks',
        correct: false,
        why: 'A weight only needs the sensor model evaluated at the particle, which works for any state.',
      },
      {
        text: 'Particles cannot represent a Gaussian belief, which this problem requires',
        correct: false,
        why: 'Particles can approximate any distribution, Gaussians included; that is not the obstacle.',
      },
      {
        text: 'Resampling needs linear motion and sensor models',
        correct: false,
        why: 'Resampling uses only the weights; the particle filter makes no linearity assumption anywhere.',
      },
    ],
    source: 'Original; Notes §2 (PF weak spot: cost with dimension)',
    difficulty: 2,
  },
  {
    id: 'filters-q-fastslam',
    style: 'most-correct',
    stem: 'In FastSLAM, what does each particle hold?',
    options: [
      {
        text: 'One hypothesis of the robot’s path, plus a small EKF for every landmark',
        correct: true,
        why: 'Given the path, the landmarks are independent, so each is a tiny 2-D EKF inside each particle; each particle also makes its own data associations.',
      },
      {
        text: 'The position of a single landmark, with the robot pose kept in a separate EKF',
        correct: false,
        why: 'Landmarks are not particles: a particle is a whole path hypothesis carrying its own map.',
      },
      {
        text: 'The full joint Gaussian of the pose and all the landmarks, as in EKF-SLAM',
        correct: false,
        why: 'That is EKF-SLAM, whose cost grows with the square of the number of landmarks.',
      },
      {
        text: 'An occupancy probability for every cell of one map shared by all particles',
        correct: false,
        why: 'Each particle builds its own map from its own path; one shared map could not reflect the different path hypotheses.',
      },
    ],
    source: 'Notes §2, §4 (FastSLAM); 2023 Q22',
    difficulty: 2,
  },
  {
    id: 'filters-q-pick-ekf',
    style: 'best',
    stem: 'A delivery robot fuses wheel odometry with GPS. Its motion model is nonlinear (the heading enters through $\\cos\\theta$ and $\\sin\\theta$), its pose is always roughly known, and the filter must run at 100 Hz on a small computer. The best choice is:',
    options: [
      {
        text: 'an extended Kalman filter',
        correct: true,
        why: 'Mildly nonlinear models, a unimodal belief (the pose is roughly known) and a tight computing budget: the textbook EKF case (Notes §2: odometry + GPS).',
      },
      {
        text: 'a linear Kalman filter',
        correct: false,
        why: 'The motion model is nonlinear in the heading, so a plain KF cannot apply it; linearising it at every step is exactly what makes the filter an EKF.',
      },
      {
        text: 'a particle filter with 100 000 particles',
        correct: false,
        why: 'It would work, but the belief is unimodal, so the extra cost buys nothing, and 100 000 particles at 100 Hz will not fit on a small computer.',
      },
      {
        text: 'a histogram filter on a 1 cm grid over the whole city',
        correct: false,
        why: 'A city at 1 cm resolution (times every heading) is billions of cells: hopeless at 100 Hz, and its ability to hold several peaks is not needed.',
      },
    ],
    source: 'Original; Notes §2 (filter table); review deck slide 6',
    difficulty: 1,
  },
];

export const games: Game[] = [
  {
    kind: 'sort',
    id: 'filters-g-which',
    title: 'KF, EKF or PF?',
    prompt: 'Pick the filter you would use for each robot. Ask in order: could the belief have **more than one peak**? Are the models **linear**? Is the state **small** enough for particles?',
    buckets: [
      { id: 'kf', label: 'Kalman filter' },
      { id: 'ekf', label: 'Extended Kalman filter' },
      { id: 'pf', label: 'Particle filter' },
    ],
    items: [
      { id: 'w1', text: 'A cart on a straight rail, with a constant-velocity model and a laser rangefinder pointing along the rail', bucket: 'kf', why: 'Linear motion ($x_t = x_{t-1} + v\\Delta t$), a linear sensor ($z = x$), Gaussian noise and one hypothesis: the KF is exact and the cheapest option.' },
      { id: 'w2', text: 'A drone holding altitude, with a linear model of its vertical motion and a downward laser altimeter', bucket: 'kf', why: 'The vertical dynamics are linear in the state and the altimeter measures the altitude directly: a linear-Gaussian problem.' },
      { id: 'w3', text: 'A slowly drifting temperature, read by a thermometer with Gaussian noise', bucket: 'kf', why: 'A random-walk state measured directly: everything is linear and Gaussian, so a 1-D KF (a smart running average) is optimal.' },
      { id: 'w4', text: 'A differential-drive robot fusing wheel odometry with GPS, starting from a known pose', bucket: 'ekf', why: 'The heading enters through $\\cos\\theta$ and $\\sin\\theta$ (nonlinear), but the pose is known and stays one blob: linearise at the mean.' },
      { id: 'w5', text: 'Mapping 30 distinct, easily told-apart reflectors in a warehouse, starting from a known pose', bucket: 'ekf', why: 'Few, unambiguous landmarks and a unimodal belief: one joint Gaussian over the pose and the landmarks (EKF-SLAM) is cheap at this size.' },
      { id: 'w6', text: 'A robot with a roughly known pose that measures range and bearing to one known beacon', bucket: 'ekf', why: 'Range ($\\sqrt{\\cdot}$) and bearing ($\\operatorname{atan2}$) are nonlinear, but with the pose roughly known the belief is one blob, so an EKF linearised at the mean works.' },
      { id: 'w7', text: 'A robot switched on somewhere in a building whose corridors all look the same', bucket: 'pf', why: 'Global localisation: the belief starts uniform and stays multimodal while the corridors look alike; only samples can hold that.' },
      { id: 'w8', text: 'A vacuum robot that is sometimes picked up and put down in another room', bucket: 'pf', why: 'The kidnapped robot: with a few random particles injected, a PF can find the new pose, while a Gaussian filter stays stuck on the old one.' },
      { id: 'w9', text: 'Mapping a hall full of identical shelf legs, where it is often unclear which leg was seen', bucket: 'pf', why: 'Ambiguous data association: FastSLAM lets each particle choose its own association, and the wrong choices die out at resampling.' },
      { id: 'w10', text: 'A sonar that sometimes reports maximum range by mistake, so its noise is far from Gaussian', bucket: 'pf', why: 'A mixed, heavy-tailed sensor model can be used directly as the particle weight; a Gaussian filter would have to pretend the noise is Gaussian.' },
    ],
    source: 'Notes §2 (filter table); review deck slide 6',
  },
  {
    kind: 'match',
    id: 'filters-g-belief',
    title: 'How does it store the belief?',
    prompt: 'Every one of these is a Bayes filter. Match each to the way it represents the belief.',
    pairs: [
      { id: 'b1', left: 'Kalman filter', right: 'One Gaussian, exact because the models are linear', why: 'Linear models with Gaussian noise keep the belief Gaussian, so $\\mu$ and $\\Sigma$ say everything (2023 Q4, 2025 Q4).' },
      { id: 'b2', left: 'Extended Kalman filter', right: 'One Gaussian, moved through models linearised at its mean', why: 'The same representation as the KF; the Jacobians $G_t$ and $H_t$ take the place of $A$ and $C$.' },
      { id: 'b3', left: 'Particle filter', right: 'A set of $M$ sampled states with weights', why: 'Any shape, including several peaks (2024 Q4); the weights are the sensor likelihood (2023 Q5).' },
      { id: 'b4', left: 'Histogram (grid) filter', right: 'A probability for every cell of a discretised state space', why: 'The discrete Bayes filter of §1 (the 2024 Q28 grid world): multimodal, but its cost grows with the number of cells.' },
      { id: 'b5', left: 'Binary Bayes filter', right: 'The log-odds of one yes/no state, such as a cell being occupied', why: 'Occupancy mapping (§4): each cell is its own static binary filter; the prior 0.5 is log-odds 0.' },
      { id: 'b6', left: 'FastSLAM', right: 'Particles for the robot path, each with a small EKF per landmark', why: 'A particle filter over paths combined with a Gaussian filter for each landmark, which is independent of the others once the path is fixed.' },
    ],
    source: 'Notes §1, §2, §4; 2023 Q4, 2024 Q4, 2025 Q4',
  },
  {
    kind: 'sort',
    id: 'filters-g-gain',
    title: 'Trust dial: what happens to K?',
    prompt: 'A 1-D Kalman filter ($C = 1$, $K = \\bar\\sigma^2/(\\bar\\sigma^2 + Q)$) is running. For each change, does the gain at the next correction go **up** (trust the reading more), go **down** (trust the prediction more), or stay **the same**?',
    buckets: [
      { id: 'up', label: '$K$ goes up' },
      { id: 'down', label: '$K$ goes down' },
      { id: 'same', label: '$K$ stays the same' },
    ],
    items: [
      { id: 'k1', text: 'The sensor is replaced by one with half the noise variance', bucket: 'up', why: '$Q$ halves, so the denominator shrinks and $K$ rises.' },
      { id: 'k2', text: 'The wheels start slipping on a wet floor (larger $R$)', bucket: 'up', why: '$\\bar\\sigma^2 = \\sigma^2 + R$ grows, so the prediction is trusted less and $K$ rises.' },
      { id: 'k3', text: 'The sensor dropped out for the last five steps, so five predictions ran with no correction', bucket: 'up', why: 'Each prediction added $R$, so $\\bar\\sigma^2$ is large when the next reading arrives and $K$ is close to 1.' },
      { id: 'k4', text: 'The filter is started with a much vaguer initial belief (larger $\\sigma_0^2$)', bucket: 'up', why: 'A larger starting variance makes the first $\\bar\\sigma^2$ larger, so the first readings are trusted more and the estimate converges quickly.' },
      { id: 'k5', text: 'Fog makes the rangefinder noisier', bucket: 'down', why: 'A larger $Q$ means a smaller $K$: the reading counts for less.' },
      { id: 'k6', text: 'The motion model is improved, so the actuation noise $R$ is smaller', bucket: 'down', why: 'A tighter prediction means a smaller $\\bar\\sigma^2$, so the reading counts for less.' },
      { id: 'k7', text: 'A reading arrives much further from the prediction than usual', bucket: 'same', why: 'The gain contains no $z$: a bigger innovation moves the mean further, but by the same fraction.' },
      { id: 'k8', text: 'The filter has run for a long time with constant $R$ and $Q$, and one more step passes', bucket: 'same', why: 'At steady state the growth from $R$ balances the shrinkage from each correction, so $\\bar\\sigma^2$ and $K$ no longer change from step to step.' },
    ],
    source: 'Notes §2 (the gain is the trust dial); 2024 Q5, 2025 Q5',
  },
];

export const shortAnswers: ShortAnswer[] = [
  {
    id: 'filters-sa-pf-benefit',
    prompt: '**(1 mark)** In no more than 50 words: identify one benefit of using particle filters for state estimation and SLAM over Kalman-filter-based methods.',
    wordLimit: 50,
    model: 'A particle filter represents the belief with weighted samples, so it can hold non-Gaussian and multimodal beliefs (several pose hypotheses during global localisation, or per-particle data associations in FastSLAM) and uses nonlinear models without linearising them. Kalman filters are limited to a single Gaussian.',
    keyPoints: [
      'names a benefit: multimodal / non-Gaussian beliefs',
      'or: nonlinear models without linearisation',
      'an example (global localisation, kidnapped robot, per-particle data association in FastSLAM)',
      'contrast: a (E)KF holds one Gaussian, one hypothesis',
    ],
    source: '2023 Q22',
    marks: 1,
  },
  {
    id: 'filters-sa-difference',
    prompt: '**(3 marks)** In no more than 100 words: what is the difference between using a Kalman filter, an extended Kalman filter and a particle filter for state estimation?',
    wordLimit: 100,
    model: 'All three implement the Bayes filter (predict with the motion model, correct with the sensor model); they differ in how they represent the belief and which models they allow.\n\n- **KF:** one Gaussian $(\\mu, \\Sigma)$; requires linear models with Gaussian noise; exact, optimal and cheap.\n- **EKF:** one Gaussian; allows nonlinear models by linearising them with Jacobians at the current mean; approximate, and can diverge under strong nonlinearity or a poor initial guess.\n- **PF:** $M$ weighted samples; allows any models and multimodal, non-Gaussian beliefs; approximate, and the cost grows quickly with the state dimension.',
    keyPoints: [
      'all three are Bayes filters (predict + correct)',
      'KF: one Gaussian, linear-Gaussian models, exact',
      'EKF: one Gaussian, nonlinear models linearised (Jacobians) at the mean',
      'PF: weighted samples, any models, multimodal',
      'a cost or failure point for each (EKF divergence, PF cost vs dimension)',
    ],
    source: 'Review deck slide 6',
    marks: 3,
  },
  {
    id: 'filters-sa-when',
    prompt: '**(3 marks)** In no more than 100 words: when would you choose a Kalman filter, an extended Kalman filter or a particle filter over the others? Give an example for each.',
    wordLimit: 100,
    model: '- **KF** when the models are linear with Gaussian noise and the belief is unimodal, e.g. tracking a cart’s position and velocity on a rail with a rangefinder: exact and cheapest.\n- **EKF** when the models are nonlinear but smooth over the uncertainty and a good initial estimate exists, e.g. fusing wheel odometry with GPS: cheap enough for real-time use.\n- **PF** when the belief may be multimodal or non-Gaussian, or the models are strongly nonlinear, e.g. global localisation among look-alike corridors or the kidnapped robot, provided the state is small enough to afford enough particles.',
    keyPoints: [
      'KF: linear-Gaussian, unimodal, with an example',
      'EKF: mildly nonlinear, good initial guess, with an example',
      'PF: multimodal / non-Gaussian / strongly nonlinear, with an example',
      'the trade-off: PF cost grows with state dimension; (E)KF cheap',
    ],
    source: 'Review deck slide 6',
    marks: 3,
  },
  {
    id: 'filters-sa-kf-bayes',
    prompt: '**(2 marks)** In no more than 80 words: explain how a Kalman filter implements the Bayes filter.',
    wordLimit: 80,
    model: 'It represents the belief as one Gaussian $\\mathcal{N}(\\mu, \\Sigma)$; with linear models and Gaussian noise both Bayes steps keep it Gaussian, so only $\\mu$ and $\\Sigma$ are updated.\n\n- **Prediction** (control $u_t$): $\\bar\\mu = A\\mu + Bu$, $\\bar\\Sigma = A\\Sigma A^T + R$; the actuation noise $R$ makes the uncertainty grow.\n- **Correction** (reading $z_t$): $K = \\bar\\Sigma C^T(C\\bar\\Sigma C^T + Q)^{-1}$, $\\mu = \\bar\\mu + K(z - C\\bar\\mu)$, $\\Sigma = (I - KC)\\bar\\Sigma$; the gain weighs the reading against the prediction, and the uncertainty shrinks.',
    keyPoints: [
      'belief = one Gaussian (mean, covariance), kept Gaussian by linear-Gaussian models',
      'prediction: mean through the motion model, covariance grows by $R$',
      'correction: Kalman gain from $\\bar\\Sigma$ and $Q$; mean moves towards the reading',
      'covariance shrinks, $\\Sigma = (I - KC)\\bar\\Sigma$',
    ],
    source: 'Review deck slide 5 (learning outcome)',
    marks: 2,
  },
  {
    id: 'filters-sa-ekf',
    prompt: '**(3 marks)** In no more than 100 words: explain the motivation for the extended Kalman filter and describe how it is implemented.',
    wordLimit: 100,
    model: 'Real robot models are nonlinear (the heading enters through $\\cos\\theta$ and $\\sin\\theta$; range and bearing sensors use square roots and atan2). A Gaussian passed through a nonlinear function is no longer Gaussian, so the KF equations do not hold.\n\nThe EKF linearises the models with a first-order Taylor expansion about the current estimate: Jacobians $G_t = \\partial g/\\partial x$ at $\\mu_{t-1}$ and $H_t = \\partial h/\\partial x$ at $\\bar\\mu_t$. Means go through the nonlinear functions ($\\bar\\mu = g(u, \\mu)$, innovation $z - h(\\bar\\mu)$); covariances and the gain use the Jacobians in place of $A$ and $C$. It is approximate and can diverge if strongly nonlinear or badly initialised.',
    keyPoints: [
      'motivation: real motion and sensor models are nonlinear; a Gaussian does not stay Gaussian',
      'linearise by first-order Taylor expansion (Jacobians) at the current mean',
      'means through the nonlinear $g$ and $h$; covariances and gain through $G$ and $H$',
      'Jacobians recomputed every step',
      'limitation: approximate, one Gaussian, can diverge',
    ],
    source: 'Review deck slide 5 (learning outcome)',
    marks: 3,
  },
  {
    id: 'filters-sa-pf',
    prompt: '**(3 marks)** In no more than 100 words: explain the motivation for the particle filter and describe how it is implemented.',
    wordLimit: 100,
    model: 'Gaussian filters hold only one peak, and the EKF’s linearisation fails for strongly nonlinear models, so they cannot handle multimodal beliefs such as global localisation. A particle filter represents the belief with $M$ samples (particles), so the belief can take any shape and any models can be used. Each step:\n\n1. **Sample:** move every particle through the motion model with randomly drawn noise (prediction).\n2. **Weight:** weight each particle by the sensor likelihood $p(z_t \\mid x_t^{[m]})$ (correction).\n3. **Resample:** draw $M$ particles with replacement, in proportion to the normalised weights, so unlikely hypotheses die out.',
    keyPoints: [
      'motivation: multimodal / non-Gaussian beliefs, strong nonlinearity',
      'belief = set of weighted samples',
      'sample through the motion model with noise',
      'weight by the sensor likelihood $p(z \\mid x)$',
      'resample in proportion to the weights',
    ],
    source: 'Review deck slide 5 (learning outcome)',
    marks: 3,
  },
  {
    id: 'filters-sa-sensor-noise',
    prompt: '**(2 marks)** In no more than 70 words: explain why changing the sensor noise assumed by a Kalman filter changes both the mean and the variance of its estimate.',
    wordLimit: 70,
    model: 'The sensor noise $Q$ enters the Kalman gain, $K = \\bar\\Sigma C^T(C\\bar\\Sigma C^T + Q)^{-1}$, and the gain appears in both corrections: the mean moves by $K(z - C\\bar\\mu)$ and the covariance becomes $(I - KC)\\bar\\Sigma$. A larger $Q$ gives a smaller $K$, so the mean moves less towards the reading and the variance shrinks less; a smaller $Q$ does the opposite.',
    keyPoints: [
      '$Q$ appears in the Kalman gain',
      'the gain scales the mean update $K(z - C\\bar\\mu)$',
      'the gain sets the covariance update $(I - KC)\\bar\\Sigma$',
      'direction: larger $Q$ → smaller $K$ → smaller step, less shrinkage',
    ],
    source: 'Similar to 2024 Q5, 2025 Q5 (asked there as an MCQ)',
    marks: 2,
  },
  {
    id: 'filters-sa-fusion',
    prompt: '**(2 marks)** In no more than 70 words: using the Kalman filter correction in one dimension, explain why combining a prediction with a measurement gives an estimate more certain than either on its own.',
    wordLimit: 70,
    model: 'With $C = 1$, $\\sigma^2 = (1 - K)\\bar\\sigma^2 = \\bar\\sigma^2 Q/(\\bar\\sigma^2 + Q)$, i.e. $1/\\sigma^2 = 1/\\bar\\sigma^2 + 1/Q$: the precisions of two independent sources add, so the result is below both $\\bar\\sigma^2$ and $Q$ (two equal variances give half). The mean is a precision-weighted average, $\\mu = (Q\\bar\\mu + \\bar\\sigma^2 z)/(\\bar\\sigma^2 + Q)$, lying between the prediction and the reading, closer to the more certain one.',
    keyPoints: [
      '$\\sigma^2 = \\bar\\sigma^2 Q/(\\bar\\sigma^2 + Q)$, or precisions add',
      'so the posterior variance is below both $\\bar\\sigma^2$ and $Q$',
      'the mean is a precision-weighted average of prediction and reading',
      'the sources must be independent (equal variances → half)',
    ],
    source: 'Original; related to 2024 Q22 (overlapping sensor readings)',
    marks: 2,
  },
  {
    id: 'filters-sa-kidnapped',
    prompt: '**(2 marks)** In no more than 70 words: a robot localising with a converged particle filter is picked up and carried to another room. Explain why the filter may fail to recover, and describe one remedy.',
    wordLimit: 70,
    model: 'After convergence every particle sits near the old pose and none near the new one. Weighting and resampling can only reweigh and copy existing particles, so the filter cannot jump to the true pose (particle deprivation). Remedy: inject a few uniformly random particles every step, more when the average likelihood of the readings drops, so some land near the new pose and are multiplied by resampling.',
    keyPoints: [
      'all particles are clustered at the old pose; none near the new one',
      'resampling can only copy existing particles (deprivation)',
      'remedy: inject random particles (adaptively, when the likelihood drops) or reinitialise',
      'the injected particles near the true pose get high weights and multiply',
    ],
    source: 'Original; Notes §2 (PF: kidnapped robot)',
    marks: 2,
  },
  {
    id: 'filters-sa-deprivation',
    prompt: '**(2 marks)** In no more than 70 words: what is particle deprivation in a particle filter? Give two ways to reduce it.',
    wordLimit: 70,
    model: 'Particle deprivation is when no particles remain near the true state, so the filter can neither represent it nor recover, because resampling only copies existing particles. It is caused by too few particles, a very peaked likelihood or resampling too often. Remedies: use more particles; resample only when the effective sample size is low (with low-variance resampling); inject a few random particles each step.',
    keyPoints: [
      'definition: no particles near the true state',
      'why it is fatal: resampling only copies existing particles',
      'a cause (too few particles, peaked likelihood, resampling too often)',
      'two remedies (more particles, resample less / low-variance, random injection)',
    ],
    source: 'Original; Notes §2 (PF weak spot)',
    marks: 2,
  },
];
