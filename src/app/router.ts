// Hash routing: #/A4/explore/absorber?t=2&s=123456. Back button and bookmarks work.
import { useSyncExternalStore } from 'react';

export interface Route {
  parts: string[];
  query: URLSearchParams;
  raw: string;
}

export function parseHash(hash: string): Route {
  const h = hash.replace(/^#\/?/, '');
  const [path, qs] = h.split('?');
  const parts = (path || '').split('/').filter(Boolean).map(decodeURIComponent);
  return { parts, query: new URLSearchParams(qs || ''), raw: h };
}

function subscribe(cb: () => void) {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}

let cachedHash = '';
let cachedRoute: Route = parseHash('');
function snapshot(): Route {
  const h = window.location.hash;
  if (h !== cachedHash) {
    cachedHash = h;
    cachedRoute = parseHash(h);
  }
  return cachedRoute;
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, snapshot, () => cachedRoute);
}

type Query = Record<string, string | number | undefined | null>;

/** Build an href: href('A4', 'solve', 'gen-id') or href('A4/solve', { t: 2 }). */
export function href(path: string | string[], query?: Query): string {
  const p = (Array.isArray(path) ? path : [path]).join('/').replace(/^\/+/, '');
  const q = query
    ? Object.entries(query)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&')
    : '';
  return `#/${p}${q ? `?${q}` : ''}`;
}

export function go(path: string | string[], query?: Query) {
  window.location.hash = href(path, query);
}

/** Replace the current entry (no new history item), e.g. when changing a seed. */
export function replace(path: string | string[], query?: Query) {
  const url = `${window.location.pathname}${window.location.search}${href(path, query)}`;
  window.history.replaceState(null, '', url);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}
