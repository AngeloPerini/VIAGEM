import { createClient } from 'npm:@supabase/supabase-js@2';

type TripStyle = 'economica' | 'intermediaria' | 'confortavel';

type TripPlanInput = {
  tripName: string;
  countries: string[];
  description: string;
  startDate: string;
  endDate: string;
  style: TripStyle;
  notes: string;
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

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });

const errorResponse = (error: string, message: string, status = 400) =>
  jsonResponse({ error, message }, status);

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

const normalizeInput = (payload: Record<string, unknown>): TripPlanInput => {
  const countries = Array.isArray(payload.countries)
    ? payload.countries.map((country) => String(country).trim()).filter(Boolean)
    : [];

  const style = isTripStyle(payload.style) ? payload.style : 'intermediaria';
  const input = {
    tripName: String(payload.tripName ?? '').trim(),
    countries,
    description: String(payload.description ?? '').trim(),
    startDate: String(payload.startDate ?? '').trim(),
    endDate: String(payload.endDate ?? '').trim(),
    style,
    notes: String(payload.notes ?? '').trim(),
    groupId: String(payload.groupId ?? '').trim(),
  };

  if (!input.tripName) throw new Error('Informe o nome da viagem.');
  if (!input.groupId) throw new Error('Informe o grupo da viagem.');
  if (!input.countries.length) throw new Error('Informe pelo menos um pais.');
  if (!input.startDate || !input.endDate) throw new Error('Informe as datas da viagem.');

  return input;
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
  return days >= 10 ? Math.max(days * 3, 35) : days * 3;
};

const getIdealItineraryRange = (input: TripPlanInput) => {
  const days = getTripDayCount(input);
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
        const country = resolveAllowedCountry(item.country, countryMap, fallbackCountry) ?? asText(item.country);
        const orderIndex = Number(item.order_index ?? item.orderIndex ?? index);

        return {
          ...item,
          day,
          date,
          time: asText(item.time),
          country,
          city: asText(item.city),
          title: asText(item.title, 'Atividade sugerida'),
          description: asText(item.description),
          type: asText(item.type, 'outro'),
          order_index: Number.isFinite(orderIndex) ? orderIndex : index,
          links: safeArray(item.links),
        };
      })
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
      .map((expense) => ({
        ...expense,
        category: asText(expense.category, 'Outros'),
        country: resolveAllowedCountry(expense.country, countryMap, fallbackCountry) ?? asText(expense.country),
        title: asText(expense.title ?? expense.description, 'Gasto planejado'),
        detail: asText(expense.detail ?? expense.details, 'Aproximado / planejado'),
        links: safeArray(expense.links),
      }))
      .filter((expense) => asText(expense.title)),
    expenseKey,
  );

  const explicitAttractions = asRecords(plan.attractions)
    .map((attraction) => ({
      ...attraction,
      name: asText(attraction.name ?? attraction.title),
      country: resolveAllowedCountry(attraction.country, countryMap, fallbackCountry) ?? asText(attraction.country),
      city: asText(attraction.city),
      day: asText(attraction.day),
      time: asText(attraction.time),
      description: asText(attraction.description),
      links: safeArray(attraction.links),
    }))
    .filter((attraction) => looksLikeAttraction(attraction, false));

  const itineraryAttractions = itineraryItems
    .filter((item) => looksLikeAttraction(item, true))
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

const extractJsonObject = (content: string) => {
  try {
    return JSON.parse(content);
  } catch {
    const firstBrace = content.indexOf('{');
    const lastBrace = content.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) throw new Error('A IA nao retornou JSON valido.');
    return JSON.parse(content.slice(firstBrace, lastBrace + 1));
  }
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

  if (singleItemDays.length) {
    reasons.push(`dias com apenas 1 item sem justificativa: ${singleItemDays.map((day) => `Dia ${day}`).join(', ')}`);
  }

  if (tripDays >= 4 && veryThinDays.length > Math.max(1, Math.floor(tripDays * 0.2))) {
    reasons.push(`muitos dias com menos de 3 itens: ${veryThinDays.map((day) => `Dia ${day}`).join(', ')}`);
  }

  return {
    ok: reasons.length === 0,
    reasons,
  };
};

