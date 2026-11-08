import Dexie, { type Table } from 'dexie';
import type { Account, Category, Meta, Transaction } from './types';
import { ADDED_IN_V3, DEFAULT_CATEGORIES } from './data/categories';
import { kindOf, type OperationKind } from './operations';

/**
 * Хранилище — только через этот модуль. Схема меняется только новой `version(n)` с миграцией;
 * базу никогда не очищаем и не пересоздаём (CLAUDE.md, принцип 3).
 */
class BudgetDB extends Dexie {
  accounts!: Table<Account, number>;
  transactions!: Table<Transaction, number>;
  meta!: Table<Meta, string>;
  categories!: Table<Category, number>;

  constructor() {
    super('budget-app');
    // v1 (BA-001): счета, операции, настройки.
    this.version(1).stores({
      accounts: '++id',
      transactions: '++id, date, accountId, toAccountId, type',
      meta: 'key'
    });
    // v2 (BA-002): категории расходов и доходов; стартовый набор добавляется к существующим данным.
    this.version(2)
      .stores({ categories: '++id, kind' })
      .upgrade((tx) => seedCategories(tx.table('categories')));
    // v3 (BA-002): в стартовый набор добавлены «Вкусняшки» и «Вредные привычки». Базам, где набор уже создан,
    // они добавляются, если категории с таким именем нет; место — по стартовому порядку (после «Еды»).
    this.version(3)
      .stores({})
      .upgrade((tx) => addMissingDefaults(tx.table('categories'), ADDED_IN_V3));
    // Новая установка: upgrade не выполняется — стартовые категории создаёт populate.
    this.on('populate', (tx) => seedCategories(tx.table('categories')));
  }
}

/** Стартовые категории — только в пустую таблицу (повторный вызов ничего не дублирует). */
async function seedCategories(table: Table<Category, number>): Promise<void> {
  if ((await table.count()) === 0) await table.bulkAdd(DEFAULT_CATEGORIES.map((c) => ({ ...c })));
}

/**
 * Добавить стартовые категории расходов из списка `names`, которых нет по имени. Порядок всех стартовых
 * категорий выравнивается по стартовому набору; категории пользователя остаются после них в своём порядке.
 */
async function addMissingDefaults(table: Table<Category, number>, names: string[]): Promise<void> {
  const existing = (await table.toArray()).filter((c) => c.kind === 'expense');
  const have = new Set(existing.map((c) => c.name));
  const defaults = DEFAULT_CATEGORIES.filter((c) => c.kind === 'expense');
  const missing = defaults.filter((c) => names.includes(c.name) && !have.has(c.name));
  if (!missing.length) return;
  await table.bulkAdd(missing.map((c) => ({ ...c })));
  const rank = new Map(defaults.map((c) => [c.name, c.order]));
  const all = (await table.toArray()).filter((c) => c.kind === 'expense');
  const sorted = all.sort((a, b) => (rank.get(a.name) ?? 1000 + a.order) - (rank.get(b.name) ?? 1000 + b.order));
  await Promise.all(sorted.map((c, i) => table.update(c.id!, { order: i + 1 })));
}

export const db = new BudgetDB();

/** Версия схемы данных — совпадает с номером версии базы и полем `schema` бэкапа. */
export const SCHEMA_VERSION = 3;

/** Открыть базу (ошибку показывает оболочка приложения). */
export async function initDb(): Promise<void> {
  await db.open();
}

// ---- Операции ----

/** Счета, выбранные в последней операции этого вида (decisions.md п. 25). */
export interface LastAccounts {
  accountId?: number;
  toAccountId?: number;
}

const lastKey = (kind: OperationKind) => `lastAccount:${kind}`;

export async function getLastAccounts(kind: OperationKind): Promise<LastAccounts> {
  return ((await db.meta.get(lastKey(kind)))?.value as LastAccounts | undefined) ?? {};
}

/** Создать (без id) или изменить операцию; запоминает счета для следующей операции этого вида. */
export async function saveTransaction(tx: Transaction): Promise<number> {
  return db.transaction('rw', db.transactions, db.meta, async () => {
    const id = await db.transactions.put(tx);
    await db.meta.put({ key: lastKey(kindOf(tx)), value: { accountId: tx.accountId, toAccountId: tx.toAccountId } });
    return id;
  });
}

export async function deleteTransaction(id: number): Promise<void> {
  await db.transactions.delete(id);
}

/** Начальный остаток счёта (служебная операция `opening`), если есть. */
export async function getOpening(accountId: number): Promise<Transaction | undefined> {
  return db.transactions.where('accountId').equals(accountId).filter((t) => t.type === 'opening').first();
}

/** Есть ли у счёта операции, кроме начального остатка (тогда валюту менять нельзя). */
export async function hasOperations(accountId: number): Promise<boolean> {
  const from = await db.transactions.where('accountId').equals(accountId).filter((t) => t.type !== 'opening').count();
  if (from) return true;
  return (await db.transactions.where('toAccountId').equals(accountId).count()) > 0;
}

/**
 * Создать или изменить счёт вместе с начальным остатком (decisions.md п. 8, 16).
 * Нулевой остаток — операции `opening` нет. Дата новой операции — `date`, у существующей сохраняется.
 */
export async function saveAccount(account: Account, opening: number, date: string): Promise<number> {
  return db.transaction('rw', db.accounts, db.transactions, async () => {
    let id = account.id;
    if (id == null) {
      const order = Math.max(0, ...(await db.accounts.toArray()).map((a) => a.order)) + 1;
      id = await db.accounts.add({ ...account, order });
    } else {
      await db.accounts.put(account);
    }
    const existing = await getOpening(id);
    if (existing?.id != null) {
      if (opening) await db.transactions.update(existing.id, { amount: opening });
      else await db.transactions.delete(existing.id);
    } else if (opening) {
      await db.transactions.add({ date, type: 'opening', accountId: id, amount: opening });
    }
    return id;
  });
}

/** Отправить счёт в архив или вернуть из него. Данные не удаляются. */
export async function setArchived(accountId: number, archived: boolean): Promise<void> {
  await db.accounts.update(accountId, { archived });
}

export interface DeleteInfo {
  /** Сколько операций счёта удалится вместе с ним (включая начальный остаток). */
  operations: number;
  /** Есть переводы/обмены с другими счетами — удалять нельзя (decisions.md п. 22). */
  linked: boolean;
}

/** Что будет при удалении счёта. */
export async function getDeleteInfo(accountId: number): Promise<DeleteInfo> {
  const own = await db.transactions.where('accountId').equals(accountId).toArray();
  const incoming = await db.transactions.where('toAccountId').equals(accountId).toArray();
  const linked = [...own, ...incoming].some((t) => t.toAccountId != null && (t.accountId !== accountId || t.toAccountId !== accountId));
  return { operations: own.length + incoming.length, linked };
}

/** Удалить счёт вместе с его операциями. Счёт со связанными переводами/обменами не удаляется (ошибка). */
export async function deleteAccount(accountId: number): Promise<void> {
  await db.transaction('rw', db.accounts, db.transactions, async () => {
    if ((await getDeleteInfo(accountId)).linked) {
      throw new Error('у счёта есть переводы или обмены с другими счетами — отправьте его в архив');
    }
    await db.transactions.where('accountId').equals(accountId).delete();
    await db.accounts.delete(accountId);
  });
}

/** Попросить браузер не удалять данные при нехватке места. */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* не поддерживается */
  }
  return false;
}
