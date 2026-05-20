import type {
  CurrencyQuote,
  ExchangeRate,
  ExchangeRateHistory,
  ExchangeRateMap,
  QuoteHistoryPoint,
  TravelCurrencyCode,
} from '../types';

const API_BASE_URL = 'https://economia.awesomeapi.com.br/json/last';
const QUOTE_PAIRS = ['EUR-BRL', 'USD-BRL', 'JPY-BRL', 'CHF-BRL', 'GBP-BRL'] as const;

export const TRAVEL_CURRENCIES: TravelCurrencyCode[] = ['BRL', 'EUR', 'USD', 'JPY', 'CHF', 'GBP'];
export const QUOTED_TRAVEL_CURRENCIES: Exclude<TravelCurrencyCode, 'BRL'>[] = ['EUR', 'USD', 'JPY', 'CHF', 'GBP'];
export const EXCHANGE_RATES_STORAGE_KEY = 'tripflow_exchange_rates';
export const EXCHANGE_RATES_HISTORY_STORAGE_KEY = 'tripflow_exchange_rates_history';
export const QUOTE_STORAGE_KEY = 'europa-budget-eur-brl-quote-v1';
export const QUOTE_HISTORY_STORAGE_KEY = 'europa-budget-eur-brl-history-v1';

export const currencyNames: Record<TravelCurrencyCode, string> = {
  BRL: 'Real brasileiro',
  EUR: 'Euro',
  USD: 'Dólar americano',
  JPY: 'Iene japonês',
  CHF: 'Franco suíço',
  GBP: 'Libra esterlina',
};

export const currencySymbols: Record<TravelCurrencyCode, string> = {
  BRL: 'R$',
  EUR: '€',
  USD: 'US$',
  JPY: '¥',
  CHF: 'CHF',
  GBP: '£',
};

export const currencyBadges: Record<TravelCurrencyCode, string> = {
  BRL: 'BR',
  EUR: 'EU',
  USD: 'US',
  JPY: 'JP',
  CHF: 'CH',
  GBP: 'UK',
};

type AwesomeApiQuote = {
  code?: string;
  codein?: string;
  name?: string;
  bid?: string;
  pctChange?: string;
  timestamp?: string;
  create_date?: string;
};

type AwesomeApiResponse = Record<string, AwesomeApiQuote | undefined>;

type RefreshExchangeRatesResult = {
  rates: ExchangeRateMap;
  warning: string | null;
  usedCache: boolean;
  failedCurrencies: TravelCurrencyCode[];
};

const isTravelCurrency = (value: string): value is TravelCurrencyCode =>
  TRAVEL_CURRENCIES.includes(value as TravelCurrencyCode);

const pairToCode = (pair: string): TravelCurrencyCode => {
  const code = pair.split('-')[0]?.toUpperCase() ?? '';
  if (isTravelCurrency(code) && code !== 'BRL') return code;
  throw new Error(`Par de moeda invalido: ${pair}`);
};

const storageAvailable = () => typeof localStorage !== 'undefined';

const getBrlRate = (): ExchangeRate => ({
  code: 'BRL',
  name: currencyNames.BRL,
  rate: 1,
  variation: 0,
  updatedAt: new Date().toISOString(),
  status: 'live',
});

const parseAwesomeQuote = (code: TravelCurrencyCode, quote: AwesomeApiQuote | undefined): ExchangeRate => {
  if (!quote) throw new Error(`Cotacao ${code}-BRL indisponivel.`);

  const rate = Number(quote.bid);
  const variation = Number(quote.pctChange ?? 0);
  const timestamp = Number(quote.timestamp);
  const updatedAt = Number.isFinite(timestamp) && timestamp > 0
    ? new Date(timestamp * 1000).toISOString()
    : new Date().toISOString();

  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error(`Cotacao ${code}-BRL invalida.`);
  }

  return {
    code,
    name: currencyNames[code],
    rate,
    variation: Number.isFinite(variation) ? variation : 0,
    updatedAt,
    status: 'live',
  };
};

