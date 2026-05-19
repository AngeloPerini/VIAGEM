import { AnimatePresence, motion } from 'framer-motion';
import {
  BedDouble,
  Check,
  CheckCircle2,
  ChevronDown,
  Coffee,
  Edit3,
  MapPin,
  Plane,
  Plus,
  RotateCcw,
  Route,
  Sparkles,
  Train,
  Trash2,
  Utensils,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  buildCountryOptions,
  countryAccent,
  countryLabel,
  normalizeCountryId,
} from '../data/countries';
import { itineraryItems } from '../data/itinerary';
import {
  cacheItineraryFallback,
  createItineraryItem,
  deleteItineraryItem,
  getCachedItineraryItems,
  getItineraryItems,
  resetItineraryToDefault,
  subscribeItineraryItems,
  updateItineraryItem,
  updateItineraryItemCompleted,
} from '../services/itineraryService';
import type { CountryFilterId, CountryId, CountryMeta, ItineraryItem, ItineraryType, LinkItem } from '../types';
import { hasInvalidLinks, normalizeLinks } from '../utils/links';
import { CountryFilter } from './CountryFilter';
import { LinksEditor } from './LinksEditor';
import { LinksMenu } from './LinksMenu';
import { TimeField } from './TimeField';

type ItineraryPageProps = {
  groupId: string;
  tripCountries: string[];
  selectedCountry: CountryFilterId;
  onCountryChange: (country: CountryFilterId) => void;
  canUseDefaultData?: boolean;
};

const typeIcons: Record<ItineraryType, typeof MapPin> = {
  arrival: MapPin,
  lodging: BedDouble,
  tour: Sparkles,
  transport: Route,
  food: Utensils,
  flight: Plane,
  train: Train,
  rest: Coffee,
  other: Sparkles,
};

