import { AnimatePresence, motion } from 'framer-motion';
import {
  BedDouble,
  ChevronDown,
  Coffee,
  MapPin,
  Plane,
  Route,
  Sparkles,
  Train,
  Utensils,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { countryNames } from '../data/countries';
import { itineraryItems } from '../data/itinerary';
import type { CountryFilterId, ItineraryItem, ItineraryType } from '../types';
import { CountryFilter } from './CountryFilter';

type ItineraryPageProps = {
  selectedCountry: CountryFilterId;
  onCountryChange: (country: CountryFilterId) => void;
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
};

const countryStyles = {
  italy: 'bg-teal-50 text-teal-700 ring-teal-100',
  switzerland: 'bg-rose-50 text-rose-700 ring-rose-100',
  france: 'bg-blue-50 text-blue-700 ring-blue-100',
  international: 'bg-slate-50 text-slate-700 ring-slate-100',
};

const groupByDay = (items: ItineraryItem[]) =>
  items.reduce<Record<string, ItineraryItem[]>>((groups, item) => {
    groups[item.day] = [...(groups[item.day] ?? []), item];
    return groups;
  }, {});

export function ItineraryPage({ selectedCountry, onCountryChange }: ItineraryPageProps) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const filteredItems = useMemo(
    () =>
      selectedCountry === 'all'
        ? itineraryItems
        : itineraryItems.filter((item) => item.country === selectedCountry),
    [selectedCountry],
  );

  const groupedItems = useMemo(() => groupByDay(filteredItems), [filteredItems]);

  const toggleExpanded = (id: string) => {
    setExpandedItems((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
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
          Roteiro
        </p>
        <div className="mt-3 grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <h1 className="text-4xl font-black tracking-tight text-slate-950 md:text-5xl">
              Roteiro da Viagem Europa
            </h1>
            <p className="mt-4 max-w-3xl leading-7 text-slate-600">
              Roma, Milao, Bernina, St. Moritz e Paris organizados em uma linha
              do tempo simples, com transporte, passeios, hospedagens e pausas.
            </p>
          </div>
          <div className="rounded-3xl bg-slate-950 px-5 py-4 text-white">
            <span className="block text-sm font-bold text-teal-200">Periodo</span>
            <strong className="text-2xl font-black">Dias 16 a 21</strong>
          </div>
        </div>
      </section>

      <CountryFilter
        value={selectedCountry}
        onChange={onCountryChange}
        label="Filtrar roteiro por pais"
      />

      <div className="space-y-6">
        <AnimatePresence mode="popLayout">
          {Object.entries(groupedItems).map(([day, items]) => (
            <motion.section
              layout
              key={day}
              className="rounded-[2rem] border border-white/70 bg-white/85 p-5 shadow-xl shadow-slate-900/10 backdrop-blur-xl md:p-7"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.28 }}
            >
              <div className="mb-6 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-400">
                    Timeline
                  </p>
                  <h2 className="text-2xl font-black text-slate-950">{day}</h2>
                </div>
                <span className="text-sm font-bold text-slate-500">
                  {items.length} itens
                </span>
              </div>

              <div className="relative space-y-3 before:absolute before:bottom-4 before:left-5 before:top-4 before:w-px before:bg-slate-200 md:before:left-6">
                {items.map((item) => {
                  const Icon = typeIcons[item.type];
                  const expanded = expandedItems.has(item.id);

                  return (
                    <motion.article
                      layout
                      key={item.id}
                      className="relative ml-11 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-teal-200 hover:shadow-lg hover:shadow-slate-900/10 md:ml-14 md:p-5"
                      initial={{ opacity: 0, x: -14 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 14 }}
                    >
                      <span className="absolute -left-[2.95rem] top-4 flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg md:-left-[3.45rem]">
                        <Icon className="h-5 w-5" />
                      </span>

                      <button
                        type="button"
                        onClick={() => toggleExpanded(item.id)}
                        className="flex w-full flex-col gap-3 text-left md:flex-row md:items-start md:justify-between"
                      >
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
                              {item.time}
                            </span>
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-black ring-1 ${
                                countryStyles[item.country]
                              }`}
                            >
                              {countryNames[item.country]}
                            </span>
                            <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-400 ring-1 ring-slate-200">
                              {typeLabels[item.type]}
                            </span>
                          </div>
                          <h3 className="mt-3 text-lg font-black text-slate-950">
                            {item.title}
                          </h3>
                          <p className="mt-1 text-sm font-semibold text-slate-500">
                            {item.city}
                          </p>
                        </div>
                        <ChevronDown
                          className={`h-5 w-5 shrink-0 text-slate-400 transition ${
                            expanded ? 'rotate-180' : ''
                          }`}
                        />
                      </button>

                      <AnimatePresence>
                        {expanded ? (
                          <motion.p
                            className="mt-4 rounded-2xl bg-slate-50 p-4 leading-7 text-slate-600"
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                          >
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
    </motion.div>
  );
}
