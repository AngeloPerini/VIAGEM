import { AnimatePresence, motion } from 'framer-motion';
import { Camera, CheckCircle2, MapPin, Plus, RotateCcw, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { AttractionCard } from '../components/AttractionCard';
import { AttractionModal } from '../components/AttractionModal';
import { LinksEditor } from '../components/LinksEditor';
import { TimeField } from '../components/TimeField';
import { buildCountryOptions, normalizeCountryId } from '../data/countries';
import { attractions } from '../data/attractions';
import {
  cacheAttractionsFallback,
  createAttraction,
  deleteAttraction,
  deleteAttractionPhoto,
  getAttractions,
  getCachedAttractions,
  resetAttractionsToDefault,
  subscribeAttractions,
  updateAttraction,
  updateAttractionVisit,
  uploadAttractionPhoto,
} from '../services/attractionsService';
import { supabase } from '../services/supabaseClient';
import type {
  Attraction,
  AttractionState,
  AttractionStateMap,
  CountryFilterId,
  CountryId,
  CountryMeta,
} from '../types';
import { hasInvalidLinks, normalizeLinks } from '../utils/links';

type AttractionsPageProps = {
  groupId: string;
  tripCountries: string[];
  selectedCountry: CountryFilterId;
  onCountryChange: (country: CountryFilterId) => void;
  canUseDefaultData?: boolean;
};

const blankAttraction = (country: CountryId): Attraction => ({
  id: crypto.randomUUID(),
  name: '',
  country,
  city: '',
  day: '',
  time: '',
  description: '',
  links: [],
});

function AttractionFormModal({
  attraction,
  state,
  countryOptions,
  onClose,
  onSave,
}: {
  attraction: Attraction | null;
  state?: AttractionState;
  countryOptions: CountryMeta[];
  onClose: () => void;
  onSave: (attraction: Attraction, statePatch: AttractionState) => void;
}) {
  const selectableCountryOptions = useMemo(
    () =>
      countryOptions.some((country) => country.id !== 'all')
        ? countryOptions
        : buildCountryOptions(['international'], [], { includeInternational: true }),
    [countryOptions],
  );
  const defaultCountry = selectableCountryOptions.find((country) => country.id !== 'all')?.id ?? 'international';
  const [draft, setDraft] = useState<Attraction>(() => blankAttraction(defaultCountry));
  const [visited, setVisited] = useState(false);

  useEffect(() => {
    const source = attraction ?? blankAttraction(defaultCountry);
    setDraft({ ...source, country: normalizeCountryId(source.country) });
    setVisited(state?.visited ?? false);
  }, [attraction, defaultCountry, state]);

  const updateDraft = <K extends keyof Attraction>(key: K, value: Attraction[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (hasInvalidLinks(draft.links)) return;
    onSave(
      {
        ...draft,
        name: draft.name.trim(),
        city: draft.city.trim(),
        day: draft.day.trim(),
        time: draft.time?.trim(),
        description: draft.description.trim(),
        links: normalizeLinks(draft.links),
      },
      { ...(state ?? { visited: false }), visited, updatedAt: Date.now() },
    );
  };

  return (
    <AnimatePresence>
      {attraction ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-3 backdrop-blur-sm md:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={onClose}
        >
          <motion.form
            onSubmit={handleSubmit}
            className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[2rem] bg-white p-5 shadow-2xl shadow-slate-950/30 dark:border dark:border-slate-700 dark:bg-slate-900 md:p-7"
            initial={{ opacity: 0, y: 40, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                  Pontos turisticos
                </p>
                <h2 className="mt-1 text-2xl font-black text-slate-950 dark:text-slate-50">
                  {attraction.name ? 'Editar ponto turistico' : 'Novo ponto turistico'}
                </h2>
              </div>
              <button type="button" onClick={onClose} aria-label="Fechar" className="rounded-2xl border border-slate-200 p-3 text-slate-500 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="md:col-span-2">
                <span className="mb-2 block text-sm font-bold text-slate-600 dark:text-slate-300">Nome do ponto turistico</span>
                <input required value={draft.name} onChange={(event) => updateDraft('name', event.target.value)} className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 font-semibold text-slate-900 outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/20" />
              </label>
              <label>
                <span className="mb-2 block text-sm font-bold text-slate-600 dark:text-slate-300">Pais</span>
                <select value={draft.country} onChange={(event) => updateDraft('country', event.target.value as CountryId)} className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 font-semibold text-slate-900 outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/20">
                  {selectableCountryOptions.filter((country) => country.id !== 'all').map((country) => (
                    <option key={country.id} value={country.id}>{country.name}</option>
                  ))}
                </select>
              </label>
              <label>
                <span className="mb-2 block text-sm font-bold text-slate-600 dark:text-slate-300">Cidade</span>
                <input required value={draft.city} onChange={(event) => updateDraft('city', event.target.value)} className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 font-semibold text-slate-900 outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/20" />
              </label>
              <label>
                <span className="mb-2 block text-sm font-bold text-slate-600 dark:text-slate-300">Dia previsto</span>
                <input required value={draft.day} onChange={(event) => updateDraft('day', event.target.value)} className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 font-semibold text-slate-900 outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/20" />
              </label>
              <TimeField value={draft.time ?? ''} onChange={(value) => updateDraft('time', value)} label="Horario previsto" />
              <label className="md:col-span-2">
                <span className="mb-2 block text-sm font-bold text-slate-600 dark:text-slate-300">Descricao</span>
                <textarea required value={draft.description} onChange={(event) => updateDraft('description', event.target.value)} rows={4} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-semibold text-slate-900 outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/20" />
              </label>
              <label className="flex items-center gap-3 rounded-2xl bg-slate-50 p-4 font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200 md:col-span-2">
                <input type="checkbox" checked={visited} onChange={(event) => setVisited(event.target.checked)} className="h-5 w-5 accent-teal-600" />
                Status visitado
              </label>
              <LinksEditor links={draft.links ?? []} onChange={(links) => updateDraft('links', links)} />
            </div>

            <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={onClose} className="h-12 rounded-2xl border border-slate-200 px-5 font-bold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">Cancelar</button>
              <button type="submit" className="h-12 rounded-2xl bg-slate-950 px-6 font-bold text-white shadow-xl shadow-slate-900/20 transition hover:bg-teal-700 dark:bg-emerald-400 dark:text-emerald-950 dark:hover:bg-emerald-300">Salvar ponto</button>
            </div>
          </motion.form>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export function AttractionsPage({
  groupId,
  tripCountries,
  selectedCountry,
  onCountryChange,
  canUseDefaultData = false,
}: AttractionsPageProps) {
  const cachedAttractions = getCachedAttractions(groupId);
  const [items, setItems] = useState<Attraction[]>(cachedAttractions.items);
  const [states, setStates] = useState<AttractionStateMap>(cachedAttractions.states);
  const [selectedAttraction, setSelectedAttraction] = useState<Attraction | null>(null);
  const [editingAttraction, setEditingAttraction] = useState<Attraction | null>(null);
  const [syncWarning, setSyncWarning] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const cached = getCachedAttractions(groupId);
    setItems(cached.items);
    setStates(cached.states);

    const syncAttractions = async () => {
      try {
        setIsLoading(true);
        const payload = await getAttractions(groupId);
        if (active) {
          setItems(payload.items);
          setStates(payload.states);
          setSyncWarning(null);
        }
      } catch {
        if (active) setSyncWarning('Supabase indisponivel. Mostrando cache local dos pontos.');
      } finally {
        if (active) setIsLoading(false);
      }
    };

    void syncAttractions();
    const channel = subscribeAttractions(groupId, () => {
      void getAttractions(groupId)
        .then((payload) => {
          if (active) {
            setItems(payload.items);
            setStates(payload.states);
            setSyncWarning(null);
          }
        })
        .catch(() => {
          if (active) setSyncWarning('Nao foi possivel sincronizar os pontos em tempo real.');
        });
    });

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [groupId]);

  useEffect(() => {
    try {
      cacheAttractionsFallback(groupId, { items, states });
    } catch {
      // Cache failures should not block the Supabase-backed flow.
    }
  }, [groupId, items, states]);

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

  const filteredAttractions = useMemo(
    () =>
      selectedCountry === 'all'
        ? scopedItems
        : scopedItems.filter((attraction) => normalizeCountryId(attraction.country) === selectedCountry),
    [scopedItems, selectedCountry],
  );

  const totalAttractionsCount = scopedItems.length;
  const totalVisitedCount = scopedItems.filter((attraction) => states[attraction.id]?.visited).length;
  const totalPhotoCount = scopedItems.filter((attraction) => states[attraction.id]?.photo).length;
  const visitedCount = filteredAttractions.filter((attraction) => states[attraction.id]?.visited)
    .length;
  const photoCount = filteredAttractions.filter((attraction) => states[attraction.id]?.photo).length;

  const handleStateChange = (id: string, nextState: AttractionState) => {
    setStates((current) => ({
      ...current,
      [id]: nextState,
    }));

    void updateAttractionVisit(groupId, id, nextState.visited).catch(() => {
      setSyncWarning('Nao foi possivel salvar o status no Supabase. Alteracao mantida no cache local.');
    });
  };

  const handleSaveAttraction = async (attraction: Attraction, nextState: AttractionState) => {
    const isEditing = items.some((item) => item.id === attraction.id);
    setIsSaving(true);

    try {
      const payload = isEditing
        ? await updateAttraction(groupId, attraction.id, attraction, nextState.visited)
        : await createAttraction(groupId, attraction, nextState.visited, items.length);
      const savedAttraction = payload.items[0];
      const savedState = payload.states[savedAttraction.id];

      setItems((current) =>
        isEditing
          ? current.map((item) => (item.id === savedAttraction.id ? savedAttraction : item))
          : [...current, savedAttraction],
      );
      setStates((current) => ({ ...current, [savedAttraction.id]: savedState }));
      setSyncWarning(null);
      setEditingAttraction(null);
    } catch {
      setItems((current) =>
        isEditing
          ? current.map((item) => (item.id === attraction.id ? attraction : item))
          : [...current, attraction],
      );
      setStates((current) => ({ ...current, [attraction.id]: nextState }));
      setSyncWarning('Nao foi possivel salvar no Supabase. Alteracao mantida no cache local.');
      setEditingAttraction(null);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAttraction = async (id: string) => {
    const previousItems = items;
    const previousStates = states;
    const photoUrl = states[id]?.photo;

    setItems((current) => current.filter((item) => item.id !== id));
    setStates((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setSelectedAttraction(null);
    setEditingAttraction(null);

    try {
      await deleteAttraction(groupId, id, photoUrl);
      setSyncWarning(null);
    } catch {
      setItems(previousItems);
      setStates(previousStates);
      setSyncWarning('Nao foi possivel excluir no Supabase. Tente novamente.');
    }
  };

  const handleUploadPhoto = async (id: string, file: File) => {
    setUploadingId(id);

    try {
      const photoUrl = await uploadAttractionPhoto(groupId, id, file);
      setStates((current) => ({
        ...current,
        [id]: { ...(current[id] ?? { visited: false }), photo: photoUrl, updatedAt: Date.now() },
      }));
      setSyncWarning(null);
    } finally {
      setUploadingId(null);
    }
  };

  const handleRemovePhoto = async (id: string) => {
    setUploadingId(id);

    try {
      await deleteAttractionPhoto(groupId, id);
      setStates((current) => ({
        ...current,
        [id]: { ...(current[id] ?? { visited: false }), photo: undefined, updatedAt: Date.now() },
      }));
      setSyncWarning(null);
    } finally {
      setUploadingId(null);
    }
  };

  const restoreDefaults = async () => {
    setIsSaving(true);

    try {
      const payload = await resetAttractionsToDefault(groupId);
      setItems(payload.items);
      setStates(payload.states);
      setSyncWarning(null);
    } catch {
      setItems(attractions);
      setStates({});
      setSyncWarning('Nao foi possivel restaurar no Supabase. Restauracao aplicada apenas localmente.');
    } finally {
      setSelectedAttraction(null);
      setEditingAttraction(null);
      setIsSaving(false);
    }
  };

  return (
    <motion.div
      className="w-full space-y-6"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
    >
      <section className="rounded-[1.65rem] border border-[#dfe5ee] bg-white px-5 py-5 shadow-[0_14px_34px_rgba(15,23,42,0.05)] dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/30 md:px-7 md:py-6">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[#007c68] dark:text-emerald-300">Turismo</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-[#0b1326] dark:text-slate-50 md:text-[2.35rem]">
              Pontos Turísticos
            </h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#45464d] dark:text-slate-300 md:text-base">
              Descubra, organize e acompanhe os lugares imperdíveis da sua viagem.
              Atualmente acompanhando <strong className="text-[#0b1326] dark:text-slate-50">{totalAttractionsCount}</strong> ponto{totalAttractionsCount === 1 ? '' : 's'} turístico{totalAttractionsCount === 1 ? '' : 's'}.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 lg:justify-end">
            <span className="inline-flex min-h-10 items-center gap-2 rounded-full bg-black px-4 py-2 text-sm font-black leading-tight text-white dark:bg-emerald-400 dark:text-emerald-950 sm:min-h-11">
              <CheckCircle2 className="h-4 w-4" />
              Visitados {totalVisitedCount}/{totalAttractionsCount}
            </span>
            <span className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[#cfd6e2] bg-white px-4 py-2 text-sm font-black leading-tight text-[#45464d] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 sm:min-h-11">
              <Camera className="h-4 w-4 text-[#007c68]" />
              Fotos {totalPhotoCount}
            </span>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3 border-t border-[#eef2f7] pt-5 dark:border-slate-700 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-[#667085] dark:text-slate-300">
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-4 w-4 text-[#007c68]" />
              {filteredAttractions.length} nesta seleção
            </span>
            <span className="hidden h-1 w-1 rounded-full bg-[#cbd5e1] sm:inline-flex" />
            <span>{visitedCount} visitado{visitedCount === 1 ? '' : 's'}</span>
            <span className="hidden h-1 w-1 rounded-full bg-[#cbd5e1] sm:inline-flex" />
            <span>{photoCount} foto{photoCount === 1 ? '' : 's'}</span>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            {canUseDefaultData ? (
              <button
                type="button"
                onClick={() => void restoreDefaults()}
                className="inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-full border border-[#dfe5ee] bg-white px-4 py-2 text-center text-sm font-black leading-tight text-[#45464d] transition hover:border-[#007c68] hover:text-[#007c68] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-emerald-400 dark:hover:text-emerald-300"
              >
                <RotateCcw className="h-4 w-4" />
                Restaurar padrão
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setEditingAttraction(blankAttraction(defaultCountry))}
              className="inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-full bg-black px-5 py-2 text-center text-sm font-black leading-tight text-white shadow-[0_12px_28px_rgba(15,23,42,0.16)] transition hover:bg-[#111827] dark:bg-emerald-400 dark:text-emerald-950 dark:shadow-black/30 dark:hover:bg-emerald-300"
            >
              <Plus className="h-4 w-4" />
              Novo ponto turístico
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-[1.35rem] border border-[#dfe5ee] bg-white px-4 py-4 shadow-[0_10px_26px_rgba(15,23,42,0.04)] dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/30 md:px-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#667085] dark:text-slate-400">Filtrar pontos por país</p>
            <p className="mt-1 text-sm font-semibold text-[#667085] dark:text-slate-300">
              Os totais e listas acompanham o país selecionado.
            </p>
          </div>

          <div className="flex max-w-full gap-2 overflow-x-auto pb-1 xl:justify-end">
            {countryOptions.map((country) => {
              const active = selectedCountry === country.id;

              return (
                <button
                  key={country.id}
                  type="button"
                  onClick={() => onCountryChange(country.id)}
                  className={`shrink-0 rounded-full border px-5 py-2.5 text-sm font-black transition ${
                    active
                      ? 'border-black bg-black text-white dark:border-emerald-400 dark:bg-emerald-400 dark:text-emerald-950'
                      : 'border-[#cfd6e2] bg-white text-[#45464d] hover:border-[#007c68] hover:text-[#007c68] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-emerald-400 dark:hover:text-emerald-300'
                  }`}
                >
                  {country.shortName}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {syncWarning || isLoading || isSaving || uploadingId ? (
        <p className="rounded-[1.35rem] border border-[#dfe5ee] bg-white px-4 py-3 text-sm font-semibold text-[#45464d] shadow-[0_10px_26px_rgba(15,23,42,0.04)] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:shadow-black/30">
          {uploadingId
            ? 'Atualizando foto no Supabase...'
            : isSaving
              ? 'Salvando pontos no Supabase...'
              : isLoading
                ? 'Sincronizando pontos turísticos...'
                : syncWarning}
        </p>
      ) : null}

      {filteredAttractions.length ? (
        <motion.div layout className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          <AnimatePresence mode="popLayout">
            {filteredAttractions.map((attraction) => (
              <AttractionCard
                key={attraction.id}
                attraction={attraction}
                state={states[attraction.id]}
                isUploading={uploadingId === attraction.id}
                onOpen={setSelectedAttraction}
                onEdit={setEditingAttraction}
                onDelete={(id) => void handleDeleteAttraction(id)}
                onToggleVisited={handleStateChange}
                onPhotoUpload={handleUploadPhoto}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      ) : (
        <section className="rounded-[1.65rem] border border-dashed border-[#cfd6e2] bg-white px-4 py-9 text-center shadow-[0_12px_30px_rgba(15,23,42,0.04)] dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/30 sm:px-5 sm:py-12">
          <Camera className="mx-auto h-10 w-10 text-[#007c68]" />
          <h2 className="mt-4 text-xl font-black text-[#0b1326] dark:text-slate-50">
            {totalAttractionsCount ? 'Nenhum ponto turístico encontrado para este país.' : 'Nenhum ponto turístico cadastrado ainda.'}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm font-semibold leading-6 text-[#667085] dark:text-slate-300">
            {totalAttractionsCount
              ? 'Selecione outro país da viagem para ver os pontos turísticos cadastrados.'
              : 'Adicione o primeiro ponto para acompanhar visitas, fotos e status durante o planejamento.'}
          </p>
          <button
            type="button"
            onClick={() => setEditingAttraction(blankAttraction(defaultCountry))}
            className="mt-5 inline-flex min-h-11 w-full min-w-0 max-w-sm items-center justify-center gap-2 rounded-full bg-black px-4 py-3 text-center text-sm font-black leading-tight text-white transition hover:bg-[#111827] dark:bg-emerald-400 dark:text-emerald-950 dark:hover:bg-emerald-300 sm:w-auto sm:px-5"
          >
            <Plus className="h-4 w-4" />
            Adicionar primeiro ponto turístico
          </button>
        </section>
      )}

      <AttractionModal
        attraction={selectedAttraction}
        state={selectedAttraction ? states[selectedAttraction.id] : undefined}
        onClose={() => setSelectedAttraction(null)}
        onChange={handleStateChange}
        onPhotoUpload={handleUploadPhoto}
        onPhotoRemove={handleRemovePhoto}
        onEdit={(attraction) => {
          setSelectedAttraction(null);
          setEditingAttraction(attraction);
        }}
        onDelete={(id) => void handleDeleteAttraction(id)}
      />
      <AttractionFormModal
        attraction={editingAttraction}
        state={editingAttraction ? states[editingAttraction.id] : undefined}
        countryOptions={countryOptions}
        onClose={() => setEditingAttraction(null)}
        onSave={(attraction, statePatch) => void handleSaveAttraction(attraction, statePatch)}
      />
    </motion.div>
  );
}
