import { motion } from 'framer-motion';
import {
  CheckCircle2,
  FileText,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  RefreshCcw,
  Route,
  Sparkles,
  Trash2,
  WalletCards,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { countryLabel } from '../data/countries';
import { useLanguage } from '../contexts/LanguageContext';
import {
  applyTripPlan,
  clearTripAIReview,
  generateTripPlan,
  getStoredTripAIReview,
  storeTripAIReview,
  updateTripGenerationFeedback,
} from '../services/tripAIService';
import type {
  Attraction,
  Expense,
  ItineraryItem,
  ItineraryType,
  TripAIDocument,
  TripAIInput,
  TripAIPlan,
  TripAIRoute,
  TripAIReviewState,
  TravelCurrencyCode,
} from '../types';
import { TRAVEL_CURRENCIES } from '../services/currencyService';
import { formatRange, getExpenseCurrency, getExpenseOriginalRange } from '../utils/money';

const typeLabels: Record<string, string> = {
  arrival: 'Chegada',
  lodging: 'Hospedagem',
  tour: 'Passeio',
  transport: 'Transporte',
  food: 'Alimentacao',
  flight: 'Voo',
  train: 'Trem',
  motorhome: 'Motorhome',
  shopping: 'Compras',
  document: 'Documento',
  rest: 'Descanso',
  other: 'Outro',
};

const feedbackPlaceholder = 'Opcional: deixe uma observacao sobre o roteiro gerado.';

const navigateTo = (path: string) => {
  window.history.replaceState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
};

export const TRIP_AI_APPLY_NOTICE_KEY = 'tripflow-ai-apply-notice-v1';

const getApplySuccessMessage = (result: Awaited<ReturnType<typeof applyTripPlan>>) => {
  if (result.documents.failed) {
    return 'Roteiro aplicado, mas alguns documentos não foram adicionados.';
  }

  if (result.documents.created > 0) {
    return 'Roteiro aplicado com sucesso. Documentos necessários foram adicionados ao checklist.';
  }

  if (result.documents.attempted > 0) {
    return 'Roteiro aplicado com sucesso. Os documentos sugeridos já estavam no checklist.';
  }

  return 'Roteiro aplicado com sucesso.';
};

const createDocument = (): TripAIDocument => ({ title: 'Documento', detail: '' });

const createRoute = (): TripAIRoute => ({
  from: 'Origem',
  to: 'Destino',
  transport: 'Transporte',
  duration: '',
  estimatedCost: '',
  notes: '',
});

const createItineraryItem = (): ItineraryItem => ({
  id: crypto.randomUUID(),
  day: 'Dia 1',
  country: 'international',
  city: '',
  time: '',
  title: 'Nova atividade',
  description: '',
  type: 'tour',
  completed: false,
  links: [],
});

const createExpense = (): Expense => ({
  id: crypto.randomUUID(),
  category: 'Outros',
  country: 'international',
  title: 'Gasto planejado',
  detail: 'Valor aproximado planejado.',
  currency: 'EUR',
  amount: 0,
  euro: { min: 0, max: 0 },
  real: { min: 0, max: 0 },
  links: [],
});

const createAttraction = (): Attraction => ({
  id: crypto.randomUUID(),
  name: 'Novo ponto turistico',
  country: 'international',
  city: '',
  day: 'Dia 1',
  time: '',
  description: '',
  links: [],
});

const updateListItem = <T,>(items: T[], index: number, patch: Partial<T>) =>
  items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item));

const removeListItem = <T,>(items: T[], index: number) =>
  items.filter((_, itemIndex) => itemIndex !== index);

const numberValue = (value: number | undefined) => (Number.isFinite(value) ? String(value) : '');

const parseMoney = (value: string) => {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};

const validatePlan = (plan: TripAIPlan) => {
  if (!plan.summary.trim()) return 'Informe um resumo para a viagem.';
  if (!plan.itinerary_items.length) return 'O roteiro precisa ter pelo menos um item.';
  if (plan.itinerary_items.some((item) => !item.day.trim() || !item.title.trim())) {
    return 'Todos os itens do roteiro precisam de dia e titulo.';
  }
  if (plan.expenses.some((expense) => !expense.category.trim() || !expense.title.trim())) {
    return 'Todos os gastos precisam de categoria e descricao.';
  }
  if (plan.attractions.some((attraction) => !attraction.name.trim())) {
    return 'Todos os pontos turisticos precisam de nome.';
  }
  return null;
};

