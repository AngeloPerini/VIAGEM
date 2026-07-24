import { AnimatePresence, motion } from 'framer-motion';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Circle,
  Edit3,
  FileText,
  Plus,
  ReceiptText,
  Trash2,
  WalletCards,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ExpenseCategoryModal } from './components/ExpenseCategoryModal';
import { ExpenseFormModal } from './components/ExpenseFormModal';
import { AppFooter } from './components/AppFooter';
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
import { TRIP_AI_APPLY_NOTICE_KEY, TripAIReviewPage } from './pages/TripAIReviewPage';
import { getPendingInviteToken } from './services/groupsService';
import {
  appendExchangeRateHistory,
  getCachedExchangeRates,
  loadExchangeRateHistory,
  refreshExchangeRates,
  TRAVEL_CURRENCIES,
} from './services/currencyService';
import {
  cacheExpensesFallback,
  createExpense,
  deleteExpense,
  getCachedExpenses,
  getExpenses,
  setExpensePaid,
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
import { getCurrentProfile } from './services/profileService';
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
  formatExpenseDateLabel,
  getDateInputTimestamp,
  getExpenseDateDisplay,
  getExpenseDateExportLabel,
  getExpensePrimaryTimestamp,
} from './utils/expenseDates';
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
    <main className="flex min-h-screen items-center justify-center bg-[#eef5f3] px-4 text-slate-700 dark:bg-slate-950 dark:text-slate-200">
      <div className="rounded-[2rem] border border-white/80 bg-white/85 px-6 py-5 text-sm font-black shadow-xl shadow-slate-900/10 dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/30">
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
    <main className="min-h-screen overflow-hidden bg-[#edf4f2] text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -left-24 top-0 h-96 w-96 rounded-full bg-teal-200/50 blur-3xl" />
        <div className="absolute right-0 top-24 h-[30rem] w-[30rem] rounded-full bg-sky-200/50 blur-3xl" />
      </div>
      <div className="relative flex min-h-screen w-full flex-col gap-6 px-4 py-5 sm:px-6 md:gap-8 md:py-8 lg:px-10 xl:px-12">
        <div className="rounded-3xl border border-white/70 bg-white/85 p-4 shadow-xl shadow-slate-900/10 backdrop-blur-xl dark:border-slate-700 dark:bg-slate-900/85 dark:shadow-black/30">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="TripFlow" className="h-9 w-9 rounded-xl object-contain" />
            <p className="text-sm font-black tracking-tight text-slate-950 dark:text-slate-50 md:text-base">{t('app.name')}</p>
          </div>
        </div>
        <ProfilePage />
        <AppFooter className="mt-auto" />
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

const getExpenseTimestamp = (expense: Expense, categories: CategoryMeta[] = []) =>
  getExpensePrimaryTimestamp(expense, categories);

const buildExpenseFileSlug = (value?: string) =>
  normalizeText(value || 'viagem')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'viagem';

