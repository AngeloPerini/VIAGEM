import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, KeyRound, Lock, Mail, Plane, Ticket, UserPlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { normalizeInviteToken, storePendingInviteToken } from '../services/groupsService';

type AuthMode = 'login' | 'signup' | 'reset';
type LoadingAction = 'google' | 'login' | 'signup' | 'reset' | 'invite' | null;

type AuthPageProps = {
  initialInviteCode?: string | null;
};

const friendlyAuthError = (message: string) => {
  const normalized = message.toLowerCase();

  if (normalized.includes('invalid login credentials')) {
    return 'E-mail ou senha incorretos.';
  }

  if (normalized.includes('email not confirmed')) {
    return 'Confirme seu e-mail antes de entrar.';
  }

  if (normalized.includes('password')) {
    return 'Confira a senha e tente novamente.';
  }

  return message || 'Nao foi possivel concluir a acao agora.';
};

export function AuthPage({ initialInviteCode }: AuthPageProps) {
  const { sendPasswordReset, signIn, signInWithEmail, signUp } = useAuth();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [inviteCode, setInviteCode] = useState(initialInviteCode ?? '');
  const [message, setMessage] = useState<string | null>(
    initialInviteCode ? 'Convite detectado. Entre para aceitar automaticamente.' : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<LoadingAction>(null);

  const normalizedInviteCode = useMemo(() => normalizeInviteToken(inviteCode), [inviteCode]);

  const rememberInvite = () => {
    if (!normalizedInviteCode) return false;
    storePendingInviteToken(normalizedInviteCode);
    return true;
  };

  const handleGoogle = async () => {
    setError(null);
    rememberInvite();
    setLoadingAction('google');

    try {
      await signIn();
    } catch (caughtError) {
      setError(friendlyAuthError(caughtError instanceof Error ? caughtError.message : 'Falha ao abrir o Google.'));
      setLoadingAction(null);
    }
  };

  const handleEmailLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    rememberInvite();
    setLoadingAction('login');

    try {
      await signInWithEmail(email, password);
      setMessage('Login concluido.');
    } catch (caughtError) {
      setError(friendlyAuthError(caughtError instanceof Error ? caughtError.message : 'Falha no login.'));
    } finally {
      setLoadingAction(null);
    }
  };

  const handleSignUp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (password !== passwordConfirmation) {
      setError('As senhas nao conferem.');
      return;
    }

    rememberInvite();
    setLoadingAction('signup');

    try {
      await signUp(email, password);
      setMessage('Conta criada. Se o Supabase pedir confirmacao, verifique seu e-mail.');
    } catch (caughtError) {
      setError(friendlyAuthError(caughtError instanceof Error ? caughtError.message : 'Falha ao criar conta.'));
    } finally {
      setLoadingAction(null);
    }
  };

  const handleReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setLoadingAction('reset');

    try {
      await sendPasswordReset(email);
      setMessage('Enviamos um link de recuperacao para seu e-mail.');
    } catch (caughtError) {
      setError(friendlyAuthError(caughtError instanceof Error ? caughtError.message : 'Falha ao enviar recuperacao.'));
    } finally {
      setLoadingAction(null);
    }
  };

  const handleInvite = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLoadingAction('invite');

    if (!rememberInvite()) {
      setError('Digite um codigo de convite valido.');
      setLoadingAction(null);
      return;
    }

    setMessage('Codigo salvo. Entre ou crie uma conta para acessar a viagem.');
    setLoadingAction(null);
  };

  const sharedInputClass =
    'h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 font-semibold text-slate-900 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100';

  return (
    <main className="min-h-screen overflow-hidden bg-[#edf4f2] text-slate-950">
      <div className="mx-auto grid min-h-screen w-full max-w-7xl gap-6 px-4 py-6 md:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-center lg:px-8">
        <motion.section
          className="flex min-h-[28rem] flex-col justify-between rounded-[2rem] bg-slate-950 p-7 text-white shadow-2xl shadow-slate-900/20 md:p-10"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div>
            <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-slate-950">
              <Plane className="h-7 w-7" />
            </span>
            <p className="mt-8 text-sm font-black uppercase tracking-[0.22em] text-teal-200">
              Minha Viagem Europa
            </p>
            <h1 className="mt-3 max-w-xl text-4xl font-black tracking-tight md:text-6xl">
              Uma viagem, um grupo, dados protegidos.
            </h1>
            <p className="mt-5 max-w-lg text-lg leading-8 text-slate-300">
              Entre para sincronizar gastos, roteiro, pontos turisticos e fotos apenas com quem participa da viagem.
            </p>
          </div>

          <div className="mt-10 grid gap-3 text-sm font-bold text-slate-300 sm:grid-cols-3">
            <span className="rounded-2xl bg-white/10 px-4 py-3">Google Auth</span>
            <span className="rounded-2xl bg-white/10 px-4 py-3">Supabase RLS</span>
            <span className="rounded-2xl bg-white/10 px-4 py-3">Convite seguro</span>
          </div>
        </motion.section>

        <motion.section
          className="rounded-[2rem] border border-white/80 bg-white/90 p-5 shadow-2xl shadow-slate-900/10 backdrop-blur md:p-8"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.5 }}
        >
          <div className="mb-6 flex flex-wrap gap-2 rounded-3xl bg-slate-100 p-1">
            {[
              { id: 'login', label: 'Entrar' },
              { id: 'signup', label: 'Criar conta' },
              { id: 'reset', label: 'Esqueci minha senha' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setMode(item.id as AuthMode);
                  setError(null);
                  setMessage(null);
                }}
                className={`relative h-11 flex-1 rounded-2xl px-3 text-sm font-black transition ${
                  mode === item.id ? 'text-white' : 'text-slate-500 hover:text-slate-950'
                }`}
              >
                {mode === item.id ? (
                  <motion.span
                    layoutId="auth-mode"
                    className="absolute inset-0 rounded-2xl bg-slate-950"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  />
                ) : null}
                <span className="relative">{item.label}</span>
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => void handleGoogle()}
            disabled={loadingAction !== null}
            className="inline-flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-slate-950 px-5 py-4 font-black text-white shadow-xl shadow-slate-900/20 transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-sm font-black text-slate-950">
              G
            </span>
            {loadingAction === 'google' ? 'Abrindo Google...' : 'Entrar com Google'}
          </button>

          <div className="my-6 flex items-center gap-3 text-xs font-black uppercase tracking-[0.18em] text-slate-400">
            <span className="h-px flex-1 bg-slate-200" />
            ou
            <span className="h-px flex-1 bg-slate-200" />
          </div>

          <AnimatePresence mode="wait">
            {mode === 'login' ? (
              <motion.form
                key="login"
                onSubmit={handleEmailLogin}
                className="space-y-4"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
              >
                <label className="block">
                  <span className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-600">
                    <Mail className="h-4 w-4" /> E-mail
                  </span>
                  <input
                    required
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className={sharedInputClass}
                  />
                </label>
                <label className="block">
                  <span className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-600">
                    <Lock className="h-4 w-4" /> Senha
                  </span>
                  <input
                    required
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className={sharedInputClass}
                  />
                </label>
                <button
                  type="submit"
                  disabled={loadingAction !== null}
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-teal-600 px-5 font-black text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {loadingAction === 'login' ? 'Entrando...' : 'Entrar com e-mail'}
                  <ArrowRight className="h-5 w-5" />
                </button>
              </motion.form>
            ) : mode === 'signup' ? (
              <motion.form
                key="signup"
                onSubmit={handleSignUp}
                className="space-y-4"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
              >
                <label className="block">
                  <span className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-600">
                    <Mail className="h-4 w-4" /> E-mail
                  </span>
                  <input
                    required
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className={sharedInputClass}
                  />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-600">
                      <Lock className="h-4 w-4" /> Senha
                    </span>
                    <input
                      required
                      minLength={6}
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className={sharedInputClass}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-600">
                      <KeyRound className="h-4 w-4" /> Confirmar
                    </span>
                    <input
                      required
                      minLength={6}
                      type="password"
                      value={passwordConfirmation}
                      onChange={(event) => setPasswordConfirmation(event.target.value)}
                      className={sharedInputClass}
                    />
                  </label>
                </div>
                <button
                  type="submit"
                  disabled={loadingAction !== null}
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-teal-600 px-5 font-black text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {loadingAction === 'signup' ? 'Criando...' : 'Criar conta'}
                  <UserPlus className="h-5 w-5" />
                </button>
              </motion.form>
            ) : (
              <motion.form
                key="reset"
                onSubmit={handleReset}
                className="space-y-4"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
              >
                <label className="block">
                  <span className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-600">
                    <Mail className="h-4 w-4" /> E-mail
                  </span>
                  <input
                    required
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className={sharedInputClass}
                  />
                </label>
                <button
                  type="submit"
                  disabled={loadingAction !== null}
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-teal-600 px-5 font-black text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {loadingAction === 'reset' ? 'Enviando...' : 'Enviar link de recuperacao'}
                  <ArrowRight className="h-5 w-5" />
                </button>
              </motion.form>
            )}
          </AnimatePresence>

          <form onSubmit={handleInvite} className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-4">
            <label className="block">
              <span className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-600">
                <Ticket className="h-4 w-4" /> Tenho um codigo de convite
              </span>
              <input
                value={inviteCode}
                onChange={(event) => setInviteCode(event.target.value.toUpperCase())}
                placeholder="EUROPA2026-X7K9"
                className={sharedInputClass}
              />
            </label>
            <button
              type="submit"
              disabled={loadingAction !== null || !normalizedInviteCode}
              className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 font-black text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loadingAction === 'invite' ? 'Salvando...' : 'Usar convite apos login'}
            </button>
          </form>

          {message ? (
            <p className="mt-4 rounded-2xl bg-teal-50 px-4 py-3 text-sm font-bold text-teal-800">{message}</p>
          ) : null}
          {error ? (
            <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{error}</p>
          ) : null}
        </motion.section>
      </div>
    </main>
  );
}
