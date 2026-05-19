import { motion } from 'framer-motion';
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Loader2,
  MapPin,
  Pencil,
  RefreshCcw,
  Route,
  Sparkles,
  Trash2,
  WalletCards,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { countryNames } from '../data/countries';
import {
  applyTripPlan,
  clearTripAIReview,
  generateTripPlan,
  getStoredTripAIReview,
  normalizeTripAIPlan,
  storeTripAIReview,
  updateTripGenerationFeedback,
} from '../services/tripAIService';
import type { TripAIPlan, TripAIReviewState } from '../types';
import { formatRange } from '../utils/money';

const typeLabels: Record<string, string> = {
  arrival: 'Chegada',
  lodging: 'Hospedagem',
  tour: 'Passeio',
  transport: 'Transporte',
  food: 'Alimentacao',
  flight: 'Voo',
  train: 'Trem',
  rest: 'Descanso',
  other: 'Outro',
};

const feedbackPlaceholder = 'Opcional: deixe uma observacao sobre o roteiro gerado.';

const navigateTo = (path: string) => {
  window.history.replaceState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
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

export function TripAIReviewPage() {
  const [review, setReview] = useState<TripAIReviewState | null>(() => getStoredTripAIReview());
  const [jsonDraft, setJsonDraft] = useState(() => JSON.stringify(getStoredTripAIReview()?.plan ?? {}, null, 2));
  const [feedback, setFeedback] = useState('');
  const [isEditingJson, setIsEditingJson] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const plan = useMemo<TripAIPlan | null>(() => {
    if (!review) return null;
    if (!isEditingJson) return review.plan;

    try {
      return normalizeTripAIPlan(JSON.parse(jsonDraft));
    } catch {
      return review.plan;
    }
  }, [isEditingJson, jsonDraft, review]);

  if (!review || !plan) return <EmptyReview />;

  const persistReview = (nextPlan: TripAIPlan) => {
    const nextReview = { ...review, plan: nextPlan, createdAt: Date.now() };
    setReview(nextReview);
    setJsonDraft(JSON.stringify(nextPlan, null, 2));
    storeTripAIReview(nextReview);
  };

  const handleApply = async () => {
    setError(null);
    setStatus(null);
    setIsApplying(true);

    try {
      const planToApply = isEditingJson ? normalizeTripAIPlan(JSON.parse(jsonDraft)) : plan;
      await applyTripPlan(review, planToApply, isEditingJson ? feedback || 'Roteiro editado antes de aplicar.' : feedback);
      clearTripAIReview();
      setStatus('Roteiro aplicado com sucesso.');
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
      setIsEditingJson(false);
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
      className="min-h-screen bg-[#edf4f2] px-4 py-6 text-slate-900 md:px-6 md:py-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-[2rem] border border-white/80 bg-slate-950 p-6 text-white shadow-2xl shadow-slate-900/20 md:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.2em] text-teal-200">Previa com IA</p>
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

        <section className="grid gap-3 md:grid-cols-4">
          <button
            type="button"
            onClick={() => void handleApply()}
            disabled={isApplying || isRegenerating || isCancelling}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-teal-700 px-5 font-black text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isApplying ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
            Aplicar roteiro
          </button>
          <button
            type="button"
            onClick={() => void handleRegenerate()}
            disabled={isApplying || isRegenerating || isCancelling}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 font-black text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isRegenerating ? <Loader2 className="h-5 w-5 animate-spin" /> : <RefreshCcw className="h-5 w-5" />}
            Gerar novamente
          </button>
          <button
            type="button"
            onClick={() => setIsEditingJson((current) => !current)}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 font-black text-slate-700 transition hover:bg-slate-50"
          >
            <Pencil className="h-5 w-5" />
            {isEditingJson ? 'Fechar edicao' : 'Editar JSON'}
          </button>
          <button
            type="button"
            onClick={() => void handleCancel()}
            disabled={isApplying || isRegenerating || isCancelling}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-rose-50 px-5 font-black text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isCancelling ? <Loader2 className="h-5 w-5 animate-spin" /> : <X className="h-5 w-5" />}
            Cancelar
          </button>
        </section>

        <label className="block rounded-[2rem] border border-white/80 bg-white/90 p-5 shadow-xl shadow-slate-900/10">
          <span className="mb-2 block text-sm font-bold text-slate-600">Feedback da geracao</span>
          <textarea
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            placeholder={feedbackPlaceholder}
            rows={2}
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
          />
        </label>

        {isEditingJson ? (
          <section className="rounded-[2rem] border border-amber-200 bg-amber-50 p-5 shadow-xl shadow-amber-900/10 md:p-7">
            <div className="mb-3 flex items-center gap-2 text-sm font-black text-amber-800">
              <AlertTriangle className="h-4 w-4" />
              Edite mantendo JSON valido.
            </div>
            <textarea
              value={jsonDraft}
              onChange={(event) => setJsonDraft(event.target.value)}
              spellCheck={false}
              className="min-h-[28rem] w-full rounded-2xl border border-amber-200 bg-white px-4 py-3 font-mono text-sm outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
            />
          </section>
        ) : null}

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
                            <span>{countryNames[item.country]}</span>
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
                        {countryNames[expense.country ?? 'international']}
                      </span>
                    </div>
                    <p className="mt-3 text-sm font-bold text-slate-500">{expense.detail}</p>
                    <div className="mt-3 grid gap-2 text-sm font-black sm:grid-cols-2">
                      <span className="rounded-2xl bg-white px-3 py-2">{formatRange(expense.real, 'BRL', true)}</span>
                      <span className="rounded-2xl bg-white px-3 py-2">{formatRange(expense.euro, 'EUR', true)}</span>
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
                      {countryNames[attraction.country]} / {attraction.city}
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
