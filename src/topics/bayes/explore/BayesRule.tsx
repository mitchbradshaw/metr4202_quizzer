// Bayes' rule, term by term (bayes-rule). An area picture: the unit square is split into one column per state
// (width = prior P(x)); inside each column the lit part has height P(z | x) for the reading actually seen, so its
// area is the product P(z | x)P(x) = P(x, z) (product rule) and the lit total is P(z) (marginalisation). Conditioning
// on z keeps only the lit pieces and stretches them to fill a bar: the posterior. A label game for the four terms,
// a base-rate demo (rare crack, good detector) and the product rule / marginalisation / (conditional) independence
// on the same numbers sit beside it.
import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type PointerEvent } from 'react';
import type { ExploreItem } from '../../../engine/types';
import { Button, Callout, More, Segmented, Slider } from '../../../ui/kit';
import { PredictReveal } from '../../../ui/PredictReveal';
import { Rich, TeX } from '../../../ui/Rich';
import { completeChallenge, useProgress } from '../../../app/store';
import { BayesLayout, HandTable, Panel, f2, f3, f4, revealVisual, useTween } from './common';
import {
  RULE_SCENARIOS,
  TERM_CHIPS,
  TERM_ORDER,
  independentOfX,
  naturalFrequencies,
  productRule,
  repeatReading,
  ruleUpdate,
  scenarioById,
  setBoundary,
  setLikAt,
  setPriorAt,
  twoReadings,
  type TermId,
} from './bayesRuleModel';

const CHALLENGE = 'bayes-rule-labels';

export const meta: Omit<ExploreItem, 'component'> = {
  id: 'bayes-rule',
  title: 'Bayes’ rule, term by term',
  summary:
    'Bayes’ rule as an area picture: column widths are the prior, lit heights the likelihood, so each lit area is prior × likelihood and the lit total is the evidence $P(z)$. Conditioning on the reading keeps only the lit pieces and stretches them into the posterior. Label the four terms, see why a rare event stays unlikely after a good detector fires, and check the product rule and marginalisation on the same numbers.',
  notice:
    'The posterior is each lit piece’s **share of the lit area**, not its height: a thin column (small prior) stays a small share even when it is lit almost to the top (large likelihood).',
  challenge: { id: CHALLENGE, title: 'Label all four terms of Bayes’ rule correctly' },
  minutes: 8,
};

// ------------------------------------------------------------------ geometry of the area picture
const VW = 600;
const SQ_L = 46;
const SQ_R = 588;
const W = SQ_R - SQ_L;
const SQ_T = 30;
const H = 230;
const LBL_Y = SQ_T + H + 17;
const PRI_Y = SQ_T + H + 31;
const EV_Y = SQ_T + H + 66;
const STRIP_H = 22;
const PO_Y = EV_Y + STRIP_H + 46;
const VH = PO_Y + STRIP_H + 12;
const COL = ['var(--m1)', 'var(--m2)', 'var(--m3)'];

interface ColGeo {
  i: number;
  x: number;
  w: number;
  litY: number;
  litH: number;
  others: { j: number; y: number; h: number }[];
  area: number;
  evX: number;
  evW: number;
  poX: number;
  poW: number;
  /** Where the column's name is written (pushed apart so thin columns stay readable). */
  lx: number;
}

