/** Дата по местному времени, `YYYY-MM-DD` (по умолчанию — сегодня). */
export function todayIso(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

/** Момент (ISO) → «8 ноября» в этом году, иначе «8 ноября 2025». */
export function shortDate(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const base = `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
  return d.getFullYear() === now.getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

/** Сколько полных суток прошло с момента (ISO). */
export function daysSince(iso: string, now: Date = new Date()): number {
  return Math.floor((now.getTime() - new Date(iso).getTime()) / 86400000);
}
