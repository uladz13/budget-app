/**
 * Остатки счетов и итоги. Остаток не хранится — считается из операций.
 * Чистый модуль: без UI, браузера и базы.
 */
import type { Account, AccountGroup, Currency, Transaction } from './types';

/** Изменения остатков от одной операции: [счёт, сумма со знаком]. */
export function transactionEffects(t: Transaction): [number, number][] {
  switch (t.type) {
    case 'opening':
    case 'income':
      return [[t.accountId, t.amount]];
    case 'expense':
      return [[t.accountId, -t.amount]];
    case 'transfer':
    case 'exchange':
      return t.toAccountId == null
        ? [[t.accountId, -t.amount]]
        : [
            [t.accountId, -t.amount],
            [t.toAccountId, t.toAmount ?? t.amount]
          ];
  }
}

/** Остаток каждого счёта (id → сумма в минимальных единицах). Счета без операций в карте отсутствуют. */
export function accountBalances(transactions: Transaction[]): Map<number, number> {
  const res = new Map<number, number>();
  for (const t of transactions) {
    for (const [id, delta] of transactionEffects(t)) res.set(id, (res.get(id) ?? 0) + delta);
  }
  return res;
}

export interface CurrencyTotal {
  currency: Currency;
  amount: number;
}

/**
 * Итоги группы по каждой валюте отдельно (курсов нет — decisions.md п. 4). Архивные счета не входят.
 * Валюты — в порядке первого появления среди счетов группы.
 */
export function groupTotals(accounts: Account[], balances: Map<number, number>, group: AccountGroup): CurrencyTotal[] {
  const res = new Map<Currency, number>();
  for (const a of accounts) {
    if (a.archived || a.group !== group || a.id == null) continue;
    res.set(a.currency, (res.get(a.currency) ?? 0) + (balances.get(a.id) ?? 0));
  }
  return [...res].map(([currency, amount]) => ({ currency, amount }));
}

/** Порядок счетов в списках: по полю `order`, затем по id. */
export function sortAccounts(accounts: Account[]): Account[] {
  return [...accounts].sort((a, b) => a.order - b.order || (a.id ?? 0) - (b.id ?? 0));
}
