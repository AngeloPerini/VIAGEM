export type CurrencyRange = {
  min: number;
  max: number;
};

export type ExpenseCategoryId = 'lodging' | 'transport' | 'tours';

export type Expense = {
  id: string;
  category: ExpenseCategoryId;
  country?: CountryId;
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

export type CountryId = 'italy' | 'switzerland' | 'france' | 'international';

export type CountryFilterId = CountryId | 'all';

export type CountryMeta = {
  id: CountryFilterId;
  name: string;
  shortName: string;
  accent: string;
};

export type ItineraryType =
  | 'arrival'
  | 'lodging'
  | 'tour'
  | 'transport'
  | 'food'
  | 'flight'
  | 'train'
  | 'rest'
  | 'other';

export type ItineraryItem = {
  id: string;
  day: string;
  country: CountryId;
  city: string;
  time: string;
  title: string;
  description: string;
  type: ItineraryType;
};

export type Attraction = {
  id: string;
  name: string;
  country: CountryId;
  city: string;
  day: string;
  time?: string;
  description: string;
};

export type AttractionState = {
  visited: boolean;
  photo?: string;
  updatedAt?: number;
};

export type AttractionStateMap = Record<string, AttractionState>;
