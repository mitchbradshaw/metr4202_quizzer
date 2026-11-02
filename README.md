# METR4202 Robotics Lab

An interactive study game for UQ **METR4202 Robotics & Automation**, built from the exam summary notes, the
lecturer's review deck (19/10/2026) and the 2022–2025 papers with their worked solutions. Its purpose is
intuition: what each method does, how its parameters change its behaviour, when to use it over the alternatives,
and how to solve the exam's templates by hand.

- Move a slider and watch a belief, filter, planner or arm respond.
- Predict an outcome before it is revealed.
- Solve exam-style problems step by step, with each step checked.
- Drill definitions with flashcards and multiple-choice questions.

## Opening it

Double-click **`index.html`** (Chrome, Edge, Firefox or Safari on a laptop). Everything, including the maths
fonts and three.js, is inside that one file, so it works offline with no install. It is designed for laptop
screens (1280–1440 px wide).

Progress (flashcard boxes, attempts, mastery, the trap log, streak, sprint history) is saved in the browser's
local storage. Use **⚙ Settings → Export / Import progress** to back it up or move it to another browser.

GitHub Pages: `.github/workflows/pages.yml` builds, tests and publishes `index.html` on every push to `main`
once Pages is switched on (Settings → Pages → Source: GitHub Actions).

## What's in it

**Home** is the topic selector: one tile per topic (in the order of the summary notes, tagged by where it sits on
the see–think–act loop) with a mastery ring and a progress overview (flashcards learned, problems and MCQs right,
challenges done). It also links the four **templates that recur every year** (about 45 of the 80 marks) straight
to their exam-mode generators, and opens:

- **Mixed review**: flashcards that are due across all topics, plus items from your weakest topics.
- **Quick sprint**: about 12 auto-marked items in 20 minutes, weighted towards weak topics.
- **Mock paper**: the real format at exam pace (1.5 min per mark, 120 minutes): 20 MCQs in the paper's topic
  split, about 20 marks of short answers (self-marked against key points), and the three long-answer templates
  with fresh numbers.

Every topic opens a hub with four tabs (bookmarkable, e.g. `#/plan/explore/cspace`):

| Tab | What it does |
|---|---|
| **Learn** | Concept cards (what it is, the exam cues that call for it, the "how to attack it" steps, common traps, formulas) and Leitner flashcards reviewed after 0, 1, 3, 7 and 14 days. |
| **Explore** | Simulations, each with a one-line "what to notice" and predict-then-reveal prompts whose "Show me" button makes the answer happen in the simulation. |
| **Solve** | Exam mode: randomised numbers, one part per marked step, each checked within a tolerance, a four-step hint ladder ending in the full worked solution, an optional exam-pace timer, and a seed so any problem can be replayed. Tables accept symbols (type `-L1` or `L2+L3` in an M or screw-axis table). |
| **Quiz** | MCQs in the paper's style with a reason for every option, sorting and matching games, and exam-style short answers with a model answer and key points. |

Other screens: the **trap log** (`#/traps`, every named mistake the app has caught in your answers), the
**session summary** and the **self-test** page (`#/selftest`), which runs every algorithm against reference
values from the papers, including all of these:

| Case | Expected |
| --- | --- |
| Occupancy update, TP 0.85, TN 0.99 | OCCUPIED → 0.9884, then FREE → 0.9281 (exact arithmetic gives 0.92795; the slide carries the rounded 0.9884) |
| 2023 Q31, TP 0.70, TN 0.95 | 0.9333, then 0.8155 |
| Velocity model from (0, 0, 0), v 0.8, ω 0.03, 2 s | (1.5990, 0.04799, 0.06) |
| 2023 Q32 two-step motion | (3.4642, −2.3427, 0.3) → (4.4525, −2.2435, −0.1) |
| 2024 Q28 grid localisation | P(white) = 0.535; C2 0.1271, B2 0.0318, G3 0.6729, F3 0.1682 |
| 2024 Q29 A* | KG → GP → SB → MG, 13.8 km |
| 2025 Q28 fruit classifier | after B: 0.0723 / 0.9036 / 0.0241; after A: 0.4832 / 0.5034 / 0.0134; suction 0.811 vs pinch 0.743 |
| 2025 Q29 RRT* | parent x_b, cost 5.0; rewire x_d to 8.5 |
| Pinhole, JWST | 0.0309 m |
| Pinhole, 2024 Q30 | Z = 78.95 m |

