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
} from '../types';
import { normalizeLinks } from '../utils/links';
import { supabase } from './supabaseClient';

const REVIEW_STORAGE_KEY = 'controle-viagem-ai-review-v1';
const validCountries: CountryId[] = ['italy', 'switzerland', 'france', 'international'];
const validTypes: ItineraryType[] = [
  'arrival',
  'lodging',
  'tour',
  'transport',
  'food',
  'flight',
  'train',
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

const stripDiacritics = (value: string) =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const normalizeCountry = (value: unknown): CountryId => {
  const normalized = stripDiacritics(asString(value));
  if (validCountries.includes(normalized as CountryId)) return normalized as CountryId;
  if (normalized.includes('ital')) return 'italy';
  if (normalized.includes('suic') || normalized.includes('switz')) return 'switzerland';
  if (normalized.includes('franc') || normalized.includes('france')) return 'france';
  return 'international';
};

const normalizeType = (value: unknown): ItineraryType => {
  const normalized = stripDiacritics(asString(value));
  if (validTypes.includes(normalized as ItineraryType)) return normalized as ItineraryType;
  if (normalized.includes('hotel') || normalized.includes('hosped')) return 'lodging';
  if (normalized.includes('trem')) return 'train';
  if (normalized.includes('voo') || normalized.includes('flight')) return 'flight';
  if (normalized.includes('trans')) return 'transport';
  if (normalized.includes('comida') || normalized.includes('aliment')) return 'food';
  if (normalized.includes('chegada')) return 'arrival';
  if (normalized.includes('descanso')) return 'rest';
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

const normalizeLinkArray = (value: unknown): LinkItem[] => normalizeLinks(asArray<LinkItem>(value));

const normalizeDocument = (value: unknown): TripAIDocument => {
  if (typeof value === 'string') return { title: value, detail: '' };
  const record = asRecord(value);
  return {
    title: asString(record.title || record.name, 'Documento'),
    detail: asString(record.detail || record.description || record.notes),
  };
};

const normalizeRoute = (value: unknown): TripAIRoute => {
  const record = asRecord(value);
  return {
    from: asString(record.from, 'Origem'),
    to: asString(record.to, 'Destino'),
    transport: asString(record.transport, 'Transporte sugerido'),
    duration: asString(record.duration),
    notes: asString(record.notes),
  };
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

  return {
    id: crypto.randomUUID(),
    category: normalizeCategory(record.category),
    country: normalizeCountry(record.country),
    title: asString(record.title || record.description, 'Gasto planejado'),
    detail: detail.toLowerCase().includes('aproxim') ? detail : `${detail} Aproximado / planejado.`,
    euro: normalizeRange(record.euro),
    real: normalizeRange(record.real || record.brl),
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

export const normalizeTripAIPlan = (value: unknown): TripAIPlan => {
  const record = asRecord(value);
  const warnings = asArray<unknown>(record.warnings).map((warning) => asString(warning)).filter(Boolean);
  const requiredWarning = 'Confirme as exigencias oficiais antes da viagem.';

  return {
    generationId: asString(record.generationId) || undefined,
    summary: asString(record.summary, 'Previa de viagem gerada com IA.'),
    documents: asArray<unknown>(record.documents).map(normalizeDocument),
    routes: asArray<unknown>(record.routes).map(normalizeRoute),
    itinerary_items: asArray<unknown>(record.itinerary_items).map(normalizeItineraryItem),
    expenses: asArray<unknown>(record.expenses).map(normalizeExpense),
    attractions: asArray<unknown>(record.attractions).map(normalizeAttraction),
    warnings: warnings.some((warning) => stripDiacritics(warning).includes('exigencias oficiais'))
      ? warnings
      : [...warnings, requiredWarning],
  };
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

  return normalizeTripAIPlan(data);
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
  country: expense.country ?? 'international',
  description: expense.title,
  details: expense.detail || 'Valor aproximado planejado.',
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
  country: item.country,
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
  country: attraction.country,
  city: attraction.city || null,
  day: attraction.day || null,
  time: attraction.time || null,
  description: attraction.description || null,
  visited: false,
  links: normalizeLinks(attraction.links),
  order_index: orderIndex,
});

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

export async function applyTripPlan(review: TripAIReviewState, plan: TripAIPlan, feedback?: string) {
  const userId = await requireCurrentUserId();
  const { groupId } = review.input;

  const { error: groupError } = await supabase
    .from('travel_groups')
    .update({
      name: review.input.tripName,
      description: review.input.description || null,
      countries: review.input.countries,
      start_date: review.input.startDate || null,
      end_date: review.input.endDate || null,
      travel_style: review.input.style,
      notes: review.input.notes || null,
    })
    .eq('id', groupId);

  if (groupError) throw groupError;

  const [{ count: itineraryCount }, { count: attractionCount }] = await Promise.all([
    supabase
      .from('itinerary_items')
      .select('id', { count: 'exact', head: true })
      .eq('group_id', groupId),
    supabase
      .from('attractions')
      .select('id', { count: 'exact', head: true })
      .eq('group_id', groupId),
  ]);

  const insertions: Array<PromiseLike<{ error: unknown }>> = [];

  if (plan.itinerary_items.length) {
    insertions.push(
      supabase.from('itinerary_items').insert(
        plan.itinerary_items.map((item, index) =>
          itineraryPayload(item, groupId, userId, (itineraryCount ?? 0) + index),
        ),
      ),
    );
  }

  if (plan.expenses.length) {
    insertions.push(
      supabase.from('expenses').insert(
        plan.expenses.map((expense) => expensePayload(expense, groupId, userId)),
      ),
    );
  }

  if (plan.attractions.length) {
    insertions.push(
      supabase.from('attractions').insert(
        plan.attractions.map((attraction, index) =>
          attractionPayload(attraction, groupId, userId, (attractionCount ?? 0) + index),
        ),
      ),
    );
  }

  const results = await Promise.all(insertions);
  const failedResult = results.find((result) => result.error);

  if (failedResult?.error) throw failedResult.error;

  await updateTripGenerationFeedback(plan.generationId, 'applied', feedback);
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
