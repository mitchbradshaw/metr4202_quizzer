// The content contract. Every topic module (src/topics/<code>/index.ts) exports one TopicDef.
// See docs/AUTHORING.md for how to write each kind of item.
import type { ComponentType } from 'react';
import type { Part, Tier, TopicCode } from './codes';
import type { Rng } from './rng';

export type { Part, Tier, TopicCode } from './codes';

/**
 * Text with light markup, rendered by <Rich>:
 *   $inline TeX$, $$display TeX$$, **bold**, *italic*, `code`,
 *   a blank line starts a new paragraph, lines starting "- " are bullets, "1. " numbered.
 * Write `\\$` for a literal dollar sign.
 */
export type Rich = string;

/** A named trap from the summary notes' checklist or a topic. Used by the trap log. */
export interface TrapDef {
  id: string;
  title: string;
  detail?: Rich;
}

// ---------------------------------------------------------------- Learn

export interface ConceptCard {
  id: string;
  title: string;
  /** What it is (1-3 sentences). */
  what: Rich;
  /** When to use it: the question cues that call for it. */
  when: Rich;
  /** How to use it: numbered steps. */
  how: Rich[];
  /** Common traps: the mistake, why it is wrong, where it cost marks. */
  traps: { title: string; detail: Rich; trapId?: string; source?: string }[];
  /** Key formulas, usually display maths $$...$$. Shown at the top as the "formula box". */
  formulas?: Rich[];
  /** Extra depth behind a "More" toggle. */
  more?: Rich;
  /** Reader reference, e.g. "LA7 Eq 7.1". */
  lecture?: string;
  /** Explore item ids in this topic that show the idea in action. */
  exploreIds?: string[];
  /** Solve generator ids in this topic that practise it. */
  solveIds?: string[];
}

export interface Flashcard {
  id: string;
  front: Rich;
  back: Rich;
  tags?: string[];
}

// ---------------------------------------------------------------- Quiz

export interface MCQOption {
  text: Rich;
  correct: boolean;
  /** Why this option is right or wrong. Required for EVERY option. */
  why: Rich;
}

export interface MCQ {
  id: string;
  /** Drives the instruction line, e.g. 'incorrect' -> "Which statement is INCORRECT?". */
  style: 'correct' | 'incorrect' | 'most-correct' | 'value' | 'best';
  stem: Rich;
  options: MCQOption[];
  /** Citation of similar past questions, e.g. "Similar to 2023 B1.8 (recurs 2022 B1.7, 2024 B1.8)". */
  source: string;
  difficulty?: Tier;
  /** Keep the given option order (e.g. "None of the above" must stay last). */
  fixedOrder?: boolean;
  trapId?: string;
  /** Marks in the mock paper (default 1, as on the METR4202 paper). */
  marks?: number;
}

export interface SortGame {
  kind: 'sort';
  id: string;
  title: string;
  prompt: Rich;
  buckets: { id: string; label: Rich }[];
  items: { id: string; text: Rich; bucket: string; why: Rich }[];
  source?: string;
}

export interface MatchGame {
  kind: 'match';
  id: string;
  title: string;
  prompt: Rich;
  pairs: { id: string; left: Rich; right: Rich; why?: Rich }[];
  source?: string;
}

export type Game = SortGame | MatchGame;

/** Word-limited short answer, self-marked against key points (A3-style). */
export interface ShortAnswer {
  id: string;
  prompt: Rich;
  wordLimit?: number;
  model: Rich;
  keyPoints: string[];
  source: string;
  marks?: number;
}

// ---------------------------------------------------------------- Solve

export interface NumericPart {
  kind: 'numeric';
  id: string;
  label: Rich;
  /** Correct value, expressed in `unit`. */
  answer: number;
  /** Unit of `answer` ('' for dimensionless). Frequencies: 'Hz' | 'rad/s' | 'rpm'. */
  unit: string;
  /** Frequency answer: the student may answer in Hz, rad/s or rpm (converted before checking). */
  freq?: boolean;
  /** Relative tolerance (default 0.02 = ±2 %). */
  tol?: number;
  /** Absolute tolerance, for answers that may be ~0. */
  absTol?: number;
  /** Known wrong answers (in `unit`) and the trap each one reveals. Checked before the generic traps. */
  traps?: { value: number; message: Rich; trapId?: string }[];
  marks?: number;
}

/** Pick the formula / method / statement. */
export interface ChoicePart {
  kind: 'choice';
  id: string;
  label: Rich;
  options: { text: Rich; correct: boolean; why?: Rich }[];
  /** Several correct options; all must be selected. */
  multi?: boolean;
  marks?: number;
}

/** Put derivation/solution steps in order. `steps` is the correct order; the UI shuffles. */
export interface OrderPart {
  kind: 'order';
  id: string;
  label: Rich;
  steps: Rich[];
  marks?: number;
}

