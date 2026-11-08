/**
 * «Покупки» (BA-006, decisions.md п. 41–43): итоги, разделы, поиск по справочнику, количество, CSV.
 * Чистый модуль: без UI, браузера и базы.
 */
import { DEFAULT_PRODUCTS, DEFAULT_SECTIONS } from './data/shopCatalog';
import { parseAmount } from './money';
import type { ShopList, ShopListItem, ShopMark, ShopProduct, ShopSection } from './types';

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru');

/** Стартовые разделы и справочник с номерами (для новой базы, миграции и старых бэкапов). */
export function defaultCatalog(): { sections: ShopSection[]; products: ShopProduct[] } {
  const sections = DEFAULT_SECTIONS.map((name, i) => ({ id: i + 1, name, order: i + 1 }));
  const products = DEFAULT_PRODUCTS.map((p, i) => ({ id: i + 1, name: p.name, price: p.price, sectionId: p.section + 1 }));
  return { sections, products };
}

// ---- Строки и итоги ----

/** Сумма строки, центы: цена × количество. */
export function itemSum(item: Pick<ShopListItem, 'price' | 'qty'>): number {
  return Math.round(item.price * item.qty);
}

export interface ListTotals {
  /** Все, кроме «не было». */
  approx: number;
  /** Без отметки. */
  left: number;
  /** Отмеченные «взял». */
  taken: number;
  count: number;
  leftCount: number;
}

export function listTotals(items: ShopListItem[]): ListTotals {
  const t: ListTotals = { approx: 0, left: 0, taken: 0, count: items.length, leftCount: 0 };
  for (const i of items) {
    const s = itemSum(i);
    if (i.mark !== 'missing') t.approx += s;
    if (!i.mark) {
      t.left += s;
      t.leftCount += 1;
    }
    if (i.mark === 'taken') t.taken += s;
  }
  return t;
}

/** Количество из ввода: «2», «1,5», «0.5»; больше нуля, не больше трёх знаков после запятой. */
export function parseQty(input: string): number | null {
  const s = input.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,3})?$/.test(s)) return null;
  const n = Number(s);
  return n > 0 ? n : null;
}

/** «1,5» / «2» — для показа. */
export function formatQty(qty: number): string {
  return String(Number(qty.toFixed(3))).replace('.', ',');
}

// ---- Разделы ----

export interface SectionGroup {
  /** undefined — «Без раздела». */
  section?: ShopSection;
  items: ShopListItem[];
}

const MARK_RANK = { none: 0, taken: 1, missing: 2 } as const;

/**
 * Строки по разделам в порядке разделов; пустые разделы не показываются, «Без раздела» — в конце.
 * Внутри раздела: без отметки (в порядке добавления), затем «взял», затем «не было».
 */
export function groupBySection(items: ShopListItem[], sections: ShopSection[], includeEmpty = false): SectionGroup[] {
  const known = new Map(sections.map((s) => [s.id!, s]));
  const groups = new Map<number | undefined, ShopListItem[]>();
  items.forEach((it) => {
    const key = it.sectionId != null && known.has(it.sectionId) ? it.sectionId : undefined;
    groups.set(key, [...(groups.get(key) ?? []), it]);
  });
  const order = [...sections].sort((a, b) => a.order - b.order).map((s) => s.id!);
  // includeEmpty — все разделы как чек-лист (текущие списки, правка пользователя); «Без раздела» — только если есть товары.
  const keys: (number | undefined)[] = [
    ...order.filter((id) => includeEmpty || groups.has(id)),
    ...(groups.has(undefined) ? [undefined] : [])
  ];
  return keys.map((k) => ({
    section: k == null ? undefined : known.get(k),
    items: (groups.get(k) ?? [])
      .map((it, i) => ({ it, i }))
      .sort((a, b) => MARK_RANK[a.it.mark ?? 'none'] - MARK_RANK[b.it.mark ?? 'none'] || a.i - b.i)
      .map((x) => x.it)
  }));
}

// ---- Справочник ----

