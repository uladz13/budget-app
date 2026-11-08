import type { ComponentChildren } from 'preact';
import { useRef, useState } from 'preact/hooks';
import { ensureOpen, explainDbError } from '../db';
import { logDiag, logEvent, nextPaint, now, takeTransactions, type DiagPhase } from '../diagStore';

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
  onBusy,
  name = 'Сохранение',
  compact,
  ariaLabel,
  onError
}: {
  onClick: () => Promise<unknown>;
  children: ComponentChildren;
  class?: string;
  busyLabel?: string;
  disabled?: boolean;
  onBusy?: (busy: boolean) => void;
  /** Название действия для журнала диагностики («Операция · сохранить»). */
  name?: string;
  /** Маленькая кнопка (↑ ↓): во время действия — только спиннер, ошибка — через `onError`. */
  compact?: boolean;
  ariaLabel?: string;
  onError?: (message: string) => void;
}) {
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [slowHint, setSlowHint] = useState(false);

  const run = async (e: Event) => {
    if (running.current || disabled) return;
    running.current = true;
    // Замер по фазам для «Ещё → Диагностика» (BA-008).
    const tStart = now();
    const response = e.timeStamp > 0 && e.timeStamp <= tStart ? tStart - e.timeStamp : 0;
    // Дольше 5 с — подсказка на кнопке и запись в журнал сразу, не дожидаясь конца (decisions.md п. 32).
    const slow = setTimeout(() => {
      setSlowHint(true);
      logEvent(`${name}: идёт дольше 5 с`);
    }, 5000);
    let ok = true;
    let message: string | undefined;
    let tOpen = tStart;
    let tAction = tStart;
    setBusy(true);
    setError('');
    onBusy?.(true);
    try {
      await ensureOpen();
      tOpen = now();
      takeTransactions();
      await onClick();
    } catch (err) {
      ok = false;
      message = `${(err as Error)?.name ?? 'Error'}: ${(err as Error)?.message ?? String(err)}`;
      setError('Не удалось сохранить: ' + explainDbError(err));
      onError?.('Не удалось сохранить: ' + explainDbError(err));
    } finally {
      tAction = now();
      clearTimeout(slow);
      setSlowHint(false);
      running.current = false;
      setBusy(false);
      onBusy?.(false);
    }
    const tx = takeTransactions();
    await nextPaint();
    const tEnd = now();
    const phases: DiagPhase[] = [
      { name: 'отклик', ms: response },
      { name: 'база', ms: tOpen - tStart },
      { name: `запись (${tx.count})`, ms: tx.total },
      { name: 'прочее', ms: Math.max(0, tAction - tOpen - tx.total) },
      { name: 'экран', ms: tEnd - tAction }
    ];
    // Нажатие без записи в базу (ошибка в форме, отмена подтверждения) — помечаем, чтобы не путать с сохранением.
    const label = tx.count === 0 && ok ? `${name} — без записи` : name;
    logDiag({ kind: 'save', label, total: response + (tEnd - tStart), phases, ok, error: message });
  };

  return (
    <>
      <button
        type="button"
        class={cls + (busy ? ' busy' : '')}
        onClick={run}
        disabled={disabled || busy}
        aria-busy={busy}
        aria-label={ariaLabel}
      >
        {busy ? (
          <>
            <span class="spinner" aria-hidden="true" />
            {!compact && (slowHint ? `${busyLabel} это дольше обычного` : busyLabel)}
          </>
        ) : (
          children
        )}
      </button>
      {error && !compact && <p class="error-text">{error}</p>}
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
