import { useState } from 'preact/hooks';
import { applyCategoryOrder, countCategoryOperations, db, deleteCategory, saveCategory, setCategoryHidden } from '../db';
import { useLive } from '../hooks';
import { go } from '../router';
import { moveCategory, nextOrder, sortedOfKind, validateCategoryName } from '../categories';
import { AsyncButton, Seg, Sheet } from '../components/ui';
import type { Category, CategoryKind } from '../types';

/** «Ещё → Категории» (BA-003): добавить, переименовать, скрыть, удалить, порядок ↑ ↓. */
export function CategoriesScreen() {
  const categories = useLive(() => db.categories.toArray(), []);
  const [kind, setKind] = useState<CategoryKind>('expense');
  /** null — панель закрыта, 'new' — новая категория, иначе — id. */
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [error, setError] = useState('');
  const [moving, setMoving] = useState(false);

  if (!categories) return <div class="loading">Загрузка…</div>;
  const all = sortedOfKind(categories, kind);
  const visible = all.filter((c) => !c.hidden);
  const hidden = all.filter((c) => c.hidden);

  const move = (id: number, dir: -1 | 1) => async () => {
    setError('');
    await applyCategoryOrder(moveCategory(categories, id, dir));
  };

  return (
    <div class="screen">
      <button class="chip back" onClick={() => go('more')}>
        ← Ещё
      </button>
      <div class="screen-head">
        <h1>Категории</h1>
      </div>
      <Seg value={kind} onChange={setKind} options={[['expense', 'Расходы'], ['income', 'Доходы']]} fill />

      <section class="card">
        {visible.length ? (
          visible.map((c, i) => (
            <div class="list-row cat-row">
              <button class="row-main cat-name" onClick={() => setEditing(c.id!)}>
                <span class="row-title">{c.name}</span>
              </button>
              <span class="mini-actions">
                <AsyncButton
                  class="icon-btn"
                  compact
                  name="Категория · порядок"
                  ariaLabel={`${c.name}: выше`}
                  disabled={i === 0 || moving}
                  onBusy={setMoving}
                  onError={setError}
                  onClick={move(c.id!, -1)}
                >
                  ↑
                </AsyncButton>
                <AsyncButton
                  class="icon-btn"
                  compact
                  name="Категория · порядок"
                  ariaLabel={`${c.name}: ниже`}
                  disabled={i === visible.length - 1 || moving}
                  onBusy={setMoving}
                  onError={setError}
                  onClick={move(c.id!, 1)}
                >
                  ↓
                </AsyncButton>
              </span>
            </div>
          ))
        ) : (
          <p class="muted center">Категорий пока нет.</p>
        )}
      </section>
      {error && <p class="error-text">{error}</p>}

      <button class="btn primary wide" onClick={() => setEditing('new')}>
        + Добавить категорию
      </button>

      {hidden.length > 0 && (
        <details class="card">
          <summary>Скрытые ({hidden.length})</summary>
          {hidden.map((c) => (
            <button class="list-row" onClick={() => setEditing(c.id!)}>
              <span class="row-title muted">{c.name}</span>
            </button>
          ))}
        </details>
      )}

      {editing != null && (
        <CategoryForm
          key={`${kind}:${editing}`}
          kind={kind}
          category={editing === 'new' ? undefined : categories.find((c) => c.id === editing)}
          categories={categories}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function CategoryForm({
  kind,
  category,
  categories,
  onClose
}: {
  kind: CategoryKind;
  category?: Category;
  categories: Category[];
  onClose: () => void;
}) {
  const [name, setName] = useState(category?.name ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setError('');
    const err = validateCategoryName(name, kind, categories, category?.id);
    if (err) return setError(err);
    await saveCategory(
      category ? { ...category, name: name.trim() } : { name: name.trim(), kind, hidden: false, order: nextOrder(categories, kind) }
    );
    onClose();
  };

  const toggleHidden = async () => {
    await setCategoryHidden(category!.id!, !category!.hidden);
    onClose();
  };

  const remove = async () => {
    setError('');
    const n = await countCategoryOperations(category!.id!);
    const ops = n ? `\nВместе с ней удалятся операции: ${n}. Остатки счетов пересчитаются.` : '';
    if (!confirm(`Удалить категорию «${category!.name}» навсегда?${ops}\nОтменить это нельзя.`)) return;
    await deleteCategory(category!.id!);
    onClose();
  };

  return (
    <Sheet title={category ? 'Категория' : kind === 'expense' ? 'Новая категория расходов' : 'Новая категория доходов'} onClose={onClose} locked={busy}>
      <label class="field">
        Название
        <input
          class="text-input"
          value={name}
          maxLength={40}
          placeholder={kind === 'expense' ? 'Например, Кафе' : 'Например, Подработка'}
          autoFocus={!category}
          onInput={(e) => {
            setError('');
            setName((e.target as HTMLInputElement).value);
          }}
        />
      </label>
      {category?.hidden && <p class="small muted">Категория скрыта: её нет в форме новых операций, но она остаётся в старых.</p>}
      {error && <p class="error-text">{error}</p>}
      <div class="sheet-actions">
        <AsyncButton class="btn primary" name="Категория · сохранить" onClick={save} disabled={busy} onBusy={setBusy}>
          Сохранить
        </AsyncButton>
      </div>
      {category && (
        <AsyncButton class="btn danger-text" name="Категория · скрыть" onClick={toggleHidden} disabled={busy} onBusy={setBusy}>
          {category.hidden ? 'Показать' : 'Скрыть'}
        </AsyncButton>
      )}
      {category && (
        <AsyncButton class="btn danger" name="Категория · удалить" onClick={remove} disabled={busy} onBusy={setBusy} busyLabel="Удаление…">
          Удалить категорию
        </AsyncButton>
      )}
    </Sheet>
  );
}
