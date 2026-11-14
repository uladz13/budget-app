import { useState } from 'preact/hooks';
import { getLastBackup, markBackup, readAllData, replaceAllData, SCHEMA_VERSION } from '../db';
import { useLive } from '../hooks';
import { backupFileName, buildBackup, parseBackup, summarize, type BackupData } from '../backup';
import { fileAccept, saveTextFile } from '../share';
import { shortDate, todayIso } from '../util';
import { AsyncButton, Sheet } from './ui';

interface Pending {
  data: BackupData;
  fileName: string;
  exportedAt?: string;
  appVersion?: string;
  current: string;
}

/** «Ещё → Бэкап» (BA-005): сохранить все данные в файл и загрузить их из файла. */
export function BackupCard() {
  const lastBackup = useLive(() => getLastBackup(), []);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setMsg('');
    setError('');
    const now = new Date();
    const file = buildBackup(await readAllData(), SCHEMA_VERSION, __APP_VERSION__, now.toISOString());
    const res = await saveTextFile(backupFileName(todayIso(now)), JSON.stringify(file, null, 1));
    if (res === 'cancelled') return;
    await markBackup(now.toISOString());
    setMsg(res === 'shared' ? 'Бэкап сохранён.' : 'Файл бэкапа скачан — он в папке «Загрузки».');
  };

  const pick = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    setMsg('');
    setError('');
    const res = parseBackup(await file.text(), SCHEMA_VERSION);
    if (!res.ok) return setError(res.error);
    const current = await readAllData();
    setPending({ data: res.data, fileName: file.name, exportedAt: res.exportedAt, appVersion: res.appVersion, current: summarize(current) });
  };

  const apply = async () => {
    await replaceAllData(pending!.data);
    setMsg(`Данные загружены: ${summarize(pending!.data)}.`);
    setPending(null);
  };

  return (
    <section class="card backup">
      <h2>Бэкап</h2>
      <p class="muted small">
        Данные хранятся только на этом телефоне. Сохраняйте бэкап хотя бы раз в неделю — например, на Google Диск.
      </p>
      <p class="small">
        Последний бэкап: <b>{lastBackup ? shortDate(lastBackup) : 'ещё не делали'}</b>
      </p>
      <div class="sheet-actions">
        <AsyncButton class="btn primary" name="Бэкап · сохранить" onClick={save} busyLabel="Подготовка…">
          Сохранить бэкап
        </AsyncButton>
        <label class="btn">
          Загрузить файл
          <input type="file" accept={fileAccept("application/json,.json")} hidden onChange={pick} />
        </label>
      </div>
      {msg && <p class="small ok-text">{msg}</p>}
      {error && <p class="error-text">Не удалось загрузить: {error}</p>}

      {pending && (
        <Sheet title="Загрузить бэкап?" onClose={() => setPending(null)} locked={busy}>
          <div class="compare">
            <div>
              <div class="eyebrow">В файле</div>
              <div>{summarize(pending.data)}</div>
              <div class="muted small">
                {pending.exportedAt ? `бэкап от ${shortDate(pending.exportedAt)}` : pending.fileName}
                {pending.appVersion ? `, версия ${pending.appVersion}` : ''}
              </div>
            </div>
            <div>
              <div class="eyebrow">Сейчас на телефоне</div>
              <div>{pending.current}</div>
            </div>
          </div>
          <p class="warn-box">
            Все текущие данные будут заменены данными из файла. Если на телефоне есть что-то, чего нет в файле, — сначала
            сохраните бэкап текущих данных.
          </p>
          <div class="sheet-actions">
            <AsyncButton class="btn danger" name="Бэкап · загрузить" onClick={apply} busyLabel="Загрузка…" onBusy={setBusy}>
              Заменить данные
            </AsyncButton>
            <button class="btn" onClick={() => setPending(null)} disabled={busy}>
              Отмена
            </button>
          </div>
        </Sheet>
      )}
    </section>
  );
}
