import { db, getLastBackup } from '../db';
import { daysSince, shortDate } from '../util';
import { useLive } from '../hooks';
import { go } from '../router';
import { accountBalances, groupTotals, sortAccounts } from '../balances';
import { formatMoney } from '../money';
import { AccountRow, GROUP_LABEL } from './AccountsScreen';
import type { Account, AccountGroup } from '../types';

export function HomeScreen() {
  const accounts = useLive(() => db.accounts.toArray(), []);
  const transactions = useLive(() => db.transactions.toArray(), []);
  /** null — бэкапа ещё не было, undefined — загружается. */
  const lastBackup = useLive(async () => (await getLastBackup()) ?? null, []);
  if (!accounts || !transactions) return <div class="loading">Загрузка…</div>;

  const balances = accountBalances(transactions);
  const active = sortAccounts(accounts).filter((a) => !a.archived);
  // Напоминание (decisions.md п. 35): есть операции, а бэкапа не было больше 7 дней или не было вовсе.
  const hasOperations = transactions.some((t) => t.type !== 'opening');
  const remind = hasOperations && lastBackup !== undefined && (lastBackup === null || daysSince(lastBackup) > 7);

  return (
    <div class="screen">
      <div class="screen-head">
        <h1>Главная</h1>
      </div>
      {remind && (
        <div class="hint-banner">
          <span>{lastBackup ? `Бэкап не сохраняли с ${shortDate(lastBackup)}.` : 'Бэкап ещё ни разу не сохраняли.'}</span>
          <button class="chip accent" onClick={() => go('more')}>
            Сохранить
          </button>
        </div>
      )}
      {active.length === 0 ? (
        <section class="card center">
          <p class="muted">Добавьте счета — карты, наличные, накопления — с текущими остатками.</p>
          <button class="btn primary wide" onClick={() => go('accounts')}>
            + Добавить счёт
          </button>
        </section>
      ) : (
        (['main', 'savings'] as AccountGroup[]).map((g) => (
          <GroupCard group={g} accounts={active.filter((a) => a.group === g)} balances={balances} />
        ))
      )}
    </div>
  );
}

/** Карточка группы: итоги по каждой валюте и счета группы. Пустая группа не показывается. */
function GroupCard({ group, accounts, balances }: { group: AccountGroup; accounts: Account[]; balances: Map<number, number> }) {
  if (!accounts.length) return null;
  const totals = groupTotals(accounts, balances, group);
  return (
    <section class="card">
      <div class="group-title eyebrow">
        <i class={'group-dot ' + group} />
        {GROUP_LABEL[group]}
      </div>
      <div class="totals">
        {totals.map((t) => (
          <div class={'total-value' + (t.amount < 0 ? ' neg' : '')}>{formatMoney(t.amount, t.currency)}</div>
        ))}
      </div>
      <div>
        {accounts.map((a) => (
          <AccountRow account={a} balance={balances.get(a.id!) ?? 0} onClick={() => go('accounts')} hideGroup />
        ))}
      </div>
    </section>
  );
}