function layout(prior: readonly number[], table: readonly (readonly number[])[], z: number, post: readonly number[]): ColGeo[] {
  let cum = 0;
  let ev = 0;
  let po = 0;
  const cols = prior.map((p, i) => {
    const x = SQ_L + cum * W;
    const w = p * W;
    cum += p;
    const l = table[i][z];
    const litH = l * H;
    const litY = SQ_T + H - litH;
    const others: { j: number; y: number; h: number }[] = [];
    let top = litY;
    table[i].forEach((v, j) => {
      if (j === z) return;
      const h = v * H;
      others.push({ j, y: top - h, h });
      top -= h;
    });
    const area = p * l;
    const evX = SQ_L + ev * W;
    ev += area;
    const poX = SQ_L + po * W;
    po += post[i];
    return { i, x, w, litY, litH, others, area, evX, evW: area * W, poX, poW: post[i] * W, lx: x + w / 2 };
  });
  // Push the labels apart (≥ 74 px) and keep them inside the square.
  for (let k = 0; k < cols.length; k++) {
    cols[k].lx = Math.max(cols[k].lx, SQ_L + 34, k ? cols[k - 1].lx + 74 : -Infinity);
  }
  for (let k = cols.length - 1; k >= 0; k--) cols[k].lx = Math.min(cols[k].lx, SQ_R - 34, k < cols.length - 1 ? cols[k + 1].lx - 74 : Infinity);
  return cols;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const pct = (x: number) => `${(x * 100).toFixed(1)} %`;
const cnt = (x: number) => (Math.abs(x - Math.round(x)) < 0.05 ? String(Math.round(x)) : x.toFixed(1));

export default function BayesRule() {
  const [scenId, setScenId] = useState('door');
  const scen = scenarioById(scenId);
  const [prior, setPrior] = useState<number[]>(scen.prior);
  const [table, setTable] = useState<number[][]>(scen.table);
  const [z, setZ] = useState(scen.z);
  const [focus, setFocus] = useState(scen.focus);
  const [readings, setReadings] = useState(1);
  const [hl, setHl] = useState<TermId | null>(null);
  const [nonce, setNonce] = useState(0);
  const leftRef = useRef<HTMLDivElement>(null);
  const tween = useTween();

  const t = useMemo(() => ruleUpdate(prior, table, z), [prior, table, z]);
  const ok = t.evidence > 0;
  const geo = useMemo(() => layout(prior, table, z, t.posterior), [prior, table, z, t]);
  const n = prior.length;
  const zRef = useRef(z);
  zRef.current = z;

  const load = (id: string) => {
    const s = scenarioById(id);
    setScenId(s.id);
    setPrior(s.prior.slice());
    setTable(s.table.map((r) => r.slice()));
    setZ(s.z);
    setFocus(s.focus);
    setReadings(1);
    setNonce((k) => k + 1);
  };
  const carry = () => {
    if (!ok) return;
    setPrior(t.posterior.slice());
    setReadings((k) => k + 1);
    setNonce((k) => k + 1);
  };
  const setup = (fn: () => void) => {
    fn();
    revealVisual(leftRef.current);
  };

  // ---------------------------------------------------------------- the conditioning animation
  const ghostRefs = useRef<(SVGRectElement | null)[]>([]);
  const evRef = useRef<SVGGElement | null>(null);
  const poRef = useRef<SVGGElement | null>(null);
  const geoRef = useRef(geo);
  geoRef.current = geo;
  const okRef = useRef(ok);
  okRef.current = ok;
  const play = () => {
    if (!okRef.current) return;
    const g = geoRef.current;
    tween(1500, (p) => {
      const p1 = Math.min(1, p / 0.5);
      const p2 = Math.max(0, (p - 0.5) / 0.5);
      g.forEach((c, k) => {
        const el = ghostRefs.current[k];
        if (!el) return;
        const x = p <= 0.5 ? lerp(c.x, c.evX, p1) : lerp(c.evX, c.poX, p2);
        const y = p <= 0.5 ? lerp(c.litY, EV_Y, p1) : lerp(EV_Y, PO_Y, p2);
        const w = p <= 0.5 ? lerp(c.w, c.evW, p1) : lerp(c.evW, c.poW, p2);
        const h = p <= 0.5 ? lerp(c.litH, STRIP_H, p1) : STRIP_H;
        el.setAttribute('x', String(x));
        el.setAttribute('y', String(y));
        el.setAttribute('width', String(Math.max(0, w)));
        el.setAttribute('height', String(Math.max(0, h)));
        el.setAttribute('opacity', p < 1 ? '0.9' : '0');
      });
      evRef.current?.setAttribute('opacity', p < 0.5 ? '0.12' : '1');
      poRef.current?.setAttribute('opacity', p < 1 ? '0.12' : '1');
    });
  };
  useEffect(() => {
    play();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenId, z, nonce]);

  // ---------------------------------------------------------------- dragging (prior boundaries, likelihood heights)
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ kind: 'b' | 'l'; i: number } | null>(null);
  const toSvg = (e: PointerEvent) => {
    const m = svgRef.current?.getScreenCTM();
    return m ? new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse()) : null;
  };
  const moveGrip = (kind: 'b' | 'l', i: number, e: PointerEvent) => {
    const pt = toSvg(e);
    if (!pt) return;
    if (kind === 'b') setPrior((p) => setBoundary(p, i, Math.round(((pt.x - SQ_L) / W) * 200) / 200));
    else setTable((tb) => setLikAt(tb, i, zRef.current, Math.round(((SQ_T + H - pt.y) / H) * 100) / 100));
  };
  const gripProps = (kind: 'b' | 'l', i: number) => ({
    onPointerDown: (e: PointerEvent<SVGElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { kind, i };
    },
    onPointerMove: (e: PointerEvent<SVGElement>) => {
      if (drag.current && drag.current.kind === kind && drag.current.i === i) moveGrip(kind, i, e);
    },
    onPointerUp: () => {
      drag.current = null;
    },
    onPointerCancel: () => {
      drag.current = null;
    },
    onKeyDown: (e: KeyboardEvent<SVGElement>) => {
      const big = e.shiftKey ? 5 : 1;
      if (kind === 'b' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        const cum = prior.slice(0, i + 1).reduce((a, b) => a + b, 0);
        setPrior((p) => setBoundary(p, i, cum + (e.key === 'ArrowRight' ? 0.01 : -0.01) * big));
      } else if (kind === 'l' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        setTable((tb) => setLikAt(tb, i, z, tb[i][z] + (e.key === 'ArrowUp' ? 0.01 : -0.01) * big));
      }
    },
  });

  // ---------------------------------------------------------------- derived text
  const x = scen.xTex;
  const zt = scen.zTex[z];
  const zName = scen.readings[z];
  const pr = productRule(t, focus);
  const two = twoReadings(prior, table, z);
  const indep = independentOfX(prior, table, z);
  const nf = naturalFrequencies(prior, table, z);
  const lik = t.likelihood;

  // ---------------------------------------------------------------- the picture
  const hlStroke = { fill: 'none', stroke: 'var(--text)', strokeWidth: 2.5, strokeDasharray: '6 3', pointerEvents: 'none' as const };
  const svg = (
    <svg
      ref={svgRef}
      className="bayes-rule-svg"
      viewBox={`0 0 ${VW} ${VH}`}
      width="100%"
      role="group"
      aria-label={`Area picture of Bayes’ rule. ${scen.states.map((s, i) => `${s}: prior ${f3(prior[i])}, P(${zName} | ${s}) = ${f2(lik[i])}, posterior ${ok ? f4(t.posterior[i]) : 'undefined'}`).join('; ')}. P(${zName}) = ${f4(t.evidence)}.`}
    >
      {/* likelihood axis */}
      {[0, 0.5, 1].map((v) => (
        <g key={v}>
          <text x={SQ_L - 6} y={SQ_T + H - v * H + 4} textAnchor="end" className="bayes-tick">
            {v}
          </text>
        </g>
      ))}
      <text x={4} y={SQ_T - 14} className="bayes-axis-label">
        {`P(z | x)`}
      </text>
      {/* columns */}
      {geo.map((c) => (
        <g key={`c${c.i}`}>
          {c.others.map((o) => (
            <g key={o.j}>
              <rect x={c.x} y={o.y} width={c.w} height={o.h} fill={COL[c.i]} opacity={0.13} stroke="var(--surface)" strokeWidth={1} />
              {c.w >= 70 && o.h >= 32 && (
                <text x={c.x + c.w / 2} y={o.y + Math.min(o.h / 2 + 4, 16)} textAnchor="middle" className="bayes-rule-faint">
                  {`${scen.readings[o.j]} ${f2(table[c.i][o.j])}`}
                </text>
              )}
            </g>
          ))}
          <rect x={c.x} y={c.litY} width={c.w} height={c.litH} fill={COL[c.i]} stroke="var(--surface)" strokeWidth={1}>
            <title>{`${scen.states[c.i]}: P(${zName} | ${scen.states[c.i]}) = ${f2(lik[c.i])}, lit area = ${f4(c.area)}`}</title>
          </rect>
          {c.w >= 50 && c.litH >= 18 && (
            <text x={c.x + c.w / 2} y={c.litY + Math.min(c.litH / 2 + 4, 18)} textAnchor="middle" className="bayes-rule-in">
              {f4(c.area)}
            </text>
          )}
          <text x={c.lx} y={LBL_Y} textAnchor="middle" className="bayes-axis-label" fill={COL[c.i]}>
            {scen.states[c.i]}
          </text>
          <text x={c.lx} y={PRI_Y} textAnchor="middle" className="bayes-tick">
            {`P = ${f3(prior[c.i])}`}
          </text>
          {Math.abs(c.lx - (c.x + c.w / 2)) > 10 && <line x1={c.x + c.w / 2} x2={c.lx} y1={SQ_T + H + 2} y2={LBL_Y - 11} stroke="var(--text-3)" strokeWidth={1} />}
        </g>
      ))}
      <rect x={SQ_L} y={SQ_T} width={W} height={H} fill="none" stroke="var(--text-3)" strokeWidth={1} />
      {/* highlights for the hovered term */}
      {hl === 'prior' && geo.map((c) => <rect key={`hp${c.i}`} x={c.x + 1} y={SQ_T + 1} width={Math.max(0, c.w - 2)} height={H - 2} {...hlStroke} />)}
      {hl === 'lik' &&
        geo.map((c) => (
          <g key={`hl${c.i}`} pointerEvents="none">
            <rect x={c.x + 1} y={c.litY} width={Math.max(0, c.w - 2)} height={c.litH} {...hlStroke} />
          </g>
        ))}
      {hl === 'ev' && <rect x={SQ_L - 2} y={EV_Y - 3} width={t.evidence * W + 4} height={STRIP_H + 6} {...hlStroke} />}
      {hl === 'post' && <rect x={SQ_L - 2} y={PO_Y - 3} width={W + 4} height={STRIP_H + 6} {...hlStroke} />}
      {/* grips: prior boundaries (top) and likelihood heights */}
      {geo.slice(0, -1).map((c) => {
        const bx = c.x + c.w;
        return (
          <g key={`b${c.i}`} className="bayes-grip" role="slider" tabIndex={0} aria-label={`Prior boundary between ${scen.states[c.i]} and ${scen.states[c.i + 1]}`} aria-valuemin={0} aria-valuemax={1} aria-valuenow={Number((prior[c.i]).toFixed(3))} aria-valuetext={`P(${scen.states[c.i]}) = ${f3(prior[c.i])}`} {...gripProps('b', c.i)}>
            <line x1={bx} x2={bx} y1={SQ_T - 8} y2={SQ_T + H} stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="3 3" />
            <rect x={bx - 13} y={SQ_T - 24} width={26} height={16} rx={5} fill="var(--accent)" />
            <path d={`M${bx - 8} ${SQ_T - 16} l4 -4 v8 z M${bx + 8} ${SQ_T - 16} l-4 -4 v8 z`} fill="var(--surface)" />
            <rect x={bx - 16} y={SQ_T - 28} width={32} height={SQ_T + H} fill="transparent" />
            <title>Drag sideways to change the prior</title>
          </g>
        );
      })}
      {geo.map((c) => {
        const cx = c.x + c.w / 2;
        const narrow = c.w < 44;
        return (
          <g key={`l${c.i}`} className="bayes-grip" role="slider" tabIndex={0} aria-label={`P(${zName} | ${scen.states[c.i]})`} aria-valuemin={0} aria-valuemax={1} aria-valuenow={Number(lik[c.i].toFixed(2))} {...gripProps('l', c.i)}>
            <circle cx={cx} cy={c.litY} r={13} fill="transparent" />
            <circle cx={cx} cy={c.litY} r={6.5} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
            <text x={narrow ? cx + 11 : cx} y={narrow ? c.litY + 4 : c.litY - 10} textAnchor={narrow ? 'start' : 'middle'} className="bayes-rule-num">
              {f2(lik[c.i])}
            </text>
            <title>Drag up or down to change the likelihood</title>
          </g>
        );
      })}
      {/* evidence strip: the lit pieces end to end */}
      <text x={SQ_L} y={EV_Y - 8} className="bayes-axis-label">
        {`evidence P(z) = the lit pieces end to end = ${geo.map((c) => f4(c.area)).join(' + ')} = ${f4(t.evidence)}`}
      </text>
      <rect x={SQ_L} y={EV_Y} width={W} height={STRIP_H} fill="none" stroke="var(--text-3)" strokeDasharray="4 3" />
      <text x={SQ_R} y={EV_Y + STRIP_H + 13} textAnchor="end" className="bayes-tick">
        1
      </text>
      <g ref={evRef}>
        {geo.map((c) => (
          <rect key={`e${c.i}`} x={c.evX} y={EV_Y} width={c.evW} height={STRIP_H} fill={COL[c.i]} stroke="var(--surface)" strokeWidth={0.8} />
        ))}
        <line x1={SQ_L + t.evidence * W} x2={SQ_L + t.evidence * W} y1={EV_Y - 2} y2={EV_Y + STRIP_H + 4} stroke="var(--text)" strokeWidth={1.5} />
        <text x={SQ_L + t.evidence * W} y={EV_Y + STRIP_H + 13} textAnchor={t.evidence > 0.9 ? 'end' : 'middle'} className="bayes-tick">
          {f4(t.evidence)}
        </text>
      </g>
      {/* posterior strip: the same pieces ÷ P(z) */}
      <text x={SQ_L} y={PO_Y - 8} className="bayes-axis-label">
        {ok ? `posterior P(x | z) = each lit piece ÷ P(z), i.e. × η = ${f2(1 / t.evidence)}` : 'posterior undefined: P(z) = 0, this reading cannot happen'}
      </text>
      <rect x={SQ_L} y={PO_Y} width={W} height={STRIP_H} fill="none" stroke="var(--text-3)" strokeDasharray="4 3" />
      <g ref={poRef}>
        {ok &&
          geo.map((c) => (
            <g key={`p${c.i}`}>
              <rect x={c.poX} y={PO_Y} width={c.poW} height={STRIP_H} fill={COL[c.i]} stroke="var(--surface)" strokeWidth={0.8} />
              {c.poW >= 52 && (
                <text x={c.poX + c.poW / 2} y={PO_Y + 15} textAnchor="middle" className="bayes-rule-in">
                  {pct(t.posterior[c.i])}
                </text>
              )}
            </g>
          ))}
      </g>
      {/* ghosts that carry the lit pieces down during the animation */}
      {geo.map((c) => (
        <rect
          key={`g${c.i}`}
          ref={(el) => {
            ghostRefs.current[c.i] = el;
          }}
          x={c.x}
          y={c.litY}
          width={c.w}
          height={c.litH}
          fill={COL[c.i]}
          stroke="var(--text)"
          strokeWidth={1}
          opacity={0}
          pointerEvents="none"
        />
      ))}
    </svg>
  );

  const freq = `Out of 1000 ${scen.things}: ${scen.states.map((s, i) => `${cnt(nf.counts[i])} ${s} → ${cnt(nf.hits[i])} ${zName}`).join('; ')}. ${
    nf.total > 0 ? `Of the ${cnt(nf.total)} that give “${zName}”, **${cnt(nf.hits[focus])} (${pct(nf.share[focus])}) are ${scen.states[focus]}**.` : 'None of them gives this reading.'
  }`;

  const left = (
    <div ref={leftRef} className="bayes-panel bayes-left-stack">
      <div className="bayes-row">
        <Segmented size="sm" label="Scenario" value={scenId} onChange={load} options={RULE_SCENARIOS.map((s) => ({ value: s.id, label: s.label }))} />
      </div>
      <div className="bayes-row">
        <span className="bayes-label">The sensor reports</span>
        <Segmented size="sm" label="Reading z" value={z} onChange={(v: number) => setZ(v)} options={scen.readings.map((r, j) => ({ value: j, label: r }))} />
      </div>
      {svg}
      <div className="bayes-actions">
        <Button variant="primary" onClick={play} disabled={!ok} title="Animate: keep only the lit pieces, lay them end to end (P(z)), then stretch them to fill the bar (÷ P(z))">
          ▶ Condition on “{zName}”
        </Button>
        <Button onClick={carry} disabled={!ok} title="Make the posterior the new prior and apply the same reading again (an independent second reading)">
          Another “{zName}” reading
        </Button>
        <Button size="sm" onClick={() => load(scenId)}>
          ↺ Reset
        </Button>
        <span className="small muted">{readings > 1 ? `${readings} readings so far` : 'one reading'}</span>
      </div>
      <Rich className="small" text={freq} />
      <Rich className="small muted" text={`Drag the **teal grips**: sideways to change the prior (column widths), up and down to change $P(z \\mid x)$ (lit heights). ${scen.note}`} />
    </div>
  );

  // ---------------------------------------------------------------- right column
  const focusOpts = scen.states.map((s, i) => ({ value: i, label: s }));
  const right = (
    <>
      <Panel title="Label the four terms">
        <TermGame onHl={setHl} />
      </Panel>

      <Panel title="This reading, by Bayes’ rule" live>
        <div className="bayes-row">
          <span className="bayes-label">Write it for x =</span>
          <Segmented size="sm" label="State in the formula" value={focus} onChange={(v: number) => setFocus(v)} options={focusOpts} />
        </div>
        <Rich
          text={`$$P(${x[focus]} \\mid ${zt}) = \\frac{P(${zt} \\mid ${x[focus]})\\,P(${x[focus]})}{P(${zt})}$$${
            ok ? `$$= \\frac{${f2(lik[focus])} \\times ${f4(prior[focus])}}{${f4(t.evidence)}} = \\mathbf{${f4(t.posterior[focus])}}$$` : '$$P(z) = 0\\text{: undefined}$$'
          }`}
        />
        <HandTable
          zTex={zt}
          rows={scen.states.map((s, i) => ({ key: s, label: s, chip: COL[i], prior: prior[i], lik: lik[i], product: t.product[i], post: ok ? t.posterior[i] : NaN }))}
        />
      </Panel>

      <Panel title="Same numbers, the other rules">
        <Rich
          className="small"
          text={`**Product rule** (one lit area): $P(${x[focus]}, ${zt}) = P(${zt} \\mid ${x[focus]})\\,P(${x[focus]}) = ${f2(lik[focus])} \\times ${f4(prior[focus])} = ${f4(pr.joint)}$. Read the other way, $P(${x[focus]} \\mid ${zt})\\,P(${zt}) = ${f4(t.posterior[focus])} \\times ${f4(t.evidence)} = ${f4(pr.other)}$: the same area.

✗ $P(${x[focus]} \\mid ${zt})\\,P(${x[focus]}) = ${f4(pr.trap)}$ is **not** a joint probability (the 2024 MCQ distractor): it multiplies by the probability of the variable on the wrong side of the bar.

**Marginalisation** (all the lit area): $P(${zt}) = \\sum_x P(${zt} \\mid x)P(x) = ${t.product.map((v) => f4(v)).join(' + ')} = ${f4(t.evidence)}$.

**Independence**: $x$ and $z$ are independent only when every column is lit to the same height; then $P(x, z) = P(x)P(z)$ and the posterior equals the prior. ${indep ? '**Here the heights are equal, so this reading carries no information.**' : `Here the heights differ (${lik.map((v) => f2(v)).join(', ')}), so the reading is informative.`}

**Conditional independence** (two readings): given $x$, a second reading does not care about the first, $P(z_2 \\mid x, z_1) = P(z_2 \\mid x)$. Without $x$ they are **dependent**: $P(z_2 = ${zt}) = ${f3(two.marginal)}$, but $P(z_2 = ${zt} \\mid z_1 = ${zt}) = \\sum_x P(${zt} \\mid x)P(x \\mid z_1) = ${f3(two.givenFirst)}$, because the first reading moved the belief about $x$. This is why the filter may multiply one likelihood per reading.`}
        />
      </Panel>

      <Panel title="Change the numbers">
        {scen.states.map((s, i) => (
          <Slider
            key={`p${i}`}
            label={`prior of ${s}`}
            tex={`P(${x[i]})`}
            tip={`Prior probability of ${s} before the reading; the other states rescale so the prior sums to 1`}
            value={prior[i]}
            min={0}
            max={1}
            step={0.005}
            onChange={(v) => setPrior((p) => setPriorAt(p, i, v))}
          />
        ))}
        {scen.states.map((s, i) => (
          <Slider
            key={`l${i}`}
            label={`likelihood at ${s}`}
            tex={`P(${zt} \\mid ${x[i]})`}
            tip={`Probability of the reading “${zName}” when the true state is ${s}; the rest of that sensor-table row rescales so it sums to 1`}
            value={table[i][z]}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => setTable((tb) => setLikAt(tb, i, z, v))}
          />
        ))}
      </Panel>

      <Panel title="Predict, then check" className="bayes-predicts">
        <PredictReveal
          id="bayes-rule-base-rate"
          question="A crack detector beeps for **99 %** of cracked parts and false-alarms on **5 %** of sound ones. Only **1 part in 100** is cracked. A part makes it beep. How likely is it to be cracked?"
          options={['About 99 %', 'About 95 %', 'About 50 %', 'About 17 %']}
          answer={3}
          explain="$P(\text{cracked} \mid \text{beep}) = \frac{0.99 \times 0.01}{0.99 \times 0.01 + 0.05 \times 0.99} = \frac{0.0099}{0.0594} = 0.167$. The cracked column is a sliver (prior 0.01), so even lit to the top its area is tiny next to the false alarms from the huge sound column: of 1000 parts, about 10 cracked ones beep and about 50 sound ones beep. The likelihood $P(\text{beep} \mid \text{cracked}) = 0.99$ is **not** the posterior: confusing the two is the base-rate fallacy."
          tryIt="pick “Rare crack” and condition on the beep."
          onApply={() => setup(() => load('crack'))}
        />
        <PredictReveal
          id="bayes-rule-second"
          question="The same part is tested again by an independent detector of the same quality, and it **beeps again**. Now how likely is a crack?"
          options={['Still about 17 %', 'About 34 %', 'About 80 %', 'About 99 %']}
          answer={2}
          explain="The first posterior becomes the new prior: $\frac{0.99 \times 0.167}{0.99 \times 0.167 + 0.05 \times 0.833} = \frac{0.165}{0.207} = 0.80$. The cracked column is now a sixth of the square, so its lit area competes. Each reading multiplies the odds by the **likelihood ratio** $0.99 / 0.05 = 19.8$: odds 1 : 99 → 1 : 5 → 4 : 1. Repeated independent readings are exactly the correction step run again."
          tryIt="after one beep, press “Another beep reading”."
          onApply={() =>
            setup(() => {
              load('crack');
              const s = scenarioById('crack');
              setPrior(repeatReading(s.prior, s.table, 0, 1));
              setReadings(2);
            })
          }
        />
        <PredictReveal
          id="bayes-rule-flat"
          question="In the door scenario, make the sensor say “saw door” **half the time whatever is there**: $P(\text{saw door} \mid \text{door}) = P(\text{saw door} \mid \text{wall}) = 0.5$. What is $P(\text{door} \mid \text{saw door})$?"
          options={['0.5', '0.1, the prior', '0.8', '0.9']}
          answer={1}
          explain="Every column is lit to the same height, so the lit pieces keep the same proportions as the columns: the posterior **equals the prior** (0.1). The reading is independent of the state, $P(x, z) = P(x)P(z)$, and carries no information. A sensor is only useful where its likelihoods **differ** between states; it is the ratio, not the size, that moves the belief."
          tryIt="drag both lit heights to 0.5."
          onApply={() =>
            setup(() => {
              load('door');
              const s = scenarioById('door');
              setTable(setLikAt(setLikAt(s.table, 0, 0, 0.5), 1, 0, 0.5));
            })
          }
        />
        <PredictReveal
          id="bayes-rule-zero-prior"
          question="Set $P(\text{cracked}) = 0$ (someone is sure no part is ever cracked). The detector then beeps **ten times in a row**. What is $P(\text{cracked})$ after the ten beeps?"
          options={['Close to 1', 'About 0.5', 'Exactly 0']}
          answer={2}
          explain="Bayes’ rule only **reweights** the prior: $0.99^{10} \times 0 = 0$. A column of zero width has zero area however brightly it is lit, so no evidence can ever bring it back. This is why a prior (or a sensor model) should never contain a hard 0 or 1 for something that can happen."
          tryIt="drag the crack prior to 0 and press “Another beep reading” a few times."
          onApply={() =>
            setup(() => {
              load('crack');
              const s = scenarioById('crack');
              setPrior(repeatReading([0, 1], s.table, 0, 9));
              setReadings(10);
            })
          }
        />
      </Panel>
    </>
  );

  return (
    <BayesLayout
      left={left}
      right={right}
      below={
        <More label="Why the area picture is Bayes’ rule">
          <Rich
            text={`- The square has area 1 and is a map of every outcome: a column per state $x$ (width $P(x)$), split by what the sensor reports (height $P(z \\mid x)$, each column’s heights sum to 1).
- A lit piece has area $P(z \\mid x)P(x) = P(x, z)$: the **product rule**. All the lit pieces together have area $\\sum_x P(z \\mid x)P(x) = P(z)$: **marginalisation** (total probability).
- Seeing $z$ rules out every unlit piece. What is left is the lit area, so the probability of $x$ is its share of it: $P(x \\mid z) = P(x, z)/P(z)$, which is **Bayes’ rule**. Multiplying by $\\eta = 1/P(z)$ is the stretch from the evidence strip to the full bar.
- In the Bayes filter the prior is the predicted belief $\\overline{bel}(x_t)$, the likelihood is the sensor model $p(z_t \\mid x_t)$ and the posterior is $bel(x_t)$ (summary notes §1).`}
          />
        </More>
      }
    />
  );
}

