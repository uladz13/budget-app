/**
 * Операции: сборка из формы и проверка, курс обмена, отбор и группировка для списка.
 * Чистый модуль: без UI, браузера и базы.
 */
import { currencyInfo, parseAmount, amountToInput } from './money';
import type { Account, Currency, Transaction } from './types';

/** Вкладка формы. Перевод между разными валютами сохраняется как `exchange` (decisions.md п. 24). */
export type OperationKind = 'expense' | 'income' | 'transfer';

/** Состояние формы: суммы — строки, как ввёл пользователь. */
export interface OperationDraft {
  kind: OperationKind;
  date: string;
  accountId?: number;
  toAccountId?: number;
  amount: string;
  toAmount: string;
  categoryId?: number;
  note: string;
}

export type BuildResult = { ok: true; tx: Transaction } | { ok: false; error: string };

/** Вид формы для сохранённой операции. */
export function kindOf(t: Transaction): OperationKind {
  return t.type === 'income' ? 'income' : t.type === 'expense' ? 'expense' : 'transfer';
}

/** Валюты счетов перевода различаются — нужна вторая сумма. */
export function isExchange(from?: Account, to?: Account): boolean {
  return !!from && !!to && from.currency !== to.currency;
}

/** Проверить форму и собрать операцию (без id; при правке id добавляет вызывающий). */
export function buildTransaction(d: OperationDraft, accounts: Account[]): BuildResult {
  const byId = (id?: number) => (id == null ? undefined : accounts.find((a) => a.id === id));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) return { ok: false, error: 'Укажите дату.' };
  const from = byId(d.accountId);
  if (!from) return { ok: false, error: d.kind === 'transfer' ? 'Выберите счёт списания.' : 'Выберите счёт.' };
  const amount = parseAmount(d.amount, from.currency);
  if (amount == null || amount <= 0) return { ok: false, error: 'Введите сумму больше нуля. Пример: 12,50' };
  const note = d.note.trim() || undefined;

  if (d.kind !== 'transfer') {
    if (d.categoryId == null) return { ok: false, error: 'Выберите категорию.' };
    return { ok: true, tx: { date: d.date, type: d.kind, accountId: from.id!, amount, categoryId: d.categoryId, note } };
  }

  const to = byId(d.toAccountId);
  if (!to) return { ok: false, error: 'Выберите счёт зачисления.' };
  if (to.id === from.id) return { ok: false, error: 'Счета списания и зачисления должны быть разными.' };
  if (!isExchange(from, to)) {
    return { ok: true, tx: { date: d.date, type: 'transfer', accountId: from.id!, amount, toAccountId: to.id!, note } };
  }
  const toAmount = parseAmount(d.toAmount, to.currency);
  if (toAmount == null || toAmount <= 0) return { ok: false, error: `Введите сумму зачисления в ${to.currency}.` };
  return { ok: true, tx: { date: d.date, type: 'exchange', accountId: from.id!, amount, toAccountId: to.id!, toAmount, note } };
}

/** Форма для правки сохранённой операции. */
export function draftFromTransaction(t: Transaction, accounts: Account[]): OperationDraft {
  const cur = (id?: number) => accounts.find((a) => a.id === id)?.currency;
  return {
    kind: kindOf(t),
    date: t.date,
    accountId: t.accountId,
    toAccountId: t.toAccountId,
    amount: amountToInput(t.amount, cur(t.accountId)),
    toAmount: t.toAmount == null ? '' : amountToInput(t.toAmount, cur(t.toAccountId)),
    categoryId: t.categoryId,
    note: t.note ?? ''
  };
}

/** Курс обмена для подсказки: «1 EUR = 1,1500 USD». Float — только для показа, не для хранения. */
export function exchangeRateLabel(amount: number, from: Currency, toAmount: number, to: Currency): string {
  if (amount <= 0 || toAmount <= 0) return '';
  const a = amount / 10 ** currencyInfo(from).digits;
  const b = toAmount / 10 ** currencyInfo(to).digits;
  return `1 ${from} = ${(b / a).toFixed(4).replace('.', ',')} ${to}`;
}

// ---- Месяцы и дни ----

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

/** Месяц даты: '2026-11-08' → '2026-11'. */
export function monthOf(date: string): string {
  return date.slice(0, 7);
}

/** Сдвиг месяца: ('2026-01', -1) → '2025-12'. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const total = y * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/** '2026-11' → 'Ноябрь 2026'. */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

