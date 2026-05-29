import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Gauge,
  Loader2,
  MapPin,
  PlaneTakeoff,
  RefreshCw,
  Route,
  Sparkles,
  UsersRound,
  WalletCards,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { ConversionToggle } from './ConversionToggle';
import { ExpenseChart } from './ExpenseChart';
import { QuoteStatusCard } from './QuoteStatusCard';
import { SummaryCards } from './SummaryCards';
import type { AppView } from './Navbar';
import { useAuth } from '../contexts/AuthContext';
import { countryLabel } from '../data/countries';
import { getGroupMembers } from '../services/groupsService';
import { getCachedItineraryItems, getItineraryItems } from '../services/itineraryService';
import { getTripChecklistItems } from '../services/checklistService';
import type {
  CategoryMeta,
  ExchangeRateMap,
  Expense,
  GroupMember,
  ItineraryItem,
  RealValueMode,
  TripChecklistItem,
  TripStatus,
  UserTravelGroup,
} from '../types';
import {
  formatOriginalCurrencyBreakdown,
  formatRange,
  getExpenseCurrency,
  getExpenseOriginalRange,
  type Totals,
} from '../utils/money';

type NextActionTarget =
  | 'create-trip'
  | 'generate-ai'
  | 'documents'
  | 'checklist'
  | 'itinerary'
  | 'expenses'
  | 'trip';

type NextActionDashboardProps = {
  activeGroup: UserTravelGroup | null;
  canUseEuropeDefaults: boolean;
  categories: CategoryMeta[];
  exchangeRates: ExchangeRateMap;
  expenseStatusMessage?: string | null;
  expenses: Expense[];
  grandTotal: Totals;
  isQuoteLoading: boolean;
  onAddExpense: () => void;
  onNavigate: (view: AppView) => void;
  onNavigateToProfilePath: (path: string) => void;
  onRefreshQuote: () => void;
  onResetExpenses: () => void;
  onValueModeChange: (mode: RealValueMode) => void;
  quoteWarning: string | null;
  realValueMode: RealValueMode;
  totalsByCategory: Record<string, Totals>;
};

type NextAction = {
  title: string;
  description: string;
  cta: string;
  target: NextActionTarget;
  icon: ComponentType<{ className?: string }>;
  detail?: string;
};

const statusLabels: Record<TripStatus, string> = {
  planned: 'Planejada',
  active: 'Ativa',
  completed: 'Concluida',
  canceled: 'Cancelada',
};

const statusClasses: Record<TripStatus, string> = {
  planned: 'bg-sky-100 text-sky-800',
  active: 'bg-teal-100 text-teal-800',
  completed: 'bg-emerald-100 text-emerald-800',
  canceled: 'bg-rose-100 text-rose-800',
};

const formatDate = (value?: string) => {
  if (!value) return 'Sem data';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
};

const formatShortDate = (value?: string) => {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(date);
};

const getTripDayCount = (startDate?: string, endDate?: string) => {
  if (!startDate || !endDate) return null;
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return null;
  return Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
};

const getDayNumber = (day: string) => {
  const [, value] = day.match(/(\d+)/) ?? [];
  return value ? Number(value) : null;
};

const getItemDateLabel = (item: ItineraryItem, group: UserTravelGroup | null) => {
  const dayNumber = getDayNumber(item.day);
  if (!group?.startDate || !dayNumber) return item.day;

  const start = new Date(`${group.startDate}T00:00:00`);
  if (Number.isNaN(start.getTime())) return item.day;
  start.setDate(start.getDate() + dayNumber - 1);

  return `${item.day} - ${formatShortDate(start.toISOString().slice(0, 10)) ?? item.day}`;
};

const getLocationLabel = (item: ItineraryItem) => {
  const parts = [item.city, countryLabel(item.country)].filter(Boolean);
  return parts.length ? parts.join(', ') : 'Local a definir';
};

const getCategoryLabel = (categories: CategoryMeta[], categoryId: string) =>
  categories.find((category) => category.id === categoryId)?.name ?? categoryId;

const normalizeSearchText = (value?: string) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const isDocumentChecklistItem = (item: TripChecklistItem) => {
  const searchable = normalizeSearchText(`${item.category} ${item.title} ${item.notes ?? ''}`);
  return /document|passaporte|visto|reserva|comprovante|voucher|seguro/.test(searchable);
};

