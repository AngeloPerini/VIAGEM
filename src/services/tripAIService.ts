import type {
  Attraction,
  CountryId,
  CurrencyRange,
  Expense,
  ItineraryActivityTaskInput,
  ItineraryItem,
  ItineraryType,
  LinkItem,
  TripAIDocument,
  TripAIInput,
  TripAIPlan,
  TripAIRoute,
  TripAIReviewState,
  TripStyle,
  TravelCurrencyCode,
} from '../types';
import { countryLabel, normalizeCountryId } from '../data/countries';
import { assertValidDateRange } from '../utils/dateRange';
import { getTodayDateInputValue, isAccommodationCategory, toDateInputValue } from '../utils/expenseDates';
import { normalizeLinks } from '../utils/links';
import { supabase } from './supabaseClient';

const REVIEW_STORAGE_KEY = 'controle-viagem-ai-review-v1';
export type TripAIGenerationStrategy = 'auto' | 'single' | 'staged' | 'summary';

type GenerateTripPlanOptions = {
  strategy?: TripAIGenerationStrategy;
};

const validTypes: ItineraryType[] = [
  'arrival',
  'lodging',
  'tour',
  'transport',
  'food',
  'flight',
  'train',
  'motorhome',
  'shopping',
  'document',
  'rest',
  'other',
];

const categoryAliases: Record<string, string> = {
  hospedagem: 'lodging',
  hospedagens: 'lodging',
  lodging: 'lodging',
  transporte: 'transport',
  transportes: 'transport',
  transport: 'transport',
  passeio: 'tours',
  passeios: 'tours',
  tours: 'tours',
  tour: 'tours',
  alimentacao: 'Alimentação',
  alimentação: 'Alimentação',
  comida: 'Alimentação',
  compras: 'Comprinhas',
  comprinhas: 'Comprinhas',
  shopping: 'Comprinhas',
  documento: 'Documentos',
  documentos: 'Documentos',
  document: 'Documentos',
  seguro: 'Seguro',
  insurance: 'Seguro',
  outros: 'Outros',
  other: 'Outros',
  others: 'Outros',
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? value as Record<string, unknown> : {};

const asString = (value: unknown, fallback = '') =>
  typeof value === 'string' ? value.trim() : value == null ? fallback : String(value).trim();

const asArray = <T>(value: unknown): T[] => (Array.isArray(value) ? value as T[] : []);

type TripAIFunctionErrorOptions = {
  status?: number;
  code?: string;
  body?: unknown;
};

export class TripAIFunctionError extends Error {
  status?: number;
  code?: string;
  body?: unknown;

  constructor(message: string, options?: TripAIFunctionErrorOptions) {
    super(message);
    this.name = 'TripAIFunctionError';
    this.status = options?.status;
    this.code = options?.code;
    this.body = options?.body;
  }
}

export type ApplyTripPlanResult = {
  activityTasks?: {
    attempted: number;
    created: number;
    failed: boolean;
    errorMessage?: string;
  };
  documents: {
    attempted: number;
    created: number;
    skipped: number;
    failed: boolean;
    errorMessage?: string;
  };
};

const stripDiacritics = (value: string) =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const normalizeCountry = (value: unknown): CountryId => normalizeCountryId(asString(value, 'international'));

const normalizeKeyPart = (value: unknown) =>
  stripDiacritics(asString(value))
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const parseDateOnly = (value?: string) => {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) ? null : date;
};

