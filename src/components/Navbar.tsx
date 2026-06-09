import { motion } from 'framer-motion';
import {
  Bell,
  Moon,
  Settings,
  Sun,
  UserRound,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { getUnreadNotificationCount, subscribeNotifications } from '../services/notificationsService';

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
  const { user } = useAuth();
  const { t } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined;
  const displayName = useMemo(
    () => user?.user_metadata?.full_name ?? user?.user_metadata?.name ?? user?.email ?? 'Perfil',
    [user],
  );

  const loadUnreadNotifications = useCallback(async () => {
    if (!user?.id) {
      setUnreadNotifications(0);
      return;
    }

    const count = await getUnreadNotificationCount().catch(() => 0);
    setUnreadNotifications(count);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) {
      setUnreadNotifications(0);
      return undefined;
    }

    void loadUnreadNotifications();
    let fallbackInterval: number | undefined;
    const notificationSubscription = subscribeNotifications(
      user.id,
      () => void loadUnreadNotifications(),
      (state) => {
        if (state.available) {
          if (fallbackInterval) {
            window.clearInterval(fallbackInterval);
            fallbackInterval = undefined;
          }
          return;
        }

        fallbackInterval ??= window.setInterval(() => {
          void loadUnreadNotifications();
        }, 60_000);
      },
    );

    return () => {
      if (fallbackInterval) window.clearInterval(fallbackInterval);
      notificationSubscription.remove();
    };
  }, [loadUnreadNotifications, user?.id]);

  return (
    <motion.nav
      className="sticky top-0 z-30 border-b border-[#e8ecf4] bg-[#f7f8fd]/95 backdrop-blur-xl"
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex h-16 w-full items-center justify-between gap-5 px-4 sm:px-6 lg:px-10 xl:px-12">
        <button
          type="button"
          onClick={() => onNavigate('dashboard')}
          className="flex shrink-0 items-center gap-3 text-left text-[1.5rem] font-black text-[#0b1326]"
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
                    onNavigateToProfilePath('/perfil');
                    return;
                  }
                  onNavigate(item.id);
                }}
                href={getNavHref(item.id)}
                className={`relative inline-flex h-16 items-center text-base font-semibold transition ${
                  active ? 'text-[#006b57]' : 'text-[#171a26] hover:text-[#006b57]'
                }`}
              >
                <span>{item.label}</span>
                {active ? (
                  <motion.span
                    layoutId="active-nav-underline"
                    className="absolute bottom-3 left-0 h-0.5 w-full bg-[#006b57]"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  />
                ) : null}
              </a>
            );
          })}
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            aria-label="Notificações"
            onClick={() => onNavigateToProfilePath('/perfil/notificacoes')}
            className="relative inline-flex h-10 w-10 items-center justify-center rounded-full text-[#171a26] transition hover:bg-white hover:shadow-sm"
          >
            <Bell className="h-5 w-5" />
            {unreadNotifications > 0 ? (
              <span className="absolute right-1.5 top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#006b57] px-1 text-[0.65rem] font-black text-white">
                {unreadNotifications > 9 ? '9+' : unreadNotifications}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            aria-label="Configurações"
            onClick={() => onNavigateToProfilePath('/perfil/configuracao')}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[#171a26] transition hover:bg-white hover:shadow-sm"
          >
            <Settings className="h-6 w-6" />
          </button>
          <button
            type="button"
            aria-label={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}
            title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
            onClick={toggleTheme}
            className="theme-toggle inline-flex h-10 items-center gap-2 rounded-full border border-[#dfe5ee] bg-white/80 px-3 text-sm font-black text-[#171a26] shadow-sm transition hover:border-[#10b981] hover:text-[#007c68]"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            <span className="hidden lg:inline">{theme === 'dark' ? 'Claro' : 'Escuro'}</span>
          </button>
          <button
            type="button"
            aria-label="Abrir perfil"
            onClick={() => onNavigateToProfilePath('/perfil')}
            className="inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-[#cbd7ea] bg-[#dce9ff] text-[#0b1326] shadow-sm transition hover:shadow-md"
            title={displayName}
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <UserRound className="h-6 w-6" />
            )}
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
                  onNavigateToProfilePath('/perfil');
                  return;
                }
                onNavigate(item.id);
              }}
              href={getNavHref(item.id)}
              className={`shrink-0 border-b-2 pb-2 text-sm font-bold ${
                active ? 'border-[#006b57] text-[#006b57]' : 'border-transparent text-slate-500'
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
