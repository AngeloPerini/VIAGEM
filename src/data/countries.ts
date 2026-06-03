import isoCountries from 'i18n-iso-countries';
import enLocale from 'i18n-iso-countries/langs/en.json';
import ptLocale from 'i18n-iso-countries/langs/pt.json';
import type { CountryMeta } from '../types';

isoCountries.registerLocale(enLocale);
isoCountries.registerLocale(ptLocale);

const knownCountryNames: Record<string, string> = {
  all: 'Todos',
  italy: 'Itália',
  italia: 'Itália',
  it: 'Itália',
  ita: 'Itália',
  switzerland: 'Suíça',
  suica: 'Suíça',
  ch: 'Suíça',
  che: 'Suíça',
  france: 'França',
  franca: 'França',
  fr: 'França',
  fra: 'França',
  england: 'Inglaterra',
  inglaterra: 'Inglaterra',
  scotland: 'Escócia',
  escocia: 'Escócia',
  united_kingdom: 'Reino Unido',
  reino_unido: 'Reino Unido',
  gb: 'Reino Unido',
  gbr: 'Reino Unido',
  brazil: 'Brasil',
  brasil: 'Brasil',
  br: 'Brasil',
  bra: 'Brasil',
  japan: 'Japão',
  japao: 'Japão',
  jp: 'Japão',
  jpn: 'Japão',
  spain: 'Espanha',
  espanha: 'Espanha',
  es: 'Espanha',
  esp: 'Espanha',
  portugal: 'Portugal',
  pt: 'Portugal',
  prt: 'Portugal',
  germany: 'Alemanha',
  alemanha: 'Alemanha',
  de: 'Alemanha',
  deu: 'Alemanha',
  netherlands: 'Países Baixos',
  paises_baixos: 'Países Baixos',
  nl: 'Países Baixos',
  nld: 'Países Baixos',
  international: 'Internacional',
};

const knownCountryShortNames: Record<string, string> = {
  ...knownCountryNames,
  united_kingdom: 'Reino Unido',
  reino_unido: 'Reino Unido',
};

const countryAliases: Record<string, string> = {
  italia: 'italy',
  italy: 'italy',
  it: 'italy',
  ita: 'italy',
  '380': 'italy',
  suica: 'switzerland',
  switzerland: 'switzerland',
  swiss: 'switzerland',
  ch: 'switzerland',
  che: 'switzerland',
  '756': 'switzerland',
  franca: 'france',
  france: 'france',
  fr: 'france',
  fra: 'france',
  '250': 'france',
  inglaterra: 'england',
  england: 'england',
  escocia: 'scotland',
  scotland: 'scotland',
  reino_unido: 'united_kingdom',
  united_kingdom: 'united_kingdom',
  uk: 'united_kingdom',
  gb: 'united_kingdom',
  gbr: 'united_kingdom',
  '826': 'united_kingdom',
  brasil: 'brazil',
  brazil: 'brazil',
  br: 'brazil',
  bra: 'brazil',
  '076': 'brazil',
  '76': 'brazil',
  japao: 'japan',
  japan: 'japan',
  jp: 'japan',
  jpn: 'japan',
  '392': 'japan',
  espanha: 'spain',
  spain: 'spain',
  es: 'spain',
  esp: 'spain',
  '724': 'spain',
  portugal: 'portugal',
  pt: 'portugal',
  prt: 'portugal',
  '620': 'portugal',
  alemanha: 'germany',
  germany: 'germany',
  de: 'germany',
  deu: 'germany',
  '276': 'germany',
  paises_baixos: 'netherlands',
  netherlands: 'netherlands',
  nl: 'netherlands',
  nld: 'netherlands',
  '528': 'netherlands',
  international: 'international',
  internacional: 'international',
};

const countryCodeAliases: Record<string, string> = {
  italia: 'ITA',
  italy: 'ITA',
  it: 'ITA',
  ita: 'ITA',
  '380': 'ITA',
  suica: 'CHE',
  switzerland: 'CHE',
  swiss: 'CHE',
  ch: 'CHE',
  che: 'CHE',
  '756': 'CHE',
  franca: 'FRA',
  france: 'FRA',
  fr: 'FRA',
  fra: 'FRA',
  '250': 'FRA',
  inglaterra: 'GBR',
  england: 'GBR',
  escocia: 'GBR',
  scotland: 'GBR',
  gra_bretanha: 'GBR',
  great_britain: 'GBR',
  britain: 'GBR',
  reino_unido: 'GBR',
  united_kingdom: 'GBR',
  uk: 'GBR',
  gb: 'GBR',
  gbr: 'GBR',
  '826': 'GBR',
  brasil: 'BRA',
  brazil: 'BRA',
  br: 'BRA',
  bra: 'BRA',
  '076': 'BRA',
  '76': 'BRA',
  japao: 'JPN',
  japan: 'JPN',
  jp: 'JPN',
  jpn: 'JPN',
  '392': 'JPN',
  espanha: 'ESP',
  spain: 'ESP',
  es: 'ESP',
  esp: 'ESP',
  '724': 'ESP',
  portugal: 'PRT',
  pt: 'PRT',
  prt: 'PRT',
  '620': 'PRT',
  alemanha: 'DEU',
  germany: 'DEU',
  de: 'DEU',
  deu: 'DEU',
  '276': 'DEU',
  paises_baixos: 'NLD',
  netherlands: 'NLD',
  nl: 'NLD',
  nld: 'NLD',
  '528': 'NLD',
};

