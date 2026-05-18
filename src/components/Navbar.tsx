import { motion } from 'framer-motion';
import {
  BarChart3,
  Camera,
  Coins,
  Copy,
  LayoutDashboard,
  LogOut,
  Map,
  Send,
  UserRound,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useGroup } from '../contexts/GroupContext';

export type AppView = 'dashboard' | 'expenses' | 'itinerary' | 'attractions' | 'quote';

type NavbarProps = {
  activeView: AppView;
  onNavigate: (view: AppView) => void;
};

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'expenses', label: 'Gastos', icon: BarChart3 },
  { id: 'itinerary', label: 'Roteiro', icon: Map },
  { id: 'attractions', label: 'Pontos Turísticos', icon: Camera },
  { id: 'quote', label: 'Cotacao', icon: Coins },
] as const;

export function Navbar({ activeView, onNavigate }: NavbarProps) {
  const { signOut, user } = useAuth();
  const { activeGroup, inviteMember, setActiveGroup, userGroups } = useGroup();
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [isInviting, setIsInviting] = useState(false);

  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined;
  const displayName = useMemo(
    () => user?.user_metadata?.full_name ?? user?.user_metadata?.name ?? user?.email ?? 'Conta',
    [user],
  );

  const handleInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setInviteError(null);
    setInviteLink(null);
    setIsInviting(true);

    try {
      setInviteLink(await inviteMember(inviteEmail));
      setInviteEmail('');
    } catch (caughtError) {
      setInviteError(caughtError instanceof Error ? caughtError.message : 'Nao foi possivel criar convite.');
    } finally {
      setIsInviting(false);
    }
  };

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
          className="px-3 text-left text-sm font-black tracking-tight text-slate-950 md:px-4 md:text-base"
        >
          Europa Budget
        </button>

        {activeGroup ? (
          <div className="flex items-center gap-2 rounded-2xl bg-slate-100 px-3 py-2">
            <span className="hidden text-xs font-black uppercase tracking-[0.16em] text-slate-400 sm:inline">
              Viagem
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
              onClick={() => onNavigate(item.id)}
              href={item.id === 'dashboard' ? '#' : `#${item.id}`}
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
              <span className="relative hidden sm:inline">{item.label}</span>
            </a>
          );
        })}
      </div>

      <div className="relative flex flex-wrap items-center gap-2">
        {activeGroup?.role === 'owner' ? (
          <button
            type="button"
            onClick={() => setIsInviteOpen((current) => !current)}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-teal-600 px-4 text-sm font-black text-white transition hover:bg-teal-700"
          >
            <Send className="h-4 w-4" />
            Convidar
          </button>
        ) : null}

        <div className="flex h-11 items-center gap-2 rounded-2xl bg-slate-100 px-2 pr-3">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-950 text-white">
              <UserRound className="h-4 w-4" />
            </span>
          )}
          <span className="max-w-36 truncate text-sm font-black text-slate-700">{displayName}</span>
        </div>

        <button
          type="button"
          onClick={() => void signOut()}
          aria-label="Sair"
          className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 text-slate-500 transition hover:bg-rose-50 hover:text-rose-700"
        >
          <LogOut className="h-5 w-5" />
        </button>

        {isInviteOpen ? (
          <motion.form
            onSubmit={handleInvite}
            className="absolute right-0 top-[3.25rem] z-40 w-[min(22rem,calc(100vw-2rem))] rounded-3xl border border-white/80 bg-white p-4 shadow-2xl shadow-slate-900/20"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <label>
              <span className="mb-2 block text-sm font-bold text-slate-600">E-mail opcional</span>
              <input
                type="email"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                className="h-11 w-full rounded-2xl border border-slate-200 px-3 font-semibold outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
              />
            </label>
            <button
              type="submit"
              disabled={isInviting}
              className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 font-black text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <Send className="h-4 w-4" />
              Gerar link
            </button>
            {inviteLink ? (
              <button
                type="button"
                onClick={() => void navigator.clipboard.writeText(inviteLink)}
                className="mt-3 flex w-full items-center gap-2 rounded-2xl bg-teal-50 px-3 py-3 text-left text-xs font-bold text-teal-800"
              >
                <Copy className="h-4 w-4 shrink-0" />
                <span className="break-all">{inviteLink}</span>
              </button>
            ) : null}
            {inviteError ? (
              <p className="mt-3 rounded-2xl bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">
                {inviteError}
              </p>
            ) : null}
          </motion.form>
        ) : null}
      </div>
    </motion.nav>
  );
}
