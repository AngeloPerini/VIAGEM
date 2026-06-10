import { AnimatePresence, motion } from 'framer-motion';
import { WalletCards } from 'lucide-react';
import type { CategoryMeta, RealValueMode } from '../types';
import type { Totals } from '../utils/money';
import { getExpenseCategoryIcon } from '../utils/expenseCategoryIcons';
import { formatOriginalCurrencyBreakdown, formatRange } from '../utils/money';

type SummaryCardsProps = {
  categories: CategoryMeta[];
  totalsByCategory: Record<string, Totals>;
  grandTotal: Totals;
  realValueMode: RealValueMode;
};

function MoneyPriority({ total, mode, inverted = false }: { total: Totals; mode: RealValueMode; inverted?: boolean }) {
  const primary = formatRange(total.real, 'BRL', true);
  const secondary = mode === 'converted'
    ? formatOriginalCurrencyBreakdown(total.originalByCurrency)
    : 'Valores cadastrados convertidos para BRL';

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={`${mode}-${primary}-${secondary}`}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.22 }}
      >
        <strong className={`mt-3 block font-black ${inverted ? 'text-3xl' : 'text-2xl text-slate-950 dark:text-slate-50'}`}>
          {primary}
        </strong>
        <span className={`mt-2 block font-semibold ${inverted ? 'text-lg text-teal-100' : 'text-slate-500 dark:text-slate-300'}`}>
          {secondary}
        </span>
      </motion.div>
    </AnimatePresence>
  );
}

export function SummaryCards({ categories, totalsByCategory, grandTotal, realValueMode }: SummaryCardsProps) {
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <motion.article
        className="relative overflow-hidden rounded-3xl bg-slate-950 p-6 text-white shadow-2xl shadow-slate-950/20"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        whileHover={{ y: -5 }}
      >
        <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-teal-400/25 blur-2xl" />
        <WalletCards className="mb-7 h-7 w-7 text-teal-200" />
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">
          Total final
        </p>
        <MoneyPriority total={grandTotal} mode={realValueMode} inverted />
      </motion.article>

      {categories.map((category, index) => {
        const Icon = getExpenseCategoryIcon(category);
        const total = totalsByCategory[category.id];

        return (
          <motion.article
            key={category.id}
            className="rounded-3xl border border-white/70 bg-white/80 p-6 shadow-xl shadow-slate-900/10 backdrop-blur-xl dark:border-slate-700 dark:bg-slate-900/85 dark:shadow-black/30"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.14 + index * 0.06 }}
            whileHover={{ y: -5, scale: 1.01 }}
          >
            <div
              className="mb-7 flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-lg"
              style={{ backgroundColor: category.accent }}
            >
              <Icon className="h-6 w-6" />
            </div>
            <p className="text-sm font-semibold tracking-[0.08em] text-slate-500 dark:text-slate-300">
              {category.name}
            </p>
            <MoneyPriority total={total} mode={realValueMode} />
          </motion.article>
        );
      })}
    </section>
  );
}
