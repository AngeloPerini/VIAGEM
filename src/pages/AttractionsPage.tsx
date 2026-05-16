import { AnimatePresence, motion } from 'framer-motion';
import { Camera, CheckCircle2, MapPin, Plus, RotateCcw, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { AttractionCard } from '../components/AttractionCard';
import { AttractionModal } from '../components/AttractionModal';
import { CountryFilter } from '../components/CountryFilter';
import { countries } from '../data/countries';
import { attractions } from '../data/attractions';
import {
  cacheAttractionsFallback,
  createAttraction,
  deleteAttraction,
  deleteAttractionPhoto,
  getAttractions,
  getCachedAttractions,
  resetAttractionsToDefault,
  seedAttractionsIfEmpty,
  subscribeAttractions,
  updateAttraction,
  updateAttractionVisit,
  uploadAttractionPhoto,
} from '../services/attractionsService';
import type {
  Attraction,
  AttractionState,
  AttractionStateMap,
  CountryFilterId,
  CountryId,
} from '../types';

type AttractionsPageProps = {
  selectedCountry: CountryFilterId;
  onCountryChange: (country: CountryFilterId) => void;
};

const blankAttraction = (): Attraction => ({
  id: crypto.randomUUID(),
  name: '',
  country: 'italy',
  city: '',
  day: '',
  time: '',
  description: '',
});

function AttractionFormModal({
  attraction,
  state,
  onClose,
  onSave,
}: {
  attraction: Attraction | null;
  state?: AttractionState;
  onClose: () => void;
  onSave: (attraction: Attraction, statePatch: AttractionState) => void;
}) {
  const [draft, setDraft] = useState<Attraction>(blankAttraction);
  const [visited, setVisited] = useState(false);

  useEffect(() => {
    setDraft(attraction ?? blankAttraction());
    setVisited(state?.visited ?? false);
  }, [attraction, state]);

  const updateDraft = <K extends keyof Attraction>(key: K, value: Attraction[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSave(
      {
        ...draft,
        name: draft.name.trim(),
        city: draft.city.trim(),
        day: draft.day.trim(),
        time: draft.time?.trim(),
        description: draft.description.trim(),
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
                  Pontos turisticos
                </p>
                <h2 className="mt-1 text-2xl font-black text-slate-950">
                  {attraction.name ? 'Editar ponto turistico' : 'Novo ponto turistico'}
                </h2>
              </div>
              <button type="button" onClick={onClose} aria-label="Fechar" className="rounded-2xl border border-slate-200 p-3 text-slate-500 transition hover:bg-slate-50">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="md:col-span-2">
                <span className="mb-2 block text-sm font-bold text-slate-600">Nome do ponto turistico</span>
                <input required value={draft.name} onChange={(event) => updateDraft('name', event.target.value)} className="h-12 w-full rounded-2xl border border-slate-200 px-4 font-semibold outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100" />
              </label>
              <label>
                <span className="mb-2 block text-sm font-bold text-slate-600">Pais</span>
                <select value={draft.country} onChange={(event) => updateDraft('country', event.target.value as CountryId)} className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 font-semibold outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100">
                  {countries.filter((country) => country.id !== 'all').map((country) => (
                    <option key={country.id} value={country.id}>{country.name}</option>
                  ))}
                </select>
              </label>
              <label>
                <span className="mb-2 block text-sm font-bold text-slate-600">Cidade</span>
                <input required value={draft.city} onChange={(event) => updateDraft('city', event.target.value)} className="h-12 w-full rounded-2xl border border-slate-200 px-4 font-semibold outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100" />
              </label>
              <label>
                <span className="mb-2 block text-sm font-bold text-slate-600">Dia previsto</span>
                <input required value={draft.day} onChange={(event) => updateDraft('day', event.target.value)} className="h-12 w-full rounded-2xl border border-slate-200 px-4 font-semibold outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100" />
              </label>
              <label>
                <span className="mb-2 block text-sm font-bold text-slate-600">Horario previsto</span>
                <input value={draft.time ?? ''} onChange={(event) => updateDraft('time', event.target.value)} className="h-12 w-full rounded-2xl border border-slate-200 px-4 font-semibold outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100" />
              </label>
              <label className="md:col-span-2">
                <span className="mb-2 block text-sm font-bold text-slate-600">Descricao</span>
                <textarea required value={draft.description} onChange={(event) => updateDraft('description', event.target.value)} rows={4} className="w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100" />
              </label>
              <label className="flex items-center gap-3 rounded-2xl bg-slate-50 p-4 font-bold text-slate-700 md:col-span-2">
                <input type="checkbox" checked={visited} onChange={(event) => setVisited(event.target.checked)} className="h-5 w-5 accent-teal-600" />
                Status visitado
              </label>
            </div>

            <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={onClose} className="h-12 rounded-2xl border border-slate-200 px-5 font-bold text-slate-600 transition hover:bg-slate-50">Cancelar</button>
              <button type="submit" className="h-12 rounded-2xl bg-slate-950 px-6 font-bold text-white shadow-xl shadow-slate-900/20 transition hover:bg-teal-700">Salvar ponto</button>
            </div>
          </motion.form>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export function AttractionsPage({ selectedCountry, onCountryChange }: AttractionsPageProps) {
  const cachedAttractions = getCachedAttractions();
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

    const syncAttractions = async () => {
      try {
        setIsLoading(true);
        await seedAttractionsIfEmpty();
        const payload = await getAttractions();
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
    const channel = subscribeAttractions(() => {
      void getAttractions()
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
      void channel.unsubscribe();
    };
  }, []);

  useEffect(() => {
    try {
      cacheAttractionsFallback({ items, states });
    } catch {
      // Cache failures should not block the Supabase-backed flow.
    }
  }, [items, states]);

  const filteredAttractions = useMemo(
    () =>
      selectedCountry === 'all'
        ? items
        : items.filter((attraction) => attraction.country === selectedCountry),
    [items, selectedCountry],
  );

  const visitedCount = filteredAttractions.filter((attraction) => states[attraction.id]?.visited)
    .length;
  const photoCount = filteredAttractions.filter((attraction) => states[attraction.id]?.photo).length;

  const handleStateChange = (id: string, nextState: AttractionState) => {
    setStates((current) => ({
      ...current,
      [id]: nextState,
    }));

    void updateAttractionVisit(id, nextState.visited).catch(() => {
      setSyncWarning('Nao foi possivel salvar o status no Supabase. Alteracao mantida no cache local.');
    });
  };

  const handleSaveAttraction = async (attraction: Attraction, nextState: AttractionState) => {
    const isEditing = items.some((item) => item.id === attraction.id);
    setIsSaving(true);

    try {
      const payload = isEditing
        ? await updateAttraction(attraction, nextState.visited)
        : await createAttraction(attraction, nextState.visited, items.length);
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
      await deleteAttraction(id, photoUrl);
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
      const photoUrl = await uploadAttractionPhoto(id, file);
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
      await deleteAttractionPhoto(id);
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
      const payload = await resetAttractionsToDefault();
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
    <motion.div className="space-y-6" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>
      <section className="rounded-[2rem] border border-white/70 bg-white/80 p-6 shadow-xl shadow-slate-900/10 backdrop-blur-xl md:p-8">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-500">Pontos turisticos</p>
        <div className="mt-3 grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <h1 className="text-4xl font-black tracking-tight text-slate-950 md:text-5xl">Visitas da viagem</h1>
            <p className="mt-4 max-w-3xl leading-7 text-slate-600">Uma lista limpa apenas com visitas e pontos turisticos. Marque o que ja foi visitado e guarde uma foto compactada de cada lugar.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-3xl bg-slate-950 px-5 py-4 text-white">
              <span className="flex items-center gap-2 text-sm font-bold text-teal-200"><CheckCircle2 className="h-4 w-4" />Visitados</span>
              <strong className="text-2xl font-black">{visitedCount}/{filteredAttractions.length}</strong>
            </div>
            <div className="rounded-3xl bg-white px-5 py-4 text-slate-950 ring-1 ring-slate-200">
              <span className="flex items-center gap-2 text-sm font-bold text-slate-500"><Camera className="h-4 w-4" />Fotos</span>
              <strong className="text-2xl font-black">{photoCount}</strong>
            </div>
          </div>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={() => setEditingAttraction(blankAttraction())} className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 font-bold text-white shadow-xl shadow-slate-900/20 transition hover:bg-teal-700">
            <Plus className="h-5 w-5" /> Novo ponto turistico
          </button>
          <button type="button" onClick={() => void restoreDefaults()} className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 font-bold text-slate-700 transition hover:bg-slate-50">
            <RotateCcw className="h-5 w-5" /> Restaurar pontos padrão
          </button>
        </div>
      </section>

      <CountryFilter value={selectedCountry} onChange={onCountryChange} label="Filtrar pontos por pais" />
      {syncWarning || isLoading || isSaving || uploadingId ? (
        <p className="rounded-2xl border border-white/70 bg-white/75 px-4 py-3 text-sm font-semibold text-slate-600 shadow-lg shadow-slate-900/5 backdrop-blur-xl">
          {uploadingId
            ? 'Atualizando foto no Supabase...'
            : isSaving
              ? 'Salvando pontos no Supabase...'
              : isLoading
                ? 'Sincronizando pontos turisticos...'
                : syncWarning}
        </p>
      ) : null}

      <div className="flex items-center justify-between rounded-[2rem] border border-white/70 bg-white/70 px-5 py-4 shadow-lg shadow-slate-900/5 backdrop-blur-xl">
        <span className="flex items-center gap-2 text-sm font-bold text-slate-600"><MapPin className="h-4 w-4" />{filteredAttractions.length} pontos nesta selecao</span>
        <span className="text-sm font-bold text-slate-400">Clique em um card para editar</span>
      </div>

      <motion.div layout className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <AnimatePresence mode="popLayout">
          {filteredAttractions.map((attraction) => (
            <AttractionCard key={attraction.id} attraction={attraction} state={states[attraction.id]} onClick={setSelectedAttraction} />
          ))}
        </AnimatePresence>
      </motion.div>

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
        onClose={() => setEditingAttraction(null)}
        onSave={(attraction, statePatch) => void handleSaveAttraction(attraction, statePatch)}
      />
    </motion.div>
  );
}
