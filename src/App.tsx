import { AnimatePresence, motion } from 'framer-motion';
import { Plus, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ConversionToggle } from './components/ConversionToggle';
import { CountryFilter } from './components/CountryFilter';
import { ExpenseChart } from './components/ExpenseChart';
import { ExpenseFormModal } from './components/ExpenseFormModal';
import { ExpenseTable } from './components/ExpenseTable';
import { Header } from './components/Header';
import { ItineraryPage } from './components/ItineraryPage';
import { Navbar, type AppView } from './components/Navbar';
import { QuotePage } from './components/QuotePage';
import { QuoteStatusCard } from './components/QuoteStatusCard';
import { SummaryCards } from './components/SummaryCards';
import { useAuth } from './contexts/AuthContext';
import { useGroup } from './contexts/GroupContext';
import { categories, initialExpenses } from './data/initialExpenses';
import { AuthPage } from './pages/AuthPage';
import { InvitePage } from './pages/InvitePage';
import { AttractionsPage } from './pages/AttractionsPage';
import { ProfilePage } from './pages/ProfilePage';
import { getPendingInviteToken } from './services/groupsService';
import {
  appendQuoteHistory,
  fetchEuroToBrlQuote,
  loadQuoteHistory,
  loadStoredQuote,
  saveStoredQuote,
} from './services/currencyService';
import {
  cacheExpensesFallback,
  createExpense,
  deleteExpense,
  getCachedExpenses,
  getExpenses,
  resetExpensesToDefault,
  seedExpensesIfEmpty,
  subscribeExpenses,
  updateExpense,
} from './services/expensesService';
import type {
  CountryFilterId,
  CurrencyQuote,
  Expense,
  QuoteHistoryPoint,
  RealValueMode,
} from './types';
import {
  calculateCategoryTotal,
  calculateExpensesTotal,
  formatRange,
  type Totals,
} from './utils/money';

function loadInitialView(): AppView {
  const path = window.location.pathname;
  if (path === '/perfil' || path === '/profile') return 'profile';
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

function StandaloneProfileShell() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#edf4f2] text-slate-900">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -left-24 top-0 h-96 w-96 rounded-full bg-teal-200/50 blur-3xl" />
        <div className="absolute right-0 top-24 h-[30rem] w-[30rem] rounded-full bg-sky-200/50 blur-3xl" />
      </div>
      <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 md:gap-8 md:py-8 lg:px-8">
        <div className="rounded-3xl border border-white/70 bg-white/85 p-4 shadow-xl shadow-slate-900/10 backdrop-blur-xl">
          <p className="text-sm font-black tracking-tight text-slate-950 md:text-base">Controle de Viagem</p>
        </div>
        <ProfilePage />
      </div>
    </main>
  );
}

export default function App() {
  const { loading: authLoading, user } = useAuth();
  const { activeGroup, loading: groupLoading } = useGroup();
  const [inviteRefreshKey, setInviteRefreshKey] = useState(0);
  const inviteToken = getInviteToken();
  const pendingInviteToken = user ? getPendingInviteToken() : null;
  const activeInviteToken = inviteToken ?? pendingInviteToken;
  const isAuthCallback = window.location.pathname === '/auth/callback';
  const isGroupsRoute = window.location.pathname === '/groups';

  useEffect(() => {
    if (!authLoading && user && !groupLoading && isAuthCallback && !activeInviteToken) {
      window.history.replaceState({}, '', activeGroup ? '/dashboard' : '/perfil');
    }
  }, [activeGroup, activeInviteToken, authLoading, groupLoading, isAuthCallback, user]);

  useEffect(() => {
    if (!authLoading && user && !groupLoading && !activeGroup && !activeInviteToken && !isGroupsRoute) {
      window.history.replaceState({}, '', '/perfil');
    }
  }, [activeGroup, activeInviteToken, authLoading, groupLoading, isGroupsRoute, user]);

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
  if (groupLoading && !activeGroup) return <LoadingScreen message="Carregando suas viagens..." />;
  if (!activeGroup) return <StandaloneProfileShell />;

  return <TravelWorkspace key={activeGroup.id} groupId={activeGroup.id} />;
}

