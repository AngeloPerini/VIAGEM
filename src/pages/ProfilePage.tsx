import { motion } from 'framer-motion';
import {
  CalendarDays,
  CheckCircle2,
  Copy,
  Link2,
  Loader2,
  LogOut,
  MapPin,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  Ticket,
  Trash2,
  UserRound,
  Users,
  WalletCards,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useGroup } from '../contexts/GroupContext';
import {
  getCurrentProfile,
  getGroupMembers,
  getUserStats,
  removeGroupMember,
  upsertCurrentProfile,
} from '../services/profileService';
import { getInvites, normalizeInviteToken, type InviteDetails } from '../services/groupsService';
import { supabase } from '../services/supabaseClient';
import { generateTripPlan, storeTripAIReview } from '../services/tripAIService';
import type { GroupMemberProfile, TripAIInput, TripStyle, UserProfile, UserStats } from '../types';
import { formatRange } from '../utils/money';

const emptyStats: UserStats = {
  countriesCount: 0,
  travelCount: 0,
  hasActiveTrip: false,
  totalAllReal: { min: 0, max: 0 },
  totalAllEuro: { min: 0, max: 0 },
  totalActiveReal: { min: 0, max: 0 },
  totalActiveEuro: { min: 0, max: 0 },
};

const formatDate = (value?: string) => {
  if (!value) return 'Nao informado';

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
};

const buildFallbackProfile = (user: ReturnType<typeof useAuth>['user']): UserProfile | null => {
  if (!user) return null;

  return {
    id: user.id,
    email: user.email ?? undefined,
    fullName: user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.email ?? undefined,
    avatarUrl: user.user_metadata?.avatar_url ?? user.user_metadata?.picture ?? undefined,
    aiGenerationsUsed: 0,
    aiGenerationsLimit: 3,
    createdAt: user.created_at,
  };
};

const getEmailLocalPart = (email?: string | null) => email?.split('@')[0]?.trim() || null;

const getProfileName = (profile?: UserProfile | null, fallbackEmail?: string | null, fallback = 'Viajante') =>
  profile?.fullName?.trim() ||
  profile?.email?.trim() ||
  fallbackEmail?.trim() ||
  getEmailLocalPart(profile?.email ?? fallbackEmail) ||
  fallback;

const getProfileEmail = (profile?: UserProfile | null, fallbackEmail?: string | null) =>
  profile?.email?.trim() || fallbackEmail?.trim() || 'Perfil ainda sincronizando';

function StatCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-[2rem] border border-white/80 bg-white/85 p-5 shadow-xl shadow-slate-900/10 backdrop-blur">
      <p className="text-sm font-black uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="mt-3 text-3xl font-black tracking-tight text-slate-950">{value}</p>
      {detail ? <p className="mt-2 text-sm font-bold text-slate-500">{detail}</p> : null}
    </div>
  );
}

