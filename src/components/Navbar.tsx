import { motion } from 'framer-motion';
import {
  BarChart3,
  Camera,
  Coins,
  LayoutDashboard,
  Map,
  UserRound,
} from 'lucide-react';
import { useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useGroup } from '../contexts/GroupContext';
import { useLanguage } from '../contexts/LanguageContext';

export type AppView = 'dashboard' | 'expenses' | 'itinerary' | 'attractions' | 'quote' | 'profile';

type NavbarProps = {
  activeView: AppView;
  onNavigate: (view: AppView) => void;
};

const navItems = [
  { id: 'dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard },
  { id: 'expenses', labelKey: 'nav.expenses', icon: BarChart3 },
  { id: 'itinerary', labelKey: 'nav.itinerary', icon: Map },
  { id: 'attractions', labelKey: 'nav.attractions', icon: Camera },
  { id: 'quote', labelKey: 'nav.quote', icon: Coins },
  { id: 'profile', labelKey: 'nav.profile', icon: UserRound },
] as const;

export function Navbar({ activeView, onNavigate }: NavbarProps) {
  const { user } = useAuth();
  const { activeGroup, setActiveGroup, userGroups } = useGroup();
  const { t } = useLanguage();

  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined;
  const displayName = useMemo(
    () => user?.user_metadata?.full_name ?? user?.user_metadata?.name ?? user?.email ?? 'Perfil',
    [user],
  );

  return (
    <motion.nav
      className="sticky top-3 z-30 mx-auto flex w-full max-w-7xl flex-col gap-3 rounded-3xl border border-white/70 bg-white/85 p-2 shadow-xl shadow-slate-900/10 backdrop-blur-xl xl:flex-row xl:items-center xl:justify-between"
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onNavigate('dashboard')}
          className="flex items-center gap-2 px-3 text-left text-sm font-black tracking-tight text-slate-950 md:px-4 md:text-base"
        >
          <img src="/logo.png" alt="TripFlow" className="h-9 w-9 rounded-xl object-contain" />
          <span>{t('app.name')}</span>
        </button>

        {activeGroup ? (
          <div className="flex items-center gap-2 rounded-2xl bg-slate-100 px-3 py-2">
            <span className="hidden text-xs font-black uppercase tracking-[0.16em] text-slate-400 sm:inline">
              {t('nav.trip')}
            </span>
            {userGroups.length > 1 ? (
              <select
                value={activeGroup.id}
                onChange={(event) => {
                  const group = userGroups.find((item) => item.id === event.target.value);
                  if (group) setActiveGroup(group);
                }}
                className="max-w-52 bg-transparent text-sm font-black text-slate-900 outline-none"
              >
                {userGroups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="max-w-52 truncate text-sm font-black text-slate-900">{activeGroup.name}</span>
            )}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = activeView === item.id;

          return (
            <a
              key={item.id}
              onClick={(event) => {
                event.preventDefault();
                onNavigate(item.id);
              }}
              href={item.id === 'profile' ? '/perfil' : item.id === 'dashboard' ? '/dashboard' : `/#${item.id}`}
              className={`relative inline-flex h-11 items-center justify-center gap-2 rounded-2xl px-3 text-sm font-bold transition md:px-4 ${
                active ? 'text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-950'
              }`}
            >
              {active ? (
                <motion.span
                  layoutId="active-nav"
                  className="absolute inset-0 rounded-2xl bg-slate-950"
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                />
              ) : null}
              <Icon className="relative h-4 w-4" />
              <span className="relative hidden sm:inline">{t(item.labelKey)}</span>
            </a>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => onNavigate('profile')}
        className="flex h-11 items-center gap-2 rounded-2xl bg-slate-100 px-2 pr-3 transition hover:bg-teal-50"
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
        ) : (
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-950 text-white">
            <UserRound className="h-4 w-4" />
          </span>
        )}
        <span className="max-w-40 truncate text-sm font-black text-slate-700">{displayName}</span>
      </button>
    </motion.nav>
  );
}
