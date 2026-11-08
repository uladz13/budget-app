/** Валюты приложения (decisions.md п. 3). Список можно расширять — см. `money.ts`. */
export type Currency = 'EUR' | 'USD' | 'BYN';

/** Безналичный счёт (карта, банк) или наличные. */
export type AccountKind = 'card' | 'cash';

/** Группа счёта: основной (повседневные деньги) или накопления. */
export type AccountGroup = 'main' | 'savings';

export interface Account {
  id?: number;
  name: string;
  kind: AccountKind;
  currency: Currency;
  group: AccountGroup;
  /** Архивный счёт не показывается в итогах; данные сохраняются. */
  archived: boolean;
  /** Порядок в списке (сейчас — по созданию). */
  order: number;
}

/**
 * Тип операции:
 * - `opening` — начальный остаток (служебная, не доход и не расход; сумма со знаком);
 * - `income` / `expense` — доход / расход, сумма положительная;
 * - `transfer` / `exchange` — со счёта `accountId` (`amount`) на `toAccountId` (`toAmount`).
 */
export type TransactionType = 'opening' | 'income' | 'expense' | 'transfer' | 'exchange';

export interface Transaction {
  id?: number;
  /** Дата операции, `YYYY-MM-DD`. */
  date: string;
  type: TransactionType;
  accountId: number;
  /** Сумма в минимальных единицах валюты счёта (центы), целое число. */
  amount: number;
  toAccountId?: number;
  /** Сумма зачисления в валюте `toAccountId`; если не задана — равна `amount`. */
  toAmount?: number;
  categoryId?: number;
  note?: string;
}

export interface Meta {
  key: string;
  value: unknown;
}
