/**
 * Отчёты (BA-004, decisions.md п. 9, 38–39): доходы и расходы за период по валюте и категориям,
 * сравнение с предыдущим периодом, расходы по месяцам. Чистый модуль: без UI, браузера и базы.
 */
import { shiftMonth } from './operations';
import type { Account, Currency, Transaction } from './types';

/** Период включительно, даты `YYYY-MM-DD`. */
export interface Period {
  from: string;
  to: string;
}

// ---- Даты (UTC — без сдвигов из-за часовых поясов) ----

const toUtc = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function addDays(date: string, n: number): string {
  return fromUtc(toUtc(date) + n * 86400000);
}

/** Число дней в периоде (включительно). */
export function periodDays(p: Period): number {
  return Math.round((toUtc(p.to) - toUtc(p.from)) / 86400000) + 1;
}

/** '2026-11' → 1–30 ноября. */
export function monthPeriod(month: string): Period {
  const next = shiftMonth(month, 1);
  return { from: `${month}-01`, to: addDays(`${next}-01`, -1) };
}

/** Предыдущий период той же длины, вплотную перед данным. Для целого месяца — прошлый месяц. */
export function previousPeriod(p: Period): Period {
  const m = p.from.slice(0, 7);
  const whole = monthPeriod(m);
  if (whole.from === p.from && whole.to === p.to) return monthPeriod(shiftMonth(m, -1));
  const len = periodDays(p);
  return { from: addDays(p.from, -len), to: addDays(p.from, -1) };
}

/** Период внутри одного месяца — его месяц, иначе null (для перехода в «Операции»). */
export function singleMonth(p: Period): string | null {
  return p.from.slice(0, 7) === p.to.slice(0, 7) ? p.from.slice(0, 7) : null;
}

const inPeriod = (t: Transaction, p: Period) => t.date >= p.from && t.date <= p.to;

// ---- Отчёт ----

const CURRENCY_ORDER: Currency[] = ['EUR', 'USD', 'BYN'];

/** Валюты доходов и расходов в периоде (EUR, USD, BYN — в этом порядке). */
export function currenciesInPeriod(txs: Transaction[], accounts: Account[], p: Period): Currency[] {
  const byId = new Map(accounts.map((a) => [a.id!, a]));
  const set = new Set<Currency>();
  for (const t of txs) {
    if ((t.type === 'income' || t.type === 'expense') && inPeriod(t, p)) {
      const a = byId.get(t.accountId);
      if (a) set.add(a.currency);
    }
  }
  return CURRENCY_ORDER.filter((c) => set.has(c));
}

export interface CategoryLine {
  /** undefined — операции без категории. */
  categoryId?: number;
  amount: number;
  /** Доля от расходов (доходов) периода, 0…1. */
  share: number;
  /** Сумма в предыдущем периоде и разница (amount − prev). */
  prev: number;
  delta: number;
}

export interface Report {
  income: number;
  /** Расходы со счетов основной группы. */
  expense: number;
  /** Расходы со счетов накоплений — отдельно, не входят в expense и net. */
  fromSavings: number;
  /** income − expense. */
  net: number;
  expenseByCategory: CategoryLine[];
  incomeByCategory: CategoryLine[];
}

interface Sums {
  income: number;
  expense: number;
  fromSavings: number;
  expenseCat: Map<number | undefined, number>;
  incomeCat: Map<number | undefined, number>;
}

function sums(txs: Transaction[], byId: Map<number, Account>, p: Period, currency: Currency): Sums {
  const s: Sums = { income: 0, expense: 0, fromSavings: 0, expenseCat: new Map(), incomeCat: new Map() };
  const add = (m: Map<number | undefined, number>, k: number | undefined, v: number) => m.set(k, (m.get(k) ?? 0) + v);
  for (const t of txs) {
    if ((t.type !== 'income' && t.type !== 'expense') || !inPeriod(t, p)) continue;
    const a = byId.get(t.accountId);
    if (!a || a.currency !== currency) continue;
    if (t.type === 'income') {
      s.income += t.amount;
      add(s.incomeCat, t.categoryId, t.amount);
    } else if (a.group === 'main') {
      s.expense += t.amount;
      add(s.expenseCat, t.categoryId, t.amount);
    } else {
      s.fromSavings += t.amount;
    }
  }
  return s;
}

function lines(now: Map<number | undefined, number>, prev: Map<number | undefined, number>, total: number): CategoryLine[] {
  return [...now]
    .filter(([, amount]) => amount > 0)
    .map(([categoryId, amount]) => {
      const p = prev.get(categoryId) ?? 0;
      return { categoryId, amount, share: total ? amount / total : 0, prev: p, delta: amount - p };
    })
    .sort((a, b) => b.amount - a.amount);
}

/** Отчёт за период в одной валюте; сравнение — с периодом `prev` (по умолчанию предыдущий той же длины). */
export function buildReport(txs: Transaction[], accounts: Account[], p: Period, currency: Currency, prev: Period = previousPeriod(p)): Report {
  const byId = new Map(accounts.map((a) => [a.id!, a]));
  const now = sums(txs, byId, p, currency);
  const before = sums(txs, byId, prev, currency);
  return {
    income: now.income,
    expense: now.expense,
    fromSavings: now.fromSavings,
    net: now.income - now.expense,
    expenseByCategory: lines(now.expenseCat, before.expenseCat, now.expense),
    incomeByCategory: lines(now.incomeCat, before.incomeCat, now.income)
  };
}

export interface MonthPoint {
  month: string;
  /** Расходы основного баланса за месяц. */
  amount: number;
}

/** Расходы основного баланса за `count` месяцев, заканчивая `endMonth`. */
export function monthlyExpenses(txs: Transaction[], accounts: Account[], endMonth: string, currency: Currency, count = 6): MonthPoint[] {
  const byId = new Map(accounts.map((a) => [a.id!, a]));
  return Array.from({ length: count }, (_, i) => {
    const month = shiftMonth(endMonth, i - count + 1);
    return { month, amount: sums(txs, byId, monthPeriod(month), currency).expense };
  });
}

/** Среднее по месяцам, начиная с первого месяца с расходами (пустые месяцы до начала учёта не занижают среднее). */
export function averageFromFirst(points: MonthPoint[]): number {
  const first = points.findIndex((p) => p.amount > 0);
  if (first < 0) return 0;
  const used = points.slice(first);
  return Math.round(used.reduce((s, p) => s + p.amount, 0) / used.length);
}
