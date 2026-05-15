import { motion } from 'framer-motion';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { CurrencyQuote, QuoteHistoryPoint } from '../types';
import { QuoteStatusCard } from './QuoteStatusCard';

type QuotePageProps = {
  quote: CurrencyQuote | null;
  history: QuoteHistoryPoint[];
  isLoading: boolean;
  warning: string | null;
  onRefresh: () => void;
};

const formatTime = (timestamp: number) =>
  new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));

export function QuotePage({ quote, history, isLoading, warning, onRefresh }: QuotePageProps) {
  const chartData = history.map((point) => ({
    ...point,
    time: formatTime(point.timestamp),
  }));

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
    >
      <QuoteStatusCard
        quote={quote}
        isLoading={isLoading}
        warning={warning}
        onRefresh={onRefresh}
      />

      <section className="rounded-[2rem] border border-white/70 bg-white/80 p-5 shadow-xl shadow-slate-900/10 backdrop-blur-xl md:p-7">
        <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-400">
              Historico local
            </p>
            <h2 className="mt-1 text-2xl font-black text-slate-950">
              Ultimas atualizacoes
            </h2>
          </div>
          <p className="text-sm font-semibold text-slate-500">
            Salvo neste navegador a cada atualizacao.
          </p>
        </div>

        <div className="h-72 min-w-0">
          <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="quoteGradient" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="5%" stopColor="#0f766e" stopOpacity={0.28} />
                  <stop offset="95%" stopColor="#0f766e" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 8" vertical={false} />
              <XAxis dataKey="time" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
              <YAxis
                domain={['dataMin - 0.02', 'dataMax + 0.02']}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12 }}
                width={48}
              />
              <Tooltip
                formatter={(value) => [`R$ ${Number(value).toFixed(4).replace('.', ',')}`, 'Euro']}
                labelFormatter={(label) => `Atualizado as ${label}`}
                contentStyle={{
                  border: '0',
                  borderRadius: '18px',
                  boxShadow: '0 20px 45px rgba(15, 23, 42, 0.16)',
                  fontWeight: 700,
                }}
              />
              <Area
                type="monotone"
                dataKey="rate"
                stroke="#0f766e"
                strokeWidth={3}
                fill="url(#quoteGradient)"
                animationDuration={800}
                dot={{ r: 4, strokeWidth: 2, fill: '#ffffff' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>
    </motion.div>
  );
}
