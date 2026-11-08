import { useState } from 'preact/hooks';
import { db } from '../db';
import { useLive } from '../hooks';
import { go } from '../router';
import { formatMoney } from '../money';
import { monthLabel, monthOf, shiftMonth } from '../operations';
import {
  averageFromFirst,
  buildReport,
  currenciesInPeriod,
  monthlyExpenses,
  monthPeriod,
  singleMonth,
  type CategoryLine,
  type Period
} from '../reports';
import { MonthChart } from '../components/MonthChart';
import { Seg } from '../components/ui';
import { todayIso } from '../util';
import type { Category, Currency } from '../types';

type Mode = 'month' | 'period';

/** «Отчёты» (BA-004): доходы, расходы, итог, категории и сравнение — за месяц или свой период. */
export function ReportsScreen() {
  const accounts = useLive(() => db.accounts.toArray(), []);
  const categories = useLive(() => db.categories.toArray(), []);
  const transactions = useLive(() => db.transactions.toArray(), []);
  const today = todayIso();
  const [mode, setMode] = useState<Mode>('month');
  const [month, setMonth] = useState(() => monthOf(today));
  const [period, setPeriod] = useState<Period>(() => ({ from: `${monthOf(today)}-01`, to: today }));
  const [currency, setCurrency] = useState<Currency>('EUR');

  if (!accounts || !categories || !transactions) return <div class="loading">Загрузка…</div>;

  const p = mode === 'month' ? monthPeriod(month) : period;
  const badPeriod = p.from > p.to;
  const currencies = badPeriod ? [] : currenciesInPeriod(transactions, accounts, p);
  // Выбранная валюта, если она есть в периоде; иначе — первая из встречающихся (EUR, USD, BYN).
  const cur: Currency = currencies.includes(currency) ? currency : currencies[0] ?? currency;
  const report = buildReport(transactions, accounts, p, cur);
  const catName = new Map(categories.map((c) => [c.id!, c] as [number, Category]));
  const empty = !report.income && !report.expense && !report.fromSavings;
  const linkMonth = singleMonth(p);
  const compareText = mode === 'month' ? 'к прошлому месяцу' : 'к предыдущему периоду той же длины';

  const points = mode === 'month' ? monthlyExpenses(transactions, accounts, month, cur) : [];

  return (
    <div class="screen">
      <div class="screen-head">
        <h1>Отчёты</h1>
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

      {currencies.length > 1 && <Seg value={cur} onChange={setCurrency} options={currencies.map((c) => [c, c])} fill />}

      {badPeriod || !p.from || !p.to ? (
        <div class="card empty">Дата «с» должна быть не позже даты «по».</div>
      ) : empty ? (
        <div class="card empty">Нет доходов и расходов{mode === 'month' ? ' в этом месяце' : ' за этот период'}.</div>
      ) : (
        <>
          <section class="card summary">
            <div class="sum-row">
              <span>Доходы</span>
              <span class="num income">+{formatMoney(report.income, cur)}</span>
            </div>
            <div class="sum-row">
              <span>Расходы</span>
              <span class="num expense">−{formatMoney(report.expense, cur)}</span>
            </div>
            <div class="sum-row total">
              <span>Итог</span>
              <span class={'num ' + (report.net >= 0 ? 'income' : 'expense')}>
                {report.net >= 0 ? '+' : ''}
                {formatMoney(report.net, cur)}
              </span>
            </div>
            {report.fromSavings > 0 && (
              <div class="sum-row muted">
                <span>Из накоплений</span>
                <span class="num">−{formatMoney(report.fromSavings, cur)}</span>
              </div>
            )}
          </section>

          {report.expenseByCategory.length > 0 && (
            <section class="card">
              <h2>Расходы по категориям</h2>
              <p class="muted small cap">▲ ▼ — {compareText}</p>
              {report.expenseByCategory.map((l) => (
                <CategoryBar
                  line={l}
                  name={l.categoryId != null ? catName.get(l.categoryId)?.name ?? 'Удалённая категория' : 'Без категории'}
                  max={report.expenseByCategory[0].amount}
                  currency={cur}
                  onClick={linkMonth && l.categoryId != null ? () => go(`transactions/${linkMonth}/${l.categoryId}`) : undefined}
                />
              ))}
            </section>
          )}

          {report.incomeByCategory.length > 0 && (
            <section class="card">
              <h2>Доходы по категориям</h2>
              {report.incomeByCategory.map((l) => (
                <div class="list-row">
                  <span class="row-title">{l.categoryId != null ? catName.get(l.categoryId)?.name ?? 'Удалённая категория' : 'Без категории'}</span>
                  <span class="num income">+{formatMoney(l.amount, cur)}</span>
                </div>
              ))}
            </section>
          )}
        </>
      )}

      {mode === 'month' && points.some((pt) => pt.amount > 0) && (
        <section class="card">
          <h2>Расходы по месяцам</h2>
          <MonthChart points={points} average={averageFromFirst(points)} selected={month} currency={cur} onSelect={setMonth} />
        </section>
      )}
    </div>
  );
}

/** Полоса категории: название, сумма и доля, ▲ ▼ к предыдущему периоду; нажатие — операции категории. */
function CategoryBar({
  line,
  name,
  max,
  currency,
  onClick
}: {
  line: CategoryLine;
  name: string;
  max: number;
  currency: Currency;
  onClick?: () => void;
}) {
  const pct = Math.round(line.share * 100);
  const width = max ? Math.max(2, (line.amount / max) * 100) : 0;
  // Для расходов рост — плохо (красный ▲), снижение — хорошо (зелёный ▼).
  const delta =
    line.delta === 0 ? null : line.delta > 0 ? (
      <span class="delta up">▲ {formatMoney(line.delta, currency)}</span>
    ) : (
      <span class="delta down">▼ {formatMoney(-line.delta, currency)}</span>
    );
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag class="cat-bar" onClick={onClick}>
      <div class="cat-bar-head">
        <span class="row-title">{name}</span>
        <span class="num">{formatMoney(line.amount, currency)}</span>
      </div>
      <div class="cat-bar-track">
        <div class="cat-bar-fill" style={{ width: width + '%' }} />
      </div>
      <div class="cat-bar-foot muted small">
        <span>{pct < 1 ? '< 1' : pct}%</span>
        {delta}
      </div>
    </Tag>
  );
}
