import { AnimatePresence, motion } from 'framer-motion';
import {
  CalendarDays,
  CheckCircle2,
  Copy,
  Eye,
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
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useGroup } from '../contexts/GroupContext';
import { countryLabel } from '../data/countries';
import {
  getCurrentProfile,
  getGroupMembers,
  getProfileTripStats,
  getUserStats,
  removeGroupMember,
  upsertCurrentProfile,
} from '../services/profileService';
import {
  deleteTrip,
  getInvites,
  normalizeInviteToken,
  updateTripStatus,
  type InviteDetails,
} from '../services/groupsService';
import { supabase } from '../services/supabaseClient';
import { generateTripPlan, storeTripAIReview, TripAIFunctionError } from '../services/tripAIService';
import type {
  GroupMemberProfile,
  TripAIInput,
  TripAIPlan,
  TripStatus,
  TripStyle,
  TripSummary,
  UserProfile,
  UserStats,
  UserTravelGroup,
} from '../types';
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

const statusLabels: Record<TripStatus, string> = {
  planned: 'Planejada',
  active: 'Ativa',
  completed: 'Realizada',
  canceled: 'Cancelada',
};

const statusClasses: Record<TripStatus, string> = {
  planned: 'bg-sky-50 text-sky-700',
  active: 'bg-teal-50 text-teal-700',
  completed: 'bg-emerald-50 text-emerald-700',
  canceled: 'bg-rose-50 text-rose-700',
};

const tripTabs = [
  { id: 'planned', label: 'Planejadas' },
  { id: 'active', label: 'Ativas' },
  { id: 'completed', label: 'Realizadas' },
  { id: 'canceled', label: 'Canceladas' },
  { id: 'created', label: 'Criadas por mim' },
] as const;

type TripTab = typeof tripTabs[number]['id'];

function StatCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-[2rem] border border-white/80 bg-white/85 p-5 shadow-xl shadow-slate-900/10 backdrop-blur">
      <p className="text-sm font-black uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="mt-3 text-3xl font-black tracking-tight text-slate-950">{value}</p>
      {detail ? <p className="mt-2 text-sm font-bold text-slate-500">{detail}</p> : null}
    </div>
  );
}

function TripHistoryCard({
  group,
  isActive,
  onDetails,
  summary,
}: {
  group: UserTravelGroup;
  isActive: boolean;
  onDetails: (group: UserTravelGroup) => void;
  summary?: TripSummary;
}) {
  const status = group.status ?? 'planned';
  const countries = group.countries?.length
    ? group.countries.map((country) => countryLabel(country)).join(', ')
    : 'Paises nao informados';

  return (
    <article className="flex h-full flex-col justify-between rounded-[1.5rem] border border-white/80 bg-white/90 p-5 shadow-xl shadow-slate-900/10">
      <div>
        <div className="flex items-start justify-between gap-3">
          <h3 className="min-w-0 truncate text-2xl font-black text-slate-950">{group.name}</h3>
          <span className={`shrink-0 rounded-2xl px-3 py-2 text-xs font-black uppercase tracking-[0.12em] ${statusClasses[status]}`}>
            {statusLabels[status]}
          </span>
        </div>

        <div className="mt-4 grid gap-2 text-sm font-bold text-slate-600 sm:grid-cols-2">
          <span className="rounded-2xl bg-slate-50 px-3 py-2">
            <MapPin className="mr-2 inline h-4 w-4 text-teal-700" />
            {countries}
          </span>
          <span className="rounded-2xl bg-slate-50 px-3 py-2">
            <CalendarDays className="mr-2 inline h-4 w-4 text-teal-700" />
            {formatDate(group.startDate)} - {formatDate(group.endDate)}
          </span>
          <span className="rounded-2xl bg-slate-50 px-3 py-2">
            Total: {formatRange(summary?.totalReal ?? { min: 0, max: 0 }, 'BRL', true)}
          </span>
          <span className="rounded-2xl bg-slate-50 px-3 py-2">
            Participantes: {summary?.participantsCount ?? 0}
          </span>
          <span className="rounded-2xl bg-slate-50 px-3 py-2 sm:col-span-2">
            Pontos visitados: {summary?.visitedAttractionsCount ?? 0}
            {isActive ? ' / viagem aberta agora' : ''}
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={() => onDetails(group)}
        className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white transition hover:bg-teal-700"
      >
        <Eye className="h-4 w-4" />
        Ver detalhes
      </button>
    </article>
  );
}

