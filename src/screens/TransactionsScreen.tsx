import { useState } from 'preact/hooks';
import { db } from '../db';
import { useLive } from '../hooks';
import { sortAccounts } from '../balances';
import { formatMoney } from '../money';
import {
  dayLabel,
  filterOperations,
  filterTotals,
  groupByDay,
  monthLabel,
  monthOf,
  selectionLabel,
  shiftMonth,
  type FilterTotals
} from '../operations';
import { OperationForm } from '../components/OperationForm';
import { MultiPick } from '../components/MultiPick';
import { monthPeriod, type Period } from '../reports';
import { Seg } from '../components/ui';
import { todayIso } from '../util';
import type { Account, Category, Transaction } from '../types';

const PERIOD_ROUTE = /^(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})$/;

/**
 * Открыть с фильтром (переход из «Отчётов»): `#/transactions/2026-11/5` — месяц и категория,
 * `#/transactions/2026-10-16_2026-11-04/5` — свой период и категория (BA-010).
 */
export function TransactionsScreen({ initialMonth, initialCategory }: { initialMonth?: string; initialCategory?: string }) {
  const accounts = useLive(() => db.accounts.toArray(), []);
  const categories = useLive(() => db.categories.toArray(), []);
  const transactions = useLive(() => db.transactions.toArray(), []);
  const today = todayIso();
  const routePeriod = initialMonth ? PERIOD_ROUTE.exec(initialMonth) : null;
  const [mode, setMode] = useState<'month' | 'period'>(routePeriod ? 'period' : 'month');
  const [month, setMonth] = useState(() => (initialMonth && /^\d{4}-\d{2}$/.test(initialMonth) ? initialMonth : monthOf(today)));
  // Период по умолчанию — с 1-го числа текущего месяца по сегодня (BA-010, п. 3).
  const [period, setPeriod] = useState<Period>(() =>
    routePeriod ? { from: routePeriod[1], to: routePeriod[2] } : { from: `${monthOf(today)}-01`, to: today }
  );
  const [accountIds, setAccountIds] = useState<number[]>([]);
  // Переход из «Отчётов» — одна выбранная категория (BA-009, п. 4).
  const [categoryIds, setCategoryIds] = useState<number[]>(() => (initialCategory && Number(initialCategory) ? [Number(initialCategory)] : []));
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [picking, setPicking] = useState<'accounts' | 'categories' | null>(null);

  if (!accounts || !categories || !transactions) return <div class="loading">Загрузка…</div>;

  const accById = new Map(accounts.map((a) => [a.id!, a]));
  const catById = new Map(categories.map((c) => [c.id!, c]));
  const { from, to } = mode === 'month' ? monthPeriod(month) : period;
  const badPeriod = !from || !to || from > to;
  const filtered = badPeriod ? [] : filterOperations(transactions, { from, to, accountIds, categoryIds, query });
  const groups = groupByDay(filtered);
  const hasFilter = accountIds.length > 0 || categoryIds.length > 0 || query.trim() !== '';
  const sortedCats = (kind: Category['kind']) => categories.filter((c) => c.kind === kind).sort((a, b) => a.order - b.order);
  const sortedAccounts = sortAccounts(accounts);

  // Выбраны все — подпись «Все …» (то же, что без фильтра).
  const accLabel =
    accountIds.length === accounts.length
      ? 'Все счета'
      : selectionLabel(sortedAccounts.filter((a) => accountIds.includes(a.id!)).map((a) => a.name), 'Все счета');
  const catOrder = [...sortedCats('expense'), ...sortedCats('income')];
  const catLabel =
    categoryIds.length === categories.length
      ? 'Все категории'
      : selectionLabel(catOrder.filter((c) => categoryIds.includes(c.id!)).map((c) => c.name), 'Все категории');

  return (
    <div class="screen">
      <div class="screen-head">
        <h1>Операции</h1>
      </div>

      <Seg value={mode} onChange={setMode} options={[['month', 'Месяц'], ['period', 'Период']]} fill />

      {mode === 'month' ? (
        <div class="month-switch">
          <button class="icon-btn" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="предыдущий месяц">
            ‹
          </button>
          <span class="month-title">{monthLabel(month)}</span>
          <button class="icon-btn" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="следующий месяц">
            ›
          </button>
        </div>
      ) : (
        <div class="period">
          <label class="field">
            с
            <input class="text-input" type="date" value={period.from} max={period.to} onInput={(e) => setPeriod({ ...period, from: (e.target as HTMLInputElement).value })} />
          </label>
          <label class="field">
            по
            <input class="text-input" type="date" value={period.to} min={period.from} onInput={(e) => setPeriod({ ...period, to: (e.target as HTMLInputElement).value })} />
          </label>
        </div>
      )}

      <div class="filters">
        <button class={'text-input filter-btn' + (accountIds.length ? ' on' : '')} onClick={() => setPicking('accounts')}>
          <span class="row-title">{accLabel}</span>
        </button>
        <button class={'text-input filter-btn' + (categoryIds.length ? ' on' : '')} onClick={() => setPicking('categories')}>
          <span class="row-title">{catLabel}</span>
        </button>
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
              setAccountIds([]);
              setCategoryIds([]);
              setQuery('');
            }}
          >
            Сбросить фильтры
          </button>
        )}
      </div>

      <FilterTotalsCard totals={filterTotals(filtered, accounts, accountIds)} showTransfers={accountIds.length > 0} />

      {groups.length === 0 ? (
        <div class="card empty">
          {badPeriod
            ? 'Дата «с» должна быть не позже даты «по».'
            : hasFilter
              ? 'Ничего не найдено.'
              : mode === 'month'
                ? 'В этом месяце операций нет.'
                : 'За этот период операций нет.'}
        </div>
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

      {picking === 'accounts' && (
        <MultiPick
          title="Счета"
          groups={[{ options: sortedAccounts.map((a) => ({ id: a.id!, label: a.name, note: a.archived ? 'архив' : undefined })) }]}
          selected={accountIds}
          onChange={setAccountIds}
          onClose={() => setPicking(null)}
        />
      )}
      {picking === 'categories' && (
        <MultiPick
          title="Категории"
          groups={(['expense', 'income'] as const).map((k) => ({
            title: k === 'expense' ? 'Расходы' : 'Доходы',
            options: sortedCats(k).map((c) => ({ id: c.id!, label: c.name, note: c.hidden ? 'скрыта' : undefined }))
          }))}
          selected={categoryIds}
          onChange={setCategoryIds}
          onClose={() => setPicking(null)}
        />
      )}
    </div>
  );
}

