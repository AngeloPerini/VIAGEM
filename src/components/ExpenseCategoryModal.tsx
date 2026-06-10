import { AnimatePresence, motion } from 'framer-motion';
import { Save, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { CategoryMeta } from '../types';
import type { ExpenseCategoryInput } from '../services/expenseCategoriesService';
import { expenseCategoryIconOptions, inferExpenseCategoryIconId } from '../utils/expenseCategoryIcons';

type ExpenseCategoryModalProps = {
  category?: CategoryMeta | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (input: ExpenseCategoryInput) => void;
};

const colorOptions = ['#0f766e', '#2563eb', '#db2777', '#7c3aed', '#ea580c', '#0891b2', '#65a30d', '#475569'];

export function ExpenseCategoryModal({
  category,
  isOpen,
  onClose,
  onSave,
}: ExpenseCategoryModalProps) {
  const [name, setName] = useState('');
  const [label, setLabel] = useState('Gasto');
  const [accent, setAccent] = useState('#475569');
  const [sortOrder, setSortOrder] = useState('999');
  const [icon, setIcon] = useState('wallet');

  useEffect(() => {
    setName(category?.name ?? '');
    setLabel(category?.label ?? 'Gasto');
    setAccent(category?.accent ?? '#475569');
    setSortOrder(String(category?.sortOrder ?? 999));
    setIcon(category ? inferExpenseCategoryIconId(category) : 'wallet');
  }, [category, isOpen]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSave({
      name,
      label,
      accent,
      icon,
      sortOrder: Number(sortOrder),
    });
  };

  const SelectedIcon =
    expenseCategoryIconOptions.find((option) => option.id === icon)?.Icon ??
    expenseCategoryIconOptions[expenseCategoryIconOptions.length - 1].Icon;

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
            className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-[2rem] bg-white p-5 shadow-2xl shadow-slate-950/30 dark:border dark:border-slate-700 dark:bg-slate-900 md:p-7"
            initial={{ opacity: 0, y: 40, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                  {category ? 'Editar categoria' : 'Nova categoria'}
                </p>
                <h2 className="mt-1 text-2xl font-black text-slate-950 dark:text-slate-50">
                  Modelo de gasto da viagem
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar"
                className="rounded-2xl border border-slate-200 p-3 text-slate-500 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="md:col-span-2">
                <span className="mb-2 block text-sm font-bold text-slate-600 dark:text-slate-300">Nome da categoria</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  maxLength={60}
                  placeholder="Ex: Combustivel"
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-400 focus:ring-4 focus:ring-teal-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/20"
                />
              </label>

              <label>
                <span className="mb-2 block text-sm font-bold text-slate-600 dark:text-slate-300">Rotulo da coluna</span>
                <input
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  maxLength={40}
                  placeholder="Ex: Gasto"
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-400 focus:ring-4 focus:ring-teal-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/20"
                />
              </label>

              <label>
                <span className="mb-2 block text-sm font-bold text-slate-600 dark:text-slate-300">Ordem</span>
                <input
                  type="number"
                  value={sortOrder}
                  onChange={(event) => setSortOrder(event.target.value)}
                  min={0}
                  step={1}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 font-semibold text-slate-900 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/20"
                />
              </label>

              <div className="md:col-span-2">
                <span className="mb-2 block text-sm font-bold text-slate-600 dark:text-slate-300">Cor</span>
                <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 p-3 dark:border-slate-700 dark:bg-slate-800/60">
                  {colorOptions.map((color) => (
                    <button
                      key={color}
                      type="button"
                      aria-label={`Usar cor ${color}`}
                      onClick={() => setAccent(color)}
                      className={`h-9 w-9 rounded-xl border-2 transition ${
                        accent === color ? 'border-slate-950 shadow-lg shadow-slate-900/15 dark:border-slate-50' : 'border-white dark:border-slate-700'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                  <input
                    type="color"
                    value={accent}
                    onChange={(event) => setAccent(event.target.value)}
                    aria-label="Escolher cor"
                    className="h-9 w-12 rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-800"
                  />
                </div>
              </div>

              <div className="md:col-span-2">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="block text-sm font-bold text-slate-600 dark:text-slate-300">Icone da categoria</span>
                  <span
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-lg shadow-slate-900/10"
                    style={{ backgroundColor: accent }}
                    aria-hidden="true"
                  >
                    <SelectedIcon className="h-5 w-5" />
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2 rounded-2xl border border-slate-200 p-3 dark:border-slate-700 dark:bg-slate-800/60 sm:grid-cols-6">
                  {expenseCategoryIconOptions.map(({ id, label: optionLabel, Icon }) => {
                    const selected = icon === id;

                    return (
                      <button
                        key={id}
                        type="button"
                        aria-label={`Usar icone ${optionLabel}`}
                        aria-pressed={selected}
                        onClick={() => setIcon(id)}
                        className={`flex h-14 flex-col items-center justify-center gap-1 rounded-2xl border text-xs font-black transition ${
                          selected
                            ? 'border-slate-950 bg-slate-950 text-white shadow-lg shadow-slate-900/15 dark:border-emerald-400 dark:bg-emerald-400 dark:text-emerald-950'
                            : 'border-slate-200 bg-white text-slate-500 hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-emerald-500/60 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-300'
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                        <span className="max-w-full truncate px-1">{optionLabel}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                className="h-12 rounded-2xl border border-slate-200 px-5 font-bold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-6 font-bold text-white shadow-xl shadow-slate-900/20 transition hover:bg-teal-700 dark:bg-emerald-400 dark:text-emerald-950 dark:hover:bg-emerald-300"
              >
                <Save className="h-5 w-5" />
                Salvar categoria
              </button>
            </div>
          </motion.form>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