export const getTripAIDayCount = (input: Pick<TripAIInput, 'startDate' | 'endDate'>) => {
  const start = parseDateOnly(input.startDate);
  const end = parseDateOnly(input.endDate);
  if (!start || !end || end < start) return 1;
  return Math.max(1, Math.floor((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1);
};

export const getTripAIExpectedActivityCount = (input: Pick<TripAIInput, 'startDate' | 'endDate'>) =>
  getTripAIDayCount(input) * (getTripAIDayCount(input) > 15 ? 3 : 4);

export const isLargeTripAIInput = (input: Pick<TripAIInput, 'countries' | 'description' | 'startDate' | 'endDate'>) => {
  const countriesCount = input.countries.length;
  const tripDays = getTripAIDayCount(input);
  const expectedActivities = getTripAIExpectedActivityCount(input);
  const estimatedPromptSize = JSON.stringify({
    countries: input.countries,
    description: input.description,
    startDate: input.startDate,
    endDate: input.endDate,
  }).length + countriesCount * 600 + tripDays * 160;

  return countriesCount > 3 || tripDays > 12 || expectedActivities > 20 || estimatedPromptSize > 18_000;
};

const normalizeType = (value: unknown): ItineraryType => {
  const normalized = stripDiacritics(asString(value));
  if (validTypes.includes(normalized as ItineraryType)) return normalized as ItineraryType;
  if (normalized.includes('motorhome') || normalized.includes('trailer') || normalized.includes('rv')) return 'motorhome';
  if (normalized.includes('compr') || normalized.includes('shopping')) return 'shopping';
  if (normalized.includes('document') || normalized.includes('passaport') || normalized.includes('visto')) return 'document';
  if (normalized.includes('hotel') || normalized.includes('hosped')) return 'lodging';
  if (normalized.includes('trem')) return 'train';
  if (normalized.includes('voo') || normalized.includes('flight')) return 'flight';
  if (normalized.includes('trans')) return 'transport';
  if (
    normalized.includes('comida') ||
    normalized.includes('aliment') ||
    normalized.includes('almoco') ||
    normalized.includes('jantar') ||
    normalized.includes('cafe')
  ) return 'food';
  if (normalized.includes('chegada')) return 'arrival';
  if (normalized.includes('descanso')) return 'rest';
  if (normalized.includes('outro')) return 'other';
  return 'tour';
};

const normalizeCategory = (value: unknown) => {
  const raw = asString(value, 'Outros');
  return categoryAliases[stripDiacritics(raw)] ?? raw;
};

const normalizeRange = (value: unknown): CurrencyRange => {
  const record = asRecord(value);
  const min = Number(record.min ?? record.value ?? 0);
  const max = Number(record.max ?? record.value ?? min);
  return {
    min: Number.isFinite(min) ? min : 0,
    max: Number.isFinite(max) ? max : Number.isFinite(min) ? min : 0,
  };
};

const normalizeCurrencyCode = (value: unknown): TravelCurrencyCode => {
  const code = asString(value, 'EUR').toUpperCase();
  return ['BRL', 'EUR', 'USD', 'JPY', 'CHF', 'GBP'].includes(code)
    ? code as TravelCurrencyCode
    : 'EUR';
};

const getDefaultCurrencyForCountry = (country: CountryId): TravelCurrencyCode => {
  const normalized = normalizeCountry(country);
  if (['england', 'scotland', 'united_kingdom', 'great_britain'].includes(normalized)) return 'GBP';
  if (normalized === 'switzerland') return 'CHF';
  if (normalized === 'japan') return 'JPY';
  if (normalized === 'united_states') return 'USD';
  if (normalized === 'brazil') return 'BRL';
  return 'EUR';
};

const normalizeLinkArray = (value: unknown): LinkItem[] => normalizeLinks(asArray<LinkItem>(value));

const normalizeDocument = (value: unknown): TripAIDocument => {
  if (typeof value === 'string') return { title: value, detail: '', required: true, category: 'Documentos' };
  const record = asRecord(value);
  return {
    title: asString(record.title || record.name, 'Documento'),
    detail: asString(record.detail || record.description || record.notes),
    required: record.required === undefined ? true : Boolean(record.required),
    category: asString(record.category, 'Documentos') || 'Documentos',
  };
};

const normalizeRoute = (value: unknown): TripAIRoute => {
  const record = asRecord(value);
  return {
    from: asString(record.from, 'Origem'),
    to: asString(record.to, 'Destino'),
    transport: asString(record.transport, 'Transporte sugerido'),
    duration: asString(record.duration),
    estimatedCost: asString(record.estimatedCost || record.estimated_cost || record.cost || record.value),
    notes: asString(record.notes),
  };
};

const genericPlaceholderPatterns = [
  /ponto\s+tur[ií]stico\s+principal/i,
  /ponto\s+tur[ií]stico$/i,
  /atra[cç][aã]o\s+principal/i,
  /atra[cç][aã]o\s+local/i,
  /atividade\s+cultural/i,
  /atividade\s+sugerida/i,
  /cidade\s+escolhida/i,
  /regi[aã]o\s+escolhida/i,
  /ponto\s+importante/i,
  /passeio\s+importante/i,
  /destino\s+principal/i,
  /local\s+importante/i,
  /local\s+famoso\s+da\s+cidade/i,
  /visite\s+a\s+regi[aã]o\s+escolhida/i,
  /international\s*->/i,
];

const isGenericPlaceholderText = (value: unknown) => {
  const text = asString(value);
  return Boolean(text) && genericPlaceholderPatterns.some((pattern) => pattern.test(text));
};

const genericTaskPatterns = [
  /se preparar/i,
  /organizar coisas/i,
  /confirmar tudo/i,
  /pesquisar local/i,
  /fazer atividade/i,
  /preparar atividade/i,
];

const normalizeActivityTaskInputs = (value: unknown): ItineraryActivityTaskInput[] => {
  const seen = new Set<string>();

  return asArray<unknown>(value)
    .map((task): ItineraryActivityTaskInput | null => {
      const record = asRecord(task);
      const title = asString(record.title || record.name || record.task || record.description).trim().slice(0, 120);
      const description = asString(record.description || record.detail || record.notes).trim();
      const normalizedTitle = normalizeKeyPart(title);

      if (!title || !normalizedTitle) return null;
      if (isGenericPlaceholderText(title) || genericTaskPatterns.some((pattern) => pattern.test(title))) return null;
      if (seen.has(normalizedTitle)) return null;
      seen.add(normalizedTitle);

      return {
        title,
        description: description && description !== title ? description : undefined,
        isCompleted: false,
        source: 'ai' as const,
      };
    })
    .filter((task): task is ItineraryActivityTaskInput => task !== null)
    .slice(0, 5);
};

const normalizeItineraryItem = (value: unknown): ItineraryItem => {
  const record = asRecord(value);
  return {
    id: crypto.randomUUID(),
    day: asString(record.day, 'Dia da viagem'),
    country: normalizeCountry(record.country),
    city: asString(record.city),
    time: asString(record.time),
    title: asString(record.title, 'Atividade sugerida'),
    description: asString(record.description),
    type: normalizeType(record.type),
    completed: false,
    links: normalizeLinkArray(record.links),
    tasks: normalizeActivityTaskInputs(record.tasks || record.checklist || record.subtasks || record.activity_tasks),
  };
};

const normalizeExpense = (value: unknown): Expense => {
  const record = asRecord(value);
  const detail = asString(record.detail || record.details, 'Valor aproximado planejado.');
  const country = normalizeCountry(record.country);
  const category = normalizeCategory(record.category);
  const currency = normalizeCurrencyCode(record.currency || getDefaultCurrencyForCountry(country));
  const rawEuro = normalizeRange(record.euro);
  const rawReal = normalizeRange(record.real || record.brl);
  const amount = Number(record.amount ?? record.value ?? (currency === 'BRL' ? rawReal.min : rawEuro.min));
  const parsedAmount = Number.isFinite(amount) ? amount : 0;
  const euro = rawEuro.min || rawEuro.max || currency !== 'EUR'
    ? rawEuro
    : { min: parsedAmount, max: parsedAmount };
  const real = rawReal.min || rawReal.max || currency !== 'BRL'
    ? rawReal
    : { min: parsedAmount, max: parsedAmount };

  return {
    id: crypto.randomUUID(),
    category,
    country,
    title: asString(record.title || record.description, 'Gasto planejado'),
    detail: detail.toLowerCase().includes('aproxim') ? detail : `${detail} Aproximado / planejado.`,
    currency,
    amount: parsedAmount,
    euro,
    real,
    links: normalizeLinkArray(record.links),
    isPaid: false,
    paidAt: null,
    expenseDate: toDateInputValue(record.expense_date as string | null)
      || toDateInputValue(record.expenseDate as string | null)
      || toDateInputValue(record.date as string | null)
      || toDateInputValue(record.spent_at as string | null)
      || null,
    checkInDate: toDateInputValue(record.check_in_date as string | null)
      || toDateInputValue(record.checkInDate as string | null)
      || toDateInputValue(record.checkin as string | null)
      || toDateInputValue(record.start_date as string | null)
      || null,
    checkOutDate: toDateInputValue(record.check_out_date as string | null)
      || toDateInputValue(record.checkOutDate as string | null)
      || toDateInputValue(record.checkout as string | null)
      || toDateInputValue(record.end_date as string | null)
      || null,
  };
};

const normalizeAttraction = (value: unknown): Attraction => {
  const record = asRecord(value);
  return {
    id: crypto.randomUUID(),
    name: asString(record.name || record.title, 'Ponto turistico'),
    country: normalizeCountry(record.country),
    city: asString(record.city),
    day: asString(record.day),
    time: asString(record.time),
    description: asString(record.description),
    links: normalizeLinkArray(record.links),
  };
};

const itineraryItemKey = (item: Pick<ItineraryItem, 'day' | 'time' | 'title' | 'country' | 'city'>) =>
  [
    normalizeKeyPart(item.day),
    normalizeKeyPart(item.time),
    normalizeKeyPart(item.title),
    normalizeCountry(item.country),
    normalizeKeyPart(item.city),
  ].join('|');

const attractionKey = (attraction: Pick<Attraction, 'name' | 'country' | 'city'>) =>
  [
    normalizeKeyPart(attraction.name),
    normalizeCountry(attraction.country),
    normalizeKeyPart(attraction.city),
  ].join('|');

const expenseKey = (
  expense: Pick<Expense, 'category' | 'country'> & {
    title?: string | null;
    detail?: string | null;
    description?: string | null;
    details?: string | null;
    currency?: string | null;
    amount?: number | null;
    expenseDate?: string | null;
    checkInDate?: string | null;
    checkOutDate?: string | null;
    expense_date?: string | null;
    check_in_date?: string | null;
    check_out_date?: string | null;
  },
) =>
  [
    normalizeKeyPart(expense.category),
    normalizeCountry(expense.country),
    normalizeKeyPart(expense.title ?? expense.description),
    normalizeKeyPart(expense.detail ?? expense.details),
    asString(expense.currency),
    String(Math.round(Number(expense.amount ?? 0))),
    toDateInputValue(expense.expenseDate ?? expense.expense_date ?? ''),
    toDateInputValue(expense.checkInDate ?? expense.check_in_date ?? ''),
    toDateInputValue(expense.checkOutDate ?? expense.check_out_date ?? ''),
  ].join('|');

const uniqueByKey = <T>(items: T[], getKey: (item: T) => string) => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = getKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const documentTitleKey = (value: unknown) => {
  const key = normalizeKeyPart(value);
  if (!key) return '';
  if (key.includes('passaport')) return 'passaporte';
  if (key.includes('seguro') && (key.includes('viagem') || key.includes('travel'))) return 'seguro viagem';
  if (key.includes('hosped') || key.includes('hotel') || key.includes('reserva hospedagem')) return 'comprovante hospedagem';
  if (key.includes('comprovante') && (key.includes('financeiro') || key.includes('fundos') || key.includes('renda'))) return 'comprovante financeiro';
  if (key.includes('passagem') && (key.includes('retorno') || key.includes('volta'))) return 'passagem retorno';
  if (key.includes('esim') || key.includes('chip') || key.includes('sim internacional')) return 'esim chip internacional';
  if (key.includes('etias')) return 'etias';
  if (key.includes('visto') || key.includes('visa')) return 'visto';
  if (key.includes('cnh') || key.includes('pid') || key.includes('permissao internacional')) return 'permissao internacional dirigir';
  return key;
};

export const dedupeItineraryItems = (items: ItineraryItem[]) =>
  uniqueByKey(items, itineraryItemKey);

export const dedupeAttractions = (items: Attraction[]) =>
  uniqueByKey(items, attractionKey);

export const dedupeExpenses = (items: Expense[]) =>
  uniqueByKey(items, expenseKey);

const dedupeDocuments = (items: TripAIDocument[]) =>
  uniqueByKey(items, (document) => documentTitleKey(document.title));

const getAllowedCountryIds = (countries: string[]) =>
  new Set(countries.map((country) => normalizeCountry(country)).filter((country) => country !== 'international'));

const transportText = (value: {
  type?: string | null;
  category?: string | null;
  title?: string | null;
  detail?: string | null;
  description?: string | null;
}) =>
  stripDiacritics([
    value.type,
    value.category,
    value.title,
    value.detail,
    value.description,
  ].map((part) => asString(part)).join(' '));

const looksLikeInternationalTransport = (value: {
  type?: string | null;
  category?: string | null;
  title?: string | null;
  detail?: string | null;
  description?: string | null;
}) => {
  const text = transportText(value);
  const hasTransportSignal = ['voo', 'flight', 'aereo', 'aerea', 'transporte', 'transport']
    .some((keyword) => text.includes(keyword));
  const hasInternationalSignal = ['internacional', 'international', 'brasil', 'brazil', 'partida', 'origem', 'saida', 'saindo']
    .some((keyword) => text.includes(keyword));

  return hasTransportSignal && hasInternationalSignal;
};

const scopePlanToAllowedCountries = (plan: TripAIPlan, allowedCountries: string[]): TripAIPlan => {
  const allowed = getAllowedCountryIds(allowedCountries);

  const itineraryItems = plan.itinerary_items.flatMap((item) => {
    const country = normalizeCountry(item.country);
    if (allowed.has(country)) return [{ ...item, country }];
    if (looksLikeInternationalTransport(item)) return [{ ...item, country: 'international' }];
    return [];
  });

  const expenses = plan.expenses.flatMap((expense) => {
    const country = normalizeCountry(expense.country);
    if (allowed.has(country)) return [{ ...expense, country }];
    if (looksLikeInternationalTransport(expense)) return [{ ...expense, country: 'international' }];
    return [];
  });

  const attractions = plan.attractions.flatMap((attraction) => {
    const country = normalizeCountry(attraction.country);
    return allowed.has(country) ? [{ ...attraction, country }] : [];
  });

  return {
    ...plan,
    itinerary_items: dedupeItineraryItems(itineraryItems),
    expenses: dedupeExpenses(expenses),
    attractions: dedupeAttractions(attractions),
  };
};

export const normalizeTripAIPlan = (value: unknown): TripAIPlan => {
  const record = asRecord(value);
  const warnings = asArray<unknown>(record.warnings).map((warning) => asString(warning)).filter(Boolean);
  const requiredWarning = 'Confirme as exigencias oficiais antes da viagem.';

  return {
    generationId: asString(record.generationId) || undefined,
    generationMode: asString(record.generationMode || record.generation_mode) || undefined,
    largeTrip: record.largeTrip === undefined && record.large_trip === undefined
      ? undefined
      : Boolean(record.largeTrip ?? record.large_trip),
    intentSummary: asString(record.intentSummary || record.intent_summary || record.interpreted_intent) || undefined,
    summary: asString(record.summary, 'Previa de viagem gerada com IA.'),
    documents: asArray<unknown>(record.documents).map(normalizeDocument),
    routes: asArray<unknown>(record.routes).map(normalizeRoute),
    itinerary_items: dedupeItineraryItems(asArray<unknown>(record.itinerary_items).map(normalizeItineraryItem)),
    expenses: dedupeExpenses(asArray<unknown>(record.expenses).map(normalizeExpense)),
    attractions: dedupeAttractions(asArray<unknown>(record.attractions).map(normalizeAttraction)),
    warnings: warnings.some((warning) => stripDiacritics(warning).includes('exigencias oficiais'))
      ? warnings
      : [...warnings, requiredWarning],
  };
};

const withExpenseDateDefaults = (
  plan: TripAIPlan,
  tripStartDate?: string,
  tripEndDate?: string,
): TripAIPlan => ({
  ...plan,
  expenses: plan.expenses.map((expense) => {
    const isAccommodation = isAccommodationCategory(expense.category);
    const expenseDate = toDateInputValue(expense.expenseDate)
      || (isAccommodation ? toDateInputValue(tripStartDate) : '')
      || getTodayDateInputValue();

    return {
      ...expense,
      expenseDate,
      checkInDate: expense.checkInDate
        || (isAccommodation ? toDateInputValue(tripStartDate) || null : null),
      checkOutDate: expense.checkOutDate
        || (isAccommodation ? toDateInputValue(tripEndDate) || null : null),
    };
  }),
});

const getItineraryDayNumber = (day: unknown) => {
  const text = asString(day);
  const match = /(?:dia|day)\s*(\d{1,3})/i.exec(text) ?? /^(\d{1,3})(?:\D|$)/.exec(text);
  const dayNumber = Number(match?.[1]);
  return Number.isFinite(dayNumber) && dayNumber > 0 ? dayNumber : null;
};

const formatDateOnly = (date: Date) => date.toISOString().slice(0, 10);

const addDays = (date: Date, days: number) =>
  new Date(date.getTime() + days * 24 * 60 * 60 * 1000);

const getTripAIDateForDay = (input: Pick<TripAIInput, 'startDate'>, dayNumber: number) => {
  const start = parseDateOnly(input.startDate);
  if (!start) return '';
  return formatDateOnly(addDays(start, Math.max(0, dayNumber - 1)));
};

const genericExpenseTitlePatterns = [
  /transporte\s+local$/i,
  /transporte\s+di[aá]rio$/i,
  /hospedagem\s+base$/i,
  /hospedagem\s+di[aá]ria$/i,
  /alimenta[cç][aã]o\s+base$/i,
  /passeio\s+base$/i,
  /estimativa\s+gen[eé]rica$/i,
  /custo\s+m[eé]dio$/i,
  /despesa\s+geral$/i,
  /gasto\s+estimado$/i,
  /outros\s+gastos$/i,
  /gasto\s+da\s+viagem$/i,
  /ingressos\s+e\s+experi[eê]ncias$/i,
  /alimenta[cç][aã]o\s+di[aá]ria$/i,
  /reserva\s+para\s+imprevistos$/i,
];

const isGenericExpenseTitle = (value: unknown) => {
  const title = asString(value);
  return Boolean(title) && genericExpenseTitlePatterns.some((pattern) => pattern.test(title));
};

const getExpenseText = (expense: Pick<Expense, 'category' | 'title'> & { detail?: string | null }) =>
  stripDiacritics([expense.category, expense.title, expense.detail].map((part) => asString(part)).join(' '));

const isTransportExpense = (expense: Pick<Expense, 'category' | 'title'> & { detail?: string | null }) => {
  const text = getExpenseText(expense);
  return normalizeKeyPart(expense.category).includes('transporte') ||
    ['trem', 'metro', 'metr', 'taxi', 'uber', 'voo', 'onibus', 'traslado', 'transfer', 'ferry']
      .some((term) => text.includes(term));
};

const isFoodExpense = (expense: Pick<Expense, 'category' | 'title'> & { detail?: string | null }) => {
  const text = getExpenseText(expense);
  return normalizeKeyPart(expense.category).includes('aliment') ||
    ['almoco', 'jantar', 'cafe', 'restaurante'].some((term) => text.includes(term));
};

const isTourExpense = (expense: Pick<Expense, 'category' | 'title'> & { detail?: string | null }) => {
  const text = getExpenseText(expense);
  return normalizeKeyPart(expense.category).includes('passeio') ||
    ['ingresso', 'museu', 'tour', 'atracao', 'bilhete'].some((term) => text.includes(term));
};

const hashText = (value: string) =>
  [...value].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) % 9973, 17);

