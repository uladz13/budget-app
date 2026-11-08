import type { ComponentChildren } from 'preact';

/** Нижняя панель поверх экрана (формы, выбор). */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ComponentChildren }) {
  return (
    <div class="sheet-backdrop" onClick={onClose}>
      <div class="sheet" onClick={(e) => e.stopPropagation()}>
        <div class="sheet-head">
          <h3>{title}</h3>
          <button class="icon-btn" onClick={onClose} aria-label="закрыть">
            ✕
          </button>
        </div>
        <div class="sheet-body">{children}</div>
      </div>
    </div>
  );
}

/** Переключатель из нескольких вариантов. */
export function Seg<T extends string>({
  value,
  options,
  onChange,
  fill
}: {
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
  fill?: boolean;
}) {
  return (
    <div class={'seg' + (fill ? ' fill' : '')}>
      {options.map(([k, label]) => (
        <button type="button" class={value === k ? 'on' : ''} onClick={() => onChange(k)}>
          {label}
        </button>
      ))}
    </div>
  );
}
