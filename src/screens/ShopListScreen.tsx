import { useState } from 'preact/hooks';
import { addProductToList, db, deleteShopList, saveListItem, saveShopList, setShopListArchived, updateShopList } from '../db';
import { useLive } from '../hooks';
import { go } from '../router';
import { amountToInput, formatMoney, parseAmount } from '../money';
import { dayLabel } from '../operations';
import {
  findProduct,
  formatQty,
  groupBySection,
  itemSum,
  listTotals,
  parseQty,
  productsOfSection,
  removeItem,
  repeatList,
  searchProducts,
  toggleMark
} from '../shopping';
import { AsyncButton, Sheet } from '../components/ui';
import { todayIso, uid } from '../util';
import { listSubtitle } from './ShoppingScreen';
import type { ShopList, ShopListItem, ShopProduct, ShopSection } from '../types';

/** Один список покупок (BA-006): разделы, добавление поиском, отметки ✓ ✗, итоги. Архивный — только просмотр. */
export function ShopListScreen({ id }: { id: number }) {
  /** null — списка нет (удалён), undefined — загружается. */
  const list = useLive(async () => (await db.shopLists.get(id)) ?? null, [id]);
  const sections = useLive(() => db.shopSections.toArray(), []);
  const products = useLive(() => db.shopProducts.toArray(), []);
  const [editing, setEditing] = useState<string | null>(null);
  const [hint, setHint] = useState('');
  /** Раздел, в который добавляем товары через «+». */
  const [addSection, setAddSection] = useState<ShopSection | null>(null);

  if (list === undefined || !sections || !products) return <div class="loading">Загрузка…</div>;
  if (list === null) {
    return (
      <div class="screen">
        <button class="chip back" onClick={() => go('shop')}>
          ← Покупки
        </button>
        <div class="card empty">Список не найден — возможно, он удалён.</div>
      </div>
    );
  }

  const readOnly = list.archived;
  const totals = listTotals(list.items);
  // Текущий список — все разделы как чек-лист (пустые тоже), архив — только разделы с товарами.
  const groups = groupBySection(list.items, sections, !readOnly);

  const repeat = async () => {
    const newId = await saveShopList(repeatList(list, todayIso(), uid));
    go(`shop/${newId}`);
  };
  const remove = async () => {
    if (!confirm(`Удалить список «${dayLabel(list.date)}${list.title ? ` · ${list.title}` : ''}»? Отменить это нельзя.`)) return;
    await deleteShopList(id);
    go('shop');
  };
  const add = async (p: ShopProduct) => {
    const isNew = p.id == null;
    const res = await addProductToList(id, p, uid());
    setHint(res.merged ? `«${p.name}» уже в списке — количество +1.` : '');
    // Новый товар — сразу открыть строку, чтобы указать цену и раздел.
    if (isNew) setEditing(res.itemId);
  };

  return (
    <div class="screen">
      <button class="chip back" onClick={() => go('shop')}>
        ← Покупки
      </button>
      <div class="screen-head">
        <div>
          <div class="eyebrow">{list.archived ? 'Архив' : 'Список покупок'}</div>
          <h1>
            {dayLabel(list.date)}
            {list.title ? ` · ${list.title}` : ''}
          </h1>
          <div class="muted small">{listSubtitle(list)}</div>
        </div>
      </div>

      {totals.count > 0 && (
        <div class="card shop-totals">
          <div>
            <div class="stat-label">Примерно</div>
            <div class="stat-value">{formatMoney(totals.approx, 'EUR')}</div>
          </div>
          <div>
            <div class="stat-label">Осталось · {totals.leftCount}</div>
            <div class="stat-value">{formatMoney(totals.left, 'EUR')}</div>
          </div>
          <div>
            <div class="stat-label">Взял</div>
            <div class="stat-value income">{formatMoney(totals.taken, 'EUR')}</div>
          </div>
        </div>
      )}

      {!readOnly && <AddBox products={products} sections={sections} onAdd={add} />}
      {hint && <p class="small muted">{hint}</p>}

      {groups.length === 0 ? (
        <div class="card empty">{readOnly ? 'Список пуст.' : 'Добавьте товары — начните вводить название.'}</div>
      ) : (
        <section class="card shop-list">
          {groups.map((g) => (
            <div class={'shop-section' + (g.items.length ? '' : ' empty-section')}>
              <div class="shop-section-head">
                <span class="eyebrow">{g.section?.name ?? 'Без раздела'}</span>
                {!readOnly && g.section && (
                  <button class="icon-btn section-add" onClick={() => setAddSection(g.section!)} aria-label={`Добавить в раздел ${g.section.name}`}>
                    +
                  </button>
                )}
              </div>
              {g.items.map((it) => (
                <ItemRow item={it} readOnly={readOnly} onOpen={() => setEditing(it.id)} onMark={(m) => updateShopList(id, (l) => toggleMark(l, it.id, m))} />
              ))}
            </div>
          ))}
        </section>
      )}

      <div class="sheet-actions">
        <AsyncButton class="btn" name="Покупки · архив" onClick={() => setShopListArchived(id, !list.archived)}>
          {list.archived ? 'Вернуть из архива' : 'В архив'}
        </AsyncButton>
        <AsyncButton class="btn" name="Покупки · повторить" onClick={repeat}>
          Повторить
        </AsyncButton>
      </div>
      <AsyncButton class="btn danger" name="Покупки · удалить список" onClick={remove} busyLabel="Удаление…">
        Удалить список
      </AsyncButton>

      {addSection && (
        <SectionAddSheet
          section={addSection}
          list={list}
          products={products}
          onAdd={add}
          onClose={() => {
            setAddSection(null);
            setHint('');
          }}
        />
      )}

      {editing && list.items.some((i) => i.id === editing) && (
        <ItemForm key={editing} list={list} item={list.items.find((i) => i.id === editing)!} sections={sections} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

/** Поиск по справочнику; нет точного совпадения — «Добавить «…» как новый товар». */
function AddBox({ products, sections, onAdd }: { products: ShopProduct[]; sections: ShopSection[]; onAdd: (p: ShopProduct) => Promise<void> }) {
  const [query, setQuery] = useState('');
  const found = searchProducts(products, query);
  const exact = query.trim() ? findProduct(products, query) : undefined;
  const secName = new Map(sections.map((s) => [s.id!, s.name]));

  const pick = (p: ShopProduct) => async () => {
    await onAdd(p);
    setQuery('');
  };

  return (
    <div class="add-box">
      <input
        class="text-input"
        type="search"
        placeholder="Добавить товар — начните вводить"
        value={query}
        onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
      />
      {query.trim() && (
        <div class="card suggest">
          {found.map((p) => (
            <AsyncButton class="list-row suggest-row" name="Покупки · добавить товар" busyLabel="Добавляю…" onClick={pick(p)}>
              <span class="row-main">
                <span class="row-title">{p.name}</span>
                <span class="muted small">{p.sectionId != null ? secName.get(p.sectionId) ?? 'Без раздела' : 'Без раздела'}</span>
              </span>
              <span class="num muted">{p.price ? formatMoney(p.price, 'EUR') : '—'}</span>
            </AsyncButton>
          ))}
          {!exact && (
            <AsyncButton
              class="list-row suggest-row accent"
              name="Покупки · новый товар"
              busyLabel="Добавляю…"
              onClick={pick({ name: query.trim().replace(/\s+/g, ' '), price: 0 })}
            >
              <span class="row-title">+ Добавить «{query.trim()}» как новый товар</span>
            </AsyncButton>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * «+» у раздела: товары раздела из справочника с поиском; нажатие — добавить (панель остаётся открытой);
 * уже в списке — пометка «в списке · N»; нового нет — создать сразу в этом разделе.
 */
function SectionAddSheet({
  section,
  list,
  products,
  onAdd,
  onClose
}: {
  section: ShopSection;
  list: ShopList;
  products: ShopProduct[];
  onAdd: (p: ShopProduct) => Promise<void>;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const found = productsOfSection(products, section.id!, query);
  const inList = new Map<number, number>();
  list.items.forEach((i) => i.productId != null && !i.mark && inList.set(i.productId, (inList.get(i.productId) ?? 0) + i.qty));
  const exact = query.trim() ? findProduct(products, query) : undefined;

  return (
    <Sheet title={section.name} onClose={onClose}>
      <input
        class="text-input"
        type="search"
        placeholder="Поиск в разделе или новый товар"
        value={query}
        onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
      />
      <div class="section-products">
        {found.map((p) => (
          <AsyncButton class="list-row suggest-row" name="Покупки · добавить товар" busyLabel="Добавляю…" onClick={() => onAdd(p)}>
            <span class="row-main">
              <span class="row-title">{p.name}</span>
              {inList.has(p.id!) && <span class="small in-list">в списке · {formatQty(inList.get(p.id!)!)}</span>}
            </span>
            <span class="num muted">{p.price ? formatMoney(p.price, 'EUR') : '—'}</span>
          </AsyncButton>
        ))}
        {!found.length && !query.trim() && <p class="muted small">В справочнике нет товаров этого раздела — добавьте новый поиском.</p>}
        {query.trim() && !exact && (
          <AsyncButton
            class="list-row suggest-row accent"
            name="Покупки · новый товар"
            busyLabel="Добавляю…"
            onClick={async () => {
              await onAdd({ name: query.trim().replace(/\s+/g, ' '), price: 0, sectionId: section.id });
              setQuery('');
            }}
          >
            <span class="row-title">+ Добавить «{query.trim()}» в «{section.name}»</span>
          </AsyncButton>
        )}
      </div>
    </Sheet>
  );
}

function ItemRow({
  item,
  readOnly,
  onOpen,
  onMark
}: {
  item: ShopListItem;
  readOnly: boolean;
  onOpen: () => void;
  onMark: (m: 'taken' | 'missing') => Promise<void>;
}) {
  const details = [
    item.qty !== 1 ? `${formatQty(item.qty)} × ${formatMoney(item.price, 'EUR')}` : '',
    item.note ?? ''
  ].filter(Boolean);
  return (
    <div class={'shop-item' + (item.mark ? ` ${item.mark}` : '')}>
      <button class="row-main shop-item-main" onClick={readOnly ? undefined : onOpen}>
        <span class="row-title shop-item-name">{item.name}</span>
        {details.length > 0 && <span class="muted small">{details.join(' · ')}</span>}
      </button>
      <span class="num shop-item-sum">{item.price ? formatMoney(itemSum(item), 'EUR') : '—'}</span>
      {!readOnly && (
        <span class="mini-actions">
          <AsyncButton
            class={'icon-btn mark-btn' + (item.mark === 'taken' ? ' on taken' : '')}
            compact
            name="Покупки · отметка"
            ariaLabel={`${item.name}: взял`}
            onClick={() => onMark('taken')}
          >
            ✓
          </AsyncButton>
          <AsyncButton
            class={'icon-btn mark-btn' + (item.mark === 'missing' ? ' on missing' : '')}
            compact
            name="Покупки · отметка"
            ariaLabel={`${item.name}: не было`}
            onClick={() => onMark('missing')}
          >
            ✗
          </AsyncButton>
        </span>
      )}
      {readOnly && item.mark && <span class="mark-static">{item.mark === 'taken' ? '✓' : '✗'}</span>}
    </div>
  );
}

/** Строка списка: количество, цена (запоминается в справочнике), раздел, примечание; убрать из списка. */
function ItemForm({ list, item, sections, onClose }: { list: ShopList; item: ShopListItem; sections: ShopSection[]; onClose: () => void }) {
  const [qty, setQty] = useState(formatQty(item.qty));
  const [price, setPrice] = useState(item.price ? amountToInput(item.price, 'EUR') : '');
  const [sectionId, setSectionId] = useState<number | undefined>(item.sectionId);
  const [note, setNote] = useState(item.note ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const sorted = [...sections].sort((a, b) => a.order - b.order);

  const q = parseQty(qty);
  const p = price.trim() ? parseAmount(price, 'EUR') : 0;

  const save = async () => {
    setError('');
    if (q == null) return setError('Количество — число больше нуля, например 2 или 1,5.');
    if (p == null || p < 0) return setError('Не получается прочитать цену. Пример: 1,70');
    const next: ShopListItem = { ...item, qty: q, price: p, sectionId, note: note.trim() || undefined };
    if (!next.note) delete next.note;
    if (next.sectionId == null) delete next.sectionId;
    await saveListItem(list.id!, next);
    onClose();
  };

  const drop = async () => {
    await updateShopList(list.id!, (l) => removeItem(l, item.id));
    onClose();
  };

  return (
    <Sheet title={item.name} onClose={onClose} locked={busy}>
      <div class="form-grid">
        <label class="field">
          Количество
          <input class="text-input amount" inputMode="decimal" value={qty} onInput={(e) => setQty((e.target as HTMLInputElement).value)} />
        </label>
        <label class="field">
          Цена, €
          <input
            class="text-input amount"
            inputMode="decimal"
            placeholder="0,00"
            value={price}
            onInput={(e) => setPrice((e.target as HTMLInputElement).value)}
          />
        </label>
      </div>
      {q != null && p != null && p > 0 && <p class="small muted">Сумма: {formatMoney(Math.round(p * q), 'EUR')}</p>}
      <label class="field">
        Раздел
        <select
          class="text-input"
          value={sectionId == null ? '' : String(sectionId)}
          onChange={(e) => {
            const v = (e.target as HTMLSelectElement).value;
            setSectionId(v ? Number(v) : undefined);
          }}
        >
          <option value="">Без раздела</option>
          {sorted.map((s) => (
            <option value={String(s.id)}>{s.name}</option>
          ))}
        </select>
      </label>
      <label class="field">
        Примечание
        <input
          class="text-input"
          value={note}
          placeholder="Необязательно: «2 банки», «на ужин»"
          onInput={(e) => setNote((e.target as HTMLInputElement).value)}
        />
      </label>
      {item.productId != null && <p class="small muted">Цена и раздел сохранятся и в справочнике.</p>}
      {error && <p class="error-text">{error}</p>}
      <div class="sheet-actions">
        <AsyncButton class="btn primary" name="Покупки · сохранить товар" onClick={save} disabled={busy} onBusy={setBusy}>
          Сохранить
        </AsyncButton>
      </div>
      <AsyncButton class="btn danger-text" name="Покупки · убрать товар" onClick={drop} disabled={busy} onBusy={setBusy} busyLabel="Удаление…">
        Убрать из списка
      </AsyncButton>
    </Sheet>
  );
}
