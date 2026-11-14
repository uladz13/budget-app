/**
 * Выгрузка в CSV (BA-006, BA-012, BA-013): общие правила и выгрузка операций и отчёта.
 * Формат для Excel и Google Таблиц: разделитель «;», дробная часть через запятую, BOM, строки через CRLF.
 * Чистый модуль: без UI, браузера и базы. Сохранение файла — `share.ts`.
 */
import { amountToInput } from './money';
import { monthLabel } from './operations';
import type { MonthPoint, Report } from './reports';
import type { Account, Category, Currency, Transaction } from './types';

const BOM = '﻿';

/** Поле CSV: в кавычках, если есть «;», кавычки или перенос строки. */
export function csvField(s: string): string {
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Документ CSV: заголовок и строки, BOM, CRLF. */
export function csvDocument(header: string[], rows: string[][]): string {
  return BOM + [header, ...rows].map((r) => r.map(csvField).join(';')).join('\r\n') + '\r\n';
}

/** Сумма для таблиц: 123456 → «1234,56», −500 → «-5,00» (без разделителей тысяч и знака валюты). */
export function csvAmount(minor: number, currency: Currency = 'EUR'): string {
  return amountToInput(minor, currency);
}

/** '2026-11-08' → '08.11.2026'. */
export function csvDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

/** Часть имени файла: месяц «2026-11» или период «2026-11-01_2026-11-14». */
export function rangeName(range: { month?: string; from: string; to: string }): string {
  return range.month ?? `${range.from}_${range.to}`;
}

// ---- Операции (BA-012) ----

const TYPE_LABEL: Record<Transaction['type'], string> = {
  opening: 'Начальный остаток',
  income: 'Доход',
  expense: 'Расход',
  transfer: 'Перевод',
  exchange: 'Обмен'
};

export const TRANSACTIONS_HEADER = [
  'Дата',
  'Тип',
  'Счёт',
  'Счёт зачисления',
  'Категория',
  'Сумма',
  'Валюта',
  'Сумма зачисления',
  'Валюта зачисления',
  'Комментарий'
];

/**
 * Операции в CSV (BA-012, п. 2): по дате от старых к новым (как удобно в таблице), внутри дня — по порядку
 * добавления. Расход — со знаком «−»; у перевода и обмена — сумма списания и сумма зачисления.
 */
export function transactionsToCsv(txs: Transaction[], accounts: Account[], categories: Category[]): string {
  const acc = new Map(accounts.map((a) => [a.id!, a]));
  const cat = new Map(categories.map((c) => [c.id!, c.name]));
  const sorted = [...txs].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.id ?? 0) - (b.id ?? 0)));
  const rows = sorted.map((t) => {
    const from = acc.get(t.accountId);
    const cur = from?.currency ?? 'EUR';
    const to = t.toAccountId != null ? acc.get(t.toAccountId) : undefined;
    const transfer = t.type === 'transfer' || t.type === 'exchange';
    const sum = t.type === 'expense' ? -t.amount : t.amount;
    return [
      csvDate(t.date),
      TYPE_LABEL[t.type],
      from?.name ?? 'Удалённый счёт',
      transfer ? to?.name ?? 'Удалённый счёт' : '',
      t.categoryId != null ? cat.get(t.categoryId) ?? 'Удалённая категория' : '',
      csvAmount(sum, cur),
      cur,
      transfer ? csvAmount(t.toAmount ?? t.amount, to?.currency ?? cur) : '',
      transfer ? to?.currency ?? cur : '',
      t.note ?? ''
    ];
  });
  return csvDocument(TRANSACTIONS_HEADER, rows);
}

export function transactionsFileName(range: { month?: string; from: string; to: string }): string {
  return `operacii-${rangeName(range)}.csv`;
}

// ---- Отчёт (BA-013) ----

export const REPORT_HEADER = ['Блок', 'Название', 'Сумма', 'Доля %', 'Изменение', 'Валюта'];

export interface ReportForCsv {
  currency: Currency;
  report: Report;
  /** Расходы по месяцам — только в режиме «Месяц». */
  months?: MonthPoint[];
}

const pct = (share: number) => (Math.round(share * 1000) / 10).toFixed(1).replace('.', ',');

/**
 * Отчёт в CSV (BA-013): по каждой валюте — «Сводка» (Доходы, Расходы, Итог, Из накоплений),
 * «Расходы» и «Доходы» по категориям (сумма, доля, изменение к прошлому периоду), «По месяцам».
 */
export function reportToCsv(parts: ReportForCsv[], categoryName: (id?: number) => string): string {
  const rows: string[][] = [];
  for (const { currency: c, report: r, months } of parts) {
    const a = (v: number) => csvAmount(v, c);
    rows.push(['Сводка', 'Доходы', a(r.income), '', '', c]);
    rows.push(['Сводка', 'Расходы', a(r.expense), '', '', c]);
    rows.push(['Сводка', 'Итог', a(r.net), '', '', c]);
    if (r.fromSavings) rows.push(['Сводка', 'Из накоплений', a(r.fromSavings), '', '', c]);
    for (const l of r.expenseByCategory) rows.push(['Расходы', categoryName(l.categoryId), a(l.amount), pct(l.share), a(l.delta), c]);
    for (const l of r.incomeByCategory) rows.push(['Доходы', categoryName(l.categoryId), a(l.amount), pct(l.share), a(l.delta), c]);
    for (const m of months ?? []) rows.push(['По месяцам', monthLabel(m.month), a(m.amount), '', '', c]);
  }
  return csvDocument(REPORT_HEADER, rows);
}

export function reportFileName(range: { month?: string; from: string; to: string }): string {
  return `otchet-${rangeName(range)}.csv`;
}
