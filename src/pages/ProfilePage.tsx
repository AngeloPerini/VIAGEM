import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  Bell,
  CalendarDays,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  FileText,
  Globe2,
  Link2,
  Loader2,
  LogOut,
  MapPin,
  Pencil,
  Plus,
  Route,
  Save,
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
import type { FormEvent, ReactNode } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useGroup } from '../contexts/GroupContext';
import { languageOptions, useLanguage } from '../contexts/LanguageContext';
import type { LanguageCode } from '../i18n';
import { ExpenseChart } from '../components/ExpenseChart';
import { TripVisitedMap } from '../components/TripVisitedMap';
import type { TripMapCountry } from '../components/TripVisitedMap';
import { countryLabel, normalizeCountryId } from '../data/countries';
import {
  getCurrentProfile,
  getGroupMembers,
  getProfileTripStats,
  getUserStats,
  removeGroupMember,
  updateCurrentProfileName,
  upsertCurrentProfile,
} from '../services/profileService';
import { updateCurrentUserEmail, updateCurrentUserPassword } from '../services/authService';
import {
  deleteTrip,
  getInvites,
  leaveTrip,
  normalizeInviteToken,
  rejectInvite,
  updateTrip,
  updateTripStatus,
  type InviteDetails,
  type UpdateTravelGroupInput,
} from '../services/groupsService';
import {
  clearReadNotifications,
  getNotifications,
  markNotificationAsRead,
  subscribeNotifications,
  type AppNotification,
} from '../services/notificationsService';
import {
  checklistCategories,
  checklistCategoryLabels,
  createTripChecklistItem,
  deleteTripChecklistItem,
  getTripChecklistItems,
  setTripChecklistItemChecked,
  subscribeTripChecklistItems,
  updateTripChecklistItem,
  type TripChecklistItemInput,
} from '../services/checklistService';
import {
  getCachedExpenseCategories,
  getExpenseCategories,
} from '../services/expenseCategoriesService';
import {
  getTripVisitedCountries,
  setTripCountryVisited,
  subscribeTripVisitedCountries,
} from '../services/visitedCountriesService';
import { getExpenses } from '../services/expensesService';
import { getItineraryItems } from '../services/itineraryService';
import { getAttractions } from '../services/attractionsService';
import { getCachedExchangeRates } from '../services/currencyService';
import { supabase } from '../services/supabaseClient';
import { generateTripPlan, storeTripAIReview, TripAIFunctionError } from '../services/tripAIService';
import type {
  Attraction,
  CategoryMeta,
  CurrencyRange,
  ExchangeRateMap,
  Expense,
  GroupMemberProfile,
  ItineraryItem,
  TripChecklistItem,
  TripChecklistItemCategory,
  TripAIInput,
  TripAIPlan,
  TripStatus,
  TripStyle,
  TripSummary,
  UserProfile,
  UserStats,
  UserTravelGroup,
  VisitedCountry,
} from '../types';
import {
  calculateCategoryTotal,
  calculateExpensesTotal,
  formatOriginalCurrencyBreakdown,
  formatRange,
} from '../utils/money';
import { parseCountryInput } from '../utils/countryInput';
import { inferExpenseCategoryIconId } from '../utils/expenseCategoryIcons';

const emptyStats: UserStats = {
  countriesCount: 0,
  travelCount: 0,
  hasActiveTrip: false,
  totalAllReal: { min: 0, max: 0 },
  totalAllEuro: { min: 0, max: 0 },
  totalActiveReal: { min: 0, max: 0 },
  totalActiveEuro: { min: 0, max: 0 },
};

const fallbackExpenseAccents = ['#0f766e', '#2563eb', '#7c3aed', '#d97706', '#be123c', '#475569'];
const profileHeroImage =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuB1_s6-IXeqdQenr-iqRsq_Ema-qtKVzaxTrM4pZwFj7bUWrvNEpFB5_e9z6LicJ5Rb4dt2GuO9isUOY-usBaHtvXVUbeoGJveWj37td0C6SW8PzOmBmM-5YwOO3HwPoFsJEORL9cBjU2n6RoWF79d1nGgHZmkxoiCXUZ5hmNBYueSVyqbhkYCfjIw3SxeFZRHQo4wcyy6inD37y-jBUspou5r1q0tkJNBQUfwfglmzzprU_YeR1ldc8oyR6NNRcBqnhgePVdRDu3nY';
const aiSuggestionImage =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuC-7Phag6GjG3IFUj533wO52y8meAtiFlzu9zVMctKGQFBpF4xJ3oAQk97dc-MBjouuOMpBppsI0qQzgCji1gFh1IWpixj9u_geS2Awb-kBe72BGXoQ5UUUlqZldik1OC5RsoHE4BMM0uhgkKfvyuBJMrEJ7VqAMwoP2yhXHAsp1yejaEa9YR1l9zAgXjOMPXDoAJzXgwhCHR2wryLvxJlgIgoMk7DLnecZ3Dx-7TvhoaSRvEzfJpEM0jSTLKk1WV1EzfpMxSyv27fl';

const sortProfileExpenseCategories = (items: CategoryMeta[]) =>
  [...items].sort((a, b) => {
    const order = (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999);
    if (order !== 0) return order;
    return a.name.localeCompare(b.name, 'pt-BR');
  });

const midpoint = (range: CurrencyRange) => (range.min + range.max) / 2;

const normalizeSearchText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .trim();

const isDocumentChecklistCategory = (category: string) => {
  const normalized = normalizeSearchText(category);
  return normalized === 'documentos'
    || normalized === 'documento'
    || normalized === 'documents'
    || normalized === 'document'
    || normalized === 'required documents'
    || normalized.includes('document');
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

const getInitials = (value: string) => {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? `${parts[0][0]}${parts.at(-1)?.[0] ?? ''}` : value.slice(0, 2);
  return letters.toUpperCase();
};

const normalizeProfileEditError = (caughtError: unknown) => {
  const message = caughtError instanceof Error ? caughtError.message : 'Nao foi possivel atualizar o perfil.';

  if (/already registered|already exists|email exists|user already/i.test(message)) {
    return 'Este e-mail ja esta em uso em outra conta.';
  }

  if (/new email|different.*email|same.*email/i.test(message)) {
    return 'Informe um e-mail diferente do e-mail atual.';
  }

  if (/invalid.*email|email.*invalid/i.test(message)) {
    return 'Informe um e-mail valido.';
  }

  if (/password/i.test(message) && /weak|short|length|characters|least/i.test(message)) {
    return 'A senha precisa ter pelo menos 6 caracteres.';
  }

  if (/password/i.test(message) && /same|different/i.test(message)) {
    return 'Use uma senha nova diferente da senha atual.';
  }

  if (/session|logged in|jwt/i.test(message)) {
    return 'Entre novamente na conta para concluir esta alteracao.';
  }

  if (/rate limit|too many|over.*limit/i.test(message)) {
    return 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.';
  }

  return message;
};

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

const profileSections = [
  { id: 'overview', label: 'Visão Geral', path: '/perfil', icon: UserRound, visible: true },
  { id: 'trip', label: 'Viagens', path: '/perfil/viagem', icon: MapPin, visible: true },
  { id: 'map', label: 'Mapa', path: '/perfil/mapa', icon: Globe2, visible: true },
  { id: 'checklist', label: 'Checklist', path: '/perfil/checklist', icon: CheckCircle2, visible: true },
  { id: 'notifications', label: 'Notificações', path: '/perfil/notificacoes', icon: Bell, visible: true },
  { id: 'documents', label: 'Documentos', path: '/perfil/documentos', icon: FileText, visible: true },
  { id: 'create-ai', label: 'Criar viagem / IA', path: '/perfil/criar-viagem', icon: Sparkles, visible: false },
  { id: 'edit-profile', label: 'Editar perfil', path: '/perfil/editar', icon: Pencil, visible: false },
] as const;

type ProfileSectionId = typeof profileSections[number]['id'];
const visibleProfileSections = profileSections.filter((section) => section.visible);

const sectionByPath: Record<string, ProfileSectionId> = {
  '/perfil': 'overview',
  '/profile': 'overview',
  '/perfil/viagem': 'trip',
  '/profile/viagem': 'trip',
  '/perfil/mapa': 'map',
  '/profile/mapa': 'map',
  '/perfil/criar-viagem': 'create-ai',
  '/profile/criar-viagem': 'create-ai',
  '/perfil/checklist': 'checklist',
  '/profile/checklist': 'checklist',
  '/perfil/notificacoes': 'notifications',
  '/profile/notificacoes': 'notifications',
  '/perfil/documentos': 'documents',
  '/profile/documentos': 'documents',
  '/perfil/editar': 'edit-profile',
  '/profile/editar': 'edit-profile',
};

const getProfileSectionFromPath = (): ProfileSectionId =>
  sectionByPath[window.location.pathname] ?? 'overview';

const TRIP_DESCRIPTION_MAX_LENGTH = 2500;
const TRIP_DESCRIPTION_TOO_LONG_MESSAGE = 'A descrição está muito longa. Resuma para até 2500 caracteres.';
const TRIP_DESCRIPTION_PLACEHOLDER =
  'Descreva sua viagem, preferências, cidades desejadas, ritmo, orçamento, restrições, transporte, hospedagem e qualquer detalhe importante.';

const createEmptyChecklistDraft = (): TripChecklistItemInput => ({
  title: '',
  category: 'Documentos',
  notes: '',
  quantity: 1,
  assignedTo: '',
});

type ProfileIcon = typeof UserRound;

function DetailTile({
  icon: Icon,
  label,
  value,
}: {
  icon: ProfileIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-2xl bg-slate-50 px-4 py-3">
      <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-slate-400">
        <Icon className="h-4 w-4 shrink-0 text-teal-700" />
        {label}
      </p>
      <p className="mt-2 truncate text-sm font-black text-slate-800">{value}</p>
    </div>
  );
}

function ProfileMetricCard({
  detail,
  icon: Icon,
  label,
  value,
}: {
  detail: string;
  icon: ProfileIcon;
  label: string;
  value: string;
}) {
  return (
    <article className="rounded-xl border border-[#e6ebf3] bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
      <div className="mb-5 flex items-start justify-between gap-4">
        <Icon className="h-6 w-6 text-[#007c68]" />
      </div>
      <p className="text-sm font-semibold text-[#45464d]">{label}</p>
      <p className="mt-2 text-3xl font-bold tracking-tight text-[#0b1326]">{value}</p>
      <p className="mt-2 text-sm font-medium leading-6 text-[#667085]">{detail}</p>
    </article>
  );
}

function ProgressLine({ label, value }: { label: string; value: number }) {
  const safeValue = Math.max(0, Math.min(100, Math.round(value)));

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3 text-sm font-semibold text-[#45464d]">
        <span>{label}</span>
        <span>{safeValue}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[#dce9ff]">
        <div className="h-full rounded-full bg-[#007c68]" style={{ width: `${safeValue}%` }} />
      </div>
    </div>
  );
}

function SettingsActionRow({
  description,
  icon: Icon,
  onClick,
  title,
}: {
  description: string;
  icon: ProfileIcon;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center justify-between gap-4 rounded-xl px-3 py-4 text-left transition hover:bg-[#f4f7fb]"
    >
      <span className="flex min-w-0 items-center gap-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#eef4ff] text-[#1f2430] transition group-hover:text-[#007c68]">
          <Icon className="h-5 w-5" />
        </span>
        <span className="min-w-0">
          <span className="block font-semibold text-[#0b1326]">{title}</span>
          <span className="mt-1 block text-sm font-medium leading-5 text-[#667085]">{description}</span>
        </span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-[#a4acba] transition group-hover:translate-x-0.5 group-hover:text-[#007c68]" />
    </button>
  );
}

function EmptyState({
  action,
  description,
  icon: Icon,
  title,
}: {
  action?: ReactNode;
  description: string;
  icon: ProfileIcon;
  title: string;
}) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-teal-700 shadow-lg shadow-slate-900/5">
        <Icon className="h-5 w-5" />
      </span>
      <p className="mt-4 font-black text-slate-950">{title}</p>
      <p className="mx-auto mt-2 max-w-sm text-sm font-bold leading-6 text-slate-500">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
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
  onLeave,
  onOpen,
  onUpdate,
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
  onLeave: (group: UserTravelGroup) => void;
  onOpen: (group: UserTravelGroup) => void;
  onUpdate: (group: UserTravelGroup, input: UpdateTravelGroupInput) => Promise<void>;
  summary?: TripSummary;
}) {
  const status = group.status ?? 'planned';
  const countries = group.countries?.length
    ? group.countries.map((country) => countryLabel(country)).join(', ')
    : 'Paises nao informados';
  const isBusy = actionId === group.id;
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [draft, setDraft] = useState({
    name: group.name,
    description: group.description ?? '',
    countries: group.countries?.join(', ') ?? '',
    startDate: group.startDate ?? '',
    endDate: group.endDate ?? '',
    travelStyle: group.travelStyle ?? 'intermediaria',
    status,
  });

  useEffect(() => {
    setIsEditing(false);
    setIsSaving(false);
    setDraft({
      name: group.name,
      description: group.description ?? '',
      countries: group.countries?.join(', ') ?? '',
      startDate: group.startDate ?? '',
      endDate: group.endDate ?? '',
      travelStyle: group.travelStyle ?? 'intermediaria',
      status: group.status ?? 'planned',
    });
  }, [group]);

  const handleEditSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);

    try {
      await onUpdate(group, {
        name: draft.name,
        description: draft.description,
        countries: parseCountryInput(draft.countries),
        startDate: draft.startDate,
        endDate: draft.endDate,
        travelStyle: draft.travelStyle,
        status: draft.status as TripStatus,
      });
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

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
          <div className="flex shrink-0 items-center gap-2">
            {isOwner ? (
              <button
                type="button"
                onClick={() => setIsEditing((current) => !current)}
                aria-label="Editar viagem"
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-teal-50 text-teal-700 transition hover:bg-teal-100"
              >
                <Pencil className="h-5 w-5" />
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar detalhes"
              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-600 transition hover:bg-slate-200"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {isEditing ? (
          <form onSubmit={handleEditSubmit} className="mt-5 space-y-4 rounded-3xl border border-teal-100 bg-teal-50/60 p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-600">Nome</span>
                <input
                  required
                  value={draft.name}
                  onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                  className="h-11 w-full rounded-2xl border border-slate-200 px-4 font-semibold outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-600">Paises</span>
                <input
                  value={draft.countries}
                  onChange={(event) => setDraft((current) => ({ ...current, countries: event.target.value }))}
                  className="h-11 w-full rounded-2xl border border-slate-200 px-4 font-semibold outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                />
              </label>
            </div>
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-slate-600">Descricao</span>
              <textarea
                value={draft.description}
                onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                rows={3}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-600">Data inicial</span>
                <input
                  type="date"
                  value={draft.startDate}
                  onChange={(event) => setDraft((current) => ({ ...current, startDate: event.target.value }))}
                  className="h-11 w-full rounded-2xl border border-slate-200 px-4 font-semibold outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-600">Data final</span>
                <input
                  type="date"
                  value={draft.endDate}
                  onChange={(event) => setDraft((current) => ({ ...current, endDate: event.target.value }))}
                  className="h-11 w-full rounded-2xl border border-slate-200 px-4 font-semibold outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-600">Estilo</span>
                <select
                  value={draft.travelStyle}
                  onChange={(event) => setDraft((current) => ({ ...current, travelStyle: event.target.value }))}
                  className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 font-semibold outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                >
                  <option value="economica">Economica</option>
                  <option value="intermediaria">Intermediaria</option>
                  <option value="confortavel">Confortavel</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-600">Status</span>
                <select
                  value={draft.status}
                  onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as TripStatus }))}
                  className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 font-semibold outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                >
                  <option value="planned">Planejada</option>
                  <option value="active">Ativa</option>
                  <option value="completed">Realizada</option>
                  <option value="canceled">Cancelada</option>
                </select>
              </label>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white transition hover:bg-teal-700 disabled:opacity-60"
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar alteracoes
              </button>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                disabled={isSaving}
                className="inline-flex h-11 items-center justify-center rounded-2xl bg-white px-4 text-sm font-black text-slate-600 transition hover:bg-slate-100 disabled:opacity-60"
              >
                Cancelar
              </button>
            </div>
          </form>
        ) : null}

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
            <>
              <button
                type="button"
                onClick={() => onLeave(group)}
                disabled={isBusy}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-rose-50 px-5 font-black text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
              >
                <LogOut className="h-5 w-5" />
                Sair desta viagem
              </button>
              <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-bold text-slate-500">
                Acoes administrativas ficam disponiveis apenas para o owner.
              </p>
            </>
          )}
        </div>
      </motion.section>
    </motion.div>
  );
}

