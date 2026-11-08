/**
 * Бэкап (BA-005, decisions.md п. 33–34): сборка файла, разбор и проверка, перевод старых схем к текущей.
 * Чистый модуль: без UI, браузера и базы. Сохранение и загрузка файла — `share.ts`, запись в базу — `db.ts`.
 */
import { ADDED_IN_V3, DEFAULT_CATEGORIES, withMissingDefaults } from './data/categories';
import { CURRENCIES } from './money';
import type { Account, Category, Meta, Transaction } from './types';

export const BACKUP_APP = 'budget-app';

/** Все данные пользователя. */
export interface BackupData {
  accounts: Account[];
  transactions: Transaction[];
  categories: Category[];
  meta: Meta[];
}

export interface BackupFile extends BackupData {
  app: typeof BACKUP_APP;
  /** Версия схемы данных (`SCHEMA_VERSION`) — по ней старые бэкапы переводятся к текущей. */
  schema: number;
  appVersion: string;
  exportedAt: string;
}

/** Ключи `meta`, которые не переносятся бэкапом (относятся к этому телефону). */
const LOCAL_META = new Set(['lastBackup']);

export function buildBackup(data: BackupData, schema: number, appVersion: string, exportedAt: string): BackupFile {
  return {
    app: BACKUP_APP,
    schema,
    appVersion,
    exportedAt,
    accounts: data.accounts,
    transactions: data.transactions,
    categories: data.categories,
    meta: data.meta.filter((m) => !LOCAL_META.has(m.key))
  };
}

export function backupFileName(date: string): string {
  return `budget-backup-${date}.json`;
}

export type ParseResult =
  | { ok: true; data: BackupData; schema: number; exportedAt?: string; appVersion?: string }
  | { ok: false; error: string };

class BackupError extends Error {}

const fail = (msg: string): never => {
  throw new BackupError(msg);
};
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isId = (v: unknown) => Number.isSafeInteger(v) && (v as number) > 0;
const isStr = (v: unknown) => typeof v === 'string' && v.trim() !== '';
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TYPES = ['opening', 'income', 'expense', 'transfer', 'exchange'];
const CURRENCY_CODES = CURRENCIES.map((c) => c.code as string);

/** Проверить, что ids уникальны. */
function uniqueIds(list: { id?: number }[], what: string) {
  const seen = new Set<number>();
  for (const x of list) {
    if (seen.has(x.id!)) fail(`${what}: повторяется номер ${x.id}.`);
    seen.add(x.id!);
  }
}

function parseAccount(v: unknown, i: number): Account {
  const n = `Счёт №${i + 1}`;
  if (!isObj(v)) return fail(`${n}: неверная запись.`);
  if (!isId(v.id)) fail(`${n}: нет номера.`);
  if (!isStr(v.name)) fail(`${n}: нет названия.`);
  if (v.kind !== 'card' && v.kind !== 'cash') fail(`${n}: неизвестный тип «${String(v.kind)}».`);
  if (!CURRENCY_CODES.includes(v.currency as string)) fail(`${n}: неизвестная валюта «${String(v.currency)}».`);
  if (v.group !== 'main' && v.group !== 'savings') fail(`${n}: неизвестная группа «${String(v.group)}».`);
  return {
    id: v.id as number,
    name: v.name as string,
    kind: v.kind as Account['kind'],
    currency: v.currency as Account['currency'],
    group: v.group as Account['group'],
    archived: v.archived === true,
    order: Number.isFinite(v.order) ? (v.order as number) : (v.id as number)
  };
}

function parseCategory(v: unknown, i: number): Category {
  const n = `Категория №${i + 1}`;
  if (!isObj(v)) return fail(`${n}: неверная запись.`);
  if (!isId(v.id)) fail(`${n}: нет номера.`);
  if (!isStr(v.name)) fail(`${n}: нет названия.`);
  if (v.kind !== 'expense' && v.kind !== 'income') fail(`${n}: неизвестный вид «${String(v.kind)}».`);
  return {
    id: v.id as number,
    name: v.name as string,
    kind: v.kind as Category['kind'],
    hidden: v.hidden === true,
    order: Number.isFinite(v.order) ? (v.order as number) : (v.id as number)
  };
}

