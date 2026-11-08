/**
 * Управление категориями (BA-003, decisions.md п. 36): проверка названия и порядок.
 * Чистый модуль: без UI, браузера и базы.
 */
import type { Category, CategoryKind } from './types';

const norm = (s: string) => s.trim().toLocaleLowerCase('ru');

/** Ошибка в названии или null. `selfId` — категория, которую правим (с собой не сравниваем). */
export function validateCategoryName(name: string, kind: CategoryKind, categories: Category[], selfId?: number): string | null {
  const n = norm(name);
  if (!n) return 'Введите название категории.';
  if (name.trim().length > 40) return 'Название слишком длинное — не больше 40 символов.';
  const dup = categories.find((c) => c.kind === kind && c.id !== selfId && norm(c.name) === n);
  if (dup) return `Категория «${dup.name}» уже есть${dup.hidden ? ' (среди скрытых)' : ''}.`;
  return null;
}

/** Категории вида по порядку (видимые и скрытые вместе). */
export function sortedOfKind(categories: Category[], kind: CategoryKind): Category[] {
  return categories.filter((c) => c.kind === kind).sort((a, b) => a.order - b.order || (a.id ?? 0) - (b.id ?? 0));
}

/** Порядок для новой категории — в конец списка своего вида. */
export function nextOrder(categories: Category[], kind: CategoryKind): number {
  return Math.max(0, ...categories.filter((c) => c.kind === kind).map((c) => c.order)) + 1;
}

export interface OrderUpdate {
  id: number;
  order: number;
}

/**
 * Сдвинуть категорию на одно место среди видимых категорий своего вида (скрытые пропускаются).
 * Возвращает новые `order` для всех категорий вида (1, 2, 3…), чьи значения изменились; [] — сдвиг невозможен.
 */
export function moveCategory(categories: Category[], id: number, dir: -1 | 1): OrderUpdate[] {
  const self = categories.find((c) => c.id === id);
  if (!self) return [];
  const all = sortedOfKind(categories, self.kind);
  const visible = all.filter((c) => !c.hidden);
  const vi = visible.findIndex((c) => c.id === id);
  const other = visible[vi + dir];
  if (vi < 0 || !other) return [];
  // Меняем местами в полном списке — скрытые остаются на своих позициях.
  const ai = all.indexOf(self);
  const bi = all.indexOf(other);
  const next = [...all];
  next[ai] = other;
  next[bi] = self;
  return next.map((c, i) => ({ id: c.id!, order: i + 1 })).filter((u) => all.find((c) => c.id === u.id)!.order !== u.order);
}
