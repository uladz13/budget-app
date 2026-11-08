import { useState } from 'preact/hooks';
import { db } from '../db';
import { useLive } from '../hooks';
import { sortAccounts } from '../balances';
import { formatMoney } from '../money';
import { dayLabel, filterOperations, groupByDay, monthLabel, monthOf, shiftMonth } from '../operations';
import { OperationForm } from '../components/OperationForm';
import { todayIso } from '../util';
import type { Account, Category, Transaction } from '../types';

export function TransactionsScreen() {
  const accounts = useLive(() => db.accounts.toArray(), []);
  const categories = useLive(() => db.categories.toArray(), []);
  const transactions = useLive(() => db.transactions.toArray(), []);
  const [month, setMonth] = useState(() => monthOf(todayIso()));
  const [accountId, setAccountId] = useState<number | undefined>();
  const [categoryId, setCategoryId] = useState<number | undefined>();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Transaction | null>(null);

  if (!accounts || !categories || !transactions) return <div class="loading">Загрузка…</div>;

  const accById = new Map(accounts.map((a) => [a.id!, a]));
  const catById = new Map(categories.map((c) => [c.id!, c]));
  const filtered = filterOperations(transactions, { month, accountId, categoryId, query });
  const groups = groupByDay(filtered);
  const hasFilter = accountId != null || categoryId != null || query.trim() !== '';
  const sortedCats = (kind: Category['kind']) => categories.filter((c) => c.kind === kind).sort((a, b) => a.order - b.order);
  const num = (v: string) => (v ? Number(v) : undefined);

  return (
    <div class="screen">
      <div class="screen-head">
        <h1>Операции</h1>
      </div>

      <div class="month-switch">
        <button class="icon-btn" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="предыдущий месяц">
          ‹
        </button>
        <span class="month-title">{monthLabel(month)}</span>
        <button class="icon-btn" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="следующий месяц">
          ›
        </button>
      </div>

      <div class="filters">
        <select class="text-input" value={accountId ?? ''} onChange={(e) => setAccountId(num((e.target as HTMLSelectElement).value))}>
          <option value="">Все счета</option>
          {sortAccounts(accounts).map((a) => (
            <option value={String(a.id)}>
              {a.name}
              {a.archived ? ' (архив)' : ''}
            </option>
          ))}
        </select>
        <select class="text-input" value={categoryId ?? ''} onChange={(e) => setCategoryId(num((e.target as HTMLSelectElement).value))}>
          <option value="">Все категории</option>
          <optgroup label="Расходы">
            {sortedCats('expense').map((c) => (
              <option value={String(c.id)}>{c.name}</option>
            ))}
          </optgroup>
          <optgroup label="Доходы">
            {sortedCats('income').map((c) => (
              <option value={String(c.id)}>{c.name}</option>
            ))}
          </optgroup>
        </select>
        <input
          class="text-input search"
          type="search"
          placeholder="Поиск по комментарию"
          value={query}
          onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
        />
        {hasFilter && (
          <button
            class="link small"
            onClick={() => {
              setAccountId(undefined);
              setCategoryId(undefined);
              setQuery('');
            }}
          >
            Сбросить фильтры
          </button>
        )}
      </div>

      {groups.length === 0 ? (
        <div class="card empty">{hasFilter ? 'Ничего не найдено.' : 'В этом месяце операций нет.'}</div>
      ) : (
        groups.map((g) => (
          <section class="card day">
            <div class="day-head eyebrow">{dayLabel(g.date)}</div>
            {g.items.map((t) => (
              <OperationRow tx={t} accById={accById} catById={catById} onClick={() => setEditing(t)} />
            ))}
          </section>
        ))
      )}

      {editing && <OperationForm key={editing.id} tx={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

/** Строка операции: категория или «Перевод», счёт(а) и комментарий, сумма со знаком и цветом. */
function OperationRow({
  tx,
  accById,
  catById,
  onClick
}: {
  tx: Transaction;
  accById: Map<number, Account>;
  catById: Map<number, Category>;
  onClick: () => void;
}) {
  const from = accById.get(tx.accountId);
  const to = tx.toAccountId != null ? accById.get(tx.toAccountId) : undefined;
  const fromName = from?.name ?? 'Удалённый счёт';
  const cur = from?.currency ?? 'EUR';

  let title: string;
  let sub: string;
  let amount: string;
  let cls = '';
  if (tx.type === 'transfer' || tx.type === 'exchange') {
    title = tx.type === 'exchange' ? 'Обмен' : 'Перевод';
    sub = `${fromName} → ${to?.name ?? 'Удалённый счёт'}`;
    amount = formatMoney(tx.amount, cur);
    if (tx.type === 'exchange' && to) amount += ` → ${formatMoney(tx.toAmount ?? tx.amount, to.currency)}`;
  } else {
    title = (tx.categoryId != null && catById.get(tx.categoryId)?.name) || 'Без категории';
    sub = fromName;
    const sign = tx.type === 'income' ? '+' : '−';
    amount = sign + formatMoney(tx.amount, cur);
    cls = tx.type === 'income' ? ' income' : ' expense';
  }

  return (
    <button class="list-row op-row" onClick={onClick}>
      <span class="row-main">
        <span class="row-title">{title}</span>
        <span class="muted small row-title">
          {sub}
          {tx.note ? ` · ${tx.note}` : ''}
        </span>
      </span>
      <span class={'num op-amount' + cls}>{amount}</span>
    </button>
  );
}