const varyAmount = (baseAmount: number, seed: string, minimum = 1) => {
  const factor = 0.88 + (hashText(seed) % 29) / 100;
  return Math.max(minimum, Math.round(baseAmount * factor));
};

const getStyleBaseAmounts = (style: TripStyle) => {
  if (style === 'confortavel') return { lodgingNight: 190, localTransportDay: 32, foodDay: 76, activity: 34, route: 85 };
  if (style === 'economica') return { lodgingNight: 75, localTransportDay: 12, foodDay: 30, activity: 16, route: 42 };
  return { lodgingNight: 120, localTransportDay: 20, foodDay: 48, activity: 24, route: 58 };
};

const getCountryCostFactor = (country: CountryId | string | undefined) => {
  const normalized = normalizeCountry(country);
  if (normalized === 'switzerland') return 1.45;
  if (['england', 'scotland', 'united_kingdom', 'great_britain'].includes(normalized)) return 1.2;
  if (normalized === 'japan') return 1.1;
  if (normalized === 'brazil') return 0.65;
  return 1;
};

type ExpenseStaySegment = {
  country: CountryId;
  city: string;
  startDay: number;
  endDay: number;
  startDate: string;
  checkOutDate: string;
  nights: number;
  days: number;
};

const getExpenseStaySegments = (input: TripAIInput, itineraryItems: ItineraryItem[]): ExpenseStaySegment[] => {
  const tripDays = getTripAIDayCount(input);
  const byDay = new Map<number, ItineraryItem[]>();

  itineraryItems.forEach((item) => {
    const dayNumber = getItineraryDayNumber(item.day);
    if (!dayNumber) return;
    byDay.set(dayNumber, [...(byDay.get(dayNumber) ?? []), item]);
  });

  const segments: ExpenseStaySegment[] = [];

  for (let day = 1; day <= tripDays; day += 1) {
    const items = (byDay.get(day) ?? [])
      .filter((item) => normalizeCountry(item.country) !== 'international')
      .sort((a, b) => asString(a.time).localeCompare(asString(b.time)));
    const representative = items.find((item) => item.city) ?? items[0];
    const country = normalizeCountry(representative?.country ?? input.countries[(day - 1) % Math.max(1, input.countries.length)] ?? input.countries[0]);
    const city = representative?.city || countryLabel(country);
    const previous = segments.at(-1);

    if (previous && previous.country === country && normalizeKeyPart(previous.city) === normalizeKeyPart(city)) {
      previous.endDay = day;
      previous.days = previous.endDay - previous.startDay + 1;
      previous.nights = Math.max(1, previous.endDay - previous.startDay);
      previous.checkOutDate = getTripAIDateForDay(input, previous.startDay + previous.nights);
      continue;
    }

    segments.push({
      country,
      city,
      startDay: day,
      endDay: day,
      startDate: getTripAIDateForDay(input, day),
      checkOutDate: getTripAIDateForDay(input, day + 1),
      nights: 1,
      days: 1,
    });
  }

  return segments;
};

