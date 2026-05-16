import type { CountryFilterId, CountryMeta } from '../types';

export const countries: CountryMeta[] = [
  { id: 'all', name: 'Todos', shortName: 'Todos', accent: '#0f172a' },
  { id: 'italy', name: 'Itália', shortName: 'Itália', accent: '#0f766e' },
  { id: 'switzerland', name: 'Suíça', shortName: 'Suíça', accent: '#dc2626' },
  { id: 'france', name: 'França', shortName: 'França', accent: '#2563eb' },
];

export const countryNames: Record<Exclude<CountryFilterId, 'all'>, string> = {
  italy: 'Itália',
  switzerland: 'Suíça',
  france: 'França',
  international: 'Internacional',
};