const parseAwesomeResponse = (payload: AwesomeApiResponse): ExchangeRateMap => {
  const rates: ExchangeRateMap = { BRL: getBrlRate() };

  QUOTED_TRAVEL_CURRENCIES.forEach((code) => {
    const apiKey = `${code}BRL`;
    const quote = payload[apiKey];
    if (!quote) return;

    try {
      rates[code] = parseAwesomeQuote(code, quote);
    } catch {
      // Individual fallback below keeps one malformed quote from breaking all currencies.
    }
  });

  return rates;
};

const mergeRates = (base: ExchangeRateMap, next: ExchangeRateMap): ExchangeRateMap => ({
  ...base,
  ...next,
  BRL: next.BRL ?? base.BRL ?? getBrlRate(),
});

const markCached = (rate: ExchangeRate): ExchangeRate => ({
  ...rate,
  status: rate.code === 'BRL' ? 'live' : 'cached',
});

export async function getExchangeRate(pair: string): Promise<ExchangeRate> {
  const code = pairToCode(pair);
  const response = await fetch(`${API_BASE_URL}/${code}-BRL`, { cache: 'no-store' });

  if (!response.ok) {
    throw new Error(`Falha ao buscar cotacao ${code}-BRL.`);
  }

  const payload = await response.json() as AwesomeApiResponse;
  return parseAwesomeQuote(code, payload[`${code}BRL`]);
}

export async function getExchangeRates(): Promise<ExchangeRateMap> {
  const response = await fetch(`${API_BASE_URL}/${QUOTE_PAIRS.join(',')}`, { cache: 'no-store' });

  if (response.ok) {
    const rates = parseAwesomeResponse(await response.json() as AwesomeApiResponse);
    const missing = QUOTED_TRAVEL_CURRENCIES.filter((code) => !rates[code]);
    if (!missing.length) return rates;
  }

  const results = await Promise.allSettled(QUOTE_PAIRS.map((pair) => getExchangeRate(pair)));
  const rates: ExchangeRateMap = { BRL: getBrlRate() };

  results.forEach((result) => {
    if (result.status === 'fulfilled') {
      rates[result.value.code] = result.value;
    }
  });

  return rates;
}

export function getCachedExchangeRates(): ExchangeRateMap {
  if (!storageAvailable()) return { BRL: getBrlRate() };

  const stored = localStorage.getItem(EXCHANGE_RATES_STORAGE_KEY);
  if (!stored) return { BRL: getBrlRate() };

  try {
    const parsed = JSON.parse(stored) as ExchangeRateMap;
    return mergeRates({ BRL: getBrlRate() }, parsed);
  } catch {
    return { BRL: getBrlRate() };
  }
}

export function saveCachedExchangeRates(rates: ExchangeRateMap) {
  if (!storageAvailable()) return;
  localStorage.setItem(EXCHANGE_RATES_STORAGE_KEY, JSON.stringify(mergeRates(getCachedExchangeRates(), rates)));
}

export async function refreshExchangeRates(): Promise<RefreshExchangeRatesResult> {
  const cached = getCachedExchangeRates();

  try {
    const liveRates = await getExchangeRates();
    const failedCurrencies = QUOTED_TRAVEL_CURRENCIES.filter((code) => !liveRates[code]);
    const mergedRates = mergeRates(
      Object.fromEntries(
        Object.entries(cached).map(([code, rate]) => [code, rate ? markCached(rate) : rate]),
      ) as ExchangeRateMap,
      liveRates,
    );

    saveCachedExchangeRates(mergedRates);

    return {
      rates: mergedRates,
      warning: failedCurrencies.length ? 'Usando última cotação salva para algumas moedas.' : null,
      usedCache: failedCurrencies.length > 0,
      failedCurrencies,
    };
  } catch {
    const cachedRates = Object.fromEntries(
      Object.entries(cached).map(([code, rate]) => [code, rate ? markCached(rate) : rate]),
    ) as ExchangeRateMap;

    return {
      rates: cachedRates,
      warning: Object.keys(cachedRates).length > 1
        ? 'Usando última cotação salva.'
        : 'Não foi possível buscar as cotações. Tente atualizar novamente.',
      usedCache: Object.keys(cachedRates).length > 1,
      failedCurrencies: [...QUOTED_TRAVEL_CURRENCIES],
    };
  }
}