const findStayForExpense = (input: TripAIInput, stays: ExpenseStaySegment[], expense: Expense) => {
  const text = normalizeKeyPart(`${expense.title} ${expense.detail ?? ''}`);
  const country = normalizeCountry(expense.country);
  const byText = stays.find((stay) =>
    text.includes(normalizeKeyPart(stay.city)) || stay.country === country,
  );
  if (byText) return byText;

  const date = toDateInputValue(expense.expenseDate) || toDateInputValue(expense.checkInDate);
  if (date) {
    const start = parseDateOnly(input.startDate);
    const current = parseDateOnly(date);
    if (start && current) {
      const day = Math.max(1, Math.min(getTripAIDayCount(input), Math.floor((current.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1));
      return stays.find((stay) => day >= stay.startDay && day <= stay.endDay) ?? stays[0];
    }
  }

  return stays[0];
};

const findActivityForExpense = (itineraryItems: ItineraryItem[], stay: ExpenseStaySegment, expense: Expense) => {
  const date = toDateInputValue(expense.expenseDate) || stay.startDate;
  const text = normalizeKeyPart(`${expense.title} ${expense.detail ?? ''}`);

  return itineraryItems.find((item) =>
    item.type === 'tour' &&
    (item.day.includes(date) || normalizeKeyPart(item.city) === normalizeKeyPart(stay.city)) &&
    (text.includes(normalizeKeyPart(item.title)) || normalizeKeyPart(item.title).includes(text) || normalizeKeyPart(item.city) === normalizeKeyPart(stay.city))
  ) ?? itineraryItems.find((item) => item.type === 'tour' && normalizeKeyPart(item.city) === normalizeKeyPart(stay.city));
};

const getExpenseFamilyKey = (expense: Expense) => {
  const title = normalizeKeyPart(expense.title);
  const date = toDateInputValue(expense.expenseDate);
  const checkIn = toDateInputValue(expense.checkInDate);
  const checkOut = toDateInputValue(expense.checkOutDate);

  if (isAccommodationCategory(expense.category)) {
    return ['hospedagem', normalizeCountry(expense.country), title, checkIn, checkOut].join('|');
  }

  if (isTransportExpense(expense)) {
    const isRoute = /->|→/.test(expense.title);
    return isRoute
      ? ['transporte-rota', normalizeCountry(expense.country), title, date].join('|')
      : ['transporte-local', normalizeCountry(expense.country), title].join('|');
  }

  if (isTourExpense(expense)) {
    return ['passeio', normalizeCountry(expense.country), title].join('|');
  }

  return expenseKey(expense);
};

const buildFallbackAIExpenses = (input: TripAIInput, itineraryItems: ItineraryItem[]) => {
  const stays = getExpenseStaySegments(input, itineraryItems);
  const baseAmounts = getStyleBaseAmounts(input.style);
  const stayExpenses = stays.flatMap((stay) => {
    const currency = getDefaultCurrencyForCountry(stay.country);
    const factor = getCountryCostFactor(stay.country);

    return [
      normalizeExpense({
        category: 'Hospedagem',
        title: `Hospedagem em ${stay.city}`,
        detail: `${stay.nights} ${stay.nights === 1 ? 'noite' : 'noites'} em ${stay.city}. Estimativa sugerida pela IA.`,
        country: stay.country,
        currency,
        amount: varyAmount(baseAmounts.lodgingNight * factor * stay.nights, `lodging-${stay.city}-${stay.startDate}`, 20),
        expense_date: stay.startDate,
        check_in_date: stay.startDate,
        check_out_date: stay.checkOutDate,
      }),
      normalizeExpense({
        category: 'Transporte',
        title: `Transporte urbano em ${stay.city}`,
        detail: `Metrô, ônibus ou táxi durante ${stay.days} ${stay.days === 1 ? 'dia' : 'dias'} em ${stay.city}.`,
        country: stay.country,
        currency,
        amount: varyAmount(baseAmounts.localTransportDay * factor * stay.days, `local-${stay.city}-${stay.startDate}`, 5),
        expense_date: stay.startDate,
      }),
      normalizeExpense({
        category: 'Alimentacao',
        title: `Alimentação em ${stay.city}`,
        detail: `Cafés, almoços e jantares durante ${stay.days} ${stay.days === 1 ? 'dia' : 'dias'} em ${stay.city}.`,
        country: stay.country,
        currency,
        amount: varyAmount(baseAmounts.foodDay * factor * stay.days, `food-${stay.city}-${stay.startDate}`, 8),
        expense_date: stay.startDate,
      }),
    ];
  });
  const tourExpenses = itineraryItems
    .filter((item) => item.type === 'tour')
    .slice(0, 8)
    .map((item) => {
      const dayNumber = getItineraryDayNumber(item.day) ?? 1;
      const country = normalizeCountry(item.country);
      const city = item.city || countryLabel(country);
      const date = getTripAIDateForDay(input, dayNumber);

      return normalizeExpense({
        category: 'Passeios',
        title: `Ingresso ${item.title.replace(/^visita\s+a\s+/i, '').replace(/^passeio\s+por\s+/i, '')}`,
        detail: `Atividade em ${city} prevista para ${date}. Estimativa sugerida pela IA.`,
        country,
        currency: getDefaultCurrencyForCountry(country),
        amount: varyAmount(getStyleBaseAmounts(input.style).activity * getCountryCostFactor(country), `${item.title}-${date}`, 5),
        expense_date: date,
      });
    });

  return [...stayExpenses, ...tourExpenses];
};

const sanitizeTripAIExpenses = (plan: TripAIPlan, input: TripAIInput): TripAIPlan => {
  const stays = getExpenseStaySegments(input, plan.itinerary_items);
  const baseAmounts = getStyleBaseAmounts(input.style);
  const cleaned = plan.expenses.flatMap((expense) => {
    const stay = findStayForExpense(input, stays, expense);
    if (!stay) return [];

    const genericTitle = isGenericExpenseTitle(expense.title) || isGenericPlaceholderText(expense.title) || isGenericPlaceholderText(expense.detail);
    const factor = getCountryCostFactor(stay.country);
    const currency = expense.currency ?? getDefaultCurrencyForCountry(stay.country);

    if (isAccommodationCategory(expense.category)) {
      return [{
        ...expense,
        category: 'Hospedagem',
        country: stay.country,
        title: `Hospedagem em ${stay.city}`,
        detail: `${stay.nights} ${stay.nights === 1 ? 'noite' : 'noites'} em ${stay.city}. ${expense.detail || 'Estimativa sugerida pela IA.'}`,
        currency,
        amount: varyAmount(baseAmounts.lodgingNight * factor * stay.nights, `lodging-${stay.city}-${stay.startDate}`, 20),
        expenseDate: stay.startDate,
        checkInDate: stay.startDate,
        checkOutDate: stay.checkOutDate,
      }];
    }

    if (isTransportExpense(expense)) {
      const hasRouteTitle = /->|→|\b(trem|voo|ônibus|onibus|traslado|transfer|ferry)\b/i.test(expense.title);
      const title = genericTitle || !hasRouteTitle
        ? `Transporte urbano em ${stay.city}`
        : expense.title.replace(/\s*→\s*/g, ' -> ');

      return [{
        ...expense,
        category: 'Transporte',
        country: stay.country,
        title,
        detail: hasRouteTitle
          ? `${expense.detail || 'Deslocamento previsto no roteiro.'} Estimativa sugerida pela IA.`
          : `Metrô, ônibus ou táxi durante a estadia em ${stay.city}. Estimativa consolidada por cidade.`,
        currency,
        amount: hasRouteTitle && expense.amount && expense.amount > 0
          ? expense.amount
          : varyAmount((hasRouteTitle ? baseAmounts.route : baseAmounts.localTransportDay * stay.days) * factor, `${title}-${stay.startDate}`, 5),
        expenseDate: hasRouteTitle ? toDateInputValue(expense.expenseDate) || stay.startDate : stay.startDate,
        checkInDate: null,
        checkOutDate: null,
      }];
    }

    if (isFoodExpense(expense)) {
      return [{
        ...expense,
        category: 'Alimentacao',
        country: stay.country,
        title: genericTitle ? `Alimentação em ${stay.city}` : expense.title,
        detail: `Estimativa de refeições durante ${stay.days} ${stay.days === 1 ? 'dia' : 'dias'} em ${stay.city}.`,
        currency,
        amount: expense.amount && expense.amount > 0
          ? expense.amount
          : varyAmount(baseAmounts.foodDay * factor * stay.days, `food-${stay.city}-${stay.startDate}`, 8),
        expenseDate: stay.startDate,
        checkInDate: null,
        checkOutDate: null,
      }];
    }

    if (isTourExpense(expense)) {
      const activity = genericTitle ? findActivityForExpense(plan.itinerary_items, stay, expense) : null;
      const activityTitle = activity?.title.replace(/^visita\s+a\s+/i, '').replace(/^passeio\s+por\s+/i, '');
      const title = genericTitle && activityTitle ? `Ingresso ${activityTitle}` : expense.title;
      if (!title || isGenericExpenseTitle(title)) return [];
      const dayNumber = activity ? getItineraryDayNumber(activity.day) ?? stay.startDay : stay.startDay;
      const date = toDateInputValue(expense.expenseDate) || getTripAIDateForDay(input, dayNumber);

      return [{
        ...expense,
        category: 'Passeios',
        country: stay.country,
        title,
        detail: activityTitle
          ? `Atividade em ${stay.city} prevista para ${date}. Estimativa sugerida pela IA.`
          : expense.detail || `Passeio previsto em ${stay.city}. Estimativa sugerida pela IA.`,
        currency,
        amount: expense.amount && expense.amount > 0
          ? expense.amount
          : varyAmount(baseAmounts.activity * factor, `${title}-${date}`, 5),
        expenseDate: date,
        checkInDate: null,
        checkOutDate: null,
      }];
    }

    if (genericTitle) return [];

    return [{
      ...expense,
      country: normalizeCountry(expense.country) || stay.country,
      amount: expense.amount && expense.amount > 0 ? expense.amount : varyAmount(45 * factor, `${expense.title}-${stay.city}`, 5),
      expenseDate: toDateInputValue(expense.expenseDate) || stay.startDate,
    }];
  });
  const fallbackExpenses = buildFallbackAIExpenses(input, plan.itinerary_items);
  const activityFallbackExpenses = fallbackExpenses.filter((expense) => isTourExpense(expense));
  const cleanedWithActivities = [
    ...cleaned,
    ...activityFallbackExpenses.filter((activityExpense) => {
      const key = normalizeKeyPart(activityExpense.title);
      return !cleaned.some((expense) => {
        const existingKey = normalizeKeyPart(expense.title);
        return existingKey.includes(key) || key.includes(existingKey);
      });
    }),
  ];
  const merged = cleanedWithActivities.length >= Math.min(5, Math.max(3, input.countries.length))
    ? cleanedWithActivities
    : [...cleanedWithActivities, ...fallbackExpenses];

  return {
    ...plan,
    expenses: uniqueByKey(
      merged
        .filter((expense) => expense.title.trim())
        .filter((expense) => !isGenericExpenseTitle(expense.title))
        .filter((expense) => Number(expense.amount ?? 0) > 0),
      getExpenseFamilyKey,
    ).slice(0, 24),
  };
};

const findTripAIQualityIssues = (plan: TripAIPlan, input?: Pick<TripAIInput, 'startDate' | 'endDate'>) => {
  const issues = new Set<string>();

  plan.itinerary_items.forEach((item) => {
    if (isGenericPlaceholderText(item.title) || isGenericPlaceholderText(item.description) || isGenericPlaceholderText(item.city)) {
      issues.add('roteiro contém títulos ou descrições genéricas');
    }
    if (normalizeKeyPart(item.city) === 'international') {
      issues.add('roteiro usa international como cidade');
    }
  });

  plan.attractions.forEach((attraction) => {
    if (isGenericPlaceholderText(attraction.name) || isGenericPlaceholderText(attraction.description) || isGenericPlaceholderText(attraction.city)) {
      issues.add('pontos turísticos genéricos');
    }
    if (normalizeKeyPart(attraction.city) === 'international') {
      issues.add('ponto turístico usa international como cidade');
    }
  });

  plan.routes.forEach((route) => {
    const from = normalizeKeyPart(route.from);
    const to = normalizeKeyPart(route.to);
    if ((from === 'international' || from === 'internacional') && to) {
      issues.add('rota usa international como origem genérica');
    }
  });

  const expenseKeys = new Set<string>();
  plan.expenses.forEach((expense) => {
    if (isGenericExpenseTitle(expense.title) || isGenericPlaceholderText(expense.title) || isGenericPlaceholderText(expense.detail)) {
      issues.add('gastos contém nomes ou descrições genéricas');
    }

    const key = getExpenseFamilyKey(expense);
    if (expenseKeys.has(key)) {
      issues.add('gastos contém duplicatas');
    }
    expenseKeys.add(key);
  });

  if (input) {
    const tripDays = getTripAIDayCount(input);
    const itemsByDay = new Map<number, number>();

    plan.itinerary_items.forEach((item) => {
      const dayNumber = getItineraryDayNumber(item.day);
      if (!dayNumber) return;
      itemsByDay.set(dayNumber, (itemsByDay.get(dayNumber) ?? 0) + 1);
    });

    for (let day = 1; day <= tripDays; day += 1) {
      if ((itemsByDay.get(day) ?? 0) < 3) {
        issues.add('cada dia precisa ter pelo menos 3 atividades');
        break;
      }
    }
  }

  return [...issues];
};

const parseFunctionError = async (error: unknown) => {
  const context = (error as { context?: Response })?.context;
  if (context) {
    const textBody = await context.clone().text().catch(() => '');
    let payload: unknown = null;

    try {
      payload = textBody ? JSON.parse(textBody) : null;
    } catch {
      payload = textBody;
    }

    const record = asRecord(payload);
    const code = asString(record.error || record.code);
    const message = asString(record.message || record.error) || 'Nao foi possivel gerar a previa com IA.';

    return {
      status: context.status,
      code: code || undefined,
      message,
      body: payload,
    };
  }

  return {
    status: undefined,
    code: undefined,
    message: error instanceof Error ? error.message : 'Nao foi possivel gerar a previa com IA.',
    body: null,
  };
};

export async function generateTripPlan(input: TripAIInput, options: GenerateTripPlanOptions = {}): Promise<TripAIPlan> {
  assertValidDateRange(input.startDate, input.endDate);
  const strategy = options.strategy ?? input.generationStrategy ?? (isLargeTripAIInput(input) ? 'staged' : 'auto');

  const { data, error } = await supabase.functions.invoke('generate-trip-plan', {
    body: {
      ...input,
      generationStrategy: strategy,
    },
  });

  if (error) {
    const parsedError = await parseFunctionError(error);
    console.error('Erro ao chamar generate-trip-plan', {
      status: parsedError.status,
      responseBody: parsedError.body,
      errorCode: parsedError.code,
      message: parsedError.message,
      groupId: input.groupId,
    });
    throw new TripAIFunctionError(parsedError.message, {
      status: parsedError.status,
      code: parsedError.code,
      body: parsedError.body,
    });
  }

  const responseRecord = asRecord(data);
  if (responseRecord.error) {
    const message = asString(responseRecord.message || responseRecord.error, 'Nao foi possivel gerar a previa com IA.');
    const code = asString(responseRecord.error || responseRecord.code);
    console.error('Resposta de erro em generate-trip-plan', {
      status: 200,
      responseBody: data,
      errorCode: code,
      message,
      groupId: input.groupId,
    });
    throw new TripAIFunctionError(message, {
      status: 200,
      code: code || undefined,
      body: data,
    });
  }

  const plan = sanitizeTripAIExpenses(
    withExpenseDateDefaults(normalizeTripAIPlan(data), input.startDate, input.endDate),
    input,
  );
  const qualityIssues = findTripAIQualityIssues(plan, input);
  if (qualityIssues.length) {
    throw new TripAIFunctionError(
      'A prévia gerada ficou genérica demais. Tente informar cidades ou mais detalhes da viagem.',
      {
        status: 422,
        code: 'AI_QUALITY_FAILED',
        body: { issues: qualityIssues },
      },
    );
  }

  return plan;
}

async function requireCurrentUserId() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) throw error;
  if (!user) throw new Error('Usuario nao autenticado.');
  return user.id;
}

