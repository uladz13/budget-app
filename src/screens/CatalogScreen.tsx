import { useState } from 'preact/hooks';
import { applyCatalog, db, deleteProduct, saveProduct } from '../db';
import { useLive } from '../hooks';
import { go } from '../router';
import { amountToInput, formatMoney, parseAmount } from '../money';
import { saveTextFile } from '../share';
import { todayIso } from '../util';
import { catalogToCsv, findProduct, mergeCatalog, parseCatalogCsv, productsOfSection, searchProducts, type MergeResult } from '../shopping';
import { plural } from '../backup';
import { AsyncButton, Sheet } from '../components/ui';
import type { ShopProduct, ShopSection } from '../types';

/** «Покупки → Справочник» (BA-006): товары по разделам, поиск, правка, удаление, загрузка из CSV. */
export function CatalogScreen() {
  const products = useLive(() => db.shopProducts.toArray(), []);
  const sections = useLive(() => db.shopSections.toArray(), []);
  const [query, setQuery] = useState('');
  /** null — панель закрыта, 'new' — новый товар, иначе — id. */
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [csv, setCsv] = useState<{ merge: MergeResult; errors: string[]; fileName: string } | null>(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  if (!products || !sections) return <div class="loading">Загрузка…</div>;
  const sorted = [...sections].sort((a, b) => a.order - b.order);
  const secName = new Map(sections.map((s) => [s.id!, s.name]));
  const noSection = products.filter((p) => p.sectionId == null || !secName.has(p.sectionId)).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const found = query.trim() ? searchProducts(products, query, 50) : [];

  const pickCsv = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    setMsg('');
    setError('');
    const parsed = parseCatalogCsv(await file.text());
    if (!parsed.rows.length) return setError(parsed.errors[0] ?? 'В файле не нашлось товаров. Нужны колонки «название; цена».');
    setCsv({ merge: mergeCatalog(products, sections, parsed.rows), errors: parsed.errors, fileName: file.name });
  };

  const row = (p: ShopProduct, showSection = false) => (
    <button class="list-row" onClick={() => setEditing(p.id!)}>
      <span class="row-main">
        <span class="row-title">{p.name}</span>
        {showSection && <span class="muted small">{(p.sectionId != null && secName.get(p.sectionId)) || 'Без раздела'}</span>}
      </span>
      <span class="num muted">{p.price ? formatMoney(p.price, 'EUR') : '—'}</span>
    </button>
  );

  return (
    <div class="screen">
      <button class="chip back" onClick={() => go('shop')}>
        ← Покупки
      </button>
      <div class="screen-head">
        <div>
          <h1>Справочник</h1>
          <div class="muted small">
            {products.length} {plural(products.length, ['товар', 'товара', 'товаров'])}
          </div>
        </div>
      </div>

      <input class="text-input" type="search" placeholder="Поиск товара" value={query} onInput={(e) => setQuery((e.target as HTMLInputElement).value)} />

      {query.trim() ? (
        <section class="card">{found.length ? found.map((p) => row(p, true)) : <p class="muted center">Ничего не найдено.</p>}</section>
      ) : (
        <section class="card catalog">
          {sorted.map((s) => {
            const items = productsOfSection(products, s.id!);
            return (
              <details>
                <summary>
                  {s.name} <span class="muted small">· {items.length}</span>
                </summary>
                {items.map((p) => row(p))}
              </details>
            );
          })}
          {noSection.length > 0 && (
            <details>
              <summary>
                Без раздела <span class="muted small">· {noSection.length}</span>
              </summary>
              {noSection.map((p) => row(p))}
            </details>
          )}
        </section>
      )}

      <button class="btn primary wide" onClick={() => setEditing('new')}>
        + Добавить товар
      </button>

      <section class="card">
        <h2>CSV</h2>
        <p class="muted small">
          Выгрузите справочник, допишите товары (в Excel или Google Таблицах) и загрузите обратно. Колонки: название; цена;
          раздел (необязательно). Совпадающие по названию товары обновятся, новые добавятся, ничего не удалится.
        </p>
        <div class="sheet-actions">
          <AsyncButton
            class="btn"
            name="Покупки · выгрузить CSV"
            busyLabel="Подготовка…"
            onClick={async () => {
              setMsg('');
              setError('');
              const res = await saveTextFile(`spravochnik-${todayIso()}.csv`, catalogToCsv(products, sections), 'text/csv');
              if (res === 'downloaded') setMsg('Файл справочника скачан — он в папке «Загрузки».');
              if (res === 'shared') setMsg('Справочник сохранён.');
            }}
          >
            Выгрузить
          </AsyncButton>
          <label class="btn">
            Загрузить
            <input type="file" accept=".csv,text/csv,text/plain" hidden onChange={pickCsv} />
          </label>
        </div>
        {msg && <p class="small ok-text">{msg}</p>}
        {error && <p class="error-text">Не удалось загрузить: {error}</p>}
      </section>

      {editing != null && (
        <ProductForm
          key={String(editing)}
          product={editing === 'new' ? undefined : products.find((p) => p.id === editing)}
          products={products}
          sections={sorted}
          onClose={() => setEditing(null)}
        />
      )}

      {csv && (
        <Sheet title="Загрузить справочник?" onClose={() => setCsv(null)}>
          <p class="small muted">{csv.fileName}</p>
          <div class="compare">
            <div>
              <div class="eyebrow">Новых</div>
              <div class="tile-num">{csv.merge.added}</div>
            </div>
            <div>
              <div class="eyebrow">Обновится</div>
              <div class="tile-num">{csv.merge.updated}</div>
            </div>
          </div>
          {csv.merge.sections.length > sections.length && (
            <p class="small">Новые разделы: {csv.merge.sections.slice(sections.length).map((s) => s.name).join(', ')}</p>
          )}
          {csv.errors.length > 0 && (
            <div class="warn-box small">
              Пропущено строк с ошибками: {csv.errors.length}
              {csv.errors.slice(0, 5).map((e) => (
                <div>{e}</div>
              ))}
              {csv.errors.length > 5 && <div>…</div>}
            </div>
          )}
          <div class="sheet-actions">
            <AsyncButton
              class="btn primary"
              name="Покупки · загрузить CSV"
              busyLabel="Загрузка…"
              onClick={async () => {
                await applyCatalog(csv.merge.products, csv.merge.sections);
                setMsg(`Справочник обновлён: новых ${csv.merge.added}, обновлено ${csv.merge.updated}.`);
                setCsv(null);
              }}
            >
              Загрузить
            </AsyncButton>
            <button class="btn" onClick={() => setCsv(null)}>
              Отмена
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function ProductForm({
  product,
  products,
  sections,
  onClose
}: {
  product?: ShopProduct;
  products: ShopProduct[];
  sections: ShopSection[];
  onClose: () => void;
}) {
  const [name, setName] = useState(product?.name ?? '');
  const [price, setPrice] = useState(product?.price ? amountToInput(product.price, 'EUR') : '');
  const [sectionId, setSectionId] = useState<number | undefined>(product?.sectionId);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setError('');
    const n = name.trim().replace(/\s+/g, ' ');
    if (!n) return setError('Введите название.');
    const dup = findProduct(products, n);
    if (dup && dup.id !== product?.id) return setError(`Товар «${dup.name}» уже есть в справочнике.`);
    const p = price.trim() ? parseAmount(price, 'EUR') : 0;
    if (p == null || p < 0) return setError('Не получается прочитать цену. Пример: 1,70');
    const next: ShopProduct = { ...(product ?? {}), name: n, price: p, sectionId };
    if (next.sectionId == null) delete next.sectionId;
    await saveProduct(next);
    onClose();
  };

  const remove = async () => {
    if (!confirm(`Удалить «${product!.name}» из справочника? В уже составленных списках он останется.`)) return;
    await deleteProduct(product!.id!);
    onClose();
  };

  return (
    <Sheet title={product ? 'Товар' : 'Новый товар'} onClose={onClose} locked={busy}>
      <label class="field">
        Название
        <input class="text-input" value={name} maxLength={60} autoFocus={!product} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
      </label>
      <label class="field">
        Обычная цена, €
        <input class="text-input amount" inputMode="decimal" placeholder="0,00" value={price} onInput={(e) => setPrice((e.target as HTMLInputElement).value)} />
      </label>
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
          {sections.map((s) => (
            <option value={String(s.id)}>{s.name}</option>
          ))}
        </select>
      </label>
      {error && <p class="error-text">{error}</p>}
      <div class="sheet-actions">
        <AsyncButton class="btn primary" name="Покупки · сохранить товар справочника" onClick={save} disabled={busy} onBusy={setBusy}>
          Сохранить
        </AsyncButton>
      </div>
      {product && (
        <AsyncButton class="btn danger" name="Покупки · удалить товар" onClick={remove} disabled={busy} onBusy={setBusy} busyLabel="Удаление…">
          Удалить из справочника
        </AsyncButton>
      )}
    </Sheet>
  );
}
