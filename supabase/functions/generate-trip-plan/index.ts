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

const ensurePlanShape = (value: unknown) => {
  const plan = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const warnings = safeArray(plan.warnings).map(String);
  const requiredWarning = 'Confirme as exigencias oficiais antes da viagem.';

  return {
    summary: String(plan.summary ?? ''),
    documents: safeArray(plan.documents),
    routes: safeArray(plan.routes),
    itinerary_items: safeArray(plan.itinerary_items),
    expenses: safeArray(plan.expenses),
    attractions: safeArray(plan.attractions),
    warnings: warnings.some((warning) => warning.toLowerCase().includes('exigencias oficiais'))
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

const buildPrompt = (input: TripPlanInput) => `
Voce e um planejador de viagens cuidadoso. Responda somente JSON valido, sem markdown.

Crie uma proposta completa para esta viagem:
- Nome: ${input.tripName}
- Paises: ${input.countries.join(', ')}
- Datas: ${input.startDate} ate ${input.endDate}
- Estilo: ${input.style}
- Descricao: ${input.description || 'Nao informada'}
- Observacoes: ${input.notes || 'Nenhuma'}

Regras:
- Nao invente precos exatos. Use valores aproximados e faixas realistas.
- Sempre trate valores como planejados, nao reais.
- Priorize rotas realistas entre cidades.
- Inclua documentos de forma orientativa.
- Inclua o aviso "Confirme as exigencias oficiais antes da viagem.".
- Use country_id somente entre: italy, switzerland, france, international.
- Use category_id somente entre: lodging, transport, tours, Alimentação, Comprinhas, Outros.
- Use type somente entre: arrival, lodging, tour, transport, food, flight, train, rest, other.

Retorne exatamente este objeto:
{
  "summary": "string",
  "documents": [
    { "title": "string", "detail": "string" }
  ],
  "routes": [
    { "from": "string", "to": "string", "transport": "string", "duration": "string", "notes": "string" }
  ],
  "itinerary_items": [
    {
      "day": "Dia 1 - 2026-01-01",
      "country": "country_id",
      "city": "string",
      "time": "09:00",
      "title": "string",
      "description": "string",
      "type": "type",
      "links": []
    }
  ],
  "expenses": [
    {
      "category": "category_id",
      "country": "country_id",
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
      "country": "country_id",
      "city": "string",
      "day": "Dia 1",
      "time": "09:00",
      "description": "string",
      "links": []
    }
  ],
  "warnings": ["string"]
}
`;

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

    if (used >= limit) {
      return errorResponse(
        'AI_GENERATION_LIMIT_REACHED',
        'Você atingiu o limite gratuito de 3 gerações de viagem com IA.',
        429,
      );
    }

    if (
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
    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.35,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'Voce gera apenas JSON valido para planejamento de viagem. Nao retorne texto fora do JSON.',
          },
          { role: 'user', content: buildPrompt(input) },
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

    const output = ensurePlanShape(extractJsonObject(content));

    const { data: quotaResult, error: quotaError } = await adminSupabase
      .rpc('consume_ai_generation_quota', { target_user_id: user.id })
      .single<QuotaResult>();

    if (quotaError) throw quotaError;
    if (!quotaResult.allowed) {
      await logFailedGeneration(quotaResult.message ?? 'Geracao bloqueada por limite de uso.');

      return errorResponse(
        quotaResult.error_code ?? 'AI_GENERATION_BLOCKED',
        quotaResult.message ?? 'Nao foi possivel consumir sua cota de IA.',
        429,
      );
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
        used: quotaResult.ai_generations_used,
        limit: quotaResult.ai_generations_limit,
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
