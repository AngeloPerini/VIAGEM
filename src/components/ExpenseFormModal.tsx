import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { countries } from '../data/countries';
import type { CategoryMeta, CountryId, Expense, ExpenseCategoryId } from '../types';
import { parseCurrencyInput, stringifyRangeForInput } from '../utils/money';

type ExpenseFormModalProps = {
  categories: CategoryMeta[];
  expense?: Expense | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (expense: Expense) => void;
};

const createBlankExpense = (category: ExpenseCategoryId): Expense => ({
  id: crypto.randomUUID(),
  category,
  country: 'italy',
  title: '',
  detail: '',
  euro: { min: 0, max: 0 },
  real: { min: 0, max: 0 },
});

export function ExpenseFormModal({
  categories,
  expense,
  isOpen,
  onClose,
  onSave,
}: ExpenseFormModalProps) {
  const [category, setCategory] = useState<ExpenseCategoryId>('lodging');
  const [country, setCountry] = useState<CountryId>('italy');
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [euro, setEuro] = useState('');
  const [real, setReal] = useState('');

  useEffect(() => {
    const source = expense ?? createBlankExpense('lodging');
    setCategory(source.category);
    setCountry(source.country ?? 'italy');
    setTitle(source.title);
    setDetail(source.detail ?? '');
    setEuro(stringifyRangeForInput(source.euro));
    setReal(stringifyRangeForInput(source.real));
  }, [expense, isOpen]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    onSave({
      id: expense?.id ?? crypto.randomUUID(),
      category,
      country,
      title: title.trim(),
      detail: detail.trim(),
      euro: parseCurrencyInput(euro),
      real: parseCurrencyInput(real),
    });
  };

  return (
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-3 backdrop-blur-sm md:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={onClose}
        >
          <motion.form
            onSubmit={handleSubmit}
            className="w-full max-w-2xl rounded-[2rem] bg-white p-5 shadow-2xl shadow-slate-950/30 md:p-7"
            initial={{ opacity: 0, y: 40, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-400">
                  {expense ? 'Editar gasto' : 'Novo gasto'}
                </p>
                <h2 className="mt-1 text-2xl font-black text-slate-950">
                  Atualize o roteiro financeiro
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar"
                className="rounded-2xl border border-slate-200 p-3 text-slate-500 transition hover:bg-slate-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label>
                <span className="mb-2 block text-sm font-bold text-slate-600">Categoria</span>
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value as ExpenseCategoryId)}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 font-semibold text-slate-900 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                >
                  {categories.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span className="mb-2 block text-sm font-bold text-slate-600">Pais</span>
                <select
                  value={country}
                  onChange={(event) => setCountry(event.target.value as CountryId)}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 font-semibold text-slate-900 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                >
                  {countries
                    .filter((item) => item.id !== 'all')
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </select>
              </label>

              <label>
                <span className="mb-2 block text-sm font-bold text-slate-600">Nome</span>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  required
                  placeholder="Ex: Roma"
                  className="h-12 w-full rounded-2xl border border-slate-200 px-4 font-semibold text-slate-900 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                />
              </label>

              <label>
                <span className="mb-2 block text-sm font-bold text-slate-600">Detalhe</span>
                <input
                  value={detail}
                  onChange={(event) => setDetail(event.target.value)}
                  placeholder="Ex: 16 -> 17"
                  className="h-12 w-full rounded-2xl border border-slate-200 px-4 font-semibold text-slate-900 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                />
              </label>

              <label>
                <span className="mb-2 block text-sm font-bold text-slate-600">Euro</span>
                <input
                  value={euro}
                  onChange={(event) => setEuro(event.target.value)}
                  required
                  placeholder="26 a 32"
                  className="h-12 w-full rounded-2xl border border-slate-200 px-4 font-semibold text-slate-900 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                />
              </label>

              <label>
                <span className="mb-2 block text-sm font-bold text-slate-600">Real</span>
                <input
                  value={real}
                  onChange={(event) => setReal(event.target.value)}
                  required
                  placeholder="166 a 205"
                  className="h-12 w-full rounded-2xl border border-slate-200 px-4 font-semibold text-slate-900 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                />
              </label>
            </div>

            <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                className="h-12 rounded-2xl border border-slate-200 px-5 font-bold text-slate-600 transition hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="h-12 rounded-2xl bg-slate-950 px-6 font-bold text-white shadow-xl shadow-slate-900/20 transition hover:bg-teal-700"
              >
                Salvar gasto
              </button>
            </div>
          </motion.form>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