const formatExpenseDate = (value?: string) => {
  return formatExpenseDateLabel(value);
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
    <div className="rounded-3xl border border-dashed border-slate-300 bg-white/75 px-5 py-8 text-center dark:border-slate-700 dark:bg-slate-900/75">
      <ReceiptText className="mx-auto h-9 w-9 text-[#007c68]" />
      <p className="mt-4 text-lg font-black text-[#0b1326] dark:text-slate-50">Nenhum gasto cadastrado ainda.</p>
      <p className="mx-auto mt-2 max-w-sm text-sm font-semibold leading-6 text-[#667085] dark:text-slate-300">
        Adicione seu primeiro gasto para começar a acompanhar o orçamento da viagem ativa.
      </p>
      <button
        type="button"
        onClick={onAddExpense}
        className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-black px-5 text-sm font-bold text-white transition hover:bg-[#111827] dark:bg-emerald-400 dark:text-emerald-950 dark:hover:bg-emerald-300"
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
  const [originCurrency, setOriginCurrency] = useState<TravelCurrencyCode>('BRL');
  const [isQuoteLoading, setIsQuoteLoading] = useState(false);
  const [quoteWarning, setQuoteWarning] = useState<string | null>(null);
  const [failedQuoteCurrencies, setFailedQuoteCurrencies] = useState<TravelCurrencyCode[]>([]);
  const [expenseSyncWarning, setExpenseSyncWarning] = useState<string | null>(null);
  const [expenseFormError, setExpenseFormError] = useState<string | null>(null);
  const [categorySyncWarning, setCategorySyncWarning] = useState<string | null>(null);
  const [workspaceNotice, setWorkspaceNotice] = useState<string | null>(null);
  const [isExpenseLoading, setIsExpenseLoading] = useState(false);
  const [isExpenseSaving, setIsExpenseSaving] = useState(false);
  const [isCategorySaving, setIsCategorySaving] = useState(false);

  useEffect(() => {
    const notice = sessionStorage.getItem(TRIP_AI_APPLY_NOTICE_KEY);
    if (!notice) return;

    setWorkspaceNotice(notice);
    sessionStorage.removeItem(TRIP_AI_APPLY_NOTICE_KEY);
  }, [groupId]);

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

  useEffect(() => {
    if (!user?.id) {
      setOriginCurrency('BRL');
      return undefined;
    }

    let active = true;
    const updateOriginCurrency = (currency?: string | null) => {
      const normalized = String(currency ?? 'BRL').toUpperCase();
      setOriginCurrency(
        TRAVEL_CURRENCIES.includes(normalized as TravelCurrencyCode)
          ? normalized as TravelCurrencyCode
          : 'BRL',
      );
    };
    const handleOriginCurrencyEvent = (event: Event) => {
      updateOriginCurrency((event as CustomEvent<TravelCurrencyCode>).detail);
    };

    void getCurrentProfile()
      .then((currentProfile) => {
        if (active) updateOriginCurrency(currentProfile?.originCurrency);
      })
      .catch(() => {
        if (active) setOriginCurrency('BRL');
      });

    window.addEventListener('tripflow-origin-currency-updated', handleOriginCurrencyEvent);

    return () => {
      active = false;
      window.removeEventListener('tripflow-origin-currency-updated', handleOriginCurrencyEvent);
    };
  }, [user?.id]);

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

      const timestamp = getExpenseTimestamp(expense, categoriesForDisplay);
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
        return getExpenseTimestamp(b, categoriesForDisplay) - getExpenseTimestamp(a, categoriesForDisplay);
      });

      return expenseViewType === 'recent' ? sorted.slice(0, 8) : sorted;
    },
    [categoriesForDisplay, exchangeRates, expenseViewType, filteredExpenses],
  );
  const visibleTransactions = showAllTransactions ? recentTransactions : recentTransactions.slice(0, 5);
  const selectedTotalLabel = formatRange(filteredGrandTotal.real, 'BRL', true);
  const originalTotalLabel = formatOriginalCurrencyBreakdown(filteredGrandTotal.originalByCurrency);
  const budgetPlannedTotal = useMemo(
    () => calculateExpensesTotal(scopedExpenses, exchangeRates, false),
    [exchangeRates, scopedExpenses],
  );
  const paidExpenses = useMemo(
    () => scopedExpenses.filter((expense) => expense.isPaid),
    [scopedExpenses],
  );
  const budgetPaidTotal = useMemo(
    () => calculateExpensesTotal(paidExpenses, exchangeRates, false),
    [exchangeRates, paidExpenses],
  );
  const plannedBudgetValue = rangeMidpoint(budgetPlannedTotal.real);
  const paidBudgetValue = rangeMidpoint(budgetPaidTotal.real);
  const budgetProgress = plannedBudgetValue > 0 ? (paidBudgetValue / plannedBudgetValue) * 100 : 0;
  const budgetProgressLabel = plannedBudgetValue > 0
    ? `${budgetProgress >= 10 ? Math.round(budgetProgress) : budgetProgress.toFixed(1)}%`
    : '--';
  const budgetProgressWidth = `${Math.min(Math.max(budgetProgress, 0), 100)}%`;
  const isBudgetProgressOver = budgetProgress > 100;
  const budgetProgressText = plannedBudgetValue > 0
    ? `${formatRange(budgetPaidTotal.real, 'BRL', true)} de ${formatRange(budgetPlannedTotal.real, 'BRL', true)} comprados`
    : 'Nenhum gasto cadastrado.';
  const eurQuote = exchangeRates.EUR ?? null;
  const tripDestinations = activeGroup?.countries?.length
    ? activeGroup.countries.map((country) => countryNames[normalizeCountryId(country)]).join(', ')
    : 'destinos em planejamento';
  const topExpenseCategory = expenseCategoryBreakdown[0] ?? null;
  const topCategoryShare = topExpenseCategory && rangeMidpoint(filteredGrandTotal.real) > 0
    ? Math.round((topExpenseCategory.totalReal / rangeMidpoint(filteredGrandTotal.real)) * 100)
    : 0;
  const latestExchangeRate = Object.values(exchangeRates)
    .filter((rate): rate is NonNullable<typeof rate> => Boolean(rate?.updatedAt))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0] ?? null;
  const latestQuoteLabel = latestExchangeRate?.updatedAt ? formatExpenseDate(latestExchangeRate.updatedAt) : 'Cotação indisponível';
  const canManageExpenses = activeGroup?.role === 'owner' || activeGroup?.role === 'member';
  const categoryDeleteTargets = useMemo(
    () =>
      categoryPendingDelete
        ? categoriesForDisplay.filter((category) => category.id !== categoryPendingDelete.category.id)
        : [],
    [categoriesForDisplay, categoryPendingDelete],
  );

  const handleSaveExpense = async (expense: Expense) => {
    if (isExpenseSaving) return;

    const isEditing = expenses.some((item) => item.id === expense.id);
    setIsExpenseSaving(true);
    setExpenseFormError(null);

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
      setExpenseFormError(null);
      setIsModalOpen(false);
      setEditingExpense(null);
    } catch (error) {
      console.error('Nao foi possivel salvar o gasto:', error);
      const message = 'Nao foi possivel salvar a edicao do gasto. Verifique os dados e tente novamente.';
      setExpenseFormError(message);
      setExpenseSyncWarning(message);
    } finally {
      setIsExpenseSaving(false);
    }
  };

  const handleToggleExpensePaid = async (expense: Expense) => {
    if (isExpenseSaving) return;

    const previousExpenses = expenses;
    const nextPaid = !expense.isPaid;
    const paidAt = nextPaid ? new Date().toISOString() : null;
    setIsExpenseSaving(true);
    setExpenseSyncWarning(null);
    setExpenses((current) =>
      current.map((item) =>
        item.id === expense.id
          ? { ...item, isPaid: nextPaid, paidAt }
          : item,
      ),
    );

    try {
      const savedExpense = await setExpensePaid(groupId, expense.id, nextPaid);
      setExpenses((current) =>
        current.map((item) => (item.id === savedExpense.id ? savedExpense : item)),
      );
      setExpenseSyncWarning(null);
    } catch (error) {
      console.error('Nao foi possivel atualizar o status do gasto:', error);
      setExpenses(previousExpenses);
      setExpenseSyncWarning('Nao foi possivel atualizar o status do gasto. Tente novamente.');
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
    setExpenseFormError(null);
    setIsModalOpen(true);
  };

  const openEditExpenseModal = (expense: Expense) => {
    setEditingExpense(expense);
    setExpenseFormError(null);
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
      head: [['Data', 'Pais', 'Categoria', 'Gasto', 'Detalhe', 'Moeda', 'Valor original', 'Valor BRL', 'Status']],
      body: recentTransactions.map((expense) => {
        const category = categoryById.get(expense.category);
        return [
          getExpenseDateExportLabel(expense, categoriesForDisplay),
          countryNames[normalizeCountryId(expense.country)] ?? expense.country ?? 'Internacional',
          category?.name ?? expense.category,
          expense.title,
          expense.detail ?? '',
          getExpenseCurrency(expense),
          formatRange(getExpenseOriginalRange(expense), getExpenseCurrency(expense)),
          formatRange(getExpenseRealRange(expense, exchangeRates), 'BRL'),
          expense.isPaid ? 'Comprado' : 'Pendente',
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
        4: { cellWidth: 120 },
        5: { cellWidth: 44 },
        6: { cellWidth: 78, halign: 'right' },
        7: { cellWidth: 78, halign: 'right' },
        8: { cellWidth: 66 },
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
    <main className="flex min-h-screen w-full max-w-full flex-col overflow-x-hidden bg-[#f7f8fd] text-[#0b1326] dark:bg-slate-950 dark:text-slate-100">
      <Navbar
        activeView={activeView}
        onNavigate={handleNavigate}
        onNavigateToProfilePath={handleNavigateToProfilePath}
      />

      <div className="flex w-full max-w-full min-w-0 flex-1 flex-col gap-6 px-4 py-6 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:px-6 lg:px-10 xl:px-12">
        {workspaceNotice ? (
          <motion.div
            className="flex items-start gap-3 rounded-2xl border border-[#bfe8de] bg-white px-4 py-3 text-sm font-semibold text-[#0b1326] shadow-[0_10px_28px_rgba(15,23,42,0.06)] dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100 dark:shadow-black/30"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {workspaceNotice.includes('mas alguns') ? (
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            ) : (
              <FileText className="mt-0.5 h-5 w-5 shrink-0 text-[#007c68]" />
            )}
            <span className="min-w-0 flex-1">{workspaceNotice}</span>
            <button
              type="button"
              aria-label="Fechar aviso"
              onClick={() => setWorkspaceNotice(null)}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-[#667085] transition hover:bg-[#eef8f6] hover:text-[#007c68] dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-emerald-300"
            >
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        ) : null}

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
              className="w-full max-w-full space-y-5 overflow-x-hidden"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
            >
              <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="min-w-0">
                  <h1 className="text-3xl font-black tracking-tight text-[#0b1326] dark:text-slate-50 md:text-[2.35rem]">
                    Visão Geral de Gastos
                  </h1>
                  <p className="mt-1.5 break-words text-base font-semibold text-[#45464d] dark:text-slate-300">
                    Viagem: {activeGroup?.name ?? 'Viagem ativa'} ({tripDestinations})
                  </p>
                </div>
                <div className="inline-flex w-full min-w-0 flex-wrap items-center gap-2 rounded-full border border-[#dfe5ee] bg-white px-4 py-2.5 text-sm font-bold text-[#45464d] shadow-[0_8px_24px_rgba(15,23,42,0.04)] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:shadow-black/30 sm:w-fit sm:gap-2.5">
                  <WalletCards className="h-4 w-4 text-[#007c68]" />
                  <span>Cotação do dia:</span>
                  <strong className="min-w-0 break-words text-[#0b1326] dark:text-slate-50">
                    1 EUR = {eurQuote ? formatRange({ min: eurQuote.rate, max: eurQuote.rate }, 'BRL') : 'indisponível'}
                  </strong>
                </div>
              </header>

              {expenseSyncWarning || categorySyncWarning || isExpenseLoading || isExpenseSaving || isCategorySaving ? (
                <p className="rounded-2xl border border-[#dfe5ee] bg-white px-4 py-3 text-sm font-semibold text-[#45464d] shadow-[0_8px_24px_rgba(15,23,42,0.04)] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:shadow-black/30">
                  {isExpenseSaving || isCategorySaving
                    ? t('dashboard.savingExpenses')
                    : isExpenseLoading
                      ? t('dashboard.syncingExpenses')
                      : expenseSyncWarning ?? categorySyncWarning}
                </p>
              ) : null}

              <section className="grid gap-5 lg:grid-cols-[minmax(0,2.1fr)_minmax(19rem,1fr)]">
                <article className="rounded-[1.35rem] border border-[#dfe5ee] bg-white p-6 shadow-[0_18px_45px_rgba(15,23,42,0.06)] dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/30 md:p-7">
                  <p className="text-sm font-bold uppercase tracking-[0.16em] text-[#45464d] dark:text-slate-400">Investimento total</p>
                  <div className="mt-4 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end">
                    <h2 className="min-w-0 break-words text-[clamp(1.75rem,8vw,3rem)] font-black leading-tight tracking-tight text-black dark:text-slate-50 md:text-5xl">
                      {selectedTotalLabel}
                    </h2>
                    <span className="pb-1.5 text-sm font-semibold text-[#8c8f9a] dark:text-slate-500">/ orçamento não definido</span>
                  </div>
                  <p className="mt-2.5 break-words text-lg font-black leading-tight text-[#007c68] dark:text-emerald-300 sm:text-xl">{originalTotalLabel}</p>
                  <div className="mt-8">
                    <div className="mb-2.5 flex items-center justify-between gap-4 text-sm font-bold text-[#45464d] dark:text-slate-300">
                      <span>Progresso do Orçamento</span>
                      <span>{budgetProgressLabel}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[#e7edf7] dark:bg-slate-800">
                      <div
                        className={`h-full rounded-full transition-[width] duration-500 ${isBudgetProgressOver ? 'bg-amber-500' : 'bg-[#007c68] dark:bg-emerald-400'}`}
                        style={{ width: budgetProgressWidth }}
                      />
                    </div>
                    <p className="mt-3 text-sm font-black text-[#0b1326] dark:text-slate-100">
                      {budgetProgressText}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-[#8c8f9a] dark:text-slate-400">
                      {plannedBudgetValue > 0
                        ? 'Nenhum orçamento previsto foi definido; o progresso considera os gastos cadastrados.'
                        : 'Adicione gastos e marque os itens comprados para acompanhar o progresso.'}
                    </p>
                  </div>
                </article>

                <div className="grid gap-4">
                  <button
                    type="button"
                    onClick={openNewExpenseModal}
                    disabled={!canManageExpenses}
                    className="group flex min-h-32 flex-col items-center justify-center rounded-[1.35rem] bg-black p-5 text-white shadow-[0_18px_45px_rgba(15,23,42,0.12)] transition hover:-translate-y-0.5 hover:bg-[#111827] disabled:cursor-not-allowed disabled:opacity-60 dark:bg-emerald-400 dark:text-emerald-950 dark:shadow-black/30 dark:hover:bg-emerald-300"
                  >
                    <span className="grid h-12 w-12 place-items-center rounded-full bg-white/10 transition group-hover:bg-white/15">
                      <Plus className="h-7 w-7" />
                    </span>
                    <span className="mt-3 text-xl font-black">Novo Gasto</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleExportExpensesPdf}
                      className="flex min-h-20 min-w-0 items-center justify-between gap-4 rounded-[1.35rem] border border-[#cfd6e2] bg-white p-5 text-left shadow-[0_12px_28px_rgba(15,23,42,0.04)] transition hover:border-[#007c68] dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/30 dark:hover:border-emerald-400"
                  >
                        <span className="flex min-w-0 items-center gap-4">
                      <span className="grid h-11 w-11 place-items-center rounded-full bg-[#eef8f6] text-[#007c68] dark:bg-emerald-400/10 dark:text-emerald-300">
                        <FileText className="h-5 w-5" />
                      </span>
                      <span className="text-base font-black leading-tight text-[#0b1326] dark:text-slate-50">
                        Exportar<br />Relatório PDF
                      </span>
                    </span>
                    <ArrowRight className="h-5 w-5 text-[#45464d] dark:text-slate-300" />
                  </button>
                </div>
              </section>

              <section className="rounded-[1.35rem] border border-[#dfe5ee] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.05)] dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/30 md:p-6">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-[#007c68] dark:text-emerald-300">Controle financeiro</p>
                    <h2 className="mt-1 text-xl font-black text-[#0b1326] dark:text-slate-50">Filtros de gastos</h2>
                    <p className="mt-1.5 text-sm font-semibold text-[#667085] dark:text-slate-300">
                      {filteredExpenses.length} de {scopedExpenses.length} gasto{scopedExpenses.length === 1 ? '' : 's'} da viagem ativa.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {hasExpenseFilters ? (
                      <button
                        type="button"
                        onClick={handleClearExpenseFilters}
                        className="inline-flex h-10 items-center justify-center rounded-full border border-[#dfe5ee] bg-white px-4 text-sm font-black text-[#006b57] transition hover:border-[#006b57] hover:bg-[#eef8f6] dark:border-slate-700 dark:bg-slate-800 dark:text-emerald-300 dark:hover:border-emerald-400 dark:hover:bg-slate-700"
                      >
                        Limpar filtros
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={handleExportExpensesPdf}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-[#dfe5ee] bg-[#f8fafc] px-4 text-sm font-black text-[#0b1326] transition hover:border-[#007c68] hover:text-[#007c68] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-emerald-400 dark:hover:text-emerald-300"
                    >
                      <FileText className="h-4 w-4" />
                      Exportar PDF
                    </button>
                  </div>
                </div>

                <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(16rem,0.32fr)]">
                  <div className="min-w-0 space-y-5">
                    <div>
                      <div className="mb-2.5 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                        <span className="text-xs font-black uppercase tracking-[0.14em] text-[#667085] dark:text-slate-400">País</span>
                        <span className="text-xs font-bold text-[#98a2b3] dark:text-slate-500">Totais seguem o país selecionado</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {expenseCountryOptions.map((country) => {
                          const active = expenseCountryFilter === country.id;
                          return (
                            <button
                              key={country.id}
                              type="button"
                              onClick={() => setExpenseCountryFilter(country.id)}
                              aria-pressed={active}
                              className={`inline-flex min-h-10 min-w-0 items-center rounded-full border px-4 py-2 text-center text-sm font-black leading-tight transition ${
                                active
                                  ? 'border-black bg-black text-white shadow-[0_10px_24px_rgba(15,23,42,0.12)] dark:border-emerald-400 dark:bg-emerald-400 dark:text-emerald-950'
                                  : 'border-[#dfe5ee] bg-[#f8fafc] text-[#45464d] hover:border-[#007c68] hover:text-[#007c68] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-emerald-400 dark:hover:text-emerald-300'
                              }`}
                            >
                              {country.shortName}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <div className="mb-2.5 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                        <span className="text-xs font-black uppercase tracking-[0.14em] text-[#667085] dark:text-slate-400">Categoria</span>
                        <span className="text-xs font-bold text-[#98a2b3] dark:text-slate-500">Categorias reais do grupo ativo</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setExpenseCategoryFilter('all')}
                          aria-pressed={expenseCategoryFilter === 'all'}
                          className={`inline-flex min-h-10 min-w-0 items-center rounded-full border px-4 py-2 text-center text-sm font-black leading-tight transition ${
                            expenseCategoryFilter === 'all'
                              ? 'border-[#007c68] bg-[#007c68] text-white shadow-[0_10px_24px_rgba(0,124,104,0.16)] dark:border-emerald-400 dark:bg-emerald-400 dark:text-emerald-950'
                              : 'border-[#dfe5ee] bg-[#f8fafc] text-[#45464d] hover:border-[#007c68] hover:text-[#007c68] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-emerald-400 dark:hover:text-emerald-300'
                          }`}
                        >
                          Todos
                        </button>
                        {categoriesForDisplay.map((category) => {
                          const active = expenseCategoryFilter === category.id;
                          const CategoryIcon = getExpenseCategoryIcon(category);
                          return (
                            <button
                              key={category.id}
                              type="button"
                              onClick={() => setExpenseCategoryFilter(category.id)}
                              aria-pressed={active}
                              className={`inline-flex min-h-10 min-w-0 items-center gap-2 rounded-full border px-4 py-2 text-center text-sm font-black leading-tight transition ${
                                active
                                  ? 'border-[#007c68] bg-[#007c68] text-white shadow-[0_10px_24px_rgba(0,124,104,0.16)] dark:border-emerald-400 dark:bg-emerald-400 dark:text-emerald-950'
                                  : 'border-[#dfe5ee] bg-[#f8fafc] text-[#45464d] hover:border-[#007c68] hover:text-[#007c68] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-emerald-400 dark:hover:text-emerald-300'
                              }`}
                            >
                              <CategoryIcon className="h-4 w-4" />
                              {category.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] p-4 dark:border-slate-700 dark:bg-slate-800/60">
                      <p className="text-xs font-black uppercase tracking-[0.14em] text-[#667085] dark:text-slate-400">Filtros avançados</p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
                        <label className="sm:col-span-2 lg:col-span-1 2xl:col-span-2">
                          <span className="mb-1.5 block text-xs font-black uppercase tracking-[0.12em] text-[#667085] dark:text-slate-400">Buscar</span>
                          <input
                            value={expenseSearchFilter}
                            onChange={(event) => setExpenseSearchFilter(event.target.value)}
                            placeholder="Nome, detalhe, pais..."
                            className="h-11 w-full rounded-xl border border-[#dfe5ee] bg-white px-3.5 text-sm font-semibold text-[#0b1326] outline-none transition placeholder:text-[#98a2b3] focus:border-[#007c68] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:border-emerald-400"
                          />
                        </label>

                        <label>
                          <span className="mb-1.5 block text-xs font-black uppercase tracking-[0.12em] text-[#667085] dark:text-slate-400">Moeda</span>
                          <select
                            value={expenseCurrencyFilter}
                            onChange={(event) => setExpenseCurrencyFilter(event.target.value as TravelCurrencyCode | 'all')}
                            className="h-11 w-full rounded-xl border border-[#dfe5ee] bg-white px-3 text-sm font-semibold text-[#0b1326] outline-none transition focus:border-[#007c68] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:focus:border-emerald-400"
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
                          <span className="mb-1.5 block text-xs font-black uppercase tracking-[0.12em] text-[#667085] dark:text-slate-400">De</span>
                          <input
                            type="date"
                            value={expenseDateFromFilter}
                            onChange={(event) => setExpenseDateFromFilter(event.target.value)}
                            onInput={(event) => setExpenseDateFromFilter(event.currentTarget.value)}
                            className="h-11 w-full rounded-xl border border-[#dfe5ee] bg-white px-3 text-sm font-semibold text-[#0b1326] outline-none transition focus:border-[#007c68] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:focus:border-emerald-400"
                          />
                        </label>

                        <label>
                          <span className="mb-1.5 block text-xs font-black uppercase tracking-[0.12em] text-[#667085] dark:text-slate-400">Até</span>
                          <input
                            type="date"
                            value={expenseDateToFilter}
                            onChange={(event) => setExpenseDateToFilter(event.target.value)}
                            onInput={(event) => setExpenseDateToFilter(event.currentTarget.value)}
                            className="h-11 w-full rounded-xl border border-[#dfe5ee] bg-white px-3 text-sm font-semibold text-[#0b1326] outline-none transition focus:border-[#007c68] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:focus:border-emerald-400"
                          />
                        </label>

                        <label>
                          <span className="mb-1.5 block text-xs font-black uppercase tracking-[0.12em] text-[#667085] dark:text-slate-400">Valor mín.</span>
                          <input
                            inputMode="decimal"
                            value={expenseMinValueFilter}
                            onChange={(event) => setExpenseMinValueFilter(event.target.value)}
                            placeholder="BRL"
                            className="h-11 w-full rounded-xl border border-[#dfe5ee] bg-white px-3.5 text-sm font-semibold text-[#0b1326] outline-none transition placeholder:text-[#98a2b3] focus:border-[#007c68] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:border-emerald-400"
                          />
                        </label>

                        <label>
                          <span className="mb-1.5 block text-xs font-black uppercase tracking-[0.12em] text-[#667085] dark:text-slate-400">Valor máx.</span>
                          <input
                            inputMode="decimal"
                            value={expenseMaxValueFilter}
                            onChange={(event) => setExpenseMaxValueFilter(event.target.value)}
                            placeholder="BRL"
                            className="h-11 w-full rounded-xl border border-[#dfe5ee] bg-white px-3.5 text-sm font-semibold text-[#0b1326] outline-none transition placeholder:text-[#98a2b3] focus:border-[#007c68] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:border-emerald-400"
                          />
                        </label>
                      </div>
                    </div>
                  </div>

                  <aside className="rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] p-4 dark:border-slate-700 dark:bg-slate-800/60">
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-[#667085] dark:text-slate-400">Exibição</p>
                    <div className="mt-3 grid grid-cols-2 rounded-full border border-[#dfe5ee] bg-white p-1 dark:border-slate-700 dark:bg-slate-900">
                      <button
                        type="button"
                        onClick={() => setRealValueMode('original')}
                          className={`min-h-10 rounded-full px-3 py-2 text-sm font-black leading-tight transition ${
                          realValueMode === 'original' ? 'bg-black text-white shadow-sm dark:bg-slate-50 dark:text-slate-950' : 'text-[#667085] hover:text-black dark:text-slate-300 dark:hover:text-slate-50'
                        }`}
                      >
                        Originais
                      </button>
                      <button
                        type="button"
                        onClick={() => setRealValueMode('converted')}
                          className={`min-h-10 rounded-full px-3 py-2 text-sm font-black leading-tight transition ${
                          realValueMode === 'converted' ? 'bg-[#007c68] text-white shadow-sm dark:bg-emerald-400 dark:text-emerald-950' : 'text-[#667085] hover:text-black dark:text-slate-300 dark:hover:text-slate-50'
                        }`}
                      >
                        Convertidos
                      </button>
                    </div>

                    <div className="mt-5">
                      <p className="text-xs font-black uppercase tracking-[0.14em] text-[#667085] dark:text-slate-400">Lista</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {([
                          ['all', 'Todos'],
                          ['recent', 'Recentes'],
                          ['highest', 'Maiores'],
                        ] as const).map(([id, label]) => (
                          <button
                            key={id}
                            type="button"
                            onClick={() => setExpenseViewType(id)}
                             className={`inline-flex min-h-9 min-w-0 items-center rounded-full border px-3.5 py-1.5 text-center text-sm font-black leading-tight transition ${
                              expenseViewType === id
                                ? 'border-[#007c68] bg-[#007c68] text-white dark:border-emerald-400 dark:bg-emerald-400 dark:text-emerald-950'
                                : 'border-[#dfe5ee] bg-white text-[#667085] hover:border-[#007c68] hover:text-[#007c68] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-emerald-400 dark:hover:text-emerald-300'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </aside>
                </div>
              </section>

              <section className="grid gap-5 lg:grid-cols-[minmax(17rem,0.72fr)_minmax(0,1.8fr)] lg:items-start">
                <article className="self-start rounded-[1.35rem] border border-[#dfe5ee] bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)] dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/30 md:p-6">
                  <div className="flex items-center justify-between gap-4">
                    <h2 className="text-xl font-black text-[#0b1326] dark:text-slate-50">Categorias</h2>
                    <button
                      type="button"
                      onClick={openNewExpenseCategoryModal}
                      disabled={!canManageExpenses}
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-[#dfe5ee] px-3.5 text-sm font-bold text-[#45464d] transition hover:border-[#007c68] hover:text-[#007c68] disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:border-emerald-400 dark:hover:text-emerald-300"
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
                      <div className="absolute inset-6 grid place-items-center rounded-full bg-white text-center shadow-inner dark:bg-slate-950">
                        <p className="text-xs font-semibold text-[#45464d] dark:text-slate-300">Total</p>
                        <p className="text-lg font-black text-[#0b1326] dark:text-slate-50">
                          {filteredExpenses.length} {filteredExpenses.length === 1 ? 'item' : 'itens'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 space-y-2.5">
                    {categoriesForManagement.map(({ category, count, total }) => (
                      <div key={category.id} className="group flex items-center justify-between gap-3 rounded-2xl px-1 py-1.5 dark:hover:bg-slate-800/60">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: category.accent }} />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-[#45464d] dark:text-slate-300">{category.name}</p>
                            <p className="text-xs font-semibold text-[#8c8f9a] dark:text-slate-500">
                              {count} {count === 1 ? 'item' : 'itens'}
                            </p>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="min-w-0 break-words text-right text-xs font-black leading-tight text-[#0b1326] dark:text-slate-50 sm:text-sm">{formatRange(total.real, 'BRL', true)}</span>
                          {canManageExpenses ? (
                            <span className="flex opacity-100 md:opacity-0 md:transition md:group-hover:opacity-100">
                              <button
                                type="button"
                                aria-label={`Editar categoria ${category.name}`}
                                onClick={() => openEditExpenseCategoryModal(category)}
                                className="grid h-7 w-7 place-items-center rounded-full text-[#667085] transition hover:bg-[#eef8f6] hover:text-[#007c68] dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-emerald-300"
                              >
                                <Edit3 className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                aria-label={`Excluir categoria ${category.name}`}
                                onClick={() => openDeleteExpenseCategoryDialog(category)}
                                className="grid h-7 w-7 place-items-center rounded-full text-[#667085] transition hover:bg-rose-50 hover:text-rose-700 dark:text-slate-400 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
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

                <article className="overflow-hidden rounded-[1.35rem] border border-[#dfe5ee] bg-white shadow-[0_18px_45px_rgba(15,23,42,0.06)] dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/30">
                  <div className="flex flex-col gap-4 border-b border-[#e8ecf4] p-5 dark:border-slate-700 md:flex-row md:items-center md:justify-between">
                    <h2 className="text-xl font-black text-[#0b1326] dark:text-slate-50 md:text-2xl">Transações Recentes</h2>
                    <p className="inline-flex w-fit items-center rounded-full border border-[#dfe5ee] bg-[#f8fafc] px-4 py-2 text-sm font-black text-[#667085] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      {realValueMode === 'converted' ? 'Valores convertidos em BRL' : 'Valores originais cadastrados'}
                    </p>
                  </div>

                  {visibleTransactions.length ? (
                    <>
                      <div className={`hidden md:block ${showAllTransactions ? 'max-h-[28rem] overflow-y-auto' : ''}`}>
                        <table className="w-full table-fixed border-collapse text-left">
                          <colgroup>
                            <col className="w-[31%]" />
                            <col className="w-[16%]" />
                            <col className="w-[13%]" />
                            <col className="w-[14%]" />
                            <col className="w-[14%]" />
                            {canManageExpenses ? <col className="w-[12%]" /> : null}
                          </colgroup>
                          <thead className={showAllTransactions ? 'sticky top-0 z-10 bg-white shadow-[0_1px_0_#eef2f7] dark:bg-slate-900 dark:shadow-[0_1px_0_#1e293b]' : undefined}>
                            <tr className="text-sm font-black text-[#45464d] dark:text-slate-300">
                              <th className="px-5 py-3">Gasto</th>
                              <th className="px-4 py-3">Categoria</th>
                              <th className="whitespace-nowrap px-4 py-3">Data</th>
                              <th className="px-4 py-3 text-right">Valor</th>
                              <th className="px-4 py-3 text-right">Status</th>
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
                              const PaidIcon = expense.isPaid ? CheckCircle2 : Circle;
                              const value = realValueMode === 'converted'
                                ? formatRange(getExpenseRealRange(expense, exchangeRates), 'BRL')
                                : formatRange(getExpenseOriginalRange(expense), getExpenseCurrency(expense));
                              const dateDisplay = getExpenseDateDisplay(expense, [category]);

                              return (
                                <tr key={expense.id} className="border-t border-[#eef2f7] dark:border-slate-800">
                                  <td className="px-5 py-2.5">
                                    <div className="flex min-w-0 items-center gap-2.5">
                                      <span
                                        className="grid h-8 w-8 shrink-0 place-items-center rounded-xl"
                                        style={{ backgroundColor: `${category.accent}20`, color: category.accent }}
                                      >
                                        <CategoryIcon className="h-4 w-4" />
                                      </span>
                                      <div className="min-w-0">
                                        <p className="truncate text-sm font-black text-[#0b1326] dark:text-slate-50">{expense.title}</p>
                                        <p className="truncate text-xs font-semibold text-[#667085] dark:text-slate-400">
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
                                  <td className="whitespace-nowrap px-4 py-2.5 text-sm font-semibold text-[#45464d] dark:text-slate-300">
                                    <span className="block">{dateDisplay.label}</span>
                                    <span className="block text-xs font-bold text-[#8c8f9a] dark:text-slate-500">{dateDisplay.detail}</span>
                                  </td>
                                  <td className="px-4 py-2.5 text-right text-sm font-black text-[#0b1326] dark:text-slate-50">{value}</td>
                                  <td className="px-4 py-2.5">
                                    <button
                                      type="button"
                                      onClick={() => void handleToggleExpensePaid(expense)}
                                      disabled={!canManageExpenses || isExpenseSaving}
                                      className={`ml-auto inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-70 ${
                                        expense.isPaid
                                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-400/10 dark:text-emerald-300'
                                          : 'border-[#dfe5ee] bg-white text-[#667085] hover:border-[#007c68] hover:text-[#007c68] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-emerald-400 dark:hover:text-emerald-300'
                                      }`}
                                      aria-label={`${expense.isPaid ? 'Marcar como pendente' : 'Marcar como comprado'} ${expense.title}`}
                                    >
                                      <PaidIcon className="h-4 w-4" />
                                      {expense.isPaid ? 'Comprado' : 'Pendente'}
                                    </button>
                                  </td>
                                  {canManageExpenses ? (
                                    <td className="px-5 py-2.5">
                                      <div className="flex justify-end gap-2">
                                        <button
                                          type="button"
                                          aria-label={`Editar ${expense.title}`}
                                          onClick={() => openEditExpenseModal(expense)}
                                          className="grid h-7 w-7 place-items-center rounded-full border border-[#dfe5ee] text-[#667085] transition hover:border-[#007c68] hover:text-[#007c68] dark:border-slate-700 dark:text-slate-400 dark:hover:border-emerald-400 dark:hover:text-emerald-300"
                                        >
                                          <Edit3 className="h-4 w-4" />
                                        </button>
                                        <button
                                          type="button"
                                          aria-label={`Excluir ${expense.title}`}
                                          onClick={() => setExpensePendingDelete(expense)}
                                          className="grid h-7 w-7 place-items-center rounded-full border border-[#dfe5ee] text-[#667085] transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 dark:border-slate-700 dark:text-slate-400 dark:hover:border-rose-500/60 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
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
                          const PaidIcon = expense.isPaid ? CheckCircle2 : Circle;
                          const value = realValueMode === 'converted'
                            ? formatRange(getExpenseRealRange(expense, exchangeRates), 'BRL')
                            : formatRange(getExpenseOriginalRange(expense), getExpenseCurrency(expense));
                          const dateDisplay = getExpenseDateDisplay(expense, [category]);

                          return (
                            <article key={expense.id} className="min-w-0 rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] p-4 dark:border-slate-700 dark:bg-slate-800/70">
                              <div className="flex items-start gap-3">
                                <span
                                  className="grid h-11 w-11 shrink-0 place-items-center rounded-xl"
                                  style={{ backgroundColor: `${category.accent}20`, color: category.accent }}
                                >
                                  <CategoryIcon className="h-5 w-5" />
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className="break-words font-black leading-tight text-[#0b1326] dark:text-slate-50">{expense.title}</p>
                                  <p className="mt-1 break-words text-sm font-semibold leading-5 text-[#667085] dark:text-slate-400">
                                    {category.name} · {dateDisplay.label}
                                  </p>
                                  <p className="mt-0.5 text-xs font-bold text-[#8c8f9a] dark:text-slate-500">{dateDisplay.detail}</p>
                                  <p className="mt-3 break-words text-lg font-black leading-tight text-[#0b1326] dark:text-slate-50 sm:text-xl">{value}</p>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => void handleToggleExpensePaid(expense)}
                                disabled={!canManageExpenses || isExpenseSaving}
                                className={`mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-black leading-tight transition disabled:cursor-not-allowed disabled:opacity-70 ${
                                  expense.isPaid
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-400/10 dark:text-emerald-300'
                                    : 'border-[#dfe5ee] bg-white text-[#667085] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                                }`}
                                aria-label={`${expense.isPaid ? 'Marcar como pendente' : 'Marcar como comprado'} ${expense.title}`}
                              >
                                <PaidIcon className="h-5 w-5" />
                                {expense.isPaid ? 'Comprado' : 'Pendente'}
                              </button>
                              {canManageExpenses ? (
                                <div className="mt-4 grid grid-cols-2 gap-2">
                                  <button
                                    type="button"
                                    onClick={() => openEditExpenseModal(expense)}
                                    className="min-h-10 rounded-xl border border-[#dfe5ee] px-3 py-2 text-sm font-bold leading-tight text-[#45464d] dark:border-slate-700 dark:text-slate-300"
                                  >
                                    Editar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setExpensePendingDelete(expense)}
                                    className="min-h-10 rounded-xl border border-rose-200 px-3 py-2 text-sm font-bold leading-tight text-rose-700 dark:border-rose-500/50 dark:text-rose-300"
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
                      className="flex min-h-12 w-full min-w-0 items-center justify-center border-t border-[#eef2f7] bg-[#f7f8fd] px-4 py-3 text-center text-sm font-black leading-tight text-[#007c68] transition hover:bg-[#eef8f6] dark:border-slate-700 dark:bg-slate-800 dark:text-emerald-300 dark:hover:bg-slate-700"
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
                      <ReceiptText className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <h2 className="text-xl font-black md:text-2xl">Resumo financeiro</h2>
                      <dl className="mt-3 grid gap-x-8 gap-y-2 text-sm font-semibold text-[#c8d0dd] sm:grid-cols-2 xl:grid-cols-4">
                        <div>
                          <dt className="text-[#7f8aa2]">Maior categoria</dt>
                          <dd className="mt-1 text-white">
                            {topExpenseCategory ? `${topExpenseCategory.category.name} (${topCategoryShare}%)` : 'Sem gastos'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[#7f8aa2]">Total filtrado</dt>
                          <dd className="mt-1 text-white">{selectedTotalLabel}</dd>
                        </div>
                        <div>
                          <dt className="text-[#7f8aa2]">Transações</dt>
                          <dd className="mt-1 text-white">{filteredExpenses.length}</dd>
                        </div>
                        <div>
                          <dt className="text-[#7f8aa2]">Última cotação</dt>
                          <dd className="mt-1 text-white">{latestQuoteLabel}</dd>
                        </div>
                      </dl>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleExportExpensesPdf}
                    className="inline-flex h-11 shrink-0 items-center justify-center rounded-full bg-white px-6 text-sm font-bold text-black transition hover:bg-[#eef8f6] dark:bg-emerald-400 dark:text-emerald-950 dark:hover:bg-emerald-300 md:h-12 md:px-7"
                  >
                    Exportar PDF
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
        <AppFooter className="mt-auto" />
      </div>

      <ExpenseFormModal
        categories={categoriesForDisplay}
        expense={editingExpense}
        isOpen={isModalOpen}
        countryOptions={expenseCountryOptions}
        exchangeRates={exchangeRates}
        defaultCurrency={originCurrency}
        tripStartDate={activeGroup?.startDate}
        tripEndDate={activeGroup?.endDate}
        errorMessage={expenseFormError}
        isSaving={isExpenseSaving}
        onClose={() => {
          setIsModalOpen(false);
          setEditingExpense(null);
          setExpenseFormError(null);
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
              className="w-full max-w-lg rounded-[2rem] bg-white p-6 shadow-2xl shadow-slate-950/30 dark:border dark:border-slate-700 dark:bg-slate-900"
              initial={{ opacity: 0, y: 28, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 260, damping: 24 }}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="flex items-start gap-4">
                <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
                  <AlertTriangle className="h-6 w-6" />
                </span>
                <div>
                  <p className="text-sm font-black uppercase tracking-[0.18em] text-rose-700 dark:text-rose-300">
                    Excluir categoria
                  </p>
                  <h2 className="mt-1 text-2xl font-black text-slate-950 dark:text-slate-50">
                    {categoryPendingDelete.linkedExpenses > 0
                      ? 'Esta categoria possui gastos vinculados. O que deseja fazer?'
                      : 'Tem certeza que deseja excluir esta categoria de gastos?'}
                  </h2>
                  <p className="mt-3 text-sm font-semibold leading-6 text-slate-500 dark:text-slate-300">
                    {categoryPendingDelete.category.name}
                    {categoryPendingDelete.linkedExpenses > 0
                      ? ` tem ${categoryPendingDelete.linkedExpenses} gasto(s). Os gastos serao movidos antes da exclusao.`
                      : ' sera removida dos modelos desta viagem.'}
                  </p>
                </div>
              </div>

              {categoryPendingDelete.linkedExpenses > 0 ? (
                <div className="mt-6 space-y-3 rounded-2xl bg-slate-50 p-4 dark:bg-slate-800">
                  <label>
                    <span className="mb-2 block text-sm font-bold text-slate-600 dark:text-slate-300">
                      Categoria de destino
                    </span>
                    <select
                      value={categoryMoveTarget}
                      onChange={(event) => setCategoryMoveTarget(event.target.value)}
                      className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 font-semibold text-slate-900 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/20"
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
                  className="h-12 rounded-2xl border border-slate-200 px-5 font-bold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
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
                        className="h-12 rounded-2xl border border-slate-200 px-5 font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
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
              className="w-full max-w-md rounded-[2rem] bg-white p-6 shadow-2xl shadow-slate-950/30 dark:border dark:border-slate-700 dark:bg-slate-900"
              initial={{ opacity: 0, y: 28, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 260, damping: 24 }}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="flex items-start gap-4">
                <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
                  <AlertTriangle className="h-6 w-6" />
                </span>
                <div>
                  <p className="text-sm font-black uppercase tracking-[0.18em] text-rose-700 dark:text-rose-300">Excluir gasto</p>
                  <h2 className="mt-1 text-2xl font-black text-slate-950 dark:text-slate-50">
                    Tem certeza que deseja excluir este gasto?
                  </h2>
                  <p className="mt-3 text-sm font-semibold leading-6 text-slate-500 dark:text-slate-300">
                    {expensePendingDelete.title}
                  </p>
                </div>
              </div>
              <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setExpensePendingDelete(null)}
                  className="h-12 rounded-2xl border border-slate-200 px-5 font-bold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
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