export function ProfilePage() {
  const { signOut, user } = useAuth();
  const { acceptInvite, activeGroup, createGroup, inviteMember, refreshGroups, userGroups } = useGroup();
  const [profile, setProfile] = useState<UserProfile | null>(() => buildFallbackProfile(user));
  const [members, setMembers] = useState<GroupMemberProfile[]>([]);
  const [stats, setStats] = useState<UserStats>(emptyStats);
  const [knownInvites, setKnownInvites] = useState<InviteDetails[]>([]);
  const [generatedInvite, setGeneratedInvite] = useState<InviteDetails | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [singleUseInvite, setSingleUseInvite] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [tripName, setTripName] = useState('Minha viagem');
  const [tripDescription, setTripDescription] = useState('');
  const [tripCountries, setTripCountries] = useState('');
  const [tripStartDate, setTripStartDate] = useState('');
  const [tripEndDate, setTripEndDate] = useState('');
  const [tripStyle, setTripStyle] = useState('intermediaria');
  const [tripNotes, setTripNotes] = useState('');
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isInviting, setIsInviting] = useState(false);
  const [isCreatingTrip, setIsCreatingTrip] = useState(false);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [isJoiningTrip, setIsJoiningTrip] = useState(false);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);

  const isOwner = activeGroup?.role === 'owner';
  const avatarUrl = profile?.avatarUrl;
  const displayName = getProfileName(profile, user?.email);
  const displayEmail = getProfileEmail(profile, user?.email);

  const ownerMember = useMemo(
    () => members.find((member) => member.userId === activeGroup?.ownerId),
    [activeGroup?.ownerId, members],
  );

  const ownerName =
    activeGroup?.ownerId === user?.id
      ? getProfileName(ownerMember?.profile ?? profile, user?.email, 'Dono da viagem')
      : getProfileName(ownerMember?.profile, ownerMember?.profile?.email, 'Dono da viagem');

  const latestInvite = generatedInvite ?? knownInvites[0] ?? null;
  const aiGenerationsUsed = profile?.aiGenerationsUsed ?? 0;
  const aiGenerationsLimit = profile?.aiGenerationsLimit ?? 3;
  const aiLimitReached = aiGenerationsUsed >= aiGenerationsLimit;
  const aiCooldownActive = profile?.lastAiGenerationAt
    ? Date.now() - new Date(profile.lastAiGenerationAt).getTime() < 30_000
    : false;
  const aiGenerationBlocked = aiLimitReached || aiCooldownActive;
  const aiUsageMessage = aiLimitReached
    ? 'Voce atingiu o limite gratuito de geracoes com IA.'
    : aiCooldownActive
      ? 'Aguarde alguns segundos antes de gerar novamente.'
      : 'A previa sera gerada para revisao antes de aplicar.';
  const parsedTripCountries = () =>
    tripCountries
      .split(',')
      .map((country) => country.trim())
      .filter(Boolean);

  const goToAIReview = (input: TripAIInput, group: Awaited<ReturnType<typeof createGroup>>, plan: Awaited<ReturnType<typeof generateTripPlan>>) => {
    storeTripAIReview({
      group,
      input,
      plan,
      createdAt: Date.now(),
    });
    window.history.pushState({}, '', '/trip-ai-review');
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const loadProfile = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      if (user) {
        await upsertCurrentProfile(user).catch(() => null);
      }

      const [nextProfile, nextStats, nextMembers, nextInvites] = await Promise.all([
        getCurrentProfile().catch(() => buildFallbackProfile(user)),
        getUserStats(user?.id, activeGroup?.id),
        activeGroup ? getGroupMembers(activeGroup.id) : Promise.resolve([]),
        activeGroup && isOwner ? getInvites(activeGroup.id).catch(() => []) : Promise.resolve([]),
      ]);

      setProfile(nextProfile);
      setStats(nextStats);
      setMembers(nextMembers);
      setKnownInvites(nextInvites);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Nao foi possivel carregar o perfil.');
    } finally {
      setIsLoading(false);
    }
  }, [activeGroup, isOwner, user]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (!activeGroup) return undefined;

    const channel = supabase
      .channel(`profile-members-${activeGroup.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'group_members', filter: `group_id=eq.${activeGroup.id}` },
        () => void loadProfile(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        () => void loadProfile(),
      )
      .subscribe();

    return () => {
      void channel.unsubscribe();
    };
  }, [activeGroup, loadProfile]);

  const copyToClipboard = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(null), 1800);
  };

  const handleInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setStatus(null);
    setIsInviting(true);

    try {
      const invite = await inviteMember(inviteEmail, singleUseInvite);
      setGeneratedInvite(invite);
      setKnownInvites((current) => [invite, ...current]);
      setInviteEmail('');
      setStatus('Convite gerado.');
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Nao foi possivel gerar o convite.');
    } finally {
      setIsInviting(false);
    }
  };

  const handleCreateTrip = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setStatus(null);
    setIsCreatingTrip(true);

    try {
      const countries = tripCountries
        .split(',')
        .map((country) => country.trim())
        .filter(Boolean);

      await createGroup({
        name: tripName,
        description: tripDescription,
        countries,
        startDate: tripStartDate,
        endDate: tripEndDate,
        travelStyle: tripStyle,
        notes: tripNotes,
      });
      setStatus('Viagem criada.');
      await refreshGroups({ silent: true });
      window.history.replaceState({}, '', '/dashboard');
      window.dispatchEvent(new PopStateEvent('popstate'));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Nao foi possivel criar sua viagem.');
    } finally {
      setIsCreatingTrip(false);
    }
  };

  const handleGenerateTripPreview = async () => {
    setError(null);
    setStatus(null);
    setIsGeneratingAI(true);

    try {
      const countries = parsedTripCountries();
      if (!countries.length) throw new Error('Informe os paises antes de gerar a previa com IA.');
      if (!tripStartDate || !tripEndDate) throw new Error('Informe as datas da viagem antes de gerar a previa com IA.');
      const group = await createGroup({
        name: tripName,
        description: tripDescription,
        countries,
        startDate: tripStartDate,
        endDate: tripEndDate,
        travelStyle: tripStyle,
        notes: tripNotes,
      });
      const input: TripAIInput = {
        tripName,
        countries,
        description: tripDescription,
        startDate: tripStartDate,
        endDate: tripEndDate,
        style: tripStyle as TripStyle,
        notes: tripNotes,
        groupId: group.id,
      };
      const plan = await generateTripPlan(input);
      goToAIReview(input, group, plan);
    } catch (caughtError) {
      await loadProfile().catch(() => null);
      setError(caughtError instanceof Error ? caughtError.message : 'Nao foi possivel gerar a previa com IA.');
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const handleGenerateActiveTripPreview = async () => {
    if (!activeGroup) return;

    const confirmed = window.confirm('Gerar uma previa com IA para a viagem ativa? Nada sera aplicado sem revisao.');
    if (!confirmed) return;

    setError(null);
    setStatus(null);
    setIsGeneratingAI(true);

    try {
      const countries = activeGroup.countries?.length ? activeGroup.countries : ['Europa'];
      const input: TripAIInput = {
        tripName: activeGroup.name,
        countries,
        description: activeGroup.description ?? '',
        startDate: activeGroup.startDate ?? '',
        endDate: activeGroup.endDate ?? '',
        style: (activeGroup.travelStyle as TripStyle | undefined) ?? 'intermediaria',
        notes: activeGroup.notes ?? '',
        groupId: activeGroup.id,
      };
      const plan = await generateTripPlan(input);
      goToAIReview(input, activeGroup, plan);
    } catch (caughtError) {
      await loadProfile().catch(() => null);
      setError(caughtError instanceof Error ? caughtError.message : 'Nao foi possivel gerar a previa com IA.');
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const handleAcceptInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const token = normalizeInviteToken(inviteCodeInput);
    if (!token) return;

    setError(null);
    setStatus(null);
    setIsJoiningTrip(true);

    try {
      const group = await acceptInvite(token);
      setStatus(`Voce entrou em ${group.name}.`);
      setInviteCodeInput('');
      await refreshGroups({ silent: true });
      window.history.replaceState({}, '', '/dashboard');
      window.dispatchEvent(new PopStateEvent('popstate'));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Nao foi possivel aceitar este convite.');
    } finally {
      setIsJoiningTrip(false);
    }
  };

  const handleRemoveMember = async (member: GroupMemberProfile) => {
    if (!activeGroup || member.role === 'owner' || member.userId === user?.id) return;

    const confirmed = window.confirm('Tem certeza que deseja remover este membro da viagem?');
    if (!confirmed) return;

    setRemovingUserId(member.userId);
    setError(null);
    setStatus(null);

    try {
      await removeGroupMember(activeGroup.id, member.userId);
      setMembers((current) => current.filter((item) => item.userId !== member.userId));
      setStatus('Membro removido da viagem.');
      await refreshGroups({ silent: true });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Nao foi possivel remover este membro.');
    } finally {
      setRemovingUserId(null);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    window.location.replace('/');
  };

  return (
    <motion.div
      key="profile"
      className="space-y-6"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
    >
      <section className="rounded-[2rem] border border-white/80 bg-slate-950 p-6 text-white shadow-2xl shadow-slate-900/20 md:p-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="h-20 w-20 rounded-[1.7rem] object-cover" />
            ) : (
              <span className="flex h-20 w-20 items-center justify-center rounded-[1.7rem] bg-white text-slate-950">
                <UserRound className="h-9 w-9" />
              </span>
            )}
            <div>
              <p className="text-sm font-black uppercase tracking-[0.2em] text-teal-200">Perfil</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight md:text-5xl">{displayName}</h1>
              <p className="mt-2 font-bold text-slate-300">{displayEmail}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-white px-5 font-black text-slate-950 transition hover:bg-rose-50 hover:text-rose-700"
          >
            <LogOut className="h-5 w-5" />
            Sair da conta
          </button>
        </div>
        <div className="mt-6 grid gap-3 text-sm font-bold text-slate-300 md:grid-cols-3">
          <span className="rounded-2xl bg-white/10 px-4 py-3">Conta criada: {formatDate(profile?.createdAt)}</span>
          <span className="rounded-2xl bg-white/10 px-4 py-3">
            Viagem ativa: {activeGroup?.name ?? 'Nenhuma'}
          </span>
          <span className="rounded-2xl bg-white/10 px-4 py-3">
            Participa de {userGroups.length} {userGroups.length === 1 ? 'viagem' : 'viagens'}
          </span>
          <span className="rounded-2xl bg-white/10 px-4 py-3">
            IA: {aiGenerationsUsed} de {aiGenerationsLimit} geracoes usadas
          </span>
        </div>
      </section>

      {(status || error || isLoading) ? (
        <p className="rounded-2xl border border-white/80 bg-white/85 px-4 py-3 text-sm font-bold text-slate-600 shadow-lg shadow-slate-900/5">
          {isLoading ? 'Carregando perfil...' : error ?? status}
        </p>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Paises" value={String(stats.countriesCount)} detail="Unicos nas suas viagens" />
        <StatCard label="Viagens" value={String(stats.travelCount)} detail="Grupos em que voce participa" />
        <StatCard label="Viagem ativa" value={stats.hasActiveTrip ? 'Sim' : 'Nao'} detail={activeGroup?.name} />
        <StatCard
          label="Total geral"
          value={formatRange(stats.totalAllReal, 'BRL', true)}
          detail={formatRange(stats.totalAllEuro, 'EUR', true)}
        />
        <StatCard
          label="Total da ativa"
          value={formatRange(stats.totalActiveReal, 'BRL', true)}
          detail={formatRange(stats.totalActiveEuro, 'EUR', true)}
        />
      </section>

      {!activeGroup ? (
        <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <motion.section
            className="rounded-[2rem] border border-white/80 bg-white/90 p-6 shadow-xl shadow-slate-900/10 md:p-8"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="mb-6 flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white">
                <Plus className="h-6 w-6" />
              </span>
              <div>
                <p className="text-sm font-black uppercase tracking-[0.18em] text-slate-400">Nova viagem</p>
                <h2 className="text-2xl font-black">Criar minha viagem</h2>
              </div>
            </div>
            <p className="mb-6 rounded-2xl bg-teal-50 px-4 py-3 text-sm font-bold text-teal-800">
              Voce ainda nao possui uma viagem ativa.
            </p>
            <form onSubmit={handleCreateTrip} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-slate-600">Nome da viagem</span>
                  <input
                    required
                    value={tripName}
                    onChange={(event) => setTripName(event.target.value)}
                    className="h-12 w-full rounded-2xl border border-slate-200 px-4 font-semibold outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-slate-600">Paises que deseja visitar</span>
                  <input
                    value={tripCountries}
                    onChange={(event) => setTripCountries(event.target.value)}
                    placeholder="Italia, Franca, Suica"
                    className="h-12 w-full rounded-2xl border border-slate-200 px-4 font-semibold outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                  />
                </label>
              </div>
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-600">Descricao</span>
                <textarea
                  value={tripDescription}
                  onChange={(event) => setTripDescription(event.target.value)}
                  rows={3}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                />
              </label>
              <div className="grid gap-4 md:grid-cols-3">
                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-slate-600">Data inicial</span>
                  <input
                    type="date"
                    value={tripStartDate}
                    onChange={(event) => setTripStartDate(event.target.value)}
                    className="h-12 w-full rounded-2xl border border-slate-200 px-4 font-semibold outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-slate-600">Data final</span>
                  <input
                    type="date"
                    value={tripEndDate}
                    onChange={(event) => setTripEndDate(event.target.value)}
                    className="h-12 w-full rounded-2xl border border-slate-200 px-4 font-semibold outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-slate-600">Estilo</span>
                  <select
                    value={tripStyle}
                    onChange={(event) => setTripStyle(event.target.value)}
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 font-semibold outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                  >
                    <option value="economica">Economica</option>
                    <option value="intermediaria">Intermediaria</option>
                    <option value="confortavel">Confortavel</option>
                  </select>
                </label>
              </div>
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-600">Observacoes</span>
                <textarea
                  value={tripNotes}
                  onChange={(event) => setTripNotes(event.target.value)}
                  rows={3}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                />
              </label>
              <div className="grid gap-3 md:grid-cols-2">
                <button
                  type="submit"
                  disabled={isCreatingTrip || isGeneratingAI}
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 font-black text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <Plus className="h-5 w-5" />
                  {isCreatingTrip ? 'Criando viagem...' : 'Criar minha viagem'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleGenerateTripPreview()}
                  disabled={isCreatingTrip || isGeneratingAI || aiGenerationBlocked}
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-teal-700 px-5 font-black text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isGeneratingAI ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
                  {isGeneratingAI ? 'Gerando previa...' : 'Gerar previa com IA'}
                </button>
              </div>
              <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-bold text-slate-600">
                Geracoes usadas: {aiGenerationsUsed} de {aiGenerationsLimit}. {aiUsageMessage}
              </p>
            </form>
          </motion.section>

          <motion.section
            className="rounded-[2rem] border border-white/80 bg-white/90 p-6 shadow-xl shadow-slate-900/10 md:p-8"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
          >
            <div className="mb-6 flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-600 text-white">
                <MapPin className="h-6 w-6" />
              </span>
              <div>
                <p className="text-sm font-black uppercase tracking-[0.18em] text-slate-400">Convite</p>
                <h2 className="text-2xl font-black">Entrar com codigo</h2>
              </div>
            </div>
            <form onSubmit={handleAcceptInvite} className="space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-600">Codigo ou link do convite</span>
                <input
                  value={inviteCodeInput}
                  onChange={(event) => setInviteCodeInput(event.target.value.toUpperCase())}
                  placeholder="EUROPA-7K9X2"
                  className="h-12 w-full rounded-2xl border border-slate-200 px-4 font-semibold outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                />
              </label>
              <button
                type="submit"
                disabled={isJoiningTrip || !normalizeInviteToken(inviteCodeInput)}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 font-black text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Ticket className="h-5 w-5" />
                {isJoiningTrip ? 'Entrando...' : 'Entrar com codigo de convite'}
              </button>
            </form>
            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-rose-50 px-5 font-black text-rose-700 transition hover:bg-rose-100"
            >
              <LogOut className="h-5 w-5" />
              Sair da conta
            </button>
          </motion.section>
        </section>
      ) : null}

      {activeGroup ? (
        <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="space-y-6">
            <section className="rounded-[2rem] border border-white/80 bg-white/90 p-6 shadow-xl shadow-slate-900/10 md:p-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-black uppercase tracking-[0.18em] text-slate-400">Viagem ativa</p>
                  <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">{activeGroup.name}</h2>
                  {activeGroup.description ? (
                    <p className="mt-3 leading-7 text-slate-600">{activeGroup.description}</p>
                  ) : null}
                </div>
                <span className="rounded-2xl bg-teal-50 px-3 py-2 text-sm font-black text-teal-700">
                  {activeGroup.role}
                </span>
              </div>
              <button
                type="button"
                onClick={() => void handleGenerateActiveTripPreview()}
                disabled={isGeneratingAI || aiGenerationBlocked}
                className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-teal-700 px-5 font-black text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
              >
                {isGeneratingAI ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
                {isGeneratingAI ? 'Gerando previa...' : 'Gerar previa com IA'}
              </button>
              <p className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-bold text-slate-600">
                Geracoes usadas: {aiGenerationsUsed} de {aiGenerationsLimit}. {aiUsageMessage}
              </p>
              <div className="mt-6 grid gap-3 text-sm font-bold text-slate-600 sm:grid-cols-2">
                <span className="rounded-2xl bg-slate-50 px-4 py-3">
                  <CalendarDays className="mr-2 inline h-4 w-4" />
                  Criada em {formatDate(activeGroup.createdAt)}
                </span>
                <span className="rounded-2xl bg-slate-50 px-4 py-3">
                  <ShieldCheck className="mr-2 inline h-4 w-4" />
                  Dono: {ownerName}
                </span>
              </div>
            </section>

            <section className="rounded-[2rem] border border-white/80 bg-white/90 p-6 shadow-xl shadow-slate-900/10 md:p-8">
              <div className="mb-5 flex items-center gap-3">
                <Users className="h-5 w-5 text-teal-700" />
                <h2 className="text-2xl font-black">Membros da viagem</h2>
              </div>
              <div className="space-y-3">
                {members.map((member) => {
                  const fallbackEmail = member.userId === user?.id ? user?.email : null;
                  const memberEmail = getProfileEmail(member.profile, fallbackEmail);
                  const memberName = getProfileName(member.profile, fallbackEmail);
                  const canRemove = isOwner && member.role !== 'owner' && member.userId !== user?.id;

                  return (
                    <div
                      key={member.id}
                      className="flex flex-col gap-3 rounded-3xl border border-slate-100 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        {member.profile?.avatarUrl ? (
                          <img src={member.profile.avatarUrl} alt="" className="h-12 w-12 rounded-2xl object-cover" />
                        ) : (
                          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white">
                            <UserRound className="h-5 w-5" />
                          </span>
                        )}
                        <div className="min-w-0">
                          <p className="truncate font-black text-slate-950">{memberName}</p>
                          <p className="truncate text-sm font-bold text-slate-500">{memberEmail}</p>
                          <p className="text-xs font-bold text-slate-400">
                            Entrada: {formatDate(member.createdAt)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-2xl bg-white px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-slate-600">
                          {member.role}
                        </span>
                        {canRemove ? (
                          <button
                            type="button"
                            onClick={() => void handleRemoveMember(member)}
                            disabled={removingUserId === member.userId}
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-rose-50 px-3 text-sm font-black text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
                          >
                            <Trash2 className="h-4 w-4" />
                            Remover
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          <section className="rounded-[2rem] border border-white/80 bg-white/90 p-6 shadow-xl shadow-slate-900/10 md:p-8">
            <div className="mb-6 flex items-center gap-3">
              <Ticket className="h-5 w-5 text-teal-700" />
              <h2 className="text-2xl font-black">Convidar pessoa para a viagem</h2>
            </div>
            {isOwner ? (
              <>
                <form onSubmit={handleInvite} className="space-y-4">
                  <label className="block">
                    <span className="mb-2 block text-sm font-bold text-slate-600">E-mail opcional</span>
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(event) => setInviteEmail(event.target.value)}
                      className="h-12 w-full rounded-2xl border border-slate-200 px-4 font-semibold outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                    />
                  </label>
                  <label className="flex items-center gap-3 rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-700">
                    <input
                      type="checkbox"
                      checked={singleUseInvite}
                      onChange={(event) => setSingleUseInvite(event.target.checked)}
                      className="h-5 w-5 accent-teal-600"
                    />
                    Convite de uso unico
                  </label>
                  <button
                    type="submit"
                    disabled={isInviting}
                    className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 font-black text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    <Send className="h-5 w-5" />
                    {isInviting ? 'Gerando...' : 'Gerar convite'}
                  </button>
                </form>

                {latestInvite ? (
                  <div className="mt-6 space-y-3 rounded-3xl bg-teal-50 p-4 text-sm font-bold text-teal-900">
                    <div className="flex items-center gap-2">
                      <Ticket className="h-4 w-4" />
                      <span className="break-all">{latestInvite.code}</span>
                    </div>
                    <div className="flex items-center gap-2 text-teal-800">
                      <Link2 className="h-4 w-4" />
                      <span className="break-all">{latestInvite.link}</span>
                    </div>
                    <div className="grid gap-2 text-teal-700 sm:grid-cols-2">
                      <span className="rounded-2xl bg-white/70 px-3 py-2">
                        Validade: {latestInvite.expiresAt ? formatDate(latestInvite.expiresAt) : '7 dias'}
                      </span>
                      <span className="rounded-2xl bg-white/70 px-3 py-2">
                        Uso: {latestInvite.singleUse ? 'unico' : 'multiplo'}
                      </span>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => void copyToClipboard(latestInvite.code, 'codigo')}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-white px-3 text-teal-800"
                      >
                        <Copy className="h-4 w-4" />
                        Copiar codigo
                      </button>
                      <button
                        type="button"
                        onClick={() => void copyToClipboard(latestInvite.link, 'link')}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-white px-3 text-teal-800"
                      >
                        <Copy className="h-4 w-4" />
                        Copiar link
                      </button>
                    </div>
                    {copied ? (
                      <p className="flex items-center gap-2 rounded-2xl bg-white px-3 py-2 text-teal-700">
                        <CheckCircle2 className="h-4 w-4" />
                        {copied === 'codigo' ? 'Codigo copiado.' : 'Link copiado.'}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-6 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-bold text-slate-500">
                    Gere um convite para mostrar codigo e link aqui.
                  </p>
                )}
              </>
            ) : (
              <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-bold text-slate-600">
                Apenas o owner da viagem pode gerar convites.
              </p>
            )}
          </section>
        </section>
      ) : null}

      <section className="rounded-[2rem] border border-white/80 bg-white/90 p-6 shadow-xl shadow-slate-900/10 md:p-8">
        <div className="flex items-center gap-3">
          <WalletCards className="h-5 w-5 text-teal-700" />
          <h2 className="text-2xl font-black">Sessao</h2>
        </div>
        <p className="mt-3 leading-7 text-slate-600">
          O logout fica centralizado aqui para manter o navbar limpo e evitar saidas acidentais.
        </p>
        <button
          type="button"
          onClick={() => void handleSignOut()}
          className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-rose-100 bg-rose-50 px-5 font-black text-rose-700 transition hover:bg-rose-100 sm:w-auto"
        >
          <LogOut className="h-5 w-5" />
          Sair da conta
        </button>
      </section>
    </motion.div>
  );
}