/** Поиск товаров: сначала начинающиеся с запроса, затем содержащие; без учёта регистра. */
export function searchProducts(products: ShopProduct[], query: string, limit = 8): ShopProduct[] {
  const q = norm(query);
  if (!q) return [];
  const starts = products.filter((p) => norm(p.name).startsWith(q));
  const contains = products.filter((p) => !norm(p.name).startsWith(q) && norm(p.name).includes(q));
  const byName = (a: ShopProduct, b: ShopProduct) => a.name.localeCompare(b.name, 'ru');
  return [...starts.sort(byName), ...contains.sort(byName)].slice(0, limit);
}

/** Товары раздела по алфавиту; с запросом — только содержащие его. */
export function productsOfSection(products: ShopProduct[], sectionId: number, query = ''): ShopProduct[] {
  const q = norm(query);
  return products
    .filter((p) => p.sectionId === sectionId && (!q || norm(p.name).includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

/** Товар с таким названием (без учёта регистра и лишних пробелов). */
export function findProduct(products: ShopProduct[], name: string): ShopProduct | undefined {
  const n = norm(name);
  return products.find((p) => norm(p.name) === n);
}

/** Новая строка списка из товара справочника. */
export function itemFromProduct(p: ShopProduct, id: string): ShopListItem {
  return { id, productId: p.id, name: p.name, sectionId: p.sectionId, qty: 1, price: p.price };
}

// ---- Изменение списка (возвращают новый список) ----

/**
 * Добавить товар в список. Если он уже есть и ещё не отмечен — количество +1 (`merged: true`),
 * иначе новая строка.
 */
export function addProduct(list: ShopList, p: ShopProduct, newId: string): { list: ShopList; merged: boolean; itemId: string } {
  const same = list.items.find((i) => i.productId != null && i.productId === p.id && !i.mark);
  if (same) {
    return { list: { ...list, items: list.items.map((i) => (i === same ? { ...i, qty: i.qty + 1 } : i)) }, merged: true, itemId: same.id };
  }
  return { list: { ...list, items: [...list.items, itemFromProduct(p, newId)] }, merged: false, itemId: newId };
}

/** Поставить отметку; та же отметка повторно — снять (decisions п. 14). */
export function toggleMark(list: ShopList, itemId: string, mark: ShopMark): ShopList {
  return {
    ...list,
    items: list.items.map((i) => {
      if (i.id !== itemId) return i;
      if (i.mark === mark) {
        const { mark: _m, ...rest } = i;
        return rest;
      }
      return { ...i, mark };
    })
  };
}

export function updateItem(list: ShopList, itemId: string, patch: Partial<Omit<ShopListItem, 'id'>>): ShopList {
  return { ...list, items: list.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)) };
}

export function removeItem(list: ShopList, itemId: string): ShopList {
  return { ...list, items: list.items.filter((i) => i.id !== itemId) };
}

// ---- Списки ----

/** Текущие — по дате (ближайшая сверху), архив — новые сверху. */
export function splitLists(lists: ShopList[]): { active: ShopList[]; archived: ShopList[] } {
  const byDate = (a: ShopList, b: ShopList) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.id ?? 0) - (b.id ?? 0));
  return {
    active: lists.filter((l) => !l.archived).sort(byDate),
    archived: lists.filter((l) => l.archived).sort((a, b) => byDate(b, a))
  };
}

/** «Повторить»: те же товары, количества и примечания, без отметок, на новую дату. */
export function repeatList(list: ShopList, date: string, newId: () => string): ShopList {
  return {
    date,
    title: list.title,
    archived: false,
    items: list.items.map(({ mark: _mark, ...rest }) => ({ ...rest, id: newId() }))
  };
}

// ---- CSV ----

export interface CsvRow {
  name: string;
  price: number;
  section?: string;
}

export interface CsvResult {
  rows: CsvRow[];
  /** Строки с ошибками: «Строка 5: …». */
  errors: string[];
}

/** Разбить строку CSV с учётом кавычек. */
function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/**
 * Справочник из CSV: «название; цена[; раздел]». Разделитель — «;», если он есть в файле, иначе «,»
 * (тогда дробная цена — с точкой или в кавычках). Первая строка-заголовок пропускается.
 */
