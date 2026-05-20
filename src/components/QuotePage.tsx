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
import { ArrowDownRight, ArrowRight, ArrowUpRight, RefreshCw } from 'lucide-react';
import type { ExchangeRate, ExchangeRateHistory, ExchangeRateMap, TravelCurrencyCode } from '../types';
import {
  currencyBadges,
  currencySymbols,
  QUOTED_TRAVEL_CURRENCIES,
} from '../services/currencyService';

type QuotePageProps = {
  rates: ExchangeRateMap;
  history: ExchangeRateHistory;
  isLoading: boolean;
  warning: string | null;
  failedCurrencies: TravelCurrencyCode[];
  selectedCurrency: TravelCurrencyCode;
  onSelectedCurrencyChange: (currency: TravelCurrencyCode) => void;
  onRefresh: () => void;
};

const formatTime = (timestamp: number) =>
  new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));

const formatUpdatedAt = (updatedAt?: string) =>
  updatedAt
    ? new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(new Date(updatedAt))
    : 'Sem atualizacao';

function RateCard({
  rate,
  code,
  isFailed,
  onSelect,
}: {
  rate: ExchangeRate | undefined;
  code: Exclude<TravelCurrencyCode, 'BRL'>;
  isFailed: boolean;
  onSelect: () => void;
}) {
  const variation = rate?.variation ?? 0;
  const isStable = Math.abs(variation) < 0.01;
  const isUp = variation > 0;
  const TrendIcon = isStable ? ArrowRight : isUp ? ArrowUpRight : ArrowDownRight;
  const trendLabel = isStable ? 'estável' : isUp ? 'alta' : 'baixa';

  return (
    <button
      type="button"
      onClick={onSelect}
      className="min-h-[13rem] rounded-[2rem] border border-white/70 bg-white/85 p-5 text-left shadow-xl shadow-slate-900/10 transition hover:-translate-y-1 hover:bg-white"
    >
      <div className="flex items-start justify-between gap-4">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-sm font-black text-white">
          {currencyBadges[code]}
        </span>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.1em] ${
            isFailed
              ? 'bg-amber-50 text-amber-700'
              : isStable
                ? 'bg-slate-100 text-slate-600'
                : isUp
                  ? 'bg-teal-50 text-teal-700'
                  : 'bg-rose-50 text-rose-700'
          }`}
        >
          <TrendIcon className="h-4 w-4" />
          {isFailed ? 'cache' : trendLabel}
        </span>
      </div>

      <p className="mt-5 text-sm font-black uppercase tracking-[0.16em] text-slate-400">{code}</p>
      <h3 className="mt-1 text-xl font-black text-slate-950">{rate?.name ?? code}</h3>
      <p className="mt-4 text-2xl font-black text-slate-950">
        {rate ? `1 ${code} = R$ ${rate.rate.toFixed(code === 'JPY' ? 4 : 2).replace('.', ',')}` : `${currencySymbols[code]} --`}
      </p>
      <div className="mt-3 flex flex-wrap gap-2 text-sm font-bold text-slate-500">
        <span>{rate ? `${rate.variation.toFixed(2).replace('.', ',')}%` : 'Sem cotação'}</span>
        <span>•</span>
        <span>{formatUpdatedAt(rate?.updatedAt)}</span>
      </div>
      {rate?.status === 'cached' ? (
        <p className="mt-3 text-xs font-black uppercase tracking-[0.12em] text-amber-700">Última salva</p>
      ) : null}
    </button>
  );
}

export function QuotePage({
  rates,
  history,
  isLoading,
  warning,
  failedCurrencies,
  selectedCurrency,
  onSelectedCurrencyChange,
  onRefresh,
}: QuotePageProps) {
  const selectedRate = rates[selectedCurrency];
  const chartData = (history[selectedCurrency] ?? []).map((point) => ({
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
      <section className="rounded-[2rem] border border-white/70 bg-white/85 p-5 shadow-xl shadow-slate-900/10 backdrop-blur-xl md:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-400">
              Cotação ao vivo
            </p>
            <h1 className="mt-2 text-3xl font-black text-slate-950 md:text-4xl">
              Moedas de viagem para BRL
            </h1>
            <p className="mt-3 max-w-3xl text-sm font-bold leading-6 text-slate-500">
              Base em real brasileiro, com cache local para manter a página útil quando a API oscilar.
            </p>
            {warning ? (
              <p className="mt-4 inline-flex rounded-2xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
                {warning}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 font-black text-white shadow-xl shadow-slate-900/20 transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`h-5 w-5 ${isLoading ? 'animate-spin' : ''}`} />
            Atualizar cotações
          </button>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {QUOTED_TRAVEL_CURRENCIES.map((code) => (
          <RateCard
            key={code}
            code={code}
            rate={rates[code]}
            isFailed={failedCurrencies.includes(code)}
            onSelect={() => onSelectedCurrencyChange(code)}
          />
        ))}
      </section>

      <section className="rounded-[2rem] border border-white/70 bg-white/80 p-5 shadow-xl shadow-slate-900/10 backdrop-blur-xl md:p-7">
        <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-400">
              Histórico local
            </p>
            <h2 className="mt-1 text-2xl font-black text-slate-950">
              {selectedRate?.name ?? selectedCurrency} / BRL
            </h2>
          </div>
          <select
            value={selectedCurrency}
            onChange={(event) => onSelectedCurrencyChange(event.target.value as TravelCurrencyCode)}
            className="h-12 rounded-2xl border border-slate-200 bg-white px-4 font-black text-slate-800 outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
          >
            {QUOTED_TRAVEL_CURRENCIES.map((code) => (
              <option key={code} value={code}>{code}</option>
            ))}
          </select>
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
                width={56}
              />
              <Tooltip
                formatter={(value) => [`R$ ${Number(value).toFixed(selectedCurrency === 'JPY' ? 4 : 2).replace('.', ',')}`, selectedCurrency]}
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
