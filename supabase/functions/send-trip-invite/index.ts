import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type InviteEmailPayload = {
  groupId?: string;
  token?: string;
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });

const errorResponse = (
  code: string,
  message: string,
  status = 400,
  details?: Record<string, unknown>,
) => jsonResponse({ error: code, code, message, details }, status);

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

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

const getAppBaseUrl = () =>
  trimTrailingSlash(
    Deno.env.get('APP_URL') ??
      Deno.env.get('PUBLIC_APP_URL') ??
      Deno.env.get('VITE_APP_URL') ??
      'https://tripflow.online',
  );

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

const parseFromAddress = (value: string) => {
  const match = value.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (!match) return { email: value.trim(), name: 'TripFlow' };
  return { name: match[1].trim() || 'TripFlow', email: match[2].trim() };
};

const logInviteEvent = (
  level: 'info' | 'warn' | 'error',
  event: string,
  details: Record<string, unknown> = {},
) => {
  console[level](`[send-trip-invite] ${event}`, {
    event,
    at: new Date().toISOString(),
    ...details,
  });
};

const sendEmail = async ({
  to,
  subject,
  html,
  text,
}: {
  to: string;
  subject: string;
  html: string;
  text: string;
}) => {
  const apiKey =
    Deno.env.get('EMAIL_API_KEY') ??
    Deno.env.get('RESEND_API_KEY') ??
    Deno.env.get('BREVO_API_KEY') ??
    Deno.env.get('SENDGRID_API_KEY');

  if (!apiKey) {
    return {
      ok: false,
      status: 503,
      provider: 'none',
      body: { message: 'EMAIL_API_KEY nao configurada.' },
    };
  }

  const provider = (Deno.env.get('EMAIL_PROVIDER') ?? 'resend').trim().toLowerCase();
  const from = Deno.env.get('EMAIL_FROM') ?? 'TripFlow <onboarding@resend.dev>';
  const fromAddress = parseFromAddress(from);

  if (provider === 'brevo') {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: fromAddress,
        to: [{ email: to }],
        subject,
        htmlContent: html,
        textContent: text,
      }),
    });

    return {
      ok: response.ok,
      status: response.status,
      provider,
      body: await response.json().catch(() => ({})),
    };
  }

  if (provider === 'sendgrid') {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }], subject }],
        from: fromAddress,
        content: [
          { type: 'text/plain', value: text },
          { type: 'text/html', value: html },
        ],
      }),
    });

    return {
      ok: response.ok,
      status: response.status,
      provider,
      body: await response.json().catch(() => ({})),
    };
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html,
      text,
    }),
  });

  return {
    ok: response.ok,
    status: response.status,
    provider: 'resend',
    body: await response.json().catch(() => ({})),
  };
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse('METHOD_NOT_ALLOWED', 'Metodo nao permitido.', 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const publishableKey = getPublishableKey();
  const authorization = req.headers.get('Authorization') ?? '';

  if (!supabaseUrl || !publishableKey) {
    return errorResponse('SUPABASE_NOT_CONFIGURED', 'Supabase nao configurado na Edge Function.', 500);
  }

  if (!authorization.startsWith('Bearer ')) {
    return errorResponse('UNAUTHENTICATED', 'Usuario nao autenticado.', 401);
  }

  const supabase = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization } },
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) return errorResponse('UNAUTHENTICATED', 'Sessao invalida.', 401);

  let payload: InviteEmailPayload;
  try {
    payload = await req.json();
  } catch {
    return errorResponse('INVALID_INPUT', 'Payload invalido.', 400);
  }

  const groupId = String(payload.groupId ?? '').trim();
  const token = String(payload.token ?? '').trim().toUpperCase();

  if (!groupId || !token) {
    return errorResponse('INVALID_INPUT', 'Informe group_id e token do convite.', 400);
  }

  const { data: group, error: groupError } = await supabase
    .from('travel_groups')
    .select('id, name, description, owner_id')
    .eq('id', groupId)
    .maybeSingle();

  if (groupError) {
    logInviteEvent('error', 'group_lookup_failed', {
      group_id: groupId,
      user_id: user.id,
      message: groupError.message,
    });
    return errorResponse('SUPABASE_ERROR', 'Nao foi possivel buscar a viagem.', 500);
  }

  if (!group) return errorResponse('GROUP_NOT_FOUND', 'Viagem nao encontrada.', 404);
  if (group.owner_id !== user.id) {
    logInviteEvent('warn', 'owner_check_failed', {
      group_id: groupId,
      user_id: user.id,
      owner_id: group.owner_id,
    });
    return errorResponse('FORBIDDEN', 'Apenas o owner pode enviar convites.', 403);
  }

  const { data: invite, error: inviteError } = await supabase
    .from('group_invites')
    .select('id, group_id, email, token, expires_at, used, accepted_at, rejected_at')
    .eq('group_id', groupId)
    .eq('token', token)
    .maybeSingle();

  if (inviteError) {
    logInviteEvent('error', 'invite_lookup_failed', {
      group_id: groupId,
      user_id: user.id,
      message: inviteError.message,
    });
    return errorResponse('SUPABASE_ERROR', 'Nao foi possivel buscar o convite.', 500);
  }

  if (!invite) return errorResponse('INVITE_NOT_FOUND', 'Convite nao encontrado.', 404);
  if (!invite.email) return errorResponse('INVITE_EMAIL_REQUIRED', 'Convite sem e-mail nao pode ser enviado.', 422);
  if (invite.used || invite.accepted_at || invite.rejected_at) {
    return errorResponse('INVITE_NOT_PENDING', 'Convite ja foi usado ou recusado.', 409);
  }
  if (invite.expires_at && new Date(invite.expires_at).getTime() <= Date.now()) {
    return errorResponse('INVITE_EXPIRED', 'Convite expirado.', 410);
  }

  const { data: ownerProfile } = await supabase
    .from('profiles')
    .select('full_name, email')
    .eq('id', user.id)
    .maybeSingle();

  const inviterName =
    ownerProfile?.full_name ??
    user.user_metadata?.full_name ??
    user.user_metadata?.name ??
    ownerProfile?.email ??
    user.email ??
    'TripFlow';

  const inviteLink = `${getAppBaseUrl()}/invite/${encodeURIComponent(token)}`;
  const fallbackLink = `https://viagem-europa-angelo.web.app/invite/${encodeURIComponent(token)}`;
  const tripName = String(group.name ?? 'sua viagem');
  const expiresAt = invite.expires_at
    ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(invite.expires_at))
    : '7 dias';

  const subject = 'Você foi convidado para uma viagem no TripFlow';
  const safeTripName = escapeHtml(tripName);
  const safeInviterName = escapeHtml(String(inviterName));
  const safeToken = escapeHtml(token);
  const safeInviteLink = escapeHtml(inviteLink);
  const safeFallbackLink = escapeHtml(fallbackLink);

  const text = [
    `Você foi convidado para participar da viagem ${tripName}.`,
    `Convite enviado por ${inviterName}.`,
    `Clique para aceitar: ${inviteLink}`,
    `Código do convite: ${token}`,
    `Validade: ${expiresAt}.`,
    `Se o link principal não abrir, use: ${fallbackLink}`,
  ].join('\n');

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;max-width:620px;margin:0 auto;padding:32px;color:#0f172a">
      <div style="border:1px solid #dbeafe;border-radius:20px;padding:28px;background:#ffffff">
        <p style="margin:0 0 12px;font-size:12px;font-weight:800;letter-spacing:.16em;color:#0f766e;text-transform:uppercase">TripFlow</p>
        <h1 style="margin:0 0 16px;font-size:28px;line-height:1.2">Você foi convidado para uma viagem</h1>
        <p style="margin:0 0 18px;font-size:16px;line-height:1.6;color:#334155">
          ${safeInviterName} convidou você para participar da viagem <strong>${safeTripName}</strong>.
        </p>
        <a href="${safeInviteLink}" style="display:inline-block;margin:8px 0 20px;padding:14px 20px;border-radius:14px;background:#0f172a;color:#ffffff;text-decoration:none;font-weight:800">
          Aceitar convite
        </a>
        <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#475569">
          Código do convite: <strong>${safeToken}</strong>
        </p>
        <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#475569">
          Validade: ${escapeHtml(expiresAt)}.
        </p>
        <p style="margin:18px 0 0;font-size:12px;line-height:1.6;color:#64748b">
          Se o link principal não abrir, use este link alternativo:
          <br><a href="${safeFallbackLink}" style="color:#0f766e">${safeFallbackLink}</a>
        </p>
      </div>
    </div>
  `;

  const emailResult = await sendEmail({
    to: invite.email,
    subject,
    html,
    text,
  });

  if (!emailResult.ok) {
    logInviteEvent('error', 'email_send_failed', {
      group_id: groupId,
      user_id: user.id,
      invite_id: invite.id,
      provider: emailResult.provider,
      provider_status: emailResult.status,
      message: typeof emailResult.body === 'object' ? JSON.stringify(emailResult.body) : String(emailResult.body),
    });

    return errorResponse(
      'EMAIL_SEND_FAILED',
      'Convite salvo, mas o e-mail nao foi enviado. Verifique EMAIL_API_KEY/EMAIL_PROVIDER.',
      502,
      { provider: emailResult.provider, providerStatus: emailResult.status },
    );
  }

  logInviteEvent('info', 'email_sent', {
    group_id: groupId,
    user_id: user.id,
    invite_id: invite.id,
    provider: emailResult.provider,
    provider_status: emailResult.status,
  });

  return jsonResponse({
    sent: true,
    provider: emailResult.provider,
    inviteId: invite.id,
    link: inviteLink,
  });
});
