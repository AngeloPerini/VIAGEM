import { motion } from 'framer-motion';
import {
  Bell,
  CheckCircle2,
  Loader2,
  LogOut,
  Moon,
  Settings,
  Sun,
  Trash2,
  UserRound,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import {
  clearReadNotifications,
  getNotifications,
  markNotificationAsRead,
  subscribeNotifications,
  type AppNotification,
} from '../services/notificationsService';

export type AppView = 'dashboard' | 'expenses' | 'itinerary' | 'attractions' | 'quote' | 'profile';

type NavbarProps = {
  activeView: AppView;
  onNavigate: (view: AppView) => void;
  onNavigateToProfilePath: (path: string) => void;
};

const navItems = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'expenses', label: 'Gastos' },
  { id: 'itinerary', label: 'Roteiro' },
  { id: 'attractions', label: 'Turismo' },
  { id: 'quote', label: 'Cotação' },
  { id: 'profile', label: 'Perfil' },
] as const;

const getNavHref = (view: AppView) => {
  if (view === 'dashboard') return '/dashboard';
  if (view === 'profile') return '/perfil';
  return `/#${view}`;
};

export function Navbar({ activeView, onNavigate, onNavigateToProfilePath }: NavbarProps) {
  const { signOut, user } = useAuth();
  const { t } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationActionId, setNotificationActionId] = useState<string | null>(null);
  const [notificationRealtimeWarning, setNotificationRealtimeWarning] = useState<string | null>(null);

  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined;
  const displayName = useMemo(
    () => user?.user_metadata?.full_name ?? user?.user_metadata?.name ?? user?.email ?? 'Perfil',
    [user],
  );
  const unreadNotifications = notifications.filter((notification) => !notification.read).length;

  const loadNotifications = useCallback(async () => {
    if (!user?.id) {
      setNotifications([]);
      return;
    }

    const nextNotifications = await getNotifications().catch(() => []);
    setNotifications(nextNotifications);
  }, [user?.id]);

  const handleSignOut = async () => {
    await signOut();
    window.location.replace('/login');
  };

  const handleToggleNotifications = () => {
    setNotificationsOpen((current) => {
      const nextOpen = !current;
      if (nextOpen) void loadNotifications();
      return nextOpen;
    });
  };

  const handleMarkNotificationRead = async (notification: AppNotification) => {
    setNotificationActionId(notification.id);

    try {
      await markNotificationAsRead(notification.id);
      setNotifications((current) =>
        current.map((item) => item.id === notification.id ? { ...item, read: true } : item),
      );
    } finally {
      setNotificationActionId(null);
    }
  };

  const handleClearReadNotifications = async () => {
    setNotificationActionId('clear-read');

    try {
      await clearReadNotifications();
      setNotifications((current) => current.filter((notification) => !notification.read));
    } finally {
      setNotificationActionId(null);
    }
  };

  const navigateAndClose = (view: AppView) => {
    setNotificationsOpen(false);
    onNavigate(view);
  };

  const navigateProfileAndClose = (path: string) => {
    setNotificationsOpen(false);
    onNavigateToProfilePath(path);
  };

  useEffect(() => {
    if (!user?.id) {
      setNotifications([]);
      return undefined;
    }

    void loadNotifications();
    let fallbackInterval: number | undefined;
    const notificationSubscription = subscribeNotifications(
      user.id,
      () => void loadNotifications(),
      (state) => {
        if (state.available) {
          setNotificationRealtimeWarning(null);
          if (fallbackInterval) {
            window.clearInterval(fallbackInterval);
            fallbackInterval = undefined;
          }
          return;
        }

        setNotificationRealtimeWarning(state.message ?? 'Notificações em tempo real indisponíveis no momento.');
        fallbackInterval ??= window.setInterval(() => {
          void loadNotifications();
        }, 60_000);
      },
    );

    return () => {
      if (fallbackInterval) window.clearInterval(fallbackInterval);
      notificationSubscription.remove();
    };
  }, [loadNotifications, user?.id]);

  return (
    <motion.nav
      className="sticky top-0 z-30 border-b border-[#e8ecf4] bg-[#f7f8fd]/95 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/92"
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex h-16 w-full items-center justify-between gap-5 px-4 sm:px-6 lg:px-10 xl:px-12">
        <button
          type="button"
          onClick={() => navigateAndClose('dashboard')}
          className="flex shrink-0 items-center gap-3 text-left text-[1.5rem] font-black text-[#0b1326] dark:text-slate-50"
        >
          <img src="/logo.png" alt="" className="h-7 w-7 object-contain sm:h-8 sm:w-8" />
          <span>{t('app.name')}</span>
        </button>

        <div className="hidden min-w-0 flex-1 items-center gap-7 md:flex">
          {navItems.map((item) => {
            const active = activeView === item.id;

            return (
              <a
                key={item.id}
                onClick={(event) => {
                  event.preventDefault();
                  if (item.id === 'profile') {
                    navigateProfileAndClose('/perfil');
                    return;
                  }
                  navigateAndClose(item.id);
                }}
                href={getNavHref(item.id)}
                className={`relative inline-flex h-16 items-center text-base font-semibold transition ${
                  active ? 'text-[#006b57] dark:text-emerald-300' : 'text-[#171a26] hover:text-[#006b57] dark:text-slate-300 dark:hover:text-emerald-300'
                }`}
              >
                <span>{item.label}</span>
                {active ? (
                  <motion.span
                    layoutId="active-nav-underline"
                    className="absolute bottom-3 left-0 h-0.5 w-full bg-[#006b57] dark:bg-emerald-300"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  />
                ) : null}
              </a>
            );
          })}
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
          <div className="relative">
            <button
              type="button"
              aria-label="Notificações"
              title="Notificações"
              aria-expanded={notificationsOpen}
              onClick={handleToggleNotifications}
              className="relative inline-flex h-9 w-9 items-center justify-center rounded-full text-[#171a26] transition hover:bg-white hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-[#10b981] focus:ring-offset-2 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:shadow-black/20 dark:focus:ring-offset-slate-950 sm:h-10 sm:w-10"
            >
              <Bell className="h-5 w-5" />
              {unreadNotifications > 0 ? (
                <span className="absolute right-1.5 top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#006b57] px-1 text-[0.65rem] font-black text-white dark:bg-emerald-400 dark:text-emerald-950">
                  {unreadNotifications > 9 ? '9+' : unreadNotifications}
                </span>
              ) : null}
            </button>
            {notificationsOpen ? (
              <div className="absolute right-0 top-12 z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-3xl border border-[#e2e8f0] bg-white shadow-2xl shadow-slate-950/15 dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/40">
                <div className="border-b border-slate-100 px-4 py-4 dark:border-slate-800">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-[#0b1326] dark:text-slate-50">Notificações</p>
                      <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
                        {unreadNotifications ? `${unreadNotifications} não lida${unreadNotifications === 1 ? '' : 's'}` : 'Tudo em dia'}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label="Limpar notificações lidas"
                      title="Limpar notificações lidas"
                      onClick={() => void handleClearReadNotifications()}
                      disabled={notificationActionId === 'clear-read' || !notifications.some((notification) => notification.read)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                    >
                      {notificationActionId === 'clear-read' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </button>
                  </div>
                  {notificationRealtimeWarning ? (
                    <p className="mt-3 rounded-2xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700 dark:bg-amber-400/10 dark:text-amber-200">
                      {notificationRealtimeWarning}
                    </p>
                  ) : null}
                </div>
                <div className="max-h-96 overflow-y-auto p-3">
                  {notifications.length ? (
                    <div className="space-y-2">
                      {notifications.slice(0, 8).map((notification) => {
                        const isBusy = notificationActionId === notification.id;
                        return (
                          <article
                            key={notification.id}
                            className={`rounded-2xl border p-3 ${
                              notification.read
                                ? 'border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/70'
                                : 'border-teal-100 bg-teal-50/80 dark:border-emerald-400/30 dark:bg-emerald-400/10'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-black text-[#0b1326] dark:text-slate-50">{notification.title}</p>
                                <p className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-slate-600 dark:text-slate-300">
                                  {notification.message}
                                </p>
                              </div>
                              {!notification.read ? (
                                <button
                                  type="button"
                                  aria-label="Marcar notificação como lida"
                                  title="Marcar como lida"
                                  onClick={() => void handleMarkNotificationRead(notification)}
                                  disabled={isBusy}
                                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-teal-700 transition hover:bg-teal-100 disabled:opacity-50 dark:bg-slate-900 dark:text-emerald-300 dark:hover:bg-slate-800"
                                >
                                  {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                                </button>
                              ) : null}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="rounded-2xl bg-slate-50 px-4 py-6 text-center text-sm font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      Nenhuma notificação por enquanto.
                    </p>
                  )}
                </div>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            aria-label="Configurações"
            title="Configurações"
            onClick={() => navigateProfileAndClose('/perfil/configuracao')}
            className="hidden h-10 w-10 items-center justify-center rounded-full text-[#171a26] transition hover:bg-white hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-[#10b981] focus:ring-offset-2 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:shadow-black/20 dark:focus:ring-offset-slate-950 sm:inline-flex"
          >
            <Settings className="h-6 w-6" />
          </button>
          <button
            type="button"
            aria-label="Alternar tema"
            title="Alternar tema"
            onClick={toggleTheme}
            className="theme-toggle inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#dfe5ee] bg-white/80 text-[#171a26] shadow-sm transition hover:border-[#10b981] hover:text-[#007c68] focus:outline-none focus:ring-2 focus:ring-[#10b981] focus:ring-offset-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-emerald-400 dark:hover:text-emerald-300 dark:focus:ring-offset-slate-950 sm:h-10 sm:w-10"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button
            type="button"
            aria-label="Abrir perfil"
            onClick={() => navigateProfileAndClose('/perfil')}
            className="inline-flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-[#cbd7ea] bg-[#dce9ff] text-[#0b1326] shadow-sm transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#10b981] focus:ring-offset-2 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-offset-slate-950 sm:h-10 sm:w-10"
            title={displayName}
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <UserRound className="h-6 w-6" />
            )}
          </button>
          <button
            type="button"
            aria-label="Sair da conta"
            title="Sair da conta"
            onClick={() => void handleSignOut()}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[#171a26] transition hover:bg-white hover:text-rose-600 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-rose-400 focus:ring-offset-2 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-rose-300 dark:hover:shadow-black/20 dark:focus:ring-offset-slate-950 sm:h-10 sm:w-10"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="flex w-full gap-5 overflow-x-auto px-4 pb-3 sm:px-6 md:hidden">
        {navItems.map((item) => {
          const active = activeView === item.id;

          return (
            <a
              key={item.id}
              onClick={(event) => {
                event.preventDefault();
                if (item.id === 'profile') {
                  navigateProfileAndClose('/perfil');
                  return;
                }
                navigateAndClose(item.id);
              }}
              href={getNavHref(item.id)}
              className={`shrink-0 border-b-2 pb-2 text-sm font-bold ${
                active ? 'border-[#006b57] text-[#006b57] dark:border-emerald-300 dark:text-emerald-300' : 'border-transparent text-slate-500 dark:text-slate-400'
              }`}
            >
              {item.label}
            </a>
          );
        })}
      </div>
    </motion.nav>
  );
}