function TripDetailsModal({
  actionId,
  group,
  isActive,
  isOwner,
  onCancel,
  onClose,
  onComplete,
  onDelete,
  onOpen,
  summary,
}: {
  actionId: string | null;
  group: UserTravelGroup;
  isActive: boolean;
  isOwner: boolean;
  onCancel: (group: UserTravelGroup) => void;
  onClose: () => void;
  onComplete: (group: UserTravelGroup) => void;
  onDelete: (group: UserTravelGroup) => void;
  onOpen: (group: UserTravelGroup) => void;
  summary?: TripSummary;
}) {
  const status = group.status ?? 'planned';
  const countries = group.countries?.length
    ? group.countries.map((country) => countryLabel(country)).join(', ')
    : 'Paises nao informados';
  const isBusy = actionId === group.id;

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 px-4 py-4 backdrop-blur-sm sm:items-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={onClose}
    >
      <motion.section
        role="dialog"
        aria-modal="true"
        aria-label={`Detalhes da viagem ${group.name}`}
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[2rem] border border-white/80 bg-white p-5 shadow-2xl shadow-slate-950/25 md:p-7"
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 18, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 360, damping: 32 }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-black uppercase tracking-[0.18em] text-slate-400">Detalhes da viagem</p>
            <h2 className="mt-2 truncate text-3xl font-black text-slate-950">{group.name}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar detalhes"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-600 transition hover:bg-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <span className={`rounded-2xl px-3 py-2 text-xs font-black uppercase tracking-[0.12em] ${statusClasses[status]}`}>
            {statusLabels[status]}
          </span>
          <span className="rounded-2xl bg-slate-100 px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-slate-500">
            {isOwner ? 'Owner' : 'Member'}
          </span>
          {isActive ? (
            <span className="rounded-2xl bg-teal-50 px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-teal-700">
              Aberta agora
            </span>
          ) : null}
        </div>

        <div className="mt-5 grid gap-3 text-sm font-bold text-slate-600 sm:grid-cols-2">
          <span className="rounded-2xl bg-slate-50 px-4 py-3">
            <MapPin className="mr-2 inline h-4 w-4 text-teal-700" />
            {countries}
          </span>
          <span className="rounded-2xl bg-slate-50 px-4 py-3">
            <CalendarDays className="mr-2 inline h-4 w-4 text-teal-700" />
            {formatDate(group.startDate)} - {formatDate(group.endDate)}
          </span>
          <span className="rounded-2xl bg-slate-50 px-4 py-3">
            Total estimado: {formatRange(summary?.totalReal ?? { min: 0, max: 0 }, 'BRL', true)}
          </span>
          <span className="rounded-2xl bg-slate-50 px-4 py-3">
            Participantes: {summary?.participantsCount ?? 0}
          </span>
          <span className="rounded-2xl bg-slate-50 px-4 py-3 sm:col-span-2">
            Pontos visitados: {summary?.visitedAttractionsCount ?? 0}
          </span>
        </div>

        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => onOpen(group)}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 font-black text-white transition hover:bg-teal-700"
          >
            Abrir viagem
          </button>
          {isOwner && status !== 'completed' && status !== 'canceled' ? (
            <button
              type="button"
              onClick={() => onComplete(group)}
              disabled={isBusy}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-50 px-5 font-black text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-60"
            >
              <CheckCircle2 className="h-5 w-5" />
              Marcar realizada
            </button>
          ) : null}
          {isOwner && status !== 'canceled' && status !== 'completed' ? (
            <button
              type="button"
              onClick={() => onCancel(group)}
              disabled={isBusy}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-amber-50 px-5 font-black text-amber-800 transition hover:bg-amber-100 disabled:opacity-60"
            >
              Cancelar viagem
            </button>
          ) : null}
          {isOwner ? (
            <button
              type="button"
              onClick={() => onDelete(group)}
              disabled={isBusy}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-rose-50 px-5 font-black text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
            >
              <Trash2 className="h-5 w-5" />
              Apagar viagem
            </button>
          ) : (
            <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-bold text-slate-500 sm:col-span-2">
              Acoes administrativas ficam disponiveis apenas para o owner.
            </p>
          )}
        </div>
      </motion.section>
    </motion.div>
  );
}

