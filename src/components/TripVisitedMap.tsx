import { ArrowRight, CalendarDays, Globe2, MapPin } from 'lucide-react';
import { useMemo, useState } from 'react';
import { countryLabel, normalizeCountryId } from '../data/countries';
import type { CountryId, VisitedCountry } from '../types';

export type TripMapCountry = {
  id: CountryId;
  name: string;
  flag: string;
  path: string;
  labelX: number;
  labelY: number;
};

const WORLD_COUNTRY_TOTAL = 195;

const mapCountries: TripMapCountry[] = [
  {
    id: 'brazil',
    name: 'Brasil',
    flag: '🇧🇷',
    path: 'M322 314 L363 304 L398 328 L411 371 L389 420 L350 448 L318 426 L299 380 Z',
    labelX: 362,
    labelY: 367,
  },
  {
    id: 'france',
    name: 'França',
    flag: '🇫🇷',
    path: 'M462 179 L499 170 L523 194 L514 226 L477 233 L450 207 Z',
    labelX: 487,
    labelY: 201,
  },
  {
    id: 'spain',
    name: 'Espanha',
    flag: '🇪🇸',
    path: 'M433 225 L477 218 L504 241 L492 270 L446 272 L421 249 Z',
    labelX: 464,
    labelY: 248,
  },
  {
    id: 'portugal',
    name: 'Portugal',
    flag: '🇵🇹',
    path: 'M412 230 L431 228 L428 271 L407 266 Z',
    labelX: 419,
    labelY: 250,
  },
  {
    id: 'switzerland',
    name: 'Suíça',
    flag: '🇨🇭',
    path: 'M514 190 L535 187 L546 204 L533 220 L510 213 Z',
    labelX: 528,
    labelY: 203,
  },
  {
    id: 'italy',
    name: 'Itália',
    flag: '🇮🇹',
    path: 'M541 211 L561 218 L571 255 L595 290 L584 309 L552 274 L531 235 Z',
    labelX: 564,
    labelY: 257,
  },
  {
    id: 'germany',
    name: 'Alemanha',
    flag: '🇩🇪',
    path: 'M506 146 L544 142 L565 165 L553 197 L520 194 L497 171 Z',
    labelX: 534,
    labelY: 168,
  },
  {
    id: 'netherlands',
    name: 'Países Baixos',
    flag: '🇳🇱',
    path: 'M486 141 L509 138 L517 159 L494 168 L478 154 Z',
    labelX: 500,
    labelY: 151,
  },
  {
    id: 'united_kingdom',
    name: 'Reino Unido',
    flag: '🇬🇧',
    path: 'M426 91 L459 80 L486 107 L481 152 L460 172 L432 158 L416 120 Z',
    labelX: 458,
    labelY: 125,
  },
  {
    id: 'england',
    name: 'Inglaterra',
    flag: '🏴',
    path: 'M442 132 L466 126 L482 145 L466 164 L438 157 Z',
    labelX: 461,
    labelY: 146,
  },
  {
    id: 'scotland',
    name: 'Escócia',
    flag: '🏴',
    path: 'M430 91 L459 82 L475 106 L459 128 L429 119 Z',
    labelX: 452,
    labelY: 106,
  },
  {
    id: 'japan',
    name: 'Japão',
    flag: '🇯🇵',
    path: 'M831 185 L850 174 L862 195 L853 226 L833 244 L818 224 Z M872 226 L889 242 L875 264 L861 248 Z',
    labelX: 854,
    labelY: 221,
  },
];

const formatVisitedDate = (value?: string | null) => {
  if (!value) return 'Sem data';

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value));
};

const getPercent = (count: number) => Math.round((count / WORLD_COUNTRY_TOTAL) * 100);

const visitedCountriesOnly = (countries: VisitedCountry[]) =>
  countries
    .filter((country) => country.visited)
    .sort((a, b) => new Date(b.visitedAt ?? b.updatedAt ?? 0).getTime() - new Date(a.visitedAt ?? a.updatedAt ?? 0).getTime());

type TripVisitedMapProps = {
  activeGroupName?: string;
  tripCountries: string[];
  visitedCountries: VisitedCountry[];
  actionCountryId?: string | null;
  warning?: string | null;
  onToggleCountry: (country: TripMapCountry) => void;
  onOpenTourism: () => void;
  onCreateTrip: () => void;
};

