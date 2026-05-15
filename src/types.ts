export type CurrencyRange = {
  min: number;
  max: number;
};

export type ExpenseCategoryId = 'lodging' | 'transport' | 'tours';

export type Expense = {
  id: string;
  category: ExpenseCategoryId;
  title: string;
  detail?: string;
  euro: CurrencyRange;
  real: CurrencyRange;
};

export type CategoryMeta = {
  id: ExpenseCategoryId;
  name: string;
  label: string;
  accent: string;
};

export type CurrencyQuote = {
  bid: number;
  pctChange: number;
  timestamp: number;
};

export type QuoteHistoryPoint = {
  rate: number;
  timestamp: number;
};

export type RealValueMode = 'original' | 'converted';
