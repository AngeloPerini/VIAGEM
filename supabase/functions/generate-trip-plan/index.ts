import { createClient } from 'npm:@supabase/supabase-js@2';

type TripStyle = 'economica' | 'intermediaria' | 'confortavel';

type TripPlanInput = {
  tripName: string;
  countries: string[];
  description: string;
  startDate: string;
  endDate: string;
  style: TripStyle;
  groupId: string;
};

type QuotaProfile = {
  ai_generations_used: number | null;
  ai_generations_limit: number | null;
  last_ai_generation_at: string | null;
};

type QuotaResult = {
  allowed: boolean;
  error_code: string | null;
  message: string | null;
  ai_generations_used: number;
  ai_generations_limit: number;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const unlimitedAiTesterEmails = new Set(['r.perini351@gmail.com']);
const DESCRIPTION_MAX_LENGTH = 2500;

class InputValidationError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'InputValidationError';
    this.code = code;
    this.status = status;
  }
}

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });

const errorResponse = (
  error: string,
  message: string,
  status = 400,
  details?: Record<string, unknown>,
) =>
  jsonResponse({ error, code: error, message, details }, status);

const getPublishableKey = () => {
  const legacyAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (legacyAnonKey) return legacyAnonKey;

  const publishableKeys = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS');
  if (!publishableKeys) return null;

  try {
    const parsed = JSON.parse(publishableKeys) as Record<string, string>;
    return parsed.default ?? Object.values(parsed)[0] ?? null;
  } catch {
    return null;
  }
};

const getServiceKey = () => {
  const legacyServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacyServiceRoleKey) return legacyServiceRoleKey;

  const secretKeys = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (!secretKeys) return null;

  try {
    const parsed = JSON.parse(secretKeys) as Record<string, string>;
    return parsed.default ?? Object.values(parsed)[0] ?? null;
  } catch {
    return null;
  }
};

const isTripStyle = (value: unknown): value is TripStyle =>
  value === 'economica' || value === 'intermediaria' || value === 'confortavel';

