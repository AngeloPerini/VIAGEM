import type { CountryMeta } from '../types';

const knownCountryNames: Record<string, string> = {
  all: 'Todos',
  italy: 'Itália',
  italia: 'Itália',
  switzerland: 'Suíça',
  suica: 'Suíça',
  france: 'França',
  franca: 'França',
  england: 'Inglaterra',
  inglaterra: 'Inglaterra',
  scotland: 'Escócia',
  escocia: 'Escócia',
  united_kingdom: 'Reino Unido',
  reino_unido: 'Reino Unido',
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
  suica: 'switzerland',
  switzerland: 'switzerland',
  swiss: 'switzerland',
  franca: 'france',
  france: 'france',
  inglaterra: 'england',
  england: 'england',
  escocia: 'scotland',
  scotland: 'scotland',
  reino_unido: 'united_kingdom',
  united_kingdom: 'united_kingdom',
  uk: 'united_kingdom',
  international: 'international',
  internacional: 'international',
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

export const normalizeCountryId = (value?: string | null): string => {
  const slug = slugifyCountry(String(value ?? ''));
  if (!slug) {
    return 'international';
  }
  return countryAliases[slug] ?? slug;
};

export const countryLabel = (value?: string | null): string => {
  const id = normalizeCountryId(value);
  return knownCountryNames[id] ?? titleCase(id);
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
): CountryMeta[] => {
  const seen = new Set<string>();
  const options: CountryMeta[] = [
    { id: 'all', name: 'Todos', shortName: 'Todos', accent: '#0f172a' },
  ];

  [...fallbackValues, ...values].forEach((value) => {
    const id = normalizeCountryId(value);
    if (!id || id === 'all' || seen.has(id)) {
      return;
    }
    seen.add(id);
    options.push({
      id,
      name: countryLabel(id),
      shortName: countryShortName(id),
      accent: countryAccent(id),
    });
  });

  return options;
};

export const countries: CountryMeta[] = buildCountryOptions(['italy', 'switzerland', 'france']);
