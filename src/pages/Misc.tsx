// Self-test, trap log, session summary and settings pages.
import { useMemo, useRef, useState } from 'react';
import { ALL_TESTS } from '../selftest/registry';
import { runAll } from '../selftest/runner';
import { allTraps, trapById } from '../engine/traps';
import {
  endSession,
  exportProgress,
  importProgress,
  resetProgress,
  setTheme,
  storageAvailable,
  useProgress,
} from '../app/store';
import { Badge, Button, Callout, LinkButton, Segmented } from '../ui/kit';
import { Rich } from '../ui/Rich';
import { topicByCode } from '../topics';

// ------------------------------------------------------------------ self-test

export function SelfTestPage() {
  const [run, setRun] = useState(0);
  const [filter, setFilter] = useState('');
  const [onlyFail, setOnlyFail] = useState(false);
  const outcomes = useMemo(() => runAll(ALL_TESTS), [run]);
  const passed = outcomes.filter((o) => o.pass).length;
  const checks = outcomes.reduce((t, o) => t + o.results.length, 0);
  const ms = outcomes.reduce((t, o) => t + o.ms, 0);
  const shown = outcomes.filter((o) => (!filter || o.test.topic === filter) && (!onlyFail || !o.pass));
  const topics = [...new Set(outcomes.map((o) => o.test.topic))];
  return (
    <div className="stack">
      <h1>Self-test</h1>
      <p className="lede">
        Every physics function is checked against known values from the summary notes, the reader’s handout tables and exact solutions. The same checks run under
        Node with <code>npm test</code>.
      </p>
      <Callout kind={passed === outcomes.length ? 'ok' : 'bad'} title={`${passed} / ${outcomes.length} tests passed (${checks} checks, ${ms.toFixed(0)} ms)`}>
        <div className="row gap-s wrap">
          <Button size="sm" onClick={() => setRun((r) => r + 1)}>
            Run again
          </Button>
          <label className="row gap-s small">
            <input type="checkbox" checked={onlyFail} onChange={(e) => setOnlyFail(e.target.checked)} /> only failures
          </label>
          <select className="select" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter by topic">
            <option value="">All topics</option>
            {topics.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </Callout>
      {shown.map((o) => (
        <details key={o.test.id} className={`test ${o.pass ? 'is-pass' : 'is-fail'}`} open={!o.pass}>
          <summary>
            <span className="test-mark">{o.pass ? '✓' : '✗'}</span> <Badge>{o.test.topic}</Badge> {o.test.title}
            <span className="muted small"> · {o.results.length} checks · {o.ms.toFixed(1)} ms</span>
          </summary>
          {o.test.source && <div className="muted small">Reference: {o.test.source}</div>}
          {o.error && <Callout kind="bad">Error: {o.error}</Callout>}
          <table className="table test-table">
            <thead>
              <tr>
                <th />
                <th>Check</th>
                <th>Expected</th>
                <th>Got</th>
              </tr>
            </thead>
            <tbody>
              {o.results.map((r, i) => (
                <tr key={i} className={r.pass ? '' : 'row-bad'}>
                  <td>{r.pass ? '✓' : '✗'}</td>
                  <td>
                    {r.label}
                    {r.note && <div className="muted small">{r.note}</div>}
                  </td>
                  <td className="mono">{r.expected}</td>
                  <td className="mono">{r.actual}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ traps

function ago(t: number) {
  if (!t) return '';
  const m = (Date.now() - t) / 60000;
  if (m < 60) return `${Math.max(1, Math.round(m))} min ago`;
  if (m < 60 * 24) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} d ago`;
}

export function TrapsPage() {
  const p = useProgress();
  const [all, setAll] = useState(false);
  // Named traps plus any logged trap id that no topic registered (shown with a readable fallback title).
  const known = allTraps();
  const unknown = Object.keys(p.traps)
    .filter((id) => !known.some((t) => t.id === id))
    .map((id) => trapById(id)!)
    .filter(Boolean);
  const traps = [...known, ...unknown]
    .map((t) => ({ t, s: p.traps[t.id] }))
    .filter((x) => all || (x.s && x.s.hits > 0))
    .sort((a, b) => (b.s?.hits || 0) - (a.s?.hits || 0));
  return (
    <div className="stack">
      <h1>Trap log</h1>
      <p className="lede">
        Every time the app recognises a classic mistake in your answer it logs the trap. A trap counts as <b>beaten</b> once you get that same item right
        afterwards.
      </p>
      <Segmented
        label="Which traps"
        value={all ? 'all' : 'mine'}
        onChange={(v) => setAll(v === 'all')}
        options={[
          { value: 'mine', label: 'Traps I have hit' },
          { value: 'all', label: 'All named traps' },
        ]}
      />
      {!traps.length && <Callout kind="note">No traps hit yet. Wrong answers that match a known mistake show up here.</Callout>}
      <div className="trap-list">
        {traps.map(({ t, s }) => (
          <div key={t.id} className="trap-row">
            <div className="trap-main">
              <div className="trap-title">{t.title}</div>
              {t.detail && <Rich text={t.detail} />}
            </div>
            <div className="trap-stats">
              {s ? (
                <>
                  <Badge tone="bad">hit {s.hits}×</Badge>
                  <Badge tone={s.beaten ? 'ok' : 'muted'}>beaten {s.beaten}×</Badge>
                  <span className="muted small">{ago(s.lastHit)}</span>
                </>
              ) : (
                <span className="muted small">not hit</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ session

export function SessionPage() {
  const p = useProgress();
  const s = p.session;
  const mins = Math.round((s.last - s.start) / 60000);
  const byTrap = s.misses.filter((m) => m.trapId).length;
  return (
    <div className="stack">
      <h1>Session summary</h1>
      <div className="stats">
        <div className="stat">
          <div className="stat-num">{s.done}</div>
          <div className="stat-label">answered</div>
        </div>
        <div className="stat">
          <div className="stat-num">{s.done ? Math.round((100 * s.correct) / s.done) : 0}%</div>
          <div className="stat-label">right first time</div>
        </div>
        <div className="stat">
          <div className="stat-num">{mins}</div>
          <div className="stat-label">minutes</div>
        </div>
        <div className="stat">
          <div className="stat-num">{byTrap}</div>
          <div className="stat-label">misses with a named trap</div>
        </div>
      </div>
      <h2>What you missed</h2>
      {!s.misses.length ? (
        <Callout kind="ok">Nothing missed this session (or nothing answered yet).</Callout>
      ) : (
        <ol className="miss-list">
          {s.misses
            .slice()
            .reverse()
            .map((m, i) => {
              const t = topicByCode(m.topic);
              const trap = m.trapId ? allTraps().find((x) => x.id === m.trapId) : undefined;
              return (
                <li key={i} className="miss">
                  <Badge>{m.topic}</Badge> <a href={m.href}>{m.title}</a>
                  {trap && (
                    <span>
                      {' '}
                      <Badge tone="warn">trap: {trap.title}</Badge>
                    </span>
                  )}
                  {m.note && !trap && <span className="muted small"> — {m.note}</span>}
                  {t && (
                    <span className="muted small">
                      {' '}
                      · <a href={`#/${m.topic}/learn`}>revise {t.short}</a>
                    </span>
                  )}
                </li>
              );
            })}
        </ol>
      )}
      <div className="row gap-s">
        <Button
          onClick={() => {
            if (confirm('End this session and start a fresh summary? (Progress is kept.)')) endSession();
          }}
        >
          End session
        </Button>
        <LinkButton href="#/review" variant="primary">
          Mixed review
        </LinkButton>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ settings

export function SettingsPage() {
  const p = useProgress();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const download = () => {
    const blob = new Blob([exportProgress()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vibrations-lab-progress-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    const r = importProgress(await f.text());
    setMsg(r.ok ? { ok: true, text: 'Progress imported.' } : { ok: false, text: r.error || 'Import failed.' });
  };
  return (
    <div className="stack">
      <h1>Settings & progress</h1>
      <section className="card">
        <h3 className="card-title">Theme</h3>
        <Segmented
          label="Theme"
          value={p.settings.theme}
          onChange={setTheme}
          options={[
            { value: 'system', label: 'Follow system' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
        />
      </section>
      <section className="card">
        <h3 className="card-title">Back up or move your progress</h3>
        {!storageAvailable() && <Callout kind="warn">Browser storage is unavailable here, so progress lasts only until you close the page. Export it to keep it.</Callout>}
        <div className="row gap-s wrap">
          <Button variant="primary" onClick={download}>
            Export progress (.json)
          </Button>
          <Button onClick={() => fileRef.current?.click()}>Import progress…</Button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        </div>
        {msg && <Callout kind={msg.ok ? 'ok' : 'bad'}>{msg.text}</Callout>}
      </section>
      <section className="card">
        <h3 className="card-title">Reset</h3>
        <Button
          variant="danger"
          onClick={() => {
            if (confirm('Erase all progress (flashcard boxes, attempts, traps, streak)? This cannot be undone.')) resetProgress();
          }}
        >
          Reset all progress
        </Button>
      </section>
      <section className="card">
        <h3 className="card-title">About</h3>
        <p>
          Built for UQ METR4202 Robotics & Automation from the exam summary notes, the lecturer's review deck and the 2022–2025 papers with their
          worked solutions. Questions are original wording but cite the past questions they mirror, so you can look up the worked solutions. Every
          algorithm is a pure function checked on the <a href="#/selftest">self-test page</a>, including the ground-truth values from the papers.
        </p>
      </section>
    </div>
  );
}
