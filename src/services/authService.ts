import type { AuthChangeEvent, Session, Subscription, User } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';

type AuthStateCallback = (user: User | null, session: Session | null, event: AuthChangeEvent) => void;

const getRedirectUrl = () => window.location.href;
const GOOGLE_OAUTH_SETUP_ERROR =
  'Login com Google ainda nao esta configurado corretamente. Verifique Client ID e Client Secret no Supabase.';

const getOAuthErrorMessage = async (response: Response) => {
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    const payload = (await response.json().catch(() => null)) as
      | { msg?: string; message?: string; error_description?: string; error?: string }
      | null;
    return payload?.msg ?? payload?.message ?? payload?.error_description ?? payload?.error ?? '';
  }

  return response.text().catch(() => '');
};

export async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: getRedirectUrl(),
      skipBrowserRedirect: true,
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  });

  if (error) throw error;
  if (!data.url) throw new Error('Nao foi possivel iniciar o login com Google.');

  const validationUrl = new URL(data.url);
  validationUrl.searchParams.set('skip_http_redirect', 'true');

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 6000);
  let response: Response;

  try {
    response = await fetch(validationUrl.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'omit',
      signal: controller.signal,
    });
  } catch {
    throw new Error(GOOGLE_OAUTH_SETUP_ERROR);
  } finally {
    window.clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const message = await getOAuthErrorMessage(response);
    const normalizedMessage = message.toLowerCase();

    if (
      normalizedMessage.includes('missing oauth secret') ||
      normalizedMessage.includes('unsupported provider')
    ) {
      throw new Error(GOOGLE_OAUTH_SETUP_ERROR);
    }

    throw new Error(message || 'Nao foi possivel iniciar o login com Google.');
  }

  const payload = (await response.json().catch(() => null)) as { url?: string } | null;
  window.location.assign(payload?.url ?? data.url);
}

export async function signInWithPassword(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) throw error;
  return data.user;
}

export async function signUpWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      emailRedirectTo: window.location.origin,
    },
  });

  if (error) throw error;
  return data.user;
}

export async function resetPassword(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: window.location.origin,
  });

  if (error) throw error;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getCurrentUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) throw error;
  return user;
}

export function onAuthStateChange(callback: AuthStateCallback): Subscription {
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((event, session) => {
    callback(session?.user ?? null, session, event);
  });

  return subscription;
}
