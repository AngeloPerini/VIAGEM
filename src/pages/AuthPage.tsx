import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  Moon,
  Route,
  Sun,
  Ticket,
  UserPlus,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { normalizeInviteToken, storePendingInviteToken } from '../services/groupsService';

type AuthMode = 'login' | 'signup' | 'reset';
type LoadingAction = 'google' | 'login' | 'signup' | 'reset' | 'invite' | null;

type AuthPageProps = {
  initialInviteCode?: string | null;
};

const travelHeroImage =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuCM6rhDSvqhuD-HpbmgtmEiUAKiTDS1QIKN8krmV7IqkXSWD3ZcNdbS2zNCYsDpEjmqdew1DTSzH4QkSBSk264Kv6K2P4dITmxa8imu0ZS2dAaMbJSaQR1LFBqF9AMEwwki4JWl7hMPBxanunISEng3Jo6rk0WOmGdVSx3N_7VgBvraAsb7T0ifRCAaBUVsqXiGPGnjwUeeO3PqOpo9-pNOyhzhovCcW7tvI6MkWT7yE5abchq9tVG2edFkf23WEfRxP75n5WhDGkV4';

const sharedInputClass =
  'h-11 w-full rounded-xl border border-[#c6c6cd] bg-[#f8f9ff] px-4 text-sm font-medium text-[#0b1c30] outline-none transition placeholder:text-[#45464d]/45 focus:border-[#131b2e] focus:bg-white focus:ring-4 focus:ring-[#131b2e]/10 disabled:cursor-not-allowed disabled:opacity-70 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:border-emerald-400 dark:focus:bg-slate-900 dark:focus:ring-emerald-400/20 sm:h-12 lg:h-11 xl:h-12';
const iconInputClass = `${sharedInputClass} pl-12`;
const passwordInputClass = `${iconInputClass} pr-12`;
const primaryButtonClass =
  'inline-flex h-12 w-full items-center justify-center gap-3 rounded-xl bg-black px-6 text-sm font-extrabold text-white shadow-[0_14px_28px_rgba(15,23,42,0.16)] transition hover:-translate-y-0.5 hover:bg-[#131b2e] hover:shadow-[0_18px_34px_rgba(15,23,42,0.2)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0 dark:bg-emerald-400 dark:text-emerald-950 dark:shadow-black/30 dark:hover:bg-emerald-300';
const secondaryButtonClass =
  'inline-flex h-11 w-full items-center justify-center gap-3 rounded-xl border border-[#c6c6cd] bg-white px-6 text-sm font-bold text-[#0b1c30] transition hover:border-[#131b2e]/35 hover:bg-[#eff4ff] disabled:cursor-not-allowed disabled:opacity-70 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-emerald-400 dark:hover:bg-slate-700 sm:h-12 lg:h-11 xl:h-12';