const dashboardHeroImage =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuB1_s6-IXeqdQenr-iqRsq_Ema-qtKVzaxTrM4pZwFj7bUWrvNEpFB5_e9z6LicJ5Rb4dt2GuO9isUOY-usBaHtvXVUbeoGJveWj37td0C6SW8PzOmBmM-5YwOO3HwPoFsJEORL9cBjU2n6RoWF79d1nGgHZmkxoiCXUZ5hmNBYueSVyqbhkYCfjIw3SxeFZRHQo4wcyy6inD37y-jBUspou5r1q0tkJNBQUfwfglmzzprU_YeR1ldc8oyR6NNRcBqnhgePVdRDu3nY';

const getDaysUntilStart = (startDate?: string) => {
  if (!startDate) return null;
  const today = new Date();
  const start = new Date(`${startDate}T00:00:00`);
  if (Number.isNaN(start.getTime())) return null;

  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  return Math.ceil((startUtc - todayUtc) / 86400000);
};

const formatDaysUntil = (daysUntil: number | null) => {
  if (daysUntil === null) return 'A definir';
  if (daysUntil > 1) return `${daysUntil} dias`;
  if (daysUntil === 1) return 'Amanha';
  if (daysUntil === 0) return 'Hoje';
  return 'Em andamento';
};

const getDisplayName = (userEmail?: string, fullName?: string, metadataName?: string) =>
  fullName || metadataName || userEmail || 'viajante';

const getFirstName = (displayName: string) => displayName.trim().split(/\s+/)[0] || 'viajante';

const getMemberInitial = (member: GroupMember) =>
  member.userId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 1).toUpperCase() || 'T';

function ProgressBar({ value, tone = 'teal' }: { value: number; tone?: 'teal' | 'slate' }) {
  const width = `${Math.max(0, Math.min(100, Math.round(value)))}%`;
  return (
    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
      <div
        className={`h-full rounded-full ${tone === 'teal' ? 'bg-[#006b57]' : 'bg-slate-950'}`}
        style={{ width }}
      />
    </div>
  );
}

function CircularProgress({
  detail,
  label,
  value,
}: {
  detail: string;
  label: string;
  value: number;
}) {
  const roundedValue = Math.max(0, Math.min(100, Math.round(value)));

  return (
    <div className="flex items-center gap-3">
      <div
        className="grid h-16 w-16 shrink-0 place-items-center rounded-full"
        style={{
          background: `conic-gradient(#006b57 ${roundedValue * 3.6}deg, #e8edf4 0deg)`,
        }}
      >
        <div className="grid h-12 w-12 place-items-center rounded-full bg-white text-sm font-black text-slate-950">
          {roundedValue}%
        </div>
      </div>
      <div className="min-w-0">
        <p className="text-sm font-black text-slate-950">{label}</p>
        <p className="mt-1 text-xs font-bold leading-5 text-slate-500">{detail}</p>
      </div>
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-5">
      <p className="text-sm font-black text-slate-800">{title}</p>
      <p className="mt-1 text-sm font-bold leading-6 text-slate-500">{description}</p>
    </div>
  );
}