/** Type a matrix (M, K, P, modal initial conditions...). */
export interface MatrixPart {
  kind: 'matrix';
  id: string;
  label: Rich;
  answer: number[][];
  rowLabels?: Rich[];
  colLabels?: Rich[];
  /** Relative tolerance against the largest |entry| (default 0.02). */
  tol?: number;
  /** Mode shapes: compare each column up to a nonzero scale factor (including sign). */
  columnsUpToScale?: boolean;
  unit?: string;
  /** Known wrong matrices and the trap each reveals (e.g. Pᵀx₀ instead of P⁻¹x₀). */
  traps?: { value: number[][]; message: Rich; trapId?: string }[];
  /** Absolute tolerance per cell (overrides the relative check), e.g. 0.002 for probabilities. */
  absTol?: number;
  /**
   * Symbolic answers (screw-axis tables, M): `symbolic.answer` holds expressions in the named symbols,
   * e.g. '-L1', 'L2+L3', '0'. The student may type expressions in the same symbols; each cell is checked
   * by evaluating both at several hidden random values of the symbols. The numeric `answer` only sets
   * the table's shape when this is present.
   */
  symbolic?: { vars: string[]; answer: string[][]; traps?: { answer: string[][]; message: Rich; trapId?: string }[] };
  /** Placeholder shown in empty cells (e.g. '0 or -L1'). */
  placeholder?: string;
  marks?: number;
}

/** Lagrange term builder: sort energy terms into T, V or "not a term"; M and K are derived and checked. */
export interface TermDef {
  id: string;
  /** Optional label for what the term describes, e.g. "spring k₁" or "rod (rotation about G)". */
  role?: string;
  /** The term as written, e.g. "$\\tfrac12 k_1 (x - a\\theta)^2$". */
  tex: Rich;
  belongs: 'T' | 'V' | 'none';
  /** Contribution to M when placed in T (T = ½ q̇ᵀ M q̇). */
  M?: number[][];
  /** Contribution to K when placed in V (V = ½ qᵀ K q). */
  K?: number[][];
  /** Why it belongs where it does (or why it is wrong). */
  why: Rich;
}

export interface TermsPart {
  kind: 'terms';
  id: string;
  label: Rich;
  /** Generalised coordinates in matrix order, as TeX, e.g. ["x", "\\theta"]. */
  coords: string[];
  terms: TermDef[];
  /** Correct numeric matrices for this instance. */
  M: number[][];
  K: number[][];
  /** Units of the matrix entries, shown under the derived matrices. */
  mUnit?: string;
  kUnit?: string;
  marks?: number;
}

/** Props handed to a custom (interactive) answer component. Call onResult once per check. */
export interface CustomPartProps {
  onResult: (r: { correct: boolean; trapId?: string }) => void;
  /** Key for usePersisted, so typed state survives tab switches. */
  pkey: string;
  seed: number;
  disabled?: boolean;
}

/** An interactive answer that does its own checking (A* Open/Closed table, C-space box labelling ...). */
export interface CustomPart {
  kind: 'custom';
  id: string;
  label: Rich;
  render: ComponentType<CustomPartProps>;
  marks?: number;
}

export type SolvePart = NumericPart | ChoicePart | OrderPart | MatrixPart | TermsPart | CustomPart;

export interface Given {
  /** Symbol as TeX (no $), e.g. "m_1". */
  sym: string;
  value: string;
  /** Plain description, e.g. "primary mass". */
  label?: string;
}

export interface SolveInstance {
  prompt: Rich;
  givens?: Given[];
  /** Optional static diagram for this instance. */
  figure?: ComponentType;
  parts: SolvePart[];
  /** Hint ladder: [concept, set-up, substitution, full worked solution]. */
  hints: [Rich, Rich, Rich, Rich];
}

export interface SolveGenerator {
  id: string;
  title: string;
  summary?: Rich;
  /** Levels this generator supports: 1 Warm-up (one formula), 2 Exam (paper style), 3 Stretch (twist or trap). */
  tiers: Tier[];
  /** Citation, e.g. "Similar to 2023 A1.4; Week 5 Q1". */
  source: string;
  /** Concept card that holds the formula ("show the formula" link). */
  cardId?: string;
  /** Marks when used in the mock paper. */
  marks?: number;
  /** Set false for long multi-step chains that do not suit the quick sprint. */
  sprint?: boolean;
  generate(rng: Rng, tier: Tier): SolveInstance;
}

// ---------------------------------------------------------------- Explore

export interface ExploreItem {
  id: string;
  title: string;
  summary: Rich;
  /** One line: what to notice while playing with it (shown above the simulation). Required. */
  notice: Rich;
  component: ComponentType;
  /** If the activity has a challenge, its id/title (complete it with useProgress().completeChallenge(id)). */
  challenge?: { id: string; title: string };
  minutes?: number;
}

// ---------------------------------------------------------------- Topic

export interface TopicDef {
  code: TopicCode;
  /** Section number in the exam summary notes (1-9). */
  num: number;
  part: Part;
  title: string;
  /** Short title for chips and the topic map. */
  short: string;
  /** Reader lectures, e.g. "LA1, LA7". */
  lectures: string;
  /** One-line description for the topic map. */
  blurb: Rich;
  /** Typical marks / where it appears in the paper, e.g. "A1 short numericals (16–20 marks)". */
  exam?: string;
  cards: ConceptCard[];
  flashcards: Flashcard[];
  mcqs: MCQ[];
  games?: Game[];
  shortAnswers?: ShortAnswer[];
  solve: SolveGenerator[];
  explore: ExploreItem[];
  traps?: TrapDef[];
  /** Links shown on tabs that are intentionally thin (e.g. B1 -> B2/B3 activities). */
  seeAlso?: { label: string; href: string; note?: Rich }[];
}