export function ProfilePage() {
  const { signOut, user } = useAuth();
  const { acceptInvite, activeGroup, createGroup, inviteMember, refreshGroups, setActiveGroup, userGroups } = useGroup();
  const [profile, setProfile] = useState<UserProfile | null>(() => buildFallbackProfile(user));
  const [members, setMembers] = useState<GroupMemberProfile[]>([]);
  const [stats, setStats] = useState<UserStats>(emptyStats);
  const [tripSummaries, setTripSummaries] = useState<Record<string, TripSummary>>({});
  const [activeTripTab, setActiveTripTab] = useState<TripTab>('planned');
  const [selectedTrip, setSelectedTrip] = useState<UserTravelGroup | null>(null);
  const [showCreateTripForm, setShowCreateTripForm] = useState(false);
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
  const [aiFailedGroup, setAiFailedGroup] = useState<UserTravelGroup | null>(null);
  const [aiRetryInput, setAiRetryInput] = useState<TripAIInput | null>(null);
  const [isJoiningTrip, setIsJoiningTrip] = useState(false);
  const [tripActionId, setTripActionId] = useState<string | null>(null);
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
  const tripCounts = useMemo(() => ({
    planned: userGroups.filter((group) => (group.status ?? 'planned') === 'planned').length,
    active: userGroups.filter((group) => group.status === 'active').length,
    completed: userGroups.filter((group) => group.status === 'completed').length,
    canceled: userGroups.filter((group) => group.status === 'canceled').length,
    created: userGroups.filter((group) => group.ownerId === user?.id).length,
  }), [user?.id, userGroups]);
  const visibleTrips = useMemo(
    () =>
      userGroups.filter((group) =>
        activeTripTab === 'created'
          ? group.ownerId === user?.id
          : (group.status ?? 'planned') === activeTripTab,
      ),
    [activeTripTab, user?.id, userGroups],
  );
  const shouldShowCreateTripForm = !activeGroup || showCreateTripForm;
  const parsedTripCountries = () =>
    tripCountries
      .split(',')
      .map((country) => country.trim())
      .filter(Boolean);

  const goToAIReview = (input: TripAIInput, group: UserTravelGroup, plan: TripAIPlan) => {
    storeTripAIReview({
      group,
      input,
      plan,
      createdAt: Date.now(),
    });
    window.history.pushState({}, '', '/trip-ai-review');
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const formatAIError = (caughtError: unknown) => {
    if (caughtError instanceof TripAIFunctionError) {
      const details = [
        caughtError.code,
        caughtError.status ? `HTTP ${caughtError.status}` : null,
      ].filter(Boolean).join(' / ');

      return details ? `${caughtError.message} (${details})` : caughtError.message;
    }

    return caughtError instanceof Error ? caughtError.message : 'Nao foi possivel gerar a previa com IA.';
  };

  const buildAIInput = (group: UserTravelGroup, countries: string[]): TripAIInput => ({
    tripName: tripName.trim() || group.name,
    countries,
    description: tripDescription,
    startDate: tripStartDate,
    endDate: tripEndDate,
    style: tripStyle as TripStyle,
    notes: tripNotes,
    groupId: group.id,
  });

  const openAIReview = async (input: TripAIInput, group: UserTravelGroup) => {
    const plan = await generateTripPlan(input);
    setAiFailedGroup(null);
    setAiRetryInput(null);
    goToAIReview(input, group, plan);
  };

  const loadProfile = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      if (user) {
        await upsertCurrentProfile(user).catch(() => null);
      }

      const [nextProfile, nextStats, nextMembers, nextInvites, nextTripSummaries] = await Promise.all([
        getCurrentProfile().catch(() => buildFallbackProfile(user)),
        getUserStats(user?.id, activeGroup?.id),
        activeGroup ? getGroupMembers(activeGroup.id) : Promise.resolve([]),
        activeGroup && isOwner ? getInvites(activeGroup.id).catch(() => []) : Promise.resolve([]),
        getProfileTripStats().catch(() => []),
      ]);

      setProfile(nextProfile);
      setStats(nextStats);
      setMembers(nextMembers);
      setKnownInvites(nextInvites);
      setTripSummaries(Object.fromEntries(nextTripSummaries.map((summary) => [summary.groupId, summary])));
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
      setShowCreateTripForm(false);
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
    let groupForRetry: UserTravelGroup | null = null;
    let inputForRetry: TripAIInput | null = null;

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

      groupForRetry = group;
      inputForRetry = buildAIInput(group, countries);
      await refreshGroups({ silent: true }).catch(() => null);
      await openAIReview(inputForRetry, group);
    } catch (caughtError) {
      console.error('Falha no fluxo Gerar previa com IA', {
        groupId: groupForRetry?.id,
        input: inputForRetry,
        error: caughtError,
      });
      if (groupForRetry && inputForRetry) {
        setAiFailedGroup(groupForRetry);
        setAiRetryInput(inputForRetry);
      }
      await loadProfile().catch(() => null);
      setError(formatAIError(caughtError));
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
      await openAIReview(input, activeGroup);
    } catch (caughtError) {
      console.error('Falha ao gerar previa com IA para viagem ativa', {
        groupId: activeGroup.id,
        error: caughtError,
      });
      setAiFailedGroup(activeGroup);
      setAiRetryInput({
        tripName: activeGroup.name,
        countries: activeGroup.countries?.length ? activeGroup.countries : ['Europa'],
        description: activeGroup.description ?? '',
        startDate: activeGroup.startDate ?? '',
        endDate: activeGroup.endDate ?? '',
        style: (activeGroup.travelStyle as TripStyle | undefined) ?? 'intermediaria',
        notes: activeGroup.notes ?? '',
        groupId: activeGroup.id,
      });
      await loadProfile().catch(() => null);
      setError(formatAIError(caughtError));
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const handleRetryAI = async () => {
    if (!aiFailedGroup || !aiRetryInput) return;

    setError(null);
    setStatus(null);
    setIsGeneratingAI(true);

    try {
      await openAIReview(aiRetryInput, aiFailedGroup);
    } catch (caughtError) {
      console.error('Falha ao tentar gerar novamente a previa com IA', {
        groupId: aiFailedGroup.id,
        input: aiRetryInput,
        error: caughtError,
      });
      await loadProfile().catch(() => null);
      setError(formatAIError(caughtError));
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const handleContinueWithoutAI = async () => {
    setAiFailedGroup(null);
    setAiRetryInput(null);
    setError(null);
    setStatus('Voce pode continuar preenchendo sua viagem manualmente.');
    await refreshGroups({ silent: true }).catch(() => null);
    window.history.replaceState({}, '', '/dashboard');
    window.dispatchEvent(new PopStateEvent('popstate'));
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

  const handleOpenTrip = (group: UserTravelGroup) => {
    setActiveGroup(group);
    setSelectedTrip(null);
    window.history.pushState({}, '', '/dashboard');
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const handleCancelTrip = async (group: UserTravelGroup) => {
    if (group.ownerId !== user?.id) return;
    const confirmed = window.confirm('Tem certeza que deseja cancelar esta viagem?');
    if (!confirmed) return;

    setTripActionId(group.id);
    setError(null);
    setStatus(null);

    try {
      await updateTripStatus(group.id, 'canceled');
      setSelectedTrip((current) => current?.id === group.id ? { ...current, status: 'canceled' } : current);
      if (activeGroup?.id === group.id) setActiveGroup(null);
      await refreshGroups({ silent: true });
      await loadProfile();
      setStatus('Viagem cancelada.');
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Nao foi possivel cancelar a viagem.');
    } finally {
      setTripActionId(null);
    }
  };

  const handleCompleteTrip = async (group: UserTravelGroup) => {
    if (group.ownerId !== user?.id) return;

    setTripActionId(group.id);
    setError(null);
    setStatus(null);

    try {
      const updatedGroup = await updateTripStatus(group.id, 'completed');
      setSelectedTrip((current) => current?.id === group.id ? { ...current, status: 'completed' } : current);
      if (activeGroup?.id === group.id) setActiveGroup({ ...group, ...updatedGroup, role: group.role });
      await refreshGroups({ silent: true });
      await loadProfile();
      setStatus('Viagem marcada como realizada.');
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Nao foi possivel concluir a viagem.');
    } finally {
      setTripActionId(null);
    }
  };

  const handleDeleteTrip = async (group: UserTravelGroup) => {
    if (group.ownerId !== user?.id) return;
    const confirmed = window.confirm('Essa ação apagará a viagem e todos os dados vinculados. Deseja continuar?');
    if (!confirmed) return;

    setTripActionId(group.id);
    setError(null);
    setStatus(null);

    try {
      await deleteTrip(group.id);
      setSelectedTrip(null);
      if (activeGroup?.id === group.id) setActiveGroup(null);
      await refreshGroups({ silent: true });
      await loadProfile();
      setStatus('Viagem apagada.');
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Nao foi possivel apagar a viagem.');
    } finally {
      setTripActionId(null);
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

      {aiFailedGroup && aiRetryInput ? (
        <section className="rounded-[2rem] border border-amber-200 bg-amber-50 p-5 shadow-xl shadow-amber-900/10 md:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.16em] text-amber-700">IA nao concluiu</p>
              <h2 className="mt-1 text-2xl font-black text-slate-950">A viagem foi criada e continua salva.</h2>
              <p className="mt-2 text-sm font-bold leading-6 text-amber-900">
                Voce pode tentar gerar a previa novamente para {aiFailedGroup.name} ou seguir sem IA e preencher os dados manualmente.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:min-w-[25rem]">
              <button
                type="button"
                onClick={() => void handleRetryAI()}
                disabled={isGeneratingAI || aiGenerationBlocked}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-teal-700 px-5 font-black text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isGeneratingAI ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
                Tentar gerar IA novamente
              </button>
              <button
                type="button"
                onClick={() => void handleContinueWithoutAI()}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-white px-5 font-black text-amber-900 transition hover:bg-amber-100"
              >
                Continuar sem IA
              </button>
            </div>
          </div>
        </section>
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

      <section className="rounded-[2rem] border border-white/80 bg-white/90 p-6 shadow-xl shadow-slate-900/10 md:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-slate-400">Historico</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Minhas viagens</h2>
            <p className="mt-2 max-w-2xl text-sm font-bold leading-6 text-slate-500">
              Acesse viagens planejadas, ativas, realizadas ou canceladas em que voce participa.
            </p>
          </div>
          <div className="flex flex-col gap-3 lg:items-end">
            <button
              type="button"
              onClick={() => setShowCreateTripForm((current) => !current)}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-teal-700 px-4 text-sm font-black text-white transition hover:bg-teal-800"
            >
              <Plus className="h-4 w-4" />
              {shouldShowCreateTripForm && activeGroup ? 'Fechar criacao' : 'Criar nova viagem'}
            </button>
            <div className="flex flex-wrap gap-2">
              {tripTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTripTab(tab.id)}
                  className={`inline-flex h-11 items-center justify-center rounded-2xl px-4 text-sm font-black transition ${
                    activeTripTab === tab.id
                      ? 'bg-slate-950 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {tab.label} ({tripCounts[tab.id]})
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {visibleTrips.length ? (
            visibleTrips.map((group) => (
              <TripHistoryCard
                key={group.id}
                group={group}
                isActive={activeGroup?.id === group.id}
                onDetails={setSelectedTrip}
                summary={tripSummaries[group.id]}
              />
            ))
          ) : (
            <p className="rounded-3xl bg-slate-50 px-4 py-6 text-sm font-bold text-slate-500 lg:col-span-2">
              Nenhuma viagem encontrada neste filtro.
            </p>
          )}
        </div>
      </section>

      {shouldShowCreateTripForm ? (
        <section className={activeGroup ? 'grid gap-6' : 'grid gap-6 xl:grid-cols-[1.05fr_0.95fr]'}>
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
                <h2 className="text-2xl font-black">{activeGroup ? 'Criar nova viagem' : 'Criar minha viagem'}</h2>
              </div>
            </div>
            <p className="mb-6 rounded-2xl bg-teal-50 px-4 py-3 text-sm font-bold text-teal-800">
              {activeGroup
                ? 'Crie outro grupo de viagem sem alterar a viagem ativa atual.'
                : 'Voce ainda nao possui uma viagem ativa.'}
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

          {!activeGroup ? (
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
          ) : null}
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

      <AnimatePresence>
        {selectedTrip ? (
          <TripDetailsModal
            actionId={tripActionId}
            group={selectedTrip}
            isActive={activeGroup?.id === selectedTrip.id}
            isOwner={selectedTrip.ownerId === user?.id}
            onCancel={handleCancelTrip}
            onClose={() => setSelectedTrip(null)}
            onComplete={handleCompleteTrip}
            onDelete={handleDeleteTrip}
            onOpen={handleOpenTrip}
            summary={tripSummaries[selectedTrip.id]}
          />
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}
