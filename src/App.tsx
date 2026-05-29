import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ConversionToggle } from './components/ConversionToggle';
import { CountryFilter } from './components/CountryFilter';
import { ExpenseCategoryModal } from './components/ExpenseCategoryModal';
import { ExpenseChart } from './components/ExpenseChart';
import { ExpenseFormModal } from './components/ExpenseFormModal';
import { ExpenseTable } from './components/ExpenseTable';
import { ItineraryPage } from './components/ItineraryPage';
import { Navbar, type AppView } from './components/Navbar';
import { NextActionDashboard } from './components/NextActionDashboard';
import { QuotePage } from './components/QuotePage';
import { SummaryCards } from './components/SummaryCards';
import { useAuth } from './contexts/AuthContext';
import { useGroup } from './contexts/GroupContext';
import { useLanguage } from './contexts/LanguageContext';
import { initialExpenses } from './data/initialExpenses';
import { buildCountryOptions, normalizeCountryId } from './data/countries';
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
  resetExpensesToDefault,
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
  type Totals,
} from './utils/money';
import { inferExpenseCategoryIconId } from './utils/expenseCategoryIcons';

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
      <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 md:gap-8 md:py-8 lg:px-8">
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
  const [expenseCountryFilter, setExpenseCountryFilter] = useState<CountryFilterId>('all');
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

  useEffect(() => {
    if (expenseCountryFilter !== 'all' && !expenseCountryOptions.some((country) => country.id === expenseCountryFilter)) {
      setExpenseCountryFilter('all');
    }
  }, [expenseCountryFilter, expenseCountryOptions]);

  const filteredExpenses = useMemo(
    () =>
      expenseCountryFilter === 'all'
        ? scopedExpenses
        : scopedExpenses.filter((expense) => normalizeCountryId(expense.country) === expenseCountryFilter),
    [expenseCountryFilter, scopedExpenses],
  );

  const filteredTotalsByCategory = useMemo(() => {
    const applySourceSheetAdjustment = expenseCountryFilter === 'all';

    return categoriesForDisplay.reduce<Record<string, Totals>>((totals, category) => {
      totals[category.id] = calculateCategoryTotal(
        filteredExpenses,
        category.id,
        exchangeRates,
        applySourceSheetAdjustment,
      );
      return totals;
    }, {});
  }, [categoriesForDisplay, exchangeRates, expenseCountryFilter, filteredExpenses]);

  const filteredGrandTotal = calculateExpensesTotal(
    filteredExpenses,
    exchangeRates,
    expenseCountryFilter === 'all',
  );
  const dashboardTotalsByCategory = useMemo(() => {
    return categoriesForDisplay.reduce<Record<string, Totals>>((totals, category) => {
      totals[category.id] = calculateCategoryTotal(expenses, category.id, exchangeRates);
      return totals;
    }, {});
  }, [categoriesForDisplay, exchangeRates, expenses]);
  const dashboardGrandTotal = calculateExpensesTotal(expenses, exchangeRates);
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

  const handleReset = async () => {
    setIsExpenseSaving(true);

    try {
      setExpenses(await resetExpensesToDefault(groupId));
      setExpenseSyncWarning(null);
    } catch {
      setExpenses(initialExpenses);
      setExpenseSyncWarning('Nao foi possivel restaurar no Supabase. Restauracao aplicada apenas localmente.');
    } finally {
      setEditingExpense(null);
      setIsModalOpen(false);
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

  const tables = (
    <div className="space-y-6">
      <AnimatePresence initial={false}>
        {categoriesForDisplay.map((category) => (
          <ExpenseTable
            key={category.id}
            category={category}
            expenses={filteredExpenses.filter((expense) => expense.category === category.id)}
            total={filteredTotalsByCategory[category.id]}
            realValueMode={realValueMode}
            exchangeRates={exchangeRates}
            canManage={canManageExpenses}
            canManageCategory={canManageExpenses}
            onEdit={openEditExpenseModal}
            onDelete={(id) => {
              const expense = expenses.find((item) => item.id === id && item.category === category.id);
              if (expense) setExpensePendingDelete(expense);
            }}
            onEditCategory={openEditExpenseCategoryModal}
            onDeleteCategory={openDeleteExpenseCategoryDialog}
          />
        ))}
      </AnimatePresence>
    </div>
  );

  return (
    <main className="min-h-screen overflow-hidden bg-[#edf4f2] text-slate-900">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -left-24 top-0 h-96 w-96 rounded-full bg-teal-200/50 blur-3xl" />
        <div className="absolute right-0 top-24 h-[30rem] w-[30rem] rounded-full bg-sky-200/50 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-96 w-96 rounded-full bg-rose-100/70 blur-3xl" />
      </div>

      <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 md:gap-8 md:py-8 lg:px-8">
        <Navbar activeView={activeView} onNavigate={handleNavigate} />

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
              className="space-y-6"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
            >
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-500">
                    {t('dashboard.expensesKicker')}
                  </p>
                  <h1 className="mt-1 text-3xl font-black text-slate-950 md:text-4xl">
                    {t('dashboard.tripItems')}
                  </h1>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={openNewExpenseCategoryModal}
                    disabled={!canManageExpenses}
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 font-bold text-slate-700 shadow-lg shadow-slate-900/5 transition hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Plus className="h-5 w-5" />
                    Adicionar categoria
                  </button>
                  <button
                    type="button"
                    onClick={openNewExpenseModal}
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 font-bold text-white shadow-xl shadow-slate-900/20 transition hover:bg-teal-700"
                  >
                    <Plus className="h-5 w-5" />
                    {t('dashboard.newExpense')}
                  </button>
                </div>
              </div>
              <CountryFilter
                value={expenseCountryFilter}
                onChange={setExpenseCountryFilter}
                label={t('dashboard.filterExpenses')}
                options={expenseCountryOptions}
              />
              {expenseSyncWarning || categorySyncWarning || isExpenseLoading || isExpenseSaving || isCategorySaving ? (
                <p className="rounded-2xl border border-white/70 bg-white/75 px-4 py-3 text-sm font-semibold text-slate-600 shadow-lg shadow-slate-900/5 backdrop-blur-xl">
                  {isExpenseSaving || isCategorySaving
                    ? t('dashboard.savingExpenses')
                    : isExpenseLoading
                      ? t('dashboard.syncingExpenses')
                      : expenseSyncWarning ?? categorySyncWarning}
                </p>
              ) : null}
              <ConversionToggle mode={realValueMode} quote={exchangeRates.EUR ?? null} onChange={setRealValueMode} />
              <SummaryCards
                categories={categoriesForDisplay}
                totalsByCategory={filteredTotalsByCategory}
                grandTotal={filteredGrandTotal}
                realValueMode={realValueMode}
              />
              <ExpenseChart
                categories={categoriesForDisplay}
                totalsByCategory={filteredTotalsByCategory}
              />
              {tables}
            </motion.div>
          ) : (
            <NextActionDashboard
              activeGroup={activeGroup}
              canUseEuropeDefaults={canUseEuropeDefaults}
              categories={categoriesForDisplay}
              exchangeRates={exchangeRates}
              expenseStatusMessage={
                isExpenseSaving || isCategorySaving
                  ? t('dashboard.savingExpenses')
                  : isExpenseLoading
                    ? t('dashboard.syncingExpenses')
                    : expenseSyncWarning ?? categorySyncWarning
              }
              expenses={expenses}
              grandTotal={dashboardGrandTotal}
              isQuoteLoading={isQuoteLoading}
              onAddExpense={openNewExpenseModal}
              onNavigate={handleNavigate}
              onNavigateToProfilePath={handleNavigateToProfilePath}
              onRefreshQuote={() => void refreshQuote()}
              onResetExpenses={() => void handleReset()}
              onValueModeChange={setRealValueMode}
              quoteWarning={quoteWarning}
              realValueMode={realValueMode}
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
