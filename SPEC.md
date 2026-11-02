# METR4202 Robotics Lab: build plan

**Goal.** An intuition-first study game for UQ METR4202 (Robotics & Automation). You move a slider and watch a belief, filter,
planner or arm respond; predict before you see; solve exam problems step by step with every step checked; and drill
definitions. It will be used for 10–15 hours over about two weeks before the exam, on a laptop only (no phone or tablet layouts).

**Sources.** The 2022–2025 papers and worked solutions, the lecturer's review deck (19/10/2026), the exam summary notes and
the course profile. The 2022 paper only counts for kinematics. Every question is original wording that cites the
past questions it mirrors (the repo is public). Figures are redrawn, never scanned.

## Decisions from the grilling round

| Decision | Choice |
| --- | --- |
| Time budget | ~2 weeks, 10–15 h. All 9 topics, with depth concentrated on the four recurring templates (≈45 of 80 marks). |
| Engine and look | Fork 3200_quizzer: React 18 + TypeScript, esbuild into one self-contained `index.html`, same UI kit and tabs. |
| 3D | three.js for the arm viewer and the M / screw-axis exercises, plus a 3D camera frustum in the world-to-pixel pipeline. Everything else is 2D SVG or canvas. |
| Deployment | Commit, push and open a PR; a GitHub Pages workflow (switched on by you). |
| Devices | Laptop only, 1280–1440 px wide (decided after the grilling round): no phone or tablet layouts, touch or narrow-width testing. |
| Topic order | Planning → Kinematics → Bayes → Mapping → Motion & sensor models → Perception → Filters → RL → Multi-robot. |
| Exam mode | Untimed with an optional 1.5 min/mark pace timer. Home adds a 20-min Quick sprint and a 120-min Mock paper in the real format. |
| No-long-answer topics | Numeric exam mode wherever a hand calculation fits (KF update, particle weights, Q-learning step, returns); self-marked short answers everywhere; multi-robot gets short answers only. |

## Architecture

```
src/
  core/        pure, typed algorithms (no React): prob, motion, sensor, kalman, particle, mapping, graph,
               cspace, sampling, local, se3, linform, camera, rl, multirobot, linalg
  engine/      content contract (types), answer checking, expression parser (now with variables), rng, traps
  ui/          kit (Slider, Readout, SimLayout...), inputs, SolveRunner, MCQ, flashcards, games, PredictReveal
  plot/        SVG plotting;  anim/  rAF loop that pauses off-screen
  app/         hash router, progress store (localStorage, in-memory fallback)
  pages/       Home (topic selector + progress overview + "do these first"), TopicHub, Review, Sprint/Mock, Misc
  topics/<id>/ one folder per topic: index, learn (cards + flashcards), quiz (MCQs, games, short answers),
               solve (exam-mode generators), explore/ (sims), selftests
  selftest/    registry + runner; the same tests run under Node (`npm test`) and at #/selftest
scripts/       build (single file), test, typecheck, serve, crawl (headless perf/overflow), shot
tests/         Playwright smoke test (every topic, every activity)
```

- **Topic ids** follow the summary-note sections: `bayes` (1), `filters` (2), `models` (3), `slam` (4), `plan` (5),
  `kin` (6), `vision` (7), `rl` (8), `multi` (9), grouped on Home by the see–think–act loop.
- **Each topic hub** has the four 3200 tabs: **Learn** (concept cards with "how to attack it" steps, Leitner flashcards),
  **Explore** (sims, each with a one-line "what to notice" and predict-then-reveal), **Solve** (exam mode: randomised
  numbers, step-by-step parts checked within tolerance, a 4-step hint ladder ending in the worked solution, optional pace
  timer) and **Quiz** (MCQs with a reason for every option, sorting games, self-marked short answers).
- **New answer types:** expressions with symbols (type `-L1` or `L2+L3` in a screw-axis or M table; checked by
  evaluating at hidden random lengths), per-cell absolute tolerances for belief tables, and a `custom` part for
  interactive answers (A* Open/Closed table, C-space box labelling).
- **Performance:** per-frame work goes through refs in a rAF loop; heavy grids (C-space, potential fields) go to canvas
  `ImageData`; slider-driven recomputation is throttled to one per frame. Layouts target laptop widths (1280–1440 px).
- **Persistence:** progress per topic in localStorage (`m42lab.v1`), with export and import. Home shows mastery rings
  per topic plus cards due, streak and traps beaten.

## Ground-truth tests (must always pass)

| Case | Expected |
| --- | --- |
| Occupancy update, TP 0.85, TN 0.99 | OCCUPIED → 0.9884, then FREE → 0.9281 |
| 2023 Q31, TP 0.70, TN 0.95 | 0.9333, then 0.8155 |
| Velocity model from (0, 0, 0), v 0.8, ω 0.03, 2 s | (1.5990, 0.04799, 0.06) |
| 2023 Q32 two-step motion | (3.4642, −2.3427, 0.3) → (4.4525, −2.2435, −0.1) |
| 2024 Q28 grid localisation | P(white) = 0.535; C2 0.1271, B2 0.0318, G3 0.6729, F3 0.1682 |
| 2024 Q29 A* | KG → GP → SB → MG, 13.8 km |
| 2025 Q28 fruit classifier | after B: 0.0723 / 0.9036 / 0.0241; after A: 0.4832 / 0.5034 / 0.0134; suction 0.811 vs pinch 0.743 |
| 2025 Q29 RRT* | parent x_b, cost 5.0; rewire x_d to 8.5 |
| Pinhole, JWST | 0.0309 m |
| Pinhole, 2024 Q30 | Z = 78.95 m |

