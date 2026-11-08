/**
 * Деньги — целые числа в минимальных единицах (центы, копейки). Никаких float в хранении и расчётах.
 * Чистый модуль: без UI, браузера и Intl, чтобы переносился на любую платформу.
 */
import type { Currency } from './types';

export interface CurrencyInfo {
  code: Currency;
  /** Знак после суммы: «12,50 €». */
  symbol: string;
  name: string;
  /** Знаков после запятой. */
  digits: number;
}

export const CURRENCIES: CurrencyInfo[] = [
  { code: 'EUR', symbol: '€', name: 'Евро', digits: 2 },
  { code: 'USD', symbol: '$', name: 'Доллар США', digits: 2 },
  { code: 'BYN', symbol: 'Br', name: 'Белорусский рубль', digits: 2 }
];

export const DEFAULT_CURRENCY: Currency = 'EUR';

export function currencyInfo(code: Currency): CurrencyInfo {
  return CURRENCIES.find((c) => c.code === code) ?? CURRENCIES[0];
}

/** Узкий неразрывный пробел — разделитель тысяч. */
const THIN = ' ';
const NBSP = ' ';

/** Число без знака валюты: 123456 → «1 234,56», −500 → «−5,00». */
export function formatAmount(minor: number, currency: Currency = DEFAULT_CURRENCY): string {
  const { digits } = currencyInfo(currency);
  const scale = 10 ** digits;
  const abs = Math.abs(Math.round(minor));
  const int = Math.floor(abs / scale);
  const frac = abs % scale;
  const intStr = String(int).replace(/\B(?=(\d{3})+(?!\d))/g, THIN);
  const body = digits ? `${intStr},${String(frac).padStart(digits, '0')}` : intStr;
  return (minor < 0 ? '−' : '') + body;
}

/** Сумма с валютой: «1 234,56 €». */
export function formatMoney(minor: number, currency: Currency): string {
  return `${formatAmount(minor, currency)}${NBSP}${currencyInfo(currency).symbol}`;
}

/**
 * Разбор ввода пользователя в минимальные единицы. Принимает «12», «12,5», «1 234.56», «-3».
 * Возвращает null, если это не сумма или знаков после запятой больше, чем у валюты.
 */
export function parseAmount(input: string, currency: Currency = DEFAULT_CURRENCY): number | null {
  const { digits } = currencyInfo(currency);
  const s = input.replace(/[\s  ]/g, '').replace('−', '-').replace(',', '.');
  const m = /^(-)?(\d+)(?:\.(\d*))?$/.exec(s) ?? /^(-)?()\.(\d+)$/.exec(s);
  if (!m) return null;
  const [, minus, intPart, fracPart = ''] = m;
  if (fracPart.length > digits) return null;
  const value = Number(intPart || '0') * 10 ** digits + Number(fracPart.padEnd(digits, '0') || '0');
  if (!Number.isSafeInteger(value)) return null;
  return minus && value ? -value : value;
}

/** Сумма для поля ввода: 123456 → «1234,56» (без разделителей тысяч и знака валюты). */
export function amountToInput(minor: number, currency: Currency = DEFAULT_CURRENCY): string {
  return formatAmount(minor, currency).replace(/ /g, '').replace('−', '-');
}
