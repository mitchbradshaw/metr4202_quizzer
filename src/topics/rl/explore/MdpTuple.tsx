// The MDP tuple explorer: a warehouse delivery task drawn as a scene. Click a part of the scene and tag it S, A, T,
// R, γ or "not in the tuple"; each tag explains why (2023 Q16, 2024 Q16, 2025 Q16). Below: what the policy is
// trained to maximise (the expected cumulative discounted reward, 2024 Q17, 2025 Q17) on two routes with a γ
// slider, and π*(s) = argmax_a Q*(s,a) on a small Q* table (2025 Q18).
import { useMemo, useRef, useState, type ReactNode } from 'react';
import type { ExploreItem } from '../../../engine/types';
import { Button, Callout, Slider } from '../../../ui/kit';
import { PredictReveal } from '../../../ui/PredictReveal';
import { Rich, TeX } from '../../../ui/Rich';
import { completeChallenge, useProgress } from '../../../app/store';
import { discountedReturn } from '../../../core/rl';
import { Panel, n, revealLeft, t } from './rlCommon';

export const meta: Omit<ExploreItem, 'component'> = {
  id: 'mdp',
  title: 'The MDP tuple: what is in (S, A, T, R, γ)?',
  summary:
    'A delivery robot in a warehouse. Click each part of the scene and tag it as a state, an action, the transition model, the reward, the discount, or something that is **not** in the tuple (the timestep, the return, the policy, a sensor model, the robot’s map, a value). Then see what the policy maximises and how $\\pi^*$ comes from $Q^*$.',
  notice:
    'The tuple $(S, A, T, R, \\gamma)$ only **defines the problem**. Everything computed from it (returns, values, the policy) or used to estimate the state (sensor models, maps) is not in it, and the exam asks exactly that every year.',
  challenge: { id: 'rl-mdp-all', title: 'Tag all 11 parts of the scene correctly' },
  minutes: 8,
};

const CHALLENGE_ID = 'rl-mdp-all';

type Tag = 'S' | 'A' | 'T' | 'R' | 'g' | 'no';
const TAGS: { id: Tag; label: string; tex?: string; tip: string }[] = [
  { id: 'S', label: 'S', tex: 'S', tip: 'State space' },
  { id: 'A', label: 'A', tex: 'A', tip: 'Action space' },
  { id: 'T', label: 'T', tex: 'T', tip: 'Transition model T(s, a, s′)' },
  { id: 'R', label: 'R', tex: 'R', tip: 'Reward function R(s, a, s′)' },
  { id: 'g', label: 'γ', tex: '\\gamma', tip: 'Discount factor' },
  { id: 'no', label: 'Not in the tuple', tip: 'Not an element of (S, A, T, R, γ)' },
];
const TAG_NAME: Record<Tag, string> = { S: 'the state (S)', A: 'the actions (A)', T: 'the transition model (T)', R: 'the reward function (R)', g: 'the discount factor (γ)', no: 'not in the tuple' };

interface Item {
  id: string;
  name: string;
  tag: Tag;
  why: string;
}

