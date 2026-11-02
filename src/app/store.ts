// Progress store: localStorage (wrapped in try/catch) with an in-memory fallback.
// Read with useProgress(); change with the exported action functions.
import { useSyncExternalStore } from 'react';
import type { Tier, TopicCode } from '../engine/codes';
import type { Flashcard } from '../engine/types';

export type ItemKind = 'solve' | 'quiz' | 'game' | 'short' | 'flash';

export interface AttemptRec {
  t: number;
  kind: ItemKind;
  id: string;
  tier: Tier;
  ok: boolean;
  trapId?: string;
}
export interface FlashRec {
  box: number;
  /** Local day number when the card is next due. */
  due: number;
  reps: number;
  lapses: number;
}
export interface TrapRec {
  hits: number;
  lastHit: number;
  beaten: number;
}
export interface MissRec {
  t: number;
  topic: TopicCode;
  title: string;
  href: string;
  trapId?: string;
  note?: string;
}
export interface SprintRec {
  t: number;
  mode: 'quick' | 'mock';
  score: number;
  max: number;
  secs: number;
}
export interface Progress {
  v: 1;
  settings: { theme: 'system' | 'light' | 'dark' };
  attempts: Partial<Record<TopicCode, AttemptRec[]>>;
  flash: Record<string, FlashRec>;
  challenges: Record<string, number>;
  predictions: Record<string, { ok: boolean; t: number }>;
  traps: Record<string, TrapRec>;
  /** item key -> trap it fell into, waiting for a correct retry ("beaten"). */
  pendingTraps: Record<string, string>;
  /** item key ("quiz:id", "solve:id") -> stats, used to rotate questions. */
  items: Record<string, { n: number; ok: number; last: number }>;
  /** ISO dates (local) with any activity. */
  days: string[];
  session: { start: number; last: number; done: number; correct: number; misses: MissRec[] };
  sprints: SprintRec[];
}

const KEY = 'm42lab.v1';
export const LEITNER_DAYS = [0, 0, 1, 3, 7, 14]; // index = box (1..5)
const SESSION_GAP_MS = 2 * 3600 * 1000;

export function today(d = new Date()): number {
  return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);
}
export function isoDay(d = new Date()): string {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function fresh(): Progress {
  const now = Date.now();
  return {
    v: 1,
    settings: { theme: 'system' },
    attempts: {},
    flash: {},
    challenges: {},
    predictions: {},
    traps: {},
    pendingTraps: {},
    items: {},
    days: [],
    session: { start: now, last: now, done: 0, correct: 0, misses: [] },
    sprints: [],
  };
}

let storageOk = true;

function load(): Progress {
  const base = fresh();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<Progress>;
    if (!parsed || parsed.v !== 1) return base;
    const s: Progress = { ...base, ...parsed, settings: { ...base.settings, ...(parsed.settings || {}) } };
    if (Date.now() - (s.session?.last || 0) > SESSION_GAP_MS) s.session = base.session;
    return s;
  } catch {
    storageOk = false;
    return base;
  }
}

let state: Progress = load();
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    storageOk = true;
  } catch {
    storageOk = false;
  }
}

function commit(next: Progress) {
  state = next;
  listeners.forEach((l) => l());
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 250);
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());
}

export const getProgress = () => state;
export const storageAvailable = () => storageOk;

export function useProgress(): Progress {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state
  );
}

function touchSession(s: Progress): Progress['session'] {
  const now = Date.now();
  return now - s.session.last > SESSION_GAP_MS
    ? { start: now, last: now, done: 0, correct: 0, misses: [] }
    : { ...s.session, last: now };
}

function withDay(days: string[]): string[] {
  const d = isoDay();
  return days.includes(d) ? days : [...days, d].slice(-400);
}

// ------------------------------------------------------------------ actions

export interface AttemptInput {
  topic: TopicCode;
  kind: ItemKind;
  id: string;
  tier?: Tier;
  ok: boolean;
  trapId?: string;
  /** For the session summary. */
  title: string;
  href: string;
  note?: string;
}

