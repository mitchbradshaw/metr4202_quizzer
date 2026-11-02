# Authoring guide: METR4202 Robotics Lab

React 18 + TypeScript, bundled by esbuild into one self-contained `index.html` (forked from the MECH3200
Vibrations Lab engine). Every topic lives in `src/topics/<id>/` and exports one `TopicDef` (the content
contract is `src/engine/types.ts`). **`src/topics/plan/` is the reference implementation: copy its patterns.**
The build plan and the activity list per topic are in `SPEC.md`.

## Commands

The dependencies live outside Google Drive (Drive copes badly with `node_modules`). `scripts/toolchain.mjs`
finds them in `$M42_TOOLCHAIN`, the path in `.toolchain-path`, `~/source/m4202-toolchain`, or `./node_modules`.

```bash
node scripts/typecheck.mjs                    # tsc --strict over src/
node scripts/test.mjs                         # every self-test (same list as #/selftest); add a filter: test.mjs plan
node scripts/test.mjs plan --verbose          # print every check with its value
node scripts/build.mjs                        # -> index.html (open by double-clicking)
node scripts/crawl.mjs plan                   # headless Chrome/Edge: every route of a topic, console errors, overflow, frame times
node scripts/crawl.mjs plan --width 1440      # the wide end of the laptop range
node scripts/shot.mjs plan/explore/cspace out.png --width 1280 [--height 900] [--theme dark] [--full]
```

**Working in parallel with other agents** (they edit other topics at the same time):

```bash
M42_ONLY=kin node scripts/build.mjs --out <your-scratch>/kin.html     # other topics replaced by empty stubs
M42_ONLY=kin node scripts/test.mjs kin
node scripts/crawl.mjs kin --file <your-scratch>/kin.html --shots <your-scratch>/shots
node scripts/shot.mjs kin/explore/viewer <your-scratch>/viewer.png --file <your-scratch>/kin.html
node scripts/typecheck.mjs 2>&1 | grep "src/topics/kin\|src/core/kin"   # ignore errors in files you do not own
```

Rules while others are editing:
- **Edit only the files you own** (your topic folder, plus any new `src/core/<topic>*.ts` files you create).
  Do not edit `src/engine`, `src/ui`, `src/plot`, `src/anim`, `src/app`, `src/pages`, `src/styles.css`, other
  topics, or existing `src/core` files. If shared code has a bug or is missing something, work around it
  locally and **report it** in your final message.
- Write each file whole (Write tool), so the shared build never sees half-written syntax. Never use shell
  heredocs for TeX-heavy files: shells collapse `\\` and `'\\theta'` turns into a tab escape.
- Topic-specific CSS goes in `src/topics/<id>/styles.css`, imported from your `index.ts`
  (`import './styles.css';`). Prefix every class with the topic id (`.kin-viewer`, `.plan-grid`).
- If a build fails because of another agent's file, wait a minute and retry.

## Folder layout of a topic

```
src/topics/<id>/
  index.ts        TopicDef: { ...TOPIC_META.<id>, cards, flashcards, mcqs, games, shortAnswers, solve, explore }
  learn.ts        cards: ConceptCard[], flashcards: Flashcard[]
  quiz.ts         mcqs: MCQ[], games: Game[], shortAnswers: ShortAnswer[]
  solve.ts        generators: SolveGenerator[]   (may re-export from solve/*.ts)
  explore/        one React component per simulation + index.ts (ExploreItem[])
  selftests.ts    tests: SelfTest[]  (already wired into src/selftest/registry.ts)
  styles.css      optional, prefixed classes
```

Pure algorithms go in **`src/core/`** (no React, typed, SI units, radians). Shared ones already exist; read
them before writing your own: `prob` (Bayes tables, occupancy, log-odds), `gridloc` (2024 Q28 grid world),
`motion` (velocity and odometry models, sampling), `camera` (pinhole, K, projection), `graph` (BFS / DFS /
Dijkstra / A* / greedy with full step traces, grid adapters, heuristics, admissibility), `roadmaps` (the 2024
Brisbane and review-deck Australia graphs), `geom2d`, `cspace` (2-link arm FK/IK, C-space grids with link-1
vs link-2 attribution, planning on the torus), `sampling` (RRT/RRT* step events, PRM, by-hand helpers),
`local` (potential fields, DWA). New topic algorithms go in new files: `src/core/kin.ts`, `src/core/kalman.ts` …

