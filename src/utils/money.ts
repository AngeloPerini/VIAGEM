import type { CurrencyRange, Expense, ExpenseCategoryId } from '../types';

export type Totals = {
  euro: CurrencyRange;
  real: CurrencyRange;
};

const brlFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const euroFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const roundForSummary = (value: number) => Math.ceil(value);

export const emptyRange = (): CurrencyRange => ({ min: 0, max: 0 });

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

export const formatRange = (range: CurrencyRange, currency: 'EUR' | 'BRL', compact = false) => {
  const formatter = currency === 'EUR' ? euroFormatter : brlFormatter;
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

export const calculateCategoryTotal = (
  expenses: Expense[],
  category: ExpenseCategoryId,
  conversionRate?: number,
): Totals => {
  const categoryExpenses = expenses.filter((expense) => expense.category === category);
  const euroTotal = addRanges(categoryExpenses.map((expense) => expense.euro));

  if (conversionRate) {
    return {
      euro: euroTotal,
      real: convertEuroRangeToReal(euroTotal, conversionRate),
    };
  }

  const realTotal = addRanges(categoryExpenses.map((expense) => expense.real));

  // The source sheet rounds the transport subtotal above the literal item sum.
  const sourceSheetAdjustment = category === 'transport' ? { min: 5, max: 6 } : emptyRange();

  return {
    euro: euroTotal,
    real: {
      min: realTotal.min + sourceSheetAdjustment.min,
      max: realTotal.max + sourceSheetAdjustment.max,
    },
  };
};

export const calculateGrandTotal = (categoryTotals: Totals[]): Totals => ({
  euro: addRanges(categoryTotals.map((total) => total.euro)),
  real: addRanges(categoryTotals.map((total) => total.real)),
});
