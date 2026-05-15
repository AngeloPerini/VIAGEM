import type { CurrencyQuote, QuoteHistoryPoint } from '../types';

const API_URL = 'https://economia.awesomeapi.com.br/json/last/EUR-BRL';
export const QUOTE_STORAGE_KEY = 'europa-budget-eur-brl-quote-v1';
export const QUOTE_HISTORY_STORAGE_KEY = 'europa-budget-eur-brl-history-v1';

type AwesomeApiResponse = {
  EURBRL?: {
    bid: string;
    pctChange: string;
    timestamp: string;
  };
};

const parseQuote = (payload: AwesomeApiResponse): CurrencyQuote => {
  const quote = payload.EURBRL;
  if (!quote) {
    throw new Error('Cotacao EUR-BRL indisponivel.');
  }

  const bid = Number(quote.bid);
  const pctChange = Number(quote.pctChange);
  const timestamp = Number(quote.timestamp) * 1000;

  if (!Number.isFinite(bid) || !Number.isFinite(pctChange) || !Number.isFinite(timestamp)) {
    throw new Error('Cotacao EUR-BRL invalida.');
  }

  return { bid, pctChange, timestamp };
};

export async function fetchEuroToBrlQuote(): Promise<CurrencyQuote> {
  const response = await fetch(API_URL, { cache: 'no-store' });

  if (!response.ok) {
    throw new Error('Falha ao buscar cotacao EUR-BRL.');
  }

  return parseQuote((await response.json()) as AwesomeApiResponse);
}

export function loadStoredQuote(): CurrencyQuote | null {
  const stored = localStorage.getItem(QUOTE_STORAGE_KEY);
  if (!stored) return null;

  try {
    const quote = JSON.parse(stored) as CurrencyQuote;
    return Number.isFinite(quote.bid) && Number.isFinite(quote.timestamp) ? quote : null;
  } catch {
    return null;
  }
}

export function saveStoredQuote(quote: CurrencyQuote) {
  localStorage.setItem(QUOTE_STORAGE_KEY, JSON.stringify(quote));
}

export function loadQuoteHistory(): QuoteHistoryPoint[] {
  const stored = localStorage.getItem(QUOTE_HISTORY_STORAGE_KEY);
  if (!stored) return [];

  try {
    const history = JSON.parse(stored) as QuoteHistoryPoint[];
    return history.filter(
      (point) => Number.isFinite(point.rate) && Number.isFinite(point.timestamp),
    );
  } catch {
    return [];
  }
}

export function appendQuoteHistory(quote: CurrencyQuote): QuoteHistoryPoint[] {
  const nextPoint = { rate: quote.bid, timestamp: quote.timestamp };
  const previous = loadQuoteHistory();
  const next = [...previous, nextPoint]
    .filter(
      (point, index, list) =>
        list.findIndex((candidate) => candidate.timestamp === point.timestamp) === index,
    )
    .slice(-12);

  localStorage.setItem(QUOTE_HISTORY_STORAGE_KEY, JSON.stringify(next));
  return next;
}
