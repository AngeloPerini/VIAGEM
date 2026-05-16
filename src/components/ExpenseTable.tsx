import { AnimatePresence, motion } from 'framer-motion';
import { Edit3, Trash2 } from 'lucide-react';
import { countryNames } from '../data/countries';
import type { CategoryMeta, CurrencyQuote, Expense, RealValueMode } from '../types';
import type { Totals } from '../utils/money';
import { convertEuroRangeToReal, formatRange } from '../utils/money';

type ExpenseTableProps = {
  category: CategoryMeta;
  expenses: Expense[];
  total: Totals;
  realValueMode: RealValueMode;
  quote: CurrencyQuote | null;
  onEdit: (expense: Expense) => void;
  onDelete: (id: string) => void;
};

export function ExpenseTable({
  category,
  expenses,
  total,
  realValueMode,
  quote,
  onEdit,
  onDelete,
}: ExpenseTableProps) {
  const getRealRange = (expense: Expense) =>
    realValueMode === 'converted' && quote
      ? convertEuroRangeToReal(expense.euro, quote.bid)
      : expense.real;
  const getCountryName = (expense: Expense) =>
    expense.country ? countryNames[expense.country] : 'Nao definido';
  const primaryTotal =
    realValueMode === 'converted'
      ? formatRange(total.real, 'BRL', true)
      : formatRange(total.euro, 'EUR', true);
  const secondaryTotal =
    realValueMode === 'converted'
      ? formatRange(total.euro, 'EUR', true)
      : formatRange(total.real, 'BRL', true);

  return (
    <motion.section
      layout
      className="overflow-hidden rounded-[2rem] border border-white/70 bg-white/85 shadow-xl shadow-slate-900/10 backdrop-blur-xl"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.45 }}
    >
      <div className="flex flex-col gap-2 border-b border-slate-200/80 p-5 md:flex-row md:items-end md:justify-between md:p-7">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-400">
            {category.label}
          </p>
          <h2 className="mt-1 text-2xl font-black text-slate-950">
            {category.name}
          </h2>
        </div>
        <div className="text-left md:text-right">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${realValueMode}-${primaryTotal}-${secondaryTotal}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22 }}
            >
              <strong className="block text-xl font-black text-slate-950">
                {primaryTotal}
              </strong>
              <span className="font-semibold text-slate-500">
                {secondaryTotal}
              </span>
            </motion.div>
          </AnimatePresence>
          {realValueMode === 'converted' ? (
            <span className="mt-1 block text-xs font-black uppercase tracking-[0.12em] text-teal-700">
              Convertido pela cotacao
            </span>
          ) : null}
        </div>
      </div>

      <div className="hidden md:block">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="text-xs uppercase tracking-[0.16em] text-slate-400">
              <th className="px-7 py-4 font-black">{category.id === 'lodging' ? 'Cidade' : category.label}</th>
              <th className="px-4 py-4 font-black">Detalhe</th>
              <th className="px-4 py-4 font-black">Pais</th>
              <th className="px-4 py-4 font-black">Euro</th>
              <th className="px-4 py-4 font-black">Real</th>
              <th className="px-7 py-4 text-right font-black">Acoes</th>
            </tr>
          </thead>
          <tbody>
            <AnimatePresence initial={false}>
              {expenses.map((expense) => (
                <motion.tr
                  layout
                  key={expense.id}
                  className="border-t border-slate-100 text-slate-700"
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 18 }}
                  transition={{ duration: 0.24 }}
                >
                  <td className="px-7 py-4 font-bold text-slate-950">{expense.title}</td>
                  <td className="px-4 py-4 text-slate-500">{expense.detail || '-'}</td>
                  <td className="px-4 py-4">
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
                      {getCountryName(expense)}
                    </span>
                  </td>
                  <td className="px-4 py-4 font-semibold">{formatRange(expense.euro, 'EUR')}</td>
                  <td className="px-4 py-4 font-semibold">{formatRange(getRealRange(expense), 'BRL')}</td>
                  <td className="px-7 py-4">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        aria-label={`Editar ${expense.title}`}
                        onClick={() => onEdit(expense)}
                        className="rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700"
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Excluir ${expense.title}`}
                        onClick={() => onDelete(expense.id)}
                        className="rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </AnimatePresence>
          </tbody>
        </table>
      </div>

      <div className="space-y-3 p-4 md:hidden">
        <AnimatePresence initial={false}>
          {expenses.map((expense) => (
            <motion.article
              layout
              key={expense.id}
              className="rounded-2xl border border-slate-200 bg-white p-4"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-black text-slate-950">{expense.title}</h3>
                  {expense.detail ? <p className="text-sm text-slate-500">{expense.detail}</p> : null}
                  <span className="mt-2 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
                    {getCountryName(expense)}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    aria-label={`Editar ${expense.title}`}
                    onClick={() => onEdit(expense)}
                    className="rounded-xl border border-slate-200 p-2 text-slate-500"
                  >
                    <Edit3 className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Excluir ${expense.title}`}
                    onClick={() => onDelete(expense.id)}
                    className="rounded-xl border border-slate-200 p-2 text-slate-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-slate-50 p-3">
                  <p className="text-xs font-bold uppercase text-slate-400">Euro</p>
                  <p className="mt-1 font-black text-slate-950">{formatRange(expense.euro, 'EUR')}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <p className="text-xs font-bold uppercase text-slate-400">Real</p>
                  <p className="mt-1 font-black text-slate-950">{formatRange(getRealRange(expense), 'BRL')}</p>
                </div>
              </div>
            </motion.article>
          ))}
        </AnimatePresence>
      </div>
    </motion.section>
  );
}
