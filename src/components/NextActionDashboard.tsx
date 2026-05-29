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
    <section className="relative min-h-[420px] rounded-[18px] border border-[#e0e5ee] bg-white p-7 shadow-[0_12px_36px_rgba(15,23,42,0.06)]">
      <div className="mb-8 flex items-center justify-between gap-4">
        <h2 className="text-[1.55rem] font-black leading-tight text-[#070d1f]">{title}</h2>
        {action ?? (Icon ? <Icon className="h-7 w-7 text-[#171a26]" /> : null)}
      </div>
      {children}
    </section>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-[14px] border border-dashed border-[#d8e0ec] bg-[#f7f9fe] px-4 py-5">
      <p className="text-sm font-black text-[#0b1326]">{title}</p>
      <p className="mt-1 text-sm font-medium leading-6 text-[#6b7285]">{description}</p>
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
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-xl font-medium text-[#9ca7bd]">{label}</span>
        <span className="text-xl font-semibold text-white">{formatRange(range, 'BRL', true)}</span>
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

function CircularMetric({ label, value, detail }: { label: string; value: number; detail: string }) {
  const roundedValue = Math.max(0, Math.min(100, Math.round(value)));

  return (
    <div className="flex flex-col items-center text-center">
      <div
        className="grid h-24 w-24 place-items-center rounded-full"
        style={{ background: `conic-gradient(#007c68 ${roundedValue * 3.6}deg, #e7edf6 0deg)` }}
      >
        <div className="grid h-[4.7rem] w-[4.7rem] place-items-center rounded-full bg-white text-2xl font-semibold text-[#0b1326]">
          {detail}
        </div>
      </div>
      <p className="mt-4 text-xl font-medium text-[#2c3242]">{label}</p>
    </div>
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
  const pendingPreparationItems = [...pendingDocuments, ...pendingChecklist].slice(0, 3);
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
      className="space-y-8"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
    >
      <header className="pt-2">
        <h1 className="text-[2.6rem] font-black leading-tight text-[#0b1326] md:text-[3.15rem]">
          Olá, {firstName}
        </h1>
        <p className="mt-3 max-w-3xl text-xl font-medium leading-8 text-[#202431]">
          {activeGroup
            ? `Bem-vindo de volta. Seu roteiro para ${tripCountries} está ${Math.round(travelReadiness)}% concluído.`
            : 'Bem-vindo de volta. Crie sua primeira viagem para começar o planejamento.'}
        </p>
        {planningStatusMessage ? (
          <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#667085] shadow-sm">
            {isPlanningLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {planningStatusMessage}
          </p>
        ) : null}
      </header>

      <section className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_480px]">
        <article className="relative min-h-[400px] overflow-hidden rounded-[18px] bg-[#101827] shadow-[0_18px_44px_rgba(15,23,42,0.14)] md:min-h-[395px]">
          <img src={dashboardHeroImage} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-black/28" />
          <div className="relative flex min-h-[400px] flex-col justify-end p-7 md:min-h-[395px] md:p-10">
            <span className="absolute left-8 top-8 inline-flex items-center rounded-full bg-[#56f5d0] px-4 py-2 text-base font-medium uppercase text-[#006b57]">
              Próxima ação
            </span>
            <div className="max-w-2xl">
              <h2 className="text-[3.25rem] font-black leading-[1.05] text-white md:text-[4rem]">
                Continue seu planejamento
              </h2>
              <p className="mt-4 max-w-2xl text-base font-semibold leading-7 text-white/90">
                {nextAction.description}
              </p>
              <button
                type="button"
                onClick={() => handleTarget(nextAction.target)}
                className="mt-7 inline-flex h-14 min-w-72 items-center justify-center rounded-[10px] bg-black px-8 text-lg font-black text-white shadow-[0_14px_28px_rgba(0,0,0,0.22)] transition hover:bg-[#111827]"
              >
                {nextAction.cta}
              </button>
            </div>
          </div>
        </article>

        <article className="min-h-[400px] rounded-[18px] bg-[#121b2d] p-10 text-white shadow-[0_18px_44px_rgba(15,23,42,0.16)] md:min-h-[395px]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xl font-medium uppercase text-[#8c96ab]">Custo estimado</p>
              <h2 className="mt-4 text-[2.7rem] font-black leading-tight text-white">
                {formatRange(grandTotal.real, 'BRL', true)}
              </h2>
            </div>
            <span className="inline-flex h-14 w-14 items-center justify-center rounded-[12px] text-[#56f5d0]">
              <WalletCards className="h-10 w-10" />
            </span>
          </div>

          <div className="mt-12 space-y-7">
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

      <section className="grid items-center gap-6 rounded-[16px] border border-[#dfe5ee] bg-white p-7 shadow-[0_10px_30px_rgba(15,23,42,0.05)] lg:grid-cols-[auto_minmax(0,1fr)_180px_160px_auto]">
        <span className="grid h-20 w-20 place-items-center rounded-full bg-[#dbe8ff] text-[#0b1326]">
          <PlaneTakeoff className="h-10 w-10" />
        </span>
        <div className="min-w-0">
          {userGroups.length > 1 && activeGroup ? (
            <select
              value={activeGroup.id}
              onChange={(event) => {
                const group = userGroups.find((item) => item.id === event.target.value);
                if (group) setActiveGroup(group);
              }}
              className="max-w-full bg-transparent text-2xl font-black text-[#070d1f] outline-none"
            >
              {userGroups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          ) : (
            <h2 className="truncate text-2xl font-black text-[#070d1f]">
              {activeGroup?.name ?? 'Sem viagem ativa'}
            </h2>
          )}
          <p className="mt-2 flex items-center gap-2 text-xl font-medium text-[#2c3242]">
            <MapPin className="h-5 w-5 text-[#007c68]" />
            <span>{tripCountries}</span>
          </p>
        </div>
        <div className="border-[#e4e8f0] lg:border-l lg:pl-10">
          <p className="text-xl font-medium uppercase text-[#2c3242]">Período</p>
          <p className="mt-2 text-lg font-medium text-[#0b1326]">{formatTripPeriod(activeGroup?.startDate, activeGroup?.endDate)}</p>
        </div>
        <div>
          <p className="text-xl font-medium uppercase text-[#2c3242]">Duração</p>
          <p className="mt-2 text-lg font-medium text-[#0b1326]">
            {tripDayCount ? `${tripDayCount} dias` : 'A definir'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Editar viagem"
            onClick={() => onNavigateToProfilePath('/perfil/viagem')}
            className="inline-flex h-16 w-16 items-center justify-center rounded-[14px] border border-[#0b1326]/40 bg-white text-[#0b1326] transition hover:bg-[#f3f6fb]"
          >
            <Edit3 className="h-7 w-7" />
          </button>
          <button
            type="button"
            onClick={() => onNavigate('itinerary')}
            className="inline-flex h-16 items-center justify-center gap-4 rounded-[12px] bg-black px-8 text-xl font-semibold text-white transition hover:bg-[#111827]"
          >
            Ver Roteiro
            <ArrowRight className="h-6 w-6" />
          </button>
        </div>
      </section>

      <section className="grid gap-7 xl:grid-cols-4">
        <BottomCard title="Próximas Atividades" icon={Clock3}>
          {activityHighlights.length ? (
            <div className="space-y-0">
              {activityHighlights.slice(0, 3).map((item, index) => (
                <div key={item.id} className="grid grid-cols-[28px_minmax(0,1fr)] gap-5">
                  <div className="flex flex-col items-center">
                    <span className={`mt-1 h-5 w-5 rounded-full ${index === 0 ? 'bg-[#007c68]' : 'bg-[#dce8ff]'}`} />
                    {index < Math.min(activityHighlights.length, 3) - 1 ? (
                      <span className="h-16 w-px bg-[#dfe5ee]" />
                    ) : null}
                  </div>
                  <div className="pb-8">
                    <p className="text-xl font-medium leading-7 text-[#1f2430]">{item.title}</p>
                    <p className="mt-1 text-base font-medium leading-6 text-[#2c3242]">
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

        <BottomCard title="Status dos Preparativos">
          <div className="flex justify-center gap-12">
            <CircularMetric
              label="Checklist"
              value={checklistProgress}
              detail={`${Math.round(checklistProgress)}%`}
            />
            <CircularMetric
              label="Docs"
              value={documentsProgress}
              detail={`${completedDocumentsCount}/${documentItems.length}`}
            />
          </div>
          <div className="mt-9 rounded-[14px] bg-[#eef4ff] p-5">
            <div className="flex items-center gap-3 text-xl font-medium text-[#d31919]">
              <FileWarning className="h-6 w-6" />
              <span>
                {pendingPreparationCount} pendência{pendingPreparationCount === 1 ? '' : 's'}
              </span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {pendingPreparationItems.length ? (
                pendingPreparationItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onNavigateToProfilePath('/perfil/checklist')}
                    className="rounded-[6px] border border-[#cfd8e7] bg-white px-3 py-2 text-sm font-medium text-[#2c3242]"
                  >
                    {item.title}
                  </button>
                ))
              ) : (
                <span className="rounded-[6px] border border-[#cfd8e7] bg-white px-3 py-2 text-sm font-medium text-[#2c3242]">
                  Tudo em dia
                </span>
              )}
            </div>
          </div>
        </BottomCard>

        <BottomCard
          title="Membros do Grupo"
          action={
            <button
              type="button"
              aria-label="Convidar membro"
              onClick={() => onNavigateToProfilePath('/perfil/viagem')}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#c6cedc] text-[#171a26]"
            >
              <UserPlus className="h-6 w-6" />
            </button>
          }
        >
          <div className="space-y-5">
            {members.length ? (
              members.slice(0, 3).map((member, index) => {
                const name = getMemberName(member, index);
                return (
                  <div key={member.id} className="flex items-center gap-4">
                    {member.profile?.avatarUrl ? (
                      <img src={member.profile.avatarUrl} alt="" className="h-14 w-14 rounded-full object-cover" />
                    ) : (
                      <span className="grid h-14 w-14 place-items-center rounded-full bg-[#dce8ff] text-xl font-semibold text-[#7a879d]">
                        {getInitials(name)}
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-xl font-medium text-[#1f2430]">{name}</p>
                      <p className="text-sm font-medium text-[#007c68]">{roleLabel(member.role)}</p>
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
            className="mt-8 inline-flex h-12 w-full items-center justify-center rounded-[8px] border border-[#c6cedc] bg-white text-base font-semibold text-[#0b1326] transition hover:bg-[#f3f6fb]"
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
              className="whitespace-nowrap text-lg font-medium text-[#006b57]"
            >
              Ver tudo
            </a>
          }
        >
          <div className="space-y-5">
            {recentExpenses.length ? (
              recentExpenses.slice(0, 3).map((expense) => (
                <div key={expense.id} className="grid grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-4">
                  <span className="grid h-[3.25rem] w-[3.25rem] place-items-center rounded-full bg-[#dce8ff] text-[#0b1326]">
                    <Plane className="h-6 w-6" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-xl font-medium text-[#1f2430]">{expense.title}</p>
                    <p className="text-sm font-medium text-[#2c3242]">
                      {getCategoryLabel(categories, expense.category)} • {countryLabel(expense.country)}
                    </p>
                    <p className="text-xs font-medium text-[#6b7285]">{formatExpenseDate(expense.createdAt)}</p>
                  </div>
                  <p className="text-right text-xl font-medium text-[#1f2430]">
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
          <div className="mt-8 border-t border-[#e2e7f0] pt-5">
            <p className="text-sm font-medium uppercase text-[#2c3242]">Total gasto até agora</p>
            <p className="mt-2 text-[1.85rem] font-black text-[#0b1326]">{formatRange(grandTotal.real, 'BRL', true)}</p>
          </div>
          <button
            type="button"
            onClick={onAddExpense}
            className="absolute bottom-8 right-4 inline-flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full bg-black text-white shadow-[0_20px_45px_rgba(15,23,42,0.22)] transition hover:bg-[#111827] sm:right-[-1.25rem]"
          >
            <Plus className="h-9 w-9" />
          </button>
        </BottomCard>
      </section>

      {planningWarning ? (
        <p className="text-sm font-medium text-[#667085]">{planningWarning}</p>
      ) : null}
    </motion.div>
  );
}
