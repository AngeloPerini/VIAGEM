import { AnimatePresence, motion } from 'framer-motion';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  AlertTriangle,
  ArrowRight,
  Edit3,
  FileText,
  Plus,
  ReceiptText,
  Sparkles,
  Trash2,
  WalletCards,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ExpenseCategoryModal } from './components/ExpenseCategoryModal';
import { ExpenseFormModal } from './components/ExpenseFormModal';
import { ItineraryPage } from './components/ItineraryPage';
import { Navbar, type AppView } from './components/Navbar';
import { NextActionDashboard } from './components/NextActionDashboard';
import { QuotePage } from './components/QuotePage';
import { useAuth } from './contexts/AuthContext';
import { useGroup } from './contexts/GroupContext';
import { useLanguage } from './contexts/LanguageContext';
import { buildCountryOptions, countryNames, normalizeCountryId } from './data/countries';
import { AuthPage } from './pages/AuthPage';
import { InvitePage } from './pages/InvitePage';
import { AttractionsPage } from './pages/AttractionsPage';
import { ProfilePage } from './pages/ProfilePage';
import { TripAIReviewPage } from './pages/TripAIReviewPage';
import { getPendingInviteToken } from './services/groupsService';
import {
  appendExchangeRateHistory,
  getCachedExchangeRates,
  loadExchangeRateHistory,
  refreshExchangeRates,
} from './services/currencyService';
import {
  cacheExpensesFallback,
  createExpense,
  deleteExpense,
  getCachedExpenses,
  getExpenses,
  subscribeExpenses,
  updateExpense,
} from './services/expensesService';
import {
  cacheExpenseCategoriesFallback,
  createExpenseCategory,
  deleteExpenseCategory,
  getCachedExpenseCategories,
  getExpenseCategories,
  subscribeExpenseCategories,
  updateExpenseCategory,
  type ExpenseCategoryInput,
} from './services/expenseCategoriesService';
import { supabase } from './services/supabaseClient';
import type {
  CategoryMeta,
  CountryFilterId,
  ExchangeRateHistory,
  ExchangeRateMap,
  Expense,
  RealValueMode,
  TravelCurrencyCode,
} from './types';
import {
  calculateCategoryTotal,
  calculateExpensesTotal,
  formatOriginalCurrencyBreakdown,
  formatRange,
  getExpenseCurrency,
  getExpenseOriginalRange,
  getExpenseRealRange,
  type Totals,
} from './utils/money';
import { getExpenseCategoryIcon, inferExpenseCategoryIconId } from './utils/expenseCategoryIcons';

type ExpenseViewType = 'all' | 'recent' | 'highest';

function loadInitialView(): AppView {
  const path = window.location.pathname;
  if (path === '/perfil' || path.startsWith('/perfil/') || path === '/profile' || path.startsWith('/profile/')) {
    return 'profile';
  }
  if (path === '/dashboard' || path === '/groups' || path === '/auth/callback') return 'dashboard';

  const hash = window.location.hash.replace('#', '');
  return hash === 'expenses' || hash === 'itinerary' || hash === 'attractions' || hash === 'quote' || hash === 'profile'
    ? hash
    : 'dashboard';
}

function getInviteToken() {
  const [, token] = window.location.pathname.match(/^\/invite\/([^/]+)/) ?? [];
  return token ? decodeURIComponent(token) : null;
}

function LoadingScreen({ message }: { message: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#eef5f3] px-4 text-slate-700">
      <div className="rounded-[2rem] border border-white/80 bg-white/85 px-6 py-5 text-sm font-black shadow-xl shadow-slate-900/10">
        {message}
      </div>
    </main>
  );
}

const sortExpenseCategories = (items: CategoryMeta[]) =>
  [...items].sort((a, b) => {
    const order = (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999);
    if (order !== 0) return order;
    return a.name.localeCompare(b.name, 'pt-BR');
  });

function StandaloneProfileShell() {
  const { t } = useLanguage();

  return (
    <main className="min-h-screen overflow-hidden bg-[#edf4f2] text-slate-900">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -left-24 top-0 h-96 w-96 rounded-full bg-teal-200/50 blur-3xl" />
        <div className="absolute right-0 top-24 h-[30rem] w-[30rem] rounded-full bg-sky-200/50 blur-3xl" />
      </div>
      <div className="relative flex w-full flex-col gap-6 px-4 py-5 sm:px-6 md:gap-8 md:py-8 lg:px-10 xl:px-12">
        <div className="rounded-3xl border border-white/70 bg-white/85 p-4 shadow-xl shadow-slate-900/10 backdrop-blur-xl">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="TripFlow" className="h-9 w-9 rounded-xl object-contain" />
            <p className="text-sm font-black tracking-tight text-slate-950 md:text-base">{t('app.name')}</p>
          </div>
        </div>
        <ProfilePage />
      </div>
    </main>
  );
}

const rangeMidpoint = (range: { min: number; max: number }) => (range.min + range.max) / 2;

