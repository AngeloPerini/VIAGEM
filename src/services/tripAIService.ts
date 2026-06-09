import type {
  Attraction,
  CountryId,
  CurrencyRange,
  Expense,
  ItineraryItem,
  ItineraryType,
  LinkItem,
  TripAIDocument,
  TripAIInput,
  TripAIPlan,
  TripAIRoute,
  TripAIReviewState,
  TravelCurrencyCode,
} from '../types';
import { normalizeCountryId } from '../data/countries';
import { assertValidDateRange } from '../utils/dateRange';
import { normalizeLinks } from '../utils/links';
import { supabase } from './supabaseClient';

const REVIEW_STORAGE_KEY = 'controle-viagem-ai-review-v1';
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
  };
};

const normalizeExpense = (value: unknown): Expense => {
  const record = asRecord(value);
  const detail = asString(record.detail || record.details, 'Valor aproximado planejado.');
  const country = normalizeCountry(record.country);
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
    category: normalizeCategory(record.category),
    country,
    title: asString(record.title || record.description, 'Gasto planejado'),
    detail: detail.toLowerCase().includes('aproxim') ? detail : `${detail} Aproximado / planejado.`,
    currency,
    amount: parsedAmount,
    euro,
    real,
    links: normalizeLinkArray(record.links),
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
  },
) =>
  [
    normalizeKeyPart(expense.category),
    normalizeCountry(expense.country),
    normalizeKeyPart(expense.title ?? expense.description),
    normalizeKeyPart(expense.detail ?? expense.details),
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

const findTripAIQualityIssues = (plan: TripAIPlan) => {
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

export async function generateTripPlan(input: TripAIInput): Promise<TripAIPlan> {
  assertValidDateRange(input.startDate, input.endDate);

  const { data, error } = await supabase.functions.invoke('generate-trip-plan', {
    body: input,
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

  const plan = normalizeTripAIPlan(data);
  const qualityIssues = findTripAIQualityIssues(plan);
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
  const qualityIssues = findTripAIQualityIssues(plan);
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
  const scopedPlan = scopePlanToAllowedCountries(plan, review.input.countries);

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
      .select('category,country,description,details')
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

  const insertions: Array<PromiseLike<{ error: unknown }>> = [];

  if (itineraryItemsToInsert.length) {
    insertions.push(
      supabase.from('itinerary_items').insert(
        itineraryItemsToInsert.map((item, index) =>
          itineraryPayload(item, groupId, userId, (itineraryResult.count ?? 0) + index),
        ),
      ),
    );
  }

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
      plan: normalizeTripAIPlan(parsed.plan),
    };
  } catch {
    return null;
  }
}

export function clearTripAIReview() {
  sessionStorage.removeItem(REVIEW_STORAGE_KEY);
}
