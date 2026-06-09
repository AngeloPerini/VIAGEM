import { createClient } from 'npm:@supabase/supabase-js@2';

type TripStyle = 'economica' | 'intermediaria' | 'confortavel';

type TripPlanInput = {
  tripName: string;
  countries: string[];
  cities: string[];
  description: string;
  startDate: string;
  endDate: string;
  style: TripStyle;
  groupId: string;
};

type QuotaProfile = {
  id?: string;
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

type DestinationRow = {
  country_code: string;
  country_name: string;
  city_name: string | null;
  overview: string;
  best_months: string | null;
  language: string | null;
  currency: string | null;
};

type AttractionContextRow = {
  country_code: string;
  country_name: string;
  city_name: string;
  name: string;
  category: string;
  description: string;
  suggested_duration_minutes: number | null;
  estimated_cost: number | null;
  currency: string | null;
  best_time_to_visit: string | null;
  official_url: string | null;
};

type TransportContextRow = {
  country_code: string;
  city_from: string | null;
  city_to: string | null;
  transport_type: string;
  duration_text: string | null;
  description: string;
  estimated_cost: number | null;
  currency: string | null;
};

type TravelDocumentContextRow = {
  country_code: string;
  country_name: string;
  document_name: string;
  description: string;
  required: boolean;
};

type DestinationContext = {
  destinations: DestinationRow[];
  attractions: AttractionContextRow[];
  transportTips: TransportContextRow[];
  documents: TravelDocumentContextRow[];
  countryCodes: string[];
  selectedCities: string[];
  mentionedCities: string[];
  onlyCountryProvided: boolean;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const unlimitedAiTesterEmails = new Set(['r.perini351@gmail.com']);
const PROMPT_VERSION = 'tripflow-ai-rag-v2';
const DESCRIPTION_MAX_LENGTH = 2500;
const INVALID_DATE_RANGE_MESSAGE = 'A data final não pode ser anterior à data inicial.';

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

const normalizeTextList = (value: unknown) => {
  const rawValues = Array.isArray(value) ? value : value ? [value] : [];
  const seen = new Set<string>();

  return rawValues
    .flatMap((item) => String(item).split(/[,\n;/|]+/))
    .map((item) => item.trim())
    .filter((item) => {
      if (!item) return false;
      const key = item.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const normalizeInput = (payload: Record<string, unknown>): TripPlanInput => {
  const countries = normalizeCountryList(payload.countries);
  const cities = normalizeTextList(payload.cities ?? payload.cityNames ?? payload.city);

  const style = isTripStyle(payload.style) ? payload.style : 'intermediaria';
  const input = {
    tripName: String(payload.tripName ?? '').trim(),
    countries,
    cities,
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
  assertValidDateRange(input.startDate, input.endDate);
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

const getMaxCompletionTokens = (input: TripPlanInput) => {
  const tripDays = getTripDayCount(input);
  if (tripDays > 15) return 8500;
  if (tripDays >= 10) return 7500;
  return 5500;
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
  japao: 'japan',
  japão: 'japan',
  japan: 'japan',
};

const defaultCitiesByCountry: Record<string, string[]> = {
  england: ['Londres', 'Oxford', 'Bath'],
  scotland: ['Edimburgo', 'Stirling', 'Glasgow'],
  united_kingdom: ['Londres', 'Edimburgo', 'York'],
  great_britain: ['Londres', 'Edimburgo', 'York'],
  france: ['Paris', 'Nice'],
  italy: ['Roma', 'Florença', 'Veneza', 'Milão'],
  switzerland: ['Zurique', 'Lucerna', 'Interlaken', 'Zermatt'],
  japan: ['Tokyo', 'Kyoto', 'Osaka'],
  united_states: ['Nova York', 'Washington', 'Boston'],
  brazil: ['São Paulo', 'Rio de Janeiro', 'Brasília'],
};

const defaultAttractionsByCountry: Record<string, Array<{ name: string; city: string; description: string }>> = {
  england: [
    { name: 'British Museum', city: 'Londres', description: 'Museu clássico para história e cultura.' },
    { name: 'Westminster', city: 'Londres', description: 'Região histórica para caminhar e fotografar.' },
    { name: 'Tower Bridge', city: 'Londres', description: 'Ponte icônica próxima à Torre de Londres.' },
  ],
  scotland: [
    { name: 'Castelo de Edimburgo', city: 'Edimburgo', description: 'Castelo histórico com vista da cidade.' },
    { name: 'Royal Mile', city: 'Edimburgo', description: 'Eixo turístico do centro antigo.' },
    { name: 'Calton Hill', city: 'Edimburgo', description: 'Mirante urbano para pôr do sol.' },
  ],
  france: [
    { name: 'Torre Eiffel', city: 'Paris', description: 'Marco clássico da cidade.' },
    { name: 'Museu do Louvre', city: 'Paris', description: 'Museu essencial para arte e história.' },
    { name: 'Montmartre', city: 'Paris', description: 'Bairro turístico para caminhada.' },
  ],
  italy: [
    { name: 'Coliseu', city: 'Roma', description: 'Anfiteatro histórico da Roma Antiga.' },
    { name: 'Fórum Romano', city: 'Roma', description: 'Sítio arqueológico central da Roma Antiga.' },
    { name: 'Palatino', city: 'Roma', description: 'Colina histórica ligada à fundação de Roma.' },
    { name: 'Fontana di Trevi', city: 'Roma', description: 'Praça e fonte clássica para visita rápida.' },
    { name: 'Pantheon', city: 'Roma', description: 'Templo romano preservado no centro histórico.' },
    { name: 'Piazza Navona', city: 'Roma', description: 'Praça barroca com fontes e movimento local.' },
    { name: 'Trastevere', city: 'Roma', description: 'Bairro histórico para jantar e caminhada noturna.' },
    { name: 'Museus Vaticanos', city: 'Roma', description: 'Museus do Vaticano com a Capela Sistina.' },
    { name: 'Duomo de Florença', city: 'Florença', description: 'Catedral renascentista e símbolo da cidade.' },
    { name: 'Duomo de Milão', city: 'Milão', description: 'Catedral central e mirante urbano.' },
  ],
  switzerland: [
    { name: 'Lago de Lucerna', city: 'Lucerna', description: 'Passeio cênico junto ao lago.' },
    { name: 'Centro histórico de Zurique', city: 'Zurique', description: 'Ruas históricas e margem do rio.' },
    { name: 'Harder Kulm', city: 'Interlaken', description: 'Mirante alpino acessível por funicular.' },
  ],
  japan: [
    { name: 'Senso-ji', city: 'Tokyo', description: 'Templo histórico em Asakusa.' },
    { name: 'Shibuya Crossing', city: 'Tokyo', description: 'Cruzamento icônico para caminhar e fotografar.' },
    { name: 'Tokyo Skytree', city: 'Tokyo', description: 'Torre panorâmica com vista ampla da cidade.' },
    { name: 'Meiji Jingu', city: 'Tokyo', description: 'Santuário xintoísta em área arborizada de Harajuku.' },
    { name: 'Ueno Park', city: 'Tokyo', description: 'Parque com museus, lago e áreas de caminhada.' },
    { name: 'Akihabara', city: 'Tokyo', description: 'Bairro de eletrônicos, cultura pop e lojas temáticas.' },
    { name: 'Tsukiji Outer Market', city: 'Tokyo', description: 'Mercado gastronômico para cafés, frutos do mar e snacks.' },
    { name: 'teamLab Planets', city: 'Tokyo', description: 'Experiência imersiva de arte digital em Toyosu.' },
    { name: 'Fushimi Inari', city: 'Kyoto', description: 'Santuário famoso pelos portais vermelhos.' },
    { name: 'Kiyomizu-dera', city: 'Kyoto', description: 'Templo com varanda de madeira e vista da cidade.' },
    { name: 'Dotonbori', city: 'Osaka', description: 'Bairro turístico para noite e gastronomia.' },
  ],
  united_states: [
    { name: 'Central Park', city: 'Nova York', description: 'Parque urbano clássico para caminhada.' },
    { name: 'Times Square', city: 'Nova York', description: 'Região turística iluminada e movimentada.' },
    { name: 'National Mall', city: 'Washington', description: 'Eixo de monumentos e museus.' },
  ],
  brazil: [
    { name: 'Avenida Paulista', city: 'São Paulo', description: 'Região cultural e gastronômica.' },
    { name: 'Cristo Redentor', city: 'Rio de Janeiro', description: 'Mirante e atração icônica.' },
    { name: 'Praça dos Três Poderes', city: 'Brasília', description: 'Conjunto arquitetônico e cívico.' },
  ],
};

const brazilCityKeys = new Set([
  'sao_paulo',
  'rio_de_janeiro',
  'brasilia',
  'salvador',
  'recife',
  'fortaleza',
  'curitiba',
  'belo_horizonte',
  'porto_alegre',
]);

const internationalCountryKeys = new Set(['international', 'internacional']);

const countryKey = (value: unknown) => {
  const key = normalizeKey(value);
  return countryAliases[key] ?? key;
};

const cityAliases: Record<string, string> = {
  toquio: 'tokyo',
  tokyo: 'tokyo',
  kyoto: 'kyoto',
  osaka: 'osaka',
  roma: 'roma',
  rome: 'roma',
  florenca: 'florenca',
  florence: 'florenca',
  veneza: 'veneza',
  venice: 'veneza',
  milao: 'milao',
  milan: 'milao',
  paris: 'paris',
  nice: 'nice',
  zurique: 'zurique',
  zurich: 'zurique',
  lucerna: 'lucerna',
  lucerne: 'lucerna',
  interlaken: 'interlaken',
  zermatt: 'zermatt',
  rio_de_janeiro: 'rio_de_janeiro',
  sao_paulo: 'sao_paulo',
};

const cityKey = (value: unknown) => {
  const key = normalizeKey(value);
  return cityAliases[key] ?? key;
};

const normalizeCurrencyCode = (value: unknown) => {
  const code = asText(value, 'EUR').toUpperCase();
  return ['BRL', 'EUR', 'USD', 'JPY', 'CHF', 'GBP'].includes(code) ? code : 'EUR';
};

const currencyForCountry = (country: string) => {
  const key = countryKey(country);
  if (['england', 'scotland', 'united_kingdom', 'great_britain'].includes(key)) return 'GBP';
  if (key === 'switzerland') return 'CHF';
  if (key === 'japan') return 'JPY';
  if (key === 'united_states') return 'USD';
  if (key === 'brazil') return 'BRL';
  return 'EUR';
};

const uniqueTexts = (items: string[]) => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = cityKey(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const compactPromptText = (value: unknown, maxLength = 180) => {
  const text = asText(value).replace(/\s+/g, ' ');
  return text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 3))}...` : text;
};

const citySortValue = (countryCode: string, city: string) => {
  const preferred = defaultCitiesByCountry[countryCode] ?? [];
  const index = preferred.findIndex((preferredCity) => cityKey(preferredCity) === cityKey(city));
  return index >= 0 ? index : 1000;
};

const getCityBudgetPerCountry = (input: TripPlanInput) => {
  const tripDays = getTripDayCount(input);
  const countryCount = Math.max(1, input.countries.length);
  const daysPerCountry = Math.max(1, Math.ceil(tripDays / countryCount));

  if (daysPerCountry <= 3) return 1;
  if (daysPerCountry <= 6) return 2;
  if (daysPerCountry <= 10) return 3;
  return 4;
};

const emptyDestinationContext = (input: TripPlanInput): DestinationContext => ({
  destinations: [],
  attractions: [],
  transportTips: [],
  documents: [],
  countryCodes: input.countries.map(countryKey).filter(Boolean),
  selectedCities: [],
  mentionedCities: input.cities,
  onlyCountryProvided: input.cities.length === 0,
});

const fetchDestinationContext = async (
  adminSupabase: ReturnType<typeof createClient>,
  input: TripPlanInput,
): Promise<DestinationContext> => {
  const countryCodes = [...new Set(input.countries.map(countryKey).filter(Boolean))];
  if (!countryCodes.length) return emptyDestinationContext(input);

  const [
    destinationsResult,
    attractionsResult,
    transportResult,
    documentsResult,
  ] = await Promise.all([
    adminSupabase
      .from('ai_destinations')
      .select('country_code,country_name,city_name,overview,best_months,language,currency')
      .in('country_code', countryCodes),
    adminSupabase
      .from('ai_attractions')
      .select('country_code,country_name,city_name,name,category,description,suggested_duration_minutes,estimated_cost,currency,best_time_to_visit,official_url')
      .in('country_code', countryCodes),
    adminSupabase
      .from('ai_transport_tips')
      .select('country_code,city_from,city_to,transport_type,duration_text,description,estimated_cost,currency')
      .in('country_code', countryCodes),
    adminSupabase
      .from('ai_travel_documents')
      .select('country_code,country_name,document_name,description,required')
      .in('country_code', countryCodes),
  ]);

  const contextErrors = [
    destinationsResult.error,
    attractionsResult.error,
    transportResult.error,
    documentsResult.error,
  ].filter(Boolean);

  if (contextErrors.length) {
    throw new Error(`Nao foi possivel buscar contexto real de destinos: ${contextErrors.map((error) => error?.message).join('; ')}`);
  }

  const destinations = (destinationsResult.data ?? []) as DestinationRow[];
  const attractions = (attractionsResult.data ?? []) as AttractionContextRow[];
  const transportTips = (transportResult.data ?? []) as TransportContextRow[];
  const documents = (documentsResult.data ?? []) as TravelDocumentContextRow[];
  const userText = normalizeKey([
    input.tripName,
    input.description,
    ...input.cities,
  ].join(' '));
  const requestedCityKeys = new Set(input.cities.map(cityKey));
  const allCityRows = destinations
    .filter((destination) => asText(destination.city_name))
    .sort((a, b) => {
      const countryComparison = a.country_code.localeCompare(b.country_code);
      if (countryComparison !== 0) return countryComparison;

      const cityA = asText(a.city_name);
      const cityB = asText(b.city_name);
      const orderA = citySortValue(a.country_code, cityA);
      const orderB = citySortValue(b.country_code, cityB);
      if (orderA !== orderB) return orderA - orderB;
      return cityA.localeCompare(cityB);
    });

  const mentionedCities = uniqueTexts(
    allCityRows
      .map((destination) => asText(destination.city_name))
      .filter((city) => {
        const key = cityKey(city);
        return requestedCityKeys.has(key) || (Boolean(key) && userText.includes(key));
      }),
  );
  const mentionedCityKeys = new Set(mentionedCities.map(cityKey));
  const selectedCities = uniqueTexts(
    countryCodes.flatMap((countryCode) => {
      const countryCities = allCityRows
        .filter((destination) => destination.country_code === countryCode)
        .map((destination) => asText(destination.city_name))
        .filter(Boolean);
      const mentionedForCountry = countryCities.filter((city) => mentionedCityKeys.has(cityKey(city)));
      if (mentionedForCountry.length) return mentionedForCountry;
      return countryCities.slice(0, getCityBudgetPerCountry(input));
    }),
  );
  const selectedCityKeys = new Set(selectedCities.map(cityKey));
  const relevantAttractions = attractions
    .filter((attraction) => !selectedCityKeys.size || selectedCityKeys.has(cityKey(attraction.city_name)))
    .sort((a, b) => {
      const countryComparison = a.country_code.localeCompare(b.country_code);
      if (countryComparison !== 0) return countryComparison;

      const orderA = citySortValue(a.country_code, a.city_name);
      const orderB = citySortValue(b.country_code, b.city_name);
      if (orderA !== orderB) return orderA - orderB;
      return a.name.localeCompare(b.name);
    })
    .slice(0, 90);

  return {
    destinations,
    attractions: relevantAttractions,
    transportTips: transportTips.slice(0, 35),
    documents,
    countryCodes,
    selectedCities,
    mentionedCities,
    onlyCountryProvided: input.cities.length === 0 && mentionedCities.length === 0,
  };
};

const getDestinationContextWarnings = (context: DestinationContext) => {
  const warnings: string[] = [];

  if (context.onlyCountryProvided && context.selectedCities.length) {
    warnings.push('Você informou apenas o país. A IA sugeriu cidades principais para a viagem.');
  }

  if (!context.destinations.length && !context.attractions.length) {
    warnings.push('A base local de destinos nao trouxe contexto suficiente; revise cidades e detalhes antes de aplicar.');
  }

  return warnings;
};

const buildDestinationSummary = (input: TripPlanInput, context: DestinationContext) => {
  const citySummary = context.selectedCities.length ? `; cidades: ${context.selectedCities.join(', ')}` : '';
  return compactPromptText(`${input.countries.join(', ')}${citySummary}`, 500) || 'Destino nao informado';
};

const buildDestinationContextPrompt = (input: TripPlanInput, context: DestinationContext) => {
  if (!context.destinations.length && !context.attractions.length) {
    return input.countries
      .map((country) => {
        const key = countryKey(country);
        const cities = defaultCitiesByCountry[key] ?? [];
        const attractions = defaultAttractionsByCountry[key] ?? [];
        const hintParts = [
          cities.length ? `cidades reais sugeridas: ${cities.join(', ')}` : '',
          attractions.length
            ? `atracoes reais conhecidas: ${attractions.map((attraction) => `${attraction.name} (${attraction.city})`).join(', ')}`
            : '',
        ].filter(Boolean);

        return hintParts.length ? `- ${country}: ${hintParts.join('; ')}` : `- ${country}: use cidades e atracoes reais verificaveis.`;
      })
      .join('\n');
  }

  const selectedCityKeys = new Set(context.selectedCities.map(cityKey));
  const destinationLines = context.destinations
    .filter((destination) => !destination.city_name || !selectedCityKeys.size || selectedCityKeys.has(cityKey(destination.city_name)))
    .map((destination) => {
      const city = destination.city_name ? `${destination.city_name}, ` : '';
      const facts = [
        destination.best_months ? `melhores meses: ${destination.best_months}` : '',
        destination.language ? `idioma: ${destination.language}` : '',
        destination.currency ? `moeda: ${destination.currency}` : '',
      ].filter(Boolean).join('; ');

      return `- ${city}${destination.country_name}: ${compactPromptText(destination.overview)}${facts ? ` (${facts})` : ''}`;
    })
    .join('\n');
  const attractionLines = context.attractions
    .map((attraction) => {
      const cost = attraction.estimated_cost == null
        ? ''
        : `; custo aprox.: ${attraction.estimated_cost} ${attraction.currency ?? currencyForCountry(attraction.country_code)}`;
      const duration = attraction.suggested_duration_minutes ? `; duração: ${attraction.suggested_duration_minutes} min` : '';
      const bestTime = attraction.best_time_to_visit ? `; melhor horario: ${attraction.best_time_to_visit}` : '';
      return `- ${attraction.name} (${attraction.city_name}, ${attraction.country_name}; ${attraction.category}${duration}${cost}${bestTime}): ${compactPromptText(attraction.description)}`;
    })
    .join('\n');
  const transportLines = context.transportTips
    .map((tip) => {
      const route = [tip.city_from, tip.city_to].filter(Boolean).join(' -> ') || tip.country_code;
      const cost = tip.estimated_cost == null ? '' : `; custo aprox.: ${tip.estimated_cost} ${tip.currency ?? currencyForCountry(tip.country_code)}`;
      return `- ${route}: ${tip.transport_type}${tip.duration_text ? `, ${tip.duration_text}` : ''}${cost}. ${compactPromptText(tip.description)}`;
    })
    .join('\n');
  const documentLines = context.documents
    .map((document) =>
      `- ${document.country_name}: ${document.document_name} (${document.required ? 'geralmente obrigatorio' : 'checklist/recomendado'}) - ${compactPromptText(document.description)}`,
    )
    .join('\n');
  const selectedCitiesLine = context.selectedCities.length
    ? `Cidades priorizadas para esta duracao: ${context.selectedCities.join(', ')}.`
    : 'Cidades priorizadas: use apenas cidades reais do contexto.';
  const countryOnlyLine = context.onlyCountryProvided
    ? 'O usuario informou apenas pais. Sugira cidades principais coerentes com a duracao, sem usar cidade generica.'
    : 'O usuario informou ou sugeriu cidade no texto; priorize as cidades mencionadas quando existirem no contexto.';

  return [
    selectedCitiesLine,
    countryOnlyLine,
    'Destinos:',
    destinationLines || '- Sem resumo de destino cadastrado.',
    'Atracoes reais disponiveis:',
    attractionLines || '- Sem atracoes cadastradas para o recorte; gere menos itens e use apenas nomes reais que voce tenha alta confianca.',
    'Rotas e transportes reais:',
    transportLines || '- Sem rotas cadastradas; use somente rotas com origem e destino reais.',
    'Documentos/checklist por destino:',
    documentLines || '- Inclua documentos gerais com linguagem de verificacao atualizada.',
  ].join('\n');
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

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return Number.isNaN(date.getTime()) ? null : date;
};

const assertValidDateRange = (startDate: string, endDate: string) => {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);

  if (!start || !end) {
    throw new InputValidationError('INVALID_INPUT', 'Informe datas válidas no formato YYYY-MM-DD.');
  }

  if (end < start) {
    throw new InputValidationError('INVALID_DATE_RANGE', INVALID_DATE_RANGE_MESSAGE);
  }
};

const isDateWithinTripRange = (dateValue: string, input: TripPlanInput) => {
  const date = parseDateOnly(dateValue);
  const start = parseDateOnly(input.startDate);
  const end = parseDateOnly(input.endDate);

  return Boolean(date && start && end && date >= start && date <= end);
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

const getCountryForDay = (input: TripPlanInput, dayNumber: number) =>
  input.countries[(Math.max(1, dayNumber) - 1) % Math.max(1, input.countries.length)] ??
  input.countries[0] ??
  'international';

const getDefaultCityForCountry = (country: string, dayNumber = 1) => {
  const cities = defaultCitiesByCountry[countryKey(country)] ?? [country];
  return cities[(Math.max(1, dayNumber) - 1) % cities.length] ?? country;
};

const sanitizeCityForCountry = (city: unknown, country: string, dayNumber = 1) => {
  const rawCity = asText(city);
  const normalizedCity = normalizeKey(rawCity);
  const normalizedCountry = countryKey(country);

  if (!rawCity) return getDefaultCityForCountry(country, dayNumber);
  if (normalizedCountry !== 'brazil' && brazilCityKeys.has(normalizedCity)) {
    return getDefaultCityForCountry(country, dayNumber);
  }

  return rawCity;
};

const getDefaultAttractionSeed = (country: string, dayNumber = 1, offset = 0) => {
  const seeds = defaultAttractionsByCountry[countryKey(country)] ?? [];
  if (!seeds.length) return null;

  return seeds[(Math.max(1, dayNumber) - 1 + offset) % seeds.length];
};

type SupplementalSlot = {
  time: string;
  type: string;
  title: (country: string, city: string, dayNumber: number) => string;
  description: (country: string, city: string, dayNumber: number) => string;
};

const supplementalSlots = [
  {
    time: '08h30',
    type: 'alimentacao',
    title: (_country, city) => `Café e planejamento em ${city}`,
    description: (_country, city) => `Comece perto de ${city} e revise reservas e deslocamentos do dia.`,
  },
  {
    time: '09h30',
    type: 'passeio',
    title: (country, city, dayNumber) => {
      const seed = getDefaultAttractionSeed(country, dayNumber, 0);
      return seed ? `Visita a ${seed.name}` : `Caminhada pelo centro histórico de ${city}`;
    },
    description: (country, city, dayNumber) => getDefaultAttractionSeed(country, dayNumber, 0)?.description ??
      `Explore uma área central real de ${city}, ajustando conforme reservas e deslocamento.`,
  },
  {
    time: '12h30',
    type: 'alimentacao',
    title: (_country, city) => `Almoço em ${city}`,
    description: (_country, city) => `Pausa para refeição perto do roteiro da manhã em ${city}.`,
  },
  {
    time: '14h30',
    type: 'passeio',
    title: (country, city, dayNumber) => {
      const seed = getDefaultAttractionSeed(country, dayNumber, 1);
      return seed ? `Passeio por ${seed.name}` : `Passeio por bairro central de ${city}`;
    },
    description: (country, city, dayNumber) => getDefaultAttractionSeed(country, dayNumber, 1)?.description ??
      `Agrupe pontos próximos em ${city} para evitar deslocamentos longos.`,
  },
  {
    time: '18h00',
    type: 'descanso',
    title: (_country, city) => `Descanso antes da noite em ${city}`,
    description: (_country, city) => `Tempo para banho, pausa e organização antes do jantar em ${city}.`,
  },
  {
    time: '20h00',
    type: 'alimentacao',
    title: (_country, city) => `Jantar em ${city}`,
    description: (_country, city) => `Escolha uma região movimentada e segura de ${city} para fechar o dia.`,
  },
] satisfies SupplementalSlot[];

const compactLongTripSlots = [
  {
    time: '09h00',
    type: 'passeio',
    title: (country: string, city: string, dayNumber: number) => {
      const seed = getDefaultAttractionSeed(country, dayNumber, 0);
      return seed ? `Manhã em ${seed.name}` : `Manhã em ${city}`;
    },
    description: (country: string, city: string, dayNumber: number) => getDefaultAttractionSeed(country, dayNumber, 0)?.description ??
      `Explore ${city} com ritmo realista e pausas curtas.`,
  },
  {
    time: '15h00',
    type: 'passeio',
    title: (country: string, city: string, dayNumber: number) => {
      const seed = getDefaultAttractionSeed(country, dayNumber, 1);
      return seed ? `Tarde em ${seed.name}` : `Tarde em ${city}`;
    },
    description: (country: string, city: string, dayNumber: number) => getDefaultAttractionSeed(country, dayNumber, 1)?.description ??
      `Complete o dia com pontos próximos em ${city}.`,
  },
] satisfies SupplementalSlot[];

const completeItineraryItems = (items: Record<string, unknown>[], input: TripPlanInput) => {
  const tripDays = getTripDayCount(input);
  const isLongTrip = tripDays > 15;
  const minimumBlocksPerDay = isLongTrip ? 2 : 4;
  const slots = isLongTrip ? compactLongTripSlots : supplementalSlots;
  const byDay = new Map<number, Record<string, unknown>[]>();

  items.forEach((item) => {
    const dayNumber = Math.min(tripDays, Math.max(1, getDayNumberFromItem(item) ?? 1));
    byDay.set(dayNumber, [...(byDay.get(dayNumber) ?? []), item]);
  });

  for (let dayNumber = 1; dayNumber <= tripDays; dayNumber += 1) {
    const currentItems = [...(byDay.get(dayNumber) ?? [])].sort((a, b) => getTimeMinutes(a.time) - getTimeMinutes(b.time));
    const dayCountry = asText(currentItems.find((item) => asText(item.country) && asText(item.country) !== 'international')?.country) ||
      getCountryForDay(input, dayNumber);
    const city = asText(currentItems.find((item) => asText(item.city))?.city) ||
      getDefaultCityForCountry(dayCountry, dayNumber);
    const date = asText(currentItems.find((item) => asText(item.date))?.date) || getDateForDay(input, dayNumber);
    const day = `Dia ${dayNumber}${date ? ` - ${date}` : ''}`;
    let slotIndex = 0;

    while (currentItems.length < minimumBlocksPerDay && slotIndex < slots.length) {
      const slot = slots[slotIndex];
      slotIndex += 1;

      const hasSameTime = currentItems.some((item) => asText(item.time) === slot.time);
      if (hasSameTime) continue;

      currentItems.push({
        day,
        date,
        time: slot.time,
        country: dayCountry,
        city,
        title: slot.title(dayCountry, city, dayNumber),
        description: slot.description(dayCountry, city, dayNumber),
        type: slot.type,
        order_index: currentItems.length,
        links: [],
      });
    }

    byDay.set(dayNumber, currentItems);
  }

  return Array.from(byDay.entries())
    .sort(([dayA], [dayB]) => dayA - dayB)
    .flatMap(([, dayItems]) => dayItems)
    .sort((a, b) => {
      const dayA = getDayNumberFromItem(a) ?? 0;
      const dayB = getDayNumberFromItem(b) ?? 0;
      if (dayA !== dayB) return dayA - dayB;
      return getTimeMinutes(a.time) - getTimeMinutes(b.time);
    })
    .map((item, index) => ({ ...item, order_index: index }));
};

const createFallbackExpenses = (input: TripPlanInput) => {
  const primaryCountry = input.countries[0] ?? 'international';
  const primaryCurrency = currencyForCountry(primaryCountry);
  const lodgingAmount = input.style === 'confortavel' ? 180 : input.style === 'economica' ? 80 : 120;
  const foodAmount = input.style === 'confortavel' ? 65 : input.style === 'economica' ? 30 : 45;

  return [
    { category: 'Hospedagem', title: 'Hospedagem base', detail: 'Estimativa por diária', amount: lodgingAmount, country: primaryCountry, currency: primaryCurrency },
    { category: 'Transporte', title: 'Transporte local', detail: 'Metrô, ônibus, trem ou táxi', amount: input.style === 'confortavel' ? 45 : 25, country: primaryCountry, currency: primaryCurrency },
    { category: 'Passeios', title: 'Ingressos e experiências', detail: 'Museus, mirantes e atrações principais', amount: input.style === 'economica' ? 35 : 70, country: primaryCountry, currency: primaryCurrency },
    { category: 'Alimentacao', title: 'Alimentação diária', detail: 'Cafés, almoços e jantares', amount: foodAmount, country: primaryCountry, currency: primaryCurrency },
    { category: 'Seguro', title: 'Seguro viagem', detail: 'Estimativa geral', amount: 60, country: primaryCountry, currency: 'BRL' },
    { category: 'Outros', title: 'Reserva para imprevistos', detail: 'Margem de segurança', amount: 100, country: primaryCountry, currency: primaryCurrency },
  ];
};

const createFallbackPlan = (input: TripPlanInput, warning: string) =>
  ensurePlanShape({
    summary: `Prévia estruturada para ${input.tripName}.`,
    documents: [
      {
        name: 'Documento de viagem',
        description: 'Confira passaporte, vistos, reservas e seguro antes do embarque. Verifique a exigência atual antes da viagem.',
        required: true,
        category: 'Documentos',
      },
    ],
    routes: input.countries.length > 1
      ? input.countries.slice(0, -1).map((country, index) => ({
          from: getDefaultCityForCountry(country, index + 1),
          to: getDefaultCityForCountry(input.countries[index + 1], index + 2),
          transport: input.description.toLowerCase().includes('motorhome') ? 'motorhome' : 'trem/avião',
          duration: '2h a 5h',
          estimatedCost: 'A confirmar',
          notes: 'Ajuste horário conforme reservas reais.',
        }))
      : [],
    itinerary_items: [],
    expenses: createFallbackExpenses(input),
    attractions: createFallbackAttractions(input, []),
    warnings: [warning],
  }, input);

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

const genericPlaceholderPatterns = [
  /ponto\s+turistico\s+principal/,
  /ponto\s+turistico$/,
  /atracao\s+principal/,
  /atracao\s+local/,
  /atividade\s+cultural/,
  /atividade\s+sugerida/,
  /cidade\s+escolhida/,
  /regiao\s+escolhida/,
  /ponto\s+importante/,
  /passeio\s+importante/,
  /destino\s+principal/,
  /local\s+importante/,
  /local\s+famoso\s+da\s+cidade/,
  /visite\s+a\s+regiao\s+escolhida/,
  /regiao\s+principal/,
  /bairro\s+turistico$/,
  /international\s*->/,
];

const hasGenericPlaceholder = (...values: unknown[]) => {
  const text = stripDiacritics(values.map((value) => asText(value)).filter(Boolean).join(' '));
  return Boolean(text) && genericPlaceholderPatterns.some((pattern) => pattern.test(text));
};

const usesInternationalAsCity = (value: unknown) => {
  const key = normalizeKey(value);
  return key === 'international' || key === 'internacional';
};

const findGenericContentIssues = (plan: Record<string, unknown>) => {
  const issues: string[] = [];

  asRecords(plan.itinerary_items).forEach((item, index) => {
    if (hasGenericPlaceholder(item.title) || hasGenericPlaceholder(item.description) || hasGenericPlaceholder(item.city)) {
      issues.push(`itinerary_items[${index}] generico`);
    }
    if (usesInternationalAsCity(item.city)) {
      issues.push(`itinerary_items[${index}] usa international como city`);
    }
  });

  asRecords(plan.attractions).forEach((attraction, index) => {
    if (
      hasGenericPlaceholder(attraction.name ?? attraction.title) ||
      hasGenericPlaceholder(attraction.description) ||
      hasGenericPlaceholder(attraction.city)
    ) {
      issues.push(`attractions[${index}] generica`);
    }
    if (usesInternationalAsCity(attraction.city)) {
      issues.push(`attractions[${index}] usa international como city`);
    }
  });

  asRecords(plan.routes).forEach((route, index) => {
    if (usesInternationalAsCity(route.from) || usesInternationalAsCity(route.to)) {
      issues.push(`routes[${index}] usa international como origem/destino generico`);
    }
  });

  return issues;
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

const createFallbackAttractions = (input: TripPlanInput, itineraryItems: Record<string, unknown>[]) => {
  const usedDays = new Map<string, string>();
  itineraryItems.forEach((item) => {
    const country = asText(item.country);
    if (!country || internationalCountryKeys.has(countryKey(country))) return;
    if (!usedDays.has(country)) usedDays.set(country, asText(item.day).split(' - ')[0] || 'Dia 1');
  });

  return input.countries.flatMap((country) => {
    const seeds = defaultAttractionsByCountry[countryKey(country)] ?? [];

    return seeds.slice(0, 3).map((seed, index) => ({
      ...seed,
      country,
      day: usedDays.get(country) ?? `Dia ${index + 1}`,
      time: index === 0 ? '09h30' : index === 1 ? '14h30' : '16h30',
      links: [],
    }));
  });
};

const flattenStructuredDays = (plan: Record<string, unknown>) =>
  asRecords(plan.days).flatMap((dayRecord) => {
    const dayNumber = Number(dayRecord.day_number ?? dayRecord.dayNumber ?? 1);
    const dayLabel = Number.isFinite(dayNumber) && dayNumber > 0 ? `Dia ${dayNumber}` : asText(dayRecord.day, 'Dia 1');
    const date = asText(dayRecord.date);
    const dayCity = asText(dayRecord.city);
    const dayCountry = asText(dayRecord.country);

    return asRecords(dayRecord.activities).map((activity, index) => ({
      day: dayLabel,
      date,
      time: asText(activity.time),
      country: asText(activity.country, dayCountry),
      city: asText(activity.city, dayCity),
      title: asText(activity.title),
      description: asText(activity.description || activity.details),
      type: asText(activity.type || activity.category, 'passeio'),
      order_index: Number(activity.order_index ?? activity.orderIndex ?? index),
      links: safeArray(activity.links ?? activity.useful_links),
    }));
  });

const normalizeExternalPlanShape = (value: unknown) => {
  const plan = asRecord(value);
  const itineraryItems = asRecords(plan.itinerary_items);

  return {
    ...plan,
    summary: asText(plan.summary || plan.trip_summary),
    itinerary_items: itineraryItems.length ? itineraryItems : flattenStructuredDays(plan),
    routes: asRecords(plan.routes).map((route) => ({
      ...route,
      transport: asText(route.transport || route.transport_type),
      estimatedCost: asText(route.estimatedCost || route.estimated_cost || route.cost),
      notes: asText(route.notes || route.description),
    })),
    expenses: asRecords(plan.expenses).map((expense) => ({
      ...expense,
      title: asText(expense.title || expense.description || expense.category),
      detail: asText(expense.detail || expense.details || expense.description),
      amount: Number(expense.amount ?? expense.estimated_cost ?? expense.value ?? 0),
    })),
    attractions: asRecords(plan.attractions).map((attraction) => ({
      ...attraction,
      day: asText(attraction.day || (attraction.suggested_day ? `Dia ${attraction.suggested_day}` : '')),
      time: asText(attraction.time || attraction.suggested_time),
    })),
  };
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
  const plan = normalizeExternalPlanShape(value);
  const countryMap = buildCountryMap(input);
  const fallbackCountry = input.countries[0] ?? 'international';
  const tripDays = getTripDayCount(input);
  const warnings = safeArray(plan.warnings).map(String).filter(Boolean);
  const requiredWarning = 'Confirme as exigencias oficiais antes da viagem.';

  const normalizedItineraryItems = uniqueByKey(
    asRecords(plan.itinerary_items)
      .map((item, index) => {
        const inferredDay = Math.min(tripDays, Math.floor(index / 6) + 1);
        const dayNumber = Math.min(tripDays, getDayNumberFromItem(item) ?? inferredDay);
        const expectedDate = getDateForDay(input, dayNumber);
        const rawDate = asText(item.date);
        const date = rawDate && isDateWithinTripRange(rawDate, input) ? rawDate : expectedDate;
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
          city: sanitizeCityForCountry(item.city, country, dayNumber),
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

  const itineraryItems = completeItineraryItems(normalizedItineraryItems, input);
  const itineraryWasSupplemented = itineraryItems.length > normalizedItineraryItems.length;

  const normalizedExpenses = uniqueByKey(
    asRecords(plan.expenses)
      .map((expense) => {
        const normalizedExpense = {
          ...expense,
          category: asText(expense.category, 'Outros'),
          title: asText(expense.title ?? expense.description, 'Gasto planejado'),
          detail: asText(expense.detail ?? expense.details, 'Aproximado / planejado'),
          amount: Number(expense.amount ?? expense.value ?? 0),
          links: safeArray(expense.links),
        };
        const country = resolvePlanCountry(expense.country, countryMap, fallbackCountry, normalizedExpense, {
          allowInternational: true,
          allowTransportFallback: true,
        });
        if (!country) return null;
        return {
          ...normalizedExpense,
          country,
          currency: normalizeCurrencyCode(expense.currency ?? currencyForCountry(country)),
        };
      })
      .filter((expense): expense is Record<string, unknown> => Boolean(expense))
      .filter((expense) => asText(expense.title)),
    expenseKey,
  );
  const expenses = normalizedExpenses.length ? normalizedExpenses : createFallbackExpenses(input);

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
      return {
        ...normalizedAttraction,
        country,
        city: sanitizeCityForCountry(normalizedAttraction.city, country),
      };
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

  const attractions = uniqueByKey([...explicitAttractions, ...itineraryAttractions], attractionKey);
  const finalAttractions = attractions.length ? attractions : createFallbackAttractions(input, itineraryItems);
  const finalWarnings = [
    ...warnings,
    itineraryWasSupplemented ? 'Alguns dias foram complementados automaticamente para evitar roteiro vazio.' : '',
    normalizedExpenses.length ? '' : 'Despesas aproximadas foram complementadas por categoria.',
  ].filter(Boolean);
  const documents = uniqueByKey(
    asRecords(plan.documents)
      .map((document) => {
        const name = asText(document.name ?? document.title, 'Documento');
        const description = asText(document.description ?? document.detail ?? document.notes);
        return {
          ...document,
          name,
          title: name,
          description,
          detail: description,
          required: document.required === false ? false : true,
          category: 'Documentos',
        };
      })
      .filter((document) => asText(document.name)),
    (document) => normalizeKey(document.name ?? document.title),
  );

  return {
    summary: asText(plan.summary, `Prévia de roteiro para ${input.tripName}.`),
    documents,
    routes: asRecords(plan.routes),
    itinerary_items: itineraryItems,
    expenses,
    attractions: finalAttractions,
    warnings: finalWarnings.some((warning) => stripDiacritics(warning).includes('exigencias oficiais'))
      ? finalWarnings
      : [...finalWarnings, requiredWarning],
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

class ProfileSyncError extends Error {
  originalError: unknown;

  constructor(error: unknown) {
    super(`Nao foi possivel preparar o perfil para geracao com IA: ${getErrorMessage(error, 'perfil indisponivel')}`);
    this.name = 'ProfileSyncError';
    this.originalError = error;
  }
}

const validateRawPlanSchema = (value: unknown) => {
  const plan = normalizeExternalPlanShape(value);
  const reasons: string[] = [];
  const objectKeys = Object.keys(plan);

  if (!objectKeys.length) reasons.push('JSON vazio');

  const itineraryItems = asRecords(plan.itinerary_items);
  const expenses = asRecords(plan.expenses);
  const attractions = asRecords(plan.attractions);
  const routes = asRecords(plan.routes);
  const documents = asRecords(plan.documents);
  const hasUsefulContent = Boolean(asText(plan.summary)) ||
    itineraryItems.length > 0 ||
    expenses.length > 0 ||
    attractions.length > 0 ||
    routes.length > 0 ||
    documents.length > 0;

  if (!hasUsefulContent) reasons.push('JSON sem conteudo de roteiro');

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

  const genericIssues = findGenericContentIssues(plan);
  if (genericIssues.length) {
    reasons.push(`conteudo generico proibido: ${genericIssues.slice(0, 6).join(', ')}`);
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

  const genericIssues = findGenericContentIssues(plan);
  if (genericIssues.length) {
    reasons.push(`conteudo generico proibido: ${genericIssues.slice(0, 8).join(', ')}`);
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

const buildPrompt = (
  input: TripPlanInput,
  destinationContext: DestinationContext,
  qualityFeedback?: string,
) => {
  const tripDays = getTripDayCount(input);
  const minimumItems = getMinimumItineraryItems(input);
  const idealRange = getIdealItineraryRange(input);
  const isLongTrip = tripDays > 15;
  const targetItems = isLongTrip
    ? Math.min(idealRange.max, Math.max(minimumItems, Math.ceil(tripDays * 1.5)))
    : Math.min(idealRange.max, Math.max(minimumItems, tripDays * 4));
  const destinationContextPrompt = buildDestinationContextPrompt(input, destinationContext);

  return `
Voce e um planejador de viagens especialista. Responda SOMENTE JSON valido, sem markdown, sem comentario e sem texto fora do objeto.
Use o contexto real fornecido como fonte principal. Use frases curtas. Descricoes com ate 160 caracteres.

Viagem:
- Nome: ${input.tripName}
- allowedCountries: ${input.countries.join(', ')}
- Cidades informadas ou extraidas do usuario: ${input.cities.length ? input.cities.join(', ') : 'Nao informadas'}
- itinerary_items.country, expenses.country e attractions.country devem usar SOMENTE allowedCountries.
- Excecao: voo internacional pode usar country "international"; esse valor nunca e destino nem filtro principal.
- Brasil/Brazil so pode aparecer como destino se estiver em allowedCountries. Se o usuario mencionar saida/origem Brasil, trate como voo internacional com country "international"; nao crie Brasil em attractions, expenses, filtros ou paises da viagem.
- Datas: ${input.startDate} ate ${input.endDate} (${tripDays} dias, contando inicio e fim)
- Estilo: ${input.style}
- Descricao da viagem: ${input.description || 'Nao informada'}

Contexto real de destinos, atracoes, documentos, transportes e custos:
${destinationContextPrompt}

- Se o usuario informou apenas pais, escolha cidades reais e populares desse pais; nunca use "Internacional" como cidade.
- Se a descricao mencionar uma cidade especifica, priorize essa cidade e atracoes reais dela.
- Se o contexto nao tiver dados suficientes para muitos blocos, gere menos itens com nomes reais; nunca complete com texto vago.

Qualidade obrigatoria:
- Gere entre ${minimumItems} e ${targetItems} itinerary_items, distribuidos pelos ${tripDays} dias.
- ${isLongTrip ? 'Viagem longa: use roteiro compacto com 1 a 3 blocos por dia; cada bloco pode resumir meio-dia ou uma cidade-base, e os dias principais podem ter mais detalhes.' : 'Cada dia completo deve ter manha, almoco, tarde e noite.'}
- ${isLongTrip ? 'Nao crie dias vazios; dias de deslocamento ou pausa podem ter 1 bloco resumido, mas dias principais devem ter 2 ou 3 blocos.' : 'Nao crie dias vazios ou com 1 item, exceto voo/deslocamento muito longo.'}
- Dias de chegada/voo ainda devem incluir chegada, deslocamento, check-in, passeio leve proximo e jantar/noite livre quando houver tempo.
- Agrupe atracoes proximas no mesmo dia e evite zigue-zague.
- ${isLongTrip ? 'Em viagem longa, nenhum dia pode ficar sem item; use itens resumidos por periodo quando necessario.' : 'Dias completos devem ter entre 4 e 8 blocos quando possivel.'}
- Nao ultrapasse ${targetItems} itinerary_items; para viagem longa, mantenha descricoes objetivas para evitar resposta gigante.
- Use nomes reais de pontos turisticos, bairros, museus, parques, pracinhas, estacoes ou aeroportos quando forem relevantes.
- O titulo de cada itinerary_item deve ser especifico: "Visita ao Senso-ji", "Coliseu e Forum Romano", "Shibuya Crossing", "Pantheon", "Chegada ao aeroporto de Haneda".
- Se nao souber atracoes reais suficientes para o destino, gere menos itens, mas nunca use placeholders genericos.
- Nunca use como titulo, cidade, atracao, rota ou descricao: "Ponto turistico principal", "atracao principal", "cidade escolhida", "regiao escolhida", "ponto importante", "passeio importante", "destino principal", "local importante", "atividade cultural", "atividade sugerida", "local famoso da cidade", "Visite a regiao escolhida".
- Nunca use "international" ou "Internacional" como city. Para voo internacional, use city real de chegada ou deixe city como aeroporto/cidade real.

Ritmo:
- economica: transporte publico e atracoes baratas/gratuitas.
- intermediaria: equilibrio entre custo, conforto e atracoes pagas importantes.
- confortavel: deslocamentos melhores e pausas maiores.
- Se a descricao indicar motorhome: retirada/devolucao, estrada, paradas, cidades-base e direcao realista.

Tipos permitidos: chegada, hospedagem, passeio, transporte, alimentacao, voo, trem, motorhome, descanso, compras, documento, outro.
Categorias de despesas: Hospedagem, Transporte, Passeios, Alimentacao, Comprinhas, Documentos, Seguro, Outros.

Despesas: gere 6 a 10 gastos aproximados compativeis com roteiro. Use estimated_cost/amount apenas como estimativa revisavel. Use currency e amount na moeda local correta: Inglaterra/Reino Unido GBP, Suica CHF, Japao JPY, Estados Unidos USD, Zona Euro EUR, Brasil BRL. Se houver duvida, use EUR para zona do euro e BRL apenas para Brasil.
Attractions: inclua apenas atracoes reais do roteiro: museus, pracas, mirantes, parques, bairros turisticos e experiencias. Nao inclua hotel, aeroporto, metro, refeicoes ou deslocamentos.
Routes: inclua rotas uteis entre cidades-base/aeroportos/estacoes ou trechos de estrada. Exemplos bons: "Aeroporto de Haneda -> Shinjuku", "Tokyo -> Kyoto", "Roma -> Florenca", "Florenca -> Veneza". Nunca retorne "international -> Tokyo"; use "Chegada ao aeroporto" ou uma origem real.
Documentos: retorne documentos especificos para o destino, inclua category "Documentos" e use linguagem cautelosa quando a regra legal puder mudar: "verifique a exigencia atual antes da viagem". Evite afirmacoes legais absolutas sem base atualizada.
Validacao final: remova duplicados, remova Brasil/paises fora dos allowedCountries, converta apenas country de voo de origem Brasil para "international", complete dias fracos e remova qualquer placeholder generico.

${qualityFeedback ? `A geracao anterior foi rejeitada por qualidade: ${qualityFeedback}. Refaça corrigindo esses pontos, com nomes reais, cidades reais, rotas legiveis e sem placeholders genericos.` : ''}

Retorne exatamente este objeto:
{
  "trip_summary": "string",
  "days": [
    {
      "day_number": 1,
      "date": "YYYY-MM-DD",
      "city": "cidade real",
      "country": "um dos allowedCountries",
      "activities": [
        {
          "time": "09:00",
          "title": "nome real e especifico",
          "category": "um dos tipos permitidos",
          "city": "cidade real",
          "country": "um dos allowedCountries ou international apenas em voo",
          "location": "nome real do local, bairro, estacao ou aeroporto",
          "description": "string",
          "details": "string",
          "estimated_cost": 0,
          "currency": "BRL, EUR, USD, JPY, CHF ou GBP",
          "useful_links": []
        }
      ]
    }
  ],
  "documents": [
    { "name": "string", "description": "string", "required": true, "category": "Documentos" }
  ],
  "routes": [
    { "from": "string", "to": "string", "transport_type": "string", "duration": "string", "description": "string", "estimated_cost": 0, "currency": "BRL, EUR, USD, JPY, CHF ou GBP" }
  ],
  "expenses": [
    {
      "category": "uma das categorias permitidas",
      "description": "string",
      "estimated_cost": 0,
      "currency": "BRL, EUR, USD, JPY, CHF ou GBP",
      "country": "um dos allowedCountries ou international apenas em transporte internacional"
    }
  ],
  "attractions": [
    {
      "name": "string",
      "city": "string",
      "country": "um dos allowedCountries",
      "description": "string",
      "suggested_day": 1,
      "suggested_time": "10:00"
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
  destinationContext: DestinationContext,
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
        max_completion_tokens: getMaxCompletionTokens(input),
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'Voce gera apenas JSON valido para planejamento de viagem. Nao retorne texto fora do JSON.',
          },
          { role: 'user', content: buildPrompt(input, destinationContext, qualityFeedback) },
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
    cities: input.cities,
    start_date: input.startDate,
    end_date: input.endDate,
  });

  let activeModel = 'pending';
  let destinationContext = emptyDestinationContext(input);
  let destinationSummary = buildDestinationSummary(input, destinationContext);

  const logGenerationStatus = async (status: string, errorMessage?: string) => {
    try {
      await adminSupabase.from('ai_generation_logs').insert({
        group_id: input.groupId,
        user_id: user.id,
        request_type: 'trip_plan_preview',
        destination_summary: destinationSummary,
        prompt_version: PROMPT_VERSION,
        model: activeModel,
        status,
        error_message: errorMessage ? compactPromptText(errorMessage, 1000) : null,
      });
    } catch (error) {
      logAiEvent('error', 'safe_generation_log_insert_failed', {
        group_id: input.groupId,
        user_id: user.id,
        error_code: 'AI_GENERATION_LOG_INSERT_FAILED',
        message: getErrorMessage(error),
      });
    }
  };

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

    await logGenerationStatus('failed', feedback);
  };

  const ensureQuotaProfile = async () => {
    const fullName = user.user_metadata?.full_name ?? user.user_metadata?.name ?? null;
    const avatarUrl = user.user_metadata?.avatar_url ?? user.user_metadata?.picture ?? null;
    const now = new Date().toISOString();

    const { data: existingProfile, error: existingProfileError } = await adminSupabase
      .from('profiles')
      .select('id, ai_generations_used, ai_generations_limit, last_ai_generation_at')
      .eq('id', user.id)
      .maybeSingle<QuotaProfile>();

    if (existingProfileError) throw new ProfileSyncError(existingProfileError);

    if (!existingProfile) {
      const { data: createdProfile, error: createProfileError } = await adminSupabase
        .from('profiles')
        .insert({
          id: user.id,
          email: user.email ?? null,
          full_name: fullName,
          avatar_url: avatarUrl,
          ai_generations_used: 0,
          ai_generations_limit: 3,
          last_ai_generation_at: null,
          updated_at: now,
        })
        .select('id, ai_generations_used, ai_generations_limit, last_ai_generation_at')
        .single<QuotaProfile>();

      if (createProfileError || !createdProfile) {
        throw new ProfileSyncError(createProfileError ?? new Error('Perfil nao foi criado.'));
      }

      return { profile: createdProfile, created: true };
    }

    const normalizedUsed = Number(existingProfile.ai_generations_used ?? 0);
    const normalizedLimit = Number(existingProfile.ai_generations_limit ?? 3);
    const { data: updatedProfile, error: updateProfileError } = await adminSupabase
      .from('profiles')
      .update({
        email: user.email ?? null,
        full_name: fullName,
        avatar_url: avatarUrl,
        ai_generations_used: normalizedUsed,
        ai_generations_limit: normalizedLimit,
        updated_at: now,
      })
      .eq('id', user.id)
      .select('id, ai_generations_used, ai_generations_limit, last_ai_generation_at')
      .single<QuotaProfile>();

    if (updateProfileError || !updatedProfile) {
      throw new ProfileSyncError(updateProfileError ?? new Error('Perfil nao foi atualizado.'));
    }

    return { profile: updatedProfile, created: false };
  };

  try {
    const { profile, created: profileCreated } = await ensureQuotaProfile();
    const used = Number(profile.ai_generations_used ?? 0);
    const limit = Number(profile.ai_generations_limit ?? 3);

    logAiEvent('info', 'profile_ready', {
      group_id: input.groupId,
      user_id: user.id,
      profile_created: profileCreated,
      ai_generations_used: used,
      ai_generations_limit: limit,
      last_ai_generation_at: profile.last_ai_generation_at,
    });

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

    logAiEvent('info', 'membership_valid', {
      group_id: input.groupId,
      user_id: user.id,
      membership_id: membership.id,
    });

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

      await logGenerationStatus('blocked', 'AI_GENERATION_LIMIT_REACHED');

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

      await logGenerationStatus('blocked', 'AI_GENERATION_COOLDOWN');

      return errorResponse(
        'AI_GENERATION_COOLDOWN',
        'Aguarde alguns segundos antes de gerar novamente.',
        429,
      );
    }

    activeModel = Deno.env.get('AI_MODEL') ?? 'gpt-4.1-mini';
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

    const model = activeModel;
    destinationContext = await fetchDestinationContext(adminSupabase, input);
    destinationSummary = buildDestinationSummary(input, destinationContext);
    const contextWarnings = getDestinationContextWarnings(destinationContext);

    logAiEvent('info', 'destination_context_loaded', {
      group_id: input.groupId,
      user_id: user.id,
      destination_summary: destinationSummary,
      destinations: destinationContext.destinations.length,
      selected_cities: destinationContext.selectedCities,
      mentioned_cities: destinationContext.mentionedCities,
      attractions: destinationContext.attractions.length,
      transport_tips: destinationContext.transportTips.length,
      documents: destinationContext.documents.length,
      only_country_provided: destinationContext.onlyCountryProvided,
    });
    await logGenerationStatus('started');

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

      let rawOutput: unknown;
      try {
        rawOutput = await generatePlanWithAI(apiKey, model, input, destinationContext, qualityFeedback, {
          groupId: input.groupId,
          userId: user.id,
          attempt,
        });
      } catch (error) {
        if (error instanceof AiTimeoutError) {
          logAiEvent('warn', 'openai_timeout_without_preview', {
            group_id: input.groupId,
            user_id: user.id,
            attempt,
            timeout_ms: error.timeoutMs,
          });
        }

        throw error;
      }

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
      if (contextWarnings.length) {
        candidate.warnings = [...new Set([...candidate.warnings, ...contextWarnings])];
      }
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

    await logGenerationStatus('generated');

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
      const hasGenericContent = error.reasons.some((reason) => stripDiacritics(reason).includes('generico'));
      const errorCode = hasGenericContent ? 'AI_QUALITY_FAILED' : 'VALIDATION_FAILED';
      const responseMessage = hasGenericContent
        ? 'A prévia gerada ficou genérica demais. Tente informar cidades ou mais detalhes da viagem.'
        : message;

      logAiEvent('warn', 'quality_failed', {
        group_id: input.groupId,
        user_id: user.id,
        error_code: errorCode,
        reasons: error.reasons,
      });

      return errorResponse(
        errorCode,
        responseMessage,
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

    if (error instanceof ProfileSyncError) {
      logAiEvent('error', 'profile_sync_failed', {
        group_id: input.groupId,
        user_id: user.id,
        error_code: 'SUPABASE_PROFILE_ERROR',
        message,
      });

      return errorResponse(
        'SUPABASE_PROFILE_ERROR',
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
