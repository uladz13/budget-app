import Dexie, { type Table } from 'dexie';
import type { Account, Meta, Transaction } from './types';
/**
 * Хранилище — только через этот модуль. Схема меняется только новой `version(n)` с миграцией;
 * базу никогда не очищаем и не пересоздаём (CLAUDE.md, принцип 3).
 */
class BudgetDB extends Dexie {
  accounts!: Table<Account, number>;
  transactions!: Table<Transaction, number>;
  meta!: Table<Meta, string>;

  constructor() {
    super('budget-app');
    // v1 (BA-001): счета, операции, настройки. Категории появятся в следующей версии схемы (BA-003).
    this.version(1).stores({
      accounts: '++id',
      transactions: '++id, date, accountId, toAccountId, type',
      meta: 'key'
    });
  }
}

export const db = new BudgetDB();

/** Версия схемы данных — совпадает с номером версии базы и полем `schema` бэкапа. */
export const SCHEMA_VERSION = 1;

/** Открыть базу (ошибку показывает оболочка приложения). */
export async function initDb(): Promise<void> {
  await db.open();
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
