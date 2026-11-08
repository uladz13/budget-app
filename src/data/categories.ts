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
