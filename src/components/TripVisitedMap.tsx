import { ArrowRight, CalendarDays, Globe2, LocateFixed, MapPin, Minus, Plus } from 'lucide-react';
import type { KeyboardEvent, MouseEvent } from 'react';
import { useMemo, useState } from 'react';
import { ComposableMap, Geographies, Geography, ZoomableGroup, type GeographyType } from 'react-simple-maps';
import worldMapUrl from '../assets/maps/world-110m.json?url';
import {
  countryFlagEmoji,
  countryIso3Code,
  countryLabel,
  normalizeCountryCode,
} from '../data/countries';
import type { CountryId, VisitedCountry } from '../types';

export type TripMapCountry = {
  id: CountryId;
  code: CountryId;
  name: string;
  flag: string;
  iso3?: string | null;
  sourceName?: string;
};

type TooltipState = {
  country: TripMapCountry;
  isTripCountry: boolean;
  isVisited: boolean;
  x: number;
  y: number;
};

const WORLD_COUNTRY_TOTAL = 195;
const DEFAULT_CENTER: [number, number] = [0, 0];
const DEFAULT_ZOOM = 1;

const formatVisitedDate = (value?: string | null) => {
  if (!value) return 'Sem data';

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value));
};

const getPercent = (count: number) => Math.round((count / WORLD_COUNTRY_TOTAL) * 100);

const normalizeTripCountriesForMap = (tripCountries: string[]) => {
  const countryIds = new Set<string>();

  tripCountries.forEach((country) => {
    const normalized = normalizeCountryCode(country);
    if (!normalized || normalized === 'all' || normalized === 'international') return;

    countryIds.add(normalized);
  });

  return countryIds;
};

const visitedCountriesOnly = (countries: VisitedCountry[]) => {
  const byMapCountry = new Map<string, VisitedCountry>();

  countries
    .filter((country) => country.visited)
    .sort((a, b) => new Date(b.visitedAt ?? b.updatedAt ?? 0).getTime() - new Date(a.visitedAt ?? a.updatedAt ?? 0).getTime())
    .forEach((country) => {
      const normalizedCode = normalizeCountryCode(country.countryCode);
      if (!byMapCountry.has(normalizedCode)) {
        byMapCountry.set(normalizedCode, country);
      }
    });

  return [...byMapCountry.values()];
};

const geographyName = (geography: GeographyType) => {
  const properties = geography.properties ?? {};
  const candidates = [
    properties.name,
    properties.NAME,
    properties.NAME_LONG,
    properties.ADMIN,
    properties.NAME_PT,
  ];

  return String(candidates.find((candidate) => typeof candidate === 'string' && candidate.trim()) ?? geography.id ?? '');
};