const normalizeText = (value?: string | number | null) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const parseNumberFilter = (value: string) => {
  const normalized = value.trim().replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '');
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const getExpenseTimestamp = (expense: Expense) => {
  if (!expense.createdAt) return 0;
  const timestamp = Date.parse(expense.createdAt);
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const getDateInputTimestamp = (value: string, endOfDay = false) => {
  if (!value) return null;
  const timestamp = Date.parse(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`);
  return Number.isFinite(timestamp) ? timestamp : null;
};

const buildExpenseFileSlug = (value?: string) =>
  normalizeText(value || 'viagem')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'viagem';

const formatExpenseDate = (value?: string) => {
  if (!value) return 'Sem data';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sem data';

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
};

const buildDonutGradient = (items: Array<{ color: string; value: number }>) => {
  const total = items.reduce((sum, item) => sum + Math.max(0, item.value), 0);
  if (!total) return '#e7edf7';

  let cursor = 0;
  return items
    .map((item) => {
      const start = cursor;
      const end = cursor + (Math.max(0, item.value) / total) * 360;
      cursor = end;
      return `${item.color} ${start}deg ${end}deg`;
    })
    .join(', ');
};

function ExpensesEmptyState({ onAddExpense }: { onAddExpense: () => void }) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-300 bg-white/75 px-5 py-8 text-center">
      <ReceiptText className="mx-auto h-9 w-9 text-[#007c68]" />
      <p className="mt-4 text-lg font-black text-[#0b1326]">Nenhum gasto cadastrado ainda.</p>
      <p className="mx-auto mt-2 max-w-sm text-sm font-semibold leading-6 text-[#667085]">
        Adicione seu primeiro gasto para começar a acompanhar o orçamento da viagem ativa.
      </p>
      <button
        type="button"
        onClick={onAddExpense}
        className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-black px-5 text-sm font-bold text-white transition hover:bg-[#111827]"
      >
        <Plus className="h-4 w-4" />
        Novo gasto
      </button>
    </div>
  );
}

export default function App() {
  const [locationKey, setLocationKey] = useState(() => `${window.location.pathname}${window.location.hash}`);
  const { loading: authLoading, user } = useAuth();
  const { activeGroup, loading: groupLoading } = useGroup();
  const [inviteRefreshKey, setInviteRefreshKey] = useState(0);
  const currentPath = locationKey.split('#')[0] || window.location.pathname;
  const inviteToken = getInviteToken();
  const pendingInviteToken = user ? getPendingInviteToken() : null;
  const activeInviteToken = inviteToken ?? pendingInviteToken;
  const isAuthCallback = currentPath === '/auth/callback';
  const isGroupsRoute = currentPath === '/groups';
  const isProfileRoute = currentPath === '/perfil' || currentPath.startsWith('/perfil/')
    || currentPath === '/profile' || currentPath.startsWith('/profile/');
  const isTripAIReviewRoute = currentPath === '/trip-ai-review';

  useEffect(() => {
    const syncLocation = () => setLocationKey(`${window.location.pathname}${window.location.hash}`);

    window.addEventListener('popstate', syncLocation);
    window.addEventListener('hashchange', syncLocation);
    return () => {
      window.removeEventListener('popstate', syncLocation);
      window.removeEventListener('hashchange', syncLocation);
    };
  }, []);

  useEffect(() => {
    if (!authLoading && user && !groupLoading && isAuthCallback && !activeInviteToken) {
      window.history.replaceState({}, '', activeGroup ? '/dashboard' : '/perfil');
    }
  }, [activeGroup, activeInviteToken, authLoading, groupLoading, isAuthCallback, user]);

  useEffect(() => {
    if (!authLoading && user && !groupLoading && !activeGroup && !activeInviteToken && !isGroupsRoute && !isProfileRoute) {
      window.history.replaceState({}, '', '/perfil');
    }
  }, [activeGroup, activeInviteToken, authLoading, groupLoading, isGroupsRoute, isProfileRoute, user]);

  if (authLoading && !user) return <LoadingScreen message="Verificando sessao..." />;
  if (!user) return <AuthPage initialInviteCode={inviteToken ?? getPendingInviteToken()} />;
  if (activeInviteToken) {
    return (
      <InvitePage
        key={`${activeInviteToken}-${inviteRefreshKey}`}
        token={activeInviteToken}
        onDone={() => setInviteRefreshKey((current) => current + 1)}
      />
    );
  }
  if (isTripAIReviewRoute) return <TripAIReviewPage />;
  if (groupLoading && !activeGroup) return <LoadingScreen message="Carregando suas viagens..." />;
  if (!activeGroup) return <StandaloneProfileShell />;

  return <TravelWorkspace key={activeGroup.id} groupId={activeGroup.id} />;
}

function TravelWorkspace({ groupId }: { groupId: string }) {
  const { user } = useAuth();
  const { activeGroup } = useGroup();
  const { t } = useLanguage();
  const [expenses, setExpenses] = useState<Expense[]>(() => getCachedExpenses(groupId));
  const [expenseCategories, setExpenseCategories] = useState<CategoryMeta[]>(() => getCachedExpenseCategories(groupId));
  const [editingExpenseCategory, setEditingExpenseCategory] = useState<CategoryMeta | null>(null);
  const [categoryPendingDelete, setCategoryPendingDelete] = useState<{
    category: CategoryMeta;
    linkedExpenses: number;
  } | null>(null);
  const [categoryMoveTarget, setCategoryMoveTarget] = useState('Outros');
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [expensePendingDelete, setExpensePendingDelete] = useState<Expense | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [activeView, setActiveView] = useState<AppView>(loadInitialView);
  const [realValueMode, setRealValueMode] = useState<RealValueMode>('converted');
  const [showAllTransactions, setShowAllTransactions] = useState(false);
  const [expenseCountryFilter, setExpenseCountryFilter] = useState<CountryFilterId>('all');
  const [expenseCategoryFilter, setExpenseCategoryFilter] = useState('all');
  const [expenseCurrencyFilter, setExpenseCurrencyFilter] = useState<TravelCurrencyCode | 'all'>('all');
  const [expenseDateFromFilter, setExpenseDateFromFilter] = useState('');
  const [expenseDateToFilter, setExpenseDateToFilter] = useState('');
  const [expenseSearchFilter, setExpenseSearchFilter] = useState('');
  const [expenseMinValueFilter, setExpenseMinValueFilter] = useState('');
  const [expenseMaxValueFilter, setExpenseMaxValueFilter] = useState('');
  const [expenseViewType, setExpenseViewType] = useState<ExpenseViewType>('all');
  const [itineraryCountryFilter, setItineraryCountryFilter] = useState<CountryFilterId>('all');
  const [attractionCountryFilter, setAttractionCountryFilter] = useState<CountryFilterId>('all');
  const [exchangeRates, setExchangeRates] = useState<ExchangeRateMap>(getCachedExchangeRates);
  const [quoteHistory, setQuoteHistory] = useState<ExchangeRateHistory>(loadExchangeRateHistory);
  const [selectedQuoteCurrency, setSelectedQuoteCurrency] = useState<TravelCurrencyCode>('EUR');
  const [isQuoteLoading, setIsQuoteLoading] = useState(false);
  const [quoteWarning, setQuoteWarning] = useState<string | null>(null);
  const [failedQuoteCurrencies, setFailedQuoteCurrencies] = useState<TravelCurrencyCode[]>([]);
  const [expenseSyncWarning, setExpenseSyncWarning] = useState<string | null>(null);
  const [categorySyncWarning, setCategorySyncWarning] = useState<string | null>(null);
  const [isExpenseLoading, setIsExpenseLoading] = useState(false);
  const [isExpenseSaving, setIsExpenseSaving] = useState(false);
  const [isCategorySaving, setIsCategorySaving] = useState(false);

  useEffect(() => {
    let active = true;
    setExpenses(getCachedExpenses(groupId));

    const syncExpenses = async () => {
      try {
        setIsExpenseLoading(true);
        const nextExpenses = await getExpenses(groupId);
        if (active) {
          setExpenses(nextExpenses);
          setExpenseSyncWarning(null);
        }
      } catch {
        if (active) {
          setExpenseSyncWarning('Supabase indisponivel. Mostrando cache local dos gastos.');
        }
      } finally {
        if (active) setIsExpenseLoading(false);
      }
    };

    void syncExpenses();
    const channel = subscribeExpenses(groupId, () => {
      void getExpenses(groupId)
        .then((nextExpenses) => {
          if (active) {
            setExpenses(nextExpenses);
            setExpenseSyncWarning(null);
          }
        })
        .catch(() => {
          if (active) setExpenseSyncWarning('Nao foi possivel sincronizar os gastos em tempo real.');
        });
    });

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [groupId]);

  useEffect(() => {
    cacheExpensesFallback(groupId, expenses);
  }, [expenses, groupId]);

  useEffect(() => {
    let active = true;
    setExpenseCategories(getCachedExpenseCategories(groupId));

    const syncCategories = async () => {
      try {
        const nextCategories = await getExpenseCategories(groupId);
        if (active) {
          setExpenseCategories(nextCategories);
          setCategorySyncWarning(null);
        }
      } catch {
        if (active) {
          setCategorySyncWarning('Supabase indisponivel. Mostrando categorias salvas localmente.');
        }
      }
    };

    void syncCategories();
    const channel = subscribeExpenseCategories(groupId, () => {
      void getExpenseCategories(groupId)
        .then((nextCategories) => {
          if (active) {
            setExpenseCategories(nextCategories);
            setCategorySyncWarning(null);
          }
        })
        .catch(() => {
          if (active) setCategorySyncWarning('Nao foi possivel sincronizar categorias em tempo real.');
        });
    });

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [groupId]);

  useEffect(() => {
    cacheExpenseCategoriesFallback(groupId, expenseCategories);
  }, [expenseCategories, groupId]);

  useEffect(() => {
    const syncViewWithLocation = () => {
      setActiveView(loadInitialView());
    };

    window.addEventListener('hashchange', syncViewWithLocation);
    window.addEventListener('popstate', syncViewWithLocation);
    return () => {
      window.removeEventListener('hashchange', syncViewWithLocation);
      window.removeEventListener('popstate', syncViewWithLocation);
    };
  }, []);

  const refreshQuote = async () => {
    setIsQuoteLoading(true);
    setQuoteWarning(null);

    try {
      const result = await refreshExchangeRates();
      setExchangeRates(result.rates);
      setQuoteHistory(appendExchangeRateHistory(result.rates));
      setQuoteWarning(result.warning);
      setFailedQuoteCurrencies(result.failedCurrencies);
    } catch {
      const cachedRates = getCachedExchangeRates();
      setExchangeRates(cachedRates);
      setQuoteWarning('Usando última cotação salva.');
      setFailedQuoteCurrencies(['EUR', 'USD', 'JPY', 'CHF', 'GBP']);
    } finally {
      setIsQuoteLoading(false);
    }

  };

  useEffect(() => {
    void refreshQuote();
  }, []);

  const tripCountryIds = useMemo(
    () => new Set((activeGroup?.countries ?? []).map((country) => normalizeCountryId(country))),
    [activeGroup?.countries],
  );

  const scopedExpenses = useMemo(
    () =>
      tripCountryIds.size
        ? expenses.filter((expense) => {
            const countryId = normalizeCountryId(expense.country);
            return countryId === 'international' || tripCountryIds.has(countryId);
          })
        : expenses,
    [expenses, tripCountryIds],
  );

  const categoriesForDisplay = useMemo(() => {
    const knownCategories = new Map(expenseCategories.map((category) => [category.id, category]));
    const missingCategories = Array.from(new Set(scopedExpenses.map((expense) => expense.category)))
      .filter((categoryId) => categoryId && !knownCategories.has(categoryId))
      .map((categoryId, index) => ({
        id: categoryId,
        name: categoryId,
        label: 'Gasto',
        accent: '#475569',
        icon: inferExpenseCategoryIconId({ id: categoryId, name: categoryId, icon: undefined }),
        sortOrder: 1000 + index,
        isProtected: false,
      }));

    return sortExpenseCategories([...expenseCategories, ...missingCategories]);
  }, [expenseCategories, scopedExpenses]);

  const expenseCountryOptions = useMemo(
    () => buildCountryOptions(scopedExpenses.map((expense) => expense.country), activeGroup?.countries ?? []),
    [activeGroup?.countries, scopedExpenses],
  );

  const canUseEuropeDefaults =
    Boolean(activeGroup?.name?.toLowerCase().includes('viagem europa')) &&
    user?.email?.toLowerCase() === 'aperini351@gmail.com';

  const expenseCurrencyOptions = useMemo(
    () => Array.from(new Set(scopedExpenses.map((expense) => getExpenseCurrency(expense)))).sort(),
    [scopedExpenses],
  );

  useEffect(() => {
    if (expenseCountryFilter !== 'all' && !expenseCountryOptions.some((country) => country.id === expenseCountryFilter)) {
      setExpenseCountryFilter('all');
    }
  }, [expenseCountryFilter, expenseCountryOptions]);

  useEffect(() => {
    if (expenseCategoryFilter !== 'all' && !categoriesForDisplay.some((category) => category.id === expenseCategoryFilter)) {
      setExpenseCategoryFilter('all');
    }
  }, [categoriesForDisplay, expenseCategoryFilter]);

  useEffect(() => {
    if (expenseCurrencyFilter !== 'all' && !expenseCurrencyOptions.includes(expenseCurrencyFilter)) {
      setExpenseCurrencyFilter('all');
    }
  }, [expenseCurrencyFilter, expenseCurrencyOptions]);

  const filteredExpenses = useMemo(() => {
    const search = normalizeText(expenseSearchFilter);
    const minValue = parseNumberFilter(expenseMinValueFilter);
    const maxValue = parseNumberFilter(expenseMaxValueFilter);
    const fromTimestamp = getDateInputTimestamp(expenseDateFromFilter);
    const toTimestamp = getDateInputTimestamp(expenseDateToFilter, true);

    return scopedExpenses.filter((expense) => {
      if (expenseCountryFilter !== 'all' && normalizeCountryId(expense.country) !== expenseCountryFilter) return false;
      if (expenseCategoryFilter !== 'all' && expense.category !== expenseCategoryFilter) return false;
      if (expenseCurrencyFilter !== 'all' && getExpenseCurrency(expense) !== expenseCurrencyFilter) return false;

      const timestamp = getExpenseTimestamp(expense);
      if (fromTimestamp !== null && (!timestamp || timestamp < fromTimestamp)) return false;
      if (toTimestamp !== null && (!timestamp || timestamp > toTimestamp)) return false;

      const realMidpoint = rangeMidpoint(getExpenseRealRange(expense, exchangeRates));
      if (minValue !== null && realMidpoint < minValue) return false;
      if (maxValue !== null && realMidpoint > maxValue) return false;

      if (search) {
        const category = categoriesForDisplay.find((item) => item.id === expense.category);
        const country = countryNames[normalizeCountryId(expense.country)] ?? expense.country ?? '';
        const searchable = normalizeText(`${expense.title} ${expense.detail ?? ''} ${category?.name ?? expense.category} ${country}`);
        if (!searchable.includes(search)) return false;
      }

      return true;
    });
  }, [
    categoriesForDisplay,
    exchangeRates,
    expenseCategoryFilter,
    expenseCountryFilter,
    expenseCurrencyFilter,
    expenseDateFromFilter,
    expenseDateToFilter,
    expenseMaxValueFilter,
    expenseMinValueFilter,
    expenseSearchFilter,
    scopedExpenses,
  ]);

  const hasExpenseFilters =
    expenseCountryFilter !== 'all' ||
    expenseCategoryFilter !== 'all' ||
    expenseCurrencyFilter !== 'all' ||
    Boolean(expenseDateFromFilter || expenseDateToFilter || expenseSearchFilter || expenseMinValueFilter || expenseMaxValueFilter) ||
    expenseViewType !== 'all';

  const filteredTotalsByCategory = useMemo(() => {
    const applySourceSheetAdjustment = !hasExpenseFilters;

    return categoriesForDisplay.reduce<Record<string, Totals>>((totals, category) => {
      totals[category.id] = calculateCategoryTotal(
        filteredExpenses,
        category.id,
        exchangeRates,
        applySourceSheetAdjustment,
      );
      return totals;
    }, {});
  }, [categoriesForDisplay, exchangeRates, filteredExpenses, hasExpenseFilters]);

  const filteredGrandTotal = calculateExpensesTotal(
    filteredExpenses,
    exchangeRates,
    !hasExpenseFilters,
  );
  const dashboardTotalsByCategory = useMemo(() => {
    return categoriesForDisplay.reduce<Record<string, Totals>>((totals, category) => {
      totals[category.id] = calculateCategoryTotal(expenses, category.id, exchangeRates);
      return totals;
    }, {});
  }, [categoriesForDisplay, exchangeRates, expenses]);
  const dashboardGrandTotal = calculateExpensesTotal(expenses, exchangeRates);
  const expenseCategoryRows = useMemo(() => {
    const categoryExpenseCounts = filteredExpenses.reduce<Record<string, number>>((counts, expense) => {
      counts[expense.category] = (counts[expense.category] ?? 0) + 1;
      return counts;
    }, {});

    return categoriesForDisplay
      .map((category) => {
        const count = categoryExpenseCounts[category.id] ?? 0;
        const total = count ? (filteredTotalsByCategory[category.id] ?? {
          euro: { min: 0, max: 0 },
          real: { min: 0, max: 0 },
          originalByCurrency: {},
        }) : {
          euro: { min: 0, max: 0 },
          real: { min: 0, max: 0 },
          originalByCurrency: {},
        };
        const totalReal = rangeMidpoint(total.real);

        return {
          category,
          count,
          total,
          totalReal,
        };
      });
  }, [categoriesForDisplay, filteredExpenses, filteredTotalsByCategory]);
  const expenseCategoryBreakdown = useMemo(
    () => expenseCategoryRows.filter((item) => item.count > 0).sort((a, b) => b.totalReal - a.totalReal),
    [expenseCategoryRows],
  );
  const categoriesForManagement = useMemo(
    () => [...expenseCategoryRows].sort((a, b) => b.count - a.count || b.totalReal - a.totalReal),
    [expenseCategoryRows],
  );
  const donutGradient = buildDonutGradient(
    expenseCategoryBreakdown.map((item) => ({
      color: item.category.accent,
      value: item.totalReal,
    })),
  );
  const recentTransactions = useMemo(
    () => {
      const sorted = [...filteredExpenses].sort((a, b) => {
        if (expenseViewType === 'highest') {
          return rangeMidpoint(getExpenseRealRange(b, exchangeRates)) - rangeMidpoint(getExpenseRealRange(a, exchangeRates));
        }
        return getExpenseTimestamp(b) - getExpenseTimestamp(a);
      });

      return expenseViewType === 'recent' ? sorted.slice(0, 8) : sorted;
    },
    [exchangeRates, expenseViewType, filteredExpenses],
  );
  const visibleTransactions = showAllTransactions ? recentTransactions : recentTransactions.slice(0, 5);
  const selectedTotalLabel = formatRange(filteredGrandTotal.real, 'BRL', true);
  const originalTotalLabel = formatOriginalCurrencyBreakdown(filteredGrandTotal.originalByCurrency);
  const eurQuote = exchangeRates.EUR ?? null;
  const tripDestinations = activeGroup?.countries?.length
    ? activeGroup.countries.map((country) => countryNames[normalizeCountryId(country)]).join(', ')
    : 'destinos em planejamento';
  const topExpenseCategory = expenseCategoryBreakdown[0] ?? null;
  const topCategoryShare = topExpenseCategory && rangeMidpoint(filteredGrandTotal.real) > 0
    ? Math.round((topExpenseCategory.totalReal / rangeMidpoint(filteredGrandTotal.real)) * 100)
    : 0;
  const tripflowAiInsight = filteredExpenses.length && topExpenseCategory
    ? `${topExpenseCategory.category.name} concentra ${topCategoryShare}% dos gastos filtrados. Revise os próximos lançamentos dessa categoria antes de assumir novos compromissos.`
    : 'Adicione gastos reais para o TripFlow destacar oportunidades de economia sem acionar IA automaticamente.';
  const canManageExpenses = activeGroup?.role === 'owner' || activeGroup?.role === 'member';
  const categoryDeleteTargets = useMemo(
    () =>
      categoryPendingDelete
        ? categoriesForDisplay.filter((category) => category.id !== categoryPendingDelete.category.id)
        : [],
    [categoriesForDisplay, categoryPendingDelete],
  );

  const handleSaveExpense = async (expense: Expense) => {
    const isEditing = expenses.some((item) => item.id === expense.id);
    setIsExpenseSaving(true);

    try {
      const savedExpense = isEditing
        ? await updateExpense(groupId, expense.id, expense)
        : await createExpense(groupId, expense);
      setExpenses((current) =>
        isEditing
          ? current.map((item) => (item.id === savedExpense.id ? savedExpense : item))
          : [savedExpense, ...current],
      );
      setExpenseSyncWarning(null);
      setIsModalOpen(false);
      setEditingExpense(null);
    } catch {
      setExpenses((current) =>
        isEditing
          ? current.map((item) => (item.id === expense.id ? expense : item))
          : [expense, ...current],
      );
      setExpenseSyncWarning('Nao foi possivel salvar no Supabase. Alteracao mantida no cache local.');
      setIsModalOpen(false);
      setEditingExpense(null);
    } finally {
      setIsExpenseSaving(false);
    }
  };

  const handleDeleteExpense = async (expense: Expense) => {
    const previousExpenses = expenses;
    setIsExpenseSaving(true);
    setExpenses((current) => current.filter((item) => item.id !== expense.id));
    setExpensePendingDelete(null);

    try {
      await deleteExpense(groupId, expense.id);
      setExpenseSyncWarning(null);
    } catch {
      setExpenses(previousExpenses);
      setExpenseSyncWarning('Nao foi possivel excluir no Supabase. Tente novamente.');
    } finally {
      setIsExpenseSaving(false);
    }
  };

  const openNewExpenseModal = () => {
    setEditingExpense(null);
    setIsModalOpen(true);
  };

  const openEditExpenseModal = (expense: Expense) => {
    setEditingExpense(expense);
    setIsModalOpen(true);
  };

  const openNewExpenseCategoryModal = () => {
    setEditingExpenseCategory(null);
    setIsCategoryModalOpen(true);
  };

  const openEditExpenseCategoryModal = (category: CategoryMeta) => {
    setEditingExpenseCategory(category);
    setIsCategoryModalOpen(true);
  };

  const handleClearExpenseFilters = () => {
    setExpenseCountryFilter('all');
    setExpenseCategoryFilter('all');
    setExpenseCurrencyFilter('all');
    setExpenseDateFromFilter('');
    setExpenseDateToFilter('');
    setExpenseSearchFilter('');
    setExpenseMinValueFilter('');
    setExpenseMaxValueFilter('');
    setExpenseViewType('all');
    setShowAllTransactions(false);
  };

  const handleExportExpensesPdf = () => {
    const tripName = activeGroup?.name ?? 'Viagem ativa';
    const tripPeriod = activeGroup?.startDate || activeGroup?.endDate
      ? `${formatExpenseDate(activeGroup?.startDate)} - ${formatExpenseDate(activeGroup?.endDate)}`
      : 'Periodo nao definido';
    const generatedAt = new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date());
    const exchangeRateSummary = Object.values(exchangeRates)
      .filter((rate) => rate?.rate)
      .map((rate) => `1 ${rate.code} = ${formatRange({ min: rate.rate, max: rate.rate }, 'BRL')}`)
      .join(' | ') || 'Cotacao indisponivel';
    const categoryById = new Map(categoriesForDisplay.map((category) => [category.id, category]));
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const marginX = 36;

    doc.setFillColor(11, 19, 38);
    doc.rect(0, 0, pageWidth, 86, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.text('Relatorio de Gastos TripFlow', marginX, 38);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Gerado em ${generatedAt}`, marginX, 58);

    doc.setTextColor(11, 19, 38);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text(tripName, marginX, 116);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Periodo: ${tripPeriod}`, marginX, 134);
    doc.text(`Filtros aplicados: ${hasExpenseFilters ? 'sim' : 'nao'}`, marginX, 150);
    doc.text(`Cotacao usada: ${exchangeRateSummary}`, marginX, 166);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(`Total BRL: ${formatRange(filteredGrandTotal.real, 'BRL', true)}`, pageWidth - marginX - 220, 116);
    doc.text(`Total original: ${formatOriginalCurrencyBreakdown(filteredGrandTotal.originalByCurrency)}`, pageWidth - marginX - 220, 134, {
      maxWidth: 220,
    });

    autoTable(doc, {
      startY: 190,
      head: [['Categoria', 'Itens', 'Total BRL', 'Moeda original']],
      body: expenseCategoryBreakdown.length
        ? expenseCategoryBreakdown.map(({ category, count, total }) => [
            category.name,
            String(count),
            formatRange(total.real, 'BRL', true),
            formatOriginalCurrencyBreakdown(total.originalByCurrency),
          ])
        : [['Sem categorias com gastos', '0', formatRange({ min: 0, max: 0 }, 'BRL'), 'Sem valores originais']],
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 5 },
      headStyles: { fillColor: [0, 124, 104], textColor: 255 },
      alternateRowStyles: { fillColor: [247, 248, 253] },
      margin: { left: marginX, right: marginX },
    });

    const tableState = doc as jsPDF & { lastAutoTable?: { finalY?: number } };
    const startY = (tableState.lastAutoTable?.finalY ?? 250) + 24;
    autoTable(doc, {
      startY,
      head: [['Data', 'Pais', 'Categoria', 'Gasto', 'Detalhe', 'Moeda', 'Valor original', 'Valor BRL']],
      body: recentTransactions.map((expense) => {
        const category = categoryById.get(expense.category);
        return [
          formatExpenseDate(expense.createdAt),
          countryNames[normalizeCountryId(expense.country)] ?? expense.country ?? 'Internacional',
          category?.name ?? expense.category,
          expense.title,
          expense.detail ?? '',
          getExpenseCurrency(expense),
          formatRange(getExpenseOriginalRange(expense), getExpenseCurrency(expense)),
          formatRange(getExpenseRealRange(expense, exchangeRates), 'BRL'),
        ];
      }),
      styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 4, overflow: 'linebreak' },
      headStyles: { fillColor: [11, 19, 38], textColor: 255 },
      alternateRowStyles: { fillColor: [247, 248, 253] },
      columnStyles: {
        0: { cellWidth: 56 },
        1: { cellWidth: 72 },
        2: { cellWidth: 80 },
        3: { cellWidth: 120 },
        4: { cellWidth: 150 },
        5: { cellWidth: 44 },
        6: { cellWidth: 86, halign: 'right' },
        7: { cellWidth: 86, halign: 'right' },
      },
      margin: { left: marginX, right: marginX },
      didDrawPage: () => {
        doc.setFontSize(8);
        doc.setTextColor(102, 112, 133);
        doc.text('TripFlow - dados filtrados da viagem ativa', marginX, doc.internal.pageSize.getHeight() - 18);
      },
    });

    doc.save(`tripflow-gastos-${buildExpenseFileSlug(tripName)}.pdf`);
    setExpenseSyncWarning(`Relatório PDF gerado com ${filteredExpenses.length} gasto${filteredExpenses.length === 1 ? '' : 's'} filtrado${filteredExpenses.length === 1 ? '' : 's'}.`);
  };

  const handleSaveExpenseCategory = async (input: ExpenseCategoryInput) => {
    setIsCategorySaving(true);

    try {
      const savedCategory = editingExpenseCategory
        ? await updateExpenseCategory(groupId, editingExpenseCategory, input)
        : await createExpenseCategory(groupId, input);
      setExpenseCategories((current) =>
        sortExpenseCategories(
          editingExpenseCategory
            ? current.map((category) => (category.id === savedCategory.id ? savedCategory : category))
            : [...current, savedCategory],
        ),
      );
      setCategorySyncWarning(null);
      setIsCategoryModalOpen(false);
      setEditingExpenseCategory(null);
    } catch (error) {
      setCategorySyncWarning(
        error instanceof Error
          ? error.message
          : 'Nao foi possivel salvar a categoria no Supabase.',
      );
    } finally {
      setIsCategorySaving(false);
    }
  };

  const openDeleteExpenseCategoryDialog = (category: CategoryMeta) => {
    if (category.id === 'Outros') {
      setCategorySyncWarning('A categoria Outros precisa existir para receber gastos movidos.');
      return;
    }

    const linkedExpenses = expenses.filter((expense) => expense.category === category.id).length;
    const fallbackTarget =
      categoriesForDisplay.find((item) => item.id === 'Outros' && item.id !== category.id)?.id ??
      categoriesForDisplay.find((item) => item.id !== category.id)?.id ??
      '';
    setCategoryMoveTarget(fallbackTarget);
    setCategoryPendingDelete({ category, linkedExpenses });
  };

  const handleDeleteExpenseCategory = async (moveToCategoryId?: string) => {
    if (!categoryPendingDelete) return;

    setIsCategorySaving(true);

    try {
      await deleteExpenseCategory(
        groupId,
        categoryPendingDelete.category,
        categoryPendingDelete.linkedExpenses > 0 ? moveToCategoryId : undefined,
      );
      const [nextCategories, nextExpenses] = await Promise.all([
        getExpenseCategories(groupId),
        getExpenses(groupId),
      ]);
      setExpenseCategories(nextCategories);
      setExpenses(nextExpenses);
      setCategorySyncWarning(null);
      setCategoryPendingDelete(null);
    } catch (error) {
      setCategorySyncWarning(
        error instanceof Error
          ? error.message
          : 'Nao foi possivel excluir a categoria no Supabase.',
      );
    } finally {
      setIsCategorySaving(false);
    }
  };

  const handleNavigate = (view: AppView) => {
    setActiveView(view);
    const nextUrl =
      view === 'profile'
        ? '/perfil'
        : view === 'dashboard'
          ? '/dashboard'
          : `/#${view}`;
    window.history.pushState({}, '', nextUrl);
  };

  const handleNavigateToProfilePath = (path: string) => {
    setActiveView('profile');
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  return (
    <main className="min-h-screen bg-[#f7f8fd] text-[#0b1326]">
      <Navbar
        activeView={activeView}
        onNavigate={handleNavigate}
        onNavigateToProfilePath={handleNavigateToProfilePath}
      />

      <div className="flex w-full flex-col gap-6 px-4 py-6 sm:px-6 lg:px-10 xl:px-12">
        <AnimatePresence mode="wait">
          {activeView === 'profile' ? (
            <ProfilePage key="profile" />
          ) : activeView === 'quote' ? (
            <QuotePage
              key="quote"
              rates={exchangeRates}
              history={quoteHistory}
              isLoading={isQuoteLoading}
              warning={quoteWarning}
              failedCurrencies={failedQuoteCurrencies}
              selectedCurrency={selectedQuoteCurrency}
              onSelectedCurrencyChange={setSelectedQuoteCurrency}
              onRefresh={() => void refreshQuote()}
            />
          ) : activeView === 'itinerary' ? (
            <ItineraryPage
              key="itinerary"
              groupId={groupId}
              tripName={activeGroup?.name}
              tripCountries={activeGroup?.countries ?? []}
              tripStartDate={activeGroup?.startDate}
              tripEndDate={activeGroup?.endDate}
              selectedCountry={itineraryCountryFilter}
              onCountryChange={setItineraryCountryFilter}
              canUseDefaultData={canUseEuropeDefaults}
            />
          ) : activeView === 'attractions' ? (
            <AttractionsPage
              key="attractions"
              groupId={groupId}
              tripCountries={activeGroup?.countries ?? []}
              selectedCountry={attractionCountryFilter}
              onCountryChange={setAttractionCountryFilter}
              canUseDefaultData={canUseEuropeDefaults}
            />
          ) : activeView === 'expenses' ? (
            <motion.div
              key="expenses"
              className="w-full space-y-5"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
            >
              <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="min-w-0">
                  <h1 className="text-3xl font-black tracking-tight text-[#0b1326] md:text-[2.35rem]">
                    Visão Geral de Gastos
                  </h1>
                  <p className="mt-1.5 text-base font-semibold text-[#45464d]">
                    Viagem: {activeGroup?.name ?? 'Viagem ativa'} ({tripDestinations})
                  </p>
                </div>
                <div className="inline-flex w-fit items-center gap-2.5 rounded-full border border-[#dfe5ee] bg-white px-4 py-2.5 text-sm font-bold text-[#45464d] shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
                  <WalletCards className="h-4 w-4 text-[#007c68]" />
                  <span>Cotação do dia:</span>
                  <strong className="text-[#0b1326]">
                    1 EUR = {eurQuote ? formatRange({ min: eurQuote.rate, max: eurQuote.rate }, 'BRL') : 'indisponível'}
                  </strong>
                </div>
              </header>

              {expenseSyncWarning || categorySyncWarning || isExpenseLoading || isExpenseSaving || isCategorySaving ? (
                <p className="rounded-2xl border border-[#dfe5ee] bg-white px-4 py-3 text-sm font-semibold text-[#45464d] shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
                  {isExpenseSaving || isCategorySaving
                    ? t('dashboard.savingExpenses')
                    : isExpenseLoading
                      ? t('dashboard.syncingExpenses')
                      : expenseSyncWarning ?? categorySyncWarning}
                </p>
              ) : null}

              <section className="grid gap-5 lg:grid-cols-[minmax(0,2.1fr)_minmax(19rem,1fr)]">
                <article className="rounded-[1.35rem] border border-[#dfe5ee] bg-white p-6 shadow-[0_18px_45px_rgba(15,23,42,0.06)] md:p-7">
                  <p className="text-sm font-bold uppercase tracking-[0.16em] text-[#45464d]">Investimento total</p>
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
                    <h2 className="text-4xl font-black tracking-tight text-black md:text-5xl">
                      {selectedTotalLabel}
                    </h2>
                    <span className="pb-1.5 text-sm font-semibold text-[#8c8f9a]">/ orçamento não definido</span>
                  </div>
                  <p className="mt-2.5 text-xl font-black text-[#007c68]">{originalTotalLabel}</p>
                  <div className="mt-8">
                    <div className="mb-2.5 flex items-center justify-between gap-4 text-sm font-bold text-[#45464d]">
                      <span>Progresso do Orçamento</span>
                      <span>--</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[#e7edf7]">
                      <div className="h-full w-0 rounded-full bg-[#007c68]" />
                    </div>
                    <p className="mt-3 text-sm font-semibold text-[#8c8f9a]">
                      Nenhum orçamento previsto foi encontrado; exibindo apenas gastos reais cadastrados.
                    </p>
                  </div>
                </article>

                <div className="grid gap-4">
                  <button
                    type="button"
                    onClick={openNewExpenseModal}
                    disabled={!canManageExpenses}
                    className="group flex min-h-32 flex-col items-center justify-center rounded-[1.35rem] bg-black p-5 text-white shadow-[0_18px_45px_rgba(15,23,42,0.12)] transition hover:-translate-y-0.5 hover:bg-[#111827] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="grid h-12 w-12 place-items-center rounded-full bg-white/10 transition group-hover:bg-white/15">
                      <Plus className="h-7 w-7" />
                    </span>
                    <span className="mt-3 text-xl font-black">Novo Gasto</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleExportExpensesPdf}
                    className="flex min-h-20 items-center justify-between gap-4 rounded-[1.35rem] border border-[#cfd6e2] bg-white p-5 text-left shadow-[0_12px_28px_rgba(15,23,42,0.04)] transition hover:border-[#007c68]"
                  >
                    <span className="flex items-center gap-4">
                      <span className="grid h-11 w-11 place-items-center rounded-full bg-[#eef8f6] text-[#007c68]">
                        <FileText className="h-5 w-5" />
                      </span>
                      <span className="text-base font-black leading-tight text-[#0b1326]">
                        Exportar<br />Relatório PDF
                      </span>
                    </span>
                    <ArrowRight className="h-5 w-5 text-[#45464d]" />
                  </button>
                </div>
              </section>

              <section className="rounded-[1.35rem] border border-[#dfe5ee] bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.04)] md:p-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h2 className="text-lg font-black text-[#0b1326]">Filtros de gastos</h2>
                    <p className="mt-1 text-sm font-semibold text-[#667085]">
                      {filteredExpenses.length} de {scopedExpenses.length} gasto{scopedExpenses.length === 1 ? '' : 's'} da viagem ativa.
                    </p>
                  </div>
                  {hasExpenseFilters ? (
                    <button
                      type="button"
                      onClick={handleClearExpenseFilters}
                      className="inline-flex h-10 items-center justify-center rounded-full border border-[#dfe5ee] px-4 text-sm font-black text-[#006b57] transition hover:border-[#006b57] hover:bg-[#eef8f6]"
                    >
                      Limpar filtros
                    </button>
                  ) : null}
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
                  <label className="sm:col-span-2 lg:col-span-2">
                    <span className="mb-1.5 block text-xs font-black uppercase tracking-[0.14em] text-[#667085]">Buscar</span>
                    <input
                      value={expenseSearchFilter}
                      onChange={(event) => setExpenseSearchFilter(event.target.value)}
                      placeholder="Nome, detalhe, pais..."
                      className="h-11 w-full rounded-xl border border-[#dfe5ee] bg-[#f8fafc] px-3.5 text-sm font-semibold text-[#0b1326] outline-none transition placeholder:text-[#98a2b3] focus:border-[#007c68] focus:bg-white"
                    />
                  </label>

                  <label>
                    <span className="mb-1.5 block text-xs font-black uppercase tracking-[0.14em] text-[#667085]">País</span>
                    <select
                      value={expenseCountryFilter}
                      onChange={(event) => setExpenseCountryFilter(event.target.value)}
                      className="h-11 w-full rounded-xl border border-[#dfe5ee] bg-[#f8fafc] px-3 text-sm font-semibold text-[#0b1326] outline-none transition focus:border-[#007c68] focus:bg-white"
                    >
                      {expenseCountryOptions.map((country) => (
                        <option key={country.id} value={country.id}>
                          {country.shortName}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    <span className="mb-1.5 block text-xs font-black uppercase tracking-[0.14em] text-[#667085]">Categoria</span>
                    <select
                      value={expenseCategoryFilter}
                      onChange={(event) => setExpenseCategoryFilter(event.target.value)}
                      className="h-11 w-full rounded-xl border border-[#dfe5ee] bg-[#f8fafc] px-3 text-sm font-semibold text-[#0b1326] outline-none transition focus:border-[#007c68] focus:bg-white"
                    >
                      <option value="all">Todas</option>
                      {categoriesForDisplay.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    <span className="mb-1.5 block text-xs font-black uppercase tracking-[0.14em] text-[#667085]">Moeda</span>
                    <select
                      value={expenseCurrencyFilter}
                      onChange={(event) => setExpenseCurrencyFilter(event.target.value as TravelCurrencyCode | 'all')}
                      className="h-11 w-full rounded-xl border border-[#dfe5ee] bg-[#f8fafc] px-3 text-sm font-semibold text-[#0b1326] outline-none transition focus:border-[#007c68] focus:bg-white"
                    >
                      <option value="all">Todas</option>
                      {expenseCurrencyOptions.map((currency) => (
                        <option key={currency} value={currency}>
                          {currency}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    <span className="mb-1.5 block text-xs font-black uppercase tracking-[0.14em] text-[#667085]">De</span>
                    <input
                      type="date"
                      value={expenseDateFromFilter}
                      onChange={(event) => setExpenseDateFromFilter(event.target.value)}
                      className="h-11 w-full rounded-xl border border-[#dfe5ee] bg-[#f8fafc] px-3 text-sm font-semibold text-[#0b1326] outline-none transition focus:border-[#007c68] focus:bg-white"
                    />
                  </label>

                  <label>
                    <span className="mb-1.5 block text-xs font-black uppercase tracking-[0.14em] text-[#667085]">Até</span>
                    <input
                      type="date"
                      value={expenseDateToFilter}
                      onChange={(event) => setExpenseDateToFilter(event.target.value)}
                      className="h-11 w-full rounded-xl border border-[#dfe5ee] bg-[#f8fafc] px-3 text-sm font-semibold text-[#0b1326] outline-none transition focus:border-[#007c68] focus:bg-white"
                    />
                  </label>

                  <label>
                    <span className="mb-1.5 block text-xs font-black uppercase tracking-[0.14em] text-[#667085]">Valor mín.</span>
                    <input
                      inputMode="decimal"
                      value={expenseMinValueFilter}
                      onChange={(event) => setExpenseMinValueFilter(event.target.value)}
                      placeholder="BRL"
                      className="h-11 w-full rounded-xl border border-[#dfe5ee] bg-[#f8fafc] px-3.5 text-sm font-semibold text-[#0b1326] outline-none transition placeholder:text-[#98a2b3] focus:border-[#007c68] focus:bg-white"
                    />
                  </label>

                  <label>
                    <span className="mb-1.5 block text-xs font-black uppercase tracking-[0.14em] text-[#667085]">Valor máx.</span>
                    <input
                      inputMode="decimal"
                      value={expenseMaxValueFilter}
                      onChange={(event) => setExpenseMaxValueFilter(event.target.value)}
                      placeholder="BRL"
                      className="h-11 w-full rounded-xl border border-[#dfe5ee] bg-[#f8fafc] px-3.5 text-sm font-semibold text-[#0b1326] outline-none transition placeholder:text-[#98a2b3] focus:border-[#007c68] focus:bg-white"
                    />
                  </label>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {([
                    ['all', 'Todos'],
                    ['recent', 'Recentes'],
                    ['highest', 'Maiores valores'],
                  ] as const).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setExpenseViewType(id)}
                      className={`inline-flex h-9 items-center rounded-full border px-4 text-sm font-black transition ${
                        expenseViewType === id
                          ? 'border-[#007c68] bg-[#007c68] text-white'
                          : 'border-[#dfe5ee] bg-[#f8fafc] text-[#667085] hover:border-[#007c68] hover:text-[#007c68]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </section>

              <section className="grid gap-5 lg:grid-cols-[minmax(17rem,0.72fr)_minmax(0,1.8fr)] lg:items-start">
                <article className="self-start rounded-[1.35rem] border border-[#dfe5ee] bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)] md:p-6">
                  <div className="flex items-center justify-between gap-4">
                    <h2 className="text-xl font-black text-[#0b1326]">Categorias</h2>
                    <button
                      type="button"
                      onClick={openNewExpenseCategoryModal}
                      disabled={!canManageExpenses}
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-[#dfe5ee] px-3.5 text-sm font-bold text-[#45464d] transition hover:border-[#007c68] hover:text-[#007c68] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Plus className="h-4 w-4" />
                      Nova
                    </button>
                  </div>

                  <div className="mt-6 flex justify-center">
                    <div
                      className="relative h-36 w-36 rounded-full md:h-40 md:w-40"
                      style={{ background: expenseCategoryBreakdown.length ? `conic-gradient(${donutGradient})` : donutGradient }}
                    >
                      <div className="absolute inset-6 grid place-items-center rounded-full bg-white text-center shadow-inner">
                        <p className="text-xs font-semibold text-[#45464d]">Total</p>
                        <p className="text-lg font-black text-[#0b1326]">
                          {filteredExpenses.length} {filteredExpenses.length === 1 ? 'item' : 'itens'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 space-y-2.5">
                    {categoriesForManagement.map(({ category, count, total }) => (
                      <div key={category.id} className="group flex items-center justify-between gap-3 rounded-2xl px-1 py-1.5">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: category.accent }} />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-[#45464d]">{category.name}</p>
                            <p className="text-xs font-semibold text-[#8c8f9a]">
                              {count} {count === 1 ? 'item' : 'itens'}
                            </p>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="text-xs font-black text-[#0b1326] sm:text-sm">{formatRange(total.real, 'BRL', true)}</span>
                          {canManageExpenses ? (
                            <span className="flex opacity-100 md:opacity-0 md:transition md:group-hover:opacity-100">
                              <button
                                type="button"
                                aria-label={`Editar categoria ${category.name}`}
                                onClick={() => openEditExpenseCategoryModal(category)}
                                className="grid h-7 w-7 place-items-center rounded-full text-[#667085] transition hover:bg-[#eef8f6] hover:text-[#007c68]"
                              >
                                <Edit3 className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                aria-label={`Excluir categoria ${category.name}`}
                                onClick={() => openDeleteExpenseCategoryDialog(category)}
                                className="grid h-7 w-7 place-items-center rounded-full text-[#667085] transition hover:bg-rose-50 hover:text-rose-700"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="overflow-hidden rounded-[1.35rem] border border-[#dfe5ee] bg-white shadow-[0_18px_45px_rgba(15,23,42,0.06)]">
                  <div className="flex flex-col gap-4 border-b border-[#e8ecf4] p-5 md:flex-row md:items-center md:justify-between">
                    <h2 className="text-xl font-black text-[#0b1326] md:text-2xl">Transações Recentes</h2>
                    <div className="grid w-full grid-cols-2 rounded-full border border-[#dfe5ee] bg-[#f7f8fd] p-1 md:w-auto">
                      <button
                        type="button"
                        onClick={() => setRealValueMode('converted')}
                        className={`h-9 rounded-full px-4 text-sm font-bold transition ${
                          realValueMode === 'converted' ? 'bg-white text-black shadow-sm' : 'text-[#667085] hover:text-black'
                        }`}
                      >
                        BRL
                      </button>
                      <button
                        type="button"
                        onClick={() => setRealValueMode('original')}
                        className={`h-9 rounded-full px-4 text-sm font-bold transition ${
                          realValueMode === 'original' ? 'bg-white text-black shadow-sm' : 'text-[#667085] hover:text-black'
                        }`}
                      >
                        Moeda Original
                      </button>
                    </div>
                  </div>

                  {visibleTransactions.length ? (
                    <>
                      <div className={`hidden md:block ${showAllTransactions ? 'max-h-[28rem] overflow-y-auto' : ''}`}>
                        <table className="w-full table-fixed border-collapse text-left">
                          <colgroup>
                            <col className="w-[38%]" />
                            <col className="w-[18%]" />
                            <col className="w-[14%]" />
                            <col className="w-[17%]" />
                            {canManageExpenses ? <col className="w-[13%]" /> : null}
                          </colgroup>
                          <thead className={showAllTransactions ? 'sticky top-0 z-10 bg-white shadow-[0_1px_0_#eef2f7]' : undefined}>
                            <tr className="text-sm font-black text-[#45464d]">
                              <th className="px-5 py-3">Gasto</th>
                              <th className="px-4 py-3">Categoria</th>
                              <th className="whitespace-nowrap px-4 py-3">Data</th>
                              <th className="px-4 py-3 text-right">Valor</th>
                              {canManageExpenses ? <th className="px-5 py-3 text-right">Ações</th> : null}
                            </tr>
                          </thead>
                          <tbody>
                            {visibleTransactions.map((expense) => {
                              const category = categoriesForDisplay.find((item) => item.id === expense.category)
                                ?? {
                                  id: expense.category,
                                  name: expense.category,
                                  label: 'Gasto',
                                  accent: '#475569',
                                  icon: inferExpenseCategoryIconId({ id: expense.category, name: expense.category, icon: undefined }),
                                };
                              const CategoryIcon = getExpenseCategoryIcon(category);
                              const value = realValueMode === 'converted'
                                ? formatRange(getExpenseRealRange(expense, exchangeRates), 'BRL')
                                : formatRange(getExpenseOriginalRange(expense), getExpenseCurrency(expense));

                              return (
                                <tr key={expense.id} className="border-t border-[#eef2f7]">
                                  <td className="px-5 py-2.5">
                                    <div className="flex min-w-0 items-center gap-2.5">
                                      <span
                                        className="grid h-8 w-8 shrink-0 place-items-center rounded-xl"
                                        style={{ backgroundColor: `${category.accent}20`, color: category.accent }}
                                      >
                                        <CategoryIcon className="h-4 w-4" />
                                      </span>
                                      <div className="min-w-0">
                                        <p className="truncate text-sm font-black text-[#0b1326]">{expense.title}</p>
                                        <p className="truncate text-xs font-semibold text-[#667085]">
                                          {expense.detail || countryNames[expense.country ?? 'international']}
                                        </p>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-4 py-2.5">
                                    <span
                                      className="inline-flex max-w-full truncate rounded-full px-2.5 py-1 text-[0.68rem] font-black uppercase"
                                      style={{ backgroundColor: `${category.accent}18`, color: category.accent }}
                                    >
                                      {category.name}
                                    </span>
                                  </td>
                                  <td className="whitespace-nowrap px-4 py-2.5 text-sm font-semibold text-[#45464d]">{formatExpenseDate(expense.createdAt)}</td>
                                  <td className="px-4 py-2.5 text-right text-sm font-black text-[#0b1326]">{value}</td>
                                  {canManageExpenses ? (
                                    <td className="px-5 py-2.5">
                                      <div className="flex justify-end gap-2">
                                        <button
                                          type="button"
                                          aria-label={`Editar ${expense.title}`}
                                          onClick={() => openEditExpenseModal(expense)}
                                          className="grid h-7 w-7 place-items-center rounded-full border border-[#dfe5ee] text-[#667085] transition hover:border-[#007c68] hover:text-[#007c68]"
                                        >
                                          <Edit3 className="h-4 w-4" />
                                        </button>
                                        <button
                                          type="button"
                                          aria-label={`Excluir ${expense.title}`}
                                          onClick={() => setExpensePendingDelete(expense)}
                                          className="grid h-7 w-7 place-items-center rounded-full border border-[#dfe5ee] text-[#667085] transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </button>
                                      </div>
                                    </td>
                                  ) : null}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      <div className="space-y-3 p-4 md:hidden">
                        {visibleTransactions.map((expense) => {
                          const category = categoriesForDisplay.find((item) => item.id === expense.category)
                            ?? {
                              id: expense.category,
                              name: expense.category,
                              label: 'Gasto',
                              accent: '#475569',
                              icon: inferExpenseCategoryIconId({ id: expense.category, name: expense.category, icon: undefined }),
                            };
                          const CategoryIcon = getExpenseCategoryIcon(category);
                          const value = realValueMode === 'converted'
                            ? formatRange(getExpenseRealRange(expense, exchangeRates), 'BRL')
                            : formatRange(getExpenseOriginalRange(expense), getExpenseCurrency(expense));

                          return (
                            <article key={expense.id} className="rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] p-4">
                              <div className="flex items-start gap-3">
                                <span
                                  className="grid h-11 w-11 shrink-0 place-items-center rounded-xl"
                                  style={{ backgroundColor: `${category.accent}20`, color: category.accent }}
                                >
                                  <CategoryIcon className="h-5 w-5" />
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className="font-black text-[#0b1326]">{expense.title}</p>
                                  <p className="mt-1 text-sm font-semibold text-[#667085]">{category.name} · {formatExpenseDate(expense.createdAt)}</p>
                                  <p className="mt-3 text-xl font-black text-[#0b1326]">{value}</p>
                                </div>
                              </div>
                              {canManageExpenses ? (
                                <div className="mt-4 grid grid-cols-2 gap-2">
                                  <button
                                    type="button"
                                    onClick={() => openEditExpenseModal(expense)}
                                    className="h-10 rounded-xl border border-[#dfe5ee] text-sm font-bold text-[#45464d]"
                                  >
                                    Editar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setExpensePendingDelete(expense)}
                                    className="h-10 rounded-xl border border-rose-200 text-sm font-bold text-rose-700"
                                  >
                                    Excluir
                                  </button>
                                </div>
                              ) : null}
                            </article>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <div className="p-5">
                      <ExpensesEmptyState onAddExpense={openNewExpenseModal} />
                    </div>
                  )}

                  {recentTransactions.length > 4 ? (
                    <button
                      type="button"
                      onClick={() => setShowAllTransactions((current) => !current)}
                      className="flex h-12 w-full items-center justify-center border-t border-[#eef2f7] bg-[#f7f8fd] text-sm font-black text-[#007c68] transition hover:bg-[#eef8f6]"
                    >
                      {showAllTransactions ? 'Mostrar menos transações' : 'Ver todas as transações'}
                    </button>
                  ) : null}
                </article>
              </section>

              <section className="relative overflow-hidden rounded-[1.35rem] bg-[#121b2d] p-5 text-white shadow-[0_18px_45px_rgba(15,23,42,0.12)] md:p-6">
                <div className="pointer-events-none absolute -right-20 -top-16 h-72 w-72 rounded-full border border-white/10" />
                <div className="pointer-events-none absolute -right-8 top-8 h-44 w-44 rounded-full border border-white/10" />
                <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                  <div className="flex min-w-0 gap-4">
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#007c68] text-white">
                      <Sparkles className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <h2 className="text-xl font-black md:text-2xl">Insight do TripFlow AI</h2>
                      <p className="mt-1.5 max-w-4xl text-sm font-semibold leading-6 text-[#9ca7bd] md:text-base">
                        {tripflowAiInsight}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setExpenseSyncWarning('Insight calculado localmente. Nenhuma IA ou Edge Function foi acionada automaticamente.')}
                    className="inline-flex h-11 shrink-0 items-center justify-center rounded-full bg-white px-6 text-sm font-bold text-black transition hover:bg-[#eef8f6] md:h-12 md:px-7"
                  >
                    Otimizar Agora
                  </button>
                </div>
              </section>
            </motion.div>
          ) : (
            <NextActionDashboard
              activeGroup={activeGroup}
              categories={categoriesForDisplay}
              expenseStatusMessage={
                isExpenseSaving || isCategorySaving
                  ? t('dashboard.savingExpenses')
                  : isExpenseLoading
                    ? t('dashboard.syncingExpenses')
                    : expenseSyncWarning ?? categorySyncWarning
              }
              expenses={expenses}
              grandTotal={dashboardGrandTotal}
              onAddExpense={openNewExpenseModal}
              onNavigate={handleNavigate}
              onNavigateToProfilePath={handleNavigateToProfilePath}
              totalsByCategory={dashboardTotalsByCategory}
            />
          )}
        </AnimatePresence>
      </div>

      <ExpenseFormModal
        categories={categoriesForDisplay}
        expense={editingExpense}
        isOpen={isModalOpen}
        countryOptions={expenseCountryOptions}
        exchangeRates={exchangeRates}
        onClose={() => {
          setIsModalOpen(false);
          setEditingExpense(null);
        }}
        onSave={(expense) => void handleSaveExpense(expense)}
      />
      <ExpenseCategoryModal
        category={editingExpenseCategory}
        isOpen={isCategoryModalOpen}
        onClose={() => {
          setIsCategoryModalOpen(false);
          setEditingExpenseCategory(null);
        }}
        onSave={(input) => void handleSaveExpenseCategory(input)}
      />
      <AnimatePresence>
        {categoryPendingDelete ? (
          <motion.div
            className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-3 backdrop-blur-sm md:items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={() => setCategoryPendingDelete(null)}
          >
            <motion.div
              className="w-full max-w-lg rounded-[2rem] bg-white p-6 shadow-2xl shadow-slate-950/30"
              initial={{ opacity: 0, y: 28, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 260, damping: 24 }}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="flex items-start gap-4">
                <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-700">
                  <AlertTriangle className="h-6 w-6" />
                </span>
                <div>
                  <p className="text-sm font-black uppercase tracking-[0.18em] text-rose-700">
                    Excluir categoria
                  </p>
                  <h2 className="mt-1 text-2xl font-black text-slate-950">
                    {categoryPendingDelete.linkedExpenses > 0
                      ? 'Esta categoria possui gastos vinculados. O que deseja fazer?'
                      : 'Tem certeza que deseja excluir esta categoria de gastos?'}
                  </h2>
                  <p className="mt-3 text-sm font-semibold leading-6 text-slate-500">
                    {categoryPendingDelete.category.name}
                    {categoryPendingDelete.linkedExpenses > 0
                      ? ` tem ${categoryPendingDelete.linkedExpenses} gasto(s). Os gastos serao movidos antes da exclusao.`
                      : ' sera removida dos modelos desta viagem.'}
                  </p>
                </div>
              </div>

              {categoryPendingDelete.linkedExpenses > 0 ? (
                <div className="mt-6 space-y-3 rounded-2xl bg-slate-50 p-4">
                  <label>
                    <span className="mb-2 block text-sm font-bold text-slate-600">
                      Categoria de destino
                    </span>
                    <select
                      value={categoryMoveTarget}
                      onChange={(event) => setCategoryMoveTarget(event.target.value)}
                      className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 font-semibold text-slate-900 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                    >
                      {categoryDeleteTargets.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : null}

              <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setCategoryPendingDelete(null)}
                  className="h-12 rounded-2xl border border-slate-200 px-5 font-bold text-slate-600 transition hover:bg-slate-50"
                >
                  Cancelar
                </button>
                {categoryPendingDelete.linkedExpenses > 0 ? (
                  <>
                    {categoryDeleteTargets.some((category) => category.id === 'Outros') ? (
                      <button
                        type="button"
                        onClick={() => void handleDeleteExpenseCategory('Outros')}
                        disabled={isCategorySaving}
                        className="h-12 rounded-2xl border border-slate-200 px-5 font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        Mover para Outros
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void handleDeleteExpenseCategory(categoryMoveTarget)}
                      disabled={isCategorySaving || !categoryMoveTarget}
                      className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-rose-600 px-5 font-bold text-white shadow-xl shadow-rose-900/20 transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      <Trash2 className="h-5 w-5" />
                      Mover e excluir
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleDeleteExpenseCategory()}
                    disabled={isCategorySaving}
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-rose-600 px-5 font-bold text-white shadow-xl shadow-rose-900/20 transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    <Trash2 className="h-5 w-5" />
                    Excluir categoria
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <AnimatePresence>
        {expensePendingDelete ? (
          <motion.div
            className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-3 backdrop-blur-sm md:items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={() => setExpensePendingDelete(null)}
          >
            <motion.div
              className="w-full max-w-md rounded-[2rem] bg-white p-6 shadow-2xl shadow-slate-950/30"
              initial={{ opacity: 0, y: 28, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 260, damping: 24 }}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="flex items-start gap-4">
                <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-700">
                  <AlertTriangle className="h-6 w-6" />
                </span>
                <div>
                  <p className="text-sm font-black uppercase tracking-[0.18em] text-rose-700">Excluir gasto</p>
                  <h2 className="mt-1 text-2xl font-black text-slate-950">
                    Tem certeza que deseja excluir este gasto?
                  </h2>
                  <p className="mt-3 text-sm font-semibold leading-6 text-slate-500">
                    {expensePendingDelete.title}
                  </p>
                </div>
              </div>
              <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setExpensePendingDelete(null)}
                  className="h-12 rounded-2xl border border-slate-200 px-5 font-bold text-slate-600 transition hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void handleDeleteExpense(expensePendingDelete)}
                  disabled={isExpenseSaving}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-rose-600 px-5 font-bold text-white shadow-xl shadow-rose-900/20 transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <Trash2 className="h-5 w-5" />
                  Excluir
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </main>
  );
}
