// Step / play controls for algorithm animations (graph search, RRT growth, Bayes predict-correct, particle
// filters, Q-learning episodes). The animation advances an integer step index; the simulation derives
// everything it draws from that index (usually from a precomputed trace), so stepping back is free.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRaf } from '../anim/hooks';
import { Button, Segmented } from './kit';

export interface Stepper {
  /** Current step, 0 … n. */
  i: number;
  n: number;
  playing: boolean;
  /** Steps per second while playing. */
  speed: number;
  setI: (i: number) => void;
  setSpeed: (s: number) => void;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  forward: () => void;
  back: () => void;
  reset: () => void;
  atEnd: boolean;
}

/** Keep `i` within [0, n] even when n shrinks (e.g. a new trace after editing the map). */
export function useStepper(n: number, opts: { speed?: number; start?: number } = {}): Stepper {
  const [i, setIRaw] = useState(opts.start ?? 0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(opts.speed ?? 4);
  const acc = useRef(0);
  const clamp = useCallback((k: number) => Math.max(0, Math.min(n, k)), [n]);
  useEffect(() => {
    setIRaw((k) => Math.max(0, Math.min(n, k)));
  }, [n]);
  useRaf(
    (dt) => {
      acc.current += dt * speed;
      if (acc.current < 1) return;
      const k = Math.floor(acc.current);
      acc.current -= k;
      setIRaw((cur) => {
        const nx = Math.min(n, cur + k);
        if (nx >= n) setPlaying(false);
        return nx;
      });
    },
    playing
  );
  const setI = useCallback((k: number) => setIRaw(clamp(k)), [clamp]);
  return {
    i,
    n,
    playing,
    speed,
    setI,
    setSpeed,
    play: () => {
      setIRaw((cur) => (cur >= n ? 0 : cur));
      acc.current = 0;
      setPlaying(true);
    },
    pause: () => setPlaying(false),
    toggle: () => {
      if (playing) setPlaying(false);
      else {
        setIRaw((cur) => (cur >= n ? 0 : cur));
        acc.current = 0;
        setPlaying(true);
      }
    },
    forward: () => {
      setPlaying(false);
      setIRaw((k) => clamp(k + 1));
    },
    back: () => {
      setPlaying(false);
      setIRaw((k) => clamp(k - 1));
    },
    reset: () => {
      setPlaying(false);
      setIRaw(0);
    },
    atEnd: i >= n,
  };
}

const SPEEDS = [1, 2, 4, 8, 20];

/** ⏮ ◀ ▶/⏸ ▶| plus a speed picker and "step i of n". Keyboard: the buttons are ordinary buttons. */
export function StepControls({ st, label = 'step', speeds = SPEEDS, extra }: { st: Stepper; label?: string; speeds?: number[]; extra?: React.ReactNode }) {
  return (
    <div className="stepper" role="group" aria-label="Step controls">
      <Button size="sm" onClick={st.reset} aria-label="Reset to the start" title="Reset">
        ⏮
      </Button>
      <Button size="sm" onClick={st.back} disabled={st.i <= 0} aria-label={`Back one ${label}`} title={`Back one ${label}`}>
        ◀
      </Button>
      <Button size="sm" variant="primary" onClick={st.toggle} aria-label={st.playing ? 'Pause' : 'Play'} title={st.playing ? 'Pause' : 'Play'}>
        {st.playing ? '⏸ Pause' : st.atEnd ? '↻ Replay' : '▶ Play'}
      </Button>
      <Button size="sm" onClick={st.forward} disabled={st.atEnd} aria-label={`Forward one ${label}`} title={`Forward one ${label}`}>
        ▶|
      </Button>
      <Segmented size="sm" label="Speed" value={st.speed} onChange={st.setSpeed} options={speeds.map((s) => ({ value: s, label: `${s}/s` }))} />
      <span className="mono small muted stepper-pos" aria-live="polite">
        {label} {st.i} / {st.n}
      </span>
      {extra}
    </div>
  );
}
