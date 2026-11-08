import { liveQuery } from 'dexie';
import { useEffect, useState } from 'preact/hooks';

/** Живой запрос к IndexedDB: перерисовка при любом изменении данных. */
export function useLive<T>(fn: () => Promise<T>, deps: unknown[]): T | undefined {
  const [value, setValue] = useState<T | undefined>(undefined);
  useEffect(() => {
    const sub = liveQuery(fn).subscribe({ next: setValue, error: (e) => console.error(e) });
    return () => sub.unsubscribe();
  }, deps);
  return value;
}
