import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Circle, Edit3, MoreVertical, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { countryNames } from '../data/countries';
import type { CategoryMeta, ExchangeRateMap, Expense, RealValueMode } from '../types';
import type { Totals } from '../utils/money';
import {
  formatOriginalCurrencyBreakdown,
  formatRange,
  getExpenseCurrency,
  getExpenseOriginalRange,
  getExpenseRealRange,
} from '../utils/money';
import { getExpenseCategoryIcon } from '../utils/expenseCategoryIcons';
import { getExpenseDateDisplay } from '../utils/expenseDates';
import { LinksMenu } from './LinksMenu';

type ExpenseTableProps = {
  category: CategoryMeta;
  expenses: Expense[];
  total: Totals;
  realValueMode: RealValueMode;
  exchangeRates: ExchangeRateMap;
  canManage?: boolean;
  canManageCategory?: boolean;
  onEdit: (expense: Expense) => void;
  onDelete: (id: string) => void;
  onTogglePaid?: (expense: Expense) => void;
  onEditCategory?: (category: CategoryMeta) => void;
  onDeleteCategory?: (category: CategoryMeta) => void;
};

export function ExpenseTable({
  category,
  expenses,
  total,
  realValueMode,
  exchangeRates,
  canManage = true,
  canManageCategory = false,
  onEdit,
  onDelete,
  onTogglePaid,
  onEditCategory,
  onDeleteCategory,
}: ExpenseTableProps) {
  const [isCategoryMenuOpen, setIsCategoryMenuOpen] = useState(false);
  const CategoryIcon = getExpenseCategoryIcon(category);
  const isOutrosCategory = category.id === 'Outros';
  const getCountryName = (expense: Expense) =>
    expense.country ? countryNames[expense.country] : 'Nao definido';
  const primaryTotal = formatRange(total.real, 'BRL', true);
  const secondaryTotal = realValueMode === 'converted'
    ? formatOriginalCurrencyBreakdown(total.originalByCurrency)
    : 'Valores cadastrados em moeda original';

  return (
    <motion.section
      layout
      className="overflow-hidden rounded-[2rem] border border-white/70 bg-white/85 shadow-xl shadow-slate-900/10 backdrop-blur-xl dark:border-slate-700 dark:bg-slate-900/85 dark:shadow-black/30"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.45 }}
    >
      <div className="flex flex-col gap-2 border-b border-slate-200/80 p-5 dark:border-slate-700 md:flex-row md:items-end md:justify-between md:p-7">
        <div className="flex items-start gap-3">
          <span
            className="mt-1 inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-lg shadow-slate-900/10"
            style={{ backgroundColor: category.accent }}
            aria-hidden="true"
          >
            <CategoryIcon className="h-6 w-6" />
          </span>
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
              {category.label}
            </p>
            <h2 className="mt-1 text-2xl font-black text-slate-950 dark:text-slate-50">
              {category.name}
            </h2>
          </div>
        </div>
        <div className="flex items-start gap-3 md:items-end">
          <div className="text-left md:text-right">
            <AnimatePresence mode="wait">
              <motion.div
                key={`${realValueMode}-${primaryTotal}-${secondaryTotal}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.22 }}
              >
                <strong className="block text-xl font-black text-slate-950 dark:text-slate-50">
                  {primaryTotal}
                </strong>
                <span className="font-semibold text-slate-500 dark:text-slate-300">
                  {secondaryTotal}
                </span>
              </motion.div>
            </AnimatePresence>
            {realValueMode === 'converted' ? (
              <span className="mt-1 block text-xs font-black uppercase tracking-[0.12em] text-teal-700 dark:text-emerald-300">
                Convertido pela cotacao
              </span>
            ) : null}
          </div>
          {canManageCategory ? (
            <div className="relative">
              <button
                type="button"
                aria-label={`Gerenciar categoria ${category.name}`}
                onClick={() => setIsCategoryMenuOpen((current) => !current)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-950 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-50"
              >
                <MoreVertical className="h-5 w-5" />
              </button>
              {isCategoryMenuOpen ? (
                <div className="absolute right-0 top-12 z-20 w-52 overflow-hidden rounded-2xl border border-slate-200 bg-white py-2 text-left shadow-2xl shadow-slate-900/15 dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/30">
                  <button
                    type="button"
                    onClick={() => {
                      setIsCategoryMenuOpen(false);
                      onEditCategory?.(category);
                    }}
                    className="flex w-full items-center gap-2 px-4 py-3 text-sm font-black text-slate-600 transition hover:bg-slate-50 hover:text-teal-700 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-emerald-300"
                  >
                    <Edit3 className="h-4 w-4" />
                    Editar categoria
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCategoryMenuOpen(false);
                      onDeleteCategory?.(category);
                    }}
                    disabled={isOutrosCategory}
                    className="flex w-full items-center gap-2 px-4 py-3 text-sm font-black text-slate-600 transition hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-white disabled:hover:text-slate-600 dark:text-slate-200 dark:hover:bg-rose-500/10 dark:hover:text-rose-300 dark:disabled:hover:bg-slate-900 dark:disabled:hover:text-slate-500"
                  >
                    <Trash2 className="h-4 w-4" />
                    Excluir categoria
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="hidden md:block">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="text-xs uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
              <th className="px-7 py-4 font-black">{category.id === 'lodging' ? 'Cidade' : category.label}</th>
              <th className="px-4 py-4 font-black">Detalhe</th>
              <th className="px-4 py-4 font-black">Data</th>
              <th className="px-4 py-4 font-black">Pais</th>
              <th className="px-4 py-4 font-black">Moeda</th>
              <th className="px-4 py-4 font-black">Real</th>
              <th className="px-4 py-4 text-right font-black">Status</th>
              {canManage ? <th className="px-7 py-4 text-right font-black">Acoes</th> : null}
            </tr>
          </thead>
          <tbody>
            <AnimatePresence initial={false}>
              {expenses.length ? (
                expenses.map((expense) => {
                  const PaidIcon = expense.isPaid ? CheckCircle2 : Circle;
                  const dateDisplay = getExpenseDateDisplay(expense, [category]);

                  return (
                      <motion.tr
                        layout
                        key={expense.id}
                        className="border-t border-slate-100 text-slate-700 dark:border-slate-800 dark:text-slate-300"
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 18 }}
                        transition={{ duration: 0.24 }}
                      >
                        <td className="px-7 py-4 font-bold text-slate-950 dark:text-slate-50">{expense.title}</td>
                        <td className="px-4 py-4 text-slate-500 dark:text-slate-400">{expense.detail || '-'}</td>
                        <td className="px-4 py-4 text-sm font-semibold text-slate-600 dark:text-slate-300">
                          <span className="block">{dateDisplay.label}</span>
                          <span className="block text-xs font-bold text-slate-400 dark:text-slate-500">{dateDisplay.detail}</span>
                        </td>
                        <td className="px-4 py-4">
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            {getCountryName(expense)}
                          </span>
                        </td>
                        <td className="px-4 py-4 font-semibold">
                          {formatRange(getExpenseOriginalRange(expense), getExpenseCurrency(expense))}
                        </td>
                        <td className="px-4 py-4 font-semibold">{formatRange(getExpenseRealRange(expense, exchangeRates), 'BRL')}</td>
                        <td className="px-4 py-4 text-right">
                          <button
                            type="button"
                            onClick={() => onTogglePaid?.(expense)}
                            disabled={!canManage || !onTogglePaid}
                            className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-70 ${
                              expense.isPaid
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-400/10 dark:text-emerald-300'
                                : 'border-slate-200 bg-white text-slate-500 hover:border-teal-300 hover:text-teal-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-emerald-400 dark:hover:text-emerald-300'
                            }`}
                            aria-label={`${expense.isPaid ? 'Marcar como pendente' : 'Marcar como comprado'} ${expense.title}`}
                          >
                            <PaidIcon className="h-4 w-4" />
                            {expense.isPaid ? 'Comprado' : 'Pendente'}
                          </button>
                        </td>
                        {canManage ? (
                          <td className="px-7 py-4">
                            <div className="flex justify-end gap-2">
                              <LinksMenu links={expense.links} align="right" />
                              <button
                                type="button"
                                aria-label={`Editar ${expense.title}`}
                                onClick={() => onEdit(expense)}
                                className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-black text-slate-600 transition hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700 dark:border-slate-700 dark:text-slate-300 dark:hover:border-emerald-500/60 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-300"
                              >
                                <Edit3 className="h-4 w-4" />
                                Editar
                              </button>
                              <button
                                type="button"
                                aria-label={`Excluir ${expense.title}`}
                                onClick={() => onDelete(expense.id)}
                                className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-black text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 dark:border-slate-700 dark:text-slate-300 dark:hover:border-rose-500/60 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
                              >
                                <Trash2 className="h-4 w-4" />
                                Excluir
                              </button>
                            </div>
                          </td>
                        ) : null}
                      </motion.tr>
                  );
                })
              ) : (
                <motion.tr
                  key="empty-expenses"
                  className="border-t border-slate-100 dark:border-slate-800"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <td colSpan={canManage ? 8 : 7} className="px-7 py-8">
                    <p className="rounded-2xl bg-slate-50 px-4 py-4 text-sm font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                      Nenhum gasto cadastrado nesta categoria.
                    </p>
                  </td>
                </motion.tr>
              )}
            </AnimatePresence>
          </tbody>
        </table>
      </div>

      <div className="space-y-3 p-4 md:hidden">
        <AnimatePresence initial={false}>
          {expenses.length ? expenses.map((expense) => {
            const PaidIcon = expense.isPaid ? CheckCircle2 : Circle;
            const dateDisplay = getExpenseDateDisplay(expense, [category]);

            return (
              <motion.article
                layout
                key={expense.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800/70"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-black text-slate-950 dark:text-slate-50">{expense.title}</h3>
                    {expense.detail ? <p className="text-sm text-slate-500 dark:text-slate-400">{expense.detail}</p> : null}
                    <p className="mt-1 text-sm font-bold text-slate-500 dark:text-slate-400">
                      {dateDisplay.label} · {dateDisplay.detail}
                    </p>
                    <span className="mt-2 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600 dark:bg-slate-700 dark:text-slate-200">
                      {getCountryName(expense)}
                    </span>
                    <div className="mt-3">
                      <LinksMenu links={expense.links} />
                    </div>
                  </div>
                  {canManage ? (
                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        aria-label={`Editar ${expense.title}`}
                        onClick={() => onEdit(expense)}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-black text-slate-600 dark:border-slate-700 dark:text-slate-200"
                      >
                        <Edit3 className="h-4 w-4" />
                        Editar
                      </button>
                      <button
                        type="button"
                        aria-label={`Excluir ${expense.title}`}
                        onClick={() => onDelete(expense.id)}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-black text-rose-700 dark:border-slate-700 dark:text-rose-300"
                      >
                        <Trash2 className="h-4 w-4" />
                        Excluir
                      </button>
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => onTogglePaid?.(expense)}
                  disabled={!canManage || !onTogglePaid}
                  className={`mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-70 ${
                    expense.isPaid
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-400/10 dark:text-emerald-300'
                      : 'border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                  }`}
                >
                  <PaidIcon className="h-5 w-5" />
                  {expense.isPaid ? 'Comprado' : 'Pendente'}
                </button>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-900">
                    <p className="text-xs font-bold uppercase text-slate-400 dark:text-slate-500">Moeda</p>
                    <p className="mt-1 font-black text-slate-950 dark:text-slate-50">
                      {formatRange(getExpenseOriginalRange(expense), getExpenseCurrency(expense))}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-900">
                    <p className="text-xs font-bold uppercase text-slate-400 dark:text-slate-500">Real</p>
                    <p className="mt-1 font-black text-slate-950 dark:text-slate-50">{formatRange(getExpenseRealRange(expense, exchangeRates), 'BRL')}</p>
                  </div>
                </div>
              </motion.article>
            );
          }) : (
            <motion.p
              key="empty-expenses"
              className="rounded-2xl bg-slate-50 px-4 py-5 text-sm font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-300"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              Nenhum gasto cadastrado nesta categoria.
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </motion.section>
  );
}
