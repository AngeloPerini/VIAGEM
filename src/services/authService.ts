import type { AuthChangeEvent, Session, Subscription, User } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';

type AuthStateCallback = (user: User | null, session: Session | null, event: AuthChangeEvent) => void;

const getRedirectUrl = () => window.location.href;

export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: getRedirectUrl(),
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
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