const normalizeCountryList = (value: unknown) => {
  const rawCountries = Array.isArray(value) ? value : [];
  const seen = new Set<string>();

  return rawCountries
    .flatMap((country) => String(country).split(/[,\n;/|]+/))
    .map((country) => country.trim())
    .filter((country) => {
      if (!country) return false;
      const key = country.toLocaleLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const normalizeInput = (payload: Record<string, unknown>): TripPlanInput => {
  const countries = normalizeCountryList(payload.countries);

  const style = isTripStyle(payload.style) ? payload.style : 'intermediaria';
  const input = {
    tripName: String(payload.tripName ?? '').trim(),
    countries,
    description: String(payload.description ?? '').trim(),
    startDate: String(payload.startDate ?? '').trim(),
    endDate: String(payload.endDate ?? '').trim(),
    style,
    groupId: String(payload.groupId ?? '').trim(),
  };

  if (!input.tripName) throw new Error('Informe o nome da viagem.');
  if (!input.groupId) throw new Error('Informe o grupo da viagem.');
  if (!input.countries.length) throw new Error('Informe pelo menos um pais.');
  if (!input.startDate || !input.endDate) throw new Error('Informe as datas da viagem.');
  if (input.description.length > DESCRIPTION_MAX_LENGTH) {
    throw new InputValidationError(
      'DESCRIPTION_TOO_LONG',
      'A descrição está muito longa. Reduza o texto e tente novamente.',
    );
  }

  return input;
};

const logAiEvent = (
  level: 'info' | 'warn' | 'error',
  event: string,
  details: Record<string, unknown> = {},
) => {
  const payload = {
    event,
    at: new Date().toISOString(),
    ...details,
  };

  console[level](`[generate-trip-plan] ${event}`, payload);
};

const MAX_LOG_TEXT_LENGTH = 6000;

const truncateForLog = (value: unknown, maxLength = MAX_LOG_TEXT_LENGTH) => {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (!text) return '';
  return text.length > maxLength ? `${text.slice(0, maxLength)}...[truncated ${text.length - maxLength} chars]` : text;
};

const getOpenAITimeoutMs = () => {
  const rawValue = Number(Deno.env.get('AI_OPENAI_TIMEOUT_MS') ?? 105_000);
  if (!Number.isFinite(rawValue)) return 105_000;
  return Math.min(115_000, Math.max(20_000, rawValue));
};

const getFunctionBudgetMs = () => {
  const rawValue = Number(Deno.env.get('AI_FUNCTION_BUDGET_MS') ?? 135_000);
  if (!Number.isFinite(rawValue)) return 135_000;
  return Math.min(145_000, Math.max(60_000, rawValue));
};

const safeArray = (value: unknown) => (Array.isArray(value) ? value : []);

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

const asRecords = (value: unknown) => safeArray(value).map(asRecord);

const asText = (value: unknown, fallback = '') =>
  typeof value === 'string' ? value.trim() : value == null ? fallback : String(value).trim();

const stripDiacritics = (value: string) =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const normalizeKey = (value: unknown) =>
  stripDiacritics(asText(value))
    .replace(/&/g, ' e ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const countryAliases: Record<string, string> = {
  brasil: 'brazil',
  brazil: 'brazil',
  franca: 'france',
  france: 'france',
  inglaterra: 'england',
  england: 'england',
  escocia: 'scotland',
  scotland: 'scotland',
  italia: 'italy',
  italy: 'italy',
  reino_unido: 'united_kingdom',
  united_kingdom: 'united_kingdom',
  uk: 'united_kingdom',
  gra_bretanha: 'great_britain',
  great_britain: 'great_britain',
  suica: 'switzerland',
  switzerland: 'switzerland',
  estados_unidos: 'united_states',
  eua: 'united_states',
  usa: 'united_states',
  united_states: 'united_states',
};

const internationalCountryKeys = new Set(['international', 'internacional']);

const countryKey = (value: unknown) => {
  const key = normalizeKey(value);
  return countryAliases[key] ?? key;
};

const buildCountryMap = (input: TripPlanInput) => {
  const map = new Map<string, string>();
  input.countries.forEach((country) => {
    const key = countryKey(country);
    if (key) map.set(key, country);
  });
  return map;
};

const resolveAllowedCountry = (
  value: unknown,
  countryMap: Map<string, string>,
  fallbackCountry: string,
) => {
  const raw = asText(value);
  const key = countryKey(raw);
  if (!key) return fallbackCountry;
  if (internationalCountryKeys.has(key)) return 'international';
  return countryMap.get(key) ?? null;
};

const travelText = (item: Record<string, unknown>) =>
  stripDiacritics([
    item.type,
    item.category,
    item.title,
    item.description,
    item.detail,
    item.details,
    item.country,
  ].map((part) => asText(part)).join(' '));

const isInternationalTransportLike = (item: Record<string, unknown>) => {
  const text = travelText(item);
  const hasTransportSignal = [
    'voo',
    'flight',
    'aereo',
    'aerea',
    'aeroporto',
    'airport',
    'transporte',
    'transport',
  ].some((keyword) => text.includes(keyword));
  const hasInternationalSignal = [
    'internacional',
    'international',
    'brasil',
    'brazil',
    'partida',
    'origem',
    'saida',
    'saindo',
  ].some((keyword) => text.includes(keyword));

  return hasTransportSignal && hasInternationalSignal;
};

const resolvePlanCountry = (
  value: unknown,
  countryMap: Map<string, string>,
  fallbackCountry: string,
  item: Record<string, unknown>,
  options: { allowInternational: boolean; allowTransportFallback?: boolean },
) => {
  const resolved = resolveAllowedCountry(value, countryMap, fallbackCountry);

  if (!resolved) {
    return options.allowTransportFallback && isInternationalTransportLike(item) ? 'international' : null;
  }

  if (resolved === 'international' && !options.allowInternational) return null;
  return resolved;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const parseDateOnly = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) ? null : date;
};

const addDays = (date: Date, days: number) =>
  new Date(date.getTime() + days * MS_PER_DAY);

const formatDateOnly = (date: Date) => date.toISOString().slice(0, 10);

const getTripDayCount = (input: TripPlanInput) => {
  const start = parseDateOnly(input.startDate);
  const end = parseDateOnly(input.endDate);
  if (!start || !end || end < start) return 1;
  return Math.max(1, Math.floor((end.getTime() - start.getTime()) / MS_PER_DAY) + 1);
};

const getDateForDay = (input: TripPlanInput, dayNumber: number) => {
  const start = parseDateOnly(input.startDate);
  if (!start) return '';
  return formatDateOnly(addDays(start, Math.max(0, dayNumber - 1)));
};

const getMinimumItineraryItems = (input: TripPlanInput) => {
  const days = getTripDayCount(input);
  if (days > 15) return days;
  return days >= 10 ? Math.max(days * 3, 35) : days * 3;
};

const getIdealItineraryRange = (input: TripPlanInput) => {
  const days = getTripDayCount(input);
  if (days > 15) {
    return {
      min: getMinimumItineraryItems(input),
      max: Math.min(days * 2, 70),
    };
  }

  return {
    min: Math.max(days * 4, getMinimumItineraryItems(input)),
    max: Math.max(days * 6, days * 4),
  };
};

const getDayNumber = (value: unknown) => {
  const text = asText(value);
  const match = /(?:dia|day)\s*(\d{1,3})/i.exec(text) ?? /^(\d{1,3})(?:\D|$)/.exec(text);
  const dayNumber = Number(match?.[1]);
  return Number.isFinite(dayNumber) && dayNumber > 0 ? dayNumber : null;
};

const getDayNumberFromItem = (item: Record<string, unknown>) => {
  const explicitDay = getDayNumber(item.day);
  if (explicitDay) return explicitDay;

  const rawDayNumber = Number(item.day_number ?? item.dayNumber);
  if (Number.isFinite(rawDayNumber) && rawDayNumber > 0) return Math.floor(rawDayNumber);

  return null;
};

const getTimeMinutes = (value: unknown) => {
  const text = asText(value);
  const match = /(\d{1,2})\s*(?:h|:)\s*(\d{2})?/.exec(text);
  if (!match) return 24 * 60;
  const hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 24 * 60;
  return Math.min(24 * 60, Math.max(0, hours * 60 + minutes));
};

const uniqueByKey = <T>(items: T[], getKey: (item: T) => string) => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = getKey(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const itemKey = (item: Record<string, unknown>) =>
  [
    normalizeKey(item.day),
    normalizeKey(item.date),
    normalizeKey(item.time),
    countryKey(item.country),
    normalizeKey(item.city),
    normalizeKey(item.title),
  ].join('|');

const attractionKey = (attraction: Record<string, unknown>) =>
  [
    normalizeKey(attraction.name ?? attraction.title),
    countryKey(attraction.country),
    normalizeKey(attraction.city),
  ].join('|');

const expenseKey = (expense: Record<string, unknown>) =>
  [
    normalizeKey(expense.category),
    countryKey(expense.country),
    normalizeKey(expense.title ?? expense.description),
    normalizeKey(expense.detail ?? expense.details),
  ].join('|');

const travelIntensiveText = [
  'voo longo',
  'deslocamento longo',
  'deslocamento extenso',
  'dia inteiro',
  'overnight',
  'noturno',
  'estrada longa',
  'long flight',
  'full day',
];

const isUnavoidableSingleItemDay = (item: Record<string, unknown>) => {
  const text = stripDiacritics([
    item.type,
    item.title,
    item.description,
  ].map((part) => asText(part)).join(' '));

  const isTransportHeavy = ['voo', 'flight', 'trem', 'train', 'transporte', 'transport', 'motorhome', 'estrada']
    .some((keyword) => text.includes(keyword));
  const hasLongSignal = travelIntensiveText.some((keyword) => text.includes(stripDiacritics(keyword))) ||
    /\b([8-9]|1\d|2\d)\s*h/.test(text);

  return isTransportHeavy && hasLongSignal;
};

const blockedAttractionKeywords = [
  'aeroporto',
  'airport',
  'check in',
  'check-in',
  'check out',
  'check-out',
  'hospedagem',
  'hotel',
  'metro',
  'metrô',
  'onibus',
  'ônibus',
  'almoco',
  'almoço',
  'jantar',
  'cafe',
  'café',
  'deslocamento',
  'traslado',
  'transfer',
  'retorno',
  'partida',
  'chegada',
  'estacao',
  'estação',
  'trem',
  'voo',
  'rodoviaria',
  'rodoviária',
];

const attractionSignals = [
  'atracao',
  'atração',
  'bairro',
  'castelo',
  'centro historico',
  'centro histórico',
  'experiencia',
  'experiência',
  'jardim',
  'landmark',
  'mercado',
  'mirante',
  'museu',
  'palacio',
  'palácio',
  'parque',
  'passeio',
  'ponte',
  'praca',
  'praça',
  'rua',
  'tour',
];

const looksLikeAttraction = (item: Record<string, unknown>, requireTourSignal: boolean) => {
  const text = stripDiacritics([
    item.type,
    item.name,
    item.title,
    item.description,
  ].map((part) => asText(part)).join(' '));
  const title = asText(item.name ?? item.title);

  if (!title || title.length < 3) return false;
  if (blockedAttractionKeywords.some((keyword) => text.includes(stripDiacritics(keyword)))) return false;
  if (!requireTourSignal) return true;

  return attractionSignals.some((keyword) => text.includes(stripDiacritics(keyword)));
};

const findInvalidCountries = (plan: Record<string, unknown>, input: TripPlanInput) => {
  const countryMap = buildCountryMap(input);
  const invalid = new Set<string>();

  [
    ...asRecords(plan.itinerary_items),
    ...asRecords(plan.expenses),
    ...asRecords(plan.attractions),
  ].forEach((item) => {
    const rawCountry = asText(item.country);
    if (!rawCountry) return;

    const key = countryKey(rawCountry);
    if (!key || internationalCountryKeys.has(key)) return;
    if (!countryMap.has(key)) invalid.add(rawCountry);
  });

  return [...invalid];
};

const ensurePlanShape = (value: unknown, input: TripPlanInput) => {
  const plan = asRecord(value);
  const countryMap = buildCountryMap(input);
  const fallbackCountry = input.countries[0] ?? 'international';
  const tripDays = getTripDayCount(input);
  const warnings = safeArray(plan.warnings).map(String).filter(Boolean);
  const requiredWarning = 'Confirme as exigencias oficiais antes da viagem.';

  const itineraryItems = uniqueByKey(
    asRecords(plan.itinerary_items)
      .map((item, index) => {
        const inferredDay = Math.min(tripDays, Math.floor(index / 6) + 1);
        const dayNumber = Math.min(tripDays, getDayNumberFromItem(item) ?? inferredDay);
        const date = asText(item.date) || getDateForDay(input, dayNumber);
        const rawDay = asText(item.day, `Dia ${dayNumber}`);
        const day = date && !rawDay.includes(date) ? `${rawDay} - ${date}` : rawDay;
        const normalizedItem = {
          ...item,
          type: asText(item.type, 'outro'),
          title: asText(item.title, 'Atividade sugerida'),
          description: asText(item.description),
        };
        const country = resolvePlanCountry(item.country, countryMap, fallbackCountry, normalizedItem, {
          allowInternational: true,
          allowTransportFallback: true,
        });
        if (!country) return null;
        const orderIndex = Number(item.order_index ?? item.orderIndex ?? index);

        return {
          ...normalizedItem,
          day,
          date,
          time: asText(item.time),
          country,
          city: asText(item.city),
          order_index: Number.isFinite(orderIndex) ? orderIndex : index,
          links: safeArray(item.links),
        };
      })
      .filter((item): item is Record<string, unknown> => Boolean(item))
      .filter((item) => asText(item.day) && asText(item.title)),
    itemKey,
  ).sort((a, b) => {
    const dayA = getDayNumberFromItem(a) ?? 0;
    const dayB = getDayNumberFromItem(b) ?? 0;
    if (dayA !== dayB) return dayA - dayB;

    const orderA = Number(a.order_index ?? 0);
    const orderB = Number(b.order_index ?? 0);
    if (orderA !== orderB) return orderA - orderB;

    return getTimeMinutes(a.time) - getTimeMinutes(b.time);
  }).map((item, index) => ({ ...item, order_index: index }));

  const expenses = uniqueByKey(
    asRecords(plan.expenses)
      .map((expense) => {
        const normalizedExpense = {
          ...expense,
          category: asText(expense.category, 'Outros'),
          title: asText(expense.title ?? expense.description, 'Gasto planejado'),
          detail: asText(expense.detail ?? expense.details, 'Aproximado / planejado'),
          links: safeArray(expense.links),
        };
        const country = resolvePlanCountry(expense.country, countryMap, fallbackCountry, normalizedExpense, {
          allowInternational: true,
          allowTransportFallback: true,
        });
        if (!country) return null;
        return { ...normalizedExpense, country };
      })
      .filter((expense): expense is Record<string, unknown> => Boolean(expense))
      .filter((expense) => asText(expense.title)),
    expenseKey,
  );

  const explicitAttractions = asRecords(plan.attractions)
    .map((attraction) => {
      const normalizedAttraction = {
        ...attraction,
        name: asText(attraction.name ?? attraction.title),
        city: asText(attraction.city),
        day: asText(attraction.day),
        time: asText(attraction.time),
        description: asText(attraction.description),
        links: safeArray(attraction.links),
      };
      const country = resolvePlanCountry(attraction.country, countryMap, fallbackCountry, normalizedAttraction, {
        allowInternational: false,
      });
      if (!country) return null;
      return { ...normalizedAttraction, country };
    })
    .filter((attraction): attraction is Record<string, unknown> => Boolean(attraction))
    .filter((attraction) => looksLikeAttraction(attraction, false));

  const itineraryAttractions = itineraryItems
    .filter((item) => countryMap.has(countryKey(item.country)) && looksLikeAttraction(item, true))
    .map((item) => ({
      name: asText(item.title),
      country: item.country,
      city: asText(item.city),
      day: asText(item.day).split(' - ')[0],
      time: asText(item.time),
      description: asText(item.description),
      links: [],
    }));

  return {
    summary: asText(plan.summary),
    documents: asRecords(plan.documents),
    routes: asRecords(plan.routes),
    itinerary_items: itineraryItems,
    expenses,
    attractions: uniqueByKey([...explicitAttractions, ...itineraryAttractions], attractionKey),
    warnings: warnings.some((warning) => stripDiacritics(warning).includes('exigencias oficiais'))
      ? warnings
      : [...warnings, requiredWarning],
  };
};

const stripJsonFence = (content: string) =>
  content.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

const findBalancedJsonObject = (content: string) => {
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];

    if (start === -1) {
      if (char === '{') {
        start = index;
        depth = 1;
      }
      continue;
    }

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;

    if (depth === 0) return content.slice(start, index + 1);
  }

  return null;
};

const getResponseKind = (content: string) => {
  const text = content.trim();
  if (!text) return 'empty';
  if (text.startsWith('{') && text.endsWith('}')) return 'json_object';
  if (/^```(?:json)?/i.test(text)) return 'markdown_json';
  if (text.includes('{') && text.includes('}')) return 'embedded_json';
  return 'loose_text';
};

const extractJsonObject = (content: string) => {
  const attempts = [
    { strategy: 'direct', text: content.trim() },
    { strategy: 'code_fence', text: stripJsonFence(content) },
  ];
  const balancedJson = findBalancedJsonObject(content);
  if (balancedJson) attempts.push({ strategy: 'balanced_object', text: balancedJson });

  let lastError = 'A IA nao retornou JSON valido.';

  for (const attempt of attempts) {
    if (!attempt.text) continue;
    try {
      return {
        value: JSON.parse(attempt.text),
        strategy: attempt.strategy,
      };
    } catch (error) {
      lastError = getErrorMessage(error, lastError);
    }
  }

  throw new Error(lastError);
};

const getErrorMessage = (error: unknown, fallback = 'Nao foi possivel gerar a previa com IA.') => {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const parts = [
      typeof record.message === 'string' ? record.message : null,
      typeof record.details === 'string' ? record.details : null,
      typeof record.hint === 'string' ? record.hint : null,
      typeof record.code === 'string' ? `Codigo: ${record.code}` : null,
    ].filter(Boolean);
    if (parts.length) return parts.join(' ');
  }
  return fallback;
};

class AiProviderError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'AiProviderError';
    this.status = status;
  }
}

class AiTimeoutError extends Error {
  timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`A OpenAI nao respondeu em ate ${Math.round(timeoutMs / 1000)} segundos.`);
    this.name = 'AiTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

class AiJsonError extends Error {
  responseKind: string;
  rawSample: string;
  parseError: string;

  constructor({
    message = 'A IA retornou uma resposta em formato invalido. Tente gerar novamente.',
    responseKind = 'unknown',
    rawSample = '',
    parseError = '',
  }: {
    message?: string;
    responseKind?: string;
    rawSample?: string;
    parseError?: string;
  } = {}) {
    super(message);
    this.name = 'AiJsonError';
    this.responseKind = responseKind;
    this.rawSample = rawSample;
    this.parseError = parseError;
  }
}

class AiSchemaError extends Error {
  reasons: string[];

  constructor(reasons: string[]) {
    super(`A IA retornou JSON incompleto: ${reasons.join('; ') || 'schema incompleto'}. Tente gerar novamente.`);
    this.name = 'AiSchemaError';
    this.reasons = reasons;
  }
}

class AiQualityError extends Error {
  reasons: string[];

  constructor(reasons: string[]) {
    super(`A IA gerou um roteiro incompleto: ${reasons.join('; ') || 'qualidade insuficiente'}. Tente gerar novamente.`);
    this.name = 'AiQualityError';
    this.reasons = reasons;
  }
}

class SupabaseInsertError extends Error {
  originalError: unknown;

  constructor(error: unknown) {
    super(`Nao foi possivel salvar a previa gerada: ${getErrorMessage(error, 'erro ao inserir ai_trip_generations')}`);
    this.name = 'SupabaseInsertError';
    this.originalError = error;
  }
}

const validateRawPlanSchema = (value: unknown) => {
  const plan = asRecord(value);
  const reasons: string[] = [];
  const arrayFields = ['documents', 'routes', 'itinerary_items', 'expenses', 'attractions'];

  arrayFields.forEach((field) => {
    if (!Array.isArray(plan[field])) reasons.push(`${field} ausente ou nao e array`);
  });

  const itineraryItems = asRecords(plan.itinerary_items);
  const expenses = asRecords(plan.expenses);
  const attractions = asRecords(plan.attractions);

  if (!asText(plan.summary)) reasons.push('summary ausente');
  if (!itineraryItems.length) reasons.push('itinerary_items vazio');
  if (!expenses.length) reasons.push('expenses vazio');
  if (!attractions.length) reasons.push('attractions vazio');

  const invalidItineraryIndex = itineraryItems.findIndex((item) =>
    !asText(item.day) || !asText(item.country) || !asText(item.city) || !asText(item.title) || !asText(item.type)
  );
  if (invalidItineraryIndex >= 0) {
    reasons.push(`itinerary_items[${invalidItineraryIndex}] sem day/country/city/title/type`);
  }

  const invalidExpenseIndex = expenses.findIndex((expense) =>
    !asText(expense.category) || !asText(expense.country) || !asText(expense.title ?? expense.description)
  );
  if (invalidExpenseIndex >= 0) {
    reasons.push(`expenses[${invalidExpenseIndex}] sem category/country/title`);
  }

  const invalidAttractionIndex = attractions.findIndex((attraction) =>
    !asText(attraction.name ?? attraction.title) || !asText(attraction.country) || !asText(attraction.city)
  );
  if (invalidAttractionIndex >= 0) {
    reasons.push(`attractions[${invalidAttractionIndex}] sem name/country/city`);
  }

  return {
    ok: reasons.length === 0,
    reasons,
  };
};

const validatePlanQuality = (plan: ReturnType<typeof ensurePlanShape>, input: TripPlanInput) => {
  const reasons: string[] = [];
  const tripDays = getTripDayCount(input);
  const minimumItems = getMinimumItineraryItems(input);
  const invalidCountries = findInvalidCountries(plan, input);

  if (plan.itinerary_items.length < minimumItems) {
    reasons.push(`roteiro tem ${plan.itinerary_items.length} itens, minimo esperado ${minimumItems}`);
  }

  if (invalidCountries.length) {
    reasons.push(`paises fora da viagem: ${invalidCountries.join(', ')}`);
  }

  const itemsByDay = new Map<number, Record<string, unknown>[]>();
  plan.itinerary_items.forEach((item) => {
    const dayNumber = getDayNumberFromItem(item);
    if (!dayNumber) return;
    itemsByDay.set(dayNumber, [...(itemsByDay.get(dayNumber) ?? []), item]);
  });

  const missingDays: number[] = [];
  const singleItemDays: number[] = [];
  const veryThinDays: number[] = [];

  for (let day = 1; day <= tripDays; day += 1) {
    const items = itemsByDay.get(day) ?? [];
    if (!items.length) {
      missingDays.push(day);
      continue;
    }

    if (items.length === 1 && !isUnavoidableSingleItemDay(items[0])) {
      singleItemDays.push(day);
    }

    if (items.length > 0 && items.length < 3 && !items.every(isUnavoidableSingleItemDay)) {
      veryThinDays.push(day);
    }
  }

  if (missingDays.length) {
    reasons.push(`dias sem roteiro: ${missingDays.map((day) => `Dia ${day}`).join(', ')}`);
  }

  if (tripDays <= 15 && singleItemDays.length) {
    reasons.push(`dias com apenas 1 item sem justificativa: ${singleItemDays.map((day) => `Dia ${day}`).join(', ')}`);
  }

  if (tripDays <= 15 && tripDays >= 4 && veryThinDays.length > Math.max(1, Math.floor(tripDays * 0.2))) {
    reasons.push(`muitos dias com menos de 3 itens: ${veryThinDays.map((day) => `Dia ${day}`).join(', ')}`);
  }

  return {
    ok: reasons.length === 0,
    reasons,
  };
};

const isUsableCompactLongTripPlan = (plan: ReturnType<typeof ensurePlanShape>, input: TripPlanInput) => {
  const tripDays = getTripDayCount(input);
  if (tripDays <= 15) return false;
  if (findInvalidCountries(plan, input).length) return false;
  if (plan.itinerary_items.length < Math.ceil(tripDays * 0.9)) return false;

  const itemsByDay = new Map<number, Record<string, unknown>[]>();
  plan.itinerary_items.forEach((item) => {
    const dayNumber = getDayNumberFromItem(item);
    if (!dayNumber) return;
    itemsByDay.set(dayNumber, [...(itemsByDay.get(dayNumber) ?? []), item]);
  });

  const missingDays: number[] = [];
  const singleItemDays: number[] = [];
  for (let day = 1; day <= tripDays; day += 1) {
    const items = itemsByDay.get(day) ?? [];
    if (!items.length) missingDays.push(day);
    if (items.length === 1 && !isUnavoidableSingleItemDay(items[0])) singleItemDays.push(day);
  }

  return missingDays.length === 0 && singleItemDays.length <= Math.max(2, Math.floor(tripDays * 0.75));
};

const buildPrompt = (input: TripPlanInput, qualityFeedback?: string) => {
  const tripDays = getTripDayCount(input);
  const minimumItems = getMinimumItineraryItems(input);
  const idealRange = getIdealItineraryRange(input);
  const isLongTrip = tripDays > 15;
  const targetItems = isLongTrip
    ? Math.min(idealRange.max, Math.max(minimumItems, Math.ceil(tripDays * 1.5)))
    : Math.min(idealRange.max, Math.max(minimumItems, tripDays * 4));

  return `
Voce e um planejador de viagens. Responda SOMENTE JSON valido, sem markdown, sem comentario e sem texto fora do objeto.
Use frases curtas. Nao inclua links. Descricoes com ate 120 caracteres.

Viagem:
- Nome: ${input.tripName}
- allowedCountries: ${input.countries.join(', ')}
- itinerary_items.country, expenses.country e attractions.country devem usar SOMENTE allowedCountries.
- Excecao: voo internacional pode usar country "international"; esse valor nunca e destino nem filtro principal.
- Brasil/Brazil so pode aparecer como destino se estiver em allowedCountries. Se o usuario mencionar saida/origem Brasil, trate como voo internacional com country "international"; nao crie Brasil em attractions, expenses, filtros ou paises da viagem.
- Datas: ${input.startDate} ate ${input.endDate} (${tripDays} dias, contando inicio e fim)
- Estilo: ${input.style}
- Descricao da viagem: ${input.description || 'Nao informada'}

Qualidade obrigatoria:
- Gere entre ${minimumItems} e ${targetItems} itinerary_items, distribuidos pelos ${tripDays} dias.
- ${isLongTrip ? 'Viagem longa: use roteiro compacto com 1 a 3 blocos por dia; cada bloco pode resumir meio-dia ou uma cidade-base, e os dias principais podem ter mais detalhes.' : 'Cada dia completo deve ter manha, almoco, tarde e noite.'}
- ${isLongTrip ? 'Nao crie dias vazios; dias de deslocamento ou pausa podem ter 1 bloco resumido, mas dias principais devem ter 2 ou 3 blocos.' : 'Nao crie dias vazios ou com 1 item, exceto voo/deslocamento muito longo.'}
- Dias de chegada/voo ainda devem incluir chegada, deslocamento, check-in, passeio leve proximo e jantar/noite livre quando houver tempo.
- Agrupe atracoes proximas no mesmo dia e evite zigue-zague.
- ${isLongTrip ? 'Em viagem longa, nenhum dia pode ficar sem item; use itens resumidos por periodo quando necessario.' : 'Dias completos devem ter entre 4 e 8 blocos quando possivel.'}
- Nao ultrapasse ${targetItems} itinerary_items; para viagem longa, mantenha descricoes objetivas para evitar resposta gigante.

Ritmo:
- economica: transporte publico e atracoes baratas/gratuitas.
- intermediaria: equilibrio entre custo, conforto e atracoes pagas importantes.
- confortavel: deslocamentos melhores e pausas maiores.
- Se a descricao indicar motorhome: retirada/devolucao, estrada, paradas, cidades-base e direcao realista.

Tipos permitidos: chegada, hospedagem, passeio, transporte, alimentacao, voo, trem, motorhome, descanso, compras, documento, outro.
Categorias de despesas: Hospedagem, Transporte, Passeios, Alimentacao, Comprinhas, Documentos, Seguro, Outros.

Despesas: gere 6 a 10 gastos aproximados compativeis com roteiro, em euro e real.
Attractions: inclua apenas atracoes reais do roteiro: museus, pracas, mirantes, parques, bairros turisticos e experiencias. Nao inclua hotel, aeroporto, metro, refeicoes ou deslocamentos.
Routes: inclua rotas uteis entre cidades-base/aeroportos/estacoes ou trechos de estrada.
Validacao final: remova duplicados, remova Brasil/paises fora dos allowedCountries, converta voo de origem Brasil para "international" e complete dias fracos.

${qualityFeedback ? `A geracao anterior foi rejeitada por qualidade: ${qualityFeedback}. Refaça corrigindo esses pontos, com mais blocos por dia e sem paises fora da viagem.` : ''}

Retorne exatamente este objeto:
{
  "summary": "string",
  "documents": [
    { "title": "string", "detail": "string" }
  ],
  "routes": [
    { "from": "string", "to": "string", "transport": "string", "duration": "string", "estimatedCost": "string", "notes": "string" }
  ],
  "itinerary_items": [
    {
      "day": "Dia 1",
      "date": "2026-01-01",
      "time": "09h00",
      "country": "um dos allowedCountries ou international apenas em voo",
      "city": "string",
      "title": "string",
      "description": "string",
      "type": "um dos tipos permitidos",
      "order_index": 0
    }
  ],
  "expenses": [
    {
      "category": "uma das categorias permitidas",
      "country": "um dos allowedCountries ou international apenas em transporte internacional",
      "title": "string",
      "detail": "Aproximado / planejado",
      "euro": { "min": 0, "max": 0 },
      "real": { "min": 0, "max": 0 }
    }
  ],
  "attractions": [
    {
      "name": "string",
      "country": "um dos allowedCountries",
      "city": "string",
      "day": "Dia 1",
      "time": "09h00",
      "description": "string"
    }
  ],
  "warnings": ["string"]
}
`;
};

const generatePlanWithAI = async (
  apiKey: string,
  model: string,
  input: TripPlanInput,
  qualityFeedback?: string,
  context: { groupId: string; userId: string; attempt: number } = {
    groupId: input.groupId,
    userId: 'unknown',
    attempt: 1,
  },
) => {
  const timeoutMs = qualityFeedback ? Math.min(getOpenAITimeoutMs(), 45_000) : getOpenAITimeoutMs();
  const controller = new AbortController();
  const startedAt = Date.now();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  let aiResponse: Response;

  try {
    aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: qualityFeedback ? 0.42 : 0.38,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'Voce gera apenas JSON valido para planejamento de viagem. Nao retorne texto fora do JSON.',
          },
          { role: 'user', content: buildPrompt(input, qualityFeedback) },
        ],
      }),
    });
  } catch (error) {
    const isAbort = error instanceof DOMException && error.name === 'AbortError';
    logAiEvent('error', 'openai_request_failed', {
      group_id: context.groupId,
      user_id: context.userId,
      attempt: context.attempt,
      error_code: isAbort ? 'TIMEOUT' : 'OPENAI_ERROR',
      timeout_ms: timeoutMs,
      duration_ms: Date.now() - startedAt,
      message: getErrorMessage(error),
    });

    if (isAbort) throw new AiTimeoutError(timeoutMs);
    throw new AiProviderError(0, getErrorMessage(error, 'Falha ao chamar a OpenAI.'));
  } finally {
    clearTimeout(timeoutId);
  }

  const durationMs = Date.now() - startedAt;
  const rawResponseText = await aiResponse.text().catch(() => '');

  logAiEvent(aiResponse.ok ? 'info' : 'error', 'openai_http_response', {
    group_id: context.groupId,
    user_id: context.userId,
    attempt: context.attempt,
    provider_status: aiResponse.status,
    duration_ms: durationMs,
    raw_response_size: rawResponseText.length,
    raw_response_sample: truncateForLog(rawResponseText, 3000),
  });

  if (!aiResponse.ok) {
    let providerMessage = rawResponseText;

    try {
      const parsed = JSON.parse(rawResponseText) as { error?: { message?: string; type?: string; code?: string } };
      providerMessage = [
        parsed.error?.message,
        parsed.error?.type,
        parsed.error?.code,
      ].filter(Boolean).join(' ');
    } catch {
      // Keep the raw provider text when it is not JSON.
    }

    throw new AiProviderError(
      aiResponse.status,
      providerMessage || `OpenAI retornou HTTP ${aiResponse.status}.`,
    );
  }

  let aiPayload: Record<string, unknown>;
  try {
    aiPayload = JSON.parse(rawResponseText) as Record<string, unknown>;
  } catch (error) {
    throw new AiJsonError({
      message: 'A OpenAI respondeu, mas o envelope da resposta nao era JSON valido.',
      responseKind: 'provider_envelope_invalid',
      rawSample: truncateForLog(rawResponseText, 3000),
      parseError: getErrorMessage(error),
    });
  }

  const choices = safeArray(aiPayload.choices);
  const firstChoice = asRecord(choices[0]);
  const message = asRecord(firstChoice.message);
  const usage = asRecord(aiPayload.usage);
  const finishReason = asText(firstChoice.finish_reason);
  const content = message.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new AiJsonError({
      message: 'A IA respondeu sem conteudo JSON.',
      responseKind: 'empty',
      rawSample: truncateForLog(rawResponseText, 3000),
      parseError: 'choices[0].message.content ausente ou vazio',
    });
  }

  const responseKind = getResponseKind(content);
  logAiEvent('info', 'openai_content_received', {
    group_id: context.groupId,
    user_id: context.userId,
    attempt: context.attempt,
    finish_reason: finishReason,
    response_kind: responseKind,
    content_length: content.length,
    usage,
    content_sample: truncateForLog(content, 3000),
  });

  try {
    const parsed = extractJsonObject(content);
    logAiEvent('info', 'openai_json_parsed', {
      group_id: context.groupId,
      user_id: context.userId,
      attempt: context.attempt,
      parse_strategy: parsed.strategy,
      top_level_keys: Object.keys(asRecord(parsed.value)),
    });
    return parsed.value;
  } catch (error) {
    throw new AiJsonError({
      responseKind,
      rawSample: truncateForLog(content, 3000),
      parseError: getErrorMessage(error),
    });
  }
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Metodo nao permitido.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const publishableKey = getPublishableKey();
  const serviceKey = getServiceKey();
  const authorization = req.headers.get('Authorization') ?? '';

  if (!supabaseUrl || !publishableKey || !serviceKey) {
    return jsonResponse({ error: 'Supabase nao configurado na Edge Function.' }, 500);
  }

  if (!authorization.startsWith('Bearer ')) {
    return jsonResponse({ error: 'Usuario nao autenticado.' }, 401);
  }

  const supabase = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization } },
  });
  const adminSupabase = createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) return jsonResponse({ error: 'Sessao invalida.' }, 401);

  let input: TripPlanInput;

  try {
    input = normalizeInput(await req.json());
  } catch (error) {
    if (error instanceof InputValidationError) {
      return errorResponse(error.code, error.message, error.status);
    }

    return errorResponse(
      'INVALID_INPUT',
      error instanceof Error ? error.message : 'Entrada invalida.',
      400,
    );
  }

  logAiEvent('info', 'request_received', {
    group_id: input.groupId,
    user_id: user.id,
    countries: input.countries,
    start_date: input.startDate,
    end_date: input.endDate,
  });

  const logFailedGeneration = async (feedback: string) => {
    try {
      await adminSupabase.from('ai_trip_generations').insert({
        group_id: input.groupId,
        user_id: user.id,
        input,
        status: 'failed',
        feedback,
      });
    } catch (error) {
      logAiEvent('error', 'failed_generation_insert_failed', {
        group_id: input.groupId,
        user_id: user.id,
        error_code: 'SUPABASE_INSERT_ERROR',
        message: getErrorMessage(error),
      });
      // Logging must never hide the original generation error.
    }
  };

  try {
    const { data: membership, error: membershipError } = await supabase
      .from('group_members')
      .select('id')
      .eq('group_id', input.groupId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (membershipError) throw membershipError;
    if (!membership) {
      logAiEvent('warn', 'membership_denied', {
        group_id: input.groupId,
        user_id: user.id,
        error_code: 'FORBIDDEN',
      });

      return errorResponse('FORBIDDEN', 'Voce nao participa desta viagem.', 403);
    }

    const profilePayload = {
      id: user.id,
      email: user.email ?? null,
      full_name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? null,
      avatar_url: user.user_metadata?.avatar_url ?? user.user_metadata?.picture ?? null,
      updated_at: new Date().toISOString(),
    };

    await adminSupabase.from('profiles').upsert(profilePayload, { onConflict: 'id' });

    const { data: profile, error: profileError } = await adminSupabase
      .from('profiles')
      .select('ai_generations_used, ai_generations_limit, last_ai_generation_at')
      .eq('id', user.id)
      .single<QuotaProfile>();

    if (profileError) throw profileError;

    const used = Number(profile.ai_generations_used ?? 0);
    const limit = Number(profile.ai_generations_limit ?? 3);
    const userEmail = String(user.email ?? '').trim().toLowerCase();
    const isUnlimitedTester = unlimitedAiTesterEmails.has(userEmail);

    if (!isUnlimitedTester && used >= limit) {
      logAiEvent('warn', 'quota_limit_reached', {
        group_id: input.groupId,
        user_id: user.id,
        error_code: 'AI_GENERATION_LIMIT_REACHED',
        used,
        limit,
      });

      return errorResponse(
        'AI_GENERATION_LIMIT_REACHED',
        'Você atingiu o limite gratuito de 3 gerações de viagem com IA.',
        429,
      );
    }

    if (
      !isUnlimitedTester &&
      profile.last_ai_generation_at &&
      Date.now() - new Date(profile.last_ai_generation_at).getTime() < 30_000
    ) {
      logAiEvent('warn', 'cooldown_active', {
        group_id: input.groupId,
        user_id: user.id,
        error_code: 'AI_GENERATION_COOLDOWN',
        last_ai_generation_at: profile.last_ai_generation_at,
      });

      return errorResponse(
        'AI_GENERATION_COOLDOWN',
        'Aguarde alguns segundos antes de gerar novamente.',
        429,
      );
    }

    const apiKey = Deno.env.get('OPENAI_API_KEY') ?? Deno.env.get('AI_API_KEY');
    if (!apiKey) {
      await logFailedGeneration('IA ainda nao configurada no servidor.');
      logAiEvent('error', 'provider_missing_key', {
        group_id: input.groupId,
        user_id: user.id,
        error_code: 'AI_PROVIDER_NOT_CONFIGURED',
      });

      return errorResponse(
        'AI_PROVIDER_NOT_CONFIGURED',
        'IA ainda nao configurada no servidor. Verifique os secrets da Edge Function.',
        503,
      );
    }

    const model = Deno.env.get('AI_MODEL') ?? 'gpt-4.1-mini';
    const functionStartedAt = Date.now();
    const functionBudgetMs = getFunctionBudgetMs();
    let output: ReturnType<typeof ensurePlanShape> | null = null;
    let qualityReasons: string[] = [];
    let validationFailureKind: 'schema' | 'quality' = 'quality';

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const elapsedMs = Date.now() - functionStartedAt;
      const remainingMs = functionBudgetMs - elapsedMs;
      const retryTimeoutMs = Math.min(getOpenAITimeoutMs(), 45_000);
      const minimumRetryBudgetMs = retryTimeoutMs + 8_000;

      if (attempt > 1 && remainingMs < minimumRetryBudgetMs) {
        logAiEvent('warn', 'quality_retry_skipped_due_budget', {
          group_id: input.groupId,
          user_id: user.id,
          attempt,
          error_code: 'VALIDATION_FAILED',
          elapsed_ms: elapsedMs,
          remaining_ms: remainingMs,
          reasons: qualityReasons,
        });
        break;
      }

      const qualityFeedback = qualityReasons.length ? qualityReasons.join('; ') : undefined;
      logAiEvent('info', 'openai_attempt_started', {
        group_id: input.groupId,
        user_id: user.id,
        attempt,
        model,
        elapsed_ms: elapsedMs,
        remaining_ms: remainingMs,
        has_quality_feedback: Boolean(qualityFeedback),
      });

      const rawOutput = await generatePlanWithAI(apiKey, model, input, qualityFeedback, {
        groupId: input.groupId,
        userId: user.id,
        attempt,
      });
      const schema = validateRawPlanSchema(rawOutput);
      if (!schema.ok) {
        qualityReasons = schema.reasons;
        validationFailureKind = 'schema';
        logAiEvent('warn', 'schema_validation_failed', {
          group_id: input.groupId,
          user_id: user.id,
          attempt,
          error_code: 'VALIDATION_FAILED',
          reasons: qualityReasons,
          raw_top_level_keys: Object.keys(asRecord(rawOutput)),
        });
        continue;
      }

      const candidate = ensurePlanShape(rawOutput, input);
      const quality = validatePlanQuality(candidate, input);

      if (quality.ok) {
        logAiEvent('info', 'quality_passed', {
          group_id: input.groupId,
          user_id: user.id,
          attempt,
          itinerary_items: candidate.itinerary_items.length,
          attractions: candidate.attractions.length,
          expenses: candidate.expenses.length,
        });
        output = candidate;
        break;
      }

      if (isUsableCompactLongTripPlan(candidate, input)) {
        candidate.warnings = [
          ...new Set([
            ...candidate.warnings,
            'Viagem longa gerada em formato compacto para evitar timeout.',
          ]),
        ];
        logAiEvent('warn', 'compact_long_trip_accepted', {
          group_id: input.groupId,
          user_id: user.id,
          attempt,
          reasons: quality.reasons,
          itinerary_items: candidate.itinerary_items.length,
        });
        output = candidate;
        break;
      }

      qualityReasons = quality.reasons;
      validationFailureKind = 'quality';
      logAiEvent('warn', 'quality_retry_needed', {
        group_id: input.groupId,
        user_id: user.id,
        attempt,
        reasons: qualityReasons,
        itinerary_items: candidate.itinerary_items.length,
      });
    }

    if (!output) {
      if (validationFailureKind === 'schema') throw new AiSchemaError(qualityReasons);
      throw new AiQualityError(qualityReasons);
    }

    const { data: generation, error: insertError } = await adminSupabase
      .from('ai_trip_generations')
      .insert({
        group_id: input.groupId,
        user_id: user.id,
        input,
        output,
        status: 'generated',
      })
      .select('id')
      .single();

    if (insertError) throw new SupabaseInsertError(insertError);

    let quotaResult: QuotaResult | null = null;
    let quotaWarning: Record<string, unknown> | null = null;

    if (!isUnlimitedTester) {
      const { data, error } = await adminSupabase
        .rpc('consume_ai_generation_quota', { target_user_id: user.id })
        .single<QuotaResult>();

      if (error) {
        quotaWarning = {
          code: 'QUOTA_CONSUME_FAILED',
          message: getErrorMessage(error, 'Nao foi possivel atualizar o contador interno.'),
        };
        logAiEvent('error', 'quota_consume_failed_after_generation', {
          group_id: input.groupId,
          user_id: user.id,
          generation_id: generation.id,
          error_code: quotaWarning.code,
          message: quotaWarning.message,
        });
      } else if (!data?.allowed) {
        quotaWarning = {
          code: data?.error_code ?? 'AI_GENERATION_BLOCKED_AFTER_PREVIEW',
          message: data?.message ?? 'A cota nao foi consumida, mas a previa valida foi gerada.',
        };
        logAiEvent('warn', 'quota_not_consumed_after_generation', {
          group_id: input.groupId,
          user_id: user.id,
          generation_id: generation.id,
          error_code: quotaWarning.code,
          message: quotaWarning.message,
        });
      } else {
        quotaResult = data;
      }
    }

    logAiEvent('info', 'generation_created', {
      group_id: input.groupId,
      user_id: user.id,
      generation_id: generation.id,
      quota_used: quotaResult?.ai_generations_used ?? used,
      quota_limit: quotaResult?.ai_generations_limit ?? limit,
      quota_warning: quotaWarning,
      unlimited: isUnlimitedTester,
    });

    const responseBody = {
      generationId: generation.id,
      quota: {
        used: quotaResult?.ai_generations_used ?? used,
        limit: quotaResult?.ai_generations_limit ?? limit,
        unlimited: isUnlimitedTester,
        warning: quotaWarning,
      },
      ...output,
    };

    logAiEvent('info', 'response_ready', {
      group_id: input.groupId,
      user_id: user.id,
      generation_id: generation.id,
      response_status: 200,
      itinerary_items: output.itinerary_items.length,
      attractions: output.attractions.length,
      expenses: output.expenses.length,
    });

    return jsonResponse(responseBody);
  } catch (error) {
    const message = getErrorMessage(error);
    await logFailedGeneration(message);

    if (error instanceof AiProviderError) {
      logAiEvent('error', 'openai_failed', {
        group_id: input.groupId,
        user_id: user.id,
        error_code: 'OPENAI_ERROR',
        provider_status: error.status,
        message,
      });

      return errorResponse(
        'OPENAI_ERROR',
        `Erro da OpenAI: ${message}`,
        502,
        { providerStatus: error.status },
      );
    }

    if (error instanceof AiTimeoutError) {
      logAiEvent('error', 'openai_timeout', {
        group_id: input.groupId,
        user_id: user.id,
        error_code: 'TIMEOUT',
        timeout_ms: error.timeoutMs,
        message,
      });

      return errorResponse(
        'TIMEOUT',
        message,
        504,
        { timeoutMs: error.timeoutMs },
      );
    }

    if (error instanceof AiJsonError) {
      logAiEvent('error', 'json_parse_failed', {
        group_id: input.groupId,
        user_id: user.id,
        error_code: 'INVALID_JSON',
        message,
        response_kind: error.responseKind,
        parse_error: error.parseError,
        raw_sample: error.rawSample,
      });

      return errorResponse(
        'INVALID_JSON',
        message,
        502,
        {
          responseKind: error.responseKind,
          parseError: error.parseError,
        },
      );
    }

    if (error instanceof AiSchemaError) {
      logAiEvent('warn', 'schema_validation_failed_final', {
        group_id: input.groupId,
        user_id: user.id,
        error_code: 'VALIDATION_FAILED',
        reasons: error.reasons,
      });

      return errorResponse(
        'VALIDATION_FAILED',
        message,
        422,
        { reasons: error.reasons },
      );
    }

    if (error instanceof AiQualityError) {
      logAiEvent('warn', 'quality_failed', {
        group_id: input.groupId,
        user_id: user.id,
        error_code: 'VALIDATION_FAILED',
        reasons: error.reasons,
      });

      return errorResponse(
        'VALIDATION_FAILED',
        message,
        422,
        { reasons: error.reasons },
      );
    }

    if (error instanceof SupabaseInsertError) {
      logAiEvent('error', 'generation_insert_failed', {
        group_id: input.groupId,
        user_id: user.id,
        error_code: 'SUPABASE_INSERT_ERROR',
        message,
      });

      return errorResponse(
        'SUPABASE_INSERT_ERROR',
        message,
        500,
      );
    }

    logAiEvent('error', 'generation_failed', {
      group_id: input.groupId,
      user_id: user.id,
      error_code: 'AI_GENERATION_FAILED',
      message,
    });

    return errorResponse(
      'AI_GENERATION_FAILED',
      message,
      500,
    );
  }
});
