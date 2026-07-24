import { motion } from 'framer-motion';
import {
  ArrowRight,
  Clock3,
  Edit3,
  FileWarning,
  Loader2,
  MapPin,
  Plane,
  PlaneTakeoff,
  Plus,
  UserPlus,
  WalletCards,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import type { AppView } from './Navbar';
import { useAuth } from '../contexts/AuthContext';
import { useGroup } from '../contexts/GroupContext';
import { countryLabel } from '../data/countries';
import { getCachedItineraryItems, getItineraryItems } from '../services/itineraryService';
import { getTripChecklistItems } from '../services/checklistService';
import { getGroupMembers as getGroupMembersWithProfiles } from '../services/profileService';
import type {
  CategoryMeta,
  CurrencyRange,
  Expense,
  GroupMemberProfile,
  ItineraryItem,
  TripChecklistItem,
  UserTravelGroup,
} from '../types';
import {
  formatRange,
  getExpenseRealRange,
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
  categories: CategoryMeta[];
  expenseStatusMessage?: string | null;
  expenses: Expense[];
  grandTotal: Totals;
  onAddExpense: () => void;
  onNavigate: (view: AppView) => void;
  onNavigateToProfilePath: (path: string) => void;
  totalsByCategory: Record<string, Totals>;
};

type NextAction = {
  cta: string;
  description: string;
  target: NextActionTarget;
};

const dashboardHeroImage =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuB1_s6-IXeqdQenr-iqRsq_Ema-qtKVzaxTrM4pZwFj7bUWrvNEpFB5_e9z6LicJ5Rb4dt2GuO9isUOY-usBaHtvXVUbeoGJveWj37td0C6SW8PzOmBmM-5YwOO3HwPoFsJEORL9cBjU2n6RoWF79d1nGgHZmkxoiCXUZ5hmNBYueSVyqbhkYCfjIw3SxeFZRHQo4wcyy6inD37y-jBUspou5r1q0tkJNBQUfwfglmzzprU_YeR1ldc8oyR6NNRcBqnhgePVdRDu3nY';

const emptyRange = (): CurrencyRange => ({ min: 0, max: 0 });

const normalizeSearchText = (value?: string) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const formatDate = (value?: string) => {
  if (!value) return 'Sem data';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
};

const formatTripPeriod = (startDate?: string, endDate?: string) => {
  if (!startDate && !endDate) return 'Periodo a definir';
  if (!startDate || !endDate) return `${formatDate(startDate)} - ${formatDate(endDate)}`;

  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return `${formatDate(startDate)} - ${formatDate(endDate)}`;
  }

  const startLabel = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(start);
  const endLabel = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(end);
  return `${startLabel} - ${endLabel}`;
};

const formatExpenseDate = (value?: string) => {
  if (!value) return 'Recente';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recente';
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

  return `${item.day} - ${formatDate(start.toISOString().slice(0, 10))}`;
};

const getLocationLabel = (item: ItineraryItem) => {
  const parts = [item.city, countryLabel(item.country)].filter(Boolean);
  return parts.length ? parts.join(', ') : 'Local a definir';
};

const getCategoryLabel = (categories: CategoryMeta[], categoryId: string) =>
  categories.find((category) => category.id === categoryId)?.name ?? categoryId;

const isDocumentChecklistItem = (item: TripChecklistItem) => {
  const searchable = normalizeSearchText(`${item.category} ${item.title} ${item.notes ?? ''}`);
  return /document|passaporte|visto|reserva|comprovante|voucher|seguro/.test(searchable);
};

const addRange = (left: CurrencyRange, right?: CurrencyRange): CurrencyRange => ({
  min: left.min + Number(right?.min ?? 0),
  max: left.max + Number(right?.max ?? right?.min ?? 0),
});

const subtractRange = (left: CurrencyRange, right: CurrencyRange): CurrencyRange => ({
  min: Math.max(0, left.min - right.min),
  max: Math.max(0, left.max - right.max),
});

const rangeMidpoint = (range: CurrencyRange) => (Number(range.min) + Number(range.max || range.min)) / 2;

const percentFromRange = (part: CurrencyRange, total: CurrencyRange) => {
  const totalMid = rangeMidpoint(total);
  if (totalMid <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((rangeMidpoint(part) / totalMid) * 100)));
};