const buildPrompt = (input: TripPlanInput, qualityFeedback?: string) => {
  const tripDays = getTripDayCount(input);
  const minimumItems = getMinimumItineraryItems(input);
  const idealRange = getIdealItineraryRange(input);

  return `
Voce e um planejador de viagens cuidadoso. Responda somente JSON valido, sem markdown.

Crie uma proposta completa para esta viagem:
- Nome: ${input.tripName}
- Paises permitidos: ${input.countries.join(', ')}
- Datas: ${input.startDate} ate ${input.endDate} (${tripDays} dias, contando inicio e fim)
- Estilo: ${input.style}
- Descricao: ${input.description || 'Nao informada'}
- Observacoes do usuario: ${input.notes || 'Nenhuma'}

Regra principal de qualidade:
- Gere um roteiro completo. Nao crie dias vazios ou com apenas uma atividade, exceto quando for inevitavel por voo longo ou deslocamento extenso. Para cada dia completo, gere entre 4 e 8 blocos com horarios, locais e descricao curta.
- Para esta viagem, gere no minimo ${minimumItems} itinerary_items. O ideal e ficar entre ${idealRange.min} e ${idealRange.max} itens, distribuidos de forma equilibrada.
- Cada dia util precisa ter manha, almoco, tarde e noite. Dias de chegada/voo podem ter menos blocos, mas ainda devem incluir chegada, deslocamento, check-in, passeio leve proximo e jantar/noite livre quando houver tempo.
- Nao desperdice dias: se um dia ficar com 1 item sem justificativa forte, complemente com atividades leves, refeicoes, deslocamentos e noite livre.

Regras de planejamento:
- Agrupe atracoes proximas no mesmo dia e evite deslocamentos desnecessarios.
- Respeite o ritmo da viagem:
  - Economica: mais transporte publico, caminhadas e atracoes gratuitas ou baratas.
  - Intermediaria: equilibrio entre transporte publico, conforto e atracoes pagas importantes.
  - Confortavel: deslocamentos melhores, pausas maiores e menos correria.
- Considere com prioridade as observacoes do usuario.
- Se as observacoes indicarem motorhome, inclua retirada/devolucao do veiculo, deslocamentos por estrada, paradas estrategicas, cidades-base, tempo realista de direcao e blocos do tipo motorhome.
- Em viagens de muitos dias, distribua cidades e atracoes de forma equilibrada. Dias de deslocamento devem ter atividades leves antes ou depois do trecho.
- Gere roteiro cronologico e realista, com horarios em formato HHhMM ou HH:MM.
- Use somente estes paises no campo country: ${input.countries.join(', ')}. Para voos/trechos internacionais sem pais especifico, use "international".
- Nao use Italia, Suica, Franca ou qualquer pais antigo/hardcoded se eles nao estiverem nos paises permitidos.

Tipos permitidos para itinerary_items:
- chegada
- hospedagem
- passeio
- transporte
- alimentacao
- voo
- trem
- motorhome
- descanso
- compras
- documento
- outro

Despesas:
- Gere gastos aproximados compativeis com o roteiro completo, nao valores genericos demais.
- Categorias permitidas: Hospedagem, Transporte, Passeios, Alimentacao, Comprinhas, Documentos, Seguro, Outros.
- Inclua hospedagem por cidade/base, transportes por trecho, passeios pagos relevantes, alimentacao proporcional aos dias, documentos/seguro quando aplicavel e pequenos extras.
- Use valores planejados em euro e real com faixas min/max realistas.

Pontos turisticos:
- Transforme todos os pontos turisticos reais do roteiro em attractions.
- Nao inclua hotel, check-in, aeroporto, metro, almoco, jantar ou deslocamento em attractions.
- Inclua somente atracoes, pracas, museus, mirantes, parques, bairros turisticos e experiencias relevantes.

Rotas:
- Gere rotas uteis com cidade origem, cidade destino, meio de transporte, tempo aproximado, custo aproximado e observacao.
- Inclua rotas entre cidades-base, aeroportos/estacoes quando relevantes e deslocamentos de motorhome/estrada quando aplicavel.

Validacao antes de retornar:
- Verifique se cada dia tem itens suficientes.
- Se algum dia tiver 1 item sem justificativa, complemente o dia.
- Remova duplicados.
- Garanta que paises sejam apenas os paises informados.
- Garanta que os filtros de pais possam ser gerados apenas com base nos paises da viagem.
- Garanta que nao aparecam paises de outra viagem.

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
      "country": "um dos paises permitidos ou international",
      "city": "string",
      "title": "string",
      "description": "string",
      "type": "um dos tipos permitidos",
      "order_index": 0,
      "links": []
    }
  ],
  "expenses": [
    {
      "category": "uma das categorias permitidas",
      "country": "um dos paises permitidos ou international",
      "title": "string",
      "detail": "Aproximado / planejado",
      "euro": { "min": 0, "max": 0 },
      "real": { "min": 0, "max": 0 },
      "links": []
    }
  ],
  "attractions": [
    {
      "name": "string",
      "country": "um dos paises permitidos ou international",
      "city": "string",
      "day": "Dia 1",
      "time": "09h00",
      "description": "string",
      "links": []
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
) => {
  const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
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

  if (!aiResponse.ok) {
    const errorText = await aiResponse.text().catch(() => '');
    throw new Error(errorText || 'Falha ao chamar a API da IA.');
  }

  const aiPayload = await aiResponse.json();
  const content = aiPayload?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('A IA nao retornou conteudo valido.');

  return extractJsonObject(content);
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
    return jsonResponse({ error: error instanceof Error ? error.message : 'Entrada invalida.' }, 400);
  }

  const logFailedGeneration = async (feedback: string) => {
    try {
      await adminSupabase.from('ai_trip_generations').insert({
        group_id: input.groupId,
        user_id: user.id,
        input,
        status: 'failed',
        feedback,
      });
    } catch {
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
    if (!membership) return errorResponse('FORBIDDEN', 'Voce nao participa desta viagem.', 403);

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
      return errorResponse(
        'AI_GENERATION_COOLDOWN',
        'Aguarde alguns segundos antes de gerar novamente.',
        429,
      );
    }

    const apiKey = Deno.env.get('OPENAI_API_KEY') ?? Deno.env.get('AI_API_KEY');
    if (!apiKey) {
      await logFailedGeneration('OPENAI_API_KEY/AI_API_KEY nao configurada.');

      return errorResponse(
        'AI_PROVIDER_NOT_CONFIGURED',
        'IA ainda nao configurada. Adicione OPENAI_API_KEY nos secrets da Supabase Edge Function.',
        503,
      );
    }

    const model = Deno.env.get('AI_MODEL') ?? 'gpt-4.1-mini';
    let output: ReturnType<typeof ensurePlanShape> | null = null;
    let qualityReasons: string[] = [];

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const qualityFeedback = qualityReasons.length ? qualityReasons.join('; ') : undefined;
      const rawOutput = await generatePlanWithAI(apiKey, model, input, qualityFeedback);
      const candidate = ensurePlanShape(rawOutput, input);
      const quality = validatePlanQuality(candidate, input);

      if (quality.ok) {
        output = candidate;
        break;
      }

      qualityReasons = quality.reasons;
    }

    if (!output) {
      throw new Error(
        `Roteiro gerado esta incompleto: ${qualityReasons.join('; ') || 'qualidade insuficiente'}. Tente gerar novamente.`,
      );
    }

    let quotaResult: QuotaResult | null = null;

    if (!isUnlimitedTester) {
      const { data, error } = await adminSupabase
        .rpc('consume_ai_generation_quota', { target_user_id: user.id })
        .single<QuotaResult>();

      if (error) throw error;
      quotaResult = data;
      if (!quotaResult.allowed) {
        await logFailedGeneration(quotaResult.message ?? 'Geracao bloqueada por limite de uso.');

        return errorResponse(
          quotaResult.error_code ?? 'AI_GENERATION_BLOCKED',
          quotaResult.message ?? 'Nao foi possivel consumir sua cota de IA.',
          429,
        );
      }
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

    if (insertError) throw insertError;

    return jsonResponse({
      generationId: generation.id,
      quota: {
        used: quotaResult?.ai_generations_used ?? used,
        limit: quotaResult?.ai_generations_limit ?? limit,
        unlimited: isUnlimitedTester,
      },
      ...output,
    });
  } catch (error) {
    const message = getErrorMessage(error);
    await logFailedGeneration(message);

    return errorResponse(
      'AI_GENERATION_FAILED',
      message,
      500,
    );
  }
});
