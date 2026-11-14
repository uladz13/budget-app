import { Sheet } from './ui';

export interface PickOption {
  id: number;
  label: string;
  /** Пометка серым: «архив», «скрыта». */
  note?: string;
}

export interface PickGroup {
  /** Заголовок группы («Расходы»); без заголовка — простой список. */
  title?: string;
  options: PickOption[];
}

/**
 * Выбор нескольких значений (BA-009): список с галочками в нижней панели, «Выбрать все» и «Сбросить».
 * Выбор применяется сразу; «Готово» закрывает панель. Ничего не выбрано — фильтра нет («все»).
 */
export function MultiPick({
  title,
  groups,
  selected,
  onChange,
  onClose
}: {
  title: string;
  groups: PickGroup[];
  selected: number[];
  onChange: (ids: number[]) => void;
  onClose: () => void;
}) {
  const set = new Set(selected);
  const all = groups.flatMap((g) => g.options.map((o) => o.id));
  const toggle = (id: number) => onChange(set.has(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <Sheet title={title} onClose={onClose}>
      <div class="pick-actions">
        <button class="chip" onClick={() => onChange(all)} disabled={selected.length === all.length}>
          Выбрать все
        </button>
        <button class="chip" onClick={() => onChange([])} disabled={!selected.length}>
          Сбросить
        </button>
      </div>
      <div class="pick-list">
        {groups.map((g) => (
          <div class="pick-group">
            {g.title && <div class="eyebrow">{g.title}</div>}
            {g.options.map((o) => (
              <button class={'pick-row' + (set.has(o.id) ? ' on' : '')} onClick={() => toggle(o.id)} role="checkbox" aria-checked={set.has(o.id)}>
                <span class="pick-box">{set.has(o.id) ? '✓' : ''}</span>
                <span class="row-title">{o.label}</span>
                {o.note && <span class="muted small">{o.note}</span>}
              </button>
            ))}
          </div>
        ))}
      </div>
      <button class="btn primary" onClick={onClose}>
        Готово
      </button>
    </Sheet>
  );
}