Plus: the review deck's A* (Hobart → Melbourne → Broken Hill → Alice Springs, 2600 km), every exam robot's M and
screw-axis table (2023 Q33, 2024 Q30, 2025 Q30, the review deck's {b}-frame table, 2022 Q10 and Q33–Q35), PoE
space = body form, Jacobians against finite differences, and Newton–Raphson convergence.

## Topics and content

Generated from the content by `node scripts/inventory.mjs`.

| Topic | Concept cards | Flashcards | Simulations | Problem types | MCQs | Games | Short answers |
|---|---|---|---|---|---|---|---|
| bayes Probability and the Bayes filter | 7 | 30 | 5 | 4 | 22 | 3 | 10 |
| filters Kalman, EKF and particle filters | 5 | 30 | 4 | 3 | 22 | 3 | 10 |
| models Motion and sensor models | 5 | 30 | 4 | 4 | 22 | 3 | 10 |
| slam Mapping and SLAM | 6 | 30 | 4 | 3 | 22 | 3 | 10 |
| plan Motion planning | 7 | 32 | 8 | 9 | 22 | 3 | 10 |
| kin Forward and inverse kinematics | 7 | 30 | 6 | 9 | 22 | 3 | 10 |
| vision Robot perception and vision | 6 | 30 | 5 | 3 | 22 | 3 | 10 |
| rl Reinforcement learning | 7 | 30 | 3 | 4 | 21 | 3 | 9 |
| multi Multi-robot and multi-agent systems | 4 | 27 | 2 | 0 | 18 | 2 | 10 |
| **Total** | 54 | 269 | 41 | 39 | 193 | 26 | 89 |

### bayes Probability and the Bayes filter (Notes §1)
- **Explore:** Bayes’ rule, term by term (challenge: Label all four terms of Bayes’ rule correctly); Corridor localisation: predict, then correct; Grid-world localisation (2024 Q28), editable; Classifier sequence and the gripper decision (2025 Q28); Does this break the Markov assumption?
- **Solve:** Grid-world localisation: predict, then correct; Classifier updates and a gripper decision; Probability rules from a joint table; Corridor: one predict and one correct step
- **Learn:** Belief: a distribution, not a best guess; Probability rules: product, independence, marginalisation; Bayes’ rule: prior, likelihood, evidence, posterior; The Markov assumption: what breaks it and what does not; The Bayes filter: predict, then correct; Discrete Bayes by hand: the 15-mark long answer; Decisions from a belief: expected value and total probability

### filters Kalman, EKF and particle filters (Notes §2)
- **Explore:** The 1-D Kalman filter: predict, measure, update; EKF: where linearisation fails; Particle filter: sample, weight, resample; Which filter would you pick? (challenge: Get all nine scenario cards right in one round)
- **Solve:** 1-D Kalman filter by hand; Particle filter: weight and resample by hand; Which filter, and why?
- **Learn:** Kalman filter: the Bayes filter with one Gaussian; The gain as a trust dial: what R and Q do; Extended Kalman filter: linearise at the mean; Particle filter: sample, weight, resample; KF, EKF or PF? Choosing a filter

### models Motion and sensor models (Notes §3)
- **Explore:** Velocity model: arcs of radius v/ω; Velocity vs odometry models; Beam model: the four-part mixture (challenge: Fit a hidden sensor by hand to within 0.02 of EM’s log-likelihood per reading); Scan models: likelihood field, beam and landmarks (challenge: Hide the true pose and find the robot to within 0.25 m and 0.15 rad using the score alone)
- **Solve:** Velocity motion model by hand; Odometry motion model: rotate, translate, rotate; Beam model: the mixture at a reading; Which model? Velocity, odometry and sensor models
- **Learn:** Motion and sensor models in the Bayes filter; Velocity motion model: arcs of radius v/ω; Odometry motion model: rotate, translate, rotate; Beam-based sensor model: a four-part mixture; Likelihood-field (scan-based) and landmark models

### slam Mapping and SLAM (Notes §4)
- **Explore:** One occupancy cell, reading by reading (challenge: Find a sensor for which OCCUPIED then FREE ends below 0.5); Lidar ray-cast grid builder; Drift and loop closure; Localisation, mapping or SLAM? (challenge: Classify all eleven scenarios correctly (SLAM ones including online vs full))
- **Solve:** Occupancy cell: Bayes and log-odds, reading by reading; Log-odds arithmetic; Localisation, mapping or SLAM?
- **Learn:** Localisation, mapping or SLAM? Online vs full SLAM; Occupancy grids: the binary Bayes update; Log-odds: the additive update, and why OCCUPIED then FREE stays high; Data association and loop closure; SLAM techniques: EKF-SLAM, FastSLAM, graph SLAM; Mapping in the real world: practical issues and sources of uncertainty

### plan Motion planning (Notes §5)
- **Explore:** Grid search lab: BFS, DFS, Dijkstra, A* (challenge: Edit a map until greedy best-first’s path costs at least 1.5 × the optimum); Heuristic lab: admissible or not?; A* by hand on a road map (challenge: Drive A* on a random map with every pop and every f right first time); Workspace ↔ C-space for a 2-link arm (challenge: Go round: move the arm from S to G through θ₁ = 0 ≡ 2π without touching anything); PRM, RRT and RRT*: watch them grow; RRT vs RRT*: choose parent and rewire; Potential fields and local minima (challenge: Build a trap: with at most two obstacles, make plain descent stall more than 1.5 m from the goal); Dynamic window approach
- **Solve:** A* by hand on a road map; RRT vs RRT*: choose parent and rewire; Label the C-space of a 2-link arm; RRT steering with the velocity model; Which node next? BFS, DFS, Dijkstra and A* by hand; Is this heuristic admissible?; Why not BFS? Fewest roads against shortest; Global or local? Choosing the planner; Dynamic window by hand
- **Learn:** Workspace vs configuration space (2-link arm); Graph search: BFS, DFS, Dijkstra and A*; Heuristics: admissible, consistent, inflated; A* by hand: Open and Closed tables; Sampling-based planning: PRM and RRT; RRT*: choose parent, rewire, steer; Global vs local: potential fields, DWA, velocity obstacles

### kin Forward and inverse kinematics (Notes §6)
- **Explore:** 3D arm viewer: joints, screw axes and frames; Build M: read the frames like the exam; Fill the screw-axis table, in {s} and in {b}; Product of exponentials, one factor at a time; Newton–Raphson IK, iteration by iteration; Closed-form IK or not? (Pieper) (challenge: Classify all nine arms correctly)
- **Solve:** Build M: the end-effector frame at the zero configuration; Screw-axis table: S = (ω, v) for every joint; The arm + camera long answer: M, screw table, pinhole camera; Forward kinematics by the product of exponentials; One column of the space Jacobian; Forward or inverse kinematics?; How many IK solutions? Reach, redundancy and singularities; Closed-form IK? (Pieper’s criterion); One Newton–Raphson IK step by hand
- **Learn:** Forward vs inverse kinematics; Reading the frames and writing M; Screw axes: revolute and prismatic joints; Product of exponentials: space and body forms; The arm + camera long answer (15 marks); Closed-form IK: Pieper’s criterion; Numerical IK: Newton–Raphson, the Jacobian and singularities

### vision Robot perception and vision (Notes §7)
- **Explore:** Pinhole camera: h' = f h / Z; Intrinsics vs extrinsics; World to pixel, step by step (3-D); Visual servoing: PBVS vs IBVS; Sensors compared, and fiducial markers
- **Solve:** Pinhole camera: image size, distance or focal length; World point to pixel (and back) with K, R, t; What one image can tell you, perspective effects, visual servoing
- **Learn:** Robot sensors: what each measures, and the 3-mark comparison; The pinhole model: h′ = f h / Z; Intrinsics, extrinsics and camera calibration; Perspective: what one image keeps and what it loses; Visual servoing: PBVS vs IBVS; Fiducial markers: pose from one image (PnP)

### rl Reinforcement learning (Notes §8)
- **Explore:** Gridworld: Q-learning vs value iteration (challenge: Find the discount factor at which S’s best exit flips on the two-exit map (±0.01)); The MDP tuple: what is in (S, A, T, R, γ)? (challenge: Tag all 11 parts of the scene correctly); Sim-to-real: friction you did not train for (challenge: Sort all ten scenario cards correctly)
- **Solve:** Discounted return by hand; One Q-learning update (or two); Greedy and ε-greedy policies from a Q table; Bellman backup and value-iteration sweep
- **Learn:** The RL problem and the MDP tuple; The return and the discount factor γ; Value functions V and Q, and the optimal policy; TD learning, Q-learning and ε-greedy exploration; A policy vs a motion-planner path; The Markov assumption and designing the state; RL on real robots: challenges, sim-to-real and fixes

### multi Multi-robot and multi-agent systems (Notes §9)
- **Explore:** Task allocation: explicit vs implicit coordination (challenge: Find a dropout at which the explicit team wastes more distance than the implicit one (same layout)); Credit assignment: whose work earned the team reward?
- **Learn:** What gets harder with many robots; Implicit vs explicit coordination; Task allocation, auctions and communication load; Multi-agent RL, credit assignment and belief-space planning

## Status and known gaps

- All nine topics are built. The motion-planning, kinematics, Bayes and SLAM topics were each checked by a
  separate review-and-fix pass (independent recomputation of every generated problem, browser screenshots and
  interaction scripts). Motion models, vision, filters, RL and multi-robot were built and self-verified by their
  authors, but have not had that extra review pass yet.
- The three-lens independent review round (student, robotics tutor, UX/performance engineer) has not been run.
- Multi-robot has no numeric exam mode by design: its exam practice is the short answers.
- Checks: 169 self-tests (1302 checks) incl. the ten ground-truth values, a test that renders every TeX fragment,
  a crawl of all 268 routes (no console errors, overflow or TeX errors) and the Playwright smoke test (10/10).

## Building from source

```bash
npm install            # React 18, KaTeX, three.js, esbuild, TypeScript, Playwright
npm run build          # -> index.html (single self-contained file)
npm test               # every self-test under Node (same list as #/selftest)
npm run typecheck
npm run smoke          # Playwright smoke test: opens every topic and every activity
node scripts/crawl.mjs plan --width 1440    # headless crawl of one topic: console errors, overflow, frame times
node scripts/shot.mjs plan/explore/cspace out.png --width 1280 --theme dark
```

This folder lives on Google Drive, which copes badly with `node_modules`. The scripts find the dependencies in
`$M42_TOOLCHAIN`, in the folder named in `.toolchain-path`, in `~/source/m4202-toolchain`, or in `./node_modules`,
so you can `npm install` in a local folder outside Drive.

The stack is React 18 + TypeScript, bundled by esbuild into one file with inline JS, CSS and KaTeX fonts (forked
from the MECH3200 Vibrations Lab engine). The algorithms (Bayes filters, Kalman and particle filters, motion and
sensor models, occupancy mapping, graph search, C-space, RRT/RRT*/PRM, potential fields, DWA, PoE kinematics and
IK, the pinhole camera, Q-learning) are pure typed functions in `src/core/`, separate from the UI and unit-tested.
Simulations draw with SVG, canvas `ImageData` for large grids, and three.js for the 3-D arm and camera views.
`docs/AUTHORING.md` explains how to add questions, generators and simulations; `SPEC.md` is the build plan.
