import { motion } from 'framer-motion';
import { Calculator, ReceiptText } from 'lucide-react';
import type { ExchangeRate, RealValueMode } from '../types';

type ConversionToggleProps = {
  mode: RealValueMode;
  quote: ExchangeRate | null;
  onChange: (mode: RealValueMode) => void;
};

export function ConversionToggle({ mode, quote, onChange }: ConversionToggleProps) {
  const disabled = !quote;

  return (
    <section className="flex flex-col gap-3 rounded-[2rem] border border-white/70 bg-white/80 p-4 shadow-xl shadow-slate-900/10 backdrop-blur-xl dark:border-slate-700 dark:bg-slate-900/85 dark:shadow-black/30 md:flex-row md:items-center md:justify-between md:p-5">
      <div>
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
          Valores em Real
        </p>
        <p className="mt-1 font-semibold text-slate-600 dark:text-slate-300">
          {mode === 'original'
            ? 'Mostrando os valores originais cadastrados.'
            : `Convertendo moedas pela cotacao atual. EUR em R$ ${quote?.rate.toFixed(2).replace('.', ',') ?? '--'}.`}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1 dark:bg-slate-800">
        <button
          type="button"
          onClick={() => onChange('original')}
          className={`relative inline-flex h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-black transition ${
            mode === 'original' ? 'text-white dark:text-slate-950' : 'text-slate-500 hover:text-slate-950 dark:text-slate-300 dark:hover:text-slate-50'
          }`}
        >
          {mode === 'original' ? <motion.span layoutId="conversion-pill" className="absolute inset-0 rounded-xl bg-slate-950 dark:bg-slate-50" /> : null}
          <ReceiptText className="relative h-4 w-4" />
          <span className="relative">Originais</span>
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange('converted')}
          className={`relative inline-flex h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-45 ${
            mode === 'converted' ? 'text-white dark:text-emerald-950' : 'text-slate-500 hover:text-slate-950 dark:text-slate-300 dark:hover:text-slate-50'
          }`}
        >
          {mode === 'converted' ? <motion.span layoutId="conversion-pill" className="absolute inset-0 rounded-xl bg-teal-700 dark:bg-emerald-400" /> : null}
          <Calculator className="relative h-4 w-4" />
          <span className="relative">Convertidos</span>
        </button>
      </div>
    </section>
  );
}
