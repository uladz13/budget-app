import type { ComponentChildren } from 'preact';
import { useRef, useState } from 'preact/hooks';

/** Нижняя панель поверх экрана (формы, выбор). `locked` — закрыть нельзя (идёт сохранение). */
export function Sheet({
  title,
  onClose,
  locked,
  children
}: {
  title: string;
  onClose: () => void;
  locked?: boolean;
  children: ComponentChildren;
}) {
  const close = () => !locked && onClose();
  return (
    <div class="sheet-backdrop" onClick={close}>
      <div class="sheet" onClick={(e) => e.stopPropagation()}>
        <div class="sheet-head">
          <h3>{title}</h3>
          <button class="icon-btn" onClick={close} disabled={locked} aria-label="закрыть">
            ✕
          </button>
        </div>
        <div class="sheet-body">{children}</div>
      </div>
    </div>
  );
}

/**
 * Кнопка для действий сохранения (decisions.md п. 21): пока действие выполняется — неактивна,
 * со спиннером и текстом `busyLabel`; повторные нажатия игнорируются (даже до перерисовки).
 * Ошибка действия показывается текстом под кнопкой. `onBusy` — чтобы форма заблокировала остальное.
 */
export function AsyncButton({
  onClick,
  children,
  class: cls = 'btn',
  busyLabel = 'Сохранение…',
  disabled,
  onBusy
}: {
  onClick: () => Promise<unknown>;
  children: ComponentChildren;
  class?: string;
  busyLabel?: string;
  disabled?: boolean;
  onBusy?: (busy: boolean) => void;
}) {
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async () => {
    if (running.current || disabled) return;
    running.current = true;
    setBusy(true);
    setError('');
    onBusy?.(true);
    try {
      await onClick();
    } catch (e) {
      setError('Не удалось сохранить: ' + ((e as Error)?.message ?? String(e)));
    } finally {
      running.current = false;
      setBusy(false);
      onBusy?.(false);
    }
  };

  return (
    <>
      <button type="button" class={cls + (busy ? ' busy' : '')} onClick={run} disabled={disabled || busy} aria-busy={busy}>
        {busy ? (
          <>
            <span class="spinner" aria-hidden="true" />
            {busyLabel}
          </>
        ) : (
          children
        )}
      </button>
      {error && <p class="error-text">{error}</p>}
    </>
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
