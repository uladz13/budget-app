import { useEffect, useState } from 'preact/hooks';
import { db, deleteTransaction, getLastAccounts, saveTransaction } from '../db';
import { useLive } from '../hooks';
import { go } from '../router';
import { sortAccounts } from '../balances';
import { currencyInfo, parseAmount } from '../money';
import {
  buildTransaction,
  draftFromTransaction,
  exchangeRateLabel,
  isExchange,
  type OperationDraft,
  type OperationKind
} from '../operations';
import { todayIso } from '../util';
import { AsyncButton, Seg, Sheet } from './ui';
import type { Account, Category, Transaction } from '../types';

const KIND_TITLE: Record<OperationKind, string> = { expense: 'Расход', income: 'Доход', transfer: 'Перевод' };

/** Счёт по умолчанию: последний для этого вида, если он ещё активен, иначе первый основной, иначе первый активный. */
function pickAccount(active: Account[], last?: number, exclude?: number): number | undefined {
  const ok = (a: Account) => a.id !== exclude;
  if (last != null && active.some((a) => a.id === last && ok(a))) return last;
  return (active.find((a) => a.group === 'main' && ok(a)) ?? active.find(ok))?.id;
}

/** Форма операции: новая (без `tx`) или правка существующей. */
export function OperationForm({ tx, onClose }: { tx?: Transaction; onClose: () => void }) {
  const accounts = useLive(() => db.accounts.toArray(), []);
  const categories = useLive(() => db.categories.toArray(), []);
  const [draft, setDraft] = useState<OperationDraft | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const all = accounts ? sortAccounts(accounts) : [];
  const active = all.filter((a) => !a.archived);

  /** Значения по умолчанию для нового вида операции (сумма и комментарий сохраняются). */
  const defaultsFor = async (kind: OperationKind, prev?: OperationDraft): Promise<OperationDraft> => {
    const last = await getLastAccounts(kind);
    const accountId = pickAccount(active, last.accountId);
    const toAccountId = kind === 'transfer' ? pickAccount(active, last.toAccountId, accountId) : undefined;
    return {
      kind,
      date: prev?.date ?? todayIso(),
      accountId,
      toAccountId,
      amount: prev?.amount ?? '',
      toAmount: '',
      categoryId: undefined,
      note: prev?.note ?? ''
    };
  };

  useEffect(() => {
    if (!accounts || draft) return;
    if (tx) setDraft(draftFromTransaction(tx, accounts));
    else defaultsFor('expense').then(setDraft);
  }, [accounts]);

  if (!accounts || !categories || !draft) return null;

  if (!active.length && !tx) {
    return (
      <Sheet title="Новая операция" onClose={onClose}>
        <p class="muted">Сначала добавьте счёт — карту, наличные или накопления.</p>
        <button
          class="btn primary"
          onClick={() => {
            onClose();
            go('accounts');
          }}
        >
          К счетам
        </button>
      </Sheet>
    );
  }

  /** Изменения поверх последнего состояния — два быстрых изменения подряд не теряют друг друга. */
  const set = (patch: Partial<OperationDraft>) => {
    setError('');
    setDraft((d) => (d ? { ...d, ...patch } : d));
  };
  const byId = (id?: number) => all.find((a) => a.id === id);
  const from = byId(draft.accountId);
  const to = byId(draft.toAccountId);
  const exchange = draft.kind === 'transfer' && isExchange(from, to);

  /** В списке — активные счета и (при правке) счета этой операции, даже если они уже в архиве. */
  const choosable = all.filter((a) => !a.archived || a.id === tx?.accountId || a.id === tx?.toAccountId);
  /** Категории вида: не скрытые и (при правке) текущая, даже если скрыта. */
  const cats = categories
    .filter((c) => c.kind === draft.kind && (!c.hidden || c.id === tx?.categoryId))
    .sort((a, b) => a.order - b.order);

  const changeKind = async (kind: OperationKind) => {
    if (kind === draft.kind) return;
    setError('');
    if (tx) set({ kind, categoryId: undefined, toAccountId: kind === 'transfer' ? draft.toAccountId : undefined });
    else setDraft(await defaultsFor(kind, draft));
  };

  const save = async () => {
    setError('');
    const res = buildTransaction(draft, all);
    if (!res.ok) return setError(res.error);
    await saveTransaction(tx?.id != null ? { ...res.tx, id: tx.id } : res.tx);
    onClose();
  };

  const remove = async () => {
    if (!confirm('Удалить операцию? Отменить это нельзя.')) return;
    await deleteTransaction(tx!.id!);
    onClose();
  };

  const rate =
    exchange && from && to
      ? exchangeRateLabel(parseAmount(draft.amount, from.currency) ?? 0, from.currency, parseAmount(draft.toAmount, to.currency) ?? 0, to.currency)
      : '';

  return (
    <Sheet title={tx ? KIND_TITLE[draft.kind] : 'Новая операция'} onClose={onClose} locked={busy}>
      <Seg value={draft.kind} onChange={changeKind} options={[['expense', 'Расход'], ['income', 'Доход'], ['transfer', 'Перевод']]} fill />

      <label class="field">
        {exchange ? 'Списать' : 'Сумма'}
        {from ? `, ${currencyInfo(from.currency).code}` : ''}
        <input
          class="text-input amount big"
          inputMode="decimal"
          placeholder="0,00"
          value={draft.amount}
          autoFocus={!tx}
          onInput={(e) => set({ amount: (e.target as HTMLInputElement).value })}
        />
      </label>

      <AccountSelect
        label={draft.kind === 'transfer' ? 'Откуда' : 'Счёт'}
        accounts={choosable}
        value={draft.accountId}
        onChange={(accountId) => set({ accountId })}
      />

      {draft.kind === 'transfer' && (
        <AccountSelect label="Куда" accounts={choosable} value={draft.toAccountId} onChange={(toAccountId) => set({ toAccountId })} />
      )}

      {exchange && to && (
        <label class="field">
          Зачислить, {to.currency}
          <input
            class="text-input amount"
            inputMode="decimal"
            placeholder="0,00"
            value={draft.toAmount}
            onInput={(e) => set({ toAmount: (e.target as HTMLInputElement).value })}
          />
          {rate && <span class="small">Курс: {rate}</span>}
        </label>
      )}

      {draft.kind !== 'transfer' && <CategoryPicker categories={cats} value={draft.categoryId} onChange={(categoryId) => set({ categoryId })} />}

      <label class="field">
        Дата
        <input class="text-input" type="date" value={draft.date} onInput={(e) => set({ date: (e.target as HTMLInputElement).value })} />
      </label>

      <label class="field">
        Комментарий
        <input class="text-input" value={draft.note} placeholder="Необязательно" onInput={(e) => set({ note: (e.target as HTMLInputElement).value })} />
      </label>

      {error && <p class="error-text">{error}</p>}
      <div class="sheet-actions">
        <AsyncButton class="btn primary" name="Операция · сохранить" onClick={save} disabled={busy} onBusy={setBusy}>
          Сохранить
        </AsyncButton>
      </div>
      {tx && (
        <AsyncButton class="btn danger" name="Операция · удалить" onClick={remove} disabled={busy} onBusy={setBusy} busyLabel="Удаление…">
          Удалить операцию
        </AsyncButton>
      )}
    </Sheet>
  );
}

function AccountSelect({
  label,
  accounts,
  value,
  onChange
}: {
  label: string;
  accounts: Account[];
  value?: number;
  onChange: (id: number | undefined) => void;
}) {
  return (
    <label class="field">
      {label}
      <select
        class="text-input"
        value={value == null ? '' : String(value)}
        onChange={(e) => {
          const v = (e.target as HTMLSelectElement).value;
          onChange(v ? Number(v) : undefined);
        }}
      >
        {value == null && <option value="">— выберите счёт —</option>}
        {accounts.map((a) => (
          <option value={String(a.id)}>
            {a.name} · {a.currency}
            {a.archived ? ' (архив)' : ''}
          </option>
        ))}
      </select>
    </label>
  );
}

function CategoryPicker({ categories, value, onChange }: { categories: Category[]; value?: number; onChange: (id: number) => void }) {
  return (
    <div class="field">
      Категория
      <div class="seg cat-grid">
        {categories.map((c) => (
          <button type="button" class={value === c.id ? 'on' : ''} onClick={() => onChange(c.id!)}>
            {c.name}
          </button>
        ))}
      </div>
    </div>
  );
}