const parseTripDate = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) ? null : date;
};

const getTripDayCount = (input: TripAIInput) => {
  const start = parseTripDate(input.startDate);
  const end = parseTripDate(input.endDate);
  if (!start || !end || end < start) return 1;
  return Math.max(1, Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1);
};

const getDayNumber = (day: string) => {
  const match = /(?:dia|day)\s*(\d{1,3})/i.exec(day) ?? /^(\d{1,3})(?:\D|$)/.exec(day);
  const value = Number(match?.[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
};

const getPlanCompletenessWarning = (plan: TripAIPlan, input: TripAIInput) => {
  const dayCount = getTripDayCount(input);
  const minimumItems = dayCount > 15 ? dayCount : dayCount * 3;

  if (plan.itinerary_items.length < minimumItems) {
    return `Foram gerados ${plan.itinerary_items.length} itens para ${dayCount} dias. O minimo esperado e ${minimumItems}.`;
  }

  const countsByDay = plan.itinerary_items.reduce<Record<number, number>>((counts, item) => {
    const dayNumber = getDayNumber(item.day);
    if (!dayNumber) return counts;
    counts[dayNumber] = (counts[dayNumber] ?? 0) + 1;
    return counts;
  }, {});

  const thinDays = Array.from({ length: dayCount }, (_, index) => index + 1)
    .filter((day) => (countsByDay[day] ?? 0) === 1);

  if (dayCount <= 15 && thinDays.length) {
    return `Dias com apenas uma atividade: ${thinDays.map((day) => `Dia ${day}`).join(', ')}.`;
  }

  return null;
};

function EmptyReview() {
  return (
    <main className="min-h-screen bg-[#edf4f2] px-4 py-8 text-slate-900">
      <section className="mx-auto max-w-3xl rounded-[2rem] border border-white/80 bg-white/90 p-8 text-center shadow-xl shadow-slate-900/10">
        <Sparkles className="mx-auto h-10 w-10 text-teal-700" />
        <h1 className="mt-4 text-3xl font-black">Nenhuma previa de IA encontrada</h1>
        <p className="mt-3 leading-7 text-slate-600">
          Gere uma nova previa a partir da criacao de viagem ou do perfil da viagem ativa.
        </p>
        <button
          type="button"
          onClick={() => navigateTo('/perfil')}
          className="mt-6 inline-flex h-12 items-center justify-center rounded-2xl bg-slate-950 px-6 font-black text-white transition hover:bg-teal-700"
        >
          Voltar ao perfil
        </button>
      </section>
    </main>
  );
}

function Section({
  children,
  icon: Icon,
  title,
}: {
  children: React.ReactNode;
  icon: typeof Sparkles;
  title: string;
}) {
  return (
    <section className="rounded-[2rem] border border-white/80 bg-white/90 p-5 shadow-xl shadow-slate-900/10 md:p-7">
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white">
          <Icon className="h-5 w-5" />
        </span>
        <h2 className="text-2xl font-black text-slate-950">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function EditorField({
  children,
  label,
  className = '',
}: {
  children: React.ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <label className={className}>
      <span className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-slate-400">
        {label}
      </span>
      {children}
    </label>
  );
}

const inputClass =
  'h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100';
const textareaClass =
  'w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold text-slate-900 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100';

function PlanEditor({ plan, onChange }: { plan: TripAIPlan; onChange: (plan: TripAIPlan) => void }) {
  const updatePlan = (patch: Partial<TripAIPlan>) => onChange({ ...plan, ...patch });

  return (
    <section className="space-y-6 rounded-[2rem] border border-teal-200 bg-teal-50/70 p-5 shadow-xl shadow-teal-900/10 md:p-7">
      <div>
        <p className="text-sm font-black uppercase tracking-[0.18em] text-teal-700">Editor visual</p>
        <h2 className="mt-2 text-3xl font-black text-slate-950">Editar roteiro gerado</h2>
        <p className="mt-2 text-sm font-bold leading-6 text-teal-900">
          Ajuste a previa aqui. O roteiro aplicado usara exatamente estes dados editados.
        </p>
      </div>

      <EditorField label="Resumo">
        <textarea
          value={plan.summary}
          onChange={(event) => updatePlan({ summary: event.target.value })}
          rows={4}
          className={textareaClass}
        />
      </EditorField>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xl font-black text-slate-950">Documentos</h3>
          <button
            type="button"
            onClick={() => updatePlan({ documents: [...plan.documents, createDocument()] })}
            className="inline-flex h-10 items-center gap-2 rounded-2xl bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50"
          >
            <Plus className="h-4 w-4" />
            Adicionar
          </button>
        </div>
        {plan.documents.map((document, index) => (
          <article key={`${document.title}-${index}`} className="rounded-3xl bg-white p-4">
            <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
              <EditorField label="Titulo">
                <input
                  value={document.title}
                  onChange={(event) =>
                    updatePlan({ documents: updateListItem(plan.documents, index, { title: event.target.value }) })
                  }
                  className={inputClass}
                />
              </EditorField>
              <EditorField label="Detalhe">
                <input
                  value={document.detail}
                  onChange={(event) =>
                    updatePlan({ documents: updateListItem(plan.documents, index, { detail: event.target.value }) })
                  }
                  className={inputClass}
                />
              </EditorField>
              <button
                type="button"
                onClick={() => updatePlan({ documents: removeListItem(plan.documents, index) })}
                className="mt-6 inline-flex h-11 items-center justify-center rounded-2xl bg-rose-50 px-3 text-rose-700 transition hover:bg-rose-100"
                aria-label="Remover documento"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </article>
        ))}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xl font-black text-slate-950">Roteiro</h3>
          <button
            type="button"
            onClick={() => updatePlan({ itinerary_items: [...plan.itinerary_items, createItineraryItem()] })}
            className="inline-flex h-10 items-center gap-2 rounded-2xl bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50"
          >
            <Plus className="h-4 w-4" />
            Adicionar
          </button>
        </div>
        {plan.itinerary_items.map((item, index) => (
          <article key={item.id} className="rounded-3xl bg-white p-4">
            <div className="grid gap-3 md:grid-cols-3">
              <EditorField label="Dia">
                <input
                  value={item.day}
                  onChange={(event) =>
                    updatePlan({ itinerary_items: updateListItem(plan.itinerary_items, index, { day: event.target.value }) })
                  }
                  className={inputClass}
                />
              </EditorField>
              <EditorField label="Horario">
                <input
                  value={item.time}
                  onChange={(event) =>
                    updatePlan({ itinerary_items: updateListItem(plan.itinerary_items, index, { time: event.target.value }) })
                  }
                  className={inputClass}
                />
              </EditorField>
              <EditorField label="Pais">
                <input
                  value={item.country}
                  onChange={(event) =>
                    updatePlan({ itinerary_items: updateListItem(plan.itinerary_items, index, { country: event.target.value }) })
                  }
                  className={inputClass}
                />
              </EditorField>
              <EditorField label="Cidade">
                <input
                  value={item.city}
                  onChange={(event) =>
                    updatePlan({ itinerary_items: updateListItem(plan.itinerary_items, index, { city: event.target.value }) })
                  }
                  className={inputClass}
                />
              </EditorField>
              <EditorField label="Titulo" className="md:col-span-2">
                <input
                  value={item.title}
                  onChange={(event) =>
                    updatePlan({ itinerary_items: updateListItem(plan.itinerary_items, index, { title: event.target.value }) })
                  }
                  className={inputClass}
                />
              </EditorField>
              <EditorField label="Tipo">
                <select
                  value={item.type}
                  onChange={(event) =>
                    updatePlan({
                      itinerary_items: updateListItem(plan.itinerary_items, index, {
                        type: event.target.value as ItineraryType,
                      }),
                    })
                  }
                  className={inputClass}
                >
                  {Object.entries(typeLabels).map(([type, label]) => (
                    <option key={type} value={type}>
                      {label}
                    </option>
                  ))}
                </select>
              </EditorField>
              <EditorField label="Descricao" className="md:col-span-2">
                <textarea
                  value={item.description}
                  onChange={(event) =>
                    updatePlan({ itinerary_items: updateListItem(plan.itinerary_items, index, { description: event.target.value }) })
                  }
                  rows={3}
                  className={textareaClass}
                />
              </EditorField>
              <button
                type="button"
                onClick={() => updatePlan({ itinerary_items: removeListItem(plan.itinerary_items, index) })}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-rose-50 px-4 text-sm font-black text-rose-700 transition hover:bg-rose-100 md:col-span-3"
              >
                <Trash2 className="h-4 w-4" />
                Remover item
              </button>
            </div>
          </article>
        ))}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xl font-black text-slate-950">Gastos</h3>
          <button
            type="button"
            onClick={() => updatePlan({ expenses: [...plan.expenses, createExpense()] })}
            className="inline-flex h-10 items-center gap-2 rounded-2xl bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50"
          >
            <Plus className="h-4 w-4" />
            Adicionar
          </button>
        </div>
        {plan.expenses.map((expense, index) => (
          <article key={expense.id} className="rounded-3xl bg-white p-4">
            <div className="grid gap-3 md:grid-cols-4">
              <EditorField label="Categoria">
                <input
                  value={expense.category}
                  onChange={(event) =>
                    updatePlan({ expenses: updateListItem(plan.expenses, index, { category: event.target.value }) })
                  }
                  className={inputClass}
                />
              </EditorField>
              <EditorField label="Pais">
                <input
                  value={expense.country ?? ''}
                  onChange={(event) =>
                    updatePlan({ expenses: updateListItem(plan.expenses, index, { country: event.target.value }) })
                  }
                  className={inputClass}
                />
              </EditorField>
              <EditorField label="Descricao" className="md:col-span-2">
                <input
                  value={expense.title}
                  onChange={(event) =>
                    updatePlan({ expenses: updateListItem(plan.expenses, index, { title: event.target.value }) })
                  }
                  className={inputClass}
                />
              </EditorField>
              <EditorField label="Detalhes" className="md:col-span-4">
                <textarea
                  value={expense.detail ?? ''}
                  onChange={(event) =>
                    updatePlan({ expenses: updateListItem(plan.expenses, index, { detail: event.target.value }) })
                  }
                  rows={2}
                  className={textareaClass}
                />
              </EditorField>
              <EditorField label="Moeda">
                <select
                  value={getExpenseCurrency(expense)}
                  onChange={(event) =>
                    updatePlan({
                      expenses: updateListItem(plan.expenses, index, {
                        currency: event.target.value as TravelCurrencyCode,
                      }),
                    })
                  }
                  className={inputClass}
                >
                  {TRAVEL_CURRENCIES.map((currency) => (
                    <option key={currency} value={currency}>{currency}</option>
                  ))}
                </select>
              </EditorField>
              <EditorField label="Valor">
                <input
                  inputMode="decimal"
                  value={numberValue(expense.amount ?? expense.euro.min)}
                  onChange={(event) =>
                    updatePlan({
                      expenses: updateListItem(plan.expenses, index, {
                        amount: parseMoney(event.target.value),
                      }),
                    })
                  }
                  className={inputClass}
                />
              </EditorField>
              <EditorField label="Euro compatível">
                <input
                  inputMode="decimal"
                  value={numberValue(expense.euro.min)}
                  onChange={(event) =>
                    updatePlan({
                      expenses: updateListItem(plan.expenses, index, {
                        euro: {
                          min: parseMoney(event.target.value),
                          max: parseMoney(event.target.value),
                        },
                      }),
                    })
                  }
                  className={inputClass}
                />
              </EditorField>
              <EditorField label="Real estimado">
                <input
                  inputMode="decimal"
                  value={numberValue(expense.real.min)}
                  onChange={(event) =>
                    updatePlan({
                      expenses: updateListItem(plan.expenses, index, {
                        real: {
                          min: parseMoney(event.target.value),
                          max: parseMoney(event.target.value),
                        },
                      }),
                    })
                  }
                  className={inputClass}
                />
              </EditorField>
              <button
                type="button"
                onClick={() => updatePlan({ expenses: removeListItem(plan.expenses, index) })}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-rose-50 px-4 text-sm font-black text-rose-700 transition hover:bg-rose-100 md:col-span-4"
              >
                <Trash2 className="h-4 w-4" />
                Remover gasto
              </button>
            </div>
          </article>
        ))}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xl font-black text-slate-950">Pontos turisticos</h3>
          <button
            type="button"
            onClick={() => updatePlan({ attractions: [...plan.attractions, createAttraction()] })}
            className="inline-flex h-10 items-center gap-2 rounded-2xl bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50"
          >
            <Plus className="h-4 w-4" />
            Adicionar
          </button>
        </div>
        {plan.attractions.map((attraction, index) => (
          <article key={attraction.id} className="rounded-3xl bg-white p-4">
            <div className="grid gap-3 md:grid-cols-3">
              <EditorField label="Nome" className="md:col-span-2">
                <input
                  value={attraction.name}
                  onChange={(event) =>
                    updatePlan({ attractions: updateListItem(plan.attractions, index, { name: event.target.value }) })
                  }
                  className={inputClass}
                />
              </EditorField>
              <EditorField label="Pais">
                <input
                  value={attraction.country}
                  onChange={(event) =>
                    updatePlan({ attractions: updateListItem(plan.attractions, index, { country: event.target.value }) })
                  }
                  className={inputClass}
                />
              </EditorField>
              <EditorField label="Cidade">
                <input
                  value={attraction.city}
                  onChange={(event) =>
                    updatePlan({ attractions: updateListItem(plan.attractions, index, { city: event.target.value }) })
                  }
                  className={inputClass}
                />
              </EditorField>
              <EditorField label="Dia">
                <input
                  value={attraction.day}
                  onChange={(event) =>
                    updatePlan({ attractions: updateListItem(plan.attractions, index, { day: event.target.value }) })
                  }
                  className={inputClass}
                />
              </EditorField>
              <EditorField label="Horario">
                <input
                  value={attraction.time ?? ''}
                  onChange={(event) =>
                    updatePlan({ attractions: updateListItem(plan.attractions, index, { time: event.target.value }) })
                  }
                  className={inputClass}
                />
              </EditorField>
              <EditorField label="Descricao" className="md:col-span-3">
                <textarea
                  value={attraction.description}
                  onChange={(event) =>
                    updatePlan({ attractions: updateListItem(plan.attractions, index, { description: event.target.value }) })
                  }
                  rows={3}
                  className={textareaClass}
                />
              </EditorField>
              <button
                type="button"
                onClick={() => updatePlan({ attractions: removeListItem(plan.attractions, index) })}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-rose-50 px-4 text-sm font-black text-rose-700 transition hover:bg-rose-100 md:col-span-3"
              >
                <Trash2 className="h-4 w-4" />
                Remover ponto
              </button>
            </div>
          </article>
        ))}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xl font-black text-slate-950">Rotas</h3>
          <button
            type="button"
            onClick={() => updatePlan({ routes: [...plan.routes, createRoute()] })}
            className="inline-flex h-10 items-center gap-2 rounded-2xl bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50"
          >
            <Plus className="h-4 w-4" />
            Adicionar
          </button>
        </div>
        {plan.routes.map((route, index) => (
          <article key={`${route.from}-${route.to}-${index}`} className="rounded-3xl bg-white p-4">
            <div className="grid gap-3 md:grid-cols-2">
              <EditorField label="Origem">
                <input
                  value={route.from}
                  onChange={(event) =>
                    updatePlan({ routes: updateListItem(plan.routes, index, { from: event.target.value }) })
                  }
                  className={inputClass}
                />
              </EditorField>
              <EditorField label="Destino">
                <input
                  value={route.to}
                  onChange={(event) =>
                    updatePlan({ routes: updateListItem(plan.routes, index, { to: event.target.value }) })
                  }
                  className={inputClass}
                />
              </EditorField>
              <EditorField label="Transporte">
                <input
                  value={route.transport}
                  onChange={(event) =>
                    updatePlan({ routes: updateListItem(plan.routes, index, { transport: event.target.value }) })
                  }
                  className={inputClass}
                />
              </EditorField>
              <EditorField label="Duracao aproximada">
                <input
                  value={route.duration ?? ''}
                  onChange={(event) =>
                    updatePlan({ routes: updateListItem(plan.routes, index, { duration: event.target.value }) })
                  }
                  className={inputClass}
                />
              </EditorField>
              <EditorField label="Valor aproximado">
                <input
                  value={route.estimatedCost ?? ''}
                  onChange={(event) =>
                    updatePlan({ routes: updateListItem(plan.routes, index, { estimatedCost: event.target.value }) })
                  }
                  className={inputClass}
                />
              </EditorField>
              <EditorField label="Observacao">
                <input
                  value={route.notes ?? ''}
                  onChange={(event) =>
                    updatePlan({ routes: updateListItem(plan.routes, index, { notes: event.target.value }) })
                  }
                  className={inputClass}
                />
              </EditorField>
              <button
                type="button"
                onClick={() => updatePlan({ routes: removeListItem(plan.routes, index) })}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-rose-50 px-4 text-sm font-black text-rose-700 transition hover:bg-rose-100 md:col-span-2"
              >
                <Trash2 className="h-4 w-4" />
                Remover rota
              </button>
            </div>
          </article>
        ))}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xl font-black text-slate-950">Avisos</h3>
          <button
            type="button"
            onClick={() => updatePlan({ warnings: [...plan.warnings, 'Novo aviso'] })}
            className="inline-flex h-10 items-center gap-2 rounded-2xl bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50"
          >
            <Plus className="h-4 w-4" />
            Adicionar
          </button>
        </div>
        {plan.warnings.map((warning, index) => (
          <div key={`${warning}-${index}`} className="grid gap-3 rounded-3xl bg-white p-4 md:grid-cols-[1fr_auto]">
            <input
              value={warning}
              onChange={(event) =>
                updatePlan({ warnings: plan.warnings.map((item, itemIndex) => (itemIndex === index ? event.target.value : item)) })
              }
              className={inputClass}
            />
            <button
              type="button"
              onClick={() => updatePlan({ warnings: removeListItem(plan.warnings, index) })}
              className="inline-flex h-11 items-center justify-center rounded-2xl bg-rose-50 px-4 text-rose-700 transition hover:bg-rose-100"
              aria-label="Remover aviso"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

export function TripAIReviewPage() {
  const { t } = useLanguage();
  const [review, setReview] = useState<TripAIReviewState | null>(() => getStoredTripAIReview());
  const [feedback, setFeedback] = useState('');
  const [isEditingPlan, setIsEditingPlan] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const plan = useMemo<TripAIPlan | null>(() => review?.plan ?? null, [review]);
  const qualityWarning = useMemo(
    () => (review?.plan ? getPlanCompletenessWarning(review.plan, review.input) : null),
    [review],
  );

  if (!review || !plan) return <EmptyReview />;

  const persistReview = (nextPlan: TripAIPlan) => {
    const nextReview = { ...review, plan: nextPlan, createdAt: Date.now() };
    setReview(nextReview);
    storeTripAIReview(nextReview);
  };

  const handleApply = async () => {
    setError(null);
    setStatus(null);
    setIsApplying(true);

    try {
      const validationError = validatePlan(plan);
      if (validationError) {
        setError(validationError);
        return;
      }

      const result = await applyTripPlan(review, plan, isEditingPlan ? feedback || 'Roteiro editado antes de aplicar.' : feedback);
      const successMessage = getApplySuccessMessage(result);
      clearTripAIReview();
      setStatus(successMessage);
      sessionStorage.setItem(TRIP_AI_APPLY_NOTICE_KEY, successMessage);
      navigateTo('/dashboard');
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Nao foi possivel aplicar o roteiro.');
    } finally {
      setIsApplying(false);
    }
  };

  const handleRegenerate = async () => {
    setError(null);
    setStatus(null);
    setIsRegenerating(true);

    try {
      const nextPlan = await generateTripPlan(review.input);
      persistReview(nextPlan);
      setIsEditingPlan(false);
      setFeedback('');
      setStatus('Nova previa gerada.');
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Nao foi possivel gerar novamente.');
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleCancel = async () => {
    setError(null);
    setIsCancelling(true);

    try {
      await updateTripGenerationFeedback(plan.generationId, 'rejected', feedback);
    } catch {
      // Feedback is useful, but cancel should still let the user leave the review screen.
    } finally {
      clearTripAIReview();
      setIsCancelling(false);
      navigateTo('/perfil');
    }
  };

  const groupedItinerary = plan.itinerary_items.reduce<Record<string, typeof plan.itinerary_items>>((groups, item) => {
    groups[item.day] = [...(groups[item.day] ?? []), item];
    return groups;
  }, {});

  return (
    <motion.main
      className="min-h-screen bg-[#edf4f2] px-4 py-6 text-slate-900 md:px-6 md:py-8 lg:px-10 xl:px-12"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div className="w-full space-y-6">
        <section className="rounded-[2rem] border border-white/80 bg-slate-950 p-6 text-white shadow-2xl shadow-slate-900/20 md:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.2em] text-teal-200">{t('ai.previewTitle')}</p>
              <h1 className="mt-3 text-4xl font-black tracking-tight md:text-5xl">{review.input.tripName}</h1>
              <p className="mt-4 max-w-3xl leading-7 text-slate-300">{plan.summary}</p>
            </div>
            <div className="grid gap-2 text-sm font-bold sm:grid-cols-3 lg:min-w-[28rem]">
              <span className="rounded-2xl bg-white/10 px-4 py-3">{review.input.countries.join(', ')}</span>
              <span className="rounded-2xl bg-white/10 px-4 py-3">{review.input.startDate}</span>
              <span className="rounded-2xl bg-white/10 px-4 py-3">{review.input.style}</span>
            </div>
          </div>
        </section>

        {(status || error) ? (
          <p className="rounded-2xl border border-white/80 bg-white/90 px-4 py-3 text-sm font-bold text-slate-700 shadow-lg shadow-slate-900/5">
            {error ?? status}
          </p>
        ) : null}

        {qualityWarning ? (
          <section className="rounded-[2rem] border border-amber-200 bg-amber-50 p-5 shadow-xl shadow-amber-900/10">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-lg font-black text-amber-950">
                  {t('ai.incompleteWarning')}
                </p>
                <p className="mt-1 text-sm font-bold text-amber-800">{qualityWarning}</p>
              </div>
              <button
                type="button"
                onClick={() => void handleRegenerate()}
                disabled={isApplying || isRegenerating || isCancelling}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-amber-900 px-5 font-black text-white transition hover:bg-amber-950 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isRegenerating ? <Loader2 className="h-5 w-5 animate-spin" /> : <RefreshCcw className="h-5 w-5" />}
                {t('ai.regenerate')}
              </button>
            </div>
          </section>
        ) : null}

        <section className="grid gap-3 md:grid-cols-4">
          <button
            type="button"
            onClick={() => void handleApply()}
            disabled={isApplying || isRegenerating || isCancelling}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-teal-700 px-5 font-black text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isApplying ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
            {t('ai.applyPlan')}
          </button>
          <button
            type="button"
            onClick={() => void handleRegenerate()}
            disabled={isApplying || isRegenerating || isCancelling}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 font-black text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isRegenerating ? <Loader2 className="h-5 w-5 animate-spin" /> : <RefreshCcw className="h-5 w-5" />}
            {t('ai.regenerate')}
          </button>
          <button
            type="button"
            onClick={() => setIsEditingPlan((current) => !current)}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 font-black text-slate-700 transition hover:bg-slate-50"
          >
            <Pencil className="h-5 w-5" />
            {isEditingPlan ? t('ai.viewPreview') : t('ai.editPlan')}
          </button>
          <button
            type="button"
            onClick={() => void handleCancel()}
            disabled={isApplying || isRegenerating || isCancelling}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-rose-50 px-5 font-black text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isCancelling ? <Loader2 className="h-5 w-5 animate-spin" /> : <X className="h-5 w-5" />}
            {t('ai.cancel')}
          </button>
        </section>

        <label className="block rounded-[2rem] border border-white/80 bg-white/90 p-5 shadow-xl shadow-slate-900/10">
          <span className="mb-2 block text-sm font-bold text-slate-600">{t('ai.feedback')}</span>
          <textarea
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            placeholder={feedbackPlaceholder}
            rows={2}
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
          />
        </label>

        {isEditingPlan ? <PlanEditor plan={plan} onChange={persistReview} /> : null}

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <Section icon={Sparkles} title="Roteiro dia a dia">
              <div className="space-y-4">
                {Object.entries(groupedItinerary).map(([day, items]) => (
                  <article key={day} className="rounded-3xl bg-slate-50 p-4">
                    <h3 className="text-lg font-black text-slate-950">{day}</h3>
                    <div className="mt-3 space-y-3">
                      {items.map((item) => (
                        <div key={item.id} className="rounded-2xl bg-white p-4">
                          <div className="flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-slate-400">
                            <span>{item.time || 'Sem horario'}</span>
                            <span>{countryLabel(item.country)}</span>
                            <span>{typeLabels[item.type]}</span>
                          </div>
                          <h4 className="mt-2 font-black text-slate-950">{item.title}</h4>
                          <p className="mt-1 text-sm font-bold text-slate-500">{item.city}</p>
                          <p className="mt-3 leading-7 text-slate-600">{item.description}</p>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </Section>

            <Section icon={WalletCards} title="Gastos estimados">
              <div className="grid gap-3 md:grid-cols-2">
                {plan.expenses.map((expense) => (
                  <article key={expense.id} className="rounded-3xl bg-slate-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">
                          {expense.category}
                        </p>
                        <h3 className="mt-1 font-black text-slate-950">{expense.title}</h3>
                      </div>
                      <span className="rounded-2xl bg-white px-3 py-2 text-xs font-black text-slate-500">
                        {countryLabel(expense.country ?? 'international')}
                      </span>
                    </div>
                    <p className="mt-3 text-sm font-bold text-slate-500">{expense.detail}</p>
                    <div className="mt-3 grid gap-2 text-sm font-black sm:grid-cols-2">
                      <span className="rounded-2xl bg-white px-3 py-2">{formatRange(expense.real, 'BRL', true)}</span>
                      <span className="rounded-2xl bg-white px-3 py-2">
                        {formatRange(getExpenseOriginalRange(expense), getExpenseCurrency(expense), true)}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            </Section>
          </div>

          <div className="space-y-6">
            <Section icon={MapPin} title="Pontos turisticos">
              <div className="space-y-3">
                {plan.attractions.map((attraction) => (
                  <article key={attraction.id} className="rounded-3xl bg-slate-50 p-4">
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">
                      {countryLabel(attraction.country)} / {attraction.city}
                    </p>
                    <h3 className="mt-1 font-black text-slate-950">{attraction.name}</h3>
                    <p className="mt-2 text-sm font-bold text-slate-500">
                      {attraction.day} {attraction.time ? `- ${attraction.time}` : ''}
                    </p>
                    <p className="mt-3 leading-7 text-slate-600">{attraction.description}</p>
                  </article>
                ))}
              </div>
            </Section>

            <Section icon={Route} title="Rotas sugeridas">
              <div className="space-y-3">
                {plan.routes.map((route, index) => (
                  <article key={`${route.from}-${route.to}-${index}`} className="rounded-3xl bg-slate-50 p-4">
                    <h3 className="font-black text-slate-950">
                      {route.from} {'->'} {route.to}
                    </h3>
                    <p className="mt-2 text-sm font-bold text-slate-500">
                      {route.transport} {route.duration ? `- ${route.duration}` : ''}
                    </p>
                    {route.estimatedCost ? (
                      <p className="mt-2 text-sm font-black text-slate-500">
                        Valor aproximado: {route.estimatedCost}
                      </p>
                    ) : null}
                    {route.notes ? <p className="mt-3 leading-7 text-slate-600">{route.notes}</p> : null}
                  </article>
                ))}
              </div>
            </Section>

            <Section icon={FileText} title="Documentos e alertas">
              <div className="space-y-3">
                {plan.documents.map((document) => (
                  <article key={`${document.title}-${document.detail}`} className="rounded-3xl bg-slate-50 p-4">
                    <h3 className="font-black text-slate-950">{document.title}</h3>
                    {document.detail ? <p className="mt-2 leading-7 text-slate-600">{document.detail}</p> : null}
                  </article>
                ))}
                {plan.warnings.map((warning) => (
                  <p key={warning} className="rounded-3xl bg-amber-50 p-4 font-bold leading-7 text-amber-800">
                    {warning}
                  </p>
                ))}
              </div>
            </Section>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void handleCancel()}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-rose-100 bg-white px-5 font-black text-rose-700 transition hover:bg-rose-50"
        >
          <Trash2 className="h-5 w-5" />
          Rejeitar e sair da previa
        </button>
      </div>
    </motion.main>
  );
}