/** '2026-11-08' → '8 ноября, вс'. */
export function dayLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${d} ${MONTHS_GEN[m - 1]}, ${WEEKDAYS[wd]}`;
}

// ---- Список ----

export interface OperationFilter {
  /** Период включительно, `YYYY-MM-DD` (месяц — с 1-го по последнее число). */
  from: string;
  to: string;
  /** Пусто или нет — все счета; иначе операции, где счёт списания или зачисления — один из выбранных (BA-009). */
  accountIds?: number[];
  /** Пусто или нет — все категории; иначе — одна из выбранных. */
  categoryIds?: number[];
  /** Поиск по комментарию, без учёта регистра. */
  query?: string;
}

/**
 * Операции для списка: без начальных остатков (decisions.md п. 27), в периоде и по фильтрам.
 * Внутри счетов и внутри категорий — «или», между фильтрами — «и» (BA-009).
 */
export function filterOperations(txs: Transaction[], f: OperationFilter): Transaction[] {
  const q = f.query?.trim().toLowerCase();
  const acc = f.accountIds?.length ? new Set(f.accountIds) : null;
  const cat = f.categoryIds?.length ? new Set(f.categoryIds) : null;
  return txs.filter(
    (t) =>
      t.type !== 'opening' &&
      t.date >= f.from &&
      t.date <= f.to &&
      (!acc || acc.has(t.accountId) || (t.toAccountId != null && acc.has(t.toAccountId))) &&
      (!cat || (t.categoryId != null && cat.has(t.categoryId))) &&
      (!q || (t.note ?? '').toLowerCase().includes(q))
  );
}

/** Подпись кнопки фильтра: ничего не выбрано — `all`, одно — его название, больше — «Карта +2» (BA-009). */
export function selectionLabel(selectedNames: string[], all: string): string {
  if (!selectedNames.length) return all;
  return selectedNames.length === 1 ? selectedNames[0] : `${selectedNames[0]} +${selectedNames.length - 1}`;
}

export interface FilterTotals {
  currency: Currency;
  income: number;
  /** Все расходы отобранных операций, включая счета накоплений (BA-011, п. 2). */
  expense: number;
  /** income − expense. */
  net: number;
  /** Переводы и обмены на выбранные счета с других — только при фильтре по счёту. */
  transferIn: number;
  /** Переводы и обмены с выбранных счетов на другие. */
  transferOut: number;
}

const CURRENCY_ORDER: Currency[] = ['EUR', 'USD', 'BYN'];

/**
 * Итоги по отфильтрованным операциям (BA-011) — по каждой валюте отдельно; валюты без сумм не показываются.
 * Доходы и расходы — в валюте счёта. Переводы и обмены в доходы и расходы не входят; при фильтре по счетам
 * считаются «пришло / ушло» — только между выбранными и остальными счетами (внутренние не считаются).
 */
export function filterTotals(filtered: Transaction[], accounts: Account[], accountIds?: number[]): FilterTotals[] {
  const cur = new Map(accounts.map((a) => [a.id!, a.currency]));
  const sel = accountIds?.length ? new Set(accountIds) : null;
  const res = new Map<Currency, FilterTotals>();
  const get = (c: Currency) => {
    if (!res.has(c)) res.set(c, { currency: c, income: 0, expense: 0, net: 0, transferIn: 0, transferOut: 0 });
    return res.get(c)!;
  };
  for (const t of filtered) {
    const c = cur.get(t.accountId);
    if (!c) continue;
    if (t.type === 'income') get(c).income += t.amount;
    else if (t.type === 'expense') get(c).expense += t.amount;
    else if ((t.type === 'transfer' || t.type === 'exchange') && sel && t.toAccountId != null) {
      const fromSel = sel.has(t.accountId);
      const toSel = sel.has(t.toAccountId);
      if (fromSel && !toSel) get(c).transferOut += t.amount;
      if (toSel && !fromSel) {
        const tc = cur.get(t.toAccountId);
        if (tc) get(tc).transferIn += t.toAmount ?? t.amount;
      }
    }
  }
  return CURRENCY_ORDER.filter((c) => res.has(c))
    .map((c) => ({ ...res.get(c)!, net: res.get(c)!.income - res.get(c)!.expense }))
    .filter((x) => x.income || x.expense || x.transferIn || x.transferOut);
}

export interface DayGroup {
  date: string;
  items: Transaction[];
}

/** Группы по дням: новые дни сверху, внутри дня — позже добавленные сверху. */
export function groupByDay(txs: Transaction[]): DayGroup[] {
  const map = new Map<string, Transaction[]>();
  for (const t of txs) map.set(t.date, [...(map.get(t.date) ?? []), t]);
  return [...map]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([date, items]) => ({ date, items: items.sort((a, b) => (b.id ?? 0) - (a.id ?? 0)) }));
}
