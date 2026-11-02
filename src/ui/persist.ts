// In-memory persistence for in-progress answers: switching tabs (or sprint items) and coming back
// restores what was typed. Lives for the page session; progress itself is saved by app/store.
import { useCallback, useState } from 'react';

const memory = new Map<string, unknown>();

/** useState that survives unmount/remount for the same key (undefined key = plain useState). */
export function usePersisted<T>(key: string | undefined, init: T | (() => T)): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    if (key && memory.has(key)) return memory.get(key) as T;
    return typeof init === 'function' ? (init as () => T)() : init;
  });
  const set = useCallback(
    (v: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const next = typeof v === 'function' ? (v as (p: T) => T)(prev) : v;
        if (key) memory.set(key, next);
        return next;
      });
    },
    [key]
  );
  return [value, set];
}

/** Forget everything saved under a key prefix (e.g. "Same numbers again"). */
export function clearPersisted(prefix: string) {
  for (const k of [...memory.keys()]) if (k.startsWith(prefix)) memory.delete(k);
}