Extra checks: the review-deck A* (Hobart → Melbourne → Broken Hill → Alice Springs, 2600 km), M and screw axes for the
2023/2024/2025 arms and the review deck's {b}-frame table, and PoE(θ = 0) = M.

## Activities per topic

**5. Motion planning (vertical slice, highest priority)**
- Explore: grid search lab (BFS / DFS / Dijkstra / A* / greedy, step through open and closed sets, f = g + h on cells,
  weighted terrain); heuristic lab (Euclidean, Manhattan, octile, zero, inflated ε; marks cells where h overestimates);
  A* by hand on a road map (the exam's Open/Closed tables); **linked 2-link arm workspace ↔ C-space** (drag obstacles,
  link-1 bands vs link-2 blobs coloured differently, click C-space to pose the arm, plan in C-space and play the path);
  PRM / RRT / RRT* growth with choose-parent and rewire highlighted and path cost over time; potential fields with a
  local-minimum trap; dynamic window approach.
- Solve: A* by hand (road maps incl. 2024 Brisbane and the review deck's Australia), RRT vs RRT* parent + rewire,
  C-space labelling from a random workspace, velocity-model RRT steering (2023 Q32), heuristic admissibility.
- Quiz: MCQs, "which planner?" sort, short answers (Manhattan heuristic, PRM vs grid, warehouse fleet design, collision
  checking along edges, RRT suboptimality).

**6. Kinematics** — three.js arm viewer with joint sliders and screw axes; Build M and fill the screw-axis table on the
exam robots in {s} and {b}, plus random axis-aligned arms; PoE stepper; Newton–Raphson IK viewer on a planar arm with
singularity and initial-guess effects; Pieper "closed form or not?" cards. Solve: M, screw table, PoE at a configuration,
Jacobian column, the arm → camera chain.

**1. Probability & Bayes** — 1D/2D grid localisation with motion noise and sensor accuracy sliders, predict and correct
stepped separately; Bayes-rule term labelling; Markov "does this break it?" cards; the classifier + decision template
(2025 Q28). Solve: grid localisation (2024 Q28), multi-measurement classifier + gripper choice, total probability.

**4. Mapping & SLAM** — occupancy-cell updater with TP/TN sliders and log-odds bar (why OCCUPIED-then-FREE stays high);
lidar ray-cast grid builder; drift + loop closure, including a false closure; "localisation, mapping or SLAM?" sort.
Solve: occupancy sequences (2023 Q31 style), log-odds, likelihood ratios.

**3. Motion & sensor models** — velocity-model arc drawer with (v, ω, Δt) and a noise-sample cloud; velocity vs odometry;
beam-model mixture plotter. Solve: velocity model single/multi-step, odometry (rot1, trans, rot2), beam mixture values.

**7. Perception** — pinhole sandbox (f, Z, h, h'); intrinsics vs extrinsics; world-to-pixel pipeline with a 3D frustum;
PBVS vs IBVS trajectories; sensor comparison cards. Solve: pinhole size/depth/focal length, pixel projection with K.

**2. Kalman / EKF / particle filters** — 1D KF with R and Q sliders (prior, likelihood, posterior, gain K); EKF on a
nonlinear model showing linearisation failure; 2D particle filter with sample → weight → resample and global
localisation; "which filter?" cards. Solve: 1D KF predict + update, particle weights and resampling.

**8. Reinforcement learning** — gridworld with γ, α, ε sliders, live Q heatmap and policy arrows; MDP-tuple quiz;
sim-to-real scenarios. Solve: discounted return, one Q-learning update, one value-iteration sweep.

**9. Multi-robot** — task allocation with implicit vs explicit coordination and a comms-dropout slider; credit
assignment explainer. Short answers only in exam mode.

**Every topic** also gets flashcards (Leitner, 0/1/3/7/14 days), an MCQ bank cited to the papers, and exam-style short
answers with a model answer and key-point checklist.

## Build order

1. Fork the engine, retitle, add the new answer types, core module and the ground-truth tests.
2. **Planning, end to end** (sims, exam mode, MCQs, flashcards, cards, short answers), click through it, fix.
3. Kinematics (three.js), then the other topics in priority order, in parallel where they don't share files.
4. Home progress overview, "do these first", Quick sprint and the 120-min Mock paper.
5. Playwright smoke test (every topic, every activity), crawl for console errors / overflow / frame times at laptop
   widths, Pages workflow, README.
6. Three independent review agents (student, tutor, UX/perf), fix, second round if any score < 8.
