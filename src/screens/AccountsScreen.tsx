import { useEffect, useState } from 'preact/hooks';
import { db, deleteAccount, getDeleteInfo, getOpening, hasOperations, saveAccount, setArchived } from '../db';
import { useLive } from '../hooks';
import { go } from '../router';
import { accountBalances, sortAccounts } from '../balances';
import { CURRENCIES, DEFAULT_CURRENCY, amountToInput, formatMoney, parseAmount } from '../money';
import { AsyncButton, Seg, Sheet } from '../components/ui';
import { todayIso } from '../util';
import type { Account, AccountGroup, AccountKind, Currency } from '../types';

export const KIND_LABEL: Record<AccountKind, string> = { card: 'Безнал', cash: 'Наличные' };
export const GROUP_LABEL: Record<AccountGroup, string> = { main: 'Основной', savings: 'Накопления' };

/** Строка счёта: название, тип и группа, остаток. */
export function AccountRow({
  account,
  balance,
  onClick,
  hideGroup
}: {
  account: Account;
  balance: number;
  onClick?: () => void;
  /** Не писать группу (когда счёт уже показан в карточке своей группы). */
  hideGroup?: boolean;
}) {
  return (
    <button class="list-row" onClick={onClick}>
      <span class="row-main">
        <span class="row-title">{account.name}</span>
        <span class="muted small">
          {KIND_LABEL[account.kind]}
          {hideGroup ? '' : ` · ${GROUP_LABEL[account.group]}`}
        </span>
      </span>
      <span class={'num' + (balance < 0 ? ' neg' : '')}>{formatMoney(balance, account.currency)}</span>
    </button>
  );
}

export function AccountsScreen() {
  const accounts = useLive(() => db.accounts.toArray(), []);
  const transactions = useLive(() => db.transactions.toArray(), []);
  /** null — форма закрыта, 'new' — новый счёт, иначе — id. */
  const [editing, setEditing] = useState<number | 'new' | null>(null);

  if (!accounts || !transactions) return <div class="loading">Загрузка…</div>;
  const balances = accountBalances(transactions);
  const sorted = sortAccounts(accounts);
  const active = sorted.filter((a) => !a.archived);
  const archived = sorted.filter((a) => a.archived);

  return (
    <div class="screen">
      <button class="chip back" onClick={() => go('more')}>
        ← Ещё
      </button>
      <div class="screen-head">
        <h1>Счета</h1>
      </div>

      <section class="card">
        {active.length ? (
          active.map((a) => <AccountRow account={a} balance={balances.get(a.id!) ?? 0} onClick={() => setEditing(a.id!)} />)
        ) : (
          <p class="muted center">Счетов пока нет.</p>
        )}
      </section>

      <button class="btn primary wide" onClick={() => setEditing('new')}>
        + Добавить счёт
      </button>

      {archived.length > 0 && (
        <details class="card">
          <summary>Архив ({archived.length})</summary>
          {archived.map((a) => (
            <AccountRow account={a} balance={balances.get(a.id!) ?? 0} onClick={() => setEditing(a.id!)} />
          ))}
        </details>
      )}

      {editing != null && (
        <AccountForm
          key={editing}
          account={editing === 'new' ? undefined : accounts.find((a) => a.id === editing)} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function AccountForm({ account, onClose }: { account?: Account; onClose: () => void }) {
  const [name, setName] = useState(account?.name ?? '');
  const [kind, setKind] = useState<AccountKind>(account?.kind ?? 'card');
  const [currency, setCurrency] = useState<Currency>(account?.currency ?? DEFAULT_CURRENCY);
  const [group, setGroup] = useState<AccountGroup>(account?.group ?? 'main');
  const [opening, setOpening] = useState('');
  /** У счёта есть операции — валюту не меняем, иначе суммы станут неверными. */
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState('');
  /** Идёт сохранение — остальные кнопки и закрытие панели заблокированы. */
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (account?.id == null) return;
    getOpening(account.id).then((t) => t && setOpening(amountToInput(t.amount, account.currency)));
    hasOperations(account.id).then(setLocked);
  }, [account?.id]);

  const save = async () => {
    setError('');
    const trimmed = name.trim();
    if (!trimmed) return setError('Введите название счёта.');
    const amount = opening.trim() ? parseAmount(opening, currency) : 0;
    if (amount == null) return setError('Не получается прочитать сумму начального остатка. Пример: 1250,50');
    await saveAccount(
      { ...(account ?? { archived: false, order: 0 }), name: trimmed, kind, currency, group },
      amount,
      todayIso()
    );
    onClose();
  };

  const toggleArchive = async () => {
    await setArchived(account!.id!, !account!.archived);
    onClose();
  };

  const remove = async () => {
    setError('');
    const id = account!.id!;
    const info = await getDeleteInfo(id);
    if (info.linked) {
      return setError('Счёт нельзя удалить: есть переводы или обмены с другими счетами. Отправьте его в архив.');
    }
    const ops = info.operations ? `\nВместе с ним удалятся операции: ${info.operations}.` : '';
    if (!confirm(`Удалить счёт «${account!.name}» навсегда?${ops}\nОтменить это нельзя.`)) return;
    await deleteAccount(id);
    onClose();
  };

  return (
    <Sheet title={account ? 'Счёт' : 'Новый счёт'} onClose={onClose} locked={busy}>
      <label class="field">
        Название
        <input
          class="text-input"
          value={name}
          placeholder="Например, Карта Revolut"
          autoFocus={!account}
          onInput={(e) => setName((e.target as HTMLInputElement).value)}
        />
      </label>
      <div class="field">
        Тип
        <Seg value={kind} onChange={setKind} options={[['card', KIND_LABEL.card], ['cash', KIND_LABEL.cash]]} fill />
      </div>
      <div class="field">
        Группа
        <Seg value={group} onChange={setGroup} options={[['main', GROUP_LABEL.main], ['savings', GROUP_LABEL.savings]]} fill />
      </div>
      <div class="field">
        Валюта
        {locked ? (
          <span class="small">{currency} — у счёта есть операции, валюту изменить нельзя</span>
        ) : (
          <Seg value={currency} onChange={setCurrency} options={CURRENCIES.map((c) => [c.code, `${c.code} ${c.symbol}`])} fill />
        )}
      </div>
      <label class="field">
        Начальный остаток, {currency}
        <input
          class="text-input amount"
          inputMode="decimal"
          value={opening}
          placeholder="0"
          onInput={(e) => setOpening((e.target as HTMLInputElement).value)}
        />
        <span class="small">Можно отрицательный — например, долг по кредитке.</span>
      </label>
      {error && <p class="error-text">{error}</p>}
      <div class="sheet-actions">
        <AsyncButton class="btn primary" onClick={save} disabled={busy} onBusy={setBusy}>
          Сохранить
        </AsyncButton>
      </div>
      {account && (
        <AsyncButton class="btn danger-text" onClick={toggleArchive} disabled={busy} onBusy={setBusy}>
          {account.archived ? 'Вернуть из архива' : 'Отправить в архив'}
        </AsyncButton>
      )}
      {account && (
        <AsyncButton class="btn danger" onClick={remove} disabled={busy} onBusy={setBusy} busyLabel="Удаление…">
          Удалить счёт
        </AsyncButton>
      )}
    </Sheet>
  );
}
