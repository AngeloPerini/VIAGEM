import { createClient } from 'npm:@supabase/supabase-js@2';

type TripStyle = 'economica' | 'intermediaria' | 'confortavel';
type TripGenerationStrategy = 'auto' | 'single' | 'staged' | 'summary';

type TripPlanInput = {
  tripName: string;
  countries: string[];
  cities: string[];
  description: string;
  startDate: string;
  endDate: string;
  style: TripStyle;
  groupId: string;
  generationStrategy: TripGenerationStrategy;
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

type TravelIntent = {
  summary: string;
  requiredCities: string[];
  preferredCities: string[];
  preferredRegions: string[];
  interests: string[];
  requiredCityKeys: string[];
  preferredCityKeys: string[];
  allowedCityKeys: string[];
  blockedCityKeys: string[];
  blockedTerms: string[];
  requiredTerms: string[];
  isBrazilDomestic: boolean;
  isBeachTrip: boolean;
  isBrazilNortheastBeaches: boolean;
  isAlagoasBeaches: boolean;
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
  intent: TravelIntent;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const unlimitedAiTesterEmails = new Set(['r.perini351@gmail.com']);
const PROMPT_VERSION = 'tripflow-ai-rag-v3-intent';
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

const isTripGenerationStrategy = (value: unknown): value is TripGenerationStrategy =>
  value === 'auto' || value === 'single' || value === 'staged' || value === 'summary';

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
    generationStrategy: isTripGenerationStrategy(payload.generationStrategy)
      ? payload.generationStrategy
      : isTripGenerationStrategy(payload.strategy)
        ? payload.strategy
        : 'auto',
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
  espanha: 'spain',
  spain: 'spain',
  portugal: 'portugal',
  alemanha: 'germany',
  germany: 'germany',
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
  spain: ['Barcelona', 'Madri', 'Sevilha'],
  portugal: ['Lisboa', 'Porto', 'Sintra'],
  germany: ['Berlim', 'Munique', 'Hamburgo'],
  japan: ['Tokyo', 'Kyoto', 'Osaka'],
  united_states: ['Nova York', 'Washington', 'Boston'],
  brazil: ['Salvador', 'Recife', 'Fortaleza', 'Maceió', 'Natal'],
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
  spain: [
    { name: 'Sagrada Família', city: 'Barcelona', description: 'Basílica de Gaudí e principal marco modernista de Barcelona.' },
    { name: 'Parc Güell', city: 'Barcelona', description: 'Parque modernista com mosaicos, jardins e vista da cidade.' },
    { name: 'Bairro Gótico', city: 'Barcelona', description: 'Ruas históricas, praças antigas e igrejas no centro de Barcelona.' },
    { name: 'Museu do Prado', city: 'Madri', description: 'Museu essencial para arte espanhola e europeia.' },
    { name: 'Palácio Real de Madri', city: 'Madri', description: 'Residência real histórica com salas cerimoniais e jardins próximos.' },
    { name: 'Plaza de España de Sevilha', city: 'Sevilha', description: 'Praça monumental com arquitetura regionalista e canais.' },
  ],
  portugal: [
    { name: 'Torre de Belém', city: 'Lisboa', description: 'Fortificação manuelina à beira do Tejo.' },
    { name: 'Mosteiro dos Jerónimos', city: 'Lisboa', description: 'Mosteiro histórico ligado à Era dos Descobrimentos.' },
    { name: 'Alfama', city: 'Lisboa', description: 'Bairro antigo para miradouros, ruelas e fado.' },
    { name: 'Livraria Lello', city: 'Porto', description: 'Livraria histórica com arquitetura marcante no centro do Porto.' },
    { name: 'Ribeira do Porto', city: 'Porto', description: 'Área à beira do Douro para caminhada e restaurantes.' },
    { name: 'Palácio da Pena', city: 'Sintra', description: 'Palácio colorido no alto da serra, acessível a partir de Lisboa.' },
  ],
  germany: [
    { name: 'Portão de Brandemburgo', city: 'Berlim', description: 'Marco histórico central de Berlim.' },
    { name: 'Ilha dos Museus', city: 'Berlim', description: 'Conjunto de museus no centro histórico e patrimônio da UNESCO.' },
    { name: 'Reichstag', city: 'Berlim', description: 'Parlamento alemão com cúpula panorâmica mediante reserva.' },
    { name: 'Marienplatz', city: 'Munique', description: 'Praça central de Munique com o Neues Rathaus.' },
    { name: 'Palácio Nymphenburg', city: 'Munique', description: 'Palácio barroco com jardins extensos.' },
    { name: 'Miniatur Wunderland', city: 'Hamburgo', description: 'Museu de miniaturas e maquetes ferroviárias no Speicherstadt.' },
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
    { name: 'Pelourinho', city: 'Salvador', description: 'Centro histórico com caminhada cultural e gastronomia baiana.' },
    { name: 'Recife Antigo', city: 'Recife', description: 'Bairro histórico para passeio a pé, cultura e restaurantes.' },
    { name: 'Praia do Futuro', city: 'Fortaleza', description: 'Praia urbana conhecida por barracas estruturadas e banho de mar.' },
    { name: 'Ponta Verde', city: 'Maceió', description: 'Orla de água clara para caminhada, praia e restaurantes.' },
    { name: 'Ponta Negra', city: 'Natal', description: 'Praia urbana com vista para o Morro do Careca.' },
  ],
};

const brazilCityKeys = new Set([
  'sao_paulo',
  'rio_de_janeiro',
  'brasilia',
  'salvador',
  'recife',
  'fortaleza',
  'maceio',
  'natal',
  'joao_pessoa',
  'aracaju',
  'sao_luis',
  'maragogi',
  'sao_miguel_dos_milagres',
  'ipojuca',
  'jijoca_de_jericoacoara',
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
  barcelona: 'barcelona',
  madri: 'madri',
  madrid: 'madri',
  sevilha: 'sevilha',
  sevilla: 'sevilha',
  lisbon: 'lisboa',
  lisboa: 'lisboa',
  porto: 'porto',
  sintra: 'sintra',
  berlim: 'berlim',
  berlin: 'berlim',
  munique: 'munique',
  munich: 'munique',
  hamburgo: 'hamburgo',
  hamburg: 'hamburgo',
  rio_de_janeiro: 'rio_de_janeiro',
  sao_paulo: 'sao_paulo',
  brasilia: 'brasilia',
  maceio: 'maceio',
  salvador: 'salvador',
  recife: 'recife',
  fortaleza: 'fortaleza',
  natal: 'natal',
  joao_pessoa: 'joao_pessoa',
  aracaju: 'aracaju',
  sao_luis: 'sao_luis',
  maragogi: 'maragogi',
  porto_de_galinhas: 'porto_de_galinhas',
  sao_miguel_dos_milagres: 'sao_miguel_dos_milagres',
  praia_do_gunga: 'praia_do_gunga',
  praia_do_frances: 'praia_do_frances',
  jericoacoara: 'jijoca_de_jericoacoara',
  jeri: 'jijoca_de_jericoacoara',
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

const brazilNortheastBeachCities = [
  'Maceió',
  'Maragogi',
  'São Miguel dos Milagres',
  'Porto de Galinhas',
  'Recife',
  'Salvador',
  'Fortaleza',
  'Natal',
  'João Pessoa',
  'Aracaju',
];

const alagoasBeachCities = [
  'Maceió',
  'Maragogi',
  'São Miguel dos Milagres',
  'Praia do Gunga',
  'Praia do Francês',
];

const brazilNortheastBeachAttractions = [
  { name: 'Ponta Verde', city: 'Maceió', description: 'Orla urbana de água clara para praia, caminhada e restaurantes.' },
  { name: 'Praia de Pajuçara', city: 'Maceió', description: 'Praia central com jangadas e piscinas naturais em dias adequados.' },
  { name: 'Piscinas naturais de Maragogi', city: 'Maragogi', description: 'Passeio de barco para piscinas naturais com maré baixa.' },
  { name: 'São Miguel dos Milagres', city: 'São Miguel dos Milagres', description: 'Trecho da Rota Ecológica com praias calmas e pousadas charmosas.' },
  { name: 'Praia do Gunga', city: 'Roteiro', description: 'Praia ao sul de Maceió com falésias e encontro de lagoa e mar.' },
  { name: 'Praia do Francês', city: 'Marechal Deodoro', description: 'Praia próxima a Maceió com mar azul e boa estrutura.' },
  { name: 'Porto de Galinhas', city: 'Ipojuca', description: 'Vila praiana famosa por piscinas naturais e passeios de jangada.' },
  { name: 'Praia do Futuro', city: 'Fortaleza', description: 'Praia urbana com barracas estruturadas para banho e refeições.' },
  { name: 'Ponta Negra', city: 'Natal', description: 'Praia urbana com vista para o Morro do Careca.' },
  { name: 'Pelourinho', city: 'Salvador', description: 'Centro histórico para combinar cultura baiana e litoral.' },
];

const brazilNortheastBlockedCityLabels = [
  'São Paulo',
  'Rio de Janeiro',
  'Brasília',
  'Curitiba',
  'Belo Horizonte',
  'Porto Alegre',
  'Gramado',
  'Foz do Iguaçu',
  'Bonito',
];

const brazilNortheastBlockedTermLabels = [
  ...brazilNortheastBlockedCityLabels,
  'Cristo Redentor',
  'Avenida Paulista',
  'Praça dos Três Poderes',
  'Congresso Nacional',
  'Copacabana',
  'Ipanema',
  'Pão de Açúcar',
];

const beachIntentTerms = [
  'praia',
  'praias',
  'litoral',
  'mar',
  'costa',
  'piscina natural',
  'piscinas naturais',
  'beach',
  'beaches',
];

const northeastIntentTerms = [
  'nordeste',
  'nordestino',
  'alagoas',
  'bahia',
  'pernambuco',
  'ceara',
  'rio grande do norte',
  'paraiba',
  'sergipe',
  'maranhao',
  'piaui',
];

const knownIntentCities = uniqueTexts([
  ...Object.values(defaultCitiesByCountry).flat(),
  ...brazilNortheastBeachCities,
  ...alagoasBeachCities,
  'Tokyo',
  'Kyoto',
  'Osaka',
  'Paris',
  'Nice',
]);

const containsIntentTerm = (textKey: string, terms: string[]) =>
  terms.some((term) => textKey.includes(normalizeKey(term)));

const getInputIntentTextKey = (input: TripPlanInput) =>
  normalizeKey([
    input.tripName,
    input.description,
    ...input.countries,
    ...input.cities,
  ].join(' '));

const inferCitiesFromIntentText = (input: TripPlanInput, textKey = getInputIntentTextKey(input)) =>
  uniqueTexts([
    ...input.cities,
    ...knownIntentCities.filter((city) => {
      const key = cityKey(city);
      return key && textKey.includes(key);
    }),
  ]);

const getIntentFallbackCities = (intent: TravelIntent, countryCode: string, input?: TripPlanInput) => {
  if (countryCode !== 'brazil' || !intent.isBrazilNortheastBeaches) return [];

  const cityBudget = input ? Math.max(3, getCityBudgetPerCountry(input)) : 5;
  const preferred = intent.isAlagoasBeaches ? alagoasBeachCities : brazilNortheastBeachCities;
  return uniqueTexts([...intent.requiredCities, ...preferred]).slice(0, cityBudget);
};

const getIntentFallbackAttractions = (intent: TravelIntent, countryCode: string) => {
  if (countryCode !== 'brazil' || !intent.isBrazilNortheastBeaches) return [];
  const preferredCityKeys = new Set(getIntentFallbackCities(intent, countryCode).map(cityKey));

  if (!preferredCityKeys.size) return brazilNortheastBeachAttractions;

  return brazilNortheastBeachAttractions.filter((attraction) =>
    preferredCityKeys.has(cityKey(attraction.city)) ||
    intent.allowedCityKeys.includes(cityKey(attraction.city)) ||
    intent.requiredTerms.some((term) => normalizeKey(`${attraction.name} ${attraction.description}`).includes(term))
  );
};

const extractTravelIntent = (input: TripPlanInput): TravelIntent => {
  const textKey = getInputIntentTextKey(input);
  const countryCodes = input.countries.map(countryKey).filter(Boolean);
  const isBrazilDomestic = countryCodes.includes('brazil');
  const isBeachTrip = containsIntentTerm(textKey, beachIntentTerms);
  const isNortheast = containsIntentTerm(textKey, northeastIntentTerms) ||
    brazilNortheastBeachCities.some((city) => textKey.includes(cityKey(city)));
  const isAlagoasBeaches = isBrazilDomestic && isBeachTrip && (
    textKey.includes('alagoas') ||
    alagoasBeachCities.some((city) => textKey.includes(cityKey(city)))
  );
  const isBrazilNortheastBeaches = isBrazilDomestic && isBeachTrip && (isNortheast || isAlagoasBeaches);
  const requiredCities = inferCitiesFromIntentText(input, textKey);
  const preferredCities = isBrazilNortheastBeaches
    ? uniqueTexts([...(isAlagoasBeaches ? alagoasBeachCities : brazilNortheastBeachCities)])
    : [];
  const interests = [
    isBeachTrip ? 'praias e litoral' : '',
    containsIntentTerm(textKey, ['museu', 'museus', 'arte', 'historia', 'história']) ? 'museus e cultura' : '',
    containsIntentTerm(textKey, ['gastronomia', 'comida', 'restaurante']) ? 'gastronomia' : '',
  ].filter(Boolean);
  const preferredRegions = [
    isBrazilNortheastBeaches ? 'Nordeste brasileiro' : '',
    isAlagoasBeaches ? 'Alagoas' : '',
  ].filter(Boolean);
  const allowedCityKeys = uniqueTexts([
    ...preferredCities,
    ...requiredCities,
    ...brazilNortheastBeachAttractions.map((attraction) => attraction.city),
  ]).map(cityKey);
  const requiredTerms = isBrazilNortheastBeaches
    ? [
        ...beachIntentTerms.map(normalizeKey),
        'maragogi',
        'maceio',
        'piscinas_naturais',
        'porto_de_galinhas',
        'sao_miguel_dos_milagres',
      ]
    : [];
  const summary = (() => {
    if (isAlagoasBeaches) {
      return 'Praias de Alagoas, priorizando Maceió, Maragogi, São Miguel dos Milagres e praias próximas.';
    }

    if (isBrazilNortheastBeaches) {
      return 'Praias do Nordeste brasileiro, com foco em litoral, mar, piscinas naturais e cidades costeiras.';
    }

    if (requiredCities.length && interests.length) {
      return `Roteiro focado em ${requiredCities.join(', ')} para ${interests.join(', ')}.`;
    }

    if (requiredCities.length) {
      return `Roteiro focado nas cidades mencionadas: ${requiredCities.join(', ')}.`;
    }

    if (input.description) {
      return compactPromptText(input.description, 180);
    }

    return 'Roteiro coerente com os países, cidades, datas e estilo informados pelo usuário.';
  })();

  return {
    summary,
    requiredCities,
    preferredCities,
    preferredRegions,
    interests,
    requiredCityKeys: requiredCities.map(cityKey).filter(Boolean),
    preferredCityKeys: preferredCities.map(cityKey).filter(Boolean),
    allowedCityKeys: allowedCityKeys.filter(Boolean),
    blockedCityKeys: isBrazilNortheastBeaches ? brazilNortheastBlockedCityLabels.map(cityKey) : [],
    blockedTerms: isBrazilNortheastBeaches ? brazilNortheastBlockedTermLabels.map(normalizeKey) : [],
    requiredTerms,
    isBrazilDomestic,
    isBeachTrip,
    isBrazilNortheastBeaches,
    isAlagoasBeaches,
  };
};

const buildIntentContextLines = (intent: TravelIntent) => {
  const lines = [`Interpretacao da descricao: ${intent.summary}`];

  if (intent.preferredRegions.length) lines.push(`Regioes preferidas: ${intent.preferredRegions.join(', ')}.`);
  if (intent.requiredCities.length) lines.push(`Cidades mencionadas pelo usuario: ${intent.requiredCities.join(', ')}.`);
  if (intent.preferredCities.length) lines.push(`Cidades coerentes com a intencao: ${intent.preferredCities.join(', ')}.`);

  if (intent.isBrazilNortheastBeaches) {
    lines.push('Regra de contexto: para praias do Nordeste, use cidades litoraneas do Nordeste; nao substitua por Rio de Janeiro, Sao Paulo, Brasilia ou atracoes civicas do Sudeste/Centro-Oeste.');
    lines.push(`Atracoes coerentes com essa intencao: ${brazilNortheastBeachAttractions.map((attraction) => `${attraction.name} (${attraction.city})`).join(', ')}.`);
  }

  return lines.join('\n');
};

const buildTravelIntentPrompt = (intent: TravelIntent) => {
  const lines = [
    `Resumo interpretado da intencao do usuario: ${intent.summary}`,
    'A descricao do usuario tem prioridade sobre destinos padrao. Se houver conflito entre defaults e descricao, siga a descricao.',
  ];

  if (intent.requiredCities.length) {
    lines.push(`Cidades obrigatorias ou citadas: ${intent.requiredCities.join(', ')}. Inclua essas cidades no roteiro quando pertencerem aos allowedCountries.`);
  }

  if (intent.isBrazilNortheastBeaches) {
    lines.push('O usuario pediu praias do Nordeste brasileiro. O roteiro deve ser litoraneo/nordestino e mencionar praias, mar, piscinas naturais ou orla.');
    lines.push(`Priorize: ${(intent.isAlagoasBeaches ? alagoasBeachCities : brazilNortheastBeachCities).join(', ')}.`);
    lines.push(`Nao use como destino, atracao ou bloco principal: ${brazilNortheastBlockedTermLabels.join(', ')}.`);
  }

  if (intent.isAlagoasBeaches) {
    lines.push('Como a intencao aponta para Alagoas, priorize Maceio, Maragogi, Sao Miguel dos Milagres, Praia do Gunga e Praia do Frances.');
  }

  return lines.join('\n');
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

const emptyDestinationContext = (input: TripPlanInput): DestinationContext => {
  const intent = extractTravelIntent(input);

  return {
    destinations: [],
    attractions: [],
    transportTips: [],
    documents: [],
    countryCodes: input.countries.map(countryKey).filter(Boolean),
    selectedCities: uniqueTexts([
      ...input.cities,
      ...input.countries.flatMap((country) => getIntentFallbackCities(intent, countryKey(country), input)),
    ]),
    mentionedCities: intent.requiredCities,
    onlyCountryProvided: input.cities.length === 0,
    intent,
  };
};

const fetchDestinationContext = async (
  adminSupabase: ReturnType<typeof createClient>,
  input: TripPlanInput,
): Promise<DestinationContext> => {
  const countryCodes = [...new Set(input.countries.map(countryKey).filter(Boolean))];
  const intent = extractTravelIntent(input);
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
  const requestedCityKeys = new Set([
    ...input.cities.map(cityKey),
    ...intent.requiredCityKeys,
    ...intent.preferredCityKeys,
  ].filter(Boolean));
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

  const mentionedCities = uniqueTexts([
    ...intent.requiredCities,
    ...allCityRows
      .map((destination) => asText(destination.city_name))
      .filter((city) => {
        const key = cityKey(city);
        return requestedCityKeys.has(key) || (Boolean(key) && userText.includes(key));
      }),
  ]);
  const mentionedCityKeys = new Set(mentionedCities.map(cityKey));
  const selectedCities = uniqueTexts(
    countryCodes.flatMap((countryCode) => {
      const intentFallbackCities = getIntentFallbackCities(intent, countryCode, input);
      const countryCities = allCityRows
        .filter((destination) => destination.country_code === countryCode)
        .map((destination) => asText(destination.city_name))
        .filter(Boolean);
      const mentionedForCountry = countryCities.filter((city) =>
        mentionedCityKeys.has(cityKey(city)) ||
        intent.allowedCityKeys.includes(cityKey(city))
      );
      if (mentionedForCountry.length) return mentionedForCountry;
      if (intentFallbackCities.length) return intentFallbackCities;
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
    intent,
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
  const intentContext = buildIntentContextLines(context.intent);

  if (!context.destinations.length && !context.attractions.length) {
    const countryLines = input.countries
      .map((country) => {
        const key = countryKey(country);
        const intentCities = getIntentFallbackCities(context.intent, key, input);
        const explicitCities = input.cities.length ? input.cities : [];
        const cities = intentCities.length ? intentCities : explicitCities.length ? explicitCities : defaultCitiesByCountry[key] ?? [];
        const intentAttractions = getIntentFallbackAttractions(context.intent, key);
        const attractions = intentAttractions.length ? intentAttractions : defaultAttractionsByCountry[key] ?? [];
        const hintParts = [
          cities.length ? `cidades reais sugeridas: ${cities.join(', ')}` : '',
          attractions.length
            ? `atracoes reais conhecidas: ${attractions.map((attraction) => `${attraction.name} (${attraction.city})`).join(', ')}`
            : '',
        ].filter(Boolean);

        return hintParts.length ? `- ${country}: ${hintParts.join('; ')}` : `- ${country}: use cidades e atracoes reais verificaveis.`;
      })
      .join('\n');

    return [intentContext, countryLines].join('\n');
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
    intentContext,
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
  if (days > 15) return days * 3;
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
    title: (_country, city, dayNumber) => `Café e planejamento em ${city} - Dia ${dayNumber}`,
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
    title: (_country, city, dayNumber) => `Almoço em ${city} - Dia ${dayNumber}`,
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
    title: (_country, city, dayNumber) => `Descanso antes da noite em ${city} - Dia ${dayNumber}`,
    description: (_country, city) => `Tempo para banho, pausa e organização antes do jantar em ${city}.`,
  },
  {
    time: '20h00',
    type: 'alimentacao',
    title: (_country, city, dayNumber) => `Jantar em ${city} - Dia ${dayNumber}`,
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
  {
    time: '19h30',
    type: 'alimentacao',
    title: (_country: string, city: string, dayNumber: number) => `Jantar e revisão em ${city} - Dia ${dayNumber}`,
    description: (_country: string, city: string) => `Feche o dia em uma região central de ${city} e revise o deslocamento seguinte.`,
  },
] satisfies SupplementalSlot[];

const completeItineraryItems = (items: Record<string, unknown>[], input: TripPlanInput) => {
  const tripDays = getTripDayCount(input);
  const isLongTrip = tripDays > 15;
  const minimumBlocksPerDay = isLongTrip ? 3 : 4;
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

const genericExpenseTitlePatterns = [
  /transporte\s+local$/,
  /transporte\s+di[aá]rio$/,
  /hospedagem\s+base$/,
  /hospedagem\s+di[aá]ria$/,
  /alimenta[cç][aã]o\s+base$/,
  /passeio\s+base$/,
  /estimativa\s+gen[eé]rica$/,
  /custo\s+m[eé]dio$/,
  /despesa\s+geral$/,
  /gasto\s+estimado$/,
  /outros\s+gastos$/,
  /gasto\s+da\s+viagem$/,
  /ingressos\s+e\s+experi[eê]ncias$/,
  /alimenta[cç][aã]o\s+di[aá]ria$/,
  /reserva\s+para\s+imprevistos$/,
];

const isGenericExpenseTitle = (value: unknown) => {
  const text = stripDiacritics(asText(value)).trim();
  return Boolean(text) && genericExpenseTitlePatterns.some((pattern) => pattern.test(text));
};

const expenseCategoryKey = (value: unknown) => stripDiacritics(asText(value)).replace(/[^a-z0-9]+/g, ' ').trim();

const isAccommodationExpense = (expense: Record<string, unknown>) =>
  expenseCategoryKey(expense.category).includes('hosped') ||
  ['hospedagem', 'hotel', 'apartamento', 'lodging'].some((keyword) =>
    stripDiacritics(`${asText(expense.title)} ${asText(expense.detail)} ${asText(expense.description)}`).includes(keyword),
  );

const isTransportExpense = (expense: Record<string, unknown>) =>
  expenseCategoryKey(expense.category).includes('transport') ||
  ['trem', 'metro', 'metrô', 'taxi', 'uber', 'voo', 'onibus', 'ônibus', 'transfer', 'traslado']
    .some((keyword) => stripDiacritics(`${asText(expense.title)} ${asText(expense.detail)} ${asText(expense.description)}`).includes(stripDiacritics(keyword)));

const isFoodExpense = (expense: Record<string, unknown>) =>
  expenseCategoryKey(expense.category).includes('aliment') ||
  ['almoco', 'almoço', 'jantar', 'cafe', 'café', 'restaurante'].some((keyword) =>
    stripDiacritics(`${asText(expense.title)} ${asText(expense.detail)} ${asText(expense.description)}`).includes(stripDiacritics(keyword)),
  );

const isTourExpense = (expense: Record<string, unknown>) =>
  expenseCategoryKey(expense.category).includes('passeio') ||
  ['ingresso', 'museu', 'tour', 'atração', 'atracao', 'bilhete'].some((keyword) =>
    stripDiacritics(`${asText(expense.title)} ${asText(expense.detail)} ${asText(expense.description)}`).includes(stripDiacritics(keyword)),
  );

const hashText = (value: string) =>
  [...value].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) % 9973, 17);

const varyAmount = (baseAmount: number, seed: string, minimum = 1) => {
  const factor = 0.88 + (hashText(seed) % 29) / 100;
  return Math.max(minimum, Math.round(baseAmount * factor));
};

const getStyleBaseAmounts = (style: TripStyle) => {
  if (style === 'confortavel') {
    return { lodgingNight: 190, localTransportDay: 32, foodDay: 76, activity: 34, route: 85 };
  }

  if (style === 'economica') {
    return { lodgingNight: 75, localTransportDay: 12, foodDay: 30, activity: 16, route: 42 };
  }

  return { lodgingNight: 120, localTransportDay: 20, foodDay: 48, activity: 24, route: 58 };
};

const getCountryCostFactor = (country: string) => {
  const key = countryKey(country);
  if (key === 'switzerland') return 1.45;
  if (['england', 'scotland', 'united_kingdom', 'great_britain'].includes(key)) return 1.2;
  if (key === 'japan') return 1.1;
  if (key === 'brazil') return 0.65;
  return 1;
};

type ExpenseStaySegment = {
  country: string;
  city: string;
  startDay: number;
  endDay: number;
  startDate: string;
  endDate: string;
  checkOutDate: string;
  nights: number;
  days: number;
};

const getDateAfterTripDay = (input: TripPlanInput, dayNumber: number) => {
  const start = parseDateOnly(input.startDate);
  if (!start) return getDateForDay(input, dayNumber);
  return formatDateOnly(addDays(start, Math.max(0, dayNumber)));
};

const getPrimaryStayForDay = (
  input: TripPlanInput,
  itineraryItems: Record<string, unknown>[],
  dayNumber: number,
) => {
  const dayItems = itineraryItems
    .filter((item) => getDayNumberFromItem(item) === dayNumber)
    .filter((item) => {
      const country = asText(item.country);
      return country && !internationalCountryKeys.has(countryKey(country));
    })
    .sort((a, b) => getTimeMinutes(a.time) - getTimeMinutes(b.time));
  const representative = dayItems.find((item) => asText(item.city)) ?? dayItems[0];
  const country = asText(representative?.country) || getCountryForDay(input, dayNumber);
  const city = sanitizeCityForCountry(asText(representative?.city), country, dayNumber);

  return { country, city };
};

const getStaySegments = (
  input: TripPlanInput,
  itineraryItems: Record<string, unknown>[],
): ExpenseStaySegment[] => {
  const tripDays = getTripDayCount(input);
  const dayStays = Array.from({ length: tripDays }, (_, index) => {
    const dayNumber = index + 1;
    return {
      dayNumber,
      ...getPrimaryStayForDay(input, itineraryItems, dayNumber),
    };
  });
  const segments: ExpenseStaySegment[] = [];

  dayStays.forEach((stay) => {
    const previous = segments.at(-1);
    if (
      previous &&
      countryKey(previous.country) === countryKey(stay.country) &&
      cityKey(previous.city) === cityKey(stay.city)
    ) {
      previous.endDay = stay.dayNumber;
      previous.endDate = getDateForDay(input, stay.dayNumber);
      previous.days = previous.endDay - previous.startDay + 1;
      previous.nights = Math.max(1, previous.endDay - previous.startDay);
      previous.checkOutDate = getDateAfterTripDay(input, previous.startDay + previous.nights - 1);
      return;
    }

    const startDate = getDateForDay(input, stay.dayNumber);
    segments.push({
      country: stay.country,
      city: stay.city,
      startDay: stay.dayNumber,
      endDay: stay.dayNumber,
      startDate,
      endDate: startDate,
      checkOutDate: getDateAfterTripDay(input, stay.dayNumber),
      nights: 1,
      days: 1,
    });
  });

  return segments;
};

const findStayForExpense = (
  input: TripPlanInput,
  stays: ExpenseStaySegment[],
  expense: Record<string, unknown>,
) => {
  const explicitDate = asText(expense.expense_date ?? expense.expenseDate ?? expense.date ?? expense.check_in_date ?? expense.checkInDate);
  const titleText = normalizeKey(`${asText(expense.title)} ${asText(expense.description)} ${asText(expense.detail)}`);
  const country = countryKey(expense.country);
  const byText = stays.find((stay) =>
    titleText.includes(cityKey(stay.city)) ||
    (country && countryKey(stay.country) === country),
  );
  if (byText) return byText;

  if (explicitDate && isDateWithinTripRange(explicitDate, input)) {
    const dayNumber = Math.max(
      1,
      Math.min(
        getTripDayCount(input),
        Math.floor(((parseDateOnly(explicitDate)?.getTime() ?? 0) - (parseDateOnly(input.startDate)?.getTime() ?? 0)) / MS_PER_DAY) + 1,
      ),
    );
    return stays.find((stay) => dayNumber >= stay.startDay && dayNumber <= stay.endDay) ?? stays[0];
  }

  return stays[0];
};

const routeTransportLabel = (route: Record<string, unknown>) => {
  const text = stripDiacritics(`${asText(route.transport)} ${asText(route.transport_type)} ${asText(route.description)} ${asText(route.notes)}`);
  if (text.includes('voo') || text.includes('flight')) return 'Voo';
  if (text.includes('onibus') || text.includes('ônibus') || text.includes('bus')) return 'Ônibus';
  if (text.includes('taxi') || text.includes('uber') || text.includes('traslado') || text.includes('transfer')) return 'Traslado';
  if (text.includes('motorhome')) return 'Motorhome';
  return 'Trem';
};

const createRouteExpenses = (
  input: TripPlanInput,
  stays: ExpenseStaySegment[],
  routes: Record<string, unknown>[],
) => {
  const explicitRoutes = routes
    .map((route) => {
      const from = asText(route.from);
      const to = asText(route.to);
      if (!from || !to || usesInternationalAsCity(from) || usesInternationalAsCity(to) || normalizeKey(from) === normalizeKey(to)) {
        return null;
      }

      const matchingStayIndex = stays.findIndex((stay) => normalizeKey(to).includes(cityKey(stay.city)) || cityKey(stay.city).includes(cityKey(to)));
      const stay = matchingStayIndex >= 0 ? stays[matchingStayIndex] : stays[0];
      const country = stay?.country ?? input.countries[0] ?? 'international';
      const currency = currencyForCountry(country);
      const label = routeTransportLabel(route);
      const date = stay?.startDate ?? input.startDate;
      const amount = varyAmount(getStyleBaseAmounts(input.style).route * getCountryCostFactor(country), `${label}-${from}-${to}-${date}`, 8);

      return {
        category: 'Transporte',
        title: `${label} ${from} -> ${to}`,
        detail: `Deslocamento entre ${from} e ${to} em ${date}. Estimativa sugerida pela IA.`,
        amount,
        currency,
        country,
        expense_date: date,
        links: [],
      };
    })
    .filter((expense): expense is Record<string, unknown> => Boolean(expense));

  if (explicitRoutes.length) return explicitRoutes;

  return stays.slice(1).map((stay, index) => {
    const previous = stays[index];
    const country = stay.country;
    const currency = currencyForCountry(country);
    const label = input.description.toLowerCase().includes('motorhome') ? 'Motorhome' : 'Trem';
    const amount = varyAmount(getStyleBaseAmounts(input.style).route * getCountryCostFactor(country), `${previous.city}-${stay.city}-${stay.startDate}`, 8);

    return {
      category: 'Transporte',
      title: `${label} ${previous.city} -> ${stay.city}`,
      detail: `Deslocamento entre estadias de ${previous.city} para ${stay.city}. Estimativa sugerida pela IA.`,
      amount,
      currency,
      country,
      expense_date: stay.startDate,
      links: [],
    };
  });
};

const createActivityExpenses = (
  input: TripPlanInput,
  itineraryItems: Record<string, unknown>[],
) => {
  const baseAmounts = getStyleBaseAmounts(input.style);
  const seen = new Set<string>();

  return itineraryItems
    .filter((item) => looksLikeAttraction(item, true))
    .map((item) => {
      const title = asText(item.title);
      const key = normalizeKey(title);
      if (!key || seen.has(key)) return null;
      seen.add(key);

      const dayNumber = getDayNumberFromItem(item) ?? 1;
      const country = asText(item.country) || getCountryForDay(input, dayNumber);
      const city = sanitizeCityForCountry(item.city, country, dayNumber);
      const date = asText(item.date) || getDateForDay(input, dayNumber);
      const amount = varyAmount(baseAmounts.activity * getCountryCostFactor(country), `${title}-${city}-${date}`, 5);

      return {
        category: 'Passeios',
        title: `Ingresso ${title.replace(/^visita\s+a\s+/i, '').replace(/^passeio\s+por\s+/i, '')}`.slice(0, 120),
        detail: `Atividade em ${city} prevista para ${date}. Estimativa sugerida pela IA.`,
        amount,
        currency: currencyForCountry(country),
        country,
        expense_date: date,
        links: safeArray(item.links),
      };
    })
    .filter((expense): expense is Record<string, unknown> => Boolean(expense))
    .slice(0, 8);
};

const createFallbackExpenses = (
  input: TripPlanInput,
  itineraryItems: Record<string, unknown>[] = [],
  routes: Record<string, unknown>[] = [],
) => {
  const stays = getStaySegments(input, itineraryItems);
  const baseAmounts = getStyleBaseAmounts(input.style);
  const stayExpenses = stays.flatMap((stay) => {
    const currency = currencyForCountry(stay.country);
    const factor = getCountryCostFactor(stay.country);
    const lodgingAmount = varyAmount(baseAmounts.lodgingNight * factor * stay.nights, `lodging-${stay.city}-${stay.startDate}`, 20);
    const transportAmount = varyAmount(baseAmounts.localTransportDay * factor * stay.days, `local-${stay.city}-${stay.startDate}`, 5);
    const foodAmount = varyAmount(baseAmounts.foodDay * factor * stay.days, `food-${stay.city}-${stay.startDate}`, 8);

    return [
      {
        category: 'Hospedagem',
        title: `Hospedagem em ${stay.city}`,
        detail: `${stay.nights} ${stay.nights === 1 ? 'noite' : 'noites'} em ${stay.city}. Estimativa por estadia sugerida pela IA.`,
        amount: lodgingAmount,
        country: stay.country,
        currency,
        expense_date: stay.startDate,
        check_in_date: stay.startDate,
        check_out_date: stay.checkOutDate,
        links: [],
      },
      {
        category: 'Transporte',
        title: `Transporte urbano em ${stay.city}`,
        detail: `Metrô, ônibus ou táxi durante ${stay.days} ${stay.days === 1 ? 'dia' : 'dias'} em ${stay.city}.`,
        amount: transportAmount,
        country: stay.country,
        currency,
        expense_date: stay.startDate,
        links: [],
      },
      {
        category: 'Alimentacao',
        title: `Alimentação em ${stay.city}`,
        detail: `Cafés, almoços e jantares durante ${stay.days} ${stay.days === 1 ? 'dia' : 'dias'} em ${stay.city}.`,
        amount: foodAmount,
        country: stay.country,
        currency,
        expense_date: stay.startDate,
        links: [],
      },
    ];
  });
  const internationalTrip = input.countries.some((country) => countryKey(country) !== 'brazil');
  const insuranceExpense = internationalTrip
    ? [{
        category: 'Seguro',
        title: 'Seguro viagem internacional',
        detail: 'Seguro para todo o período internacional. Confira coberturas e exigências atuais.',
        amount: varyAmount(95, `${input.tripName}-insurance`, 30),
        country: input.countries[0] ?? 'international',
        currency: 'BRL',
        expense_date: input.startDate,
        links: [],
      }]
    : [];

  return sanitizeGeneratedExpenses(input, [
    ...stayExpenses,
    ...createRouteExpenses(input, stays, routes),
    ...createActivityExpenses(input, itineraryItems),
    ...insuranceExpense,
  ], itineraryItems, routes);
};

const createFallbackDocuments = (input: TripPlanInput) => {
  const countryKeys = input.countries.map(countryKey).filter(Boolean);
  const isBrazilOnly = countryKeys.length > 0 && countryKeys.every((country) => country === 'brazil');
  const hasSchengenLikeDestination = countryKeys.some((country) =>
    ['france', 'italy', 'spain', 'portugal', 'germany', 'switzerland'].includes(country)
  );
  const documents = isBrazilOnly
    ? [
        {
          name: 'Documento de identidade com foto',
          description: 'Leve RG ou CNH válida e confira regras da companhia aérea, hotel e passeios.',
          required: true,
          category: 'Documentos',
        },
        {
          name: 'Comprovante de hospedagem',
          description: 'Tenha reservas acessíveis no celular e offline para check-in e deslocamentos.',
          required: true,
          category: 'Documentos',
        },
      ]
    : [
        {
          name: 'Passaporte',
          description: 'Confira validade, páginas disponíveis e exigências atuais de cada país antes da viagem.',
          required: true,
          category: 'Documentos',
        },
        {
          name: 'Seguro viagem',
          description: 'Mantenha apólice e contatos de emergência. Verifique cobertura exigida para os destinos.',
          required: true,
          category: 'Documentos',
        },
        {
          name: 'Comprovante de hospedagem',
          description: 'Guarde reservas de hotéis ou acomodações para imigração, check-in e organização do roteiro.',
          required: true,
          category: 'Documentos',
        },
        {
          name: 'Passagem de retorno ou saída',
          description: 'Tenha comprovante de saída do país ou do bloco de viagem quando exigido pela imigração.',
          required: true,
          category: 'Documentos',
        },
        {
          name: 'Comprovante financeiro',
          description: 'Leve cartões, extratos ou comprovantes aceitos e verifique a regra atual antes do embarque.',
          required: false,
          category: 'Documentos',
        },
        ...(hasSchengenLikeDestination
          ? [{
              name: 'ETIAS ou autorização de entrada',
              description: 'Verifique a exigência atual para entrada no Espaço Schengen antes da viagem.',
              required: false,
              category: 'Documentos',
            }]
          : []),
      ];

  return uniqueByKey(documents, (document) => normalizeKey(document.name));
};

const createFallbackPlan = (input: TripPlanInput, warning: string) =>
  ensurePlanShape({
    summary: `Prévia estruturada para ${input.tripName}.`,
    documents: createFallbackDocuments(input),
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
    normalizeCurrencyCode(expense.currency),
    Math.round(Number(expense.amount ?? expense.value ?? expense.estimated_cost ?? 0)),
    asText(expense.expense_date ?? expense.expenseDate ?? expense.date),
    asText(expense.check_in_date ?? expense.checkInDate),
    asText(expense.check_out_date ?? expense.checkOutDate),
  ].join('|');

const getExpenseFamilyKey = (expense: Record<string, unknown>) => {
  const title = normalizeKey(expense.title ?? expense.description);
  const category = expenseCategoryKey(expense.category);
  const country = countryKey(expense.country);
  const date = asText(expense.expense_date ?? expense.expenseDate ?? expense.date);
  const checkIn = asText(expense.check_in_date ?? expense.checkInDate);
  const checkOut = asText(expense.check_out_date ?? expense.checkOutDate);

  if (isAccommodationExpense(expense)) {
    return ['hospedagem', country, title, checkIn, checkOut].join('|');
  }

  if (isTransportExpense(expense)) {
    const isLocalTransport = title.includes('transporte_urbano') || title.includes('transporte_local');
    const isRoute = !isLocalTransport && /->|→/.test(asText(expense.title ?? expense.description));
    return isRoute
      ? ['transporte-rota', country, title, date].join('|')
      : ['transporte-local', country, title].join('|');
  }

  if (isTourExpense(expense)) {
    return ['passeio', country, title].join('|');
  }

  return [category, country, title, normalizeCurrencyCode(expense.currency), Math.round(Number(expense.amount ?? 0)), date, checkIn, checkOut].join('|');
};

const getExpenseDateFromRecord = (expense: Record<string, unknown>) =>
  asText(expense.expense_date ?? expense.expenseDate ?? expense.date ?? expense.spent_at);

const normalizeGeneratedExpenseRecord = (expense: Record<string, unknown>) => {
  const amount = Number(expense.amount ?? expense.value ?? expense.estimated_cost ?? 0);
  const currency = normalizeCurrencyCode(expense.currency);

  return {
    ...expense,
    category: asText(expense.category, 'Outros'),
    title: asText(expense.title ?? expense.description ?? expense.category),
    detail: asText(expense.detail ?? expense.details ?? expense.description ?? 'Estimativa sugerida pela IA.'),
    amount: Number.isFinite(amount) ? amount : 0,
    currency,
    expense_date: getExpenseDateFromRecord(expense),
    check_in_date: asText(expense.check_in_date ?? expense.checkInDate ?? expense.checkin ?? expense.start_date),
    check_out_date: asText(expense.check_out_date ?? expense.checkOutDate ?? expense.checkout ?? expense.end_date),
    links: safeArray(expense.links),
  };
};

const findActivityForExpense = (
  input: TripPlanInput,
  itineraryItems: Record<string, unknown>[],
  stay: ExpenseStaySegment,
  expense: Record<string, unknown>,
) => {
  const date = getExpenseDateFromRecord(expense) || stay.startDate;
  const titleText = normalizeKey(`${asText(expense.title)} ${asText(expense.detail)} ${asText(expense.description)}`);

  return itineraryItems.find((item) => {
    const itemDate = asText(item.date) || getDateForDay(input, getDayNumberFromItem(item) ?? 1);
    if (itemDate !== date) return false;
    if (!looksLikeAttraction(item, true)) return false;
    const itemTitle = normalizeKey(item.title);
    return titleText.includes(itemTitle) || itemTitle.includes(titleText) || cityKey(item.city) === cityKey(stay.city);
  }) ?? itineraryItems.find((item) =>
    looksLikeAttraction(item, true) &&
    cityKey(item.city) === cityKey(stay.city)
  );
};

const sanitizeGeneratedExpenses = (
  input: TripPlanInput,
  rawExpenses: Record<string, unknown>[],
  itineraryItems: Record<string, unknown>[] = [],
  routes: Record<string, unknown>[] = [],
) => {
  const stays = getStaySegments(input, itineraryItems);
  const baseAmounts = getStyleBaseAmounts(input.style);
  const cleaned = rawExpenses
    .map(normalizeGeneratedExpenseRecord)
    .flatMap((expense) => {
      const stay = findStayForExpense(input, stays, expense);
      if (!stay) return [];

      const category = asText(expense.category, 'Outros');
      const originalTitle = asText(expense.title);
      const genericTitle = isGenericExpenseTitle(originalTitle) || hasGenericPlaceholder(originalTitle, expense.detail, expense.description);
      const factor = getCountryCostFactor(stay.country);
      const currency = normalizeCurrencyCode(expense.currency || currencyForCountry(stay.country));
      const base = {
        ...expense,
        country: asText(expense.country) || stay.country,
        currency,
        links: safeArray(expense.links),
      };

      if (isAccommodationExpense(expense)) {
        const amount = varyAmount(baseAmounts.lodgingNight * factor * stay.nights, `lodging-${stay.city}-${stay.startDate}`, 20);

        return [{
          ...base,
          category: 'Hospedagem',
          title: `Hospedagem em ${stay.city}`,
          detail: `${stay.nights} ${stay.nights === 1 ? 'noite' : 'noites'} em ${stay.city}. ${asText(expense.detail, 'Estimativa sugerida pela IA.')}`,
          amount,
          expense_date: stay.startDate,
          check_in_date: stay.startDate,
          check_out_date: stay.checkOutDate,
        }];
      }

      if (isTransportExpense(expense)) {
        const title = asText(expense.title);
        const hasRouteTitle = /->|→/.test(title) || /\b(trem|voo|ônibus|onibus|traslado|transfer|ferry)\b/i.test(title);
        const normalizedTitle = genericTitle || !hasRouteTitle
          ? `Transporte urbano em ${stay.city}`
          : title.replace(/\s*->\s*/g, ' -> ').replace(/\s*→\s*/g, ' -> ');
        const amount = hasRouteTitle && Number(expense.amount) > 0
          ? Number(expense.amount)
          : varyAmount(
              (hasRouteTitle ? baseAmounts.route : baseAmounts.localTransportDay * stay.days) * factor,
              `${normalizedTitle}-${stay.startDate}`,
              5,
            );

        return [{
          ...base,
          category: 'Transporte',
          title: normalizedTitle,
          detail: hasRouteTitle
            ? `${asText(expense.detail, 'Deslocamento previsto no roteiro.')} Estimativa sugerida pela IA.`
            : `Metrô, ônibus ou táxi durante a estadia em ${stay.city}. Estimativa consolidada por cidade.`,
          amount,
          expense_date: hasRouteTitle && getExpenseDateFromRecord(expense) && isDateWithinTripRange(getExpenseDateFromRecord(expense), input)
            ? getExpenseDateFromRecord(expense)
            : stay.startDate,
          check_in_date: '',
          check_out_date: '',
        }];
      }

      if (isFoodExpense(expense)) {
        const amount = Number(expense.amount) > 0
          ? Number(expense.amount)
          : varyAmount(baseAmounts.foodDay * factor * stay.days, `food-${stay.city}-${stay.startDate}`, 8);

        return [{
          ...base,
          category: 'Alimentacao',
          title: genericTitle ? `Alimentação em ${stay.city}` : originalTitle,
          detail: `Estimativa de refeições durante ${stay.days} ${stay.days === 1 ? 'dia' : 'dias'} em ${stay.city}.`,
          amount,
          expense_date: stay.startDate,
          check_in_date: '',
          check_out_date: '',
        }];
      }

      if (isTourExpense(expense)) {
        const activity = genericTitle ? findActivityForExpense(input, itineraryItems, stay, expense) : null;
        const activityTitle = asText(activity?.title).replace(/^visita\s+a\s+/i, '').replace(/^passeio\s+por\s+/i, '');
        const title = genericTitle && activityTitle ? `Ingresso ${activityTitle}` : originalTitle;
        if (!title || isGenericExpenseTitle(title)) return [];
        const date = asText(activity?.date) || getExpenseDateFromRecord(expense) || stay.startDate;
        const amount = Number(expense.amount) > 0
          ? Number(expense.amount)
          : varyAmount(baseAmounts.activity * factor, `${title}-${date}`, 5);

        return [{
          ...base,
          category: 'Passeios',
          title,
          detail: activityTitle
            ? `Atividade em ${stay.city} prevista para ${date}. Estimativa sugerida pela IA.`
            : asText(expense.detail, `Passeio previsto em ${stay.city}. Estimativa sugerida pela IA.`),
          amount,
          expense_date: date,
          check_in_date: '',
          check_out_date: '',
        }];
      }

      if (genericTitle) return [];

      return [{
        ...base,
        title: originalTitle,
        detail: asText(expense.detail, `Estimativa específica para ${stay.city}.`),
        amount: Number(expense.amount) > 0 ? Number(expense.amount) : varyAmount(45 * factor, `${originalTitle}-${stay.city}`, 5),
        expense_date: getExpenseDateFromRecord(expense) && isDateWithinTripRange(getExpenseDateFromRecord(expense), input)
          ? getExpenseDateFromRecord(expense)
          : stay.startDate,
      }];
    });
  const withRouteFallbacks = [
    ...cleaned,
    ...createRouteExpenses(input, stays, routes).filter((routeExpense) => {
      const key = normalizeKey(routeExpense.title);
      return !cleaned.some((expense) => normalizeKey(expense.title).includes(key) || key.includes(normalizeKey(expense.title)));
    }),
    ...createActivityExpenses(input, itineraryItems).filter((activityExpense) => {
      const key = normalizeKey(activityExpense.title);
      return !cleaned.some((expense) => normalizeKey(expense.title).includes(key) || key.includes(normalizeKey(expense.title)));
    }),
  ];
  const seen = new Set<string>();

  return withRouteFallbacks
    .filter((expense) => asText(expense.title) && !isGenericExpenseTitle(expense.title))
    .filter((expense) => Number(expense.amount) > 0)
    .filter((expense) => {
      const key = getExpenseFamilyKey(expense);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 24);
};

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

const genericTaskPatterns = [
  /se\s+preparar/,
  /organizar\s+coisas/,
  /confirmar\s+tudo/,
  /pesquisar\s+local/,
  /fazer\s+atividade/,
  /preparar\s+atividade/,
];

const normalizeActivityTasks = (value: unknown) => {
  const seen = new Set<string>();

  return asRecords(value)
    .map((task) => {
      const title = asText(task.title ?? task.name ?? task.task ?? task.description).slice(0, 120);
      const description = asText(task.description ?? task.detail ?? task.notes);
      const key = normalizeKey(title);

      if (!title || !key) return null;
      if (hasGenericPlaceholder(title) || genericTaskPatterns.some((pattern) => pattern.test(stripDiacritics(title)))) {
        return null;
      }
      if (seen.has(key)) return null;
      seen.add(key);

      return {
        title,
        description: description && description !== title ? description : '',
        required: task.required === false ? false : true,
      };
    })
    .filter((task): task is { title: string; description: string; required: boolean } => Boolean(task))
    .slice(0, 5);
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

  asRecords(plan.expenses).forEach((expense, index) => {
    if (
      isGenericExpenseTitle(expense.title ?? expense.description) ||
      hasGenericPlaceholder(expense.title, expense.description, expense.detail)
    ) {
      issues.push(`expenses[${index}] generico`);
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
      tasks: normalizeActivityTasks(activity.tasks ?? activity.checklist ?? activity.subtasks ?? activity.activity_tasks),
    }));
  });

const normalizeExternalPlanShape = (value: unknown) => {
  const plan = asRecord(value);
  const itineraryItems = asRecords(plan.itinerary_items);

  return {
    ...plan,
    summary: asText(plan.summary || plan.trip_summary),
    intent_summary: asText(plan.intent_summary || plan.intentSummary || plan.interpreted_intent || plan.intent),
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
  const intent = extractTravelIntent(input);
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
          tasks: normalizeActivityTasks(item.tasks ?? item.checklist ?? item.subtasks ?? item.activity_tasks),
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

  const rawRoutes = asRecords(plan.routes);
  const normalizedExpenses = uniqueByKey(
    asRecords(plan.expenses)
      .map((expense) => {
        const normalizedExpense = {
          ...expense,
          category: asText(expense.category, 'Outros'),
          title: asText(expense.title ?? expense.description, 'Gasto planejado'),
          detail: asText(expense.detail ?? expense.details, 'Aproximado / planejado'),
          amount: Number(expense.amount ?? expense.estimated_cost ?? expense.value ?? 0),
          expense_date: asText(expense.expense_date ?? expense.expenseDate ?? expense.date ?? expense.spent_at),
          check_in_date: asText(expense.check_in_date ?? expense.checkInDate ?? expense.checkin ?? expense.start_date),
          check_out_date: asText(expense.check_out_date ?? expense.checkOutDate ?? expense.checkout ?? expense.end_date),
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
  const sanitizedExpenses = sanitizeGeneratedExpenses(input, normalizedExpenses, itineraryItems, rawRoutes);
  const fallbackExpenses = createFallbackExpenses(input, itineraryItems, rawRoutes);
  const expenses = uniqueByKey(
    sanitizedExpenses.length >= Math.min(5, Math.max(3, input.countries.length))
      ? sanitizedExpenses
      : [...sanitizedExpenses, ...fallbackExpenses],
    getExpenseFamilyKey,
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
    sanitizedExpenses.length === normalizedExpenses.length ? '' : 'Gastos genéricos ou repetidos da IA foram consolidados antes da prévia.',
    expenses.length > sanitizedExpenses.length ? 'Despesas aproximadas foram complementadas com nomes, datas e períodos específicos.' : '',
  ].filter(Boolean);
  const documents = uniqueByKey(
    [
      ...createFallbackDocuments(input),
      ...asRecords(plan.documents)
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
    ],
    (document) => normalizeKey(document.name ?? document.title),
  );

  return {
    intent_summary: asText(plan.intent_summary, intent.summary),
    summary: asText(plan.summary, `Prévia de roteiro para ${input.tripName}.`),
    documents,
    routes: rawRoutes,
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

type GeneratePlanWithAIOptions = {
  timeoutMs?: number;
  maxCompletionTokens?: number;
  prompt?: string;
  temperature?: number;
  stage?: string;
};

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

const buildPlanIntentSearchText = (plan: ReturnType<typeof ensurePlanShape>) =>
  normalizeKey([
    ...plan.itinerary_items.flatMap((item) => [
      item.day,
      item.country,
      item.city,
      item.title,
      item.description,
      item.type,
    ].map(asText)),
    ...plan.attractions.flatMap((attraction) => {
      const record = asRecord(attraction);
      return [
        record.name,
        record.country,
        record.city,
        record.description,
      ].map(asText);
    }),
    ...plan.routes.flatMap((route) => {
      const record = asRecord(route);
      return [
        record.from,
        record.to,
        record.transport,
        record.transport_type,
        record.duration,
        record.description,
        record.notes,
      ].map(asText);
    }),
    ...plan.expenses.flatMap((expense) => {
      const record = asRecord(expense);
      return [
        record.category,
        record.country,
        record.title,
        record.description,
        record.detail,
      ].map(asText);
    }),
  ].join(' '));

const findPlanMatches = (planTextKey: string, labels: string[]) =>
  uniqueTexts(labels.filter((label) => {
    const normalized = normalizeKey(label);
    const cityNormalized = cityKey(label);
    return (normalized && planTextKey.includes(normalized)) ||
      (cityNormalized && planTextKey.includes(cityNormalized));
  }));

const validatePlanAgainstIntent = (plan: ReturnType<typeof ensurePlanShape>, input: TripPlanInput) => {
  const intent = extractTravelIntent(input);
  const reasons: string[] = [];
  const planTextKey = buildPlanIntentSearchText(plan);

  intent.requiredCityKeys.forEach((requiredCityKey, index) => {
    const label = intent.requiredCities[index] ?? requiredCityKey;
    if (!planTextKey.includes(requiredCityKey)) {
      reasons.push(`intencao da descricao ignorada: cidade mencionada ausente no roteiro (${label})`);
    }
  });

  if (intent.isBrazilNortheastBeaches) {
    const blockedMatches = findPlanMatches(planTextKey, brazilNortheastBlockedTermLabels);
    if (blockedMatches.length) {
      reasons.push(`intencao da descricao ignorada: roteiro de praias do Nordeste incluiu destino/atracao fora do foco (${blockedMatches.join(', ')})`);
    }

    const northeastSpecificMatches = findPlanMatches(planTextKey, [
      ...brazilNortheastBeachCities,
      ...alagoasBeachCities,
      ...brazilNortheastBeachAttractions.map((attraction) => attraction.name),
    ]);
    if (northeastSpecificMatches.length < 2) {
      reasons.push('intencao da descricao ignorada: roteiro de praias do Nordeste precisa citar cidades ou praias coerentes do Nordeste');
    }

    const beachSignalMatches = findPlanMatches(planTextKey, beachIntentTerms);
    if (!beachSignalMatches.length) {
      reasons.push('intencao da descricao ignorada: roteiro deveria focar em praias, litoral, mar ou piscinas naturais');
    }
  }

  if (intent.isAlagoasBeaches) {
    const alagoasMatches = findPlanMatches(planTextKey, [
      ...alagoasBeachCities,
      'Ponta Verde',
      'Pajuçara',
      'Piscinas naturais de Maragogi',
    ]);

    if (alagoasMatches.length < 2) {
      reasons.push('intencao da descricao ignorada: roteiro de praias de Alagoas deve priorizar Maceio, Maragogi, Sao Miguel dos Milagres, Gunga ou Frances');
    }
  }

  return reasons;
};

const validatePlanQuality = (plan: ReturnType<typeof ensurePlanShape>, input: TripPlanInput) => {
  const reasons: string[] = [];
  const tripDays = getTripDayCount(input);
  const minimumItems = getMinimumItineraryItems(input);
  const invalidCountries = findInvalidCountries(plan, input);
  const intentIssues = validatePlanAgainstIntent(plan, input);

  reasons.push(...intentIssues);

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

    if (items.length > 0 && items.length < 3) {
      veryThinDays.push(day);
    }
  }

  if (missingDays.length) {
    reasons.push(`dias sem roteiro: ${missingDays.map((day) => `Dia ${day}`).join(', ')}`);
  }

  if (singleItemDays.length) {
    reasons.push(`dias com apenas 1 item sem justificativa: ${singleItemDays.map((day) => `Dia ${day}`).join(', ')}`);
  }

  if (veryThinDays.length) {
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
  const intentPrompt = buildTravelIntentPrompt(destinationContext.intent);

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

Interpretacao obrigatoria da intencao:
${intentPrompt}

Contexto real de destinos, atracoes, documentos, transportes e custos:
${destinationContextPrompt}

- Se o usuario informou apenas pais, escolha cidades reais e populares desse pais; nunca use "Internacional" como cidade.
- Se a descricao mencionar uma cidade especifica, priorize essa cidade e atracoes reais dela.
- Se a descricao mencionar tema, regiao ou experiencia (ex.: praias do Nordeste, museus em Paris, Tokyo/Kyoto), esse tema/regiao/cidade deve guiar o roteiro inteiro.
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
- Quando fizer sentido, inclua tasks dentro da atividade com 1 a 4 tarefas internas praticas e especificas. Exemplos: "Comprar ingresso do Coliseu", "Salvar QR Code da entrada", "Conferir plataforma do trem", "Chegar 20 minutos antes". Nao use tasks genericas como "Se preparar", "Confirmar tudo" ou "Fazer atividade".
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

Despesas: gere gastos aproximados realistas, especificos e deduplicados, compativeis com roteiro. Cada gasto deve ter categoria, title especifico, description/detail, country, city quando aplicavel, currency, amount, expense_date e check_in_date/check_out_date para hospedagem. Use currency e amount na moeda local correta: Inglaterra/Reino Unido GBP, Suica CHF, Japao JPY, Estados Unidos USD, Zona Euro EUR, Brasil BRL. Se houver duvida, use EUR para zona do euro e BRL apenas para Brasil.
- Nunca use nomes finais genericos de gastos como "Transporte local", "Hospedagem base", "Alimentacao base", "Passeio base", "Estimativa generica", "Custo medio", "Despesa geral", "Transporte diario", "Hospedagem diaria", "Gasto estimado", "Outros gastos" ou "Gasto da viagem".
- Hospedagem deve ser uma despesa por cidade/estadia, com title "Hospedagem em Roma", "Hospedagem em Paris", etc., check_in_date e check_out_date coerentes.
- Transporte entre cidades deve ser especifico: "Trem Roma -> Milao", "Traslado aeroporto -> hospedagem em Roma". Transporte urbano deve ser consolidado uma vez por cidade/periodo: "Transporte urbano em Roma".
- Atividades pagas devem virar gasto especifico vinculado a data da atividade: "Ingresso Coliseu", "Ingresso Museu do Louvre". Nao duplique com uma despesa generica de passeios.
- Nao crie varias despesas iguais. Se uma estimativa se repetir, consolide em uma unica despesa por cidade, deslocamento, atividade ou hospedagem.
- Valores devem variar conforme tipo, cidade, duracao, noites e deslocamento; nao clone o mesmo valor em varias linhas.
Attractions: inclua apenas atracoes reais do roteiro: museus, pracas, mirantes, parques, bairros turisticos e experiencias. Nao inclua hotel, aeroporto, metro, refeicoes ou deslocamentos.
Routes: inclua rotas uteis entre cidades-base/aeroportos/estacoes ou trechos de estrada. Exemplos bons: "Aeroporto de Haneda -> Shinjuku", "Tokyo -> Kyoto", "Roma -> Florenca", "Florenca -> Veneza". Nunca retorne "international -> Tokyo"; use "Chegada ao aeroporto" ou uma origem real.
Documentos: retorne documentos especificos para o destino, inclua category "Documentos" e use linguagem cautelosa quando a regra legal puder mudar: "verifique a exigencia atual antes da viagem". Evite afirmacoes legais absolutas sem base atualizada.
Validacao final: remova duplicados, remova Brasil/paises fora dos allowedCountries, converta apenas country de voo de origem Brasil para "international", complete dias fracos e remova qualquer placeholder generico.

${qualityFeedback ? `A geracao anterior foi rejeitada por qualidade: ${qualityFeedback}. Refaça corrigindo esses pontos, com nomes reais, cidades reais, rotas legiveis e sem placeholders genericos.` : ''}

Retorne exatamente este objeto:
{
  "intent_summary": "frase curta em portugues explicando como voce interpretou a descricao do usuario",
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
          "useful_links": [],
          "tasks": [
            { "title": "tarefa concreta vinculada a esta atividade", "description": "detalhe opcional", "required": true }
          ]
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
      "title": "nome especifico do gasto",
      "description": "string",
      "estimated_cost": 0,
      "currency": "BRL, EUR, USD, JPY, CHF ou GBP",
      "country": "um dos allowedCountries ou international apenas em transporte internacional",
      "city": "cidade real quando aplicavel",
      "expense_date": "YYYY-MM-DD",
      "check_in_date": "YYYY-MM-DD ou vazio",
      "check_out_date": "YYYY-MM-DD ou vazio"
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
  options: GeneratePlanWithAIOptions = {},
) => {
  const timeoutMs = options.timeoutMs ?? (qualityFeedback ? Math.min(getOpenAITimeoutMs(), 45_000) : getOpenAITimeoutMs());
  const prompt = options.prompt ?? buildPrompt(input, destinationContext, qualityFeedback);
  const maxCompletionTokens = options.maxCompletionTokens ?? getMaxCompletionTokens(input);
  const controller = new AbortController();
  const startedAt = Date.now();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  let aiResponse: Response;

  logAiEvent('info', 'openai_request_prepared', {
    group_id: context.groupId,
    user_id: context.userId,
    attempt: context.attempt,
    stage: options.stage ?? 'single',
    generation_strategy: input.generationStrategy,
    model,
    timeout_ms: timeoutMs,
    max_completion_tokens: maxCompletionTokens,
    prompt_length: prompt.length,
    countries_count: input.countries.length,
    trip_days: getTripDayCount(input),
  });

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
        temperature: options.temperature ?? (qualityFeedback ? 0.42 : 0.38),
        max_completion_tokens: maxCompletionTokens,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'Voce gera apenas JSON valido para planejamento de viagem. Nao retorne texto fora do JSON.',
          },
          { role: 'user', content: prompt },
        ],
      }),
    });
  } catch (error) {
    const isAbort = error instanceof DOMException && error.name === 'AbortError';
    logAiEvent('error', 'openai_request_failed', {
      group_id: context.groupId,
      user_id: context.userId,
      attempt: context.attempt,
      stage: options.stage ?? 'single',
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
    stage: options.stage ?? 'single',
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
    stage: options.stage ?? 'single',
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

type EnsuredTripPlan = ReturnType<typeof ensurePlanShape>;

type TripGenerationMode = 'single' | 'staged' | 'summary';

type TripGenerationSizing = {
  countriesCount: number;
  tripDays: number;
  expectedActivities: number;
  promptLength: number;
  isLargeTrip: boolean;
};

type StagedTripBlock = {
  index: number;
  country: string;
  startDay: number;
  endDay: number;
  startDate: string;
  endDate: string;
  days: number;
};

const LARGE_TRIP_COUNTRY_THRESHOLD = 3;
const LARGE_TRIP_DAY_THRESHOLD = 12;
const LARGE_TRIP_ACTIVITY_THRESHOLD = 20;
const LARGE_TRIP_PROMPT_THRESHOLD = 18_000;
const STAGED_TOTAL_BUDGET_MS = 86_000;
const STAGED_BLOCK_TIMEOUT_MS = 12_000;
const STAGED_SUMMARY_BLOCK_TIMEOUT_MS = 8_000;

const getTripGenerationSizing = (
  input: TripPlanInput,
  destinationContext: DestinationContext,
): TripGenerationSizing => {
  const tripDays = getTripDayCount(input);
  const expectedActivities = tripDays > 15 ? tripDays * 3 : tripDays * 4;
  const promptLength = buildPrompt(input, destinationContext).length;
  const isLargeTrip =
    input.countries.length > LARGE_TRIP_COUNTRY_THRESHOLD ||
    tripDays > LARGE_TRIP_DAY_THRESHOLD ||
    expectedActivities > LARGE_TRIP_ACTIVITY_THRESHOLD ||
    promptLength > LARGE_TRIP_PROMPT_THRESHOLD;

  return {
    countriesCount: input.countries.length,
    tripDays,
    expectedActivities,
    promptLength,
    isLargeTrip,
  };
};

const resolveGenerationMode = (input: TripPlanInput, sizing: TripGenerationSizing): TripGenerationMode => {
  if (input.generationStrategy === 'single') return 'single';
  if (input.generationStrategy === 'summary') return 'summary';
  if (input.generationStrategy === 'staged') return 'staged';
  return sizing.isLargeTrip ? 'staged' : 'single';
};

const buildCountryStageBlocks = (input: TripPlanInput): StagedTripBlock[] => {
  const tripDays = getTripDayCount(input);
  const countries = input.countries.length ? input.countries : ['international'];
  const countryCount = Math.max(1, countries.length);
  const baseDays = tripDays >= countryCount ? Math.floor(tripDays / countryCount) : 1;
  const extraDays = tripDays >= countryCount ? tripDays % countryCount : 0;
  let dayCursor = 1;

  return countries.flatMap((country, index) => {
    const days = tripDays >= countryCount
      ? baseDays + (index < extraDays ? 1 : 0)
      : index < tripDays ? 1 : 0;

    if (days <= 0) return [];

    const startDay = dayCursor;
    const endDay = Math.min(tripDays, startDay + days - 1);
    dayCursor = endDay + 1;

    return [{
      index,
      country,
      startDay,
      endDay,
      startDate: getDateForDay(input, startDay),
      endDate: getDateForDay(input, endDay),
      days: endDay - startDay + 1,
    }];
  });
};

const createBlockInput = (input: TripPlanInput, block: StagedTripBlock): TripPlanInput => ({
  ...input,
  countries: [block.country],
  cities: input.cities,
  description: `Bloco de roteiro para ${block.country}.`,
  startDate: block.startDate,
  endDate: block.endDate,
  generationStrategy: 'single',
});

const filterDestinationContextForBlock = (
  context: DestinationContext,
  blockInput: TripPlanInput,
): DestinationContext => {
  const countryCodes = new Set(blockInput.countries.map(countryKey).filter(Boolean));
  const destinations = context.destinations.filter((destination) => countryCodes.has(destination.country_code));
  const destinationCityKeys = new Set(destinations.map((destination) => cityKey(destination.city_name ?? '')).filter(Boolean));
  const selectedCities = uniqueTexts(context.selectedCities.filter((city) => destinationCityKeys.has(cityKey(city))));
  const fallbackCities = uniqueTexts(
    blockInput.countries.flatMap((country) => defaultCitiesByCountry[countryKey(country)] ?? []),
  ).slice(0, getCityBudgetPerCountry(blockInput));

  return {
    ...context,
    destinations,
    attractions: context.attractions
      .filter((attraction) => countryCodes.has(attraction.country_code))
      .slice(0, 18),
    transportTips: context.transportTips
      .filter((tip) => countryCodes.has(tip.country_code))
      .slice(0, 10),
    documents: context.documents.filter((document) => countryCodes.has(document.country_code)),
    countryCodes: [...countryCodes],
    selectedCities: selectedCities.length ? selectedCities : fallbackCities,
    onlyCountryProvided: context.onlyCountryProvided,
  };
};

const summarizeUsedStageContext = (plans: EnsuredTripPlan[]) => {
  const cities = uniqueTexts(
    plans.flatMap((plan) => plan.itinerary_items.map((item) => asText(item.city)).filter(Boolean)),
  ).slice(0, 24);
  const activities = uniqueTexts(
    plans.flatMap((plan) => plan.itinerary_items.map((item) => asText(item.title)).filter(Boolean)),
  ).slice(0, 32);
  const documents = uniqueTexts(
    plans.flatMap((plan) => plan.documents.map((document) => asText(document.name ?? document.title)).filter(Boolean)),
  ).slice(0, 18);

  return [
    cities.length ? `Cidades ja usadas: ${cities.join(', ')}.` : 'Cidades ja usadas: nenhuma.',
    activities.length ? `Atividades ja usadas: ${activities.join(', ')}.` : 'Atividades ja usadas: nenhuma.',
    documents.length ? `Documentos ja adicionados: ${documents.join(', ')}.` : 'Documentos ja adicionados: nenhum.',
  ].join('\n');
};

const buildStagedBlockPrompt = ({
  input,
  blockInput,
  blockContext,
  block,
  previousPlans,
  compact,
}: {
  input: TripPlanInput;
  blockInput: TripPlanInput;
  blockContext: DestinationContext;
  block: StagedTripBlock;
  previousPlans: EnsuredTripPlan[];
  compact: boolean;
}) => {
  const contextPrompt = buildDestinationContextPrompt(blockInput, blockContext);
  const usedContext = summarizeUsedStageContext(previousPlans);
  const minItems = block.days * 3;
  const maxItems = block.days * (compact ? 4 : 5);

  return `
Voce e um planejador de viagens especialista. Responda SOMENTE JSON valido, sem markdown e sem texto fora do objeto.
Este e um bloco de uma viagem maior. Gere apenas o pais e as datas deste bloco para evitar timeout.

Viagem completa:
- Nome: ${input.tripName}
- Paises completos: ${input.countries.join(', ')}
- Datas completas: ${input.startDate} ate ${input.endDate}
- Estilo: ${input.style}
- Descricao do usuario: ${compactPromptText(input.description || 'Nao informada', 900)}

Bloco atual:
- Pais permitido: ${block.country}
- Dias globais: Dia ${block.startDay} ate Dia ${block.endDay}
- Datas do bloco: ${block.startDate} ate ${block.endDate}
- Retorne day_number local de 1 ate ${block.days}; o servidor consolidara para os dias globais.

Itens ja usados em blocos anteriores. Nao repita:
${usedContext}

Contexto real deste bloco:
${contextPrompt}

Qualidade obrigatoria:
- Gere entre ${minItems} e ${maxItems} itinerary_items.
- Cada dia deve ter 3 a 5 atividades reais, com manha, almoco/pausa e tarde/noite quando couber.
- Use cidades e atracoes reais. Nunca use "Ponto turistico principal", "Atracao principal", "Local famoso", "Passeio pela cidade", "Cidade escolhida", "Destino principal", "TBD" ou "A definir".
- Nao repita atividades, cidades ou documentos ja listados.
- Atracoes devem ser pontos reais do roteiro; nao inclua hotel, aeroporto, metro ou refeicao em attractions.
- Despesas devem usar a moeda local correta do pais e serem estimativas revisaveis, especificas e deduplicadas.
- Nunca use nomes finais genericos de gastos como "Transporte local", "Hospedagem base", "Alimentacao base", "Passeio base", "Estimativa generica", "Custo medio", "Despesa geral", "Transporte diario", "Hospedagem diaria", "Gasto estimado", "Outros gastos" ou "Gasto da viagem".
- Hospedagem deve ser por cidade/estadia, com check_in_date e check_out_date. Transporte urbano deve ser consolidado por cidade/periodo. Atividade paga deve usar nome especifico, como "Ingresso Coliseu".
- Nao crie varias despesas iguais. Valores e datas devem variar conforme cidade, deslocamento, atividade ou noites.
- Documentos devem ser especificos e consolidados; use linguagem cautelosa sobre regras oficiais.

Retorne exatamente este objeto:
{
  "intent_summary": "frase curta em portugues",
  "trip_summary": "string",
  "days": [
    {
      "day_number": 1,
      "date": "YYYY-MM-DD",
      "city": "cidade real",
      "country": "${block.country}",
      "activities": [
        {
          "time": "09:00",
          "title": "nome real e especifico",
          "category": "passeio",
          "city": "cidade real",
          "country": "${block.country}",
          "location": "local real",
          "description": "string curta",
          "details": "string curta",
          "estimated_cost": 0,
          "currency": "BRL, EUR, USD, JPY, CHF ou GBP",
          "useful_links": [],
          "tasks": []
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
    { "category": "Hospedagem", "title": "Hospedagem em cidade real", "description": "string", "estimated_cost": 0, "currency": "BRL, EUR, USD, JPY, CHF ou GBP", "country": "${block.country}", "city": "cidade real", "expense_date": "YYYY-MM-DD", "check_in_date": "YYYY-MM-DD ou vazio", "check_out_date": "YYYY-MM-DD ou vazio" }
  ],
  "attractions": [
    { "name": "string", "city": "string", "country": "${block.country}", "description": "string", "suggested_day": 1, "suggested_time": "10:00" }
  ],
  "warnings": ["string"]
}
`;
};

const getStagedBlockMaxCompletionTokens = (blockInput: TripPlanInput, compact: boolean) => {
  const days = getTripDayCount(blockInput);
  const base = compact ? 1400 : 1900;
  const perDay = compact ? 650 : 900;
  return Math.min(compact ? 3200 : 4600, Math.max(base, days * perDay));
};

const getStagedBlockTimeoutMs = (remainingMs: number, compact: boolean) =>
  Math.max(4_000, Math.min(compact ? STAGED_SUMMARY_BLOCK_TIMEOUT_MS : STAGED_BLOCK_TIMEOUT_MS, remainingMs - 4_000));

const getShiftedDayNumber = (block: StagedTripBlock, localDayNumber: number) =>
  Math.min(block.endDay, Math.max(block.startDay, block.startDay + Math.max(1, localDayNumber) - 1));

const shiftBlockPlanToTripDays = (
  plan: EnsuredTripPlan,
  input: TripPlanInput,
  block: StagedTripBlock,
): EnsuredTripPlan => ({
  ...plan,
  itinerary_items: plan.itinerary_items.map((item, index) => {
    const localDayNumber = getDayNumberFromItem(item) ?? Math.floor(index / 4) + 1;
    const dayNumber = getShiftedDayNumber(block, localDayNumber);
    const date = getDateForDay(input, dayNumber);

    return {
      ...item,
      day: `Dia ${dayNumber}${date ? ` - ${date}` : ''}`,
      date,
      country: asText(item.country) === 'international' ? 'international' : block.country,
      order_index: index,
    };
  }),
  attractions: plan.attractions.map((attraction) => {
    const localDayNumber = getDayNumber(attraction.day) ?? Number(attraction.suggested_day ?? 1);
    const dayNumber = getShiftedDayNumber(block, Number.isFinite(localDayNumber) ? localDayNumber : 1);

    return {
      ...attraction,
      country: block.country,
      day: `Dia ${dayNumber}`,
    };
  }),
  expenses: plan.expenses.map((expense) => ({
    ...expense,
    country: asText(expense.country) === 'international' ? 'international' : block.country,
  })),
});

const uniquifyRepeatedItineraryTitles = (items: Record<string, unknown>[]) => {
  const seen = new Map<string, number>();

  return items.map((item) => {
    const title = asText(item.title);
    const key = [
      countryKey(item.country),
      cityKey(item.city),
      normalizeKey(title),
    ].join('|');
    const count = seen.get(key) ?? 0;
    seen.set(key, count + 1);

    if (!title || count === 0) return item;

    const dayLabel = asText(item.day).split(' - ')[0] || `Dia ${count + 1}`;
    return {
      ...item,
      title: `${title} (${dayLabel})`,
    };
  });
};

const buildStageTransitionRoutes = (input: TripPlanInput, blocks: StagedTripBlock[]) =>
  blocks.slice(0, -1).map((block, index) => {
    const nextBlock = blocks[index + 1];
    const from = getDefaultCityForCountry(block.country, block.endDay);
    const to = getDefaultCityForCountry(nextBlock.country, nextBlock.startDay);
    const transport = input.description.toLowerCase().includes('motorhome') ? 'motorhome' : 'trem/aviao';

    return {
      from,
      to,
      transport,
      transport_type: transport,
      duration: '2h a 6h',
      description: `Deslocamento sugerido entre ${countryKey(block.country)} e ${countryKey(nextBlock.country)}. Confirme horarios e reservas.`,
      estimatedCost: 'A confirmar',
      notes: 'Ajuste conforme aeroporto, estação ou cidade-base escolhida.',
    };
  });

const mergeStagePlans = (
  input: TripPlanInput,
  blocks: StagedTripBlock[],
  plans: EnsuredTripPlan[],
  warnings: string[],
  generationMode: TripGenerationMode,
) => {
  const merged = ensurePlanShape({
    intent_summary: `Roteiro consolidado por etapas para ${input.countries.join(', ')}.`,
    summary: generationMode === 'summary'
      ? `Prévia resumida por etapas para ${input.tripName}.`
      : `Prévia por etapas para ${input.tripName}, consolidando ${blocks.length} bloco${blocks.length === 1 ? '' : 's'} de roteiro.`,
    documents: plans.flatMap((plan) => plan.documents),
    routes: [
      ...buildStageTransitionRoutes(input, blocks),
      ...plans.flatMap((plan) => plan.routes),
    ],
    itinerary_items: plans.flatMap((plan) => plan.itinerary_items),
    expenses: plans.flatMap((plan) => plan.expenses),
    attractions: plans.flatMap((plan) => plan.attractions),
    warnings: [
      'Sua viagem possui varios paises/dias. O roteiro foi gerado por etapas para evitar timeout.',
      ...warnings,
    ],
  }, input);

  return {
    ...merged,
    itinerary_items: uniquifyRepeatedItineraryTitles(merged.itinerary_items),
  };
};

const generatePlanInStages = async ({
  apiKey,
  configuredModel,
  input,
  destinationContext,
  contextWarnings,
  groupId,
  userId,
  generationMode,
  functionStartedAt,
}: {
  apiKey: string;
  configuredModel: string;
  input: TripPlanInput;
  destinationContext: DestinationContext;
  contextWarnings: string[];
  groupId: string;
  userId: string;
  generationMode: TripGenerationMode;
  functionStartedAt: number;
}) => {
  const compact = generationMode === 'summary';
  const blocks = buildCountryStageBlocks(input);
  const generatedPlans: EnsuredTripPlan[] = [];
  const warnings: string[] = [...contextWarnings];
  const skippedCountries = input.countries.length - blocks.length;

  if (skippedCountries > 0) {
    warnings.push('A viagem tem mais paises que dias. Alguns paises aparecem apenas em documentos, rotas ou revisão manual.');
  }

  for (const block of blocks) {
    const elapsedMs = Date.now() - functionStartedAt;
    const remainingMs = STAGED_TOTAL_BUDGET_MS - elapsedMs;
    const blockInput = createBlockInput(input, block);
    const blockContext = filterDestinationContextForBlock(destinationContext, blockInput);
    let blockPlan: EnsuredTripPlan | null = null;

    if (remainingMs > 5_500) {
      const timeoutMs = getStagedBlockTimeoutMs(remainingMs, compact);

      try {
        logAiEvent('info', 'staged_block_started', {
          group_id: groupId,
          user_id: userId,
          block_index: block.index + 1,
          block_country: block.country,
          block_days: block.days,
          remaining_ms: remainingMs,
          timeout_ms: timeoutMs,
          generation_mode: generationMode,
        });

        const rawBlockOutput = await generatePlanWithAI(
          apiKey,
          configuredModel,
          blockInput,
          blockContext,
          undefined,
          {
            groupId,
            userId,
            attempt: block.index + 1,
          },
          {
            stage: `block-${block.index + 1}-${countryKey(block.country)}`,
            timeoutMs,
            maxCompletionTokens: getStagedBlockMaxCompletionTokens(blockInput, compact),
            temperature: compact ? 0.32 : 0.36,
            prompt: buildStagedBlockPrompt({
              input,
              blockInput,
              blockContext,
              block,
              previousPlans: generatedPlans,
              compact,
            }),
          },
        );
        const schema = validateRawPlanSchema(rawBlockOutput);

        if (!schema.ok) throw new AiSchemaError(schema.reasons);

        const candidate = ensurePlanShape(rawBlockOutput, blockInput);
        const quality = validatePlanQuality(candidate, blockInput);

        if (!quality.ok) throw new AiQualityError(quality.reasons);

        blockPlan = candidate;
        logAiEvent('info', 'staged_block_generated', {
          group_id: groupId,
          user_id: userId,
          block_index: block.index + 1,
          block_country: block.country,
          itinerary_items: candidate.itinerary_items.length,
          documents: candidate.documents.length,
          expenses: candidate.expenses.length,
        });
      } catch (error) {
        warnings.push(`Bloco de ${block.country} foi complementado localmente porque a IA demorou ou retornou incompleto.`);
        logAiEvent('warn', 'staged_block_fallback_used', {
          group_id: groupId,
          user_id: userId,
          block_index: block.index + 1,
          block_country: block.country,
          error_code: error instanceof AiTimeoutError ? 'AI_TIMEOUT' : error instanceof AiQualityError ? 'AI_QUALITY_FAILED' : 'AI_BLOCK_FAILED',
          message: getErrorMessage(error),
        });
      }
    } else {
      warnings.push(`Bloco de ${block.country} foi montado localmente para respeitar o limite de tempo.`);
      logAiEvent('warn', 'staged_block_skipped_due_budget', {
        group_id: groupId,
        user_id: userId,
        block_index: block.index + 1,
        block_country: block.country,
        remaining_ms: remainingMs,
      });
    }

    if (!blockPlan) {
      blockPlan = createFallbackPlan(blockInput, `Bloco de ${block.country} gerado com fallback local para evitar timeout.`);
    }

    generatedPlans.push(shiftBlockPlanToTripDays(blockPlan, input, block));
  }

  let merged = mergeStagePlans(input, blocks, generatedPlans, warnings, generationMode);
  const quality = validatePlanQuality(merged, input);

  if (!quality.ok) {
    logAiEvent('warn', 'staged_merged_quality_repair', {
      group_id: groupId,
      user_id: userId,
      reasons: quality.reasons,
      itinerary_items: merged.itinerary_items.length,
    });

    const fallbackPlan = createFallbackPlan(input, 'Roteiro base complementado localmente para manter 3+ atividades por dia.');
    merged = mergeStagePlans(input, blocks, [merged, fallbackPlan], [...warnings, ...quality.reasons], generationMode);
  }

  return {
    ...merged,
    warnings: [
      ...new Set([
        ...merged.warnings,
        generationMode === 'summary'
          ? 'Versão resumida gerada por etapas. Revise antes de aplicar.'
          : 'Geração por etapas concluída. Revise antes de aplicar.',
      ]),
    ],
  };
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

    const configuredModel = activeModel;
    const fallbackModel = configuredModel === 'gpt-4.1-mini' ? configuredModel : 'gpt-4.1-mini';
    destinationContext = await fetchDestinationContext(adminSupabase, input);
    destinationSummary = buildDestinationSummary(input, destinationContext);
    const contextWarnings = getDestinationContextWarnings(destinationContext);

    logAiEvent('info', 'destination_context_loaded', {
      group_id: input.groupId,
      user_id: user.id,
      destination_summary: destinationSummary,
      intent_summary: destinationContext.intent.summary,
      intent_regions: destinationContext.intent.preferredRegions,
      intent_interests: destinationContext.intent.interests,
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
    const generationSizing = getTripGenerationSizing(input, destinationContext);
    const generationMode = resolveGenerationMode(input, generationSizing);
    let output: ReturnType<typeof ensurePlanShape> | null = null;
    let qualityReasons: string[] = [];
    let validationFailureKind: 'schema' | 'quality' = 'quality';

    logAiEvent('info', 'generation_strategy_resolved', {
      group_id: input.groupId,
      user_id: user.id,
      requested_strategy: input.generationStrategy,
      generation_mode: generationMode,
      countries_count: generationSizing.countriesCount,
      trip_days: generationSizing.tripDays,
      expected_activities: generationSizing.expectedActivities,
      prompt_length: generationSizing.promptLength,
      is_large_trip: generationSizing.isLargeTrip,
    });

    if (generationMode === 'staged' || generationMode === 'summary') {
      output = await generatePlanInStages({
        apiKey,
        configuredModel,
        input,
        destinationContext,
        contextWarnings,
        groupId: input.groupId,
        userId: user.id,
        generationMode,
        functionStartedAt,
      });
      activeModel = configuredModel;
    } else {
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
        const model = attempt === 1 ? configuredModel : fallbackModel;
        activeModel = model;
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
          if (error instanceof AiJsonError && model !== fallbackModel) {
            qualityReasons = ['modelo configurado retornou JSON invalido; repetindo com modelo de fallback'];
            validationFailureKind = 'schema';
            logAiEvent('warn', 'openai_json_failed_retrying_with_fallback_model', {
              group_id: input.groupId,
              user_id: user.id,
              attempt,
              model,
              fallback_model: fallbackModel,
              error_code: 'INVALID_JSON',
              message: error.message,
            });
            continue;
          }

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
    }

    const { data: generation, error: insertError } = await adminSupabase
      .from('ai_trip_generations')
      .insert({
        group_id: input.groupId,
        user_id: user.id,
        input,
        output: {
          ...output,
          generation_mode: generationMode,
          large_trip: generationSizing.isLargeTrip,
        },
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
      generationMode,
      largeTrip: generationSizing.isLargeTrip,
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
      generation_mode: generationMode,
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
        error_code: 'AI_TIMEOUT',
        timeout_ms: error.timeoutMs,
        message,
      });

      return errorResponse(
        'AI_TIMEOUT',
        'A viagem é grande e a IA demorou mais que o esperado. Tente gerar por etapas.',
        504,
        { timeoutMs: error.timeoutMs, originalMessage: message },
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
      const hasIntentMismatch = error.reasons.some((reason) => {
        const normalizedReason = stripDiacritics(reason);
        return normalizedReason.includes('intencao') || normalizedReason.includes('descricao');
      });
      const errorCode = hasGenericContent ? 'AI_QUALITY_FAILED' : hasIntentMismatch ? 'AI_INTENT_MISMATCH' : 'VALIDATION_FAILED';
      const responseMessage = hasGenericContent
        ? 'A prévia gerada ficou genérica demais. Tente informar cidades ou mais detalhes da viagem.'
        : hasIntentMismatch
          ? 'A IA não conseguiu montar uma prévia coerente com a descrição da viagem. Tente reforçar região, cidades ou interesses principais.'
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
