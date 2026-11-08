import { useEffect, useState } from 'preact/hooks';
import { go } from '../router';
import { clearDiag, onDiagChange, readDiag } from '../diagStore';
import { DIAG_MAX, formatEntry, formatLog } from '../diagnostics';
import { SCHEMA_VERSION } from '../db';

/** Шапка журнала: версия, схема, браузер, постоянное хранилище. */
async function header(): Promise<string[]> {
  const persisted = navigator.storage?.persisted ? await navigator.storage.persisted().catch(() => false) : false;
  return [
    `Бюджет ${__APP_VERSION__}, схема ${SCHEMA_VERSION}`,
    `Браузер: ${navigator.userAgent}`,
    `Режим: ${matchMedia('(display-mode: standalone)').matches ? 'установленное приложение' : 'вкладка браузера'}`,
    `Постоянное хранилище: ${persisted ? 'да' : 'нет'}`
  ];
}

/** «Ещё → Диагностика» (BA-008): журнал сохранений и событий, только на этом телефоне. */
export function DiagnosticsScreen() {
  const [entries, setEntries] = useState(readDiag);
  const [msg, setMsg] = useState('');
  useEffect(() => onDiagChange(() => setEntries(readDiag())), []);

  /** Текст для ручного копирования, если буфер обмена недоступен. */
  const [fallback, setFallback] = useState('');

  const copy = async () => {
    const text = formatLog(entries, await header());
    setFallback('');
    try {
      if (!navigator.clipboard?.writeText) throw new Error('нет доступа к буферу');
      await navigator.clipboard.writeText(text);
      setMsg('Журнал скопирован — вставьте его в сообщение.');
    } catch {
      setMsg('Не удалось скопировать автоматически — текст выделен ниже, скопируйте его вручную.');
      setFallback(text);
    }
  };

  const list = [...entries].reverse();

  return (
    <div class="screen">
      <button class="chip back" onClick={() => go('more')}>
        ← Ещё
      </button>
      <div class="screen-head">
        <h1>Диагностика</h1>
      </div>
      <p class="muted small">
        Последние {DIAG_MAX} записей: сохранения и события приложения: сколько заняла каждая фаза. Хранится только на этом телефоне и никуда не
        отправляется.
      </p>
      <div class="sheet-actions">
        <button class="btn primary" onClick={copy} disabled={!entries.length}>
          Скопировать
        </button>
        <button
          class="btn"
          onClick={() => {
            if (confirm('Очистить журнал диагностики?')) clearDiag();
          }}
          disabled={!entries.length}
        >
          Очистить
        </button>
      </div>
      {msg && <p class="small">{msg}</p>}
      {fallback && (
        <textarea
          class="text-input diag-text"
          readOnly
          rows={8}
          value={fallback}
          ref={(el) => {
            if (el && document.activeElement !== el) {
              el.focus();
              el.select();
            }
          }}
        />
      )}
      <section class="card diag-log">
        {list.length ? list.map((e) => <div class={'diag-row' + (e.kind === 'event' ? ' event' : '')}>{formatEntry(e)}</div>) : <p class="muted">Журнал пуст.</p>}
      </section>
    </div>
  );
}
