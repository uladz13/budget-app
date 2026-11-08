import type { Category } from '../types';

/** Стартовые категории (decisions.md п. 10–11, 28). Создаются один раз; дальше пользователь меняет их сам (BA-003). */
const EXPENSE = [
  'Аренда',
  'Коммуналка',
  'Сын',
  'Еда',
  'Вкусняшки',
  'Вредные привычки',
  'Транспорт',
  'Здоровье',
  'Одежда',
  'Развлечения',
  'Подписки и связь',
  'Прочее'
];
const INCOME = ['Зарплата', 'Подарки', 'Прочее'];

export const DEFAULT_CATEGORIES: Category[] = [
  ...EXPENSE.map((name, i): Category => ({ name, kind: 'expense', hidden: false, order: i + 1 })),
  ...INCOME.map((name, i): Category => ({ name, kind: 'income', hidden: false, order: i + 1 }))
];

/** Категории, добавленные в стартовый набор схемой v3 (для баз, где набор уже был создан в v2). */
export const ADDED_IN_V3: string[] = ['Вкусняшки', 'Вредные привычки'];

/**
 * Добавить стартовые категории расходов из `names`, которых нет по имени (миграция v3 — и для базы, и для
 * старых бэкапов). Новым даются id после максимального; порядок стартовых выравнивается по стартовому набору,
 * категории пользователя идут после них в своём порядке. Возвращает новый массив; без изменений — тот же.
 */
export function withMissingDefaults(categories: Category[], names: string[]): Category[] {
  const expense = categories.filter((c) => c.kind === 'expense');
  const have = new Set(expense.map((c) => c.name));
  const defaults = DEFAULT_CATEGORIES.filter((c) => c.kind === 'expense');
  const missing = defaults.filter((c) => names.includes(c.name) && !have.has(c.name));
  if (!missing.length) return categories;
  let nextId = Math.max(0, ...categories.map((c) => c.id ?? 0)) + 1;
  const added = missing.map((c) => ({ ...c, id: nextId++ }));
  const rank = new Map(defaults.map((c) => [c.name, c.order]));
  const key = (c: Category) => rank.get(c.name) ?? 1000 + c.order;
  const sorted = [...expense, ...added].sort((a, b) => key(a) - key(b)).map((c, i) => ({ ...c, order: i + 1 }));
  return [...sorted, ...categories.filter((c) => c.kind !== 'expense')];
}