function DashboardCard({
  actionLabel,
  children,
  icon: Icon,
  onAction,
  title,
}: {
  actionLabel?: string;
  children: ReactNode;
  icon: ComponentType<{ className?: string }>;
  onAction?: () => void;
  title: string;
}) {
  return (
    <section className="rounded-[1.5rem] border border-[#e6ebf2] bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.07)] md:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#eef8f5] text-[#006b57]">
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-black text-slate-950">{title}</h2>
          </div>
        </div>
        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 transition hover:border-[#006b57]/30 hover:bg-[#eef8f5] hover:text-[#006b57]"
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function ItemRow({
  meta,
  status,
  title,
}: {
  meta: string;
  status?: string;
  title: string;
}) {
  return (
    <div className="border-b border-slate-100 py-3 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-slate-950">{title}</p>
          <p className="mt-1 text-xs font-bold leading-5 text-slate-500">{meta}</p>
        </div>
        {status ? (
          <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[0.65rem] font-black uppercase tracking-[0.08em] text-slate-500">
            {status}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function NextActionDashboard({
  activeGroup,
  canUseEuropeDefaults,
  categories,
  exchangeRates,
  expenseStatusMessage,
  expenses,
  grandTotal,
  isQuoteLoading,
  onAddExpense,
  onNavigate,
  onNavigateToProfilePath,
  onRefreshQuote,
  onResetExpenses,
  onValueModeChange,
  quoteWarning,
  realValueMode,
  totalsByCategory,
}: NextActionDashboardProps) {
  const { user } = useAuth();
  const [itineraryItems, setItineraryItems] = useState<ItineraryItem[]>(() => getCachedItineraryItems(activeGroup?.id));
  const [checklistItems, setChecklistItems] = useState<TripChecklistItem[]>([]);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [membersCount, setMembersCount] = useState<number | null>(null);
  const [isPlanningLoading, setIsPlanningLoading] = useState(false);
  const [planningWarning, setPlanningWarning] = useState<string | null>(null);

  useEffect(() => {
    if (!activeGroup?.id) {
      setItineraryItems([]);
      setChecklistItems([]);
      setMembers([]);
      setMembersCount(null);
      return undefined;
    }

    let active = true;

    const loadPlanningData = async () => {
      setIsPlanningLoading(true);
      try {
        const [nextItineraryItems, nextChecklistItems, nextMembers] = await Promise.all([
          getItineraryItems(activeGroup.id),
          getTripChecklistItems(activeGroup.id),
          getGroupMembers(activeGroup.id),
        ]);

        if (active) {
          setItineraryItems(nextItineraryItems);
          setChecklistItems(nextChecklistItems);
          setMembers(nextMembers);
          setMembersCount(nextMembers.length);
          setPlanningWarning(null);
        }
      } catch {
        if (active) {
          setItineraryItems(getCachedItineraryItems(activeGroup.id));
          setPlanningWarning('Nao foi possivel atualizar todos os proximos passos agora. Mostrando dados disponiveis.');
        }
      } finally {
        if (active) setIsPlanningLoading(false);
      }
    };

    setItineraryItems(getCachedItineraryItems(activeGroup.id));
    setChecklistItems([]);
    setMembers([]);
    setMembersCount(null);
    void loadPlanningData();

    const refreshWhenVisible = () => {
      if (!document.hidden) void loadPlanningData();
    };

    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);

    return () => {
      active = false;
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [activeGroup?.id]);

  const pendingItineraryItems = useMemo(
    () => itineraryItems.filter((item) => !item.completed),
    [itineraryItems],
  );
  const activityHighlights = pendingItineraryItems.length ? pendingItineraryItems.slice(0, 3) : itineraryItems.slice(0, 3);
  const nextPendingActivity = pendingItineraryItems[0] ?? null;

  const documentItems = useMemo(() => checklistItems.filter(isDocumentChecklistItem), [checklistItems]);
  const pendingDocuments = documentItems.filter((item) => !item.checked);
  const pendingChecklist = checklistItems.filter((item) => !item.checked);
  const completedChecklistCount = checklistItems.length - pendingChecklist.length;
  const completedDocumentsCount = documentItems.length - pendingDocuments.length;
  const completedItineraryCount = itineraryItems.length - pendingItineraryItems.length;
  const checklistProgress = checklistItems.length ? (completedChecklistCount / checklistItems.length) * 100 : 0;
  const documentsProgress = documentItems.length ? (completedDocumentsCount / documentItems.length) * 100 : 0;
  const itineraryProgress = itineraryItems.length ? (completedItineraryCount / itineraryItems.length) * 100 : 0;
  const recentExpenses = useMemo(() => [...expenses].slice(-5).reverse(), [expenses]);
  const tripDayCount = getTripDayCount(activeGroup?.startDate, activeGroup?.endDate);
  const daysUntilStart = getDaysUntilStart(activeGroup?.startDate);
  const memberTotal = membersCount ?? (activeGroup ? 1 : 0);
  const ownerCount = members.filter((member) => member.role === 'owner').length;
  const travelProgressParts = documentItems.length
    ? [itineraryProgress, checklistProgress, documentsProgress]
    : [itineraryProgress, checklistProgress];
  const travelReadiness = activeGroup
    ? Math.round(travelProgressParts.reduce((sum, value) => sum + value, 0) / travelProgressParts.length)
    : 0;
  const tripStatus = activeGroup?.status ?? 'planned';
  const tripCountries = activeGroup?.countries?.length
    ? activeGroup.countries.map((country) => countryLabel(country)).join(', ')
    : 'Paises a definir';
  const userDisplayName = getDisplayName(
    user?.email,
    user?.user_metadata?.full_name as string | undefined,
    user?.user_metadata?.name as string | undefined,
  );
  const firstName = getFirstName(userDisplayName);
  const tripPeriodLabel = activeGroup
    ? `${formatDate(activeGroup.startDate)} - ${formatDate(activeGroup.endDate)}`
    : 'Periodo a definir';
  const statusMessage = !activeGroup
    ? 'Crie uma viagem para conectar roteiro, checklist e gastos em um unico painel.'
    : pendingDocuments.length
      ? 'Documentos pendentes sao o principal ponto de atencao agora.'
      : pendingChecklist.length
        ? 'Checklist ainda tem pendencias antes da viagem.'
        : nextPendingActivity
          ? 'Roteiro pronto para acompanhar a proxima atividade.'
          : recentExpenses.length
            ? 'Planejamento organizado. Vale revisar os gastos recentes.'
            : 'Tudo pronto no essencial para esta viagem.';

  const nextAction = useMemo<NextAction>(() => {
    if (!activeGroup) {
      return {
        title: 'Crie sua primeira viagem',
        description: 'Comece cadastrando sua viagem para organizar roteiro, gastos e checklist.',
        cta: 'Criar viagem',
        target: 'create-trip',
        icon: PlaneTakeoff,
        detail: 'Primeiro passo',
      };
    }

    if (!itineraryItems.length) {
      return {
        title: 'Gere o roteiro da sua viagem',
        description: 'Use a IA para criar uma previa do roteiro antes de aplicar.',
        cta: 'Gerar roteiro com IA',
        target: 'generate-ai',
        icon: Sparkles,
        detail: activeGroup.name,
      };
    }

    if (pendingDocuments.length) {
      return {
        title: 'Complete seus documentos',
        description: `${pendingDocuments.length} documento${pendingDocuments.length === 1 ? '' : 's'} importante${pendingDocuments.length === 1 ? '' : 's'} ainda precisa${pendingDocuments.length === 1 ? '' : 'm'} de atencao.`,
        cta: 'Ver documentos',
        target: 'documents',
        icon: FileText,
        detail: `${documentItems.length - pendingDocuments.length}/${documentItems.length} concluidos`,
      };
    }

    if (pendingChecklist.length) {
      return {
        title: 'Finalize seu checklist',
        description: `Ainda existem ${pendingChecklist.length} item${pendingChecklist.length === 1 ? '' : 's'} pendente${pendingChecklist.length === 1 ? '' : 's'} para preparar antes da viagem.`,
        cta: 'Abrir checklist',
        target: 'checklist',
        icon: ClipboardCheck,
        detail: `${Math.round(checklistProgress)}% concluido`,
      };
    }

    if (nextPendingActivity) {
      return {
        title: 'Proxima atividade',
        description: `${nextPendingActivity.title} - ${getItemDateLabel(nextPendingActivity, activeGroup)}, ${getLocationLabel(nextPendingActivity)}${nextPendingActivity.time ? `, ${nextPendingActivity.time}` : ''}.`,
        cta: 'Ver roteiro',
        target: 'itinerary',
        icon: Route,
        detail: `${completedItineraryCount}/${itineraryItems.length} atividades concluidas`,
      };
    }

    if (recentExpenses.length) {
      return {
        title: 'Revise os gastos recentes',
        description: 'Confira os ultimos gastos adicionados a viagem e mantenha o orcamento alinhado.',
        cta: 'Ver gastos',
        target: 'expenses',
        icon: WalletCards,
        detail: `${recentExpenses.length} lancamento${recentExpenses.length === 1 ? '' : 's'} recente${recentExpenses.length === 1 ? '' : 's'}`,
      };
    }

    return {
      title: 'Tudo pronto para sua viagem',
      description: 'Seu planejamento esta organizado. Acompanhe roteiro, gastos e checklist quando precisar.',
      cta: 'Ver viagem',
      target: 'trip',
      icon: CheckCircle2,
      detail: activeGroup.name,
    };
  }, [
    activeGroup,
    checklistProgress,
    completedItineraryCount,
    documentItems.length,
    itineraryItems,
    nextPendingActivity,
    pendingChecklist.length,
    pendingDocuments.length,
    recentExpenses.length,
  ]);

  const handleTarget = (target: NextActionTarget) => {
    if (target === 'itinerary') {
      onNavigate('itinerary');
      return;
    }
    if (target === 'expenses') {
      onNavigate('expenses');
      return;
    }
    if (target === 'trip') {
      onNavigateToProfilePath('/perfil/viagem');
      return;
    }
    if (target === 'documents' || target === 'checklist') {
      onNavigateToProfilePath('/perfil/checklist');
      return;
    }
    onNavigateToProfilePath('/perfil/criar-viagem');
  };

  const NextActionIcon = nextAction.icon;
  const planningStatusMessage = isPlanningLoading
    ? 'Atualizando proximos passos...'
    : planningWarning;

  return (
    <motion.div
      key="dashboard"
      className="space-y-6"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
    >
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.2em] text-[#006b57]">Dashboard TripFlow</p>
          <h1 className="mt-2 text-3xl font-black tracking-normal text-slate-950 md:text-4xl">
            Ola, {firstName}
          </h1>
          <p className="mt-2 max-w-2xl text-sm font-bold leading-6 text-slate-500 md:text-base">
            {activeGroup
              ? `${activeGroup.name} esta ${travelReadiness}% organizada. ${statusMessage}`
              : statusMessage}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNavigateToProfilePath(activeGroup ? '/perfil/viagem' : '/perfil/criar-viagem')}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-white px-5 text-sm font-black text-slate-950 shadow-[0_12px_32px_rgba(15,23,42,0.08)] transition hover:bg-[#eef8f5] hover:text-[#006b57]"
        >
          {activeGroup ? 'Ver viagem ativa' : 'Criar viagem'}
          <ArrowRight className="h-4 w-4" />
        </button>
      </section>

      {expenseStatusMessage || planningStatusMessage ? (
        <p className="rounded-2xl border border-white/70 bg-white/75 px-4 py-3 text-sm font-semibold text-slate-600 shadow-lg shadow-slate-900/5 backdrop-blur-xl">
          {expenseStatusMessage ?? planningStatusMessage}
        </p>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-12">
        <section className="relative min-h-[360px] overflow-hidden rounded-[1.75rem] bg-slate-950 text-white shadow-[0_24px_70px_rgba(15,23,42,0.18)] md:min-h-[420px] xl:col-span-8">
          <img
            src={dashboardHeroImage}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-80"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-slate-950/72 via-slate-950/24 to-[#006b57]/44" />
          <div className="relative flex min-h-[360px] flex-col justify-between p-6 md:min-h-[420px] md:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-slate-950 shadow-lg shadow-slate-950/15">
                <NextActionIcon className="h-4 w-4 text-[#006b57]" />
                Proxima acao
              </span>
              <span className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-white backdrop-blur">
                {nextAction.detail ?? 'Planejamento'}
              </span>
            </div>

            <div className="max-w-2xl">
              <h2 className="text-3xl font-black tracking-normal md:text-5xl">{nextAction.title}</h2>
              <p className="mt-4 text-sm font-bold leading-6 text-white/80 md:text-base md:leading-7">
                {nextAction.description}
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => handleTarget(nextAction.target)}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-white px-5 font-black text-slate-950 shadow-xl shadow-slate-950/20 transition hover:bg-[#48fdd3] focus:outline-none focus:ring-4 focus:ring-white/30"
                >
                  {nextAction.cta}
                  <ArrowRight className="h-5 w-5" />
                </button>
                {activeGroup ? (
                  <button
                    type="button"
                    onClick={onAddExpense}
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-white/25 bg-white/10 px-5 font-black text-white backdrop-blur transition hover:bg-white/20 focus:outline-none focus:ring-4 focus:ring-white/25"
                  >
                    <WalletCards className="h-5 w-5" />
                    Adicionar gasto
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[1.75rem] bg-[#101827] p-6 text-white shadow-[0_24px_70px_rgba(15,23,42,0.16)] xl:col-span-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#48fdd3]">Custo estimado</p>
              <h2 className="mt-3 text-3xl font-black">{formatRange(grandTotal.real, 'BRL', true)}</h2>
            </div>
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-[#48fdd3]">
              <WalletCards className="h-5 w-5" />
            </span>
          </div>
          <p className="mt-2 text-sm font-bold text-slate-300">
            {expenses.length} gasto{expenses.length === 1 ? '' : 's'} cadastrado{expenses.length === 1 ? '' : 's'} na viagem ativa.
          </p>
          <div className="mt-7 space-y-5">
            <div>
              <div className="mb-2 flex items-center justify-between text-xs font-black uppercase tracking-[0.12em] text-slate-300">
                <span>Roteiro</span>
                <span>{Math.round(itineraryProgress)}%</span>
              </div>
              <ProgressBar value={itineraryProgress} />
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between text-xs font-black uppercase tracking-[0.12em] text-slate-300">
                <span>Documentos</span>
                <span>{documentItems.length ? `${completedDocumentsCount}/${documentItems.length}` : '0/0'}</span>
              </div>
              <ProgressBar value={documentsProgress} />
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between text-xs font-black uppercase tracking-[0.12em] text-slate-300">
                <span>Checklist</span>
                <span>{Math.round(checklistProgress)}%</span>
              </div>
              <ProgressBar value={checklistProgress} />
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('expenses')}
            className="mt-7 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-white px-5 text-sm font-black text-slate-950 transition hover:bg-[#48fdd3]"
          >
            Ver gastos
            <ArrowRight className="h-4 w-4" />
          </button>
        </section>

        <section className="grid gap-5 rounded-[1.75rem] border border-[#e6ebf2] bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.07)] md:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(110px,1fr))] md:items-center xl:col-span-12">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-black ${statusClasses[tripStatus]}`}>
                {statusLabels[tripStatus]}
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-500">
                Viagem ativa
              </span>
            </div>
            <h2 className="mt-3 truncate text-2xl font-black text-slate-950">
              {activeGroup?.name ?? 'Sem viagem ativa'}
            </h2>
            <p className="mt-2 flex items-center gap-2 text-sm font-bold text-slate-500">
              <MapPin className="h-4 w-4 text-[#006b57]" />
              <span className="truncate">{tripCountries}</span>
            </p>
          </div>

          <div className="rounded-2xl bg-slate-50 px-4 py-3">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">Periodo</p>
            <p className="mt-2 text-sm font-black leading-5 text-slate-950">{tripPeriodLabel}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-3">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">Faltam</p>
            <p className="mt-2 text-lg font-black text-slate-950">{formatDaysUntil(daysUntilStart)}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-3">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">Atividades</p>
            <p className="mt-2 text-lg font-black text-slate-950">{itineraryItems.length}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-3">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">Membros</p>
            <p className="mt-2 text-lg font-black text-slate-950">{memberTotal || 1}</p>
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(330px,0.9fr)]">
        <DashboardCard
          icon={Route}
          title="Proximas atividades"
          actionLabel="Ver roteiro"
          onAction={() => onNavigate('itinerary')}
        >
          {activityHighlights.length ? (
            <div>
              {activityHighlights.map((item, index) => (
                <div key={item.id} className="grid grid-cols-[auto_minmax(0,1fr)] gap-4 border-b border-slate-100 py-4 last:border-b-0">
                  <div className="flex flex-col items-center">
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-[#eef8f5] text-sm font-black text-[#006b57]">
                      {index + 1}
                    </span>
                    {index < activityHighlights.length - 1 ? <span className="mt-2 h-full w-px bg-slate-100" /> : null}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-slate-400">
                      <span>{getItemDateLabel(item, activeGroup)}</span>
                      {item.time ? <span>{item.time}</span> : null}
                    </div>
                    <p className="mt-1 truncate text-base font-black text-slate-950">{item.title}</p>
                    <p className="mt-1 flex items-center gap-2 text-sm font-bold text-slate-500">
                      <MapPin className="h-4 w-4 text-[#006b57]" />
                      <span className="truncate">{getLocationLabel(item)}</span>
                    </p>
                  </div>
                </div>
              ))}
              {!pendingItineraryItems.length ? (
                <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
                  Todos os itens do roteiro estao marcados como concluidos.
                </p>
              ) : null}
            </div>
          ) : (
            <EmptyState
              title="Roteiro ainda vazio"
              description="Gere um roteiro com IA ou adicione atividades manualmente para acompanhar os proximos passos."
            />
          )}
        </DashboardCard>

        <DashboardCard
          icon={Gauge}
          title="Status da viagem"
          actionLabel="Ver viagem"
          onAction={() => onNavigateToProfilePath('/perfil/viagem')}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <CircularProgress
              value={itineraryProgress}
              label="Roteiro"
              detail={`${completedItineraryCount} de ${itineraryItems.length} atividades`}
            />
            <CircularProgress
              value={documentsProgress}
              label="Documentos"
              detail={`${completedDocumentsCount} de ${documentItems.length} concluidos`}
            />
            <CircularProgress
              value={checklistProgress}
              label="Checklist"
              detail={`${completedChecklistCount} de ${checklistItems.length} itens`}
            />
            <div className="rounded-2xl bg-slate-50 px-4 py-4">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">Resumo</p>
              <p className="mt-2 text-sm font-bold leading-6 text-slate-600">{statusMessage}</p>
            </div>
          </div>
        </DashboardCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <DashboardCard
          icon={FileText}
          title="Documentos pendentes"
          actionLabel="Ver documentos"
          onAction={() => onNavigateToProfilePath('/perfil/checklist')}
        >
          {documentItems.length ? (
            <div className="space-y-4">
              <div>
                <div className="mb-2 flex items-center justify-between text-xs font-black uppercase tracking-[0.12em] text-slate-400">
                  <span>{completedDocumentsCount} de {documentItems.length} concluidos</span>
                  <span>{Math.round(documentsProgress)}%</span>
                </div>
                <ProgressBar value={documentsProgress} tone="slate" />
              </div>
              {pendingDocuments.slice(0, 3).map((item) => (
                <ItemRow key={item.id} title={item.title} meta={item.notes ?? `${item.quantity} item(ns)`} status="Pendente" />
              ))}
              {!pendingDocuments.length ? (
                <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
                  Documentos do checklist concluidos.
                </p>
              ) : null}
            </div>
          ) : (
            <EmptyState
              title="Nenhum documento adicionado ainda"
              description="Use a categoria Documentos no checklist para acompanhar passaporte, reservas e comprovantes."
            />
          )}
        </DashboardCard>

        <DashboardCard
          icon={ClipboardCheck}
          title="Checklist"
          actionLabel="Abrir checklist"
          onAction={() => onNavigateToProfilePath('/perfil/checklist')}
        >
          {checklistItems.length ? (
            <div className="space-y-4">
              <div>
                <div className="mb-2 flex items-center justify-between text-xs font-black uppercase tracking-[0.12em] text-slate-400">
                  <span>{completedChecklistCount} de {checklistItems.length} concluidos</span>
                  <span>{Math.round(checklistProgress)}%</span>
                </div>
                <ProgressBar value={checklistProgress} tone="slate" />
              </div>
              {pendingChecklist.slice(0, 3).map((item) => (
                <ItemRow key={item.id} title={item.title} meta={`${item.category} - ${item.quantity} item(ns)`} status="Pendente" />
              ))}
              {!pendingChecklist.length ? (
                <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
                  Checklist concluido para esta viagem.
                </p>
              ) : null}
            </div>
          ) : (
            <EmptyState
              title="Checklist ainda vazio"
              description="Adicione itens essenciais para preparar a mala, documentos e cuidados antes da viagem."
            />
          )}
        </DashboardCard>

        <DashboardCard
          icon={WalletCards}
          title="Gastos recentes"
          actionLabel="Ver gastos"
          onAction={() => onNavigate('expenses')}
        >
          {recentExpenses.length ? (
            <div className="space-y-4">
              <div className="rounded-2xl bg-slate-950 px-4 py-4 text-white">
                <p className="text-xs font-black uppercase tracking-[0.12em] text-teal-200">Total estimado</p>
                <p className="mt-2 text-2xl font-black">{formatRange(grandTotal.real, 'BRL', true)}</p>
                <p className="mt-1 text-xs font-bold text-slate-300">{expenses.length} gasto{expenses.length === 1 ? '' : 's'} cadastrado{expenses.length === 1 ? '' : 's'}</p>
              </div>
              {recentExpenses.slice(0, 4).map((expense) => (
                <ItemRow
                  key={expense.id}
                  title={expense.title}
                  meta={`${getCategoryLabel(categories, expense.category)} - ${countryLabel(expense.country)} - ${formatRange(getExpenseOriginalRange(expense), getExpenseCurrency(expense), true)}`}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title="Nenhum gasto registrado"
              description="Cadastre passagens, hospedagem e reservas para acompanhar o orcamento da viagem."
            />
          )}
        </DashboardCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <DashboardCard
          icon={UsersRound}
          title="Membros do grupo"
          actionLabel="Ver perfil"
          onAction={() => onNavigateToProfilePath('/perfil/viagem')}
        >
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {members.length ? (
                members.slice(0, 6).map((member) => (
                  <span
                    key={member.id}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-slate-950 text-sm font-black text-white"
                    title={member.role === 'owner' ? 'Owner' : 'Member'}
                  >
                    {getMemberInitial(member)}
                  </span>
                ))
              ) : (
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-slate-950 text-sm font-black text-white">
                  {firstName.slice(0, 1).toUpperCase()}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-2xl font-black text-slate-950">{memberTotal || 1}</p>
                <p className="mt-1 text-xs font-black uppercase tracking-[0.12em] text-slate-400">Participantes</p>
              </div>
              <div>
                <p className="text-2xl font-black text-slate-950">{ownerCount || 1}</p>
                <p className="mt-1 text-xs font-black uppercase tracking-[0.12em] text-slate-400">Responsavel</p>
              </div>
            </div>
          </div>
        </DashboardCard>

        <DashboardCard
          icon={CalendarDays}
          title="Resumo da viagem"
          actionLabel="Continuar planejamento"
          onAction={() => handleTarget(nextAction.target)}
        >
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">Duracao</p>
              <p className="mt-2 text-xl font-black text-slate-950">{tripDayCount ? `${tripDayCount} dias` : 'A definir'}</p>
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">Dias restantes</p>
              <p className="mt-2 text-xl font-black text-slate-950">{formatDaysUntil(daysUntilStart)}</p>
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">Atividades</p>
              <p className="mt-2 text-xl font-black text-slate-950">{itineraryItems.length}</p>
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">Total</p>
              <p className="mt-2 text-xl font-black text-slate-950">{formatRange(grandTotal.real, 'BRL', true)}</p>
            </div>
          </div>
        </DashboardCard>
      </div>

      <ConversionToggle mode={realValueMode} quote={exchangeRates.EUR ?? null} onChange={onValueModeChange} />

      <SummaryCards
        categories={categories}
        totalsByCategory={totalsByCategory}
        grandTotal={grandTotal}
        realValueMode={realValueMode}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <ExpenseChart categories={categories} totalsByCategory={totalsByCategory} />

        <div className="space-y-6 xl:sticky xl:top-28 xl:self-start">
          <motion.section
            className="rounded-[2rem] border border-slate-950 bg-slate-950 p-6 text-white shadow-2xl shadow-slate-950/20"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-teal-200">Fechamento</p>
            <h2 className="mt-3 text-3xl font-black">Total da viagem</h2>
            <div className="mt-6 space-y-4">
              <AnimatePresence mode="wait">
                <motion.div
                  key={`${realValueMode}-${grandTotal.euro.min}-${grandTotal.real.min}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.22 }}
                  className="space-y-4"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-400">Convertido em real</p>
                    <p className="text-3xl font-black">{formatRange(grandTotal.real, 'BRL', true)}</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-400">Valores originais</p>
                    <p className="text-3xl font-black">{formatOriginalCurrencyBreakdown(grandTotal.originalByCurrency)}</p>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
            {canUseEuropeDefaults ? (
              <button
                type="button"
                onClick={onResetExpenses}
                className="mt-7 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white px-5 font-bold text-slate-950 transition hover:bg-teal-100 focus:outline-none focus:ring-4 focus:ring-teal-300"
              >
                <RefreshCw className="h-5 w-5" />
                Restaurar dados iniciais
              </button>
            ) : null}
          </motion.section>

          <QuoteStatusCard
            rate={exchangeRates.EUR ?? null}
            isLoading={isQuoteLoading}
            warning={quoteWarning}
            onRefresh={onRefreshQuote}
            compact
          />
        </div>
      </div>

      {isPlanningLoading ? (
        <div className="fixed bottom-5 right-5 z-20 inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white shadow-2xl shadow-slate-900/25">
          <Loader2 className="h-4 w-4 animate-spin" />
          Atualizando dashboard
        </div>
      ) : null}
    </motion.div>
  );
}