export function recordAttempt(a: AttemptInput) {
  const s = state;
  const now = Date.now();
  const key = `${a.kind}:${a.id}`;
  const rec: AttemptRec = { t: now, kind: a.kind, id: a.id, tier: a.tier ?? 2, ok: a.ok, trapId: a.trapId };
  const attempts = { ...s.attempts, [a.topic]: [...(s.attempts[a.topic] || []), rec].slice(-40) };
  const it = s.items[key] || { n: 0, ok: 0, last: 0 };
  const items = { ...s.items, [key]: { n: it.n + 1, ok: it.ok + (a.ok ? 1 : 0), last: now } };
  let traps = s.traps;
  let pendingTraps = s.pendingTraps;
  if (!a.ok && a.trapId) {
    const tr = traps[a.trapId] || { hits: 0, lastHit: 0, beaten: 0 };
    traps = { ...traps, [a.trapId]: { ...tr, hits: tr.hits + 1, lastHit: now } };
    pendingTraps = { ...pendingTraps, [key]: a.trapId };
  } else if (a.ok && pendingTraps[key]) {
    const id = pendingTraps[key];
    const tr = traps[id] || { hits: 0, lastHit: 0, beaten: 0 };
    traps = { ...traps, [id]: { ...tr, beaten: tr.beaten + 1 } };
    const { [key]: _drop, ...rest } = pendingTraps;
    pendingTraps = rest;
  }
  const session = touchSession(s);
  const misses = a.ok
    ? session.misses
    : [...session.misses, { t: now, topic: a.topic, title: a.title, href: a.href, trapId: a.trapId, note: a.note }].slice(-60);
  commit({
    ...s,
    attempts,
    items,
    traps,
    pendingTraps,
    days: withDay(s.days),
    session: { ...session, done: session.done + 1, correct: session.correct + (a.ok ? 1 : 0), misses },
  });
}

/**
 * Log a trap without recording a new attempt (e.g. a later part of a problem whose attempt was
 * already recorded as wrong, or a problem the student abandons).
 */
export function logTrap(a: { topic: TopicCode; trapId: string; key: string; title: string; href: string; note?: string }) {
  const s = state;
  const now = Date.now();
  const tr = s.traps[a.trapId] || { hits: 0, lastHit: 0, beaten: 0 };
  const session = touchSession(s);
  commit({
    ...s,
    traps: { ...s.traps, [a.trapId]: { ...tr, hits: tr.hits + 1, lastHit: now } },
    pendingTraps: { ...s.pendingTraps, [a.key]: a.trapId },
    days: withDay(s.days),
    session: { ...session, misses: [...session.misses, { t: now, topic: a.topic, title: a.title, href: a.href, trapId: a.trapId, note: a.note }].slice(-60) },
  });
}

/** Leitner review: right moves the card up a box, wrong sends it back to box 1. */
export function reviewFlash(id: string, ok: boolean) {
  const s = state;
  const cur = s.flash[id] || { box: 1, due: today(), reps: 0, lapses: 0 };
  const box = ok ? Math.min(cur.box + 1, 5) : 1;
  const rec: FlashRec = { box, due: today() + LEITNER_DAYS[box], reps: cur.reps + 1, lapses: cur.lapses + (ok ? 0 : 1) };
  const session = touchSession(s);
  commit({
    ...s,
    flash: { ...s.flash, [id]: rec },
    days: withDay(s.days),
    session: { ...session, done: session.done + 1, correct: session.correct + (ok ? 1 : 0) },
  });
}

export function completeChallenge(id: string) {
  if (state.challenges[id]) return;
  commit({ ...state, challenges: { ...state.challenges, [id]: Date.now() }, days: withDay(state.days) });
}

export function recordPrediction(id: string, ok: boolean) {
  commit({ ...state, predictions: { ...state.predictions, [id]: { ok, t: Date.now() } }, days: withDay(state.days) });
}

export function recordSprint(r: Omit<SprintRec, 't'>) {
  commit({ ...state, sprints: [...state.sprints, { ...r, t: Date.now() }].slice(-50), days: withDay(state.days) });
}