const ITEMS: Item[] = [
  {
    id: 'state',
    name: 'Robot at B2, carrying a parcel',
    tag: 'S',
    why: 'A **state** $s \\in S$: everything needed to predict what happens next. Position alone is not enough here: whether the robot holds the parcel changes what “drop” does and which reward follows, so it must be part of the state (the Markov property, 2024 Q26).',
  },
  {
    id: 'actions',
    name: 'Move N, E, S, W; pick up; drop',
    tag: 'A',
    why: 'The **action set** $A$: the choices available to the robot at each step. A policy picks one of these in every state.',
  },
  {
    id: 'trans',
    name: 'Wet floor: 80 % as told, 10 % slides each way',
    tag: 'T',
    why: 'The **transition model** $T(s, a, s\') = P(s_{t+1} = s\' \\mid s_t = s, a_t = a)$. The wet floor makes it stochastic. Value iteration needs $T$; Q-learning never sees it, but experiences its effects.',
  },
  {
    id: 'reward',
    name: '+10 delivered, −1 per move, −5 bumping a shelf',
    tag: 'R',
    why: 'The **reward function** $R(s, a, s\')$: the immediate number the robot receives for a transition. It encodes the task (deliver, quickly, without crashing).',
  },
  {
    id: 'gamma',
    name: 'γ = 0.95',
    tag: 'g',
    why: 'The **discount factor** $\\gamma \\in [0, 1)$: a reward $k$ steps ahead counts $\\gamma^k$ as much. Small $\\gamma$: short-sighted; close to 1: far-sighted. It also keeps infinite sums finite.',
  },
  {
    id: 'time',
    name: 'Clock: t = 17',
    tag: 'no',
    why: 'The **timestep** only indexes *when* things happen ($s_t, a_t, r_{t+1}$). The MDP is the same at every $t$, so time is not one of its elements (2023 Q16: “timestep” is the answer to “NOT in the tuple”).',
  },
  {
    id: 'return',
    name: 'Score so far: G = 4.2',
    tag: 'no',
    why: 'The **return** $G_t = \\sum_k \\gamma^k r_{t+k+1}$ is computed *from* $R$ and $\\gamma$ along one trajectory. It is what the policy maximises (in expectation), not part of the problem definition (2024 Q16: “return” is not in the tuple).',
  },
  {
    id: 'policy',
    name: 'Arrows π(s) on the floor',
    tag: 'no',
    why: 'The **policy** $\\pi: S \\to A$ maps states to actions (2023 Q17). It is the *solution* RL produces, not an element of the problem (2025 Q16 lists it as a distractor).',
  },
  {
    id: 'sensor',
    name: 'Lidar beam model p(z | x)',
    tag: 'no',
    why: 'A **sensor model** belongs to state estimation (Bayes filters, §1–3). A plain MDP assumes the state is observed; partial observability would need a POMDP (2025 Q16 lists it as a distractor).',
  },
  {
    id: 'map',
    name: 'The robot’s occupancy map',
    tag: 'no',
    why: 'The **map** is the robot’s belief about the world, built by SLAM. In the MDP the layout is already inside $T$ (where each move can end) and $S$; the robot’s map is not an element of the tuple.',
  },
  {
    id: 'value',
    name: 'V(B2) = 6.1',
    tag: 'no',
    why: 'A **value** $V^{\\pi}(s) = \\mathbb{E}_\\pi[G_t \\mid s_t = s]$ is derived from the MDP and a policy. Value iteration and Q-learning compute values; they are outputs, not inputs.',
  },
];

// ------------------------------------------------------------------ the scene

const CELL = 76;
const FX = 132;
const FY = 74;
const COLS = 6;
const ROWS = 3;
const cx = (c: number) => FX + c * CELL + CELL / 2;
const cy = (r: number) => FY + r * CELL + CELL / 2;

function Arrow({ x1, y1, x2, y2, cls }: { x1: number; y1: number; x2: number; y2: number; cls: string }) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const h = 7;
  const hx = (k: number) => x2 - h * Math.cos(a + k);
  const hy = (k: number) => y2 - h * Math.sin(a + k);
  return (
    <g className={cls}>
      <line x1={x1} y1={y1} x2={x2 - 4 * Math.cos(a)} y2={y2 - 4 * Math.sin(a)} />
      <path d={`M${x2} ${y2}L${hx(0.5)} ${hy(0.5)}L${hx(-0.5)} ${hy(-0.5)}Z`} />
    </g>
  );
}

