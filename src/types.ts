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

/** Вид категории: для расходов или для доходов. */
export type CategoryKind = 'expense' | 'income';

export interface Category {
  id?: number;
  name: string;
  kind: CategoryKind;
  /** Скрытая категория не предлагается для новых операций, но остаётся в старых (BA-003). */
  hidden: boolean;
  /** Порядок в списке своего вида. */
  order: number;
}

// ---- Покупки (BA-006) — отдельно от бюджета ----

/** Раздел списка покупок («Мясо», «Хозы»…). */
export interface ShopSection {
  id?: number;
  name: string;
  order: number;
}

/** Товар справочника: обычная цена в центах (EUR), раздел. */
export interface ShopProduct {
  id?: number;
  name: string;
  price: number;
  sectionId?: number;
}

/** Отметка в магазине: «взял» / «не было»; нет поля — ещё не отмечено. */
export type ShopMark = 'taken' | 'missing';

/** Строка списка: копия названия и цены на момент добавления (справочник может измениться). */
export interface ShopListItem {
  /** Уникальный ключ строки внутри списка. */
  id: string;
  productId?: number;
  name: string;
  sectionId?: number;
  /** Количество (может быть дробным: 1,5 кг). */
  qty: number;
  /** Цена за единицу, центы. */
  price: number;
  note?: string;
  mark?: ShopMark;
}

export interface ShopList {
  id?: number;
  /** Дата похода, `YYYY-MM-DD`. */
  date: string;
  title?: string;
  archived: boolean;
  items: ShopListItem[];
}

export interface Meta {
  key: string;
  value: unknown;
}