const expensePayload = (expense: Expense, groupId: string, userId: string) => ({
  group_id: groupId,
  created_by: userId,
  category: expense.category,
  country: normalizeCountry(expense.country),
  description: expense.title,
  details: expense.detail || 'Valor aproximado planejado.',
  currency: expense.currency ?? 'EUR',
  amount: Number(expense.amount ?? expense.euro.min ?? 0),
  euro_min: expense.euro.min,
  euro_max: expense.euro.max,
  brl_min: expense.real.min,
  brl_max: expense.real.max,
  links: normalizeLinks(expense.links),
  is_paid: expense.isPaid ?? false,
  paid_at: expense.isPaid ? expense.paidAt ?? new Date().toISOString() : null,
  expense_date: toDateInputValue(expense.expenseDate) || getTodayDateInputValue(),
  check_in_date: toDateInputValue(expense.checkInDate) || null,
  check_out_date: toDateInputValue(expense.checkOutDate) || null,
});

const itineraryPayload = (item: ItineraryItem, groupId: string, userId: string, orderIndex: number) => ({
  group_id: groupId,
  created_by: userId,
  day: item.day,
  country: normalizeCountry(item.country),
  city: item.city || null,
  time: item.time || null,
  title: item.title,
  description: item.description || null,
  type: item.type,
  completed: false,
  links: normalizeLinks(item.links),
  order_index: orderIndex,
});

