import { motion } from 'framer-motion';
import {
  Bell,
  CheckCircle2,
  ChevronDown,
  Coins,
  LayoutDashboard,
  Loader2,
  LogOut,
  MapPinned,
  Moon,
  ReceiptText,
  Route,
  Settings,
  Sun,
  Trash2,
  User,
  UserRound,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'expenses', label: 'Gastos', icon: ReceiptText },
  { id: 'itinerary', label: 'Roteiro', icon: Route },
  { id: 'attractions', label: 'Turismo', icon: MapPinned },
  { id: 'quote', label: 'Cotação', icon: Coins },
  { id: 'profile', label: 'Perfil', icon: UserRound },
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
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notificationActionId, setNotificationActionId] = useState<string | null>(null);
  const [notificationRealtimeWarning, setNotificationRealtimeWarning] = useState<string | null>(null);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

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
    setUserMenuOpen(false);
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
    setUserMenuOpen(false);
    onNavigate(view);
  };

  const navigateProfileAndClose = (path: string) => {
    setNotificationsOpen(false);
    setUserMenuOpen(false);
    onNavigateToProfilePath(path);
  };

  const handleToggleTheme = () => {
    toggleTheme();
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

  useEffect(() => {
    if (!userMenuOpen) return undefined;

    const handlePointerDown = (event: PointerEvent) => {
      if (!userMenuRef.current?.contains(event.target as Node)) {
        setUserMenuOpen(false);
        setNotificationsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setUserMenuOpen(false);
        setNotificationsOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [userMenuOpen]);

  const renderNotificationsPanel = () => (
    <div className="border-t border-slate-100 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-950/35">
      <div className="flex items-start justify-between gap-3 px-4 py-4">
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
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-white hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
        >
          {notificationActionId === 'clear-read' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </button>
      </div>
      {notificationRealtimeWarning ? (
        <p className="mx-4 mb-3 rounded-2xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700 dark:bg-amber-400/10 dark:text-amber-200">
          {notificationRealtimeWarning}
        </p>
      ) : null}
      <div className="max-h-80 overflow-y-auto px-3 pb-3">
        {notifications.length ? (
          <div className="space-y-2">
            {notifications.slice(0, 8).map((notification) => {
              const isBusy = notificationActionId === notification.id;
              return (
                <article
                  key={notification.id}
                  className={`rounded-2xl border p-3 ${
                    notification.read
                      ? 'border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-800/70'
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
          <p className="rounded-2xl bg-white px-4 py-6 text-center text-sm font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            Nenhuma notificação por enquanto.
          </p>
        )}
      </div>
    </div>
  );

  return (
    <motion.nav
      className="sticky top-0 z-30 border-b border-[#e8ecf4] bg-white/94 shadow-[0_14px_40px_rgba(15,23,42,0.06)] backdrop-blur-xl dark:border-slate-800 dark:bg-[#071121]/94 dark:shadow-black/30"
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex h-[4.7rem] w-full items-center justify-between gap-4 px-4 sm:px-6 lg:px-10 xl:px-12">
        <button
          type="button"
          onClick={() => navigateAndClose('dashboard')}
          className="flex shrink-0 items-center gap-3 text-left text-[1.35rem] font-black text-[#0b1326] transition hover:text-[#007c68] dark:text-slate-50 dark:hover:text-emerald-300"
        >
          <img src="/logo.png" alt="" className="h-7 w-7 object-contain sm:h-8 sm:w-8" />
          <span>{t('app.name')}</span>
        </button>

        <div className="hidden min-w-0 flex-1 items-center justify-center gap-1.5 lg:flex">
          {navItems.map((item) => {
            const active = activeView === item.id;
            const Icon = item.icon;

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
                className={`inline-flex h-12 items-center gap-2 rounded-xl px-4 text-sm font-black transition focus:outline-none focus:ring-2 focus:ring-[#10b981] focus:ring-offset-2 dark:focus:ring-offset-slate-950 ${
                  active
                    ? 'bg-[#e8f8f4] text-[#007c68] shadow-sm dark:bg-emerald-400/15 dark:text-emerald-300'
                    : 'text-[#202431] hover:bg-[#f1f6f5] hover:text-[#007c68] dark:text-slate-300 dark:hover:bg-white/8 dark:hover:text-emerald-300'
                }`}
              >
                <Icon className={`h-4 w-4 ${active ? 'block' : 'hidden xl:block'}`} />
                <span>{item.label}</span>
              </a>
            );
          })}
        </div>

        <div ref={userMenuRef} className="relative flex shrink-0 items-center">
          <button
            type="button"
            aria-label="Abrir menu do usuário"
            aria-expanded={userMenuOpen}
            aria-haspopup="menu"
            onClick={() => {
              setUserMenuOpen((current) => !current);
              setNotificationsOpen(false);
            }}
            className="inline-flex h-12 max-w-[13rem] items-center gap-3 rounded-2xl border border-[#dfe5ee] bg-white/90 px-2.5 pr-3 text-[#0b1326] shadow-sm transition hover:border-[#10b981] hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#10b981] focus:ring-offset-2 dark:border-slate-700 dark:bg-slate-900/78 dark:text-slate-50 dark:hover:border-emerald-400 dark:hover:bg-slate-900 dark:focus:ring-offset-slate-950 sm:max-w-[16rem]"
          >
            <span className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#cbd7ea] bg-[#dce9ff] text-[#0b1326] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <UserRound className="h-5 w-5" />
              )}
              {unreadNotifications > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#00a579] px-1 text-[0.65rem] font-black text-white ring-2 ring-white dark:bg-emerald-400 dark:text-emerald-950 dark:ring-slate-900">
                  {unreadNotifications > 9 ? '9+' : unreadNotifications}
                </span>
              ) : null}
            </span>
            <span className="hidden min-w-0 flex-1 truncate text-left text-sm font-black sm:block">{displayName}</span>
            <ChevronDown className={`h-4 w-4 shrink-0 transition ${userMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          {userMenuOpen ? (
            <div
              role="menu"
              className="absolute right-0 top-14 z-50 w-[min(23rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-[#e2e8f0] bg-white shadow-2xl shadow-slate-950/15 dark:border-slate-700 dark:bg-[#071121] dark:shadow-black/45"
            >
              <div className="p-2">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => navigateProfileAndClose('/perfil')}
                  className="flex h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-bold text-[#202431] transition hover:bg-[#eef8f6] hover:text-[#007c68] focus:outline-none focus:ring-2 focus:ring-[#10b981] dark:text-slate-200 dark:hover:bg-white/8 dark:hover:text-emerald-300"
                >
                  <User className="h-5 w-5" />
                  <span className="flex-1">Meu perfil</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  aria-expanded={notificationsOpen}
                  onClick={handleToggleNotifications}
                  className="flex h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-bold text-[#202431] transition hover:bg-[#eef8f6] hover:text-[#007c68] focus:outline-none focus:ring-2 focus:ring-[#10b981] dark:text-slate-200 dark:hover:bg-white/8 dark:hover:text-emerald-300"
                >
                  <Bell className="h-5 w-5" />
                  <span className="flex-1">Notificações</span>
                  {unreadNotifications > 0 ? (
                    <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-[#00a579] px-2 text-xs font-black text-white dark:bg-emerald-400 dark:text-emerald-950">
                      {unreadNotifications > 9 ? '9+' : unreadNotifications}
                    </span>
                  ) : null}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  aria-label="Alternar aparência"
                  onClick={handleToggleTheme}
                  className="flex h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-bold text-[#202431] transition hover:bg-[#eef8f6] hover:text-[#007c68] focus:outline-none focus:ring-2 focus:ring-[#10b981] dark:text-slate-200 dark:hover:bg-white/8 dark:hover:text-emerald-300"
                >
                  {theme === 'dark' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
                  <span className="flex-1">Aparência</span>
                  <span className="text-xs font-black uppercase tracking-[0.08em] text-[#667085] dark:text-slate-400">
                    {theme === 'dark' ? 'Escuro' : 'Claro'}
                  </span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => navigateProfileAndClose('/perfil/configuracao')}
                  className="flex h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-bold text-[#202431] transition hover:bg-[#eef8f6] hover:text-[#007c68] focus:outline-none focus:ring-2 focus:ring-[#10b981] dark:text-slate-200 dark:hover:bg-white/8 dark:hover:text-emerald-300"
                >
                  <Settings className="h-5 w-5" />
                  <span className="flex-1">Configurações</span>
                </button>
              </div>
              {notificationsOpen ? renderNotificationsPanel() : null}
              <div className="border-t border-slate-100 p-2 dark:border-slate-800">
                <button
                  type="button"
                  role="menuitem"
                  aria-label="Sair da conta"
                  onClick={() => void handleSignOut()}
                  className="flex h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-bold text-[#202431] transition hover:bg-rose-50 hover:text-rose-600 focus:outline-none focus:ring-2 focus:ring-rose-400 dark:text-slate-200 dark:hover:bg-rose-400/10 dark:hover:text-rose-300"
                >
                  <LogOut className="h-5 w-5" />
                  <span className="flex-1">Sair</span>
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex w-full gap-2 overflow-x-auto px-4 pb-3 sm:px-6 lg:hidden">
        {navItems.map((item) => {
          const active = activeView === item.id;
          const Icon = item.icon;

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
              className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-bold ${
                active
                  ? 'bg-[#e8f8f4] text-[#007c68] dark:bg-emerald-400/15 dark:text-emerald-300'
                  : 'text-slate-500 hover:bg-white/80 hover:text-[#007c68] dark:text-slate-400 dark:hover:bg-white/8 dark:hover:text-emerald-300'
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </a>
          );
        })}
      </div>
    </motion.nav>
  );
}
