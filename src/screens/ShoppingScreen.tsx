import { useState } from 'preact/hooks';
import { db, saveShopList } from '../db';
import { useLive } from '../hooks';
import { go } from '../router';
import { formatMoney } from '../money';
import { dayLabel } from '../operations';
import { listTotals, splitLists } from '../shopping';
import { plural } from '../backup';
import { AsyncButton, Sheet } from '../components/ui';
import { todayIso } from '../util';
import type { ShopList } from '../types';

/** «Покупки» (BA-006): текущие списки по дате, архив, новый список. */
export function ShoppingScreen() {
  const lists = useLive(() => db.shopLists.toArray(), []);
  const [creating, setCreating] = useState(false);

  if (!lists) return <div class="loading">Загрузка…</div>;
  const { active, archived } = splitLists(lists);

  return (
    <div class="screen">
      <div class="screen-head">
        <h1>Покупки</h1>
        <button class="chip" onClick={() => go('catalog')}>
          Справочник
        </button>
      </div>

      {active.length ? (
        <section class="card">
          {active.map((l) => (
            <ListRow list={l} />
          ))}
        </section>
      ) : (
        <div class="card empty">Списков пока нет — создайте первый.</div>
      )}

      <button class="btn primary wide" onClick={() => setCreating(true)}>
        + Новый список
      </button>

      {archived.length > 0 && (
        <details class="card">
          <summary>Архив ({archived.length})</summary>
          {archived.map((l) => (
            <ListRow list={l} />
          ))}
        </details>
      )}

      {creating && <NewListForm onClose={() => setCreating(false)} />}
    </div>
  );
}

/** «8 ноября, вс · Lidl» и «8 товаров · ≈ 54,30 €». */
export function listSubtitle(l: ShopList): string {
  const t = listTotals(l.items);
  const n = `${t.count} ${plural(t.count, ['товар', 'товара', 'товаров'])}`;
  return t.count ? `${n} · ≈ ${formatMoney(t.approx, 'EUR')}` : 'пустой';
}

function ListRow({ list }: { list: ShopList }) {
  return (
    <button class="list-row" onClick={() => go(`shop/${list.id}`)}>
      <span class="row-main">
        <span class="row-title">
          {dayLabel(list.date)}
          {list.title ? ` · ${list.title}` : ''}
        </span>
        <span class="muted small">{listSubtitle(list)}</span>
      </span>
      <span class="muted">›</span>
    </button>
  );
}

function NewListForm({ onClose }: { onClose: () => void }) {
  const [date, setDate] = useState(todayIso());
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setError('');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError('Укажите дату.');
    const id = await saveShopList({ date, title: title.trim() || undefined, archived: false, items: [] });
    onClose();
    go(`shop/${id}`);
  };

  return (
    <Sheet title="Новый список" onClose={onClose} locked={busy}>
      <label class="field">
        Дата
        <input class="text-input" type="date" value={date} onInput={(e) => setDate((e.target as HTMLInputElement).value)} />
      </label>
      <label class="field">
        Название
        <input
          class="text-input"
          value={title}
          maxLength={40}
          placeholder="Необязательно, например Lidl"
          onInput={(e) => setTitle((e.target as HTMLInputElement).value)}
        />
      </label>
      {error && <p class="error-text">{error}</p>}
      <div class="sheet-actions">
        <AsyncButton class="btn primary" name="Покупки · новый список" onClick={create} disabled={busy} onBusy={setBusy}>
          Создать
        </AsyncButton>
      </div>
    </Sheet>
  );
}
