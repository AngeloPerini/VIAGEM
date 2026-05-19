import type { User } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  getCurrentSession,
  getCurrentUser,
  onAuthStateChange,
  resetPassword,
  signInWithGoogle,
  signInWithPassword,
  signOut as signOutFromSupabase,
  signUpWithEmail,
} from '../services/authService';
import { upsertCurrentProfile } from '../services/profileService';

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  initialLoading: boolean;
  isRefreshing: boolean;
  signIn: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<User | null>;
  signUp: (email: string, password: string) => Promise<User | null>;
  sendPasswordReset: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number): Promise<T> =>
  Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error('Tempo limite ao verificar sessao.')), timeoutMs);
    }),
  ]);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const initialLoadDoneRef = useRef(false);
  const refreshInFlightRef = useRef(false);

  const applyUser = (nextUser: User | null) => {
    setUser(nextUser);
    if (nextUser) {
      void upsertCurrentProfile(nextUser).catch(() => {
        // Profile support may not be migrated yet; auth should continue working.
      });
    }
  };

  useEffect(() => {
    let active = true;

    void withTimeout(getCurrentSession(), 10000)
      .then((session) => {
        if (active) applyUser(session?.user ?? null);
      })
      .catch(() => {
        if (active) applyUser(null);
      })
      .finally(() => {
        initialLoadDoneRef.current = true;
        if (active) setInitialLoading(false);
      });

    const refreshSessionInBackground = async () => {
      if (!initialLoadDoneRef.current || refreshInFlightRef.current) return;
      refreshInFlightRef.current = true;
      setIsRefreshing(true);

      try {
        const currentUser = await withTimeout(getCurrentUser(), 8000);
        if (active) applyUser(currentUser);
      } catch {
        // Keep the current UI visible on transient network/auth refresh failures.
      } finally {
        refreshInFlightRef.current = false;
        if (active) setIsRefreshing(false);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void refreshSessionInBackground();
    };

    const subscription = onAuthStateChange((nextUser, _session, event) => {
      applyUser(nextUser);
      if (event === 'SIGNED_OUT') {
        initialLoadDoneRef.current = true;
        setInitialLoading(false);
      }
    });

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', refreshSessionInBackground);

    return () => {
      active = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', refreshSessionInBackground);
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading: initialLoading,
      initialLoading,
      isRefreshing,
      signIn: signInWithGoogle,
      signInWithEmail: signInWithPassword,
      signUp: signUpWithEmail,
      sendPasswordReset: resetPassword,
      signOut: signOutFromSupabase,
    }),
    [initialLoading, isRefreshing, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth deve ser usado dentro de AuthProvider.');
  return context;
}