function TravelWorkspace({ groupId }: { groupId: string }) {
  const [expenses, setExpenses] = useState<Expense[]>(() => getCachedExpenses(groupId));
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeView, setActiveView] = useState<AppView>(loadInitialView);
  const [realValueMode, setRealValueMode] = useState<RealValueMode>('original');
  const [expenseCountryFilter, setExpenseCountryFilter] = useState<CountryFilterId>('all');
  const [itineraryCountryFilter, setItineraryCountryFilter] = useState<CountryFilterId>('all');
  const [attractionCountryFilter, setAttractionCountryFilter] = useState<CountryFilterId>('all');
  const [quote, setQuote] = useState<CurrencyQuote | null>(loadStoredQuote);
  const [quoteHistory, setQuoteHistory] = useState<QuoteHistoryPoint[]>(loadQuoteHistory);
  const [isQuoteLoading, setIsQuoteLoading] = useState(false);
  const [quoteWarning, setQuoteWarning] = useState<string | null>(null);
  const [expenseSyncWarning, setExpenseSyncWarning] = useState<string | null>(null);
  const [isExpenseLoading, setIsExpenseLoading] = useState(false);
  const [isExpenseSaving, setIsExpenseSaving] = useState(false);

  useEffect(() => {
    let active = true;
    setExpenses(getCachedExpenses(groupId));

    const syncExpenses = async () => {
      try {
        setIsExpenseLoading(true);
        await seedExpensesIfEmpty(groupId);
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
      void channel.unsubscribe();
    };
  }, [groupId]);

  useEffect(() => {
    cacheExpensesFallback(groupId, expenses);
  }, [expenses, groupId]);

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
      const nextQuote = await fetchEuroToBrlQuote();
      saveStoredQuote(nextQuote);
      setQuote(nextQuote);
      setQuoteHistory(appendQuoteHistory(nextQuote));
    } catch {
      const storedQuote = loadStoredQuote();
      if (storedQuote) {
        setQuote(storedQuote);
        setQuoteWarning('Nao foi possivel atualizar agora. Usando a ultima cotacao salva.');
      } else {
        setQuoteWarning('Nao foi possivel buscar a cotacao. Tente atualizar novamente.');
      }
    } finally {
      setIsQuoteLoading(false);
    }

  };

  useEffect(() => {
    void refreshQuote();
  }, []);

  const totalsByCategory = useMemo(() => {
    const conversionRate = realValueMode === 'converted' && quote ? quote.bid : undefined;

    return categories.reduce<Record<string, Totals>>((totals, category) => {
      totals[category.id] = calculateCategoryTotal(expenses, category.id, conversionRate);
      return totals;
    }, {});
  }, [categories, expenses, quote, realValueMode]);

  const filteredExpenses = useMemo(
    () =>
      expenseCountryFilter === 'all'
        ? expenses
        : expenses.filter((expense) => expense.country === expenseCountryFilter),
    [expenseCountryFilter, expenses],
  );

  const filteredTotalsByCategory = useMemo(() => {
    const conversionRate = realValueMode === 'converted' && quote ? quote.bid : undefined;
    const applySourceSheetAdjustment = expenseCountryFilter === 'all';

    return categories.reduce<Record<string, Totals>>((totals, category) => {
      totals[category.id] = calculateCategoryTotal(
        filteredExpenses,
        category.id,
        conversionRate,
        applySourceSheetAdjustment,
      );
      return totals;
    }, {});
  }, [categories, expenseCountryFilter, filteredExpenses, quote, realValueMode]);

  const activeConversionRate = realValueMode === 'converted' && quote ? quote.bid : undefined;
  const grandTotal = calculateExpensesTotal(expenses, activeConversionRate);
  const filteredGrandTotal = calculateExpensesTotal(
    filteredExpenses,
    activeConversionRate,
    expenseCountryFilter === 'all',
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

  const handleDeleteExpense = async (id: string) => {
    const previousExpenses = expenses;
    setExpenses((current) => current.filter((item) => item.id !== id));

    try {
      await deleteExpense(groupId, id);
      setExpenseSyncWarning(null);
    } catch {
      setExpenses(previousExpenses);
      setExpenseSyncWarning('Nao foi possivel excluir no Supabase. Tente novamente.');
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

  const tables = (
    <div className="space-y-6">
      <AnimatePresence initial={false}>
        {categories.map((category) => (
          <ExpenseTable
            key={category.id}
            category={category}
            expenses={filteredExpenses.filter((expense) => expense.category === category.id)}
            total={filteredTotalsByCategory[category.id]}
            realValueMode={realValueMode}
            quote={quote}
            onEdit={openEditExpenseModal}
            onDelete={(id) => void handleDeleteExpense(id)}
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
              quote={quote}
              history={quoteHistory}
              isLoading={isQuoteLoading}
              warning={quoteWarning}
              onRefresh={() => void refreshQuote()}
            />
          ) : activeView === 'itinerary' ? (
            <ItineraryPage
              key="itinerary"
              groupId={groupId}
              selectedCountry={itineraryCountryFilter}
              onCountryChange={setItineraryCountryFilter}
            />
          ) : activeView === 'attractions' ? (
            <AttractionsPage
              key="attractions"
              groupId={groupId}
              selectedCountry={attractionCountryFilter}
              onCountryChange={setAttractionCountryFilter}
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
                    Gastos
                  </p>
                  <h1 className="mt-1 text-3xl font-black text-slate-950 md:text-4xl">
                    Itens da viagem
                  </h1>
                </div>
                <button
                  type="button"
                  onClick={openNewExpenseModal}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 font-bold text-white shadow-xl shadow-slate-900/20 transition hover:bg-teal-700"
                >
                  <Plus className="h-5 w-5" />
                  Novo gasto
                </button>
              </div>
              <CountryFilter
                value={expenseCountryFilter}
                onChange={setExpenseCountryFilter}
                label="Filtrar gastos por pais"
              />
              {expenseSyncWarning || isExpenseLoading || isExpenseSaving ? (
                <p className="rounded-2xl border border-white/70 bg-white/75 px-4 py-3 text-sm font-semibold text-slate-600 shadow-lg shadow-slate-900/5 backdrop-blur-xl">
                  {isExpenseSaving
                    ? 'Salvando gastos no Supabase...'
                    : isExpenseLoading
                      ? 'Sincronizando gastos...'
                      : expenseSyncWarning}
                </p>
              ) : null}
              <ConversionToggle mode={realValueMode} quote={quote} onChange={setRealValueMode} />
              <SummaryCards
                categories={categories}
                totalsByCategory={filteredTotalsByCategory}
                grandTotal={filteredGrandTotal}
                realValueMode={realValueMode}
              />
              <ExpenseChart
                categories={categories}
                totalsByCategory={filteredTotalsByCategory}
              />
              {tables}
            </motion.div>
          ) : (
            <motion.div
              key="dashboard"
              className="space-y-6"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
            >
              <Header onAdd={openNewExpenseModal} />

              <ConversionToggle mode={realValueMode} quote={quote} onChange={setRealValueMode} />
              {expenseSyncWarning || isExpenseLoading || isExpenseSaving ? (
                <p className="rounded-2xl border border-white/70 bg-white/75 px-4 py-3 text-sm font-semibold text-slate-600 shadow-lg shadow-slate-900/5 backdrop-blur-xl">
                  {isExpenseSaving
                    ? 'Salvando gastos no Supabase...'
                    : isExpenseLoading
                      ? 'Sincronizando gastos...'
                      : expenseSyncWarning}
                </p>
              ) : null}

              <SummaryCards
                categories={categories}
                totalsByCategory={totalsByCategory}
                grandTotal={grandTotal}
                realValueMode={realValueMode}
              />

              <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
                <div className="space-y-6">
                  <ExpenseChart categories={categories} totalsByCategory={totalsByCategory} />
                  <QuoteStatusCard
                    quote={quote}
                    isLoading={isQuoteLoading}
                    warning={quoteWarning}
                    onRefresh={() => void refreshQuote()}
                    compact
                  />
                </div>

                <motion.section
                  className="rounded-[2rem] border border-slate-950 bg-slate-950 p-6 text-white shadow-2xl shadow-slate-950/20 xl:sticky xl:top-28 xl:self-start"
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                >
                  <p className="text-sm font-bold uppercase tracking-[0.22em] text-teal-200">
                    Fechamento
                  </p>
                  <h2 className="mt-3 text-3xl font-black">Total geral da viagem</h2>
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
                          <p className="text-sm font-semibold text-slate-400">
                            {realValueMode === 'converted' ? 'Real convertido' : 'Euro'}
                          </p>
                          <p className="text-3xl font-black">
                            {realValueMode === 'converted'
                              ? formatRange(grandTotal.real, 'BRL', true)
                              : formatRange(grandTotal.euro, 'EUR', true)}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-400">
                            {realValueMode === 'converted' ? 'Euro original' : 'Real'}
                          </p>
                          <p className="text-3xl font-black">
                            {realValueMode === 'converted'
                              ? formatRange(grandTotal.euro, 'EUR', true)
                              : formatRange(grandTotal.real, 'BRL', true)}
                          </p>
                        </div>
                      </motion.div>
                    </AnimatePresence>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleReset()}
                    className="mt-7 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white px-5 font-bold text-slate-950 transition hover:bg-teal-100 focus:outline-none focus:ring-4 focus:ring-teal-300"
                  >
                    <RotateCcw className="h-5 w-5" />
                    Resetar dados iniciais
                  </button>
                </motion.section>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <ExpenseFormModal
        categories={categories}
        expense={editingExpense}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingExpense(null);
        }}
        onSave={(expense) => void handleSaveExpense(expense)}
      />
    </main>
  );
}