const activityTaskPayload = (
  task: ItineraryActivityTaskInput,
  groupId: string,
  userId: string,
  itineraryItemId: string,
) => ({
  group_id: groupId,
  itinerary_item_id: itineraryItemId,
  created_by: userId,
  title: task.title.trim(),
  description: task.description?.trim() || null,
  is_completed: task.isCompleted ?? false,
  source: task.source ?? 'ai',
});

const attractionPayload = (attraction: Attraction, groupId: string, userId: string, orderIndex: number) => ({
  group_id: groupId,
  created_by: userId,
  name: attraction.name,
  country: normalizeCountry(attraction.country),
  city: attraction.city || null,
  day: attraction.day || null,
  time: attraction.time || null,
  description: attraction.description || null,
  visited: false,
  links: normalizeLinks(attraction.links),
  order_index: orderIndex,
});

type TripChecklistDocumentRow = {
  id: string;
  title: string;
  category: string | null;
  checked: boolean | null;
};

const checklistDocumentPayload = (document: TripAIDocument, groupId: string, userId: string) => {
  const detail = document.detail.trim();
  const sourceNote = document.required === false
    ? 'Checklist recomendado pela IA.'
    : 'Documento sugerido pela IA para preparar a viagem.';

  return {
    group_id: groupId,
    created_by: userId,
    assigned_to: null,
    title: document.title.trim(),
    category: 'Documentos',
    notes: [sourceNote, detail].filter(Boolean).join(' '),
    quantity: 1,
    checked: false,
  };
};

