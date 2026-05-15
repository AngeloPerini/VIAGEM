import { motion } from 'framer-motion';
import { BedDouble, Landmark, Route, WalletCards } from 'lucide-react';
import type { CategoryMeta } from '../types';
import type { Totals } from '../utils/money';
import { formatRange } from '../utils/money';

const icons = {
  lodging: BedDouble,
  transport: Route,
  tours: Landmark,
};

type SummaryCardsProps = {
  categories: CategoryMeta[];
  totalsByCategory: Record<string, Totals>;
  grandTotal: Totals;
};

export function SummaryCards({ categories, totalsByCategory, grandTotal }: SummaryCardsProps) {
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
        <strong className="mt-3 block text-3xl font-black">
          {formatRange(grandTotal.euro, 'EUR', true)}
        </strong>
        <span className="mt-2 block text-lg font-semibold text-teal-100">
          {formatRange(grandTotal.real, 'BRL', true)}
        </span>
      </motion.article>

      {categories.map((category, index) => {
        const Icon = icons[category.id];
        const total = totalsByCategory[category.id];

        return (
          <motion.article
            key={category.id}
            className="rounded-3xl border border-white/70 bg-white/80 p-6 shadow-xl shadow-slate-900/10 backdrop-blur-xl"
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
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
              {category.name}
            </p>
            <strong className="mt-3 block text-2xl font-black text-slate-950">
              {formatRange(total.euro, 'EUR', true)}
            </strong>
            <span className="mt-2 block font-semibold text-slate-500">
              {formatRange(total.real, 'BRL', true)}
            </span>
          </motion.article>
        );
      })}
    </section>
  );
}
