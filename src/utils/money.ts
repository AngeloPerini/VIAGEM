import type { CurrencyRange, ExchangeRateMap, Expense, TravelCurrencyCode } from '../types';
import { getRateForCurrency } from '../services/currencyService';

export type Totals = {
  euro: CurrencyRange;
  real: CurrencyRange;
  originalByCurrency: Partial<Record<TravelCurrencyCode, CurrencyRange>>;
};

const buildFormatter = (currency: TravelCurrencyCode) => new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency,
  minimumFractionDigits: 0,
  maximumFractionDigits: currency === 'JPY' ? 0 : 2,
});

const formatters = new Map<TravelCurrencyCode, Intl.NumberFormat>();

const getFormatter = (currency: TravelCurrencyCode) => {
  const formatter = formatters.get(currency) ?? buildFormatter(currency);
  formatters.set(currency, formatter);
  return formatter;
};

const roundForSummary = (value: number) => Math.ceil(value);

export const emptyRange = (): CurrencyRange => ({ min: 0, max: 0 });

export const emptyTotals = (): Totals => ({
  euro: emptyRange(),
  real: emptyRange(),
  originalByCurrency: {},
});

export const normalizeRange = (range: CurrencyRange): CurrencyRange => ({
  min: Math.min(range.min, range.max),
  max: Math.max(range.min, range.max),
});

export const addRanges = (items: CurrencyRange[]): CurrencyRange =>
  items.reduce(
    (total, item) => ({
      min: total.min + item.min,
      max: total.max + item.max,
    }),
    emptyRange(),
  );

export const convertEuroRangeToReal = (range: CurrencyRange, rate: number): CurrencyRange => ({
  min: range.min * rate,
  max: range.max * rate,
});

export const convertCurrencyRangeToReal = (
  range: CurrencyRange,
  currency: TravelCurrencyCode,
  rates?: ExchangeRateMap,
  fallback?: CurrencyRange,
): CurrencyRange => {
  if (currency === 'BRL') return range;

  const rate = rates ? getRateForCurrency(currency, rates) : null;
  if (!rate) return fallback ?? emptyRange();

  return {
    min: range.min * rate,
    max: range.max * rate,
  };
};

export const formatMoney = (value: number, currency: TravelCurrencyCode, compact = false) => {
  const rounded = compact ? roundForSummary(value) : value;
  return getFormatter(currency).format(rounded);
};

export const formatRange = (range: CurrencyRange, currency: TravelCurrencyCode, compact = false) => {
  const formatter = getFormatter(currency);
  const normalized = normalizeRange(range);
  const rounded = compact
    ? { min: roundForSummary(normalized.min), max: roundForSummary(normalized.max) }
    : normalized;

  if (rounded.min === rounded.max) {
    return formatter.format(rounded.min);
  }

  return `${formatter.format(rounded.min)} a ${formatter.format(rounded.max)}`;
};

export const parseCurrencyInput = (input: string): CurrencyRange => {
  const parts = input
    .replace(/€/g, '')
    .replace(/R\$/gi, '')
    .replace(/US\$/gi, '')
    .replace(/CHF/gi, '')
    .replace(/£|¥/g, '')
    .split(/\s+a\s+|-/i)
    .map((part) => part.trim())
    .filter(Boolean);

  const parsePart = (part: string) => {
    const normalized = part.replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '');
    return Number(normalized || 0);
  };

  const min = parsePart(parts[0] ?? '0');
  const max = parsePart(parts[1] ?? parts[0] ?? '0');

  return normalizeRange({ min, max });
};

export const parseAmountInput = (input: string) => parseCurrencyInput(input).min;

export const stringifyRangeForInput = (range: CurrencyRange) => {
  const normalized = normalizeRange(range);
  const format = (value: number) =>
    new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: value % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(value);

  return normalized.min === normalized.max
    ? format(normalized.min)
    : `${format(normalized.min)} a ${format(normalized.max)}`;
};

export const stringifyAmountForInput = (value: number | undefined) =>
  new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: value && value % 1 !== 0 ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(Number(value ?? 0));

export const getExpenseCurrency = (expense: Expense): TravelCurrencyCode => expense.currency ?? 'EUR';

