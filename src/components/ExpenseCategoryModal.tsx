import { AnimatePresence, motion } from 'framer-motion';
import { Save, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { CategoryMeta } from '../types';
import type { ExpenseCategoryInput } from '../services/expenseCategoriesService';

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

  useEffect(() => {
    setName(category?.name ?? '');
    setLabel(category?.label ?? 'Gasto');
    setAccent(category?.accent ?? '#475569');
    setSortOrder(String(category?.sortOrder ?? 999));
  }, [category, isOpen]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSave({
      name,
      label,
      accent,
      sortOrder: Number(sortOrder),
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
            className="w-full max-w-xl rounded-[2rem] bg-white p-5 shadow-2xl shadow-slate-950/30 md:p-7"
            initial={{ opacity: 0, y: 40, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-400">
                  {category ? 'Editar categoria' : 'Nova categoria'}
                </p>
                <h2 className="mt-1 text-2xl font-black text-slate-950">
                  Modelo de gasto da viagem
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
              <label className="md:col-span-2">
                <span className="mb-2 block text-sm font-bold text-slate-600">Nome da categoria</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  maxLength={60}
                  placeholder="Ex: Combustivel"
                  className="h-12 w-full rounded-2xl border border-slate-200 px-4 font-semibold text-slate-900 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                />
              </label>

              <label>
                <span className="mb-2 block text-sm font-bold text-slate-600">Rotulo da coluna</span>
                <input
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  maxLength={40}
                  placeholder="Ex: Gasto"
                  className="h-12 w-full rounded-2xl border border-slate-200 px-4 font-semibold text-slate-900 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                />
              </label>

              <label>
                <span className="mb-2 block text-sm font-bold text-slate-600">Ordem</span>
                <input
                  type="number"
                  value={sortOrder}
                  onChange={(event) => setSortOrder(event.target.value)}
                  min={0}
                  step={1}
                  className="h-12 w-full rounded-2xl border border-slate-200 px-4 font-semibold text-slate-900 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                />
              </label>

              <div className="md:col-span-2">
                <span className="mb-2 block text-sm font-bold text-slate-600">Cor</span>
                <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 p-3">
                  {colorOptions.map((color) => (
                    <button
                      key={color}
                      type="button"
                      aria-label={`Usar cor ${color}`}
                      onClick={() => setAccent(color)}
                      className={`h-9 w-9 rounded-xl border-2 transition ${
                        accent === color ? 'border-slate-950 shadow-lg shadow-slate-900/15' : 'border-white'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                  <input
                    type="color"
                    value={accent}
                    onChange={(event) => setAccent(event.target.value)}
                    aria-label="Escolher cor"
                    className="h-9 w-12 rounded-xl border border-slate-200 bg-white p-1"
                  />
                </div>
              </div>
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
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-6 font-bold text-white shadow-xl shadow-slate-900/20 transition hover:bg-teal-700"
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
