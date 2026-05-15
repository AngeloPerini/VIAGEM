import { motion } from 'framer-motion';
import { ArrowDownRight, ArrowUpRight, RefreshCw } from 'lucide-react';
import type { CurrencyQuote } from '../types';

type QuoteStatusCardProps = {
  quote: CurrencyQuote | null;
  isLoading: boolean;
  warning: string | null;
  onRefresh: () => void;
  compact?: boolean;
};

const formatUpdatedAt = (timestamp?: number) =>
  timestamp
    ? new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(new Date(timestamp))
    : 'Sem atualizacao';

export function QuoteStatusCard({
  quote,
  isLoading,
  warning,
  onRefresh,
  compact = false,
}: QuoteStatusCardProps) {
  const isUp = (quote?.pctChange ?? 0) >= 0;
  const TrendIcon = isUp ? ArrowUpRight : ArrowDownRight;

  return (
    <motion.section
      className={`overflow-hidden rounded-[2rem] border border-white/70 bg-white/85 shadow-xl shadow-slate-900/10 backdrop-blur-xl ${
        compact ? 'p-5' : 'p-6 md:p-8'
      }`}
      animate={quote ? { scale: [1, 1.015, 1] } : undefined}
      transition={{ duration: 0.45 }}
    >
      <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-400">
            Cotacao EUR/BRL
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <h2 className="text-4xl font-black text-slate-950 md:text-5xl">
              €1 = R$ {quote ? quote.bid.toFixed(2).replace('.', ',') : '--'}
            </h2>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-black ${
                isUp ? 'bg-teal-50 text-teal-700' : 'bg-rose-50 text-rose-700'
              }`}
            >
              <TrendIcon className="h-4 w-4" />
              {isUp ? 'Euro em alta' : 'Euro em baixa'}
            </span>
            <span className="font-bold text-slate-500">
              {quote ? `${quote.pctChange.toFixed(2).replace('.', ',')}%` : 'Aguardando cotacao'}
            </span>
          </div>
          <p className="mt-4 text-sm font-semibold text-slate-500">
            Ultima atualizacao: {formatUpdatedAt(quote?.timestamp)}
          </p>
          {warning ? (
            <p className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
              {warning}
            </p>
          ) : null}
        </div>

        <motion.button
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 font-bold text-white shadow-xl shadow-slate-900/20 transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.98 }}
        >
          <RefreshCw className={`h-5 w-5 ${isLoading ? 'animate-spin' : ''}`} />
          Atualizar Cotacao
        </motion.button>
      </div>
    </motion.section>
  );
}