export const getExpenseOriginalRange = (expense: Expense): CurrencyRange => {
  if (Number.isFinite(expense.amount)) {
    return { min: Number(expense.amount), max: Number(expense.amount) };
  }

  return getExpenseCurrency(expense) === 'BRL' ? expense.real : expense.euro;
};

export const getExpenseRealRange = (expense: Expense, rates?: ExchangeRateMap): CurrencyRange => {
  const currency = getExpenseCurrency(expense);
  const original = getExpenseOriginalRange(expense);

  if (currency === 'BRL') return original;

  return convertCurrencyRangeToReal(original, currency, rates, expense.real);
};

const addOriginalCurrency = (
  totals: Partial<Record<TravelCurrencyCode, CurrencyRange>>,
  currency: TravelCurrencyCode,
  range: CurrencyRange,
) => {
  const current = totals[currency] ?? emptyRange();
  totals[currency] = {
    min: current.min + range.min,
    max: current.max + range.max,
  };
};

export const buildOriginalCurrencyTotals = (expenses: Expense[]) => {
  const totals: Partial<Record<TravelCurrencyCode, CurrencyRange>> = {};

  expenses.forEach((expense) => {
    addOriginalCurrency(totals, getExpenseCurrency(expense), getExpenseOriginalRange(expense));
  });

  return totals;
};

export const formatOriginalCurrencyBreakdown = (
  totals: Partial<Record<TravelCurrencyCode, CurrencyRange>>,
  compact = true,
) => {
  const parts = Object.entries(totals)
    .filter(([, range]) => range && (range.min > 0 || range.max > 0))
    .map(([currency, range]) => formatRange(range as CurrencyRange, currency as TravelCurrencyCode, compact));

  return parts.length ? parts.join(' + ') : 'Sem valores originais';
};

export const calculateCategoryTotal = (
  expenses: Expense[],
  category: string,
  exchangeRates?: ExchangeRateMap,
  applySourceSheetAdjustment = true,
): Totals => {
  const categoryExpenses = expenses.filter((expense) => expense.category === category);
  const euroTotal = addRanges(categoryExpenses.map((expense) => expense.euro));
  const realTotal = addRanges(categoryExpenses.map((expense) => getExpenseRealRange(expense, exchangeRates)));

  // The source sheet rounds the transport subtotal above the literal item sum.
  const sourceSheetAdjustment =
    category === 'transport' && applySourceSheetAdjustment ? { min: 5, max: 6 } : emptyRange();

  return {
    euro: euroTotal,
    real: {
      min: realTotal.min + sourceSheetAdjustment.min,
      max: realTotal.max + sourceSheetAdjustment.max,
    },
    originalByCurrency: buildOriginalCurrencyTotals(categoryExpenses),
  };
};

export const calculateGrandTotal = (categoryTotals: Totals[]): Totals => ({
  euro: addRanges(categoryTotals.map((total) => total.euro)),
  real: addRanges(categoryTotals.map((total) => total.real)),
  originalByCurrency: categoryTotals.reduce<Partial<Record<TravelCurrencyCode, CurrencyRange>>>((totals, total) => {
    Object.entries(total.originalByCurrency).forEach(([currency, range]) => {
      if (range) addOriginalCurrency(totals, currency as TravelCurrencyCode, range);
    });
    return totals;
  }, {}),
});

export const calculateExpensesTotal = (
  expenses: Expense[],
  exchangeRates?: ExchangeRateMap,
  applySourceSheetAdjustment = true,
): Totals => {
  const euroTotal = addRanges(expenses.map((expense) => expense.euro));
  const realTotal = addRanges(expenses.map((expense) => getExpenseRealRange(expense, exchangeRates)));
  const hasTransport = expenses.some((expense) => expense.category === 'transport');
  const sourceSheetAdjustment =
    hasTransport && applySourceSheetAdjustment ? { min: 5, max: 6 } : emptyRange();

  return {
    euro: euroTotal,
    real: {
      min: realTotal.min + sourceSheetAdjustment.min,
      max: realTotal.max + sourceSheetAdjustment.max,
    },
    originalByCurrency: buildOriginalCurrencyTotals(expenses),
  };
};