/**
 * Итоги по тому, что отобрано (BA-011): Доходы, Расходы, Разница по каждой валюте; при фильтре по счетам —
 * «Переводы: +пришло / −ушло». Нет операций — карточки нет.
 */
function FilterTotalsCard({ totals, showTransfers }: { totals: FilterTotals[]; showTransfers: boolean }) {
  if (!totals.length) return null;
  const multi = totals.length > 1;
  return (
    <section class="card filter-totals">
      {totals.map((t) => (
        <div class="ft-block">
          {multi && <div class="ft-cur">{t.currency}</div>}
          <div class="ft-row">
            <div>
              <div class="stat-label">Доходы</div>
              <div class="stat-value income">+{formatMoney(t.income, t.currency)}</div>
            </div>
            <div>
              <div class="stat-label">Расходы</div>
              <div class="stat-value expense">−{formatMoney(t.expense, t.currency)}</div>
            </div>
            <div>
              <div class="stat-label">Разница</div>
              <div class={'stat-value ' + (t.net >= 0 ? 'income' : 'expense')}>
                {t.net >= 0 ? '+' : ''}
                {formatMoney(t.net, t.currency)}
              </div>
            </div>
          </div>
          {showTransfers && (t.transferIn > 0 || t.transferOut > 0) && (
            <div class="muted small ft-transfers">
              Переводы: +{formatMoney(t.transferIn, t.currency)} / −{formatMoney(t.transferOut, t.currency)}
            </div>
          )}
        </div>
      ))}
    </section>
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
