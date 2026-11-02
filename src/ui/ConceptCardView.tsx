import type { ConceptCard, TopicDef } from '../engine/types';
import { Rich } from './Rich';
import { Badge, More } from './kit';
import { href } from '../app/router';

export function ConceptCardView({ card, topic, compact }: { card: ConceptCard; topic: TopicDef; compact?: boolean }) {
  const explore = (card.exploreIds || []).filter((id) => !id.includes('/')).map((id) => topic.explore.find((e) => e.id === id)).filter(Boolean);
  // Cross-topic links are written "B2/standing" (topic code / explore id).
  const external = (card.exploreIds || []).filter((id) => id.includes('/'));
  const solve = (card.solveIds || []).map((id) => topic.solve.find((g) => g.id === id)).filter(Boolean);
  return (
    <article className={`concept ${compact ? 'is-compact' : ''}`}>
      {!compact && (
        <header className="concept-head">
          <h2>
            <Rich text={card.title} inline />
          </h2>
          {card.lecture && <Badge>{card.lecture}</Badge>}
        </header>
      )}
      {card.formulas && card.formulas.length > 0 && (
        <div className="formula-box">
          {card.formulas.map((f, i) => (
            <Rich key={i} text={f} />
          ))}
        </div>
      )}
      <section className="concept-sec">
        <h4>What it is</h4>
        <Rich text={card.what} />
      </section>
      <section className="concept-sec">
        <h4>When to use it</h4>
        <Rich text={card.when} />
      </section>
      <section className="concept-sec">
        <h4>How to use it</h4>
        <ol className="steps">
          {card.how.map((s, i) => (
            <li key={i}>
              <Rich text={s} inline />
            </li>
          ))}
        </ol>
      </section>
      {card.traps.length > 0 && (
        <section className="concept-sec traps">
          <h4>Common traps</h4>
          <ul>
            {card.traps.map((t, i) => (
              <li key={i}>
                <strong>
                  <Rich text={t.title.replace(/\.?$/, '.')} inline />
                </strong>{' '}
                <Rich text={t.detail} inline />
                {t.source && <span className="muted small"> ({t.source})</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
      {card.more && (
        <More label="More depth">
          <Rich text={card.more} />
        </More>
      )}
      {(explore.length > 0 || solve.length > 0 || external.length > 0) && (
        <footer className="concept-links">
          {explore.map((e) => (
            <a key={e!.id} className="chip" href={href([topic.code, 'explore', e!.id])}>
              ▶ <Rich text={e!.title} inline />
            </a>
          ))}
          {external.map((id) => {
            const [code, item] = id.split('/');
            return (
              <a key={id} className="chip" href={href([code, 'explore', item])}>
                ▶ {code}: {item.replace(/-/g, ' ')}
              </a>
            );
          })}
          {solve.map((g) => (
            <a key={g!.id} className="chip" href={href([topic.code, 'solve', g!.id])}>
              ✎ <Rich text={g!.title} inline />
            </a>
          ))}
        </footer>
      )}
    </article>
  );
}