const geographyToCountry = (geography: GeographyType): TripMapCountry => {
  const numericId = geography.id ? String(geography.id) : '';
  const sourceName = geographyName(geography);
  const iso3 = countryIso3Code(numericId) ?? countryIso3Code(sourceName);
  const identitySource = iso3 ?? sourceName;
  const code = normalizeCountryCode(identitySource);

  return {
    id: code,
    code,
    name: countryLabel(identitySource),
    flag: countryFlagEmoji(identitySource),
    iso3,
    sourceName,
  };
};

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
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>(DEFAULT_CENTER);
  const [mapZoom, setMapZoom] = useState(DEFAULT_ZOOM);

  const normalizedTripCountries = useMemo(
    () => normalizeTripCountriesForMap(tripCountries),
    [tripCountries],
  );
  const visitedList = useMemo(() => visitedCountriesOnly(visitedCountries), [visitedCountries]);
  const visitedByCountryId = useMemo(
    () => new Map(visitedList.map((country) => [normalizeCountryCode(country.countryCode), country])),
    [visitedList],
  );
  const visitedCount = visitedList.length;
  const worldPercent = getPercent(visitedCount);
  const latestVisited = visitedList[0] ?? null;

  const updateTooltip = (
    event: MouseEvent<SVGPathElement>,
    country: TripMapCountry,
    isVisited: boolean,
    isTripCountry: boolean,
  ) => {
    const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
    setTooltip({
      country,
      isVisited,
      isTripCountry,
      x: rect ? event.clientX - rect.left : event.clientX,
      y: rect ? event.clientY - rect.top : event.clientY,
    });
  };

  const handleKeyboardToggle = (event: KeyboardEvent<SVGPathElement>, country: TripMapCountry, isBusy: boolean) => {
    if ((event.key === 'Enter' || event.key === ' ') && !isBusy) {
      event.preventDefault();
      onToggleCountry(country);
    }
  };

  return (
    <section className="rounded-xl border border-[#e6ebf3] bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.045)] dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/30 md:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-[#007c68] dark:text-emerald-300">Mapa da viagem</p>
          <h2 className="mt-2 text-3xl font-black tracking-tight text-[#0b1326] dark:text-slate-50">
            {activeGroupName ? 'Países e pontos da viagem ativa' : 'Histórico de países visitados'}
          </h2>
          <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-[#667085] dark:text-slate-300">
            {activeGroupName
              ? 'Verde indica país marcado como visitado. Destinos da viagem ficam em cinza até serem marcados.'
              : 'Verde indica o histórico global do seu perfil. Crie uma viagem para destacar destinos planejados.'}
          </p>
        </div>
        <button
          type="button"
          onClick={activeGroupName ? onOpenTourism : onCreateTrip}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-black px-5 font-bold text-white transition hover:bg-[#111827] dark:bg-emerald-400 dark:text-emerald-950 dark:hover:bg-emerald-300"
        >
          {activeGroupName ? 'Abrir Turismo' : 'Criar viagem'}
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      {warning ? (
        <p className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200">
          {warning}
        </p>
      ) : null}

      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_26rem]">
          <div className="min-w-0">
            <div className="relative h-[20rem] overflow-hidden rounded-xl border border-[#dfe5ee] bg-gradient-to-br from-[#f8fbff] to-[#eef3f8] p-3 shadow-inner dark:border-slate-700 dark:from-slate-800 dark:to-slate-900 sm:h-[24rem] lg:h-[28rem] 2xl:h-[31rem]">
              <div className="absolute left-5 top-5 z-10 grid overflow-hidden rounded-xl border border-[#dfe5ee] bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/30">
                <button
                  type="button"
                  aria-label="Aproximar mapa"
                  onClick={() => setMapZoom((current) => Math.min(4, Number((current + 0.45).toFixed(2))))}
                  className="grid h-9 w-9 place-items-center border-b border-[#dfe5ee] text-[#0b1326] transition hover:bg-[#f4f7fb] dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
                >
                  <Plus className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="Afastar mapa"
                  onClick={() => setMapZoom((current) => Math.max(1, Number((current - 0.45).toFixed(2))))}
                  className="grid h-9 w-9 place-items-center text-[#0b1326] transition hover:bg-[#f4f7fb] dark:text-slate-100 dark:hover:bg-slate-800"
                >
                  <Minus className="h-4 w-4" />
                </button>
              </div>
              <button
                type="button"
                aria-label="Centralizar mapa"
                onClick={() => {
                  setMapCenter(DEFAULT_CENTER);
                  setMapZoom(DEFAULT_ZOOM);
                }}
                className="absolute bottom-5 left-5 z-10 inline-flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-sm font-bold text-[#45464d] shadow-lg transition hover:bg-[#f4f7fb] dark:bg-slate-900 dark:text-slate-200 dark:shadow-black/30 dark:hover:bg-slate-800"
              >
                <LocateFixed className="h-4 w-4" />
                Centralizar mapa
              </button>

              {tooltip ? (
                <div
                  className="pointer-events-none absolute z-20 rounded-xl border border-[#dfe5ee] bg-white px-3 py-2 text-sm font-bold text-[#0b1326] shadow-xl dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:shadow-black/30"
                  style={{
                    left: `${Math.min(86, Math.max(4, (tooltip.x / 1000) * 100))}%`,
                    top: `${Math.min(80, Math.max(6, (tooltip.y / 430) * 100))}%`,
                  }}
                >
                  <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: tooltip.isVisited ? '#10b981' : '#cbd5e1' }} />
                  {tooltip.country.flag} {tooltip.country.name} — {tooltip.isVisited ? 'Visitado' : tooltip.isTripCountry ? 'Na viagem' : 'Não visitado'}
                </div>
              ) : null}

              <ComposableMap
                width={1000}
                height={430}
                projection="geoEqualEarth"
                projectionConfig={{ scale: 186 }}
                role="img"
                aria-label="Mapa-múndi interativo de países visitados"
                className="h-full w-full"
                preserveAspectRatio="xMidYMid meet"
              >
                <ZoomableGroup
                  center={mapCenter}
                  zoom={mapZoom}
                  minZoom={1}
                  maxZoom={4}
                  translateExtent={[
                    [-120, -120],
                    [1120, 560],
                  ]}
                  onMoveEnd={({ coordinates, zoom }) => {
                    setMapCenter(coordinates);
                    setMapZoom(zoom);
                  }}
                >
                  <Geographies geography={worldMapUrl}>
                    {({ geographies }) =>
                      geographies.map((geography) => {
                        const country = geographyToCountry(geography);
                        const isVisited = visitedByCountryId.has(country.code);
                        const isTripCountry = normalizedTripCountries.has(country.code);
                        const isBusy = actionCountryId === country.code;
                        const fill = isVisited ? '#10b981' : isTripCountry ? '#d4dde8' : '#e5e7eb';
                        const stroke = isVisited ? '#059669' : isTripCountry ? '#007c68' : '#ffffff';

                        return (
                          <Geography
                            key={geography.rsmKey}
                            geography={geography}
                            role="button"
                            tabIndex={0}
                            data-country-code={country.code}
                            data-country-source={country.sourceName}
                            aria-label={`${isVisited ? 'Remover' : 'Marcar'} ${country.name} ${isVisited ? 'dos visitados' : 'como visitado'}`}
                            fill={fill}
                            stroke={stroke}
                            strokeWidth={isTripCountry && !isVisited ? 0.85 : 0.45}
                            strokeDasharray={isTripCountry && !isVisited ? '3 2' : undefined}
                            className={`outline-none transition duration-150 focus-visible:stroke-[#0b1326] focus-visible:stroke-[1.6] dark:focus-visible:stroke-slate-50 ${isBusy ? 'opacity-45' : 'cursor-pointer'}`}
                            onClick={() => !isBusy && onToggleCountry(country)}
                            onKeyDown={(event) => handleKeyboardToggle(event, country, isBusy)}
                            onMouseEnter={(event) => updateTooltip(event, country, isVisited, isTripCountry)}
                            onMouseMove={(event) => updateTooltip(event, country, isVisited, isTripCountry)}
                            onMouseLeave={() => setTooltip(null)}
                            style={{
                              default: { outline: 'none' },
                              hover: {
                                fill: isVisited ? '#059669' : isTripCountry ? '#c7d5e3' : '#d8dee8',
                                outline: 'none',
                              },
                              pressed: { outline: 'none' },
                            }}
                          >
                            <title>{`${country.name} — ${isVisited ? 'Visitado' : 'Não visitado'}`}</title>
                          </Geography>
                        );
                      })
                    }
                  </Geographies>
                </ZoomableGroup>
              </ComposableMap>
            </div>

            <div className="mt-4 grid gap-4 rounded-xl border border-[#e6ebf3] bg-white p-4 dark:border-slate-700 dark:bg-slate-900 md:grid-cols-3">
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
          </div>

          <aside className="space-y-4">
            <section className="rounded-xl border border-[#e6ebf3] bg-white p-5 shadow-[0_10px_26px_rgba(15,23,42,0.04)] dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/30">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3">
                    <Globe2 className="h-6 w-6 text-[#007c68]" />
                    <p className="font-black text-[#0b1326] dark:text-slate-50">Países visitados</p>
                  </div>
                  <p className="mt-4 text-4xl font-black text-[#007c68] dark:text-emerald-300">{visitedCount}</p>
                  <p className="mt-1 text-sm font-semibold text-[#667085] dark:text-slate-300">de {WORLD_COUNTRY_TOTAL} países</p>
                </div>
                <div className="grid h-20 w-20 place-items-center rounded-full border-[6px] border-[#e6ebf3] text-sm font-black text-[#0b1326] dark:border-slate-700 dark:text-slate-50">
                  {worldPercent}%
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-[#e6ebf3] bg-white p-5 shadow-[0_10px_26px_rgba(15,23,42,0.04)] dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/30">
              <div className="mb-4 flex items-center gap-3">
                <CalendarDays className="h-5 w-5 text-[#0b1326] dark:text-slate-100" />
                <h3 className="font-black text-[#0b1326] dark:text-slate-50">Últimos marcados</h3>
              </div>
              {visitedList.length ? (
                <div className="space-y-3">
                  {visitedList.slice(0, 4).map((country) => (
                    <div key={country.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0 font-black text-[#0b1326] dark:text-slate-50">
                        {countryFlagEmoji(country.countryCode)} {country.countryName}
                      </span>
                      <span className="shrink-0 font-semibold text-[#667085] dark:text-slate-400">{formatVisitedDate(country.visitedAt)}</span>
                    </div>
                  ))}
                  <p className="pt-2 text-sm font-black text-[#007c68] dark:text-emerald-300">Ver todos</p>
                </div>
              ) : (
                <p className="rounded-xl bg-[#f4f7fb] px-4 py-3 text-sm font-semibold text-[#667085] dark:bg-slate-800 dark:text-slate-300">
                  Clique em um país para marcar como visitado.
                </p>
              )}
            </section>

            <section className="rounded-xl border border-[#e6ebf3] bg-white p-5 shadow-[0_10px_26px_rgba(15,23,42,0.04)] dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/30">
              <h3 className="font-black text-[#0b1326] dark:text-slate-50">Legenda</h3>
              <div className="mt-4 space-y-3 text-sm font-semibold text-[#667085] dark:text-slate-300">
                <p className="flex items-center gap-3"><span className="h-5 w-5 rounded-md bg-[#10b981]" />Visitado</p>
                <p className="flex items-center gap-3"><span className="h-5 w-5 rounded-md bg-[#e5e7eb]" />Não visitado</p>
                <p className="flex items-center gap-3"><span className="h-5 w-5 rounded-md border-2 border-dashed border-[#007c68] bg-[#d4dde8]" />Na viagem, ainda não visitado</p>
              </div>
            </section>
          </aside>
      </div>
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
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-400/10 dark:text-amber-200',
    sky: 'bg-sky-100 text-sky-700 dark:bg-sky-400/10 dark:text-sky-200',
    teal: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200',
  };

  return (
    <article className="flex items-center gap-4">
      <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-full ${toneClasses[tone]}`}>
        <Icon className="h-7 w-7" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-bold text-[#667085] dark:text-slate-400">{label}</p>
        <p className="mt-1 truncate text-2xl font-black text-[#0b1326] dark:text-slate-50">{value}</p>
        <p className="mt-1 text-sm font-semibold text-[#667085] dark:text-slate-300">{detail}</p>
      </div>
    </article>
  );
}