function Scene({ sel, status, onPick, highlightPolicyCell }: { sel: string | null; status: Record<string, 'ok' | 'bad' | undefined>; onPick: (id: string) => void; highlightPolicyCell: boolean }) {
  const hot = (id: string, body: ReactNode, label: { x: number; y: number; text: string; anchor?: 'start' | 'middle' | 'end' }) => {
    const st = status[id];
    const item = ITEMS.find((i) => i.id === id)!;
    return (
      <g
        key={id}
        className={`rl-hot ${sel === id ? 'is-sel' : ''} ${st ? `is-${st}` : ''}`}
        role="button"
        tabIndex={0}
        aria-label={`${item.name}${st ? (st === 'ok' ? ': tagged correctly' : ': tagged wrongly') : ''}. Select to tag it.`}
        onClick={() => onPick(id)}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onPick(id))}
      >
        {body}
        <text x={label.x} y={label.y} textAnchor={label.anchor ?? 'middle'} className="rl-hot-label">
          {st === 'ok' ? '✓ ' : st === 'bad' ? '✗ ' : ''}
          {label.text}
        </text>
      </g>
    );
  };
  const floor: ReactNode[] = [];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) floor.push(<rect key={`f${r}${c}`} x={FX + c * CELL} y={FY + r * CELL} width={CELL} height={CELL} className="rl-floor" />);
  const robotX = cx(1);
  const robotY = cy(1);
  return (
    <svg className="rl-scene" viewBox="0 0 620 345" role="img" aria-label="Warehouse scene: a delivery robot, a wet floor, shelves, a dock, and several labelled items to tag">
      {floor}
      {Array.from({ length: COLS }, (_, c) => (
        <text key={`c${c}`} x={cx(c)} y={FY - 6} textAnchor="middle" className="rl-axis">
          {String.fromCharCode(65 + c)}
        </text>
      ))}
      {Array.from({ length: ROWS }, (_, r) => (
        <text key={`r${r}`} x={FX - 8} y={cy(r) + 4} textAnchor="end" className="rl-axis">
          {r + 1}
        </text>
      ))}
      {/* reward: dock and shelf */}
      {hot(
        'reward',
        <>
          <rect x={FX + 5 * CELL} y={FY + 2 * CELL} width={CELL} height={CELL} className="rl-dock" />
          <text x={cx(5)} y={cy(2) - 6} textAnchor="middle" className="rl-scene-big">
            +10
          </text>
          <text x={cx(5)} y={cy(2) + 14} textAnchor="middle" className="rl-scene-small">
            dock
          </text>
          <rect x={FX + 4 * CELL + 6} y={FY + 6} width={CELL - 12} height={2 * CELL - 12} className="rl-shelf" />
          <text x={cx(4)} y={FY + CELL + 4} textAnchor="middle" className="rl-scene-shelf">
            −5
          </text>
          <text x={cx(4)} y={FY + CELL + 20} textAnchor="middle" className="rl-scene-small rl-on-dark">
            shelf
          </text>
        </>,
        { x: FX + 3 * CELL, y: FY + 3 * CELL + 22, text: '+10 delivered · −1 per move · −5 bump', anchor: 'start' }
      )}
      {/* transition model: wet floor */}
      {hot(
        'trans',
        <>
          <rect x={FX + 2 * CELL} y={FY + 2 * CELL} width={2 * CELL} height={CELL} className="rl-wet" />
          <Arrow x1={cx(2)} y1={cy(2) + 6} x2={cx(2) + 46} y2={cy(2) + 6} cls="rl-t-main" />
          <Arrow x1={cx(2)} y1={cy(2) + 6} x2={cx(2) + 6} y2={cy(2) - 24} cls="rl-t-slip" />
          <Arrow x1={cx(2)} y1={cy(2) + 6} x2={cx(2) + 6} y2={cy(2) + 32} cls="rl-t-slip" />
          <text x={cx(2) + 50} y={cy(2) + 2} className="rl-scene-small">
            0.8
          </text>
          <text x={cx(2) + 12} y={cy(2) - 22} className="rl-scene-small">
            0.1
          </text>
          <text x={cx(2) + 12} y={cy(2) + 36} className="rl-scene-small">
            0.1
          </text>
        </>,
        { x: FX, y: FY + 3 * CELL + 22, text: 'wet floor: slips', anchor: 'start' }
      )}
      {/* policy arrows on row 1 */}
      {hot(
        'policy',
        <>
          {[0, 1, 2, 3, 5].map((c) => (
            <Arrow key={c} x1={cx(c) - (c === 5 ? 0 : 14)} y1={cy(0) + (c === 5 ? -14 : 0)} x2={cx(c) + (c === 5 ? 0 : 14)} y2={cy(0) + (c === 5 ? 14 : 0)} cls={`rl-pi ${highlightPolicyCell && c === 1 ? 'is-on' : ''}`} />
          ))}
          <text x={cx(0)} y={cy(0) + 26} textAnchor="middle" className="rl-scene-small">
            π(s)
          </text>
        </>,
        { x: cx(1), y: FY - 22, text: 'arrows π(s)' }
      )}
      {/* lidar */}
      {hot(
        'sensor',
        <>
          <path d={`M${robotX + 22} ${robotY}L${robotX + 112} ${robotY - 34}A96 96 0 0 1 ${robotX + 112} ${robotY + 34}Z`} className="rl-lidar" />
        </>,
        { x: robotX + 120, y: robotY + 5, text: 'lidar p(z | x)', anchor: 'start' }
      )}
      {/* the robot = the state */}
      {hot(
        'state',
        <>
          <rect x={robotX - 20} y={robotY - 16} width={40} height={32} rx={8} className="rl-robot" />
          <rect x={robotX - 9} y={robotY - 30} width={18} height={14} className="rl-parcel" />
          <circle cx={robotX - 10} cy={robotY + 18} r={5} className="rl-wheel" />
          <circle cx={robotX + 10} cy={robotY + 18} r={5} className="rl-wheel" />
        </>,
        { x: robotX, y: robotY + 54, text: 'robot (B2, parcel)' }
      )}
      {/* value chip */}
      {hot(
        'value',
        <>
          <rect x={cx(0) - 30} y={cy(2) - 4} width={60} height={22} rx={6} className="rl-chip" />
          <text x={cx(0)} y={cy(2) + 11} textAnchor="middle" className="rl-scene-small">
            V = 6.1
          </text>
        </>,
        { x: cx(0), y: cy(2) - 12, text: 'value' }
      )}
      {/* gamma badge */}
      {hot(
        'gamma',
        <>
          <rect x={14} y={10} width={140} height={34} rx={8} className="rl-chip" />
          <text x={84} y={33} textAnchor="middle" className="rl-scene-mid">
            γ = 0.95
          </text>
        </>,
        { x: 84, y: 58, text: 'discount' }
      )}
      {/* clock */}
      {hot(
        'time',
        <>
          <circle cx={392} cy={27} r={16} className="rl-chip" />
          <path d="M392 27L392 17M392 27L400 31" className="rl-clock-hand" />
          <text x={414} y={33} className="rl-scene-mid">
            t = 17
          </text>
        </>,
        { x: 392, y: 58, text: 'clock' }
      )}
      {/* score */}
      {hot(
        'return',
        <>
          <rect x={490} y={10} width={112} height={34} rx={8} className="rl-chip" />
          <text x={546} y={33} textAnchor="middle" className="rl-scene-mid">
            G = 4.2
          </text>
        </>,
        { x: 546, y: 58, text: 'score so far' }
      )}
      {/* map thumbnail */}
      {hot(
        'map',
        <>
          <rect x={14} y={90} width={92} height={70} rx={6} className="rl-chip" />
          {Array.from({ length: 12 }, (_, k) => (
            <rect key={k} x={20 + (k % 4) * 21} y={96 + Math.floor(k / 4) * 20} width={19} height={18} className={k === 3 || k === 7 ? 'rl-map-occ' : 'rl-map-free'} />
          ))}
        </>,
        { x: 60, y: 178, text: 'robot’s map' }
      )}
      {/* actions d-pad */}
      {hot(
        'actions',
        <>
          <rect x={14} y={204} width={92} height={92} rx={8} className="rl-chip" />
          <Arrow x1={60} y1={244} x2={60} y2={214} cls="rl-dpad" />
          <Arrow x1={60} y1={256} x2={60} y2={286} cls="rl-dpad" />
          <Arrow x1={54} y1={250} x2={24} y2={250} cls="rl-dpad" />
          <Arrow x1={66} y1={250} x2={96} y2={250} cls="rl-dpad" />
          <text x={60} y={312} textAnchor="middle" className="rl-scene-small">
            pick · drop
          </text>
        </>,
        { x: 60, y: 330, text: 'actions' }
      )}
    </svg>
  );
}