const friendlyAuthError = (message: string) => {
  const normalized = message.toLowerCase();

  if (normalized.includes('missing oauth secret') || normalized.includes('unsupported provider')) {
    return 'Login com Google ainda nao esta configurado corretamente. Verifique Client ID e Client Secret no Supabase.';
  }

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

const getOAuthErrorFromUrl = () => {
  const params = new URLSearchParams(window.location.search);
  return params.get('error_description') ?? params.get('error') ?? null;
};

function GoogleIcon() {
  return (
    <svg className="h-5 w-5" aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

function ButtonStatus({
  loading,
  loadingLabel,
  fallback,
}: {
  loading: boolean;
  loadingLabel: string;
  fallback: string;
}) {
  if (!loading) return <span>{fallback}</span>;
  return (
    <>
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
      <span>{loadingLabel}</span>
    </>
  );
}

export function AuthPage({ initialInviteCode }: AuthPageProps) {
  const { sendPasswordReset, signIn, signInWithEmail, signUp } = useAuth();
  const { t } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirmation, setShowPasswordConfirmation] = useState(false);
  const [inviteCode, setInviteCode] = useState(initialInviteCode ?? '');
  const [message, setMessage] = useState<string | null>(
    initialInviteCode ? t('auth.inviteDetected') : null,
  );
  const [error, setError] = useState<string | null>(() => {
    const urlError = getOAuthErrorFromUrl();
    return urlError ? friendlyAuthError(urlError) : null;
  });
  const [loadingAction, setLoadingAction] = useState<LoadingAction>(null);

  const normalizedInviteCode = useMemo(() => normalizeInviteToken(inviteCode), [inviteCode]);
  const modeContent = useMemo(
    () => ({
      login: {
        title: 'Bem-vindo de volta',
        description: 'Acesse sua plataforma de gestao premium.',
      },
      signup: {
        title: 'Crie sua conta',
        description: 'Comece a organizar roteiro, gastos e convites em um unico lugar.',
      },
      reset: {
        title: 'Redefinir senha',
        description: 'Informe seu e-mail para receber o link de redefinicao.',
      },
    }),
    [],
  );

  const changeMode = useCallback((nextMode: AuthMode) => {
    setMode(nextMode);
    setError(null);
    setMessage(null);
  }, []);

  const rememberInvite = useCallback(() => {
    if (!normalizedInviteCode) return false;
    storePendingInviteToken(normalizedInviteCode);
    return true;
  }, [normalizedInviteCode]);

  const handleGoogle = useCallback(async () => {
    setError(null);
    rememberInvite();
    setLoadingAction('google');

    try {
      await signIn();
    } catch (caughtError) {
      setError(friendlyAuthError(caughtError instanceof Error ? caughtError.message : 'Falha ao abrir o Google.'));
      setLoadingAction(null);
    }
  }, [rememberInvite, signIn]);

  const handleEmailLogin = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError(null);
      setMessage(null);
      rememberInvite();
      setLoadingAction('login');

      try {
        await signInWithEmail(email, password);
        setMessage(t('auth.loginDone'));
      } catch (caughtError) {
        setError(friendlyAuthError(caughtError instanceof Error ? caughtError.message : 'Falha no login.'));
      } finally {
        setLoadingAction(null);
      }
    },
    [email, password, rememberInvite, signInWithEmail, t],
  );

  const handleSignUp = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
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
        setMessage(t('auth.signupDone'));
      } catch (caughtError) {
        setError(friendlyAuthError(caughtError instanceof Error ? caughtError.message : 'Falha ao criar conta.'));
      } finally {
        setLoadingAction(null);
      }
    },
    [email, password, passwordConfirmation, rememberInvite, signUp, t],
  );

  const handleReset = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError(null);
      setMessage(null);
      setLoadingAction('reset');

      try {
        await sendPasswordReset(email);
        setMessage(t('auth.resetDone'));
      } catch (caughtError) {
        setError(friendlyAuthError(caughtError instanceof Error ? caughtError.message : 'Falha ao enviar recuperacao.'));
      } finally {
        setLoadingAction(null);
      }
    },
    [email, sendPasswordReset, t],
  );

  const handleInvite = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError(null);
      setLoadingAction('invite');

      if (!rememberInvite()) {
        setError('Digite um codigo de convite valido.');
        setLoadingAction(null);
        return;
      }

      setMessage(t('auth.inviteSaved'));
      setLoadingAction(null);
    },
    [rememberInvite, t],
  );

  const isBusy = loadingAction !== null;
  const currentModeContent = modeContent[mode];

  return (
    <main
      className="relative flex min-h-svh items-start justify-center overflow-x-hidden px-4 py-3 text-[#0b1c30] dark:text-slate-100 sm:px-6 md:items-center lg:px-8 lg:py-3"
      style={{
        background: theme === 'dark'
          ? 'radial-gradient(circle at top left, rgba(16,185,129,0.16) 0%, #0f172a 44%, #111827 100%)'
          : 'radial-gradient(circle at top left, #f8f9ff 0%, #e5eeff 46%, #dce9ff 100%)',
      }}
    >
      <button
        type="button"
        aria-label={theme === 'dark' ? 'Tema atual: escuro. Ativar tema claro' : 'Tema atual: claro. Ativar tema escuro'}
        onClick={toggleTheme}
        className="theme-toggle absolute right-4 top-4 z-20 inline-flex h-10 items-center gap-2 rounded-full border border-[#dfe5ee] bg-white/85 px-3 text-sm font-black text-[#171a26] shadow-lg shadow-slate-900/10 backdrop-blur transition hover:border-[#10b981] hover:text-[#007c68] dark:border-slate-700 dark:bg-slate-900/85 dark:text-slate-100 dark:shadow-black/30 dark:hover:border-emerald-400 dark:hover:text-emerald-300"
      >
        {theme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        {theme === 'dark' ? 'Escuro' : 'Claro'}
      </button>
      <motion.section
        className="mt-12 grid w-full max-w-[1060px] grid-cols-1 overflow-hidden rounded-[1.75rem] border border-white/70 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.12)] dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/40 md:mt-0 lg:h-[min(660px,calc(100svh-1.5rem))] lg:grid-cols-[0.95fr_1.05fr]"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <aside className="relative hidden min-h-0 overflow-hidden bg-[#131b2e] lg:block">
          <motion.img
            src={travelHeroImage}
            alt="Vista de viagem acima das nuvens"
            className="h-full w-full scale-105 object-cover opacity-80 mix-blend-overlay"
            whileHover={{ scale: 1.1 }}
            transition={{ duration: 6, ease: 'easeOut' }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#020617]/10 via-[#131b2e]/20 to-[#020617]/35" />
          <div className="absolute left-8 top-8 z-10 flex items-center gap-3 text-white">
            <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-[#131b2e]/85 text-[#48fdd3] shadow-lg shadow-slate-950/20 ring-1 ring-white/20">
              <img src="/logo.png" alt="" className="h-full w-full object-contain p-1.5" />
            </span>
            <span className="text-2xl font-extrabold tracking-tight">{t('app.name')}</span>
          </div>
          <div className="absolute bottom-6 left-8 right-8 rounded-2xl border border-white/25 bg-white/82 p-5 text-[#0b1c30] shadow-[0_18px_44px_rgba(2,6,23,0.2)] backdrop-blur-xl dark:bg-slate-950/78 dark:text-slate-50 xl:p-6">
            <div className="mb-2 flex items-center gap-3">
              <Route className="h-5 w-5 text-[#006b57]" aria-hidden="true" />
              <span className="text-xs font-bold uppercase tracking-[0.2em]">Planejamento integrado</span>
            </div>
            <h2 className="text-xl font-bold leading-tight xl:text-2xl">Seu proximo destino, organizado do início ao fim.</h2>
            <p className="mt-2 text-sm leading-6 text-[#45464d] dark:text-slate-300">
              Reúna roteiro, gastos, documentos e checklist em um só espaço para a viagem ativa.
            </p>
          </div>
        </aside>

        <section className="flex min-h-0 flex-col justify-center bg-white px-5 py-6 dark:bg-slate-900 sm:px-8 md:px-10 lg:h-full lg:overflow-y-auto lg:px-10 lg:py-5 xl:px-12">
          <div className="mb-4">
            <h1 className="text-3xl font-extrabold tracking-normal text-[#0b1c30] dark:text-slate-50 lg:text-[2rem] xl:text-4xl">
              {currentModeContent.title}
            </h1>
            <p className="mt-1.5 text-sm leading-6 text-[#45464d] dark:text-slate-300 sm:text-base">{currentModeContent.description}</p>
          </div>

          <button
            type="button"
            onClick={() => void handleGoogle()}
            disabled={isBusy}
            className={secondaryButtonClass}
          >
            {loadingAction === 'google' ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <GoogleIcon />}
            <span>{loadingAction === 'google' ? t('auth.googleLoading') : t('auth.google')}</span>
          </button>

          <div className="my-3 flex items-center gap-5">
            <span className="h-px flex-1 bg-[#c6c6cd]/55 dark:bg-slate-700" />
            <span className="text-sm font-bold uppercase tracking-[0.18em] text-[#45464d] dark:text-slate-400">ou e-mail</span>
            <span className="h-px flex-1 bg-[#c6c6cd]/55 dark:bg-slate-700" />
          </div>

          <AnimatePresence mode="wait">
            {mode === 'login' ? (
              <motion.form
                key="login"
                onSubmit={handleEmailLogin}
                className="space-y-3"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
              >
                <label className="block" htmlFor="login-email">
                  <span className="mb-1.5 block text-sm font-bold text-[#0b1c30] dark:text-slate-200">E-mail corporativo</span>
                  <span className="relative block">
                    <Mail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#45464d] dark:text-slate-400" />
                    <input
                      id="login-email"
                      name="email"
                      required
                      type="email"
                      autoComplete="email"
                      placeholder="nome@empresa.com"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className={iconInputClass}
                    />
                  </span>
                </label>

                <label className="block" htmlFor="login-password">
                  <span className="mb-1.5 flex items-center justify-between gap-4 text-sm font-bold text-[#0b1c30] dark:text-slate-200">
                    <span>{t('auth.password')}</span>
                    <button
                      type="button"
                      onClick={() => changeMode('reset')}
                      className="text-sm font-bold text-[#006b57] transition hover:text-[#004638] hover:underline dark:text-emerald-300 dark:hover:text-emerald-200"
                    >
                      {t('auth.reset')}
                    </button>
                  </span>
                  <span className="relative block">
                    <Lock className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#45464d] dark:text-slate-400" />
                    <input
                      id="login-password"
                      name="password"
                      required
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder="********"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className={passwordInputClass}
                    />
                    <button
                      type="button"
                      aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                      onClick={() => setShowPassword((current) => !current)}
                      className="absolute right-3 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-xl text-[#45464d] transition hover:bg-white hover:text-[#0b1c30] dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-50"
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </span>
                </label>

                <button type="submit" disabled={isBusy} className={primaryButtonClass}>
                  <ButtonStatus
                    loading={loadingAction === 'login'}
                    loadingLabel={t('auth.emailLoading')}
                    fallback="Entrar na Plataforma"
                  />
                  {loadingAction === 'login' ? null : <ArrowRight className="h-5 w-5" aria-hidden="true" />}
                </button>
              </motion.form>
            ) : mode === 'signup' ? (
              <motion.form
                key="signup"
                onSubmit={handleSignUp}
                className="space-y-3"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
              >
                <label className="block" htmlFor="signup-email">
                  <span className="mb-1.5 block text-sm font-bold text-[#0b1c30] dark:text-slate-200">{t('auth.email')}</span>
                  <span className="relative block">
                    <Mail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#45464d] dark:text-slate-400" />
                    <input
                      id="signup-email"
                      name="email"
                      required
                      type="email"
                      autoComplete="email"
                      placeholder="nome@empresa.com"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className={iconInputClass}
                    />
                  </span>
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block" htmlFor="signup-password">
                    <span className="mb-1.5 block text-sm font-bold text-[#0b1c30] dark:text-slate-200">{t('auth.password')}</span>
                    <span className="relative block">
                      <Lock className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#45464d] dark:text-slate-400" />
                      <input
                        id="signup-password"
                        name="password"
                        required
                        minLength={6}
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        placeholder="********"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        className={passwordInputClass}
                      />
                      <button
                        type="button"
                        aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                        onClick={() => setShowPassword((current) => !current)}
                        className="absolute right-3 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-xl text-[#45464d] transition hover:bg-white hover:text-[#0b1c30] dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-50"
                      >
                        {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </span>
                  </label>

                  <label className="block" htmlFor="signup-password-confirmation">
                    <span className="mb-1.5 block text-sm font-bold text-[#0b1c30] dark:text-slate-200">{t('auth.confirmPassword')}</span>
                    <span className="relative block">
                      <KeyRound className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#45464d] dark:text-slate-400" />
                      <input
                        id="signup-password-confirmation"
                        name="password-confirmation"
                        required
                        minLength={6}
                        type={showPasswordConfirmation ? 'text' : 'password'}
                        autoComplete="new-password"
                        placeholder="********"
                        value={passwordConfirmation}
                        onChange={(event) => setPasswordConfirmation(event.target.value)}
                        className={passwordInputClass}
                      />
                      <button
                        type="button"
                        aria-label={showPasswordConfirmation ? 'Ocultar senha' : 'Mostrar senha'}
                        onClick={() => setShowPasswordConfirmation((current) => !current)}
                        className="absolute right-3 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-xl text-[#45464d] transition hover:bg-white hover:text-[#0b1c30] dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-50"
                      >
                        {showPasswordConfirmation ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </span>
                  </label>
                </div>

                <button type="submit" disabled={isBusy} className={primaryButtonClass}>
                  <ButtonStatus
                    loading={loadingAction === 'signup'}
                    loadingLabel={t('auth.signupLoading')}
                    fallback={t('auth.signup')}
                  />
                  {loadingAction === 'signup' ? null : <UserPlus className="h-5 w-5" aria-hidden="true" />}
                </button>
              </motion.form>
            ) : (
              <motion.form
                key="reset"
                onSubmit={handleReset}
                className="space-y-3"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
              >
                <label className="block" htmlFor="reset-email">
                  <span className="mb-1.5 block text-sm font-bold text-[#0b1c30] dark:text-slate-200">{t('auth.email')}</span>
                  <span className="relative block">
                    <Mail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#45464d] dark:text-slate-400" />
                    <input
                      id="reset-email"
                      name="email"
                      required
                      type="email"
                      autoComplete="email"
                      placeholder="nome@empresa.com"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className={iconInputClass}
                    />
                  </span>
                </label>

                <button type="submit" disabled={isBusy} className={primaryButtonClass}>
                  <ButtonStatus
                    loading={loadingAction === 'reset'}
                    loadingLabel={t('auth.resetLoading')}
                    fallback={t('auth.resetSubmit')}
                  />
                  {loadingAction === 'reset' ? null : <ArrowRight className="h-5 w-5" aria-hidden="true" />}
                </button>
              </motion.form>
            )}
          </AnimatePresence>

          <div className="pt-4 text-center text-sm text-[#45464d] dark:text-slate-300">
            {mode === 'login' ? (
              <p>
                Nao possui uma conta corporativa?
                <button
                  type="button"
                  onClick={() => changeMode('signup')}
                  className="ml-2 font-extrabold text-[#0b1c30] transition hover:text-[#006b57] hover:underline dark:text-slate-50 dark:hover:text-emerald-300"
                >
                  {t('auth.signup')}
                </button>
              </p>
            ) : (
              <p>
                Ja possui uma conta?
                <button
                  type="button"
                  onClick={() => changeMode('login')}
                  className="ml-2 font-extrabold text-[#0b1c30] transition hover:text-[#006b57] hover:underline dark:text-slate-50 dark:hover:text-emerald-300"
                >
                  {t('auth.login')}
                </button>
              </p>
            )}
          </div>

          <form onSubmit={handleInvite} className="mt-2 rounded-2xl border border-[#d3e4fe] bg-[#eff4ff]/80 p-3 dark:border-slate-700 dark:bg-slate-800/70">
            <label className="block" htmlFor="invite-code">
              <span className="mb-1.5 flex items-center gap-2 text-sm font-extrabold text-[#0b1c30] dark:text-slate-200">
                <Ticket className="h-4 w-4" aria-hidden="true" />
                {t('auth.inviteLabel')}
              </span>
              <input
                id="invite-code"
                value={inviteCode}
                onChange={(event) => setInviteCode(event.target.value.toUpperCase())}
                placeholder="EUROPA-7K9X2"
                autoComplete="off"
                className={sharedInputClass}
              />
            </label>
            <button
              type="submit"
              disabled={isBusy || !normalizedInviteCode}
              className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-[#c6c6cd] bg-white px-4 text-sm font-extrabold text-[#0b1c30] transition hover:bg-[#f8f9ff] disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
            >
              {loadingAction === 'invite' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Route className="h-4 w-4" aria-hidden="true" />}
              {loadingAction === 'invite' ? t('auth.inviteSaving') : t('auth.inviteSubmit')}
            </button>
          </form>

          <div aria-live="polite">
            {message ? (
              <p className="mt-4 rounded-2xl border border-[#48fdd3]/40 bg-[#48fdd3]/14 px-4 py-3 text-sm font-bold text-[#005141] dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200">
                {message}
              </p>
            ) : null}
            {error ? (
              <p className="mt-4 rounded-2xl border border-[#ffdad6] bg-[#ffdad6]/70 px-4 py-3 text-sm font-bold text-[#93000a] dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-200">
                {error}
              </p>
            ) : null}
          </div>

          <div className="mt-auto pt-3">
            <div className="h-px bg-[#c6c6cd]/35 dark:bg-slate-700" />
            <nav className="flex flex-wrap justify-center gap-x-5 gap-y-2 pt-2 text-xs font-semibold text-[#45464d] dark:text-slate-400">
              <a className="transition hover:text-[#0b1c30] dark:hover:text-slate-100" href="#privacidade">Privacidade</a>
              <a className="transition hover:text-[#0b1c30] dark:hover:text-slate-100" href="#termos">Termos de Uso</a>
              <a className="transition hover:text-[#0b1c30] dark:hover:text-slate-100" href="mailto:suporte@tripflow.online">Suporte</a>
            </nav>
          </div>
        </section>
      </motion.section>
    </main>
  );
}