async function syncTripPlanDocuments(groupId: string, userId: string, documents: TripAIDocument[]) {
  const suggestedDocuments = dedupeDocuments(documents)
    .filter((document) => document.title.trim())
    .filter((document) => documentTitleKey(document.title));

  const result: ApplyTripPlanResult['documents'] = {
    attempted: suggestedDocuments.length,
    created: 0,
    skipped: 0,
    failed: false,
  };

  if (!suggestedDocuments.length) return result;

  const { data: existingRows, error: existingError } = await supabase
    .from('trip_checklist_items')
    .select('id,title,category,checked')
    .eq('group_id', groupId);

  if (existingError) throw existingError;

  const existingKeys = new Set(
    ((existingRows ?? []) as TripChecklistDocumentRow[])
      .map((item) => documentTitleKey(item.title))
      .filter(Boolean),
  );

  const documentsToInsert = suggestedDocuments.filter((document) => {
    const key = documentTitleKey(document.title);
    if (existingKeys.has(key)) {
      result.skipped += 1;
      return false;
    }
    existingKeys.add(key);
    return true;
  });

  if (!documentsToInsert.length) return result;

  const { error: insertError } = await supabase
    .from('trip_checklist_items')
    .insert(documentsToInsert.map((document) => checklistDocumentPayload(document, groupId, userId)));

  if (insertError) throw insertError;

  result.created = documentsToInsert.length;
  return result;
}

export async function updateTripGenerationFeedback(
  generationId: string | undefined,
  status: 'applied' | 'rejected' | 'failed',
  feedback?: string,
) {
  if (!generationId) return;

  const { error } = await supabase
    .from('ai_trip_generations')
    .update({ status, feedback: feedback?.trim() || null })
    .eq('id', generationId);

  if (error) throw error;
}