export function loadExchangeRateHistory(): ExchangeRateHistory {
  if (!storageAvailable()) return {};

  const stored = localStorage.getItem(EXCHANGE_RATES_HISTORY_STORAGE_KEY);
  if (!stored) return {};

  try {
    const parsed = JSON.parse(stored) as ExchangeRateHistory;
    return Object.fromEntries(
      Object.entries(parsed).map(([code, history]) => [
        code,
        (history ?? []).filter((point) => Number.isFinite(point.rate) && Number.isFinite(point.timestamp)),
      ]),
    ) as ExchangeRateHistory;
  } catch {
    return {};
  }
}

export function appendExchangeRateHistory(rates: ExchangeRateMap): ExchangeRateHistory {
  const previous = loadExchangeRateHistory();
  const next: ExchangeRateHistory = { ...previous };

  QUOTED_TRAVEL_CURRENCIES.forEach((code) => {
    const rate = rates[code];
    if (!rate || !Number.isFinite(rate.rate)) return;

    const timestamp = new Date(rate.updatedAt).getTime();
    const nextPoint: QuoteHistoryPoint = {
      rate: rate.rate,
      timestamp: Number.isFinite(timestamp) ? timestamp : Date.now(),
      code,
    };
    const history = [...(previous[code] ?? []), nextPoint]
      .filter(
        (point, index, list) =>
          list.findIndex((candidate) => candidate.timestamp === point.timestamp) === index,
      )
      .slice(-20);

    next[code] = history;
  });

  if (storageAvailable()) {
    localStorage.setItem(EXCHANGE_RATES_HISTORY_STORAGE_KEY, JSON.stringify(next));
  }

  return next;
}

export function getRateForCurrency(currency: TravelCurrencyCode | undefined, rates: ExchangeRateMap) {
  if (!currency || currency === 'BRL') return 1;
  return rates[currency]?.rate ?? null;
}

const exchangeRateToQuote = (rate: ExchangeRate | undefined): CurrencyQuote | null => {
  if (!rate) return null;
  return {
    bid: rate.rate,
    pctChange: rate.variation,
    timestamp: new Date(rate.updatedAt).getTime(),
  };
};

export async function fetchEuroToBrlQuote(): Promise<CurrencyQuote> {
  return exchangeRateToQuote(await getExchangeRate('EUR-BRL')) as CurrencyQuote;
}

export function loadStoredQuote(): CurrencyQuote | null {
  return exchangeRateToQuote(getCachedExchangeRates().EUR);
}

export function saveStoredQuote(quote: CurrencyQuote) {
  saveCachedExchangeRates({
    EUR: {
      code: 'EUR',
      name: currencyNames.EUR,
      rate: quote.bid,
      variation: quote.pctChange,
      updatedAt: new Date(quote.timestamp).toISOString(),
      status: 'cached',
    },
  });
}

export function loadQuoteHistory(): QuoteHistoryPoint[] {
  return loadExchangeRateHistory().EUR ?? [];
}

export function appendQuoteHistory(quote: CurrencyQuote): QuoteHistoryPoint[] {
  const history = appendExchangeRateHistory({
    EUR: {
      code: 'EUR',
      name: currencyNames.EUR,
      rate: quote.bid,
      variation: quote.pctChange,
      updatedAt: new Date(quote.timestamp).toISOString(),
      status: 'live',
    },
  });

  return history.EUR ?? [];
}
