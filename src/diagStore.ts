/**
 * Хранение журнала диагностики и замеры (браузерные API — изолированно, с проверкой поддержки).
 * Журнал лежит в localStorage, а не в IndexedDB: запись мгновенная, не мешает сохранению
 * и уцелеет, даже если IndexedDB «зависнет». Никуда не отправляется.
 */
import { appendEntry, type DiagEntry, type DiagPhase } from './diagnostics';

const KEY = 'budget-app:diag';

export function readDiag(): DiagEntry[] {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    return raw ? (JSON.parse(raw) as DiagEntry[]) : [];
  } catch {
    return [];
  }
}

const listeners = new Set<() => void>();

/** Подписка на изменения журнала (для экрана «Диагностика»). */
export function onDiagChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function logDiag(entry: Omit<DiagEntry, 'at'>): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(appendEntry(readDiag(), { ...entry, at: Date.now() })));
  } catch {
    /* хранилище недоступно — журнал не ведём */
  }
  listeners.forEach((fn) => fn());
}

export function clearDiag(): void {
  try {
    globalThis.localStorage?.removeItem(KEY);
  } catch {
    /* ignore */
  }
  listeners.forEach((fn) => fn());
}

export function logEvent(label: string): void {
  logDiag({ kind: 'event', label });
}

// ---- Замер транзакций IndexedDB (заполняет middleware в db.ts) ----

let txTotal = 0;
let txCount = 0;

/** Учесть транзакцию записи: `life` — от создания до события complete (ожидание очереди + запись). */
export function recordTransaction(life: number): void {
  txTotal += life;
  txCount += 1;
}

/** Сбросить счётчики транзакций и вернуть накопленное. */
export function takeTransactions(): { count: number; total: number } {
  const res = { count: txCount, total: txTotal };
  txTotal = txCount = 0;
  return res;
}

/** Дождаться, пока браузер отрисует изменения (два кадра). */
export function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame !== 'function') return resolve();
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

export const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export type { DiagPhase };