function parseTransaction(v: unknown, i: number, accounts: Set<number>, categories: Set<number>): Transaction {
  const n = `Операция №${i + 1}`;
  if (!isObj(v)) return fail(`${n}: неверная запись.`);
  if (!isId(v.id)) fail(`${n}: нет номера.`);
  if (typeof v.date !== 'string' || !DATE.test(v.date)) fail(`${n}: неверная дата.`);
  if (!TYPES.includes(v.type as string)) fail(`${n}: неизвестный тип «${String(v.type)}».`);
  if (!accounts.has(v.accountId as number)) fail(`${n}: ссылается на несуществующий счёт.`);
  if (!Number.isSafeInteger(v.amount)) fail(`${n}: сумма должна быть целым числом (центы).`);
  if (v.type !== 'opening' && (v.amount as number) <= 0) fail(`${n}: сумма должна быть больше нуля.`);
  const t: Transaction = { id: v.id as number, date: v.date as string, type: v.type as Transaction['type'], accountId: v.accountId as number, amount: v.amount as number };
  if (v.type === 'transfer' || v.type === 'exchange') {
    if (!accounts.has(v.toAccountId as number)) fail(`${n}: перевод на несуществующий счёт.`);
    t.toAccountId = v.toAccountId as number;
    if (v.toAmount != null) {
      if (!Number.isSafeInteger(v.toAmount) || (v.toAmount as number) <= 0) fail(`${n}: неверная сумма зачисления.`);
      t.toAmount = v.toAmount as number;
    }
  }
  if (v.categoryId != null) {
    if (!categories.has(v.categoryId as number)) fail(`${n}: ссылается на несуществующую категорию.`);
    t.categoryId = v.categoryId as number;
  }
  if (typeof v.note === 'string' && v.note.trim()) t.note = v.note;
  return t;
}

/** Разобрать и проверить файл бэкапа, перевести старую схему к `currentSchema`. */
export function parseBackup(text: string, currentSchema: number): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Файл повреждён или это не бэкап (не JSON).' };
  }
  try {
    if (!isObj(raw) || raw.app !== BACKUP_APP) fail('Это не бэкап приложения «Бюджет».');
    const f = raw as Record<string, unknown>;
    const schema = f.schema as number;
    if (!Number.isSafeInteger(schema) || schema < 1) fail('В файле не указана версия данных.');
    if (schema > currentSchema) fail(`Бэкап сделан более новой версией приложения (данные v${schema}). Обновите приложение и попробуйте снова.`);
    if (!Array.isArray(f.accounts) || !Array.isArray(f.transactions)) fail('В файле нет счетов или операций.');

    const accounts = (f.accounts as unknown[]).map(parseAccount);
    uniqueIds(accounts, 'Счета');

    // Схема 1 — категорий не было: стартовый набор; схема 2 — добавить категории схемы 3.
    let categories: Category[];
    if (schema < 2) categories = DEFAULT_CATEGORIES.map((c, i) => ({ ...c, id: i + 1 }));
    else {
      if (!Array.isArray(f.categories)) fail('В файле нет категорий.');
      categories = (f.categories as unknown[]).map(parseCategory);
    }
    uniqueIds(categories, 'Категории');
    if (schema < 3) categories = withMissingDefaults(categories, ADDED_IN_V3);

    const accIds = new Set(accounts.map((a) => a.id!));
    const catIds = new Set(categories.map((c) => c.id!));
    const transactions = (f.transactions as unknown[]).map((t, i) => parseTransaction(t, i, accIds, catIds));
    uniqueIds(transactions, 'Операции');

    const meta: Meta[] = Array.isArray(f.meta)
      ? (f.meta as unknown[]).filter((m): m is Meta => isObj(m) && isStr(m.key) && !LOCAL_META.has(m.key as string))
      : [];

    return {
      ok: true,
      data: { accounts, transactions, categories, meta },
      schema,
      exportedAt: typeof f.exportedAt === 'string' ? f.exportedAt : undefined,
      appVersion: typeof f.appVersion === 'string' ? f.appVersion : undefined
    };
  } catch (e) {
    if (e instanceof BackupError) return { ok: false, error: e.message };
    throw e;
  }
}

// ---- Сводка для подтверждения ----

/** Русское склонение: plural(3, ['счёт', 'счёта', 'счетов']) → 'счёта'. */
export function plural(n: number, forms: [string, string, string]): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b === 1) return forms[0];
  if (b >= 2 && b <= 4) return forms[1];
  return forms[2];
}

/** «3 счёта, 128 операций» (начальные остатки не считаются операциями). */
export function summarize(data: Pick<BackupData, 'accounts' | 'transactions'>): string {
  const a = data.accounts.length;
  const t = data.transactions.filter((x) => x.type !== 'opening').length;
  return `${a} ${plural(a, ['счёт', 'счёта', 'счетов'])}, ${t} ${plural(t, ['операция', 'операции', 'операций'])}`;
}