const getMemberName = (member: GroupMemberProfile, index: number) =>
  member.profile?.fullName ?? member.profile?.email ?? `Membro ${index + 1}`;

const getInitials = (value: string) => {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? `${parts[0][0]}${parts.at(-1)?.[0] ?? ''}` : value.slice(0, 2);
  return letters.toUpperCase();
};

const roleLabel = (role: string) => (role === 'owner' ? 'Proprietario' : 'Editor');

const getDisplayName = (userEmail?: string, fullName?: string, metadataName?: string) =>
  fullName || metadataName || userEmail || 'viajante';

const getFirstName = (displayName: string) => displayName.trim().split(/\s+/)[0] || 'viajante';

function BottomCard({
  action,
  children,
  icon: Icon,
  title,
}: {
  action?: ReactNode;
  children: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  title: string;
}) {
  return (
    <section className="relative min-h-[360px] min-w-0 rounded-xl border border-[#e0e5ee] bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.055)] dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/30 sm:p-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h2 className="text-xl font-bold leading-tight text-[#070d1f] dark:text-slate-50">{title}</h2>
        {action ?? (Icon ? <Icon className="h-6 w-6 text-[#171a26] dark:text-slate-200" /> : null)}
      </div>
      {children}
    </section>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-[14px] border border-dashed border-[#d8e0ec] bg-[#f7f9fe] px-4 py-5 dark:border-slate-600 dark:bg-slate-800/75">
      <p className="text-sm font-black text-[#0b1326] dark:text-slate-50">{title}</p>
      <p className="mt-1 text-sm font-medium leading-6 text-[#6b7285] dark:text-slate-300">{description}</p>
    </div>
  );
}

function CostProgress({
  label,
  range,
  percent,
  tone = 'teal',
}: {
  label: string;
  range: CurrencyRange;
  percent: number;
  tone?: 'teal' | 'light';
}) {
  return (
    <div>
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <span className="text-base font-medium text-[#9ca7bd]">{label}</span>
        <span className="text-sm font-semibold leading-tight text-white sm:text-right sm:text-base">
          {formatRange(range, 'BRL', true)}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[#263247]">
        <div
          className={`h-full rounded-full ${tone === 'teal' ? 'bg-[#56f5d0]' : 'bg-[#e7eef8]'}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function PreparationRing({ detail, value }: { detail: string; value: number }) {
  const roundedValue = Math.max(0, Math.min(100, Math.round(value)));

  return (
    <div
      className="grid h-[4.6rem] w-[4.6rem] shrink-0 place-items-center rounded-full"
      style={{ background: `conic-gradient(#10b981 ${roundedValue * 3.6}deg, #334155 0deg)` }}
    >
      <div className="grid h-[3.55rem] w-[3.55rem] place-items-center rounded-full bg-white text-xl font-black text-[#0b1326] dark:bg-slate-900 dark:text-slate-50">
        {detail}
      </div>
    </div>
  );
}

function PreparationStatusCard({
  checklistProgress,
  completedDocumentsCount,
  documentItemsCount,
  documentsProgress,
  onOpenChecklist,
  pendingPreparationCount,
  pendingPreparationItems,
  travelReadiness,
}: {
  checklistProgress: number;
  completedDocumentsCount: number;
  documentItemsCount: number;
  documentsProgress: number;
  onOpenChecklist: () => void;
  pendingPreparationCount: number;
  pendingPreparationItems: TripChecklistItem[];
  travelReadiness: number;
}) {
  const readinessPercent = Math.max(0, Math.min(100, Math.round(travelReadiness)));
  const criticalCount = Math.min(3, pendingPreparationCount);
  const criticalText = pendingPreparationCount
    ? `${criticalCount} ${criticalCount === 1 ? 'item crítico' : 'itens críticos'} para concluir nesta semana`
    : 'Nenhuma pendência crítica para esta semana';

  return (
    <section className="relative min-h-[360px] rounded-xl border border-[#e0e5ee] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.07)] md:p-6 dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/30">
      <div className="flex items-center gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#ddf5ef] text-[#00816d] dark:bg-emerald-500/15 dark:text-emerald-300">
          <WalletCards className="h-6 w-6" />
        </span>
        <div className="min-w-0">
          <h2 className="text-xl font-black leading-tight text-[#070d1f] dark:text-slate-50">Status dos Preparativos</h2>
          <p className="mt-1 text-sm font-medium leading-5 text-[#667085] dark:text-slate-300">Acompanhe o andamento antes da viagem</p>
        </div>
      </div>

      <div className="my-5 h-px bg-[#e0e5ee] dark:bg-slate-700" />

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex items-center gap-4">
          <PreparationRing detail={`${Math.round(checklistProgress)}%`} value={checklistProgress} />
          <div>
            <p className="text-lg font-black text-[#0b1326] dark:text-slate-50">Checklist</p>
            <p className="text-sm font-medium text-[#667085] dark:text-slate-300">de conclusão</p>
          </div>
        </div>
        <div className="flex items-center gap-4 border-[#dfe5ee] sm:border-l sm:pl-5 dark:border-slate-700">
          <PreparationRing
            detail={`${completedDocumentsCount}/${documentItemsCount}`}
            value={documentsProgress}
          />
          <div>
            <p className="text-lg font-black text-[#0b1326] dark:text-slate-50">Docs</p>
            <p className="text-sm font-medium text-[#667085] dark:text-slate-300">documentos prontos</p>
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-xl bg-gradient-to-r from-[#eef9f5] to-[#f5faf8] p-4 dark:from-emerald-500/15 dark:to-teal-500/10">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-[#00816d] shadow-sm dark:bg-slate-950 dark:text-emerald-300">
              <Plane className="h-5 w-5" />
            </span>
            <p className="truncate text-base font-black text-[#0b1326] dark:text-slate-50">Pronto para viajar</p>
          </div>
          <span className="text-base font-black text-[#00816d] dark:text-emerald-300">{readinessPercent}%</span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#e0e7ef] dark:bg-slate-700">
          <div className="h-full rounded-full bg-[#00816d] dark:bg-emerald-400" style={{ width: `${readinessPercent}%` }} />
        </div>
      </div>

      <div className="mt-4 rounded-xl bg-gradient-to-r from-[#fff1f1] to-[#fff8f6] p-4 dark:from-rose-500/15 dark:to-amber-500/10">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-white text-[#dc2626] shadow-sm dark:bg-slate-950 dark:text-rose-300">
              <FileWarning className="h-5 w-5" />
            </span>
            <p className="text-base font-black text-[#0b1326] dark:text-slate-50">Pendências</p>
          </div>
          <span className="rounded-lg bg-[#ffe0e0] px-3 py-1 text-base font-black text-[#dc2626] dark:bg-rose-400/15 dark:text-rose-200">
            {pendingPreparationCount}
          </span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {pendingPreparationItems.length ? (
            pendingPreparationItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={onOpenChecklist}
                className="inline-flex min-h-9 max-w-full items-center gap-2 rounded-[7px] border border-[#cfd8e7] bg-white px-3 py-1.5 text-sm font-medium text-[#2c3242] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              >
                <FileWarning className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.title || item.category}</span>
              </button>
            ))
          ) : (
            <span className="inline-flex min-h-9 items-center rounded-[7px] border border-[#cfd8e7] bg-white px-3 py-1.5 text-sm font-medium text-[#2c3242] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">
              Tudo em dia
            </span>
          )}
        </div>
        <div className="mt-4 border-t border-[#ead6d6] pt-3 text-sm font-medium text-[#667085] dark:border-slate-700 dark:text-slate-300">
          {criticalText}
        </div>
      </div>

      <div className="mt-5 flex justify-end">
        <button
          type="button"
          onClick={onOpenChecklist}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#00816d] px-5 text-sm font-black text-white shadow-[0_12px_24px_rgba(0,129,109,0.22)] transition hover:bg-[#006b57] dark:bg-emerald-400 dark:text-emerald-950 dark:hover:bg-emerald-300"
        >
          Ver checklist
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}

export function NextActionDashboard({
  activeGroup,
  categories,
  expenseStatusMessage,
  expenses,
  grandTotal,
  onAddExpense,
  onNavigate,
  onNavigateToProfilePath,
  totalsByCategory,
}: NextActionDashboardProps) {
  const { user } = useAuth();
  const { setActiveGroup, userGroups } = useGroup();
  const [itineraryItems, setItineraryItems] = useState<ItineraryItem[]>(() => getCachedItineraryItems(activeGroup?.id));
  const [checklistItems, setChecklistItems] = useState<TripChecklistItem[]>([]);
  const [members, setMembers] = useState<GroupMemberProfile[]>([]);
  const [isPlanningLoading, setIsPlanningLoading] = useState(false);
  const [planningWarning, setPlanningWarning] = useState<string | null>(null);

  useEffect(() => {
    if (!activeGroup?.id) {
      setItineraryItems([]);
      setChecklistItems([]);
      setMembers([]);
      return undefined;
    }

    let active = true;

    const loadPlanningData = async () => {
      setIsPlanningLoading(true);
      try {
        const [nextItineraryItems, nextChecklistItems, nextMembers] = await Promise.all([
          getItineraryItems(activeGroup.id),
          getTripChecklistItems(activeGroup.id),
          getGroupMembersWithProfiles(activeGroup.id),
        ]);

        if (active) {
          setItineraryItems(nextItineraryItems);
          setChecklistItems(nextChecklistItems);
          setMembers(nextMembers);
          setPlanningWarning(null);
        }
      } catch {
        if (active) {
          setItineraryItems(getCachedItineraryItems(activeGroup.id));
          setPlanningWarning('Nao foi possivel atualizar todos os dados do dashboard agora.');
        }
      } finally {
        if (active) setIsPlanningLoading(false);
      }
    };

    setItineraryItems(getCachedItineraryItems(activeGroup.id));
    setChecklistItems([]);
    setMembers([]);
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
  const travelReadiness = Math.round((itineraryProgress + checklistProgress + documentsProgress) / 3);
  const recentExpenses = useMemo(() => [...expenses].slice(-3).reverse(), [expenses]);
  const tripDayCount = getTripDayCount(activeGroup?.startDate, activeGroup?.endDate);
  const tripCountries = activeGroup?.countries?.length
    ? activeGroup.countries.map((country) => countryLabel(country)).join(', ')
    : 'Paises a definir';
  const userDisplayName = getDisplayName(
    user?.email,
    user?.user_metadata?.full_name as string | undefined,
    user?.user_metadata?.name as string | undefined,
  );
  const firstName = getFirstName(userDisplayName);
  const primaryCostCategoryIds = categories
    .filter((category) => {
      const text = normalizeSearchText(`${category.id} ${category.name} ${category.label}`);
      return /voo|passagem|hotel|hosped|transport|transfer|flight|lodg/.test(text);
    })
    .map((category) => category.id);
  const primaryCostRange = primaryCostCategoryIds.reduce(
    (total, id) => addRange(total, totalsByCategory[id]?.real),
    emptyRange(),
  );
  const secondaryCostRange = subtractRange(grandTotal.real, primaryCostRange);
  const pendingPreparationItems = [...pendingDocuments, ...pendingChecklist].slice(0, 4);
  const pendingPreparationCount = pendingDocuments.length + pendingChecklist.length;

  const nextAction = useMemo<NextAction>(() => {
    if (!activeGroup) {
      return {
        cta: 'Criar viagem',
        description: 'Crie sua primeira viagem para organizar roteiro, gastos e documentos.',
        target: 'create-trip',
      };
    }

    if (!itineraryItems.length) {
      return {
        cta: 'Gerar roteiro com IA',
        description: 'O roteiro ainda nao foi criado para esta viagem.',
        target: 'generate-ai',
      };
    }

    if (pendingDocuments.length) {
      return {
        cta: 'Finalizar documentação',
        description: `${pendingDocuments.length} documento${pendingDocuments.length === 1 ? '' : 's'} pendente${pendingDocuments.length === 1 ? '' : 's'}.`,
        target: 'documents',
      };
    }

    if (pendingChecklist.length) {
      return {
        cta: 'Abrir checklist',
        description: `${pendingChecklist.length} item${pendingChecklist.length === 1 ? '' : 's'} do checklist em aberto.`,
        target: 'checklist',
      };
    }

    if (nextPendingActivity) {
      return {
        cta: 'Ver roteiro',
        description: `${nextPendingActivity.title} - ${getItemDateLabel(nextPendingActivity, activeGroup)}.`,
        target: 'itinerary',
      };
    }

    if (recentExpenses.length) {
      return {
        cta: 'Revisar gastos',
        description: 'Confira os ultimos gastos cadastrados na viagem.',
        target: 'expenses',
      };
    }

    return {
      cta: 'Ver viagem',
      description: 'Seu planejamento principal esta organizado.',
      target: 'trip',
    };
  }, [
    activeGroup,
    itineraryItems.length,
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

  const planningStatusMessage = isPlanningLoading
    ? 'Atualizando dashboard...'
    : planningWarning ?? expenseStatusMessage;

  return (
    <motion.div
      key="dashboard"
      className="w-full max-w-full space-y-6 overflow-x-hidden"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
    >
      <header className="pt-1">
        <h1 className="text-[2.1rem] font-black leading-tight text-[#0b1326] md:text-[2.55rem] dark:text-slate-50">
          Olá, {firstName}
        </h1>
        <p className="mt-2 max-w-3xl text-base font-medium leading-7 text-[#202431] md:text-lg dark:text-slate-300">
          {activeGroup
            ? `Bem-vindo de volta. Seu roteiro para ${tripCountries} está ${Math.round(travelReadiness)}% concluído.`
            : 'Bem-vindo de volta. Crie sua primeira viagem para começar o planejamento.'}
        </p>
        {planningStatusMessage ? (
          <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#667085] shadow-sm dark:border dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            {isPlanningLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {planningStatusMessage}
          </p>
        ) : null}
      </header>

      <section className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,480px)]">
        <article className="relative min-h-[16rem] overflow-hidden rounded-xl bg-[#101827] shadow-[0_14px_34px_rgba(15,23,42,0.13)] md:min-h-[19rem]">
          <img src={dashboardHeroImage} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-black/28" />
          <div className="relative flex min-h-[16rem] flex-col justify-center p-5 md:min-h-[19rem] md:p-8">
            <span className="mb-4 inline-flex w-fit items-center rounded-full bg-[#56f5d0] px-4 py-2 text-sm font-black uppercase text-[#05352f] md:mb-5">
              Próxima ação
            </span>
            <div className="max-w-2xl">
              <h2 className="max-w-full text-3xl font-black leading-[1.08] text-white sm:text-[2.55rem] md:text-[3rem]">
                Continue seu
                <br />
                planejamento
              </h2>
              <button
                type="button"
                onClick={() => handleTarget(nextAction.target)}
                className="mt-5 inline-flex min-h-12 w-full max-w-sm min-w-0 items-center justify-center rounded-lg bg-black px-5 py-3 text-center text-sm font-black leading-tight text-white shadow-[0_12px_24px_rgba(0,0,0,0.2)] transition hover:bg-[#111827] dark:bg-emerald-400 dark:text-emerald-950 dark:hover:bg-emerald-300 sm:w-auto sm:min-w-64 sm:px-8 sm:text-base"
              >
                {nextAction.cta}
              </button>
            </div>
          </div>
        </article>

        <article className="min-h-[16rem] min-w-0 rounded-xl bg-[#121b2d] p-5 text-white shadow-[0_14px_34px_rgba(15,23,42,0.15)] md:min-h-[19rem] md:p-8">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-base font-medium uppercase text-[#8c96ab]">Custo estimado</p>
              <h2 className="mt-3 break-words text-[clamp(1.45rem,7vw,2.2rem)] font-black leading-tight text-white md:whitespace-nowrap">
                {formatRange(grandTotal.real, 'BRL', true)}
              </h2>
            </div>
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-[12px] text-[#56f5d0]">
              <WalletCards className="h-8 w-8" />
            </span>
          </div>

          <div className="mt-10 space-y-6">
            <CostProgress
              label="Voo & Hospedagem"
              range={primaryCostRange}
              percent={percentFromRange(primaryCostRange, grandTotal.real)}
            />
            <CostProgress
              label="Alimentação & Outros"
              range={secondaryCostRange}
              percent={percentFromRange(secondaryCostRange, grandTotal.real)}
              tone="light"
            />
          </div>
        </article>
      </section>

      <section className="grid min-w-0 items-center gap-5 rounded-xl border border-[#dfe5ee] bg-white p-4 shadow-[0_10px_26px_rgba(15,23,42,0.05)] lg:grid-cols-[auto_minmax(0,1fr)_170px_140px_auto] lg:p-6 dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/30">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-[#dbe8ff] text-[#0b1326] dark:bg-sky-400/15 dark:text-sky-200 sm:h-16 sm:w-16">
          <PlaneTakeoff className="h-6 w-6 sm:h-8 sm:w-8" />
        </span>
        <div className="min-w-0">
          {userGroups.length > 1 && activeGroup ? (
            <select
              value={activeGroup.id}
              onChange={(event) => {
                const group = userGroups.find((item) => item.id === event.target.value);
                if (group) setActiveGroup(group);
              }}
              className="max-w-full bg-transparent text-xl font-black text-[#070d1f] outline-none dark:text-slate-50"
            >
              {userGroups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          ) : (
            <h2 className="truncate text-xl font-black text-[#070d1f] dark:text-slate-50">
              {activeGroup?.name ?? 'Sem viagem ativa'}
            </h2>
          )}
          <p className="mt-1 flex min-w-0 items-start gap-2 text-base font-medium text-[#2c3242] dark:text-slate-300">
            <MapPin className="h-4 w-4 text-[#007c68] dark:text-emerald-300" />
            <span className="min-w-0 break-words">{tripCountries}</span>
          </p>
        </div>
        <div className="border-[#e4e8f0] lg:border-l lg:pl-10 dark:border-slate-700">
          <p className="text-base font-medium uppercase text-[#2c3242] dark:text-slate-400">Período</p>
          <p className="mt-2 text-base font-medium text-[#0b1326] dark:text-slate-100">{formatTripPeriod(activeGroup?.startDate, activeGroup?.endDate)}</p>
        </div>
        <div>
          <p className="text-base font-medium uppercase text-[#2c3242] dark:text-slate-400">Duração</p>
          <p className="mt-2 text-base font-medium text-[#0b1326] dark:text-slate-100">
            {tripDayCount ? `${tripDayCount} dias` : 'A definir'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            aria-label="Editar viagem"
            onClick={() => onNavigateToProfilePath('/perfil/viagem')}
            className="inline-flex h-14 w-14 items-center justify-center rounded-xl border border-[#0b1326]/40 bg-white text-[#0b1326] transition hover:bg-[#f3f6fb] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
          >
            <Edit3 className="h-6 w-6" />
          </button>
          <button
            type="button"
            onClick={() => onNavigate('itinerary')}
            className="inline-flex min-h-12 min-w-0 items-center justify-center gap-3 rounded-xl bg-black px-5 py-3 text-center text-sm font-semibold leading-tight text-white transition hover:bg-[#111827] dark:bg-emerald-400 dark:text-emerald-950 dark:hover:bg-emerald-300 sm:min-h-14 sm:px-7 sm:text-base"
          >
            Ver Roteiro
            <ArrowRight className="h-5 w-5" />
          </button>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <BottomCard title="Próximas Atividades" icon={Clock3}>
          {activityHighlights.length ? (
            <div className="space-y-0">
              {activityHighlights.slice(0, 3).map((item, index) => (
                <div key={item.id} className="grid grid-cols-[24px_minmax(0,1fr)] gap-4">
                  <div className="flex flex-col items-center">
                    <span className={`mt-1 h-4 w-4 rounded-full ${index === 0 ? 'bg-[#007c68] dark:bg-emerald-400' : 'bg-[#dce8ff] dark:bg-slate-600'}`} />
                    {index < Math.min(activityHighlights.length, 3) - 1 ? (
                      <span className="h-14 w-px bg-[#dfe5ee] dark:bg-slate-700" />
                    ) : null}
                  </div>
                  <div className="pb-7">
                    <p className="text-base font-medium leading-6 text-[#1f2430] dark:text-slate-100">{item.title}</p>
                    <p className="mt-1 text-sm font-medium leading-5 text-[#2c3242] dark:text-slate-300">
                      {getLocationLabel(item)} {item.time ? `• ${item.time}` : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Roteiro ainda vazio"
              description="Gere um roteiro com IA ou adicione atividades para acompanhar os próximos passos."
            />
          )}
        </BottomCard>

        <PreparationStatusCard
          checklistProgress={checklistProgress}
          completedDocumentsCount={completedDocumentsCount}
          documentItemsCount={documentItems.length}
          documentsProgress={documentsProgress}
          onOpenChecklist={() => onNavigateToProfilePath('/perfil/checklist')}
          pendingPreparationCount={pendingPreparationCount}
          pendingPreparationItems={pendingPreparationItems}
          travelReadiness={travelReadiness}
        />

        <BottomCard
          title="Membros do Grupo"
          action={
            <button
              type="button"
              aria-label="Convidar membro"
              onClick={() => onNavigateToProfilePath('/perfil/viagem')}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#c6cedc] text-[#171a26] dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <UserPlus className="h-6 w-6" />
            </button>
          }
        >
          <div className="space-y-4">
            {members.length ? (
              members.slice(0, 3).map((member, index) => {
                const name = getMemberName(member, index);
                return (
                  <div key={member.id} className="flex items-center gap-3">
                    {member.profile?.avatarUrl ? (
                      <img src={member.profile.avatarUrl} alt="" className="h-11 w-11 rounded-full object-cover" />
                    ) : (
                      <span className="grid h-11 w-11 place-items-center rounded-full bg-[#dce8ff] text-base font-semibold text-[#7a879d] dark:bg-slate-800 dark:text-slate-300">
                        {getInitials(name)}
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-base font-medium text-[#1f2430] dark:text-slate-100">{name}</p>
                      <p className="text-sm font-medium text-[#007c68] dark:text-emerald-300">{roleLabel(member.role)}</p>
                    </div>
                  </div>
                );
              })
            ) : (
              <EmptyState title="Nenhum membro listado" description="Os membros aparecem aqui quando o grupo é carregado." />
            )}
          </div>
          <button
            type="button"
            onClick={() => onNavigateToProfilePath('/perfil/viagem')}
            className="mt-7 inline-flex h-10 w-full items-center justify-center rounded-lg border border-[#c6cedc] bg-white text-sm font-semibold text-[#0b1326] transition hover:bg-[#f3f6fb] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
          >
            Convidar Membro
          </button>
        </BottomCard>

        <BottomCard
          title="Gastos Recentes"
          action={
            <a
              href="/#expenses"
              onClick={(event) => {
                event.preventDefault();
                onNavigate('expenses');
              }}
              className="whitespace-nowrap text-base font-medium text-[#006b57] dark:text-emerald-300"
            >
              Ver tudo
            </a>
          }
        >
          <div className="space-y-4">
            {recentExpenses.length ? (
              recentExpenses.slice(0, 3).map((expense) => (
                <div key={expense.id} className="grid grid-cols-[40px_minmax(0,1fr)] items-start gap-3 sm:grid-cols-[44px_minmax(0,1fr)_auto] sm:items-center">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-[#dce8ff] text-[#0b1326] dark:bg-slate-800 dark:text-slate-100 sm:h-11 sm:w-11">
                    <Plane className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-base font-medium text-[#1f2430] dark:text-slate-100">{expense.title}</p>
                    <p className="text-sm font-medium text-[#2c3242] dark:text-slate-300">
                      {getCategoryLabel(categories, expense.category)} • {countryLabel(expense.country)}
                    </p>
                    <p className="text-xs font-medium text-[#6b7285] dark:text-slate-400">{formatExpenseDate(expense.createdAt)}</p>
                  </div>
                  <p className="col-start-2 min-w-0 break-words text-left text-base font-medium leading-tight text-[#1f2430] dark:text-slate-100 sm:col-auto sm:text-right">
                    {formatRange(getExpenseRealRange(expense), 'BRL', true)}
                  </p>
                </div>
              ))
            ) : (
              <EmptyState
                title="Nenhum gasto registrado"
                description="Cadastre passagens, hospedagem e reservas para acompanhar o orçamento."
              />
            )}
          </div>
          <div className="mt-7 border-t border-[#e2e7f0] pt-4 pr-14 dark:border-slate-700 sm:pr-16">
            <p className="text-xs font-medium uppercase text-[#2c3242] dark:text-slate-400">Total gasto até agora</p>
            <p className="mt-2 break-words text-[1.35rem] font-black leading-tight text-[#0b1326] dark:text-slate-50 sm:text-2xl">{formatRange(grandTotal.real, 'BRL', true)}</p>
          </div>
          <button
            type="button"
            onClick={onAddExpense}
            className="absolute bottom-4 right-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-black text-white shadow-[0_18px_36px_rgba(15,23,42,0.2)] transition hover:bg-[#111827] dark:bg-emerald-400 dark:text-emerald-950 dark:hover:bg-emerald-300 sm:bottom-7 sm:h-14 sm:w-14"
          >
            <Plus className="h-7 w-7" />
          </button>
        </BottomCard>
      </section>

      {planningWarning ? (
        <p className="text-sm font-medium text-[#667085] dark:text-slate-300">{planningWarning}</p>
      ) : null}
    </motion.div>
  );
}
