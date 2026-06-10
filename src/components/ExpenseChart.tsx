import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { ReactNode } from 'react';
import type { CategoryMeta } from '../types';
import type { Totals } from '../utils/money';
import { formatRange } from '../utils/money';

type ExpenseChartProps = {
  categories: CategoryMeta[];
  totalsByCategory: Record<string, Totals>;
  eyebrow?: string;
  title?: string;
  description?: string;
  summary?: ReactNode;
  className?: string;
};

export function ExpenseChart({
  categories,
  totalsByCategory,
  eyebrow = 'Distribuicao',
  title = 'Peso por categoria',
  description = 'O grafico usa a media dos valores convertidos para real para mostrar a proporcao dos gastos planejados.',
  summary,
  className = '',
}: ExpenseChartProps) {
  const data = categories.map((category) => {
    const total = totalsByCategory[category.id];
    return {
      name: category.name,
      color: category.accent,
      totalReal: (total.real.min + total.real.max) / 2,
      real: total.real,
    };
  });

  return (
    <section className={`grid gap-6 rounded-[2rem] border border-white/70 bg-white/80 p-5 shadow-xl shadow-slate-900/10 backdrop-blur-xl dark:border-slate-700 dark:bg-slate-900/85 dark:shadow-black/30 lg:grid-cols-[0.9fr_1.1fr] lg:p-7 ${className}`}>
      <div>
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
          {eyebrow}
        </p>
        <h2 className="mt-2 text-2xl font-black text-slate-950 dark:text-slate-50">
          {title}
        </h2>
        <p className="mt-3 leading-7 text-slate-600 dark:text-slate-300">
          {description}
        </p>
        {summary ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {summary}
          </div>
        ) : null}
        <div className="mt-6 space-y-3">
          {data.map((item) => (
            <div key={item.name} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-200">
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                {item.name}
              </span>
              <span className="text-sm font-bold text-slate-500 dark:text-slate-300">
                {formatRange(item.real, 'BRL', true)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="h-72 min-h-72 min-w-0">
        <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              dataKey="totalReal"
              innerRadius="58%"
              outerRadius="82%"
              paddingAngle={4}
              animationDuration={900}
            >
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value) => [formatRange({ min: Number(value), max: Number(value) }, 'BRL', true), 'Media']}
              contentStyle={{
                backgroundColor: 'var(--chart-tooltip-bg)',
                border: '1px solid var(--border)',
                borderRadius: '18px',
                boxShadow: '0 20px 45px rgba(15, 23, 42, 0.16)',
                color: 'var(--chart-tooltip-fg)',
                fontWeight: 700,
              }}
              itemStyle={{ color: 'var(--chart-tooltip-fg)', fontWeight: 700 }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