## Notation (follow the course, not other textbooks)

- Belief `bel(x_t)`, predicted belief `\overline{bel}(x_t)`, normaliser `\eta`, motion model `p(x_t \mid u_t, x_{t-1})`,
  sensor model `p(z_t \mid x_t)`. Prediction (actuation, uncertainty grows), correction (measurement, shrinks).
- Kalman: **R = actuation/process noise covariance, Q = sensor/measurement noise covariance** (Thrun /
  lecture convention). `\bar\mu_t = A\mu_{t-1} + Bu_t`, `\bar\Sigma_t = A\Sigma_{t-1}A^T + R`,
  `K_t = \bar\Sigma_t C^T (C\bar\Sigma_t C^T + Q)^{-1}`.
- Occupancy: prior 0.5 ⇔ log-odds 0; `l_t = l_{t-1} + \ln\frac{p(m|z_t)}{1-p(m|z_t)} - l_0`. Sensor table rows are
  the true state (m, ¬m), columns the reading, each row sums to 1; false-positive rate = 1 − TN.
- Velocity model with (v, ω, γ): `x' = x - \frac{v}{\omega}\sin\theta + \frac{v}{\omega}\sin(\theta+\omega\Delta t)` etc.;
  radius r = v/ω; ω = 0 is a straight line. Odometry: (δrot1, δtrans, δrot2).
- Planning: A* `f = g + h`, Open/Closed tables, goal test when the goal is **popped**. RRT* "choose parent"
  minimises `c(x_near) + d(x_near, x_new)`; "rewire" if `c(x_new) + d(x_new, x_near) < c(x_near)`.
  2-link arm: θ1 from +x, θ2 relative to link 1, C-space axes θ1 (horizontal) and θ2 (vertical) on [0, 2π].
- Kinematics (Modern Robotics / lecture): screw axis `S = (\omega, v)`, revolute `v = -\omega \times q`, prismatic
  `\omega = 0`, v = unit direction; `M = \begin{bmatrix} R & p \\ 0 & 1 \end{bmatrix}` (columns of R are x̂_b, ŷ_b, ẑ_b
  in {s}); space form `T(\theta) = e^{[S_1]\theta_1}\cdots e^{[S_n]\theta_n} M`, body form `M e^{[B_1]\theta_1}\cdots`.
- Camera: `h' = f h / Z`; intrinsics K (focal length in pixels, principal point, skew); extrinsics R, t.
- RL: MDP `(S, A, T, R, \gamma)`, return `G_t = \sum_k \gamma^k r_{t+k+1}`,
  `Q(s,a) \leftarrow Q(s,a) + \alpha[r + \gamma\max_{a'}Q(s',a') - Q(s,a)]`, `\pi^*(s) = \arg\max_a Q^*(s,a)`.

Australian spelling (localisation, normalise, colour). Units outside the maths: `'$Z$ = 78.95 m'`.

## Text: the `Rich` format

All prose fields are `Rich` strings: `$inline TeX$`, `$$display TeX$$`, `**bold**`, `*italic*`, `` `code` ``,
a blank line for a new paragraph, `- ` bullets, `1. ` numbered lists. In TS string literals backslashes are
doubled: `'$\\theta_1$'`. A `*` glued to a letter or digit (A*, RRT*, PRM*) is always literal; write `\\*` for
any other literal star. `\\$` is a literal dollar sign. There are no Markdown tables: put tables in TeX
(`$$\\begin{array}{l|ccc} … \\end{array}$$`).

## Pedagogy rules (from the brief)

- Every simulation has a one-line **`notice`** ("what to notice"), shown above it. Required.
- Predict-then-reveal where it fits: at least **two** `<PredictReveal>` per simulation, with `onApply` that
  changes the simulation so the student sees the answer happen. Options are shown in a stable shuffled order
  (seeded by the prompt id), so write them in any order; pass `fixedOrder` only for ordered options (numbers).