const typeLabels: Record<ItineraryType, string> = {
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

const editableTypes: Array<{ id: ItineraryType; label: string }> = [
  { id: 'arrival', label: 'Chegada' },
  { id: 'tour', label: 'Passeio' },
  { id: 'transport', label: 'Transporte' },
  { id: 'food', label: 'Alimentacao' },
  { id: 'lodging', label: 'Hospedagem' },
  { id: 'flight', label: 'Voo' },
  { id: 'train', label: 'Trem' },
  { id: 'rest', label: 'Descanso' },
  { id: 'other', label: 'Outro' },
];

const blankItem = (country: CountryId): ItineraryItem => ({
  id: crypto.randomUUID(),
  day: '',
  country,
  city: '',
  time: '',
  title: '',
  description: '',
  type: 'tour',
  completed: false,
  links: [],
});

const groupByDay = (items: ItineraryItem[]) =>
  items.reduce<Record<string, ItineraryItem[]>>((groups, item) => {
    groups[item.day] = [...(groups[item.day] ?? []), item];
    return groups;
  }, {});

function ItineraryFormModal({
  item,
  countryOptions,
  onClose,
  onSave,
}: {
  item: ItineraryItem | null;
  countryOptions: CountryMeta[];
  onClose: () => void;
  onSave: (item: ItineraryItem) => void;
}) {
  const selectableCountryOptions = useMemo(
    () =>
      countryOptions.some((country) => country.id !== 'all')
        ? countryOptions
        : buildCountryOptions(['international']),
    [countryOptions],
  );
  const defaultCountry = selectableCountryOptions.find((country) => country.id !== 'all')?.id ?? 'international';
  const [draft, setDraft] = useState<ItineraryItem>(() => blankItem(defaultCountry));
  const [links, setLinks] = useState<LinkItem[]>([]);

  useEffect(() => {
    const source = item ?? blankItem(defaultCountry);
    setDraft({ ...source, country: normalizeCountryId(source.country) });
    setLinks(source.links ?? []);
  }, [defaultCountry, item]);

  const updateDraft = <K extends keyof ItineraryItem>(key: K, value: ItineraryItem[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (hasInvalidLinks(links)) return;
    onSave({
      ...draft,
      day: draft.day.trim(),
      city: draft.city.trim(),
      time: draft.time.trim(),
      title: draft.title.trim(),
      description: draft.description.trim(),
      links: normalizeLinks(links),
    });
  };

  return (
    <AnimatePresence>
      {item ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-3 backdrop-blur-sm md:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={onClose}
        >
          <motion.form
            onSubmit={handleSubmit}
            className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[2rem] bg-white p-5 shadow-2xl shadow-slate-950/30 md:p-7"
            initial={{ opacity: 0, y: 40, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-400">
                  Roteiro
                </p>
                <h2 className="mt-1 text-2xl font-black text-slate-950">
                  {item.title ? 'Editar item' : 'Novo item'}
                </h2>
              </div>
              <button type="button" onClick={onClose} aria-label="Fechar" className="rounded-2xl border border-slate-200 p-3 text-slate-500 transition hover:bg-slate-50">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label>
                <span className="mb-2 block text-sm font-bold text-slate-600">Dia</span>
                <input required value={draft.day} onChange={(event) => updateDraft('day', event.target.value)} className="h-12 w-full rounded-2xl border border-slate-200 px-4 font-semibold outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100" />
              </label>
              <label>
                <span className="mb-2 block text-sm font-bold text-slate-600">Pais</span>
                <select value={draft.country} onChange={(event) => updateDraft('country', event.target.value as CountryId)} className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 font-semibold outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100">
                  {selectableCountryOptions.filter((country) => country.id !== 'all').map((country) => (
                    <option key={country.id} value={country.id}>{country.name}</option>
                  ))}
                </select>
              </label>
              <label>
                <span className="mb-2 block text-sm font-bold text-slate-600">Cidade</span>
                <input required value={draft.city} onChange={(event) => updateDraft('city', event.target.value)} className="h-12 w-full rounded-2xl border border-slate-200 px-4 font-semibold outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100" />
              </label>
              <TimeField value={draft.time} onChange={(value) => updateDraft('time', value)} label="Horario" />
              <label className="md:col-span-2">
                <span className="mb-2 block text-sm font-bold text-slate-600">Titulo</span>
                <input required value={draft.title} onChange={(event) => updateDraft('title', event.target.value)} className="h-12 w-full rounded-2xl border border-slate-200 px-4 font-semibold outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100" />
              </label>
              <label>
                <span className="mb-2 block text-sm font-bold text-slate-600">Tipo</span>
                <select value={draft.type} onChange={(event) => updateDraft('type', event.target.value as ItineraryType)} className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 font-semibold outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100">
                  {editableTypes.map((type) => (
                    <option key={type.id} value={type.id}>{type.label}</option>
                  ))}
                </select>
              </label>
              <label className="md:col-span-2">
                <span className="mb-2 block text-sm font-bold text-slate-600">Descricao</span>
                <textarea required value={draft.description} onChange={(event) => updateDraft('description', event.target.value)} rows={4} className="w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100" />
              </label>
              <LinksEditor links={links} onChange={setLinks} />
            </div>

            <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={onClose} className="h-12 rounded-2xl border border-slate-200 px-5 font-bold text-slate-600 transition hover:bg-slate-50">Cancelar</button>
              <button type="submit" className="h-12 rounded-2xl bg-slate-950 px-6 font-bold text-white shadow-xl shadow-slate-900/20 transition hover:bg-teal-700">Salvar item</button>
            </div>
          </motion.form>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export function ItineraryPage({
  groupId,
  tripCountries,
  selectedCountry,
  onCountryChange,
  canUseDefaultData = false,
}: ItineraryPageProps) {
  const [items, setItems] = useState<ItineraryItem[]>(() => getCachedItineraryItems(groupId));
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [editingItem, setEditingItem] = useState<ItineraryItem | null>(null);
  const [syncWarning, setSyncWarning] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let active = true;
    setItems(getCachedItineraryItems(groupId));

    const syncItems = async () => {
      try {
        setIsLoading(true);
        const nextItems = await getItineraryItems(groupId);
        if (active) {
          setItems(nextItems);
          setSyncWarning(null);
        }
      } catch {
        if (active) setSyncWarning('Supabase indisponivel. Mostrando cache local do roteiro.');
      } finally {
        if (active) setIsLoading(false);
      }
    };

    void syncItems();
    const channel = subscribeItineraryItems(groupId, () => {
      void getItineraryItems(groupId)
        .then((nextItems) => {
          if (active) {
            setItems(nextItems);
            setSyncWarning(null);
          }
        })
        .catch(() => {
          if (active) setSyncWarning('Nao foi possivel sincronizar o roteiro em tempo real.');
        });
    });

    return () => {
      active = false;
      void channel.unsubscribe();
    };
  }, [groupId]);

  useEffect(() => {
    cacheItineraryFallback(groupId, items);
  }, [groupId, items]);

  const tripCountryIds = useMemo(
    () => new Set(tripCountries.map((country) => normalizeCountryId(country))),
    [tripCountries],
  );

  const scopedItems = useMemo(
    () =>
      tripCountryIds.size
        ? items.filter((item) => {
            const countryId = normalizeCountryId(item.country);
            return countryId === 'international' || tripCountryIds.has(countryId);
          })
        : items,
    [items, tripCountryIds],
  );

  const countryOptions = useMemo(
    () => buildCountryOptions(scopedItems.map((item) => item.country), tripCountries),
    [scopedItems, tripCountries],
  );

  const defaultCountry = countryOptions.find((country) => country.id !== 'all')?.id ?? 'international';

  useEffect(() => {
    if (selectedCountry !== 'all' && !countryOptions.some((country) => country.id === selectedCountry)) {
      onCountryChange('all');
    }
  }, [countryOptions, onCountryChange, selectedCountry]);

  const filteredItems = useMemo(
    () =>
      selectedCountry === 'all'
        ? scopedItems
        : scopedItems.filter((item) => normalizeCountryId(item.country) === selectedCountry),
    [scopedItems, selectedCountry],
  );

  const groupedItems = useMemo(() => groupByDay(filteredItems), [filteredItems]);

  const toggleExpanded = (id: string) => {
    setExpandedItems((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const saveItem = async (item: ItineraryItem) => {
    const isEditing = items.some((currentItem) => currentItem.id === item.id);
    setIsSaving(true);

    try {
      const savedItem = isEditing
        ? await updateItineraryItem(groupId, item.id, item)
        : await createItineraryItem(groupId, item, items.length);
      setItems((current) =>
        isEditing
          ? current.map((currentItem) => (currentItem.id === savedItem.id ? savedItem : currentItem))
          : [...current, savedItem],
      );
      setSyncWarning(null);
      setEditingItem(null);
    } catch {
      setItems((current) =>
        isEditing
          ? current.map((currentItem) => (currentItem.id === item.id ? item : currentItem))
          : [...current, item],
      );
      setSyncWarning('Nao foi possivel salvar no Supabase. Alteracao mantida no cache local.');
      setEditingItem(null);
    } finally {
      setIsSaving(false);
    }
  };

  const removeItem = async (id: string) => {
    const previousItems = items;
    setItems((current) => current.filter((currentItem) => currentItem.id !== id));

    try {
      await deleteItineraryItem(groupId, id);
      setSyncWarning(null);
    } catch {
      setItems(previousItems);
      setSyncWarning('Nao foi possivel excluir no Supabase. Tente novamente.');
    }
  };

  const toggleCompleted = async (item: ItineraryItem) => {
    const completed = !(item.completed ?? false);
    const previousItems = items;
    setItems((current) =>
      current.map((currentItem) =>
        currentItem.id === item.id ? { ...currentItem, completed } : currentItem,
      ),
    );

    try {
      await updateItineraryItemCompleted(groupId, item.id, completed);
      setSyncWarning(null);
    } catch {
      setItems(previousItems);
      setSyncWarning('Nao foi possivel salvar o check no Supabase. Tente novamente.');
    }
  };

  const restoreDefaults = async () => {
    setIsSaving(true);

    try {
      setItems(await resetItineraryToDefault(groupId));
      setSyncWarning(null);
    } catch {
      setItems(itineraryItems);
      setSyncWarning('Nao foi possivel restaurar no Supabase. Restauracao aplicada apenas localmente.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <motion.div className="space-y-6" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>
      <section className="rounded-[2rem] border border-white/70 bg-white/80 p-6 shadow-xl shadow-slate-900/10 backdrop-blur-xl md:p-8">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-500">Roteiro</p>
        <div className="mt-3 grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <h1 className="text-4xl font-black tracking-tight text-slate-950 md:text-5xl">Roteiro da viagem</h1>
            <p className="mt-4 max-w-3xl leading-7 text-slate-600">Linha do tempo da viagem ativa, com transporte, passeios, hospedagens e pausas do grupo selecionado.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => setEditingItem(blankItem(defaultCountry))} className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 font-bold text-white shadow-xl shadow-slate-900/20 transition hover:bg-teal-700">
              <Plus className="h-5 w-5" /> Novo item
            </button>
            {canUseDefaultData ? (
              <button type="button" onClick={() => void restoreDefaults()} className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 font-bold text-slate-700 transition hover:bg-slate-50">
                <RotateCcw className="h-5 w-5" /> Restaurar roteiro padrão
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <CountryFilter value={selectedCountry} onChange={onCountryChange} label="Filtrar roteiro por pais" options={countryOptions} />
      {syncWarning || isLoading || isSaving ? (
        <p className="rounded-2xl border border-white/70 bg-white/75 px-4 py-3 text-sm font-semibold text-slate-600 shadow-lg shadow-slate-900/5 backdrop-blur-xl">
          {isSaving ? 'Salvando roteiro no Supabase...' : isLoading ? 'Sincronizando roteiro...' : syncWarning}
        </p>
      ) : null}

      <div className="space-y-6">
        <AnimatePresence mode="popLayout">
          {Object.entries(groupedItems).map(([day, dayItems]) => (
            <motion.section layout key={day} className="rounded-[2rem] border border-white/70 bg-white/85 p-5 shadow-xl shadow-slate-900/10 backdrop-blur-xl md:p-7" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.28 }}>
              <div className="mb-6 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-400">Timeline</p>
                  <h2 className="text-2xl font-black text-slate-950">{day}</h2>
                </div>
                <span className="text-sm font-bold text-slate-500">{dayItems.length} itens</span>
              </div>

              <div className="relative space-y-3 before:absolute before:bottom-4 before:left-5 before:top-4 before:w-px before:bg-slate-200 md:before:left-6">
                {dayItems.map((item) => {
                  const Icon = typeIcons[item.type];
                  const expanded = expandedItems.has(item.id);
                  const completed = item.completed ?? false;

                  return (
                    <motion.article
                      layout
                      key={item.id}
                      className={`relative ml-11 rounded-3xl border p-4 shadow-sm transition md:ml-14 md:p-5 ${
                        completed
                          ? 'border-teal-300 bg-teal-50/90 shadow-teal-900/10 hover:border-teal-400'
                          : 'border-slate-200 bg-white hover:border-teal-200 hover:shadow-lg hover:shadow-slate-900/10'
                      }`}
                      initial={{ opacity: 1, x: 0 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 14 }}
                    >
                      <span className={`absolute -left-[2.95rem] top-4 flex h-10 w-10 items-center justify-center rounded-2xl text-white shadow-lg md:-left-[3.45rem] ${completed ? 'bg-teal-600' : 'bg-slate-950'}`}>
                        {completed ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                      </span>
                      <div className="flex gap-3">
                        <button type="button" onClick={() => toggleExpanded(item.id)} className="flex min-w-0 flex-1 flex-col gap-3 text-left md:flex-row md:items-start md:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`rounded-full px-3 py-1 text-xs font-black ${completed ? 'bg-white/80 text-teal-700' : 'bg-slate-100 text-slate-600'}`}>{item.time || 'Sem horario'}</span>
                              <span
                                className="rounded-full px-3 py-1 text-xs font-black ring-1"
                                style={{
                                  backgroundColor: `${countryAccent(item.country)}14`,
                                  color: countryAccent(item.country),
                                  borderColor: `${countryAccent(item.country)}33`,
                                }}
                              >
                                {countryLabel(item.country)}
                              </span>
                              <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-400 ring-1 ring-slate-200">{typeLabels[item.type]}</span>
                            </div>
                            <h3 className={`mt-3 text-lg font-black ${completed ? 'text-teal-950' : 'text-slate-950'}`}>{item.title}</h3>
                            <p className={`mt-1 text-sm font-semibold ${completed ? 'text-teal-700' : 'text-slate-500'}`}>{item.city}</p>
                          </div>
                          <ChevronDown className={`h-5 w-5 shrink-0 text-slate-400 transition ${expanded ? 'rotate-180' : ''}`} />
                        </button>
                        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                          <LinksMenu links={item.links} align="right" />
                          <button type="button" aria-label={`${completed ? 'Desmarcar' : 'Marcar'} ${item.title}`} onClick={() => void toggleCompleted(item)} className={`h-10 rounded-xl border p-2 transition ${completed ? 'border-teal-200 bg-teal-600 text-white' : 'border-slate-200 text-slate-500 hover:bg-teal-50 hover:text-teal-700'}`}><Check className="h-4 w-4" /></button>
                          <button type="button" aria-label={`Editar ${item.title}`} onClick={() => setEditingItem(item)} className="h-10 rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:bg-teal-50 hover:text-teal-700"><Edit3 className="h-4 w-4" /></button>
                          <button type="button" aria-label={`Excluir ${item.title}`} onClick={() => void removeItem(item.id)} className="h-10 rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:bg-rose-50 hover:text-rose-700"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      </div>
                      <AnimatePresence>
                        {expanded ? (
                          <motion.p className="mt-4 rounded-2xl bg-slate-50 p-4 leading-7 text-slate-600" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                            {item.description}
                          </motion.p>
                        ) : null}
                      </AnimatePresence>
                    </motion.article>
                  );
                })}
              </div>
            </motion.section>
          ))}
        </AnimatePresence>
      </div>

      <ItineraryFormModal item={editingItem} countryOptions={countryOptions} onClose={() => setEditingItem(null)} onSave={(item) => void saveItem(item)} />
    </motion.div>
  );
}