// ------------------------------------------------------------------ the return calculator

const ROUTES = [
  { id: 'short', name: 'Short route', rewards: [-1, -1, 10] },
  { id: 'long', name: 'Long route, bigger bonus', rewards: [-1, -1, -1, -1, -1, 14] },
];

function ReturnBars({ rewards, gamma, best }: { rewards: number[]; gamma: number; best: boolean }) {
  const W = 300;
  const H = 96;
  const zero = 70;
  const sc = 4.2;
  const bw = 34;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="rl-bars" role="img" aria-label={`Rewards ${rewards.join(', ')} and their discounted contributions`}>
      <line x1={0} x2={W} y1={zero} y2={zero} className="rl-bars-zero" />
      {rewards.map((r, k) => {
        const d = Math.pow(gamma, k) * r;
        const x = 6 + k * (bw + 14);
        const yr = r >= 0 ? zero - r * sc : zero;
        const yd = d >= 0 ? zero - d * sc : zero;
        return (
          <g key={k}>
            <rect x={x} y={yr} width={bw} height={Math.max(1, Math.abs(r) * sc)} className="rl-bar-raw" />
            <rect x={x + 5} y={yd} width={bw - 10} height={Math.max(1, Math.abs(d) * sc)} className={best ? 'rl-bar-disc is-best' : 'rl-bar-disc'} />
            <text x={x + bw / 2} y={H - 4} textAnchor="middle" className="rl-scene-small">
              {`γ${k === 0 ? '⁰' : k === 1 ? '¹' : k === 2 ? '²' : k === 3 ? '³' : k === 4 ? '⁴' : '⁵'}r${k + 1}`}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ------------------------------------------------------------------ the π* = argmax Q* table

const QSTAR = [
  { s: 'A1', q: [2.1, 4.7, 1.9, 3.0] },
  { s: 'B1', q: [5.2, 6.8, 4.1, 3.3] },
  { s: 'C1', q: [6.1, 5.4, 7.5, 4.0] },
];
const ARROWS = ['↑', '→', '↓', '←'];

export default function MdpTupleSim() {
  const challengeDone = !!useProgress().challenges?.[CHALLENGE_ID];
  const [sel, setSel] = useState<string | null>('state');
  const [answers, setAnswers] = useState<Record<string, Tag>>({});
  const [gamma, setGamma] = useState(0.95);
  const [picks, setPicks] = useState<(number | null)[]>([null, null, null]);
  const [showStar, setShowStar] = useState(false);
  const [piHi, setPiHi] = useState(false);
  const leftRef = useRef<HTMLDivElement>(null);
  const qRef = useRef<HTMLDivElement>(null);

  const status = useMemo(() => {
    const o: Record<string, 'ok' | 'bad' | undefined> = {};
    for (const it of ITEMS) if (answers[it.id]) o[it.id] = answers[it.id] === it.tag ? 'ok' : 'bad';
    return o;
  }, [answers]);
  const nOk = ITEMS.filter((i) => status[i.id] === 'ok').length;
  const nTagged = Object.keys(answers).length;
  const item = ITEMS.find((i) => i.id === sel) ?? null;
  const ans = item ? answers[item.id] : undefined;

  const tag = (tg: Tag) => {
    if (!item) return;
    const next = { ...answers, [item.id]: tg };
    setAnswers(next);
    if (ITEMS.every((i) => next[i.id] === i.tag) && !challengeDone) completeChallenge(CHALLENGE_ID);
  };
  const nextUntagged = () => {
    const i = ITEMS.findIndex((x) => x.id === sel);
    for (let k = 1; k <= ITEMS.length; k++) {
      const it = ITEMS[(i + k) % ITEMS.length];
      if (status[it.id] !== 'ok') return setSel(it.id);
    }
  };

  const rows = ROUTES.map((r) => {
    const total = r.rewards.reduce((s, x) => s + x, 0);
    return { ...r, first: r.rewards[0], last: r.rewards[r.rewards.length - 1], total, avg: total / r.rewards.length, G: discountedReturn(r.rewards, gamma) };
  });
  const bestG = rows[0].G >= rows[1].G ? 0 : 1;

  const left = (
    <div className="rl-left rl-panel" ref={leftRef}>
      <Scene sel={sel} status={status} onPick={setSel} highlightPolicyCell={piHi} />
      {item ? (
        <div className="rl-tagbox" aria-live="polite">
          <Rich className="rl-tag-q" text={`**${item.name}**: which element of $(S, A, T, R, \\gamma)$ is it?`} />
          <div className="rl-bar">
            {TAGS.map((tg) => (
              <Button
                key={tg.id}
                size="sm"
                variant={ans === tg.id ? (tg.id === item.tag ? 'ok' : 'danger') : 'default'}
                title={tg.tip}
                onClick={() => tag(tg.id)}
                aria-pressed={ans === tg.id}
              >
                {tg.tex ? <TeX>{tg.tex}</TeX> : tg.label}
              </Button>
            ))}
          </div>
          {ans && (
            <Callout kind={ans === item.tag ? 'ok' : 'bad'} title={ans === item.tag ? `Yes: ${TAG_NAME[item.tag]}` : `No: it is ${TAG_NAME[item.tag]}`}>
              <Rich text={item.why} />
            </Callout>
          )}
          {ans && (
            <Button size="sm" variant="ghost" onClick={nextUntagged}>
              Next item →
            </Button>
          )}
        </div>
      ) : (
        <p className="small muted">Click a part of the scene to tag it.</p>
      )}
    </div>
  );

  const right = (
    <div className="rl-right">
      <Panel title={`Tagged ${nOk} of ${ITEMS.length} correctly`}>
        <ul className="rl-itemlist">
          {ITEMS.map((it) => (
            <li key={it.id}>
              <button type="button" className={`rl-itembtn ${sel === it.id ? 'is-sel' : ''}`} onClick={() => setSel(it.id)}>
                <span className={`rl-mark ${status[it.id] ? `is-${status[it.id]}` : ''}`}>{status[it.id] === 'ok' ? '✓' : status[it.id] === 'bad' ? '✗' : '·'}</span>
                {it.name}
              </button>
            </li>
          ))}
        </ul>
        {nTagged > 0 && (
          <Rich
            className="small"
            text="**The rule:** the tuple *defines the problem*: states, actions, how actions change states ($T$), what each transition is worth ($R$) and how much the future counts ($\gamma$). Anything *computed from* it (return, value, policy) or used to *estimate* the state (sensor model, map) is not in it."
          />
        )}
        {(challengeDone || nOk === ITEMS.length) && (
          <Callout kind="ok" title="Challenge complete">
            <Rich text="All eleven tagged. In the exam the distractors are always from the second group: timestep (2023 Q16), return (2024 Q16), sensor model and policy (2025 Q16)." />
          </Callout>
        )}
      </Panel>

      <Panel title="What is the policy trained to maximise?">
        <Rich
          className="small"
          text="Two ways to the dock. The policy is trained to maximise the **expected cumulative discounted reward** $\mathbb{E}[G_0]$, $G_0 = \sum_k \gamma^k r_{k+1}$ (2024 Q17, 2025 Q17): not the immediate reward, the final reward, the average, or the plain total."
        />
        <Slider label="discount" tex="\gamma" tip="Weight of a reward one step later" value={gamma} min={0} max={0.99} step={0.01} onChange={setGamma} sig={2} />
        <div className="rl-table-wrap">
          <table className="rl-table rl-routes">
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>route (rewards)</th>
                <th title="r₁: the immediate reward">first</th>
                <th title="Reward at the final step">last</th>
                <th title="Σ r, undiscounted">total</th>
                <th title="Mean reward per step">average</th>
                <th title="G₀ = Σ γᵏ r_{k+1}">G₀</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} className={i === bestG ? 'is-best' : undefined}>
                  <td style={{ textAlign: 'left' }}>
                    {r.name}
                    <div className="small muted">{r.rewards.map((x) => t(x, 0)).join(', ')}</div>
                  </td>
                  <td>{t(r.first, 0)}</td>
                  <td>{t(r.last, 0)}</td>
                  <td>{t(r.total, 0)}</td>
                  <td>{t(r.avg, 2)}</td>
                  <td>
                    <strong>{t(r.G, 2)}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="rl-bars-row">
          {rows.map((r, i) => (
            <div key={r.id}>
              <Rich className="small muted" text={`${r.name}: outline $r_{k+1}$, filled $\\gamma^k r_{k+1}$`} />
              <ReturnBars rewards={r.rewards} gamma={gamma} best={i === bestG} />
            </div>
          ))}
        </div>
        <Rich
          className="small"
          text={`At $\\gamma = ${n(gamma, 2)}$ the policy prefers the **${rows[bestG].name.toLowerCase()}** ($G_0 = ${n(rows[bestG].G, 2)}$ vs $${n(rows[1 - bestG].G, 2)}$). The long route has the larger total (${t(rows[1].total, 0)} vs ${t(rows[0].total, 0)}), but its bonus arrives five steps later and is discounted by $\\gamma^5 = ${n(Math.pow(gamma, 5), 3)}$. Drag $\\gamma$ to about 0.98 and the preference flips.`}
        />
      </Panel>

      <Panel title="π*(s) = argmax over a of Q*(s, a)">
        <div ref={qRef}>
          <Rich className="small" text="Given the optimal action values $Q^*(s,a)$, the optimal policy takes, in each state, the action with the largest $Q^*$ (2025 Q18). Click the action you would take in each state." />
          <div className="rl-table-wrap">
            <table className="rl-table rl-qstar">
              <thead>
                <tr>
                  <th>s</th>
                  {ARROWS.map((a) => (
                    <th key={a}>{a}</th>
                  ))}
                  <th>π*(s)</th>
                  <th>V*(s)</th>
                </tr>
              </thead>
              <tbody>
                {QSTAR.map((row, i) => {
                  const best = row.q.indexOf(Math.max(...row.q));
                  const pick = picks[i];
                  return (
                    <tr key={row.s}>
                      <td>{row.s}</td>
                      {row.q.map((q, a) => {
                        const cls = (showStar || pick !== null) && a === best ? 'rl-q-best' : pick === a ? 'rl-q-wrong' : '';
                        return (
                          <td key={a} className={cls}>
                            <button
                              type="button"
                              className="rl-qbtn"
                              onClick={() => setPicks((p) => p.map((x, j) => (j === i ? a : x)))}
                              aria-label={`Choose ${ARROWS[a]} in ${row.s} (Q* = ${q})`}
                            >
                              {q.toFixed(1)}
                            </button>
                          </td>
                        );
                      })}
                      <td>{pick !== null || showStar ? (pick === null || pick === best ? `${ARROWS[best]} ✓` : `${ARROWS[best]} (not ${ARROWS[pick]})`) : '?'}</td>
                      <td>{pick !== null || showStar ? row.q[best].toFixed(1) : '?'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Rich
            className="small"
            text="$$\pi^*(s) = \arg\max_a Q^*(s,a), \qquad V^*(s) = \max_a Q^*(s,a)$$ $Q^*(s,a)$ is the expected **return** (not a single reward) for taking $a$ in $s$ and acting optimally afterwards. The policy and the value function are not the same object: one is a map $S \to A$, the other a number per state–action pair."
          />
        </div>
      </Panel>

      <Panel title="Predict, then check" className="rl-predicts">
        <PredictReveal
          id="rl-mdp-not"
          question="Which of these is **NOT** an element of the MDP tuple?"
          options={['The timestep', 'The state space', 'The reward function', 'The action space']}
          answer={0}
          explain="$(S, A, T, R, \gamma)$: states, actions, transition model, reward function and discount. The timestep only indexes a trajectory ($s_t, a_t, r_{t+1}$); it is not part of the problem (2023 Q16). The same trap appears as “return” (2024 Q16) and as “sensor model” and “policy” (2025 Q16)."
          tryIt="click the clock in the scene and tag it."
          onApply={() => {
            setSel('time');
            setAnswers((a) => ({ ...a, time: 'no' }));
            revealLeft(leftRef.current);
          }}
        />
        <PredictReveal
          id="rl-mdp-objective"
          question="$\gamma = 0.8$. The policy is trained to maximise the expected cumulative discounted reward. Which route does it prefer: the short one (−1, −1, +10) or the long one with the bigger bonus (−1, −1, −1, −1, −1, +14)?"
          options={['The short route', 'The long route: its total reward is larger', 'Neither: they are worth the same']}
          answer={0}
          explain="$G_0^{\text{short}} = -1 - 0.8 + 0.8^2 \times 10 = 4.60$. $G_0^{\text{long}} = -1 - 0.8 - 0.64 - 0.512 - 0.410 + 0.8^5 \times 14 = 1.23$. The long route's total (9) beats the short one's (8), but RL maximises the **discounted** sum, so the +14 five steps away is worth only $0.328 \times 14 = 4.59$. Not the total, not the final reward, not the average (2024 Q17, 2025 Q17)."
          tryIt="set γ = 0.8 in the route table and compare the G₀ column with the total column."
          onApply={() => setGamma(0.8)}
        />
        <PredictReveal
          id="rl-mdp-pistar"
          question="What is the relationship between the optimal policy $\pi^*(s)$ and the optimal action-value function $Q^*(s,a)$?"
          options={[
            'They are equivalent',
            '$\\pi^*$ executes, in each state, the action that maximises $Q^*$',
            '$Q^*$ is the reward received by following $\\pi^*$',
            'All of the above',
          ]}
          answer={1}
          explain="$\pi^*(s) = \arg\max_a Q^*(s,a)$ (2025 Q18). They are not equivalent (a map from states to actions vs a number for every state–action pair), and $Q^*$ is the expected discounted **return** for taking $a$ and then acting optimally, not a single reward. In the table: A1 → (4.7), B1 → (6.8), C1 ↓ (7.5)."
          tryIt="click the largest Q* in each row of the table."
          onApply={() => {
            setShowStar(true);
            setPicks(QSTAR.map((r) => r.q.indexOf(Math.max(...r.q))));
            setPiHi(true);
            qRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }}
        />
      </Panel>
    </div>
  );

  return (
    <div className="rl-sim">
      <div className="rl-layout rl-layout-mdp">
        {left}
        {right}
      </div>
    </div>
  );
}