const accentPalette = [
  '#0f766e',
  '#dc2626',
  '#2563eb',
  '#7c3aed',
  '#d97706',
  '#059669',
  '#be123c',
  '#0891b2',
  '#9333ea',
  '#65a30d',
];

const stripAccents = (value: string) =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const slugifyCountry = (value: string) =>
  stripAccents(value)
    .trim()
    .toLowerCase()
    .replace(/&/g, ' e ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const titleCase = (value: string) =>
  value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const paletteIndex = (id: string) =>
  [...id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % accentPalette.length;

const normalizeNumericIso = (value: string) => {
  const onlyDigits = value.replace(/\D/g, '');
  return onlyDigits ? onlyDigits.padStart(3, '0') : '';
};

export const countryIso3Code = (value?: string | number | null): string | null => {
  const rawValue = String(value ?? '').trim();
  if (!rawValue) return null;

  const slug = slugifyCountry(rawValue);
  if (countryCodeAliases[slug]) {
    return countryCodeAliases[slug];
  }

  const upperValue = stripAccents(rawValue).toUpperCase();
  if (/^\d+$/.test(upperValue)) {
    return isoCountries.numericToAlpha3(normalizeNumericIso(upperValue)) ?? null;
  }

  if (upperValue.length === 2) {
    return isoCountries.alpha2ToAlpha3(upperValue) ?? null;
  }

  if (upperValue.length === 3 && isoCountries.alpha3ToAlpha2(upperValue)) {
    return upperValue;
  }

  return (
    isoCountries.getAlpha3Code(rawValue, 'pt') ??
    isoCountries.getSimpleAlpha3Code(rawValue, 'pt') ??
    isoCountries.getAlpha3Code(rawValue, 'en') ??
    isoCountries.getSimpleAlpha3Code(rawValue, 'en') ??
    null
  );
};

export const normalizeCountryCode = (value?: string | number | null): string => {
  const rawValue = String(value ?? '').trim();
  const iso3 = countryIso3Code(rawValue);

  if (iso3) return iso3;

  return normalizeCountryId(rawValue);
};

export const countryIso2Code = (value?: string | number | null): string | null => {
  const iso3 = countryIso3Code(value);
  return iso3 ? isoCountries.alpha3ToAlpha2(iso3) ?? null : null;
};

export const countryFlagEmoji = (value?: string | number | null): string => {
  const iso2 = countryIso2Code(value);
  if (!iso2) return '🏳️';

  return [...iso2.toUpperCase()]
    .map((char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
    .join('');
};

export const normalizeCountryId = (value?: string | null): string => {
  const iso3 = countryIso3Code(value);
  if (iso3) {
    const isoSlug = iso3.toLowerCase();
    return countryAliases[isoSlug] ?? isoSlug;
  }

  const slug = slugifyCountry(String(value ?? ''));
  if (!slug) {
    return 'international';
  }
  return countryAliases[slug] ?? slug;
};

export const countryLabel = (value?: string | null): string => {
  const id = normalizeCountryId(value);
  const iso3 = countryIso3Code(value) ?? countryIso3Code(id);
  return knownCountryNames[id] ?? (iso3 ? isoCountries.getName(iso3, 'pt') : undefined) ?? titleCase(id);
};

export const countryShortName = (value?: string | null): string => {
  const id = normalizeCountryId(value);
  return knownCountryShortNames[id] ?? countryLabel(id);
};

export const countryAccent = (value?: string | null): string => {
  const id = normalizeCountryId(value);
  return id === 'all' ? '#0f172a' : accentPalette[paletteIndex(id)];
};

export const countryNames = new Proxy(knownCountryNames, {
  get(target, prop) {
    if (typeof prop !== 'string') {
      return undefined;
    }
    return target[prop] ?? countryLabel(prop);
  },
}) as Record<string, string>;

export const buildCountryOptions = (
  values: Array<string | null | undefined> = [],
  fallbackValues: Array<string | null | undefined> = [],
  config: { includeInternational?: boolean } = {},
): CountryMeta[] => {
  const seen = new Set<string>();
  const countryOptions: CountryMeta[] = [
    { id: 'all', name: 'Todos', shortName: 'Todos', accent: '#0f172a' },
  ];

  [...fallbackValues, ...values].forEach((value) => {
    const id = normalizeCountryId(value);
    if (!id || id === 'all' || (!config.includeInternational && id === 'international') || seen.has(id)) {
      return;
    }
    seen.add(id);
    countryOptions.push({
      id,
      name: countryLabel(id),
      shortName: countryShortName(id),
      accent: countryAccent(id),
    });
  });

  return countryOptions;
};

export const countries: CountryMeta[] = buildCountryOptions(['italy', 'switzerland', 'france']);
