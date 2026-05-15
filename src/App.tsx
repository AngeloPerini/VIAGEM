import { AnimatePresence, motion } from 'framer-motion';
import { Plus, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ConversionToggle } from './components/ConversionToggle';
import { ExpenseChart } from './components/ExpenseChart';
import { ExpenseFormModal } from './components/ExpenseFormModal';
import { ExpenseTable } from './components/ExpenseTable';
import { Header } from './components/Header';
import { Navbar, type AppView } from './components/Navbar';
import { QuotePage } from './components/QuotePage';
import { QuoteStatusCard } from './components/QuoteStatusCard';
import { SummaryCards } from './components/SummaryCards';
import { categories, initialExpenses, STORAGE_KEY } from './data/initialExpenses';
import {
  appendQuoteHistory,
  fetchEuroToBrlQuote,
  loadQuoteHistory,
  loadStoredQuote,
  saveStoredQuote,
} from './services/currencyService';
import type { CurrencyQuote, Expense, QuoteHistoryPoint, RealValueMode } from './types';
import {
  calculateCategoryTotal,
  calculateGrandTotal,
  formatRange,
  type Totals,
} from './utils/money';

function loadExpenses() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return initialExpenses;

  try {
    return JSON.parse(stored) as Expense[];
  } catch {
    return initialExpenses;
  }
}

function loadInitialView(): AppView {
  const hash = window.location.hash.replace('#', '');
  return hash === 'expenses' || hash === 'quote' ? hash : 'dashboard';
}

export default function App() {
  const [expenses, setExpenses] = useState<Expense[]>(loadExpenses);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeView, setActiveView] = useState<AppView>(loadInitialView);
  const [realValueMode, setRealValueMode] = useState<RealValueMode>('original');
  const [quote, setQuote] = useState<CurrencyQuote | null>(loadStoredQuote);
  const [quoteHistory, setQuoteHistory] = useState<QuoteHistoryPoint[]>(loadQuoteHistory);
  const [isQuoteLoading, setIsQuoteLoading] = useState(false);
  const [quoteWarning, setQuoteWarning] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses));
  }, [expenses]);

  useEffect(() => {
    const syncViewWithHash = () => {
      setActiveView(loadInitialView());
    };

    window.addEventListener('hashchange', syncViewWithHash);
    return () => window.removeEventListener('hashchange', syncViewWithHash);
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
  }, [expenses, quote, realValueMode]);

  const grandTotal = useMemo(
    () => calculateGrandTotal(categories.map((category) => totalsByCategory[category.id])),
    [totalsByCategory],
  );

  const handleSaveExpense = (expense: Expense) => {
    setExpenses((current) => {
      const exists = current.some((item) => item.id === expense.id);
      return exists
        ? current.map((item) => (item.id === expense.id ? expense : item))
        : [expense, ...current];
    });
    setIsModalOpen(false);
    setEditingExpense(null);
  };

  const handleReset = () => {
    setExpenses(initialExpenses);
    setEditingExpense(null);
    setIsModalOpen(false);
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
    window.location.hash = view === 'dashboard' ? '' : view;
  };

  const tables = (
    <div className="space-y-6">
      <AnimatePresence initial={false}>
        {categories.map((category) => (
          <ExpenseTable
            key={category.id}
            category={category}
            expenses={expenses.filter((expense) => expense.category === category.id)}
            total={totalsByCategory[category.id]}
            realValueMode={realValueMode}
            quote={quote}
            onEdit={openEditExpenseModal}
            onDelete={(id) => setExpenses((current) => current.filter((item) => item.id !== id))}
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
          {activeView === 'quote' ? (
            <QuotePage
              key="quote"
              quote={quote}
              history={quoteHistory}
              isLoading={isQuoteLoading}
              warning={quoteWarning}
              onRefresh={() => void refreshQuote()}
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
              <ConversionToggle mode={realValueMode} quote={quote} onChange={setRealValueMode} />
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

              <SummaryCards
                categories={categories}
                totalsByCategory={totalsByCategory}
                grandTotal={grandTotal}
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
                    <div>
                      <p className="text-sm font-semibold text-slate-400">Euro</p>
                      <p className="text-3xl font-black">
                        {formatRange(grandTotal.euro, 'EUR', true)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-400">Real</p>
                      <p className="text-3xl font-black">
                        {formatRange(grandTotal.real, 'BRL', true)}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleReset}
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
        onSave={handleSaveExpense}
      />
    </main>
  );
}
