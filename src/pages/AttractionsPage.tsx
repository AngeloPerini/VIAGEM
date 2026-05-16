import { AnimatePresence, motion } from 'framer-motion';
import { Camera, CheckCircle2, MapPin } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { AttractionCard } from '../components/AttractionCard';
import { AttractionModal } from '../components/AttractionModal';
import { CountryFilter } from '../components/CountryFilter';
import { ATTRACTION_STORAGE_KEY, attractions } from '../data/attractions';
import type { Attraction, AttractionState, AttractionStateMap, CountryFilterId } from '../types';

type AttractionsPageProps = {
  selectedCountry: CountryFilterId;
  onCountryChange: (country: CountryFilterId) => void;
};

const loadAttractionStates = (): AttractionStateMap => {
  const stored = localStorage.getItem(ATTRACTION_STORAGE_KEY);
  if (!stored) return {};

  try {
    return JSON.parse(stored) as AttractionStateMap;
  } catch {
    return {};
  }
};

export function AttractionsPage({ selectedCountry, onCountryChange }: AttractionsPageProps) {
  const [states, setStates] = useState<AttractionStateMap>(loadAttractionStates);
  const [selectedAttraction, setSelectedAttraction] = useState<Attraction | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(ATTRACTION_STORAGE_KEY, JSON.stringify(states));
    } catch {
      // The modal surfaces image-size problems before they usually reach this point.
    }
  }, [states]);

  const filteredAttractions = useMemo(
    () =>
      selectedCountry === 'all'
        ? attractions
        : attractions.filter((attraction) => attraction.country === selectedCountry),
    [selectedCountry],
  );

  const visitedCount = filteredAttractions.filter((attraction) => states[attraction.id]?.visited)
    .length;
  const photoCount = filteredAttractions.filter((attraction) => states[attraction.id]?.photo).length;

  const handleStateChange = (id: string, nextState: AttractionState) => {
    setStates((current) => ({
      ...current,
      [id]: nextState,
    }));
  };

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
    >
      <section className="rounded-[2rem] border border-white/70 bg-white/80 p-6 shadow-xl shadow-slate-900/10 backdrop-blur-xl md:p-8">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-500">
          Pontos turisticos
        </p>
        <div className="mt-3 grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <h1 className="text-4xl font-black tracking-tight text-slate-950 md:text-5xl">
              Visitas da viagem
            </h1>
            <p className="mt-4 max-w-3xl leading-7 text-slate-600">
              Uma lista limpa apenas com visitas e pontos turisticos. Marque o
              que ja foi visitado e guarde uma foto compactada de cada lugar.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-3xl bg-slate-950 px-5 py-4 text-white">
              <span className="flex items-center gap-2 text-sm font-bold text-teal-200">
                <CheckCircle2 className="h-4 w-4" />
                Visitados
              </span>
              <strong className="text-2xl font-black">
                {visitedCount}/{filteredAttractions.length}
              </strong>
            </div>
            <div className="rounded-3xl bg-white px-5 py-4 text-slate-950 ring-1 ring-slate-200">
              <span className="flex items-center gap-2 text-sm font-bold text-slate-500">
                <Camera className="h-4 w-4" />
                Fotos
              </span>
              <strong className="text-2xl font-black">{photoCount}</strong>
            </div>
          </div>
        </div>
      </section>

      <CountryFilter
        value={selectedCountry}
        onChange={onCountryChange}
        label="Filtrar pontos por pais"
      />

      <div className="flex items-center justify-between rounded-[2rem] border border-white/70 bg-white/70 px-5 py-4 shadow-lg shadow-slate-900/5 backdrop-blur-xl">
        <span className="flex items-center gap-2 text-sm font-bold text-slate-600">
          <MapPin className="h-4 w-4" />
          {filteredAttractions.length} pontos nesta selecao
        </span>
        <span className="text-sm font-bold text-slate-400">
          Clique em um card para editar
        </span>
      </div>

      <motion.div layout className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <AnimatePresence mode="popLayout">
          {filteredAttractions.map((attraction) => (
            <AttractionCard
              key={attraction.id}
              attraction={attraction}
              state={states[attraction.id]}
              onClick={setSelectedAttraction}
            />
          ))}
        </AnimatePresence>
      </motion.div>

      <AttractionModal
        attraction={selectedAttraction}
        state={selectedAttraction ? states[selectedAttraction.id] : undefined}
        onClose={() => setSelectedAttraction(null)}
        onChange={handleStateChange}
      />
    </motion.div>
  );
}
