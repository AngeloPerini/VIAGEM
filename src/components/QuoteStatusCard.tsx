import { motion } from 'framer-motion';
import { ArrowDownRight, ArrowRight, ArrowUpRight, RefreshCw } from 'lucide-react';
import type { ExchangeRate } from '../types';
import { currencyBadges, currencySymbols } from '../services/currencyService';

type QuoteStatusCardProps = {
  rate: ExchangeRate | null;
  isLoading: boolean;
  warning: string | null;
  onRefresh: () => void;
  compact?: boolean;
};

const formatUpdatedAt = (updatedAt?: string) =>
  updatedAt
    ? new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(new Date(updatedAt))
    : 'Sem atualizacao';

export function QuoteStatusCard({
  rate,
  isLoading,
  warning,
  onRefresh,
  compact = false,
}: QuoteStatusCardProps) {
  const variation = rate?.variation ?? 0;
  const isStable = Math.abs(variation) < 0.01;
  const isUp = variation > 0;
  const TrendIcon = isStable ? ArrowRight : isUp ? ArrowUpRight : ArrowDownRight;
  const trendLabel = isStable ? 'estavel' : isUp ? 'em alta' : 'em baixa';

  return (
    <motion.section
      className={`overflow-hidden rounded-[2rem] border border-white/70 bg-white/85 shadow-xl shadow-slate-900/10 backdrop-blur-xl dark:border-slate-700 dark:bg-slate-900/85 dark:shadow-black/30 ${
        compact ? 'p-5' : 'p-6 md:p-8'
      }`}
      animate={rate ? { scale: [1, 1.015, 1] } : undefined}
      transition={{ duration: 0.45 }}
    >
      <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
            Cotacao {rate?.code ?? 'EUR'}/BRL
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-sm font-black text-white dark:bg-emerald-400 dark:text-emerald-950">
              {rate ? currencyBadges[rate.code] : 'FX'}
            </span>
            <h2 className="text-3xl font-black text-slate-950 dark:text-slate-50 md:text-5xl">
              {rate ? `${currencySymbols[rate.code]}1 = R$ ${rate.rate.toFixed(2).replace('.', ',')}` : '--'}
            </h2>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-black ${
                isStable
                  ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                  : isUp
                    ? 'bg-teal-50 text-teal-700 dark:bg-emerald-400/10 dark:text-emerald-200'
                    : 'bg-rose-50 text-rose-700 dark:bg-rose-400/10 dark:text-rose-200'
              }`}
            >
              <TrendIcon className="h-4 w-4" />
              {rate ? `${rate.name} ${trendLabel}` : 'Aguardando cotacao'}
            </span>
            <span className="font-bold text-slate-500 dark:text-slate-300">
              {rate ? `${rate.variation.toFixed(2).replace('.', ',')}%` : 'Sem dados'}
            </span>
          </div>
          <p className="mt-4 text-sm font-semibold text-slate-500 dark:text-slate-300">
            Ultima atualizacao: {formatUpdatedAt(rate?.updatedAt)}
          </p>
          {warning ? (
            <p className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 dark:bg-amber-400/10 dark:text-amber-200">
              {warning}
            </p>
          ) : null}
        </div>

        <motion.button
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 font-bold text-white shadow-xl shadow-slate-900/20 transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-emerald-400 dark:text-emerald-950 dark:hover:bg-emerald-300"
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.98 }}
        >
          <RefreshCw className={`h-5 w-5 ${isLoading ? 'animate-spin' : ''}`} />
          Atualizar cotações
        </motion.button>
      </div>
    </motion.section>
  );
}