export async function applyTripPlan(review: TripAIReviewState, plan: TripAIPlan, feedback?: string): Promise<ApplyTripPlanResult> {
  assertValidDateRange(review.input.startDate, review.input.endDate);
  const qualityIssues = findTripAIQualityIssues(plan, review.input);
  if (qualityIssues.length) {
    throw new TripAIFunctionError(
      'A prévia gerada ficou genérica demais. Tente informar cidades ou mais detalhes da viagem.',
      {
        status: 422,
        code: 'AI_QUALITY_FAILED',
        body: { issues: qualityIssues },
      },
    );
  }

  const userId = await requireCurrentUserId();
  const { groupId } = review.input;
  const scopedPlan = scopePlanToAllowedCountries(
    sanitizeTripAIExpenses(
      withExpenseDateDefaults(plan, review.input.startDate, review.input.endDate),
      review.input,
    ),
    review.input.countries,
  );

  const { data: membership, error: membershipError } = await supabase
    .from('group_members')
    .select('id')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .maybeSingle();

  if (membershipError) throw membershipError;
  if (!membership) throw new Error('Voce nao participa desta viagem.');

  const { error: groupError } = await supabase
    .from('travel_groups')
    .update({
      name: review.input.tripName,
      description: review.input.description || null,
      countries: review.input.countries,
      start_date: review.input.startDate || null,
      end_date: review.input.endDate || null,
      travel_style: review.input.style,
    })
    .eq('id', groupId);

  if (groupError) throw groupError;

  const [
    itineraryResult,
    expenseResult,
    attractionResult,
  ] = await Promise.all([
    supabase
      .from('itinerary_items')
      .select('day,time,title,country,city', { count: 'exact' })
      .eq('group_id', groupId),
    supabase
      .from('expenses')
      .select('category,country,description,details,currency,amount,expense_date,check_in_date,check_out_date')
      .eq('group_id', groupId),
    supabase
      .from('attractions')
      .select('name,country,city', { count: 'exact' })
      .eq('group_id', groupId),
  ]);

  if (itineraryResult.error) throw itineraryResult.error;
  if (expenseResult.error) throw expenseResult.error;
  if (attractionResult.error) throw attractionResult.error;

  const existingItineraryKeys = new Set(
    (itineraryResult.data ?? []).map((item) =>
      itineraryItemKey({
        day: item.day ?? '',
        time: item.time ?? '',
        title: item.title ?? '',
        country: item.country ?? 'international',
        city: item.city ?? '',
      }),
    ),
  );
  const existingExpenseKeys = new Set(
    (expenseResult.data ?? []).map((expense) =>
      expenseKey({
        category: expense.category ?? '',
        country: expense.country ?? 'international',
        description: expense.description ?? '',
        details: expense.details ?? '',
        currency: expense.currency ?? '',
        amount: Number(expense.amount ?? 0),
        expense_date: expense.expense_date ?? '',
        check_in_date: expense.check_in_date ?? '',
        check_out_date: expense.check_out_date ?? '',
      }),
    ),
  );
  const existingAttractionKeys = new Set(
    (attractionResult.data ?? []).map((attraction) =>
      attractionKey({
        name: attraction.name ?? '',
        country: attraction.country ?? 'international',
        city: attraction.city ?? '',
      }),
    ),
  );

  const itineraryItemsToInsert = dedupeItineraryItems(scopedPlan.itinerary_items).filter(
    (item) => !existingItineraryKeys.has(itineraryItemKey(item)),
  );
  const expensesToInsert = dedupeExpenses(scopedPlan.expenses).filter(
    (expense) => !existingExpenseKeys.has(expenseKey(expense)),
  );
  const attractionsToInsert = dedupeAttractions(scopedPlan.attractions).filter(
    (attraction) => !existingAttractionKeys.has(attractionKey(attraction)),
  );

  let activityTasksAttempted = 0;
  let activityTasksCreated = 0;
  let activityTasksErrorMessage: string | undefined;

  if (itineraryItemsToInsert.length) {
    const { data: insertedItineraryItems, error: insertItineraryError } = await supabase
      .from('itinerary_items')
      .insert(
        itineraryItemsToInsert.map((item, index) =>
          itineraryPayload(item, groupId, userId, (itineraryResult.count ?? 0) + index),
        ),
      )
      .select('id');

    if (insertItineraryError) throw insertItineraryError;

    const tasksToInsert = (insertedItineraryItems ?? []).flatMap((insertedItem, index) => {
      const sourceItem = itineraryItemsToInsert[index];
      return (sourceItem?.tasks ?? [])
        .filter((task) => task.title.trim())
        .map((task) => activityTaskPayload(task, groupId, userId, insertedItem.id));
    });

    activityTasksAttempted = tasksToInsert.length;

    if (tasksToInsert.length) {
      const { error: insertTasksError } = await supabase
        .from('itinerary_activity_tasks')
        .insert(tasksToInsert);

      if (insertTasksError) {
        console.error('Falha ao salvar tarefas sugeridas pela IA no roteiro', {
          groupId,
          generationId: plan.generationId,
          message: insertTasksError.message,
        });
        activityTasksErrorMessage = insertTasksError.message;
      } else {
        activityTasksCreated = tasksToInsert.length;
      }
    }
  }

  const insertions: Array<PromiseLike<{ error: unknown }>> = [];

  if (expensesToInsert.length) {
    insertions.push(
      supabase.from('expenses').insert(
        expensesToInsert.map((expense) => expensePayload(expense, groupId, userId)),
      ),
    );
  }

  if (attractionsToInsert.length) {
    insertions.push(
      supabase.from('attractions').insert(
        attractionsToInsert.map((attraction, index) =>
          attractionPayload(attraction, groupId, userId, (attractionResult.count ?? 0) + index),
        ),
      ),
    );
  }

  const results = await Promise.all(insertions);
  const failedResult = results.find((result) => result.error);

  if (failedResult?.error) throw failedResult.error;

  const applyResult: ApplyTripPlanResult = {
    activityTasks: {
      attempted: activityTasksAttempted,
      created: activityTasksCreated,
      failed: Boolean(activityTasksErrorMessage),
      errorMessage: activityTasksErrorMessage,
    },
    documents: {
      attempted: scopedPlan.documents.length,
      created: 0,
      skipped: scopedPlan.documents.length,
      failed: false,
    },
  };

  try {
    applyResult.documents = await syncTripPlanDocuments(groupId, userId, scopedPlan.documents);
  } catch (error) {
    console.error('Falha ao salvar documentos sugeridos pela IA no checklist', {
      groupId,
      generationId: plan.generationId,
      message: error instanceof Error ? error.message : 'Erro desconhecido',
    });
    applyResult.documents = {
      attempted: scopedPlan.documents.length,
      created: 0,
      skipped: 0,
      failed: true,
      errorMessage: error instanceof Error ? error.message : 'Nao foi possivel salvar documentos no checklist.',
    };
  }

  await updateTripGenerationFeedback(plan.generationId, 'applied', feedback);
  return applyResult;
}

export function storeTripAIReview(review: TripAIReviewState) {
  sessionStorage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(review));
}

export function getStoredTripAIReview(): TripAIReviewState | null {
  const stored = sessionStorage.getItem(REVIEW_STORAGE_KEY);
  if (!stored) return null;

  try {
    const parsed = JSON.parse(stored) as TripAIReviewState;
    return {
      ...parsed,
      plan: parsed.input
        ? sanitizeTripAIExpenses(
            withExpenseDateDefaults(
              normalizeTripAIPlan(parsed.plan),
              parsed.input.startDate,
              parsed.input.endDate,
            ),
            parsed.input,
          )
        : normalizeTripAIPlan(parsed.plan),
    };
  } catch {
    return null;
  }
}

export function clearTripAIReview() {
  sessionStorage.removeItem(REVIEW_STORAGE_KEY);
}