export function setTheme(theme: Progress['settings']['theme']) {
  commit({ ...state, settings: { ...state.settings, theme } });
  applyTheme(theme);
}

export function applyTheme(theme: Progress['settings']['theme']) {
  if (typeof document === 'undefined') return;
  if (theme === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', theme);
}

export function endSession() {
  const now = Date.now();
  commit({ ...state, session: { start: now, last: now, done: 0, correct: 0, misses: [] } });
}

export function exportProgress(): string {
  return JSON.stringify(state, null, 1);
}

export function importProgress(text: string): { ok: boolean; error?: string } {
  try {
    const p = JSON.parse(text) as Progress;
    if (!p || p.v !== 1 || typeof p.flash !== 'object' || typeof p.attempts !== 'object') return { ok: false, error: 'Not a Robotics Lab progress file.' };
    commit({ ...fresh(), ...p });
    applyTheme(state.settings.theme);
    flush();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function resetProgress() {
  commit(fresh());
  applyTheme('system');
  flush();
}

// ------------------------------------------------------------------ selectors

const TIER_W: Record<number, number> = { 1: 0.6, 2: 1, 3: 1.4 };

/** Topic mastery in [0, 1]: weighted accuracy of the last 10 Solve/Quiz/Game attempts, plus Explore challenges. */
export function mastery(s: Progress, topic: TopicCode, challengeIds: string[] = []): { value: number; n: number } {
  const recent = (s.attempts[topic] || []).filter((a) => a.kind !== 'flash').slice(-10);
  let w = 0;
  let ok = 0;
  for (const a of recent) {
    const wt = TIER_W[a.tier] ?? 1;
    w += wt;
    if (a.ok) ok += wt;
  }
  const acc = w ? ok / w : 0;
  // Confidence ramps up over the first 10 attempts, so one lucky answer is not "100 %".
  const conf = Math.min(1, recent.length / 10);
  const ch = challengeIds.length ? challengeIds.filter((id) => s.challenges[id]).length / challengeIds.length : 0;
  const value = challengeIds.length ? 0.85 * acc * conf + 0.15 * ch : acc * conf;
  return { value, n: recent.length };
}

/** Consecutive active days ending today (or yesterday if nothing yet today). */
export function streak(s: Progress): number {
  const set = new Set(s.days);
  const d = new Date();
  if (!set.has(isoDay(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (set.has(isoDay(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

/**
 * Cards due now: reviewed cards whose due day has arrived (lowest box first), then up to `newLimit`
 * never-seen cards, so a fresh deck of hundreds of cards is introduced a few at a time.
 */
export function dueCards(s: Progress, cards: Flashcard[], newLimit = Infinity): Flashcard[] {
  const t = today();
  const reviews = cards.filter((c) => s.flash[c.id] && s.flash[c.id].due <= t).sort((a, b) => s.flash[a.id].box - s.flash[b.id].box);
  const fresh = cards.filter((c) => !s.flash[c.id]).slice(0, newLimit);
  return [...reviews, ...fresh];
}

/** Counts for badges: reviews due now, and cards never seen. */
export function dueCounts(s: Progress, cards: Flashcard[]): { due: number; unseen: number } {
  const t = today();
  let due = 0;
  let unseen = 0;
  for (const c of cards) {
    const r = s.flash[c.id];
    if (!r) unseen++;
    else if (r.due <= t) due++;
  }
  return { due, unseen };
}

export function boxCounts(s: Progress, cards: Flashcard[]): number[] {
  const counts = [0, 0, 0, 0, 0, 0];
  for (const c of cards) counts[s.flash[c.id]?.box ?? 0]++;
  return counts; // index 0 = never seen
}

/** Lower score = more in need of practice (unseen first, then often-wrong, then stale). */
export function itemPriority(s: Progress, key: string): number {
  const it = s.items[key];
  if (!it) return 0;
  const acc = it.ok / it.n;
  const ageDays = (Date.now() - it.last) / 86400000;
  return acc * 2 + Math.min(it.n, 5) * 0.2 - Math.min(ageDays, 7) * 0.15;
}
