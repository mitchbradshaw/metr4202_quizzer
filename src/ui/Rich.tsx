// Renders Rich text: $inline$ / $$display$$ TeX (KaTeX), **bold**, *italic*, `code`,
// paragraphs (blank line), "- " bullets and "1. " numbered lists.
import katex from 'katex';
import { Fragment, memo, type ReactNode } from 'react';

const MACROS: Record<string, string> = {
  '\\wn': '\\omega_n',
  '\\wd': '\\omega_d',
};

const cache = new Map<string, string>();

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
}

export function renderTeX(src: string, display = false): string {
  const key = (display ? 'D|' : 'I|') + src;
  let html = cache.get(key);
  if (html === undefined) {
    try {
      html = katex.renderToString(src, { displayMode: display, throwOnError: false, strict: 'ignore', output: 'html', macros: { ...MACROS } });
    } catch {
      html = `<code>${escapeHtml(src)}</code>`;
    }
    if (cache.size > 4000) cache.clear();
    cache.set(key, html);
  }
  return html;
}

export const TeX = memo(function TeX({ children, display }: { children: string; display?: boolean }) {
  return <span className={display ? 'tex-display' : 'tex'} dangerouslySetInnerHTML={{ __html: renderTeX(children, !!display) }} />;
});

const ESC = '\u0000';
const STAR = '\u0001';
const TOKEN = /\$\$([\s\S]+?)\$\$|\$([^$]+?)\$|\*\*([\s\S]+?)\*\*|\*([^*\s][^*]*?)\*|`([^`]+)`/g;
const ALNUM = /[A-Za-z0-9]/;

function inline(text: string, k: string): ReactNode[] {
  const out: ReactNode[] = [];
  // `\$` and `\*` are literal; so is a `*` glued to a letter or digit (A*, RRT*, PRM*), which never opens or
  // closes italics. (No regex lookbehind: older Safari cannot parse it.)
  const src = text.replace(/\\\$/g, ESC).replace(/\\\*/g, STAR);
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  // A fresh regex per call: inline() recurses for **bold**/*italic*, and a shared /g regex would
  // have its lastIndex reset by the inner call, re-matching the same token forever.
  const re = new RegExp(TOKEN.source, 'g');
  const plain = (s: string) => s.split(ESC).join('$').split(STAR).join('*');
  while ((m = re.exec(src))) {
    if (m[4] !== undefined) {
      const before = m.index > 0 ? src[m.index - 1] : '';
      const end = m.index + m[0].length;
      const after = end < src.length ? src[end] : '';
      if (ALNUM.test(before) || ALNUM.test(after)) {
        // Not emphasis: keep the first star as text and rescan just after it.
        re.lastIndex = m.index + 1;
        continue;
      }
    }
    if (m.index > last) out.push(plain(src.slice(last, m.index)));
    const key = `${k}-${i++}`;
    if (m[1] !== undefined) out.push(<TeX key={key} display>{plain(m[1])}</TeX>);
    else if (m[2] !== undefined) out.push(<TeX key={key}>{plain(m[2])}</TeX>);
    else if (m[3] !== undefined) out.push(<strong key={key}>{inline(m[3], key)}</strong>);
    else if (m[4] !== undefined) out.push(<em key={key}>{inline(m[4], key)}</em>);
    else if (m[5] !== undefined) out.push(<code key={key}>{plain(m[5])}</code>);
    last = re.lastIndex;
  }
  if (last < src.length) out.push(plain(src.slice(last)));
  return out;
}

function block(par: string, k: string): ReactNode {
  const lines = par.split('\n').map((l) => l.trimEnd());
  if (lines.every((l) => /^\s*[-•]\s+/.test(l))) {
    return (
      <ul key={k}>
        {lines.map((l, i) => (
          <li key={i}>{inline(l.replace(/^\s*[-•]\s+/, ''), `${k}-${i}`)}</li>
        ))}
      </ul>
    );
  }
  if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) {
    return (
      <ol key={k}>
        {lines.map((l, i) => (
          <li key={i}>{inline(l.replace(/^\s*\d+[.)]\s+/, ''), `${k}-${i}`)}</li>
        ))}
      </ol>
    );
  }
  return (
    <div className="p" key={k}>
      {inline(lines.join('\n'), k)}
    </div>
  );
}

/** Rich text. `inline` renders without paragraph wrappers (labels, options, table cells). */
export const Rich = memo(function Rich({ text, inline: isInline, className }: { text: string; inline?: boolean; className?: string }) {
  if (!text) return null;
  if (isInline) return <span className={className}>{inline(text, 'r')}</span>;
  const pars = text.split(/\n\s*\n/);
  return <div className={`rich ${className || ''}`}>{pars.map((p, i) => block(p, `b${i}`))}</div>;
});

/** Join nodes with separators (helper for lists of Rich fragments). */
export function joinNodes(nodes: ReactNode[], sep: ReactNode = ', ') {
  return nodes.map((n, i) => (
    <Fragment key={i}>
      {i > 0 && sep}
      {n}
    </Fragment>
  ));
}
