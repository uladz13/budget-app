import { formatAmount, formatMoney } from '../money';
import type { MonthPoint } from '../reports';
import type { Currency } from '../types';

const SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

/** Столбики расходов по месяцам (свой SVG): выбранный месяц выделен, пунктир — среднее; нажатие — выбрать месяц. */
export function MonthChart({
  points,
  average,
  selected,
  currency,
  onSelect
}: {
  points: MonthPoint[];
  average: number;
  selected: string;
  currency: Currency;
  onSelect: (month: string) => void;
}) {
  const W = 340;
  const H = 150;
  const top = 18;
  const bottom = 22;
  const max = Math.max(1, average, ...points.map((p) => p.amount));
  const slot = W / points.length;
  const barW = Math.min(34, slot * 0.6);
  const y = (v: number) => top + (H - top - bottom) * (1 - v / max);
  const avgY = y(average);

  return (
    <div class="chart">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Расходы по месяцам">
        <line class="grid" x1="0" x2={W} y1={H - bottom} y2={H - bottom} />
        {points.map((p, i) => {
          const x = i * slot + (slot - barW) / 2;
          const on = p.month === selected;
          const m = Number(p.month.slice(5)) - 1;
          return (
            <g class="bar-hit" onClick={() => onSelect(p.month)}>
              <rect x={i * slot} y="0" width={slot} height={H} fill="transparent" />
              {p.amount > 0 && (
                <rect class={'bar' + (on ? ' bar-sel' : '')} x={x} y={y(p.amount)} width={barW} height={H - bottom - y(p.amount)} rx="4" />
              )}
              {on && p.amount > 0 && (
                <text class="axis value" x={x + barW / 2} y={y(p.amount) - 5} text-anchor="middle">
                  {formatAmount(Math.round(p.amount / 100) * 100, currency).replace(/,00$/, '')}
                </text>
              )}
              <text class={'axis' + (on ? ' on' : '')} x={x + barW / 2} y={H - 6} text-anchor="middle">
                {SHORT[m]}
              </text>
            </g>
          );
        })}
        {average > 0 && <line class="avg" x1="0" x2={W} y1={avgY} y2={avgY} />}
      </svg>
      {average > 0 && <div class="muted small">Пунктир — среднее: {formatMoney(average, currency)}</div>}
    </div>
  );
}