// ------------------------------------------------------------------ the labelling game

const SLOT_TEX: Record<TermId, string> = { post: 'P(x \\mid z)', lik: 'P(z \\mid x)', prior: 'P(x)', ev: 'P(z)' };
/** The same terms for screen readers. */
const SLOT_READ: Record<TermId, string> = { post: 'P(x given z)', lik: 'P(z given x)', prior: 'P(x)', ev: 'P(z)' };
const EMPTY: Record<TermId, string | null> = { post: null, lik: null, prior: null, ev: null };

function TermGame({ onHl }: { onHl: (t: TermId | null) => void }) {
  const done = !!useProgress().challenges[CHALLENGE];
  const [assign, setAssign] = useState<Record<TermId, string | null>>(EMPTY);
  const [sel, setSel] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<TermId, boolean> | null>(null);
  const [tries, setTries] = useState(0);
  const placed = new Set(Object.values(assign).filter((v): v is string => !!v));
  const pool = TERM_CHIPS.filter((c) => !placed.has(c.id));
  const chip = (id: string | null) => TERM_CHIPS.find((c) => c.id === id) ?? null;

  const put = (term: TermId, id: string) => {
    setAssign((a) => {
      const b = { ...a };
      for (const k of TERM_ORDER) if (b[k] === id) b[k] = null;
      b[term] = id;
      return b;
    });
    setSel(null);
    setChecked(null);
  };
  const unplace = (id: string) => {
    setAssign((a) => {
      const b = { ...a };
      for (const k of TERM_ORDER) if (b[k] === id) b[k] = null;
      return b;
    });
    setChecked(null);
  };
  const check = () => {
    const r = Object.fromEntries(TERM_ORDER.map((k) => [k, chip(assign[k])?.term === k])) as Record<TermId, boolean>;
    setChecked(r);
    setTries((k) => k + 1);
    if (TERM_ORDER.every((k) => r[k])) completeChallenge(CHALLENGE);
  };
  const showAnswer = () => {
    const a = { ...EMPTY };
    for (const c of TERM_CHIPS) if (c.term) a[c.term] = c.id;
    setAssign(a);
    setChecked({ post: true, lik: true, prior: true, ev: true });
  };
  const allRight = !!checked && TERM_ORDER.every((k) => checked[k]);
  const nRight = checked ? TERM_ORDER.filter((k) => checked[k]).length : 0;

  const onDropSlot = (term: TermId) => (e: DragEvent) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    if (id) put(term, id);
  };
  const dragStart = (id: string) => (e: DragEvent) => {
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
  };

  // A render function (not a component), so the slot buttons keep keyboard focus across re-renders.
  const slot = (term: TermId) => {
    const c = chip(assign[term]);
    const state = checked ? (checked[term] ? 'is-right' : 'is-wrong') : '';
    return (
      <div
        className={`bayes-slot ${state} ${sel ? 'is-armed' : ''}`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDropSlot(term)}
        onMouseEnter={() => onHl(term)}
        onMouseLeave={() => onHl(null)}
      >
        <div className="bayes-slot-tex">
          <TeX>{SLOT_TEX[term]}</TeX>
        </div>
        <button
          type="button"
          className="bayes-slot-drop"
          onFocus={() => onHl(term)}
          onBlur={() => onHl(null)}
          onClick={() => {
            if (sel) put(term, sel);
            else if (c) unplace(c.id);
          }}
          aria-label={c ? `${SLOT_READ[term]} is labelled ${c.name}. ${sel ? 'Click to replace it with the selected label.' : 'Click to remove the label.'}` : sel ? `Place the selected label on ${SLOT_READ[term]}` : `${SLOT_READ[term]}: empty, select a label first`}
        >
          {c ? (
            <span className="bayes-chip-in" draggable onDragStart={dragStart(c.id)}>
              {checked && <span aria-hidden="true">{checked[term] ? '✓ ' : '✗ '}</span>}
              {c.name}
            </span>
          ) : (
            <span className="muted">{sel ? 'place here' : 'drop a label'}</span>
          )}
        </button>
      </div>
    );
  };

  return (
    <div className="bayes-game">
      <div className="bayes-formula" aria-label="Bayes’ rule with four labelling slots">
        {slot('post')}
        <span className="bayes-formula-eq">=</span>
        <div className="bayes-frac">
          <div className="bayes-frac-row">
            {slot('lik')}
            {slot('prior')}
          </div>
          <div className="bayes-frac-bar" />
          <div className="bayes-frac-row">{slot('ev')}</div>
        </div>
      </div>
      <div
        className="bayes-chips"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const id = e.dataTransfer.getData('text/plain');
          if (id) unplace(id);
        }}
        aria-label="Labels to place"
      >
        {pool.length ? (
          pool.map((c) => (
            <button
              key={c.id}
              type="button"
              draggable
              onDragStart={dragStart(c.id)}
              className={`bayes-term-chip ${sel === c.id ? 'is-sel' : ''}`}
              aria-pressed={sel === c.id}
              onClick={() => setSel((s) => (s === c.id ? null : c.id))}
            >
              <strong>{c.name}</strong>
              <Rich text={c.meaning} inline />
            </button>
          ))
        ) : (
          <span className="small muted">All labels placed (one is a distractor and should stay here).</span>
        )}
      </div>
      <div className="bayes-actions">
        <Button size="sm" variant="primary" onClick={check} disabled={placed.size === 0}>
          Check
        </Button>
        <Button
          size="sm"
          onClick={() => {
            setAssign(EMPTY);
            setChecked(null);
            setSel(null);
          }}
        >
          Clear
        </Button>
        {tries >= 2 && !allRight && (
          <Button size="sm" variant="ghost" onClick={showAnswer}>
            Show the answer
          </Button>
        )}
        <span className="small muted">Drag a label onto a term, or click a label and then a term. Hover a term to see it in the picture.</span>
      </div>
      {checked &&
        (allRight ? (
          <Callout kind="ok" title={done ? 'All four right' : 'All four right: challenge complete'}>
            <Rich text={TERM_CHIPS.filter((c) => c.term).map((c) => `- **${c.name}** ${c.why}`).join('\n')} />
          </Callout>
        ) : (
          <Callout kind="bad" title={`${nRight} of 4 right`}>
            <Rich
              text={TERM_ORDER.filter((k) => !checked[k])
                .map((k) => {
                  const c = chip(assign[k]);
                  return c ? `- $${SLOT_TEX[k]}$ is not the **${c.name}**: ${c.why}` : `- $${SLOT_TEX[k]}$ has no label yet.`;
                })
                .join('\n')}
            />
          </Callout>
        ))}
    </div>
  );
}