export function parseCatalogCsv(text: string): CsvResult {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const sep = text.includes(';') ? ';' : text.includes('\t') ? '\t' : ',';
  const rows: CsvRow[] = [];
  const errors: string[] = [];
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    const [name = '', priceRaw = '', section = ''] = splitCsvLine(line, sep);
    const price = parseAmount(priceRaw.replace(/[€\s]/g, '') || '0', 'EUR');
    if (i === 0 && (price == null || /цен|price|назв|name/i.test(line))) return; // заголовок
    if (!name) return void errors.push(`Строка ${i + 1}: нет названия.`);
    if (price == null || price < 0) return void errors.push(`Строка ${i + 1}: не получается прочитать цену «${priceRaw}».`);
    rows.push({ name: name.replace(/\s+/g, ' '), price, section: section || undefined });
  });
  return { rows, errors };
}

/** Поле CSV: в кавычках, если есть разделитель, кавычки или перенос строки. */
const csvField = (s: string) => (/[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/**
 * Справочник в CSV — тот же формат, что читает `parseCatalogCsv`: «название;цена;раздел», цена с запятой,
 * BOM для Excel. Порядок — по разделам (как в списке), внутри — по алфавиту; без раздела — в конце.
 */
export function catalogToCsv(products: ShopProduct[], sections: ShopSection[]): string {
  const sorted = [...sections].sort((a, b) => a.order - b.order);
  const name = new Map(sorted.map((s) => [s.id!, s.name]));
  const rank = new Map(sorted.map((s, i) => [s.id!, i]));
  const key = (p: ShopProduct) => (p.sectionId != null && rank.has(p.sectionId) ? rank.get(p.sectionId)! : sorted.length);
  const rows = [...products]
    .sort((a, b) => key(a) - key(b) || a.name.localeCompare(b.name, 'ru'))
    .map((p) => {
      const euro = (p.price / 100).toFixed(2).replace('.', ',');
      const section = p.sectionId != null ? name.get(p.sectionId) ?? '' : '';
      return [csvField(p.name), euro, csvField(section)].join(';');
    });
  return '﻿' + ['название;цена;раздел', ...rows].join('\r\n') + '\r\n';
}

export interface MergeResult {
  products: ShopProduct[];
  sections: ShopSection[];
  added: number;
  updated: number;
}

/**
 * Слить строки CSV со справочником (decisions.md п. 42): совпадение по названию — обновить цену
 * (и раздел, если указан), новые — добавить; ничего не удаляется. Неизвестный раздел — создаётся в конце.
 */
export function mergeCatalog(products: ShopProduct[], sections: ShopSection[], rows: CsvRow[]): MergeResult {
  const nextProducts = products.map((p) => ({ ...p }));
  const nextSections = sections.map((s) => ({ ...s }));
  let nextPid = Math.max(0, ...products.map((p) => p.id ?? 0)) + 1;
  let nextSid = Math.max(0, ...sections.map((s) => s.id ?? 0)) + 1;
  let nextOrder = Math.max(0, ...sections.map((s) => s.order)) + 1;
  let added = 0;
  let updated = 0;
  const sectionId = (name?: string): number | undefined => {
    if (!name) return undefined;
    const found = nextSections.find((s) => norm(s.name) === norm(name));
    if (found) return found.id;
    const s = { id: nextSid++, name: name.trim(), order: nextOrder++ };
    nextSections.push(s);
    return s.id;
  };
  for (const r of rows) {
    const sid = sectionId(r.section);
    const existing = findProduct(nextProducts, r.name);
    if (existing) {
      if (existing.price !== r.price || (sid != null && existing.sectionId !== sid)) updated += 1;
      existing.price = r.price;
      if (sid != null) existing.sectionId = sid;
    } else {
      nextProducts.push({ id: nextPid++, name: r.name, price: r.price, sectionId: sid });
      added += 1;
    }
  }
  return { products: nextProducts, sections: nextSections, added, updated };
}
