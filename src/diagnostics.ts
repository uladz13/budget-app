/**
 * Журнал диагностики (BA-008, decisions.md п. 30): длительность сохранений по фазам и события приложения.
 * Чистый модуль: формат записей и текста; хранение — `diagStore.ts`.
 */

export interface DiagPhase {
  name: string;
  ms: number;
}

export interface DiagEntry {
  /** Время записи, мс от 1970 (Date.now()). */
  at: number;
  kind: 'save' | 'event';
  /** Что сохраняли («Операция · сохранить») или что случилось («возврат в приложение»). */
  label: string;
  /** Для сохранений: общая длительность от нажатия до обновления экрана. */
  total?: number;
  phases?: DiagPhase[];
  ok?: boolean;
  error?: string;
}

export const DIAG_MAX = 50;

/** Добавить запись в конец, оставив последние `max`. */
export function appendEntry(log: DiagEntry[], entry: DiagEntry, max = DIAG_MAX): DiagEntry[] {
  return [...log, entry].slice(-max);
}

const p2 = (n: number) => String(n).padStart(2, '0');

/** '08.11 14:03:21' по местному времени. */
export function formatStamp(at: number): string {
  const d = new Date(at);
  return `${p2(d.getDate())}.${p2(d.getMonth() + 1)} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
}

/** Миллисекунды для людей: 12 мс, 1,4 с. */
export function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} мс`;
  return `${(ms / 1000).toFixed(1).replace('.', ',')} с`;
}

/** Одна строка журнала. */
export function formatEntry(e: DiagEntry): string {
  const head = `${formatStamp(e.at)} ${e.label}`;
  if (e.kind === 'event') return head;
  const phases = (e.phases ?? []).map((p) => `${p.name} ${formatMs(p.ms)}`).join(' · ');
  const status = e.ok === false ? ` ОШИБКА: ${e.error ?? ''}` : '';
  return `${head}: ${formatMs(e.total ?? 0)}${phases ? ` (${phases})` : ''}${status}`;
}

/** Текст для отправки разработчику: шапка (версия, браузер) и записи, новые сверху. */
export function formatLog(entries: DiagEntry[], header: string[]): string {
  return [...header, '', ...[...entries].reverse().map(formatEntry)].join('\n');
}