export function TripVisitedMap({
  activeGroupName,
  tripCountries,
  visitedCountries,
  actionCountryId,
  warning,
  onToggleCountry,
  onOpenTourism,
  onCreateTrip,
}: TripVisitedMapProps) {
  const [hoveredCountryId, setHoveredCountryId] = useState<string | null>(null);
  const normalizedTripCountries = useMemo(
    () => new Set(tripCountries.map((country) => normalizeCountryId(country))),
    [tripCountries],
  );
  const visitedList = useMemo(() => visitedCountriesOnly(visitedCountries), [visitedCountries]);
  const visitedByCode = useMemo(
    () => new Map(visitedList.map((country) => [normalizeCountryId(country.countryCode), country])),
    [visitedList],
  );
  const supportedCountryIds = useMemo(() => new Set(mapCountries.map((country) => country.id)), []);
  const unsupportedTripCountries = [...normalizedTripCountries]
    .filter((countryId) => countryId !== 'international' && !supportedCountryIds.has(countryId));
  const visitedCount = visitedList.length;
  const worldPercent = getPercent(visitedCount);
  const latestVisited = visitedList[0] ?? null;
  const hoveredCountry = mapCountries.find((country) => country.id === hoveredCountryId) ?? null;
  const hoveredVisited = hoveredCountry ? visitedByCode.has(hoveredCountry.id) : false;

  return (
    <section className="rounded-xl border border-[#e6ebf3] bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.045)] md:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-[#007c68]">Mapa da viagem</p>
          <h2 className="mt-2 text-3xl font-black tracking-tight text-[#0b1326]">
            {activeGroupName ? 'Países e pontos da viagem ativa' : 'Nenhuma viagem ativa'}
          </h2>
          <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-[#667085]">
            {activeGroupName
              ? 'Verde indica país marcado como visitado. Destinos da viagem ficam em cinza até serem marcados.'
              : 'Crie ou abra uma viagem para visualizar países, cidades e pontos turísticos.'}
          </p>
        </div>
        <button
          type="button"
          onClick={activeGroupName ? onOpenTourism : onCreateTrip}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-black px-5 font-bold text-white transition hover:bg-[#111827]"
        >
          {activeGroupName ? 'Abrir Turismo' : 'Criar viagem'}
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      {warning ? (
        <p className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
          {warning}
        </p>
      ) : null}

      {activeGroupName ? (
        <>
          <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_26rem]">
            <div className="min-w-0">
              <div className="relative overflow-hidden rounded-xl border border-[#dfe5ee] bg-gradient-to-br from-[#f8fbff] to-[#eef3f8] p-3 shadow-inner">
                <div className="absolute left-5 top-5 z-10 grid overflow-hidden rounded-xl border border-[#dfe5ee] bg-white shadow-lg">
                  <button type="button" aria-label="Aproximar mapa" className="grid h-9 w-9 place-items-center border-b border-[#dfe5ee] text-xl font-bold text-[#0b1326]">+</button>
                  <button type="button" aria-label="Afastar mapa" className="grid h-9 w-9 place-items-center text-xl font-bold text-[#0b1326]">−</button>
                </div>
                <button
                  type="button"
                  aria-label="Centralizar mapa"
                  className="absolute bottom-5 left-5 z-10 inline-flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-sm font-bold text-[#45464d] shadow-lg"
                >
                  <Globe2 className="h-4 w-4" />
                  Centralizar mapa
                </button>

                {hoveredCountry ? (
                  <div
                    className="pointer-events-none absolute z-20 rounded-xl border border-[#dfe5ee] bg-white px-3 py-2 text-sm font-bold text-[#0b1326] shadow-xl"
                    style={{ left: `${Math.min(82, Math.max(8, hoveredCountry.labelX / 10))}%`, top: `${Math.min(78, Math.max(8, hoveredCountry.labelY / 5.2))}%` }}
                  >
                    <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: hoveredVisited ? '#10b981' : '#cbd5e1' }} />
                    {hoveredCountry.name} — {hoveredVisited ? 'Visitado' : 'Não visitado'}
                  </div>
                ) : null}

                <svg viewBox="0 0 1000 520" role="img" aria-label="Mapa-múndi interativo de países visitados" className="h-[22rem] w-full md:h-[28rem]">
                  <defs>
                    <filter id="countryShadow" x="-20%" y="-20%" width="140%" height="140%">
                      <feDropShadow dx="0" dy="8" stdDeviation="8" floodColor="#0f172a" floodOpacity="0.14" />
                    </filter>
                  </defs>
                  <g fill="#dfe4ea" stroke="#ffffff" strokeWidth="1.5" opacity="0.92">
                    <path d="M95 122 L156 78 L245 83 L304 132 L286 196 L215 231 L130 205 L72 162 Z" />
                    <path d="M295 271 L370 288 L430 352 L402 462 L342 505 L287 428 L261 341 Z" />
                    <path d="M421 118 L535 62 L703 78 L872 126 L931 197 L871 258 L705 251 L608 293 L516 256 L430 213 Z" />
                    <path d="M505 251 L588 279 L617 371 L560 465 L490 394 L462 313 Z" />
                    <path d="M758 359 L846 351 L905 404 L867 463 L771 442 Z" />
                    <path d="M884 215 L934 232 L951 275 L908 289 Z" />
                  </g>

                  {mapCountries.map((country) => {
                    const isVisited = visitedByCode.has(country.id);
                    const isTripCountry = normalizedTripCountries.has(country.id);
                    const isBusy = actionCountryId === country.id;
                    const fill = isVisited ? '#10b981' : isTripCountry ? '#d4dde8' : '#e5e7eb';
                    const stroke = isVisited ? '#059669' : isTripCountry ? '#007c68' : '#ffffff';

                    return (
                      <path
                        key={country.id}
                        d={country.path}
                        role="button"
                        tabIndex={0}
                        aria-label={`${isVisited ? 'Remover' : 'Marcar'} ${country.name} ${isVisited ? 'dos visitados' : 'como visitado'}`}
                        fill={fill}
                        stroke={stroke}
                        strokeWidth={isTripCountry && !isVisited ? 3 : 1.5}
                        strokeDasharray={isTripCountry && !isVisited ? '6 4' : undefined}
                        filter={isVisited ? 'url(#countryShadow)' : undefined}
                        className={`cursor-pointer transition ${isBusy ? 'opacity-45' : 'hover:brightness-110'}`}
                        onClick={() => !isBusy && onToggleCountry(country)}
                        onKeyDown={(event) => {
                          if ((event.key === 'Enter' || event.key === ' ') && !isBusy) {
                            event.preventDefault();
                            onToggleCountry(country);
                          }
                        }}
                        onMouseEnter={() => setHoveredCountryId(country.id)}
                        onMouseLeave={() => setHoveredCountryId(null)}
                      >
                        <title>{`${country.name} — ${isVisited ? 'Visitado' : 'Não visitado'}`}</title>
                      </path>
                    );
                  })}
                </svg>
              </div>

              <div className="mt-4 grid gap-4 rounded-xl border border-[#e6ebf3] bg-white p-4 md:grid-cols-3">
                <MapMetric icon={Globe2} label="Total visitados" value={String(visitedCount)} detail={`de ${WORLD_COUNTRY_TOTAL} países`} tone="teal" />
                <MapMetric icon={MapPin} label="% do mundo" value={`${worldPercent}%`} detail="dos países do mundo" tone="sky" />
                <MapMetric
                  icon={CalendarDays}
                  label="Último marcado"
                  value={latestVisited?.countryName ?? 'Nenhum'}
                  detail={latestVisited ? formatVisitedDate(latestVisited.visitedAt) : 'Clique em um país'}
                  tone="amber"
                />
              </div>

              {unsupportedTripCountries.length ? (
                <div className="mt-4 rounded-xl border border-[#dfe5ee] bg-[#f8fafc] p-4">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-[#667085]">Destinos da viagem ainda sem área no mapa simplificado</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {unsupportedTripCountries.map((countryId) => (
                      <span key={countryId} className="rounded-full border border-[#cfd6e2] bg-white px-3 py-2 text-xs font-black text-[#45464d]">
                        {countryLabel(countryId)}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <aside className="space-y-4">
              <section className="rounded-xl border border-[#e6ebf3] bg-white p-5 shadow-[0_10px_26px_rgba(15,23,42,0.04)]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-3">
                      <Globe2 className="h-6 w-6 text-[#007c68]" />
                      <p className="font-black text-[#0b1326]">Países visitados</p>
                    </div>
                    <p className="mt-4 text-4xl font-black text-[#007c68]">{visitedCount}</p>
                    <p className="mt-1 text-sm font-semibold text-[#667085]">de {WORLD_COUNTRY_TOTAL} países</p>
                  </div>
                  <div className="grid h-20 w-20 place-items-center rounded-full border-[6px] border-[#e6ebf3] text-sm font-black text-[#0b1326]">
                    {worldPercent}%
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-[#e6ebf3] bg-white p-5 shadow-[0_10px_26px_rgba(15,23,42,0.04)]">
                <div className="mb-4 flex items-center gap-3">
                  <CalendarDays className="h-5 w-5 text-[#0b1326]" />
                  <h3 className="font-black text-[#0b1326]">Últimos marcados</h3>
                </div>
                {visitedList.length ? (
                  <div className="space-y-3">
                    {visitedList.slice(0, 4).map((country) => (
                      <div key={country.id} className="flex items-center justify-between gap-3 text-sm">
                        <span className="min-w-0 font-black text-[#0b1326]">
                          {mapCountries.find((item) => item.id === normalizeCountryId(country.countryCode))?.flag ?? '🏳️'} {country.countryName}
                        </span>
                        <span className="shrink-0 font-semibold text-[#667085]">{formatVisitedDate(country.visitedAt)}</span>
                      </div>
                    ))}
                    <p className="pt-2 text-sm font-black text-[#007c68]">Ver todos</p>
                  </div>
                ) : (
                  <p className="rounded-xl bg-[#f4f7fb] px-4 py-3 text-sm font-semibold text-[#667085]">
                    Clique em um país para marcar como visitado.
                  </p>
                )}
              </section>

              <section className="rounded-xl border border-[#e6ebf3] bg-white p-5 shadow-[0_10px_26px_rgba(15,23,42,0.04)]">
                <h3 className="font-black text-[#0b1326]">Legenda</h3>
                <div className="mt-4 space-y-3 text-sm font-semibold text-[#667085]">
                  <p className="flex items-center gap-3"><span className="h-5 w-5 rounded-md bg-[#10b981]" />Visitado</p>
                  <p className="flex items-center gap-3"><span className="h-5 w-5 rounded-md bg-[#e5e7eb]" />Não visitado</p>
                  <p className="flex items-center gap-3"><span className="h-5 w-5 rounded-md border-2 border-dashed border-[#007c68] bg-[#d4dde8]" />Na viagem, ainda não visitado</p>
                </div>
              </section>
            </aside>
          </div>
        </>
      ) : (
        <div className="mt-6 rounded-xl border border-dashed border-[#cfd6e2] bg-[#f8fafc] p-8 text-center">
          <Globe2 className="mx-auto h-10 w-10 text-[#007c68]" />
          <h3 className="mt-4 text-2xl font-black text-[#0b1326]">Nenhuma viagem ativa encontrada.</h3>
          <p className="mx-auto mt-2 max-w-lg text-sm font-semibold leading-6 text-[#667085]">
            Crie uma viagem ou entre em um grupo para começar a marcar países visitados.
          </p>
        </div>
      )}
    </section>
  );
}

function MapMetric({
  detail,
  icon: Icon,
  label,
  tone,
  value,
}: {
  detail: string;
  icon: typeof Globe2;
  label: string;
  tone: 'amber' | 'sky' | 'teal';
  value: string;
}) {
  const toneClasses = {
    amber: 'bg-amber-100 text-amber-700',
    sky: 'bg-sky-100 text-sky-700',
    teal: 'bg-emerald-100 text-emerald-700',
  };

  return (
    <article className="flex items-center gap-4">
      <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-full ${toneClasses[tone]}`}>
        <Icon className="h-7 w-7" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-bold text-[#667085]">{label}</p>
        <p className="mt-1 truncate text-2xl font-black text-[#0b1326]">{value}</p>
        <p className="mt-1 text-sm font-semibold text-[#667085]">{detail}</p>
      </div>
    </article>
  );
}