- Explanations say **why**, not just what (every MCQ option has a `why`; every hint uses this instance's numbers).
- Formulas are KaTeX.

## Learn

- **Concept cards** (4–7 per topic, one idea each): `what`, `when` (the question cues that call for it), `how`
  (numbered steps, the "how to attack it" method from the summary notes), `traps` (mistake + why + source),
  `formulas` (display maths), optional `more`, `lecture` (e.g. 'Notes §5; review deck slide 15'),
  `exploreIds` / `solveIds` (links to this topic's sims and generators).
- **Flashcards** (20–30 per topic): crisp recall, parameter effects ("double Q: what happens to K?"), method
  choice, and the near-certain MCQ facts. Ids unique and stable (progress is keyed on them).

## Quiz

- **MCQs** (12–20 per topic, 1 mark each) in the paper's style: `style` is `correct`, `incorrect`
  ("which is FALSE / NOT"), `most-correct`, `value` or `best`. **Every option needs a `why`.** Original wording
  (the repo is public), paraphrasing recurring statements and citing them: `source: 'Recurring: 2023 Q9,
  2024 Q9, 2025 Q9'`. Options are shuffled; `fixedOrder: true` for "None/Both of the above". Keys must not be
  the longest option in more than 40 % of "pick the true one" items (a self-test checks this).
- **Games**: `sort` (cards into buckets, e.g. "localisation, mapping or SLAM?") and `match`. Every item has a `why`.
- **Short answers** (exam style, 3–8 per topic): `prompt`, `marks` (1–5, as on the paper), `wordLimit`,
  `model` (what you would write in the exam), `keyPoints` (3–5, self-marked), `source`.

## Solve generators (exam mode)

```ts
{
  id: 'plan-astar', title: 'A* by hand on a road map', tiers: [1, 2, 3],
  source: 'Similar to 2024 Q29; review deck slide 17', cardId: 'plan-astar', marks: 7,
  generate(rng, tier) { ... return { prompt, givens, figure, parts, hints: [concept, setup, substitution, worked] }; },
}
```

- Fixed ids that Home and the mock paper link to: `bayes-grid`, `bayes-classifier`, `slam-occupancy`,
  `plan-astar`, `plan-rrtstar`, `plan-steer`, `plan-cspace`, `kin-m`, `kin-screws`, `kin-arm-camera`,
  `vision-pinhole`. Prefix every other id with the topic id.
- Randomise with `rng.step(a, b, step)`, `rng.pick`, `rng.int`, `rng.nice` within the ranges the papers use.
  Same seed ⇒ same problem. Tier 1 = one formula / one step, tier 2 = paper style, tier 3 = a twist or trap.
- **Step-by-step entry**: one part per step the marker would look for (the prediction table, P(z), each
  posterior; or each A* expansion), each checked within tolerance. Probabilities: `absTol: 0.002` (or
  `tol: 0.005`); lengths and angles `tol: 0.01`. Accept the 4-significant-figure rounding the papers use.
- Part kinds: `numeric` (`unit`, `tol`/`absTol`, `traps: [{ value, message, trapId }]` for known wrong answers),
  `choice` (`why` per option), `order` (steps in order; the UI shuffles), `matrix` (tables; `rowLabels`,
  `colLabels`, `absTol`; **`symbolic: { vars: ['L1','L2'], answer: [['0','-L1',…]] }`** lets the student type
  `-L1` or `L2+L3` and checks by evaluating at hidden values — use it for M and screw-axis tables), and
  **`custom`** (`render: (props: CustomPartProps) => JSX` for interactive answers such as filling an A*
  Open/Closed table or labelling C-space boxes; call `props.onResult({ correct })` once per check and keep
  typed state in `usePersisted(props.pkey + ':x', …)`).
- `figure`: a component drawn for this instance (graph, workspace, tree, arm). Draw it from the instance data;
  never embed scanned figures. For long problems set `layout: 'side'` on the instance: the figure then stays in a
  sticky column next to the parts.
- Choice parts: `fixedOrder: true` keeps the written order ("Arm (a)–(d)", True/False); `compact: true` lays short
  options out in a grid.
- **Hints are exactly four** and use this instance's numbers: concept → set-up (the formula with symbols) →
  substitution (numbers in) → full worked solution (tables in TeX, **bold final answers with units**).
- Long multi-part templates: `sprint: false`.
- **Traps**: give numeric `traps` and MCQs a `trapId` from `src/engine/traps.ts` (`likelihood-column`,
  `contributions-add`, `normalise`, `false-positive`, `prior-0-1`, `r-vs-q`, `markov`, `radians`, `carry-theta`,
  `omega-zero`, `radius-sign`, `goal-on-insert`, `manhattan-diagonal`, `bfs-weights`, `rrt-nearest`,
  `endpoint-collision`, `cspace-band-blob`, `v-cross-sign`, `diagonal-axis`, `b-frame-q`, `depth-from-camera`,
  `extrinsic-pose`, `mdp-tuple`, plus the generic `unit-scale`, `percent`, `sign`, `sqrt`, `factor2`). The trap
  log shows them by name; an unknown id still shows with a fallback title.

## Explore (simulations)

`explore/index.ts` lists `{ id, title, summary, notice, component, challenge?, minutes }`.

Building blocks: `src/ui/kit.tsx` (`SimLayout`, `Slider` with `tex` + `tip` (and `stacked` for long labels in narrow
panels), `NumField` (a number box that accepts half-typed decimals like "0."), `Segmented`, `Toggle`, `Select`,
`Readouts`/`Readout` with units, `Legend`, `Callout`, `More`), `src/ui/stepper.tsx` (`useStepper(n)` +
`<StepControls st={…}/>` for step/play/back through a precomputed trace), `src/plot/Plot.tsx` (SVG plots:
`Line`, `Area`, `Bars`, `Dot`, `VLine`, draggable `Handle` with pointer + arrow keys), `src/anim/hooks.ts`
(`useRaf`, `useFrameThrottled`, `useWidth`), `src/ui/theme.ts` (`useThemeColors(['--m1', …])` for canvas and
three.js), `src/ui/PredictReveal.tsx`, `completeChallenge(id)` from `src/app/store`.

Requirements:
- **60 fps, never block input.** Per-frame updates go through refs inside `useRaf`, not setState. Big grids
  (C-space, potential fields, occupancy maps, Q heatmaps) go to a `<canvas>` via `ImageData`. Throttle
  slider-driven recomputation (`useFrameThrottled` or `useDeferredValue`). Precompute traces once per input.
- **Laptop only.** Design for 1280–1440 px wide windows with no horizontal overflow; there is no phone or
  tablet layout to build or test. Use `viewBox` + `width="100%"` for SVG. Dragging uses pointer events
  (mouse); keep keyboard access (focusable handles, arrow keys) and don't hide essential information behind
  hover alone.
- Every number has a unit; every symbol has a tooltip (`tip`). Readouts in monospace.
- Colour carries meaning only: `--m1 … --m4` for categorical series (consistently within a topic),
  `--accent` for interactive handles, `--ok` / `--bad` for right/wrong (always with an icon or text too),
  `--pred` dashed for a prediction, `--text-3` for reference geometry. Never hard-code colours.
- Zero console errors; KaTeX must not render errors (the crawler counts `.katex-error`).

## Self-tests

`src/selftest/katex.ts` renders every TeX fragment in every topic (static content and generated problems over
several seeds and tiers) and flags an unmatched dollar sign; keep it passing.

Add `SelfTest`s to `selftests.ts` with reference values and their source (worked solutions, review deck, notes)
using `near`, `nearAbs`, `isTrue` from `src/selftest/assert.ts`. Include a **generator sanity test**: every
generator, every tier, ~40 seeds → it generates, every numeric answer is finite, there are exactly 4 hints,
symbolic answers evaluate, and the parts' own answers pass their own checkers.

## Source material

- Text extractions (UTF-8) of every source:
  `C:/Users/mmebr/AppData/Local/Temp/claude/G--My-Drive-PROJECTS-Code-Projects-4202-quizzer--claude-worktrees-metr4202-study-game-68e550/3f2ef63a-e08b-4a84-8254-0d0944cb018c/scratchpad/txt/`
  (`METR4202_summary_notes.txt`, `METR4202_202{2,3,4,5}_solutions.txt`, `Semester_Two_Examinations_202{3,4,5}_METR4202.txt`,
  `Semester_Two_Final_Examinations_2022_METR4202.txt`, `Review_and_Exam_Practice_Questions_Solutions.txt`).
- Rendered exam figures: `…/scratchpad/img/*.png`. Originals: `G:/My Drive/UQ/Sem2_2026/METR4202/*.pdf` and
  `C:/Users/mmebr/Downloads/Review_and_Exam_Practice_Questions_Solutions.pdf`.
- The engine this was forked from (good examples of simulations, generators and quiz content):
  `…/scratchpad/ref3200/src/topics/` (e.g. `A1/explore/MassSpring.tsx`, `A4/explore/AbsorberTuning.tsx`, `A1/solve.ts`).