export function ProfilePage() {
  const { signOut, user } = useAuth();
  const { acceptInvite, activeGroup, createGroup, inviteMember, refreshGroups, setActiveGroup, userGroups } = useGroup();
  const { language, setLanguage, t } = useLanguage();
  const [profile, setProfile] = useState<UserProfile | null>(() => buildFallbackProfile(user));
  const [members, setMembers] = useState<GroupMemberProfile[]>([]);
  const [stats, setStats] = useState<UserStats>(emptyStats);
  const [tripSummaries, setTripSummaries] = useState<Record<string, TripSummary>>({});
  const [activeProfileSection, setActiveProfileSection] = useState<ProfileSectionId>(getProfileSectionFromPath);
  const [activeTripTab, setActiveTripTab] = useState<TripTab>('planned');
  const [selectedTrip, setSelectedTrip] = useState<UserTravelGroup | null>(null);
  const [showCreateTripForm, setShowCreateTripForm] = useState(false);
  const [knownInvites, setKnownInvites] = useState<InviteDetails[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [tripExpenses, setTripExpenses] = useState<Expense[]>([]);
  const [tripExpenseCategories, setTripExpenseCategories] = useState<CategoryMeta[]>(() => getCachedExpenseCategories());
  const [tripItineraryItems, setTripItineraryItems] = useState<ItineraryItem[]>([]);
  const [tripAttractions, setTripAttractions] = useState<Attraction[]>([]);
  const [tripInfoWarning, setTripInfoWarning] = useState<string | null>(null);
  const [visitedCountries, setVisitedCountries] = useState<VisitedCountry[]>([]);
  const [visitedCountryWarning, setVisitedCountryWarning] = useState<string | null>(null);
  const [visitedCountryActionId, setVisitedCountryActionId] = useState<string | null>(null);
  const [checklistItems, setChecklistItems] = useState<TripChecklistItem[]>([]);
  const [checklistDraft, setChecklistDraft] = useState<TripChecklistItemInput>(createEmptyChecklistDraft);
  const [editingChecklistItemId, setEditingChecklistItemId] = useState<string | null>(null);
  const [checklistActionId, setChecklistActionId] = useState<string | null>(null);
  const [checklistWarning, setChecklistWarning] = useState<string | null>(null);
  const [generatedInvite, setGeneratedInvite] = useState<InviteDetails | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [tripName, setTripName] = useState('Minha viagem');
  const [tripDescription, setTripDescription] = useState('');
  const [tripCountries, setTripCountries] = useState('');
  const [tripStartDate, setTripStartDate] = useState('');
  const [tripEndDate, setTripEndDate] = useState('');
  const [tripStyle, setTripStyle] = useState('intermediaria');
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notificationRealtimeWarning, setNotificationRealtimeWarning] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isInviting, setIsInviting] = useState(false);
  const [isCreatingTrip, setIsCreatingTrip] = useState(false);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [aiFailedGroup, setAiFailedGroup] = useState<UserTravelGroup | null>(null);
  const [aiRetryInput, setAiRetryInput] = useState<TripAIInput | null>(null);
  const [recentlyCreatedTripId, setRecentlyCreatedTripId] = useState<string | null>(null);
  const [isJoiningTrip, setIsJoiningTrip] = useState(false);
  const [notificationActionId, setNotificationActionId] = useState<string | null>(null);
  const [tripActionId, setTripActionId] = useState<string | null>(null);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);
  const [displayNameDraft, setDisplayNameDraft] = useState('');
  const [emailDraft, setEmailDraft] = useState('');
  const [passwordDraft, setPasswordDraft] = useState('');
  const [passwordConfirmationDraft, setPasswordConfirmationDraft] = useState('');
  const [showPasswordDraft, setShowPasswordDraft] = useState(false);
  const [showPasswordConfirmationDraft, setShowPasswordConfirmationDraft] = useState(false);
  const [profileEditAction, setProfileEditAction] = useState<'name' | 'email' | 'password' | null>(null);
  const [profileEditMessage, setProfileEditMessage] = useState<string | null>(null);
  const [profileEditError, setProfileEditError] = useState<string | null>(null);

  const activeGroupId = activeGroup?.id;
  const isOwner = activeGroup?.role === 'owner';
  const avatarUrl = profile?.avatarUrl;
  const displayName = getProfileName(profile, user?.email);
  const displayEmail = getProfileEmail(profile, user?.email);
  const currentAccountEmail = user?.email ?? profile?.email ?? '';
  const isProfileEditBusy = Boolean(profileEditAction);

  const ownerMember = useMemo(
    () => members.find((member) => member.userId === activeGroup?.ownerId),
    [activeGroup?.ownerId, members],
  );

  const ownerName =
    activeGroup?.ownerId === user?.id
      ? getProfileName(ownerMember?.profile ?? profile, user?.email, 'Dono da viagem')
      : getProfileName(ownerMember?.profile, ownerMember?.profile?.email, 'Dono da viagem');

  const latestInvite = generatedInvite ?? knownInvites[0] ?? null;
  const unreadNotifications = notifications.filter((notification) => !notification.read).length;
  const isAiTestUser = user?.email?.trim().toLowerCase() === 'r.perini351@gmail.com';
  const aiGenerationsUsed = profile?.aiGenerationsUsed ?? 0;
  const aiGenerationsLimit = profile?.aiGenerationsLimit ?? 3;
  const aiLimitReached = !isAiTestUser && aiGenerationsUsed >= aiGenerationsLimit;
  const aiCooldownActive = profile?.lastAiGenerationAt
    && !isAiTestUser
    ? Date.now() - new Date(profile.lastAiGenerationAt).getTime() < 30_000
    : false;
  const aiGenerationBlocked = aiLimitReached || aiCooldownActive;
  const aiUsageMessage = isAiTestUser
    ? t('profile.aiUnlimited')
    : aiLimitReached
      ? t('profile.aiLimitReached')
      : aiCooldownActive
        ? t('profile.aiCooldown')
        : t('profile.aiReviewInfo');
  const aiUsageLabel = isAiTestUser
    ? t('profile.aiUsageUnlimited')
    : t('profile.aiUsageCount', { used: aiGenerationsUsed, limit: aiGenerationsLimit, message: aiUsageMessage });
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
  const activeTripSummary = activeGroup ? tripSummaries[activeGroup.id] : undefined;
  const activeTripCountries = activeGroup?.countries?.length
    ? activeGroup.countries.map((country) => countryLabel(country)).join(', ')
    : 'Paises nao informados';
  const activeTripStatus = activeGroup?.status ?? 'planned';
  const activeTripParticipantCount = members.length || activeTripSummary?.participantsCount || 0;
  const checkedChecklistCount = checklistItems.filter((item) => item.checked).length;
  const checklistProgress = checklistItems.length
    ? Math.round((checkedChecklistCount / checklistItems.length) * 100)
    : 0;
  const memberNameByUserId = useMemo(() => {
    const names = new Map<string, string>();
    members.forEach((member) => {
      const fallbackEmail = member.userId === user?.id ? user?.email : null;
      names.set(member.userId, getProfileName(member.profile, fallbackEmail));
    });
    return names;
  }, [members, user?.email, user?.id]);
  const checklistDocumentItems = useMemo(
    () => checklistItems.filter((item) => isDocumentChecklistCategory(item.category)),
    [checklistItems],
  );
  const legacyItineraryDocuments = useMemo(
    () => tripItineraryItems.filter((item) => item.type === 'document'),
    [tripItineraryItems],
  );
  const profileDocumentCount = checklistDocumentItems.length || legacyItineraryDocuments.length;
  const pendingDocumentCount = checklistDocumentItems.length
    ? checklistDocumentItems.filter((item) => !item.checked).length
    : 0;
  const documentsProgress = checklistDocumentItems.length
    ? Math.round(((checklistDocumentItems.length - pendingDocumentCount) / checklistDocumentItems.length) * 100)
    : legacyItineraryDocuments.length
      ? 100
      : 0;
  const itineraryProgress = tripItineraryItems.length
    ? Math.round((tripItineraryItems.filter((item) => item.completed).length / tripItineraryItems.length) * 100)
    : 0;
  const tripPlanningProgress = Math.round((itineraryProgress + checklistProgress + documentsProgress) / 3);
  const countriesSummary = stats.countriesCount
    ? `${stats.countriesCount} país${stats.countriesCount === 1 ? '' : 'es'} nas suas viagens`
    : 'Nenhum país registrado ainda';
  const activeTripMetric = activeGroup?.name ?? 'Sem viagem ativa';
  const accountPlanLabel = isAiTestUser ? 'Acesso de teste' : 'Gratuito';
  const aiSuggestionTitle = activeGroup ? `Continue ${activeGroup.name}` : 'Crie sua primeira viagem';
  const aiSuggestionDescription = activeGroup
    ? 'Revise roteiro, documentos e checklist da viagem ativa sem disparar a IA automaticamente.'
    : 'Comece criando uma viagem para liberar roteiro, checklist, documentos e recomendações inteligentes.';
  const profileExchangeRates = useMemo<ExchangeRateMap>(
    () => getCachedExchangeRates(),
    [activeGroupId, tripExpenses],
  );
  const tripExpenseCategoriesForDisplay = useMemo(() => {
    const expenseCategoryIds = new Set(tripExpenses.map((expense) => expense.category).filter(Boolean));
    const knownCategories = new Map(tripExpenseCategories.map((category) => [category.id, category]));
    const missingCategories = Array.from(expenseCategoryIds)
      .filter((categoryId) => !knownCategories.has(categoryId))
      .map((categoryId, index): CategoryMeta => ({
        id: categoryId,
        name: categoryId,
        label: 'Gasto',
        accent: fallbackExpenseAccents[index % fallbackExpenseAccents.length],
        icon: inferExpenseCategoryIconId({ id: categoryId, name: categoryId, icon: undefined }),
        sortOrder: 1000 + index,
        isProtected: false,
      }));

    return sortProfileExpenseCategories([
      ...tripExpenseCategories.filter((category) => expenseCategoryIds.has(category.id)),
      ...missingCategories,
    ]);
  }, [tripExpenseCategories, tripExpenses]);
  const tripExpenseTotalsByCategory = useMemo(
    () =>
      tripExpenseCategoriesForDisplay.reduce<Record<string, ReturnType<typeof calculateCategoryTotal>>>((totals, category) => {
        totals[category.id] = calculateCategoryTotal(tripExpenses, category.id, profileExchangeRates);
        return totals;
      }, {}),
    [profileExchangeRates, tripExpenseCategoriesForDisplay, tripExpenses],
  );
  const tripExpenseGrandTotal = useMemo(
    () => calculateExpensesTotal(tripExpenses, profileExchangeRates),
    [profileExchangeRates, tripExpenses],
  );
  const topTripExpenseCategories = useMemo(
    () =>
      tripExpenseCategoriesForDisplay
        .map((category) => ({
          category,
          total: tripExpenseTotalsByCategory[category.id],
        }))
        .filter((item) => item.total && midpoint(item.total.real) > 0)
        .sort((a, b) => midpoint(b.total.real) - midpoint(a.total.real))
        .slice(0, 3),
    [tripExpenseCategoriesForDisplay, tripExpenseTotalsByCategory],
  );
  const topTripExpenseMax = Math.max(1, ...topTripExpenseCategories.map(({ total }) => midpoint(total.real)));
  const editingChecklistItem = editingChecklistItemId
    ? checklistItems.find((item) => item.id === editingChecklistItemId) ?? null
    : null;
  const shouldShowCreateTripForm = !activeGroup || showCreateTripForm;
  const parsedTripCountries = () => parseCountryInput(tripCountries);
  const isTripDescriptionTooLong = tripDescription.length > TRIP_DESCRIPTION_MAX_LENGTH;

  const validateDescriptionLength = (description: string) => {
    if (description.length > TRIP_DESCRIPTION_MAX_LENGTH) {
      throw new Error(TRIP_DESCRIPTION_TOO_LONG_MESSAGE);
    }
  };

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
      const friendlyMessages: Record<string, string> = {
        AI_GENERATION_LIMIT_REACHED: t('profile.aiLimitReached'),
        AI_GENERATION_COOLDOWN: t('profile.aiCooldown'),
        AI_PROVIDER_NOT_CONFIGURED: 'IA ainda não configurada no servidor. Verifique os secrets da Edge Function.',
        OPENAI_ERROR: caughtError.message,
        AI_OPENAI_ERROR: caughtError.message,
        INVALID_JSON: caughtError.message || 'A IA retornou JSON inválido. Tente gerar novamente.',
        AI_JSON_PARSE_ERROR: caughtError.message || 'A IA retornou JSON inválido. Tente gerar novamente.',
        VALIDATION_FAILED: caughtError.message,
        AI_QUALITY_FAILED: caughtError.message,
        DESCRIPTION_TOO_LONG: caughtError.message || TRIP_DESCRIPTION_TOO_LONG_MESSAGE,
        PROFILE_NOT_FOUND: 'Perfil não encontrado. Saia e entre novamente para recriar seu perfil.',
        SUPABASE_PROFILE_ERROR: caughtError.message || 'Não foi possível preparar seu perfil para gerar com IA.',
        GROUP_NOT_CREATED: caughtError.message || 'Não foi possível criar o grupo da viagem antes da IA.',
        SUPABASE_INSERT_ERROR: caughtError.message,
        TIMEOUT: caughtError.message || 'A OpenAI demorou demais para responder. Tente gerar novamente.',
        FORBIDDEN: 'Você não participa desta viagem ou o group_id não pertence ao seu usuário.',
        AI_GENERATION_FAILED: caughtError.message || 'A IA não concluiu a prévia. Tente gerar novamente.',
      };
      const details = [
        caughtError.code,
        caughtError.status ? `HTTP ${caughtError.status}` : null,
      ].filter(Boolean).join(' / ');
      const message = caughtError.code ? friendlyMessages[caughtError.code] ?? caughtError.message : caughtError.message;

      return details ? `${message} (${details})` : message;
    }

    return caughtError instanceof Error ? caughtError.message : 'Nao foi possivel gerar a previa com IA.';
  };

  const openAIReview = async (input: TripAIInput, group: UserTravelGroup) => {
    setActiveGroup(group);
    const plan = await generateTripPlan(input);
    setAiFailedGroup(null);
    setAiRetryInput(null);
    setShowCreateTripForm(false);
    goToAIReview(input, group, plan);
  };

  const loadNotifications = useCallback(async () => {
    const nextNotifications = await getNotifications();
    setNotifications(nextNotifications);
    return nextNotifications;
  }, []);

  const loadProfile = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      if (user) {
        await upsertCurrentProfile(user).catch(() => null);
      }

      const [nextProfile, nextStats, nextMembers, nextInvites, nextNotifications, nextTripSummaries] = await Promise.all([
        getCurrentProfile().catch(() => buildFallbackProfile(user)),
        getUserStats(user?.id, activeGroupId),
        activeGroupId ? getGroupMembers(activeGroupId) : Promise.resolve([]),
        activeGroupId && isOwner ? getInvites(activeGroupId).catch(() => []) : Promise.resolve([]),
        getNotifications().catch(() => []),
        getProfileTripStats().catch(() => []),
      ]);

      setProfile(nextProfile);
      setStats(nextStats);
      setMembers(nextMembers);
      setKnownInvites(nextInvites);
      setNotifications(nextNotifications);
      setTripSummaries(Object.fromEntries(nextTripSummaries.map((summary) => [summary.groupId, summary])));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Nao foi possivel carregar o perfil.');
    } finally {
      setIsLoading(false);
    }
  }, [activeGroupId, isOwner, user]);

  const loadActiveTripDetails = useCallback(async () => {
    if (!activeGroupId) {
      setTripExpenses([]);
      setTripExpenseCategories(getCachedExpenseCategories());
      setTripItineraryItems([]);
      setTripAttractions([]);
      setTripInfoWarning(null);
      return;
    }

    try {
      const [nextExpenses, nextItineraryItems, nextAttractions, nextExpenseCategories] = await Promise.all([
        getExpenses(activeGroupId),
        getItineraryItems(activeGroupId),
        getAttractions(activeGroupId),
        getExpenseCategories(activeGroupId).catch(() => getCachedExpenseCategories(activeGroupId)),
      ]);

      setTripExpenses(nextExpenses);
      setTripExpenseCategories(nextExpenseCategories);
      setTripItineraryItems(nextItineraryItems);
      setTripAttractions(nextAttractions.items);
      setTripInfoWarning(null);
    } catch (caughtError) {
      setTripInfoWarning(
        caughtError instanceof Error
          ? caughtError.message
          : 'Nao foi possivel carregar os dados da viagem ativa.',
      );
    }
  }, [activeGroupId]);

  const loadChecklist = useCallback(async () => {
    if (!activeGroupId) {
      setChecklistItems([]);
      setChecklistWarning(null);
      return;
    }

    try {
      const nextItems = await getTripChecklistItems(activeGroupId);
      setChecklistItems(nextItems);
      setChecklistWarning(null);
    } catch (caughtError) {
      setChecklistWarning(
        caughtError instanceof Error
          ? caughtError.message
          : 'Nao foi possivel carregar o checklist da viagem.',
      );
    }
  }, [activeGroupId]);

  const loadVisitedCountries = useCallback(async () => {
    if (!activeGroupId) {
      setVisitedCountries([]);
      setVisitedCountryWarning(null);
      return;
    }

    try {
      const nextVisitedCountries = await getTripVisitedCountries(activeGroupId);
      setVisitedCountries(nextVisitedCountries);
      setVisitedCountryWarning(null);
    } catch (caughtError) {
      setVisitedCountryWarning(
        caughtError instanceof Error
          ? caughtError.message
          : 'Nao foi possivel carregar os paises visitados.',
      );
    }
  }, [activeGroupId]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    setDisplayNameDraft(displayName === 'Viajante' ? '' : displayName);
    setEmailDraft(currentAccountEmail);
  }, [currentAccountEmail, displayName]);

  useEffect(() => {
    if (!activeGroupId) return undefined;

    const channel = supabase
      .channel(`profile-members-${activeGroupId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'group_members', filter: `group_id=eq.${activeGroupId}` },
        () => void loadProfile(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        () => void loadProfile(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeGroupId, loadProfile]);

  useEffect(() => {
    if (!user?.id) return undefined;

    void loadNotifications().catch(() => null);
    let fallbackInterval: number | undefined;
    const notificationSubscription = subscribeNotifications(
      user.id,
      () => void loadNotifications().catch(() => null),
      (state) => {
        if (state.available) {
          setNotificationRealtimeWarning(null);
          if (fallbackInterval) {
            window.clearInterval(fallbackInterval);
            fallbackInterval = undefined;
          }
          return;
        }

        setNotificationRealtimeWarning(state.message);
        fallbackInterval ??= window.setInterval(() => {
          void loadNotifications().catch(() => null);
        }, 60_000);
      },
    );

    return () => {
      if (fallbackInterval) window.clearInterval(fallbackInterval);
      notificationSubscription.remove();
    };
  }, [loadNotifications, user?.id]);

  useEffect(() => {
    const syncProfileSection = () => setActiveProfileSection(getProfileSectionFromPath());

    window.addEventListener('popstate', syncProfileSection);
    return () => window.removeEventListener('popstate', syncProfileSection);
  }, []);

  useEffect(() => {
    void loadActiveTripDetails();
  }, [loadActiveTripDetails]);

  useEffect(() => {
    if (!activeGroupId) {
      void loadChecklist();
      return undefined;
    }

    void loadChecklist();
    const channel = subscribeTripChecklistItems(activeGroupId, () => {
      void loadChecklist();
    });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeGroupId, loadChecklist]);

  useEffect(() => {
    if (!activeGroupId) {
      void loadVisitedCountries();
      return undefined;
    }

    void loadVisitedCountries();
    const channel = subscribeTripVisitedCountries(activeGroupId, () => {
      void loadVisitedCountries();
    });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeGroupId, loadVisitedCountries]);

  const copyToClipboard = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(null), 1800);
  };

  const navigateProfileSection = (sectionId: ProfileSectionId) => {
    const targetSection = profileSections.find((section) => section.id === sectionId) ?? profileSections[0];
    setActiveProfileSection(targetSection.id);
    window.history.pushState({}, '', targetSection.path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const navigateWorkspaceView = (view: 'dashboard' | 'expenses' | 'itinerary' | 'attractions' | 'quote') => {
    const nextPath = view === 'dashboard' ? '/dashboard' : `/#${view}`;
    window.history.pushState({}, '', nextPath);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const worldMapCountryId = (value?: string | null) => {
    const id = normalizeCountryId(value);
    return id === 'england' || id === 'scotland' ? 'united_kingdom' : id;
  };

  const handleToggleVisitedCountry = async (country: TripMapCountry) => {
    if (!activeGroupId) return;

    const currentCountry = visitedCountries.find(
      (item) => worldMapCountryId(item.countryCode) === country.id && item.visited,
    );
    const nextVisited = !currentCountry;

    if (!nextVisited && !window.confirm(`Deseja remover ${country.name} dos países visitados?`)) {
      return;
    }

    const optimisticCountry: VisitedCountry = {
      id: currentCountry?.id ?? `optimistic-${country.id}`,
      groupId: activeGroupId,
      userId: user?.id ?? '',
      countryCode: country.id,
      countryName: country.name,
      visited: nextVisited,
      visitedAt: nextVisited ? new Date().toISOString() : null,
      updatedAt: new Date().toISOString(),
    };

    setVisitedCountryActionId(country.id);
    setVisitedCountryWarning(null);
    setVisitedCountries((current) => {
      const withoutCountry = current.filter((item) => worldMapCountryId(item.countryCode) !== country.id);
      return [optimisticCountry, ...withoutCountry];
    });

    try {
      const savedCountry = await setTripCountryVisited(activeGroupId, country.id, country.name, nextVisited);
      setVisitedCountries((current) => {
        const withoutCountry = current.filter((item) => worldMapCountryId(item.countryCode) !== country.id);
        return [savedCountry, ...withoutCountry];
      });
      setStatus(nextVisited ? 'País marcado como visitado.' : 'País removido dos visitados.');
      window.setTimeout(() => setStatus(null), 2200);
    } catch (caughtError) {
      setVisitedCountryWarning(
        caughtError instanceof Error
          ? caughtError.message
          : 'Nao foi possivel atualizar o pais visitado.',
      );
      void loadVisitedCountries();
    } finally {
      setVisitedCountryActionId(null);
    }
  };

  const prepareProfileEditFeedback = () => {
    setProfileEditMessage(null);
    setProfileEditError(null);
    setStatus(null);
    setError(null);
  };

  const handleUpdateDisplayName = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    prepareProfileEditFeedback();

    const normalizedName = displayNameDraft.trim();
    if (!normalizedName) {
      setProfileEditError('Informe o nome de exibicao.');
      return;
    }

    if (normalizedName === (profile?.fullName ?? '').trim()) {
      setProfileEditMessage('Nome de exibicao ja esta atualizado.');
      return;
    }

    setProfileEditAction('name');
    try {
      const updatedProfile = await updateCurrentProfileName(normalizedName);
      setProfile(updatedProfile);
      setDisplayNameDraft(updatedProfile.fullName ?? normalizedName);
      setProfileEditMessage('Nome de exibicao atualizado com sucesso.');
    } catch (caughtError) {
      setProfileEditError(normalizeProfileEditError(caughtError));
    } finally {
      setProfileEditAction(null);
    }
  };

  const handleRequestEmailChange = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    prepareProfileEditFeedback();

    const nextEmail = emailDraft.trim();
    if (!nextEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
      setProfileEditError('Informe um e-mail valido.');
      return;
    }

    if (currentAccountEmail && nextEmail.toLowerCase() === currentAccountEmail.toLowerCase()) {
      setProfileEditMessage('Este e-mail ja e o e-mail atual da conta.');
      return;
    }

    setProfileEditAction('email');
    try {
      await updateCurrentUserEmail(nextEmail);
      setProfileEditMessage('Enviamos um e-mail de confirmacao para concluir a alteracao.');
    } catch (caughtError) {
      setProfileEditError(normalizeProfileEditError(caughtError));
    } finally {
      setProfileEditAction(null);
    }
  };

  const handleUpdatePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    prepareProfileEditFeedback();

    if (passwordDraft.length < 6) {
      setProfileEditError('A senha precisa ter pelo menos 6 caracteres.');
      return;
    }

    if (passwordDraft !== passwordConfirmationDraft) {
      setProfileEditError('A nova senha e a confirmacao precisam coincidir.');
      return;
    }

    setProfileEditAction('password');
    try {
      await updateCurrentUserPassword(passwordDraft);
      setPasswordDraft('');
      setPasswordConfirmationDraft('');
      setShowPasswordDraft(false);
      setShowPasswordConfirmationDraft(false);
      setProfileEditMessage('Senha atualizada com sucesso.');
    } catch (caughtError) {
      setProfileEditError(normalizeProfileEditError(caughtError));
    } finally {
      setProfileEditAction(null);
    }
  };

  const resetChecklistDraft = () => {
    setChecklistDraft(createEmptyChecklistDraft());
    setEditingChecklistItemId(null);
  };

  const startChecklistEdit = (item: TripChecklistItem) => {
    setEditingChecklistItemId(item.id);
    setChecklistDraft({
      title: item.title,
      category: item.category,
      notes: item.notes ?? '',
      quantity: item.quantity,
      assignedTo: item.assignedTo ?? '',
      checked: item.checked,
    });
  };

  const handleChecklistSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeGroup) return;

    setChecklistActionId(editingChecklistItemId ?? 'create');
    setChecklistWarning(null);

    try {
      if (editingChecklistItemId) {
        const updatedItem = await updateTripChecklistItem(activeGroup.id, editingChecklistItemId, checklistDraft);
        setChecklistItems((current) =>
          current.map((item) => item.id === updatedItem.id ? updatedItem : item),
        );
      } else {
        const createdItem = await createTripChecklistItem(activeGroup.id, checklistDraft);
        setChecklistItems((current) => [createdItem, ...current]);
      }

      resetChecklistDraft();
      await loadChecklist().catch(() => null);
    } catch (caughtError) {
      setChecklistWarning(
        caughtError instanceof Error
          ? caughtError.message
          : 'Nao foi possivel salvar o item do checklist.',
      );
    } finally {
      setChecklistActionId(null);
    }
  };

  const handleToggleChecklistItem = async (item: TripChecklistItem) => {
    if (!activeGroup) return;

    setChecklistActionId(item.id);
    setChecklistWarning(null);
    const nextChecked = !item.checked;
    setChecklistItems((current) =>
      current.map((currentItem) => currentItem.id === item.id ? { ...currentItem, checked: nextChecked } : currentItem),
    );

    try {
      await setTripChecklistItemChecked(activeGroup.id, item.id, nextChecked);
      await loadChecklist().catch(() => null);
    } catch (caughtError) {
      setChecklistItems((current) =>
        current.map((currentItem) => currentItem.id === item.id ? { ...currentItem, checked: item.checked } : currentItem),
      );
      setChecklistWarning(
        caughtError instanceof Error
          ? caughtError.message
          : 'Nao foi possivel atualizar o checklist.',
      );
    } finally {
      setChecklistActionId(null);
    }
  };

  const handleDeleteChecklistItem = async (item: TripChecklistItem) => {
    if (!activeGroup) return;

    const confirmed = window.confirm(`Excluir "${item.title}" do checklist?`);
    if (!confirmed) return;

    setChecklistActionId(item.id);
    setChecklistWarning(null);

    try {
      await deleteTripChecklistItem(activeGroup.id, item.id);
      setChecklistItems((current) => current.filter((currentItem) => currentItem.id !== item.id));
      if (editingChecklistItemId === item.id) resetChecklistDraft();
    } catch (caughtError) {
      setChecklistWarning(
        caughtError instanceof Error
          ? caughtError.message
          : 'Nao foi possivel excluir o item do checklist.',
      );
    } finally {
      setChecklistActionId(null);
    }
  };

  const handleInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setStatus(null);
    setIsInviting(true);

    try {
      const invite = await inviteMember(inviteEmail, true);
      setGeneratedInvite(invite);
      setKnownInvites((current) => [invite, ...current]);
      setInviteEmail('');
      setStatus(
        invite.emailSent
          ? `Convite enviado para ${invite.email}.`
          : `Convite criado para ${invite.email}, mas o e-mail nao foi enviado. ${invite.emailError ?? 'Verifique EMAIL_API_KEY.'}`,
      );
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
      validateDescriptionLength(tripDescription);
      const countries = parsedTripCountries();

      const group = await createGroup({
        name: tripName,
        description: tripDescription,
        countries,
        startDate: tripStartDate,
        endDate: tripEndDate,
        travelStyle: tripStyle,
      });
      setRecentlyCreatedTripId(group.id);
      setStatus(t('profile.tripCreatedNextAI'));
      setShowCreateTripForm(false);
      await refreshGroups({ silent: true });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Nao foi possivel criar sua viagem.');
    } finally {
      setIsCreatingTrip(false);
    }
  };

  const handleGenerateActiveTripPreview = async () => {
    if (!activeGroup) return;

    setError(null);
    setStatus(null);
    setIsGeneratingAI(true);

    try {
      validateDescriptionLength(activeGroup.description ?? '');
      const countries = activeGroup.countries?.length
        ? activeGroup.countries.flatMap((country) => parseCountryInput(country))
        : [];
      if (!countries.length) throw new Error(t('ai.missingCountries'));
      if (!activeGroup.startDate || !activeGroup.endDate) throw new Error(t('ai.missingDates'));
      const input: TripAIInput = {
        tripName: activeGroup.name,
        countries,
        description: activeGroup.description ?? '',
        startDate: activeGroup.startDate ?? '',
        endDate: activeGroup.endDate ?? '',
        style: (activeGroup.travelStyle as TripStyle | undefined) ?? 'intermediaria',
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
        countries: activeGroup.countries?.length
          ? activeGroup.countries.flatMap((country) => parseCountryInput(country))
          : [],
        description: activeGroup.description ?? '',
        startDate: activeGroup.startDate ?? '',
        endDate: activeGroup.endDate ?? '',
        style: (activeGroup.travelStyle as TripStyle | undefined) ?? 'intermediaria',
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
    setStatus(t('ai.manualContinue'));
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
      await loadNotifications().catch(() => null);
      await refreshGroups({ silent: true });
      window.history.replaceState({}, '', '/dashboard');
      window.dispatchEvent(new PopStateEvent('popstate'));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Nao foi possivel aceitar este convite.');
    } finally {
      setIsJoiningTrip(false);
    }
  };

  const handleMarkNotificationRead = async (notification: AppNotification) => {
    setNotificationActionId(notification.id);
    setError(null);
    setStatus(null);

    try {
      await markNotificationAsRead(notification.id);
      setNotifications((current) =>
        current.map((item) => item.id === notification.id ? { ...item, read: true } : item),
      );
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Nao foi possivel marcar a notificacao como lida.');
    } finally {
      setNotificationActionId(null);
    }
  };

  const handleClearReadNotifications = async () => {
    setNotificationActionId('clear-read');
    setError(null);
    setStatus(null);

    try {
      await clearReadNotifications();
      setNotifications((current) => current.filter((notification) => !notification.read));
      setStatus('Notificacoes lidas removidas.');
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Nao foi possivel limpar notificacoes.');
    } finally {
      setNotificationActionId(null);
    }
  };

  const handleAcceptNotificationInvite = async (notification: AppNotification) => {
    const token = typeof notification.metadata.token === 'string'
      ? normalizeInviteToken(notification.metadata.token)
      : '';
    if (!token) return;

    setNotificationActionId(notification.id);
    setError(null);
    setStatus(null);

    try {
      const group = await acceptInvite(token);
      await markNotificationAsRead(notification.id).catch(() => null);
      setNotifications((current) =>
        current.map((item) => item.id === notification.id ? { ...item, read: true } : item),
      );
      setStatus(`Convite aceito. Voce entrou em ${group.name}.`);
      await refreshGroups({ silent: true });
      window.history.replaceState({}, '', '/dashboard');
      window.dispatchEvent(new PopStateEvent('popstate'));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Nao foi possivel aceitar o convite.');
    } finally {
      setNotificationActionId(null);
    }
  };

  const handleRejectNotificationInvite = async (notification: AppNotification) => {
    const token = typeof notification.metadata.token === 'string'
      ? normalizeInviteToken(notification.metadata.token)
      : '';
    if (!token) return;

    setNotificationActionId(notification.id);
    setError(null);
    setStatus(null);

    try {
      await rejectInvite(token);
      await markNotificationAsRead(notification.id).catch(() => null);
      setNotifications((current) =>
        current.map((item) => item.id === notification.id ? { ...item, read: true } : item),
      );
      setStatus('Convite recusado.');
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Nao foi possivel recusar o convite.');
    } finally {
      setNotificationActionId(null);
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

  const handleUpdateTrip = async (group: UserTravelGroup, input: UpdateTravelGroupInput) => {
    if (group.ownerId !== user?.id) return;

    setTripActionId(group.id);
    setError(null);
    setStatus(null);

    try {
      const updatedGroup = await updateTrip(group.id, input);
      const mergedGroup = { ...group, ...updatedGroup, role: group.role };
      setSelectedTrip((current) => current?.id === group.id ? mergedGroup : current);
      if (activeGroup?.id === group.id) setActiveGroup(mergedGroup);
      await refreshGroups({ silent: true });
      await loadProfile();
      setStatus('Viagem atualizada.');
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Nao foi possivel atualizar a viagem.');
    } finally {
      setTripActionId(null);
    }
  };

  const handleLeaveTrip = async (group: UserTravelGroup) => {
    if (group.role === 'owner') {
      setError('Owner nao pode sair sem transferir propriedade ou apagar/cancelar a viagem.');
      return;
    }

    const confirmed = window.confirm(`Deseja sair da viagem ${group.name}?`);
    if (!confirmed) return;

    setTripActionId(group.id);
    setError(null);
    setStatus(null);

    try {
      await leaveTrip(group.id);
      setSelectedTrip(null);
      if (activeGroup?.id === group.id) setActiveGroup(null);
      await refreshGroups({ silent: true });
      await loadProfile();
      setStatus(`Voce saiu da viagem ${group.name}.`);
      window.history.replaceState({}, '', '/perfil');
      window.dispatchEvent(new PopStateEvent('popstate'));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Nao foi possivel sair desta viagem.');
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

  const renderNotificationCard = (notification: AppNotification, compact = false) => {
    const isInviteNotification = notification.type === 'invite_received' && typeof notification.metadata.token === 'string';
    const isBusy = notificationActionId === notification.id;

    return (
      <article
        key={notification.id}
        className={`rounded-3xl border p-4 ${
          notification.read ? 'border-slate-100 bg-slate-50' : 'border-teal-100 bg-teal-50/70'
        }`}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Bell className={`h-4 w-4 ${notification.read ? 'text-slate-400' : 'text-teal-700'}`} />
              <h3 className="truncate font-black text-slate-950">{notification.title}</h3>
              {!notification.read ? (
                <span className="rounded-full bg-teal-700 px-2 py-1 text-[0.65rem] font-black uppercase tracking-[0.12em] text-white">
                  Nova
                </span>
              ) : null}
            </div>
            <p className={`mt-2 text-sm font-semibold leading-6 text-slate-600 ${compact ? 'line-clamp-2' : ''}`}>
              {notification.message}
            </p>
            <p className="mt-2 text-xs font-bold text-slate-400">{formatDate(notification.createdAt)}</p>
          </div>
          <div className="flex flex-wrap gap-2 sm:justify-end">
            {isInviteNotification && !notification.read ? (
              <>
                <button
                  type="button"
                  onClick={() => void handleAcceptNotificationInvite(notification)}
                  disabled={isBusy}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-teal-700 px-3 text-sm font-black text-white transition hover:bg-teal-800 disabled:opacity-60"
                >
                  {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Aceitar
                </button>
                <button
                  type="button"
                  onClick={() => void handleRejectNotificationInvite(notification)}
                  disabled={isBusy}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-white px-3 text-sm font-black text-rose-700 transition hover:bg-rose-50 disabled:opacity-60"
                >
                  <X className="h-4 w-4" />
                  Recusar
                </button>
              </>
            ) : null}
            {!notification.read ? (
              <button
                type="button"
                onClick={() => void handleMarkNotificationRead(notification)}
                disabled={isBusy}
                className="inline-flex h-10 items-center justify-center rounded-2xl bg-white px-3 text-sm font-black text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
              >
                Marcar lida
              </button>
            ) : null}
          </div>
        </div>
      </article>
    );
  };

  const renderCreateTripForm = () => (
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
          <p className="text-sm font-black uppercase tracking-[0.18em] text-slate-400">{t('profile.newTrip')}</p>
          <h2 className="text-2xl font-black">{activeGroup ? t('profile.createNewTrip') : t('profile.createTrip')}</h2>
        </div>
      </div>
      <p className="mb-6 rounded-2xl bg-teal-50 px-4 py-3 text-sm font-bold text-teal-800">
        {activeGroup ? t('profile.createAnotherGroup') : t('profile.noTripYet')}
      </p>
      <form onSubmit={handleCreateTrip} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-sm font-bold text-slate-600">{t('profile.tripName')}</span>
            <input
              required
              value={tripName}
              onChange={(event) => setTripName(event.target.value)}
              className="h-12 w-full rounded-2xl border border-slate-200 px-4 font-semibold outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-bold text-slate-600">{t('profile.tripCountries')}</span>
            <input
              value={tripCountries}
              onChange={(event) => setTripCountries(event.target.value)}
              placeholder={t('profile.tripCountriesPlaceholder')}
              className="h-12 w-full rounded-2xl border border-slate-200 px-4 font-semibold outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
            />
          </label>
        </div>
        <label className="block">
          <span className="mb-2 block text-sm font-bold text-slate-600">{t('profile.description')}</span>
          <textarea
            value={tripDescription}
            onChange={(event) => setTripDescription(event.target.value)}
            placeholder={TRIP_DESCRIPTION_PLACEHOLDER}
            rows={5}
            aria-invalid={isTripDescriptionTooLong}
            className={`w-full rounded-2xl border px-4 py-3 font-semibold outline-none focus:ring-4 ${
              isTripDescriptionTooLong
                ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-100'
                : 'border-slate-200 focus:border-teal-400 focus:ring-teal-100'
            }`}
          />
          <span className={`mt-2 flex justify-between gap-3 text-xs font-black ${
            isTripDescriptionTooLong ? 'text-rose-600' : 'text-slate-400'
          }`}>
            <span>{isTripDescriptionTooLong ? TRIP_DESCRIPTION_TOO_LONG_MESSAGE : 'Use este campo para todos os detalhes que a IA deve considerar.'}</span>
            <span className="shrink-0">{tripDescription.length} / {TRIP_DESCRIPTION_MAX_LENGTH}</span>
          </span>
        </label>
        <div className="grid gap-4 md:grid-cols-3">
          <label className="block">
            <span className="mb-2 block text-sm font-bold text-slate-600">{t('profile.startDate')}</span>
            <input
              type="date"
              value={tripStartDate}
              onChange={(event) => setTripStartDate(event.target.value)}
              className="h-12 w-full rounded-2xl border border-slate-200 px-4 font-semibold outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-bold text-slate-600">{t('profile.endDate')}</span>
            <input
              type="date"
              value={tripEndDate}
              onChange={(event) => setTripEndDate(event.target.value)}
              className="h-12 w-full rounded-2xl border border-slate-200 px-4 font-semibold outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-bold text-slate-600">{t('profile.style')}</span>
            <select
              value={tripStyle}
              onChange={(event) => setTripStyle(event.target.value)}
              className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 font-semibold outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
            >
              <option value="economica">{t('profile.economic')}</option>
              <option value="intermediaria">{t('profile.balanced')}</option>
              <option value="confortavel">{t('profile.comfort')}</option>
            </select>
          </label>
        </div>
        <button
          type="submit"
          disabled={isCreatingTrip || isTripDescriptionTooLong}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 font-black text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-70"
        >
          <Plus className="h-5 w-5" />
          {isCreatingTrip ? t('profile.creatingTrip') : t('profile.createTrip')}
        </button>
      </form>
    </motion.section>
  );

  const renderJoinInviteCard = () => (
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
          <p className="text-sm font-black uppercase tracking-[0.18em] text-slate-400">{t('profile.invite')}</p>
          <h2 className="text-2xl font-black">{t('profile.joinWithCode')}</h2>
        </div>
      </div>
      <form onSubmit={handleAcceptInvite} className="space-y-4">
        <label className="block">
          <span className="mb-2 block text-sm font-bold text-slate-600">{t('profile.inviteCodeOrLink')}</span>
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
          {isJoiningTrip ? t('profile.joining') : t('profile.joinWithInviteCode')}
        </button>
      </form>
    </motion.section>
  );

  const renderActiveTripAiCard = () => (
    <section className="rounded-[2rem] border border-white/80 bg-white/90 p-6 shadow-xl shadow-slate-900/10 md:p-8">
      {activeGroup ? (
        <>
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.18em] text-slate-400">Viagem ativa</p>
              <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">{activeGroup.name}</h2>
              <p className="mt-3 max-w-2xl text-sm font-bold leading-6 text-slate-600">
                {recentlyCreatedTripId === activeGroup.id
                  ? t('profile.aiTripCreatedPrompt')
                  : t('profile.aiActiveTripPrompt')}
              </p>
            </div>
            <span className="rounded-2xl bg-teal-50 px-3 py-2 text-sm font-black text-teal-700">
              {activeGroup.role}
            </span>
          </div>
          <div className={`mt-6 rounded-3xl border p-5 ${
            recentlyCreatedTripId === activeGroup.id ? 'border-teal-200 bg-teal-50/80' : 'border-slate-100 bg-slate-50'
          }`}>
            <p className="text-sm font-black uppercase tracking-[0.16em] text-teal-700">
              {t('profile.aiNextStepTitle')}
            </p>
            <p className="mt-2 text-sm font-bold leading-6 text-slate-600">
              A IA roda pela Edge Function do Supabase e abre a tela de revisão antes de aplicar qualquer roteiro.
            </p>
            <button
              type="button"
              onClick={() => void handleGenerateActiveTripPreview()}
              disabled={isGeneratingAI || aiGenerationBlocked}
              className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-teal-700 px-5 font-black text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
            >
              {isGeneratingAI ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
              {isGeneratingAI ? t('profile.generatingAI') : t('profile.generateAI')}
            </button>
            <p className="mt-3 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-600">
              {aiUsageLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreateTripForm(true)}
            className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-slate-100 px-4 text-sm font-black text-slate-700 transition hover:bg-slate-200"
          >
            <Plus className="h-4 w-4" />
            Criar outra viagem
          </button>
        </>
      ) : (
        <p className="rounded-2xl bg-teal-50 px-4 py-3 text-sm font-bold text-teal-800">
          Primeiro crie sua viagem. Depois o botao Gerar com IA aparece aqui para montar uma previa revisavel.
        </p>
      )}
    </section>
  );

  const renderMembersSection = () => (
    <section className="rounded-[2rem] border border-white/80 bg-white/90 p-6 shadow-xl shadow-slate-900/10 md:p-8">
      <div className="mb-5 flex items-center gap-3">
        <Users className="h-5 w-5 text-teal-700" />
        <h2 className="text-2xl font-black">{t('profile.tripMembers')}</h2>
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
                  <p className="text-xs font-bold text-slate-400">Entrada: {formatDate(member.createdAt)}</p>
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
  );

  const renderInviteSection = () => (
    <section className="rounded-[2rem] border border-white/80 bg-white/90 p-6 shadow-xl shadow-slate-900/10 md:p-8">
      <div className="mb-6 flex items-center gap-3">
        <Ticket className="h-5 w-5 text-teal-700" />
        <h2 className="text-2xl font-black">{t('profile.invitePerson')}</h2>
      </div>
      {isOwner ? (
        <>
          <form onSubmit={handleInvite} className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-slate-600">{t('profile.inviteEmail')}</span>
              <input
                type="email"
                required
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                placeholder="amigo@email.com"
                className="h-12 w-full rounded-2xl border border-slate-200 px-4 font-semibold outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
              />
            </label>
            <button
              type="submit"
              disabled={isInviting}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 font-black text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <Send className="h-5 w-5" />
              {isInviting ? t('profile.sendingInvite') : t('profile.sendInvite')}
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
                {latestInvite.email ? (
                  <span className="rounded-2xl bg-white/70 px-3 py-2">E-mail: {latestInvite.email}</span>
                ) : null}
                <span className="rounded-2xl bg-white/70 px-3 py-2">
                  {t('profile.inviteValidity')}: {latestInvite.expiresAt ? formatDate(latestInvite.expiresAt) : '7 dias'}
                </span>
                <span className="rounded-2xl bg-white/70 px-3 py-2">
                  Envio: {latestInvite.emailSent ? 'e-mail enviado' : latestInvite.emailError ? 'e-mail pendente' : 'salvo'}
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => void copyToClipboard(latestInvite.code, 'codigo')}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-white px-3 text-teal-800"
                >
                  <Copy className="h-4 w-4" />
                  {t('actions.copyCode')}
                </button>
                <button
                  type="button"
                  onClick={() => void copyToClipboard(latestInvite.link, 'link')}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-white px-3 text-teal-800"
                >
                  <Copy className="h-4 w-4" />
                  {t('actions.copyLink')}
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
              {t('profile.generateInviteHint')}
            </p>
          )}
        </>
      ) : (
        <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-bold text-slate-600">
          {t('profile.ownerInviteOnly')}
        </p>
      )}
    </section>
  );

  return (
    <motion.div
      key="profile"
      className="space-y-6"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
    >
      <section className="relative min-h-[14rem] overflow-hidden rounded-xl bg-[#111827] text-white shadow-[0_18px_45px_rgba(15,23,42,0.12)]">
        <img src={profileHeroImage} alt="" className="absolute inset-0 h-full w-full object-cover opacity-55" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#020617]/92 via-[#0f172a]/76 to-[#020617]/70" />
        <div className="relative flex min-h-[14rem] flex-col gap-6 p-6 md:flex-row md:items-end md:justify-between lg:p-8">
          <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-end">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt=""
                className="h-28 w-28 shrink-0 rounded-2xl border-4 border-white/35 object-cover shadow-2xl shadow-slate-950/35"
              />
            ) : (
              <span className="grid h-28 w-28 shrink-0 place-items-center rounded-2xl border-4 border-white/35 bg-white text-3xl font-black text-[#0b1326] shadow-2xl shadow-slate-950/35">
                {getInitials(displayName)}
              </span>
            )}
            <div className="min-w-0 pb-1">
              <h1 className="break-words text-4xl font-black tracking-tight md:text-5xl">{displayName}</h1>
              <p className="mt-2 break-all text-lg font-semibold text-white/82">{displayEmail}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigateProfileSection('edit-profile')}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#007c68] px-6 text-base font-bold text-white transition hover:bg-[#006b57]"
          >
            <Pencil className="h-5 w-5" />
            Editar Perfil
          </button>
        </div>
      </section>

      <nav aria-label="Navegacao interna do perfil" className="border-b border-[#dfe5ee]">
        <div className="flex gap-8 overflow-x-auto">
          {visibleProfileSections.map((section) => {
            const isActive = activeProfileSection === section.id;

            return (
              <button
                key={section.id}
                type="button"
                aria-current={isActive ? 'page' : undefined}
                onClick={() => navigateProfileSection(section.id)}
                className={`relative inline-flex h-14 shrink-0 items-center text-base font-semibold transition ${
                  isActive ? 'text-[#006b57]' : 'text-[#2c3242] hover:text-[#006b57]'
                }`}
              >
                <span>{section.label}</span>
                {section.id === 'notifications' && unreadNotifications > 0 ? (
                  <span className="ml-2 rounded-full bg-rose-600 px-2 py-1 text-[0.65rem] font-black text-white">
                    {unreadNotifications > 9 ? '9+' : unreadNotifications}
                  </span>
                ) : null}
                {isActive ? <span className="absolute bottom-0 left-0 h-0.5 w-full bg-[#006b57]" /> : null}
              </button>
            );
          })}
        </div>
      </nav>

      {(status || error || isLoading) ? (
        <p className="rounded-2xl border border-white/80 bg-white/85 px-4 py-3 text-sm font-bold text-slate-600 shadow-lg shadow-slate-900/5">
          {isLoading ? t('profile.loading') : error ?? status}
        </p>
      ) : null}

      <div className="min-w-0 space-y-6">
          {activeProfileSection === 'overview' ? (
            <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(19rem,0.42fr)]">
              <div className="space-y-6">
                <div className="grid gap-6 md:grid-cols-3">
                  <ProfileMetricCard
                    icon={Route}
                    label="Total de viagens"
                    value={String(stats.travelCount)}
                    detail={`${userGroups.length} grupo${userGroups.length === 1 ? '' : 's'} vinculado${userGroups.length === 1 ? '' : 's'} à sua conta`}
                  />
                  <ProfileMetricCard
                    icon={Globe2}
                    label="Países visitados"
                    value={String(stats.countriesCount)}
                    detail={countriesSummary}
                  />
                  <ProfileMetricCard
                    icon={Sparkles}
                    label="IA usada"
                    value={isAiTestUser ? 'Ilimitada' : `${aiGenerationsUsed}/${aiGenerationsLimit}`}
                    detail={isAiTestUser ? 'Conta de teste com IA liberada' : aiUsageMessage}
                  />
                </div>

                <article className="grid gap-6 rounded-xl border border-[#00a98b] bg-white p-6 shadow-[0_14px_36px_rgba(15,23,42,0.06)] md:grid-cols-[minmax(0,1fr)_17rem] md:p-8">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-[#007c68]">
                      <Sparkles className="h-5 w-5 fill-[#48fdd3]" />
                      <p className="text-sm font-bold uppercase tracking-[0.16em]">Sugestão IA para você</p>
                    </div>
                    <h2 className="mt-5 text-3xl font-black tracking-tight text-[#0b1326]">{aiSuggestionTitle}</h2>
                    <p className="mt-4 max-w-2xl text-base font-medium leading-7 text-[#45464d]">
                      {aiSuggestionDescription}
                    </p>
                    <button
                      type="button"
                      onClick={() => navigateProfileSection(activeGroup ? 'checklist' : 'create-ai')}
                      className="mt-7 inline-flex h-12 items-center justify-center rounded-xl bg-black px-7 text-base font-bold text-white transition hover:bg-[#111827]"
                    >
                      {activeGroup ? 'Continuar planejamento' : 'Criar viagem'}
                    </button>
                  </div>
                  <div className="relative min-h-48 overflow-hidden rounded-xl">
                    <img src={aiSuggestionImage} alt="" className="absolute inset-0 h-full w-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                    <div className="absolute bottom-4 left-4 right-4 text-white">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/75">Viagem ativa</p>
                      <p className="mt-1 text-xl font-black">{activeTripMetric}</p>
                    </div>
                  </div>
                </article>

                <section className="rounded-xl border border-[#e6ebf3] bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.045)] md:p-8">
                  <h2 className="text-2xl font-black tracking-tight text-[#0b1326]">Configurações da Conta</h2>
                  <div className="mt-6 divide-y divide-[#edf1f7]">
                    <SettingsActionRow
                      icon={ShieldCheck}
                      title="Segurança & Senha"
                      description="Atualize sua senha usando o fluxo seguro do Supabase Auth."
                      onClick={() => navigateProfileSection('edit-profile')}
                    />
                    <SettingsActionRow
                      icon={UserRound}
                      title="E-mail e dados da conta"
                      description={displayEmail}
                      onClick={() => navigateProfileSection('edit-profile')}
                    />
                    <SettingsActionRow
                      icon={Globe2}
                      title="Idioma e Região"
                      description={`${languageOptions.find((option) => option.code === language)?.label ?? 'Português (Brasil)'} · Moeda BRL`}
                      onClick={() => navigateProfileSection('edit-profile')}
                    />
                    <SettingsActionRow
                      icon={WalletCards}
                      title="Preferências de moeda"
                      description="Valores reais e moedas originais seguem os dados atuais da viagem."
                      onClick={() => navigateWorkspaceView('expenses')}
                    />
                    <SettingsActionRow
                      icon={Bell}
                      title="Notificações"
                      description={unreadNotifications ? `${unreadNotifications} pendente${unreadNotifications === 1 ? '' : 's'}` : 'Tudo em dia'}
                      onClick={() => navigateProfileSection('notifications')}
                    />
                  </div>
                </section>
              </div>

              <aside className="space-y-6">
                <section className="rounded-xl bg-[#121b2d] p-7 text-white shadow-[0_18px_45px_rgba(15,23,42,0.14)]">
                  <span className="inline-flex rounded-full bg-[#007c68] px-3 py-1 text-xs font-bold uppercase tracking-[0.1em]">
                    Plano atual
                  </span>
                  <h2 className="mt-5 text-2xl font-black">Status da conta</h2>
                  <p className="mt-3 text-base font-medium leading-7 text-[#9ca7bd]">
                    Plano {accountPlanLabel}. Nenhuma cobrança ou assinatura real foi criada nesta fase.
                  </p>
                  <div className="mt-7 space-y-4 text-sm font-semibold text-[#cbd5e1]">
                    <p className="flex items-center gap-3">
                      <CheckCircle2 className="h-4 w-4 text-[#48fdd3]" />
                      IA: {isAiTestUser ? 'uso liberado' : `${aiGenerationsUsed} de ${aiGenerationsLimit}`}
                    </p>
                    <p className="flex items-center gap-3">
                      <CheckCircle2 className="h-4 w-4 text-[#48fdd3]" />
                      Viagem ativa: {activeTripMetric}
                    </p>
                    <p className="flex items-center gap-3">
                      <CheckCircle2 className="h-4 w-4 text-[#48fdd3]" />
                      Participa de {userGroups.length} grupo{userGroups.length === 1 ? '' : 's'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigateProfileSection('edit-profile')}
                    className="mt-8 inline-flex h-12 w-full items-center justify-center rounded-xl border border-white/25 px-5 font-bold text-white transition hover:bg-white/10"
                  >
                    Gerenciar conta
                  </button>
                </section>

                <section className="rounded-xl border border-[#e6ebf3] bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
                  <h2 className="text-lg font-bold text-[#0b1326]">Progresso da viagem</h2>
                  <div className="mt-6 space-y-5">
                    <ProgressLine label="Planejamento" value={tripPlanningProgress} />
                    <ProgressLine label="Checklist" value={checklistProgress} />
                    <ProgressLine label="Documentos" value={documentsProgress} />
                  </div>
                  <p className="mt-5 rounded-xl bg-[#f4f7fb] px-4 py-3 text-sm font-medium leading-6 text-[#45464d]">
                    {profileDocumentCount
                      ? `${pendingDocumentCount} documento${pendingDocumentCount === 1 ? '' : 's'} pendente${pendingDocumentCount === 1 ? '' : 's'}.`
                      : 'Nenhum documento adicionado.'}
                  </p>
                </section>

                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  className="inline-flex h-12 w-full items-center justify-start gap-3 rounded-xl px-4 text-base font-semibold text-[#45464d] transition hover:bg-white hover:text-rose-700"
                >
                  <LogOut className="h-5 w-5" />
                  Sair da conta
                </button>
                <p className="px-4 text-xs font-semibold text-[#a4acba]">TripFlow v2.4.1 Build 2024</p>
              </aside>
            </section>
          ) : null}

          {false && activeProfileSection === 'overview' ? (
            <>
              <section className="grid gap-6 xl:grid-cols-3">
                <article className="flex min-h-full flex-col rounded-[2rem] border border-white/80 bg-white/95 p-6 shadow-xl shadow-slate-900/10 md:p-7">
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white">
                      <MapPin className="h-5 w-5" />
                    </span>
                    <span className={`rounded-full px-3 py-2 text-xs font-black uppercase tracking-[0.12em] ${activeGroup ? statusClasses[activeTripStatus] : 'bg-slate-100 text-slate-500'}`}>
                      {activeGroup ? statusLabels[activeTripStatus] : 'Sem ativa'}
                    </span>
                  </div>
                  <p className="mt-5 text-sm font-black uppercase tracking-[0.18em] text-slate-400">Viagem ativa</p>
                  <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
                    {activeGroup?.name ?? 'Nenhuma viagem ativa'}
                  </h2>
                  <p className="mt-3 text-sm font-bold leading-6 text-slate-500">
                    {activeGroup?.description || 'Crie uma viagem ou entre por convite para organizar roteiro, gastos e documentos em um unico lugar.'}
                  </p>
                  {activeGroup ? (
                    <div className="mt-5 grid gap-3">
                      <DetailTile icon={Globe2} label="Paises" value={activeTripCountries} />
                      <DetailTile icon={CalendarDays} label="Datas" value={`${formatDate(activeGroup?.startDate)} - ${formatDate(activeGroup?.endDate)}`} />
                      <DetailTile icon={ShieldCheck} label="Dono" value={ownerName} />
                      <DetailTile icon={Users} label="Participantes" value={String(activeTripParticipantCount)} />
                    </div>
                  ) : (
                    <EmptyState
                      icon={Plus}
                      title="Sua proxima viagem espera"
                      description="A criacao continua na aba Criar viagem / IA, com o mesmo fluxo atual."
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => navigateProfileSection(activeGroup ? 'trip' : 'create-ai')}
                    className="mt-5 inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 font-black text-white transition hover:bg-teal-700"
                  >
                    {activeGroup ? 'Ver detalhes da viagem' : 'Criar viagem'}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </article>

                <article className="flex min-h-full flex-col rounded-[2rem] border border-white/80 bg-white/95 p-6 shadow-xl shadow-slate-900/10 md:p-7">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-700">
                    <Route className="h-5 w-5" />
                  </span>
                  <p className="mt-5 text-sm font-black uppercase tracking-[0.18em] text-slate-400">Resumo do roteiro</p>
                  <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
                    {tripItineraryItems.length ? `${tripItineraryItems.length} itens planejados` : 'Roteiro em construcao'}
                  </h2>
                  <div className="mt-5 flex-1 space-y-3">
                    {tripItineraryItems.length ? (
                      tripItineraryItems.slice(0, 3).map((item) => (
                        <article key={item.id} className="rounded-3xl border border-slate-100 bg-slate-50 px-4 py-3">
                          <p className="truncate font-black text-slate-950">{item.title}</p>
                          <p className="mt-1 text-sm font-bold text-slate-500">
                            {item.day || 'Sem dia'} - {item.city || 'Cidade nao informada'} / {countryLabel(item.country)}
                          </p>
                        </article>
                      ))
                    ) : (
                      <EmptyState
                        icon={Route}
                        title="Nenhum item no roteiro"
                        description="Quando houver roteiro, os proximos dias aparecem aqui sem mudar a regra atual."
                      />
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => activeGroup ? navigateWorkspaceView('itinerary') : navigateProfileSection('create-ai')}
                    className="mt-5 inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 font-black text-white transition hover:bg-teal-700"
                  >
                    Ver roteiro
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </article>

                <article className="flex min-h-full flex-col rounded-[2rem] border border-white/80 bg-white/95 p-6 shadow-xl shadow-slate-900/10 md:p-7">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
                    <WalletCards className="h-5 w-5" />
                  </span>
                  <p className="mt-5 text-sm font-black uppercase tracking-[0.18em] text-slate-400">Resumo de gastos</p>
                  <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
                    {formatRange(tripExpenseGrandTotal.real, 'BRL', true)}
                  </h2>
                  <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
                    {tripExpenses.length
                      ? `${tripExpenses.length} gasto${tripExpenses.length === 1 ? '' : 's'} cadastrado${tripExpenses.length === 1 ? '' : 's'} na viagem ativa.`
                      : 'Nenhum gasto cadastrado nesta viagem ainda.'}
                  </p>
                  <div className="mt-5 flex-1 space-y-3">
                    {topTripExpenseCategories.length ? (
                      topTripExpenseCategories.map(({ category, total }) => {
                        const percent = Math.max(8, Math.round((midpoint(total.real) / topTripExpenseMax) * 100));

                        return (
                          <div key={category.id} className="rounded-3xl bg-slate-50 px-4 py-3">
                            <div className="flex items-center justify-between gap-3 text-sm font-black">
                              <span className="truncate text-slate-800">{category.name}</span>
                              <span className="shrink-0 text-slate-500">{formatRange(total.real, 'BRL', true)}</span>
                            </div>
                            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                              <div
                                className="h-full rounded-full bg-teal-600"
                                style={{ width: `${percent}%` }}
                              />
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <EmptyState
                        icon={WalletCards}
                        title="Gastos vazios"
                        description="O resumo financeiro aparece assim que a viagem tiver gastos cadastrados."
                      />
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => activeGroup ? navigateWorkspaceView('expenses') : navigateProfileSection('create-ai')}
                    className="mt-5 inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 font-black text-white transition hover:bg-teal-700"
                  >
                    Ver todos os gastos
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </article>
              </section>

              <section className="rounded-[2rem] border border-white/80 bg-white/95 p-6 shadow-xl shadow-slate-900/10 md:p-8">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <p className="text-sm font-black uppercase tracking-[0.18em] text-teal-700">Documentos da viagem</p>
                    <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">
                      {checklistDocumentItems.length || legacyItineraryDocuments.length
                        ? `${checklistDocumentItems.length || legacyItineraryDocuments.length} documento${(checklistDocumentItems.length || legacyItineraryDocuments.length) === 1 ? '' : 's'}`
                        : 'Nenhum documento listado'}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigateProfileSection('checklist')}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white transition hover:bg-teal-700"
                  >
                    Ver todos
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {checklistDocumentItems.length ? (
                    checklistDocumentItems.slice(0, 4).map((item) => {
                      const assignedName = item.assignedTo ? memberNameByUserId.get(item.assignedTo) : null;

                      return (
                        <article
                          key={item.id}
                          className={`rounded-3xl border px-4 py-4 ${
                            item.checked ? 'border-emerald-100 bg-emerald-50/70' : 'border-slate-100 bg-slate-50'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <FileText className={`mt-1 h-5 w-5 shrink-0 ${item.checked ? 'text-emerald-700' : 'text-teal-700'}`} />
                            <span className={`rounded-full px-2 py-1 text-[0.65rem] font-black uppercase tracking-[0.1em] ${
                              item.checked ? 'bg-emerald-600 text-white' : 'bg-white text-slate-500'
                            }`}>
                              {item.checked ? 'Ok' : 'Pendente'}
                            </span>
                          </div>
                          <p className={`mt-4 font-black ${item.checked ? 'text-emerald-900 line-through' : 'text-slate-950'}`}>
                            {item.title}
                          </p>
                          <p className="mt-2 text-xs font-black uppercase tracking-[0.12em] text-slate-400">
                            Qtd. {item.quantity}{assignedName ? ` - ${assignedName}` : ''}
                          </p>
                        </article>
                      );
                    })
                  ) : legacyItineraryDocuments.length ? (
                    legacyItineraryDocuments.slice(0, 4).map((item) => (
                      <article key={item.id} className="rounded-3xl border border-slate-100 bg-slate-50 px-4 py-4">
                        <FileText className="h-5 w-5 text-teal-700" />
                        <p className="mt-4 font-black text-slate-950">{item.title}</p>
                        <p className="mt-2 text-xs font-black uppercase tracking-[0.12em] text-slate-400">Fallback do roteiro</p>
                      </article>
                    ))
                  ) : (
                    <div className="md:col-span-2 xl:col-span-4">
                      <EmptyState
                        icon={FileText}
                        title="Documentos ainda vazios"
                        description="A origem atual foi preservada. A integracao Documentos + Checklist fica para a fase separada."
                      />
                    </div>
                  )}
                </div>
              </section>

              <section className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)]">
                <section className="rounded-[2rem] border border-white/80 bg-white/95 p-6 shadow-xl shadow-slate-900/10 md:p-8">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                      <p className="text-sm font-black uppercase tracking-[0.18em] text-slate-400">{t('profile.history')}</p>
                      <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">{t('profile.myTrips')}</h2>
                      <p className="mt-2 max-w-2xl text-sm font-bold leading-6 text-slate-500">
                        {t('profile.historyDescription')}
                      </p>
                    </div>
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

                  <div className="mt-6 grid gap-4 md:grid-cols-2">
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

                <aside className="space-y-6">
                  <section className="rounded-[2rem] border border-white/80 bg-white/95 p-6 shadow-xl shadow-slate-900/10">
                    <p className="text-sm font-black uppercase tracking-[0.18em] text-slate-400">
                      {t('language.selectorTitle')}
                    </p>
                    <p className="mt-2 text-sm font-bold leading-6 text-slate-600">
                      {t('language.selectorDescription')}
                    </p>
                    <select
                      value={language}
                      onChange={(event) => setLanguage(event.target.value as LanguageCode)}
                      className="mt-5 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 font-black text-slate-800 outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                    >
                      {languageOptions.map((option) => (
                        <option key={option.code} value={option.code}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </section>

                  <section className="rounded-[2rem] border border-white/80 bg-white/95 p-6 shadow-xl shadow-slate-900/10">
                    <p className="text-sm font-black uppercase tracking-[0.18em] text-slate-400">Conta TripFlow</p>
                    <div className="mt-5 grid gap-3">
                      <DetailTile icon={UserRound} label="Nome" value={displayName} />
                      <DetailTile icon={WalletCards} label="Total geral" value={formatRange(stats.totalAllReal, 'BRL', true)} />
                      <DetailTile icon={Sparkles} label="IA" value={isAiTestUser ? 'Geracoes ilimitadas' : `${aiGenerationsUsed} de ${aiGenerationsLimit}`} />
                    </div>
                  </section>
                </aside>
              </section>
            </>
          ) : null}

          {activeProfileSection === 'trip' ? (
            activeGroup ? (
              <>
                <section className="rounded-[2rem] border border-white/80 bg-white/95 p-6 shadow-xl shadow-slate-900/10 md:p-8">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-sm font-black uppercase tracking-[0.18em] text-slate-400">{t('profile.activeTripSection')}</p>
                      <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">{activeGroup.name}</h2>
                      {activeGroup.description ? (
                        <p className="mt-3 leading-7 text-slate-600">{activeGroup.description}</p>
                      ) : null}
                    </div>
                    <span className={`rounded-2xl px-3 py-2 text-sm font-black ${statusClasses[activeGroup.status ?? 'planned']}`}>
                      {statusLabels[activeGroup.status ?? 'planned']}
                    </span>
                  </div>
                  {tripInfoWarning ? (
                    <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-700">
                      {tripInfoWarning}
                    </p>
                  ) : null}
                  <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <DetailTile icon={MapPin} label="Paises" value={activeTripCountries} />
                    <DetailTile icon={CalendarDays} label="Datas" value={`${formatDate(activeGroup.startDate)} - ${formatDate(activeGroup.endDate)}`} />
                    <DetailTile icon={ShieldCheck} label={t('profile.owner')} value={ownerName} />
                    <DetailTile icon={Users} label="Membros" value={String(activeTripParticipantCount)} />
                    <DetailTile icon={WalletCards} label="Gastos" value={formatRange(tripExpenseGrandTotal.real, 'BRL', true)} />
                    <DetailTile icon={Route} label="Roteiro" value={`${tripItineraryItems.length} itens`} />
                    <DetailTile icon={MapPin} label="Pontos turisticos" value={String(tripAttractions.length)} />
                    <DetailTile icon={CalendarDays} label={t('profile.createdIn')} value={formatDate(activeGroup.createdAt)} />
                  </div>
                  {activeGroup.role === 'member' ? (
                    <button
                      type="button"
                      onClick={() => void handleLeaveTrip(activeGroup)}
                      disabled={tripActionId === activeGroup.id}
                      className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-rose-50 px-5 font-black text-rose-700 transition hover:bg-rose-100 disabled:opacity-60 sm:w-auto"
                    >
                      {tripActionId === activeGroup.id ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogOut className="h-5 w-5" />}
                      Sair desta viagem
                    </button>
                  ) : null}
                </section>

                <section className="grid gap-6 xl:grid-cols-3">
                  <div className="rounded-[2rem] border border-white/80 bg-white/95 p-6 shadow-xl shadow-slate-900/10 xl:col-span-2">
                    <h3 className="text-2xl font-black text-slate-950">Resumo do roteiro</h3>
                    <div className="mt-4 space-y-3">
                      {tripItineraryItems.slice(0, 5).map((item) => (
                        <div key={item.id} className="rounded-3xl bg-slate-50 px-4 py-3">
                          <p className="font-black text-slate-900">{item.title}</p>
                          <p className="mt-1 text-sm font-bold text-slate-500">{item.day} - {countryLabel(item.country)} - {item.city || 'Cidade nao informada'}</p>
                        </div>
                      ))}
                      {!tripItineraryItems.length ? (
                        <EmptyState
                          icon={Route}
                          title="Roteiro vazio"
                          description="Os itens da viagem ativa aparecem aqui assim que forem cadastrados."
                        />
                      ) : null}
                    </div>
                  </div>
                  <div className="rounded-[2rem] border border-white/80 bg-white/95 p-6 shadow-xl shadow-slate-900/10">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-black uppercase tracking-[0.18em] text-slate-400">Checklist</p>
                        <h3 className="text-2xl font-black text-slate-950">Documentos</h3>
                      </div>
                      <FileText className="h-6 w-6 text-teal-700" />
                    </div>
                    <div className="mt-4 space-y-3">
                      {checklistDocumentItems.length ? (
                        checklistDocumentItems.map((item) => {
                          const assignedName = item.assignedTo ? memberNameByUserId.get(item.assignedTo) : null;

                          return (
                            <article
                              key={item.id}
                              className={`rounded-3xl border px-4 py-3 ${
                                item.checked ? 'border-emerald-100 bg-emerald-50/70' : 'border-slate-100 bg-slate-50'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className={`font-black ${item.checked ? 'text-emerald-900 line-through' : 'text-slate-950'}`}>
                                    {item.title}
                                  </p>
                                  <p className="mt-1 text-xs font-black uppercase tracking-[0.12em] text-slate-400">
                                    Qtd. {item.quantity}{assignedName ? ` - ${assignedName}` : ''}
                                  </p>
                                </div>
                                <span className={`shrink-0 rounded-full px-3 py-1 text-[0.7rem] font-black uppercase tracking-[0.1em] ${
                                  item.checked ? 'bg-emerald-600 text-white' : 'bg-white text-slate-500'
                                }`}>
                                  {item.checked ? 'Concluido' : 'Pendente'}
                                </span>
                              </div>
                              {item.notes ? (
                                <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{item.notes}</p>
                              ) : null}
                            </article>
                          );
                        })
                      ) : legacyItineraryDocuments.length ? (
                        legacyItineraryDocuments.slice(0, 4).map((item) => (
                          <article key={item.id} className="rounded-3xl border border-slate-100 bg-slate-50 px-4 py-3">
                            <p className="font-black text-slate-950">{item.title}</p>
                            <p className="mt-1 text-xs font-black uppercase tracking-[0.12em] text-slate-400">
                              Fallback do roteiro
                            </p>
                          </article>
                        ))
                      ) : (
                        <EmptyState
                          icon={FileText}
                          title="Documentos vazios"
                          description="Documentos continuam usando a origem atual nesta fase visual."
                        />
                      )}
                    </div>
                  </div>
                </section>

                <section className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(22rem,0.5fr)]">
                  {tripExpenses.length ? (
                    <ExpenseChart
                      categories={tripExpenseCategoriesForDisplay}
                      totalsByCategory={tripExpenseTotalsByCategory}
                      eyebrow="Resumo de gastos"
                      title="Distribuicao da viagem"
                      description={`${tripExpenses.length} gasto${tripExpenses.length === 1 ? '' : 's'} cadastrado${tripExpenses.length === 1 ? '' : 's'} nesta viagem, com totais convertidos para BRL e agrupados por categoria.`}
                      summary={(
                        <>
                          <div className="rounded-2xl bg-slate-50 px-4 py-3">
                            <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Total em BRL</p>
                            <p className="mt-1 text-lg font-black text-slate-950">
                              {formatRange(tripExpenseGrandTotal.real, 'BRL', true)}
                            </p>
                          </div>
                          <div className="rounded-2xl bg-slate-50 px-4 py-3">
                            <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Moeda original</p>
                            <p className="mt-1 text-sm font-black leading-6 text-slate-950">
                              {formatOriginalCurrencyBreakdown(tripExpenseGrandTotal.originalByCurrency)}
                            </p>
                          </div>
                          {topTripExpenseCategories.length ? (
                            <div className="rounded-2xl bg-teal-50 px-4 py-3 sm:col-span-2">
                              <p className="text-xs font-black uppercase tracking-[0.14em] text-teal-700">Maiores categorias</p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {topTripExpenseCategories.map(({ category, total }) => (
                                  <span key={category.id} className="rounded-full bg-white px-3 py-2 text-xs font-black text-slate-700">
                                    {category.name}: {formatRange(total.real, 'BRL', true)}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </>
                      )}
                    />
                  ) : (
                    <div className="rounded-[2rem] border border-white/80 bg-white/95 p-6 shadow-xl shadow-slate-900/10 md:p-8">
                      <p className="text-sm font-black uppercase tracking-[0.18em] text-slate-400">Resumo de gastos</p>
                      <h3 className="mt-2 text-2xl font-black text-slate-950">Controle financeiro</h3>
                      <div className="mt-4">
                        <EmptyState
                          icon={WalletCards}
                          title="Gastos vazios"
                          description="O controle financeiro da viagem aparece aqui quando houver lancamentos."
                        />
                      </div>
                    </div>
                  )}
                  <div className="rounded-[2rem] border border-white/80 bg-white/95 p-6 shadow-xl shadow-slate-900/10">
                    <h3 className="text-2xl font-black text-slate-950">Pontos turisticos</h3>
                    <div className="mt-4 space-y-3">
                      {tripAttractions.slice(0, 4).map((attraction) => (
                        <p key={attraction.id} className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-bold text-slate-600">
                          {attraction.name} - {countryLabel(attraction.country)}
                        </p>
                      ))}
                      {!tripAttractions.length ? (
                        <EmptyState
                          icon={MapPin}
                          title="Sem pontos turisticos"
                          description="Os pontos cadastrados na viagem ativa serao resumidos aqui."
                        />
                      ) : null}
                    </div>
                  </div>
                </section>

                <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
                  {renderMembersSection()}
                  {renderInviteSection()}
                </section>
              </>
            ) : (
              <section className="rounded-[2rem] border border-white/80 bg-white/95 p-6 shadow-xl shadow-slate-900/10 md:p-8">
                <EmptyState
                  icon={Plus}
                  title="Nenhuma viagem ativa"
                  description="Crie uma viagem ou entre por convite para ver as informacoes da viagem ativa."
                  action={(
                    <button
                      type="button"
                      onClick={() => navigateProfileSection('create-ai')}
                      className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 font-black text-white transition hover:bg-teal-700"
                    >
                      <Plus className="h-5 w-5" />
                      Criar minha viagem
                    </button>
                  )}
                />
              </section>
            )
          ) : null}

          {activeProfileSection === 'create-ai' ? (
            <>
              {aiFailedGroup && aiRetryInput ? (
                <section className="rounded-[2rem] border border-amber-200 bg-amber-50 p-5 shadow-xl shadow-amber-900/10 md:p-6">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="text-sm font-black uppercase tracking-[0.16em] text-amber-700">{t('ai.notCompleted')}</p>
                      <h2 className="mt-1 text-2xl font-black text-slate-950">{t('ai.tripSaved')}</h2>
                      <p className="mt-2 text-sm font-bold leading-6 text-amber-900">
                        {t('ai.retryOrManual', { tripName: aiFailedGroup.name })}
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
                        {t('ai.retry')}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleContinueWithoutAI()}
                        className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-white px-5 font-black text-amber-900 transition hover:bg-amber-100"
                      >
                        {t('ai.continueWithout')}
                      </button>
                    </div>
                  </div>
                </section>
              ) : null}

              {activeGroup && !shouldShowCreateTripForm ? (
                renderActiveTripAiCard()
              ) : (
                <section className={activeGroup ? 'grid gap-6' : 'grid gap-6 xl:grid-cols-[1.05fr_0.95fr]'}>
                  {renderCreateTripForm()}
                  {!activeGroup ? renderJoinInviteCard() : (
                    <button
                      type="button"
                      onClick={() => setShowCreateTripForm(false)}
                      className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-100 px-5 font-black text-slate-700 transition hover:bg-slate-200"
                    >
                      <Sparkles className="h-5 w-5" />
                      Voltar para gerar com IA
                    </button>
                  )}
                </section>
              )}
            </>
          ) : null}

          {activeProfileSection === 'map' ? (
            <TripVisitedMap
              activeGroupName={activeGroup?.name}
              tripCountries={activeGroup?.countries ?? []}
              visitedCountries={visitedCountries}
              actionCountryId={visitedCountryActionId}
              warning={visitedCountryWarning}
              onToggleCountry={(country) => void handleToggleVisitedCountry(country)}
              onOpenTourism={() => navigateWorkspaceView('attractions')}
              onCreateTrip={() => navigateProfileSection('create-ai')}
            />
          ) : null}

          {activeProfileSection === 'documents' ? (
            <section className="rounded-xl border border-[#e6ebf3] bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.045)] md:p-8">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-sm font-bold uppercase tracking-[0.16em] text-[#007c68]">Documentos</p>
                  <h2 className="mt-2 text-3xl font-black tracking-tight text-[#0b1326]">
                    {profileDocumentCount
                      ? `${profileDocumentCount} documento${profileDocumentCount === 1 ? '' : 's'} da viagem`
                      : 'Nenhum documento adicionado'}
                  </h2>
                  <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-[#667085]">
                    Documentos vêm do checklist da viagem ativa e respeitam o group_id atual.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => navigateProfileSection('checklist')}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-black px-5 font-bold text-white transition hover:bg-[#111827]"
                >
                  Abrir checklist
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {checklistDocumentItems.length ? (
                  checklistDocumentItems.map((item) => {
                    const assignedName = item.assignedTo ? memberNameByUserId.get(item.assignedTo) : null;

                    return (
                      <article
                        key={item.id}
                        className={`rounded-xl border p-5 ${
                          item.checked ? 'border-emerald-100 bg-emerald-50/70' : 'border-[#e6ebf3] bg-[#f8fafc]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-[#007c68] shadow-sm">
                            <FileText className="h-5 w-5" />
                          </span>
                          <span className={`rounded-full px-3 py-1 text-xs font-bold ${
                            item.checked ? 'bg-emerald-600 text-white' : 'bg-white text-[#667085]'
                          }`}>
                            {item.checked ? 'Concluído' : 'Pendente'}
                          </span>
                        </div>
                        <h3 className={`mt-5 font-black ${item.checked ? 'text-emerald-950 line-through' : 'text-[#0b1326]'}`}>
                          {item.title}
                        </h3>
                        <p className="mt-2 text-sm font-semibold leading-6 text-[#667085]">
                          Qtd. {item.quantity}
                          {assignedName ? ` · ${assignedName}` : ''}
                        </p>
                      </article>
                    );
                  })
                ) : legacyItineraryDocuments.length ? (
                  legacyItineraryDocuments.map((item) => (
                    <article key={item.id} className="rounded-xl border border-[#e6ebf3] bg-[#f8fafc] p-5">
                      <span className="grid h-11 w-11 place-items-center rounded-full bg-white text-[#007c68] shadow-sm">
                        <FileText className="h-5 w-5" />
                      </span>
                      <h3 className="mt-5 font-black text-[#0b1326]">{item.title}</h3>
                      <p className="mt-2 text-sm font-semibold text-[#667085]">Documento identificado no roteiro.</p>
                    </article>
                  ))
                ) : (
                  <div className="md:col-span-2 xl:col-span-3">
                    <EmptyState
                      icon={FileText}
                      title="Nenhum documento adicionado"
                      description="Adicione documentos no checklist para acompanhar pendências da viagem ativa."
                    />
                  </div>
                )}
              </div>
            </section>
          ) : null}

          {activeProfileSection === 'checklist' ? (
            activeGroup ? (
              <>
                <section className="rounded-[2rem] border border-white/80 bg-white/90 p-6 shadow-xl shadow-slate-900/10 md:p-8">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                      <p className="text-sm font-black uppercase tracking-[0.18em] text-slate-400">Checklist da viagem</p>
                      <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">{activeGroup.name}</h2>
                      <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
                        {checkedChecklistCount} de {checklistItems.length} itens marcados como levados.
                      </p>
                    </div>
                    <span className="rounded-2xl bg-teal-50 px-4 py-3 text-sm font-black text-teal-700">
                      {checklistProgress}% concluido
                    </span>
                  </div>
                  {checklistWarning ? (
                    <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-700">
                      {checklistWarning}
                    </p>
                  ) : null}
                </section>

                <div className="grid gap-6 xl:grid-cols-[minmax(21rem,0.75fr)_minmax(0,1.25fr)] xl:items-start">
                  <section className="rounded-[2rem] border border-white/80 bg-white/90 p-6 shadow-xl shadow-slate-900/10 md:p-8">
                    <div className="mb-6 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-black uppercase tracking-[0.18em] text-slate-400">
                          {editingChecklistItem ? 'Editar item' : 'Novo item'}
                        </p>
                        <h3 className="text-2xl font-black text-slate-950">
                          {editingChecklistItem ? editingChecklistItem.title : 'Adicionar ao checklist'}
                        </h3>
                      </div>
                      {editingChecklistItem ? (
                        <button
                          type="button"
                          onClick={resetChecklistDraft}
                          className="inline-flex h-10 items-center justify-center rounded-2xl bg-slate-100 px-3 text-sm font-black text-slate-600 transition hover:bg-slate-200"
                        >
                          Cancelar
                        </button>
                      ) : null}
                    </div>
                    <form onSubmit={handleChecklistSubmit} className="space-y-4">
                      <div className="grid gap-4 md:grid-cols-[1.1fr_0.8fr_0.6fr] xl:grid-cols-1">
                        <label className="block">
                          <span className="mb-2 block text-sm font-bold text-slate-600">Item</span>
                          <input
                            required
                            value={checklistDraft.title}
                            onChange={(event) => setChecklistDraft((current) => ({ ...current, title: event.target.value }))}
                            placeholder="Passaporte, carregador, casaco..."
                            className="h-12 w-full rounded-2xl border border-slate-200 px-4 font-semibold outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                          />
                        </label>
                        <label className="block">
                          <span className="mb-2 block text-sm font-bold text-slate-600">Categoria</span>
                          <select
                            value={checklistDraft.category}
                            onChange={(event) => setChecklistDraft((current) => ({
                              ...current,
                              category: event.target.value as TripChecklistItemCategory,
                            }))}
                            className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 font-semibold outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                          >
                            {checklistCategories.map((category) => (
                              <option key={category} value={category}>{checklistCategoryLabels[category]}</option>
                            ))}
                          </select>
                        </label>
                        <label className="block">
                          <span className="mb-2 block text-sm font-bold text-slate-600">Quantidade</span>
                          <input
                            type="number"
                            min={1}
                            value={checklistDraft.quantity}
                            onChange={(event) => setChecklistDraft((current) => ({
                              ...current,
                              quantity: Math.max(1, Number(event.target.value) || 1),
                            }))}
                            className="h-12 w-full rounded-2xl border border-slate-200 px-4 font-semibold outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                          />
                        </label>
                      </div>
                      <div className="grid gap-4 md:grid-cols-[0.8fr_1.2fr] xl:grid-cols-1">
                        <label className="block">
                          <span className="mb-2 block text-sm font-bold text-slate-600">Responsavel</span>
                          <select
                            value={checklistDraft.assignedTo ?? ''}
                            onChange={(event) => setChecklistDraft((current) => ({ ...current, assignedTo: event.target.value }))}
                            className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 font-semibold outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                          >
                            <option value="">Sem responsavel</option>
                            {members.map((member) => {
                              const fallbackEmail = member.userId === user?.id ? user?.email : null;
                              return (
                                <option key={member.userId} value={member.userId}>
                                  {getProfileName(member.profile, fallbackEmail)}
                                </option>
                              );
                            })}
                          </select>
                        </label>
                        <label className="block">
                          <span className="mb-2 block text-sm font-bold text-slate-600">Observacao</span>
                          <input
                            value={checklistDraft.notes ?? ''}
                            onChange={(event) => setChecklistDraft((current) => ({ ...current, notes: event.target.value }))}
                            placeholder="Detalhes, tamanho, onde comprar..."
                            className="h-12 w-full rounded-2xl border border-slate-200 px-4 font-semibold outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                          />
                        </label>
                      </div>
                      <button
                        type="submit"
                        disabled={Boolean(checklistActionId) && (
                          checklistActionId === 'create' || checklistActionId === editingChecklistItemId
                        )}
                        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 font-black text-white transition hover:bg-teal-700 disabled:opacity-60"
                      >
                        {Boolean(checklistActionId) && (
                          checklistActionId === 'create' || checklistActionId === editingChecklistItemId
                        ) ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <Save className="h-5 w-5" />
                        )}
                        {editingChecklistItem ? 'Salvar item' : 'Adicionar item'}
                      </button>
                    </form>
                  </section>

                  <section className="rounded-[2rem] border border-white/80 bg-white/90 p-6 shadow-xl shadow-slate-900/10 md:p-8">
                    {checklistItems.length ? (
                      <div className="space-y-5">
                        {checklistCategories.map((category) => {
                          const items = checklistItems.filter((item) => item.category === category);
                          if (!items.length) return null;

                          return (
                            <div key={category}>
                              <h3 className="mb-3 text-sm font-black uppercase tracking-[0.18em] text-slate-400">
                                {checklistCategoryLabels[category]}
                              </h3>
                              <div className="space-y-3">
                                {items.map((item) => {
                                  const assignedMember = item.assignedTo
                                    ? members.find((member) => member.userId === item.assignedTo)
                                    : null;
                                  const assignedName = assignedMember
                                    ? getProfileName(assignedMember.profile, assignedMember.userId === user?.id ? user?.email : null)
                                    : null;
                                  const isBusy = checklistActionId === item.id;

                                  return (
                                    <article
                                      key={item.id}
                                      className={`rounded-3xl border p-4 ${
                                        item.checked ? 'border-emerald-100 bg-emerald-50/70' : 'border-slate-100 bg-slate-50'
                                      }`}
                                    >
                                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                        <div className="flex min-w-0 gap-3">
                                          <button
                                            type="button"
                                            onClick={() => void handleToggleChecklistItem(item)}
                                            disabled={isBusy}
                                            aria-label={item.checked ? 'Desmarcar item' : 'Marcar item'}
                                            className={`mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl transition ${
                                              item.checked
                                                ? 'bg-emerald-600 text-white'
                                                : 'bg-white text-slate-400 hover:text-teal-700'
                                            }`}
                                          >
                                            {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
                                          </button>
                                          <div className="min-w-0">
                                            <p className={`font-black ${item.checked ? 'text-emerald-900 line-through' : 'text-slate-950'}`}>
                                              {item.title}
                                            </p>
                                            <p className="mt-1 text-sm font-bold text-slate-500">
                                              Qtd. {item.quantity}
                                              {assignedName ? ` - Responsavel: ${assignedName}` : ''}
                                            </p>
                                            {item.notes ? (
                                              <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{item.notes}</p>
                                            ) : null}
                                          </div>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                          <button
                                            type="button"
                                            onClick={() => startChecklistEdit(item)}
                                            className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-white px-3 text-sm font-black text-slate-700 transition hover:bg-slate-100"
                                          >
                                            <Pencil className="h-4 w-4" />
                                            Editar
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => void handleDeleteChecklistItem(item)}
                                            disabled={isBusy}
                                            className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-rose-50 px-3 text-sm font-black text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
                                          >
                                            <Trash2 className="h-4 w-4" />
                                            Excluir
                                          </button>
                                        </div>
                                      </div>
                                    </article>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <EmptyState
                        icon={CheckCircle2}
                        title="Checklist vazio"
                        description="Adicione o primeiro item para acompanhar documentos, roupas e tarefas da viagem."
                      />
                    )}
                  </section>
                </div>
              </>
            ) : (
              <section className="rounded-[2rem] border border-white/80 bg-white/95 p-6 shadow-xl shadow-slate-900/10 md:p-8">
                <EmptyState
                  icon={CheckCircle2}
                  title="Checklist indisponivel"
                  description="O checklist e vinculado ao group_id ativo. Crie ou abra uma viagem primeiro."
                />
              </section>
            )
          ) : null}

          {activeProfileSection === 'notifications' ? (
            <section className="rounded-[2rem] border border-white/80 bg-white/90 p-6 shadow-xl shadow-slate-900/10 md:p-8">
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm font-black uppercase tracking-[0.18em] text-teal-700">Notificacoes</p>
                  <h2 className="text-2xl font-black text-slate-950">
                    {unreadNotifications ? `${unreadNotifications} nao lida${unreadNotifications === 1 ? '' : 's'}` : 'Tudo em dia'}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => void handleClearReadNotifications()}
                  disabled={notificationActionId === 'clear-read' || !notifications.some((notification) => notification.read)}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-slate-100 px-4 text-sm font-black text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {notificationActionId === 'clear-read' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Limpar lidas
                </button>
              </div>

              {notificationRealtimeWarning ? (
                <p className="mb-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-700">
                  {notificationRealtimeWarning}
                </p>
              ) : null}

              {notifications.length ? (
                <div className="space-y-3">
                  {notifications.map((notification) => renderNotificationCard(notification))}
                </div>
              ) : (
                <EmptyState
                  icon={Bell}
                  title="Nenhuma notificacao"
                  description="Quando convites e atualizacoes chegarem, eles aparecerao aqui."
                />
              )}
            </section>
          ) : null}

          {activeProfileSection === 'edit-profile' ? (
            <section className="space-y-6">
              <div className="rounded-[2rem] border border-white/80 bg-white/95 p-6 shadow-xl shadow-slate-900/10 md:p-8">
                <p className="text-sm font-black uppercase tracking-[0.18em] text-teal-700">Editar perfil</p>
                <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Conta e acesso</h2>
                <p className="mt-3 max-w-3xl text-sm font-bold leading-6 text-slate-600">
                  Atualize seus dados pessoais e credenciais usando os fluxos seguros da conta TripFlow.
                </p>
                {profileEditMessage ? (
                  <p className="mt-5 rounded-2xl bg-teal-50 px-4 py-3 text-sm font-bold text-teal-700">
                    {profileEditMessage}
                  </p>
                ) : null}
                {profileEditError ? (
                  <p className="mt-5 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
                    {profileEditError}
                  </p>
                ) : null}
              </div>

              <div className="grid gap-6 xl:grid-cols-3">
                <form
                  onSubmit={handleUpdateDisplayName}
                  noValidate
                  className="flex min-h-full flex-col rounded-[2rem] border border-white/80 bg-white/95 p-6 shadow-xl shadow-slate-900/10 md:p-7"
                >
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-700">
                      <UserRound className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-sm font-black uppercase tracking-[0.16em] text-slate-400">Dados publicos</p>
                      <h3 className="text-xl font-black text-slate-950">Nome de exibicao</h3>
                    </div>
                  </div>
                  <p className="mt-4 text-sm font-bold leading-6 text-slate-500">
                    Esse nome aparece no card principal e nos membros da viagem.
                  </p>
                  <label className="mt-6 block text-sm font-black text-slate-700" htmlFor="display-name">
                    Nome
                  </label>
                  <input
                    id="display-name"
                    value={displayNameDraft}
                    onChange={(event) => setDisplayNameDraft(event.target.value)}
                    autoComplete="name"
                    disabled={isProfileEditBusy}
                    aria-invalid={!displayNameDraft.trim()}
                    className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
                    placeholder="Seu nome no TripFlow"
                  />
                  <button
                    type="submit"
                    disabled={isProfileEditBusy}
                    className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 font-black text-white shadow-xl shadow-slate-900/15 transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {profileEditAction === 'name' ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                    Salvar nome
                  </button>
                </form>

                <form
                  onSubmit={handleRequestEmailChange}
                  noValidate
                  className="flex min-h-full flex-col rounded-[2rem] border border-white/80 bg-white/95 p-6 shadow-xl shadow-slate-900/10 md:p-7"
                >
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-700">
                      <Send className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-sm font-black uppercase tracking-[0.16em] text-slate-400">E-mail de acesso</p>
                      <h3 className="text-xl font-black text-slate-950">Alterar e-mail</h3>
                    </div>
                  </div>
                  <p className="mt-4 text-sm font-bold leading-6 text-slate-500">
                    A troca usa Supabase Auth e pode exigir confirmacao por e-mail.
                  </p>
                  <label className="mt-6 block text-sm font-black text-slate-700" htmlFor="current-email">
                    E-mail atual
                  </label>
                  <input
                    id="current-email"
                    value={currentAccountEmail || displayEmail}
                    readOnly
                    className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-500 outline-none"
                  />
                  <label className="mt-4 block text-sm font-black text-slate-700" htmlFor="new-email">
                    Novo e-mail
                  </label>
                  <input
                    id="new-email"
                    type="email"
                    value={emailDraft}
                    onChange={(event) => setEmailDraft(event.target.value)}
                    autoComplete="email"
                    disabled={isProfileEditBusy}
                    aria-invalid={Boolean(emailDraft.trim()) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailDraft.trim())}
                    className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
                    placeholder="novo@email.com"
                  />
                  <p className="mt-2 text-xs font-bold leading-5 text-slate-400">
                    O e-mail atual continua valendo ate a confirmacao do novo endereco.
                  </p>
                  <button
                    type="submit"
                    disabled={isProfileEditBusy}
                    className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 font-black text-white shadow-xl shadow-slate-900/15 transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {profileEditAction === 'email' ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                    Alterar e-mail
                  </button>
                </form>

                <form
                  onSubmit={handleUpdatePassword}
                  noValidate
                  className="flex min-h-full flex-col rounded-[2rem] border border-white/80 bg-white/95 p-6 shadow-xl shadow-slate-900/10 md:p-7"
                >
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-700">
                      <ShieldCheck className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-sm font-black uppercase tracking-[0.16em] text-slate-400">Seguranca da conta</p>
                      <h3 className="text-xl font-black text-slate-950">Seguranca</h3>
                    </div>
                  </div>
                  <p className="mt-4 text-sm font-bold leading-6 text-slate-500">
                    A senha e atualizada somente no Supabase Auth e nao e armazenada no TripFlow.
                  </p>
                  <label className="mt-6 block text-sm font-black text-slate-700" htmlFor="new-password">
                    Nova senha
                  </label>
                  <div className="mt-2 flex h-12 items-center rounded-2xl border border-slate-200 bg-white px-4 transition focus-within:border-teal-500 focus-within:ring-4 focus-within:ring-teal-100">
                    <input
                      id="new-password"
                      type={showPasswordDraft ? 'text' : 'password'}
                      value={passwordDraft}
                      onChange={(event) => setPasswordDraft(event.target.value)}
                      autoComplete="new-password"
                      minLength={6}
                      disabled={isProfileEditBusy}
                      aria-invalid={Boolean(passwordDraft) && passwordDraft.length < 6}
                      placeholder="Minimo de 6 caracteres"
                      className="min-w-0 flex-1 bg-transparent text-sm font-bold text-slate-900 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasswordDraft((current) => !current)}
                      aria-label={showPasswordDraft ? 'Ocultar senha' : 'Mostrar senha'}
                      className="ml-2 inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                    >
                      {showPasswordDraft ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <label className="mt-4 block text-sm font-black text-slate-700" htmlFor="confirm-password">
                    Confirmar nova senha
                  </label>
                  <div className="mt-2 flex h-12 items-center rounded-2xl border border-slate-200 bg-white px-4 transition focus-within:border-teal-500 focus-within:ring-4 focus-within:ring-teal-100">
                    <input
                      id="confirm-password"
                      type={showPasswordConfirmationDraft ? 'text' : 'password'}
                      value={passwordConfirmationDraft}
                      onChange={(event) => setPasswordConfirmationDraft(event.target.value)}
                      autoComplete="new-password"
                      minLength={6}
                      disabled={isProfileEditBusy}
                      aria-invalid={Boolean(passwordConfirmationDraft) && passwordDraft !== passwordConfirmationDraft}
                      placeholder="Repita a nova senha"
                      className="min-w-0 flex-1 bg-transparent text-sm font-bold text-slate-900 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasswordConfirmationDraft((current) => !current)}
                      aria-label={showPasswordConfirmationDraft ? 'Ocultar senha' : 'Mostrar senha'}
                      className="ml-2 inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                    >
                      {showPasswordConfirmationDraft ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <button
                    type="submit"
                    disabled={isProfileEditBusy}
                    className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 font-black text-white shadow-xl shadow-slate-900/15 transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {profileEditAction === 'password' ? <Loader2 className="h-5 w-5 animate-spin" /> : <ShieldCheck className="h-5 w-5" />}
                    Atualizar senha
                  </button>
                </form>
              </div>
            </section>
          ) : null}
      </div>

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
            onLeave={handleLeaveTrip}
            onOpen={handleOpenTrip}
            onUpdate={handleUpdateTrip}
            summary={tripSummaries[selectedTrip.id]}
          />
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}
