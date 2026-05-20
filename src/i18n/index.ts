import { de } from './de';
import { en } from './en';
import { es } from './es';
import { fr } from './fr';
import { it } from './it';
import { ptBR, type TranslationMap } from './pt-BR';

export type LanguageCode = 'pt-BR' | 'en' | 'es' | 'fr' | 'it' | 'de';
export type TranslationKey = keyof TranslationMap;

export const translations: Record<LanguageCode, TranslationMap> = {
  'pt-BR': ptBR,
  en,
  es,
  fr,
  it,
  de,
};

export const languageOptions: Array<{ code: LanguageCode; label: string; detectedLabel: string }> = [
  { code: 'pt-BR', label: 'Português', detectedLabel: 'Português' },
  { code: 'en', label: 'English', detectedLabel: 'English' },
  { code: 'es', label: 'Español', detectedLabel: 'Español' },
  { code: 'fr', label: 'Français', detectedLabel: 'Français' },
  { code: 'it', label: 'Italiano', detectedLabel: 'Italiano' },
  { code: 'de', label: 'Deutsch', detectedLabel: 'Deutsch' },
];

export const getLanguageLabel = (code: LanguageCode) =>
  languageOptions.find((option) => option.code === code)?.label ?? 'English';

export const getDetectedLanguageLabel = (code: LanguageCode) =>
  languageOptions.find((option) => option.code === code)?.detectedLabel ?? 'English';

export const detectPreferredLanguage = (languages: readonly string[] = []): LanguageCode => {
  const candidates = languages.length ? languages : ['pt-BR'];
  const normalized = candidates.map((language) => language.toLowerCase());

  if (normalized.some((language) => language.startsWith('pt-br') || language === 'pt')) return 'pt-BR';
  if (normalized.some((language) => language.startsWith('en'))) return 'en';
  if (normalized.some((language) => language.startsWith('es'))) return 'es';
  if (normalized.some((language) => language.startsWith('fr'))) return 'fr';
  if (normalized.some((language) => language.startsWith('it'))) return 'it';
  if (normalized.some((language) => language.startsWith('de'))) return 'de';

  return 'en';
};

export const interpolate = (value: string, params?: Record<string, string | number>) => {
  if (!params) return value;
  return Object.entries(params).reduce(
    (text, [key, replacement]) => text.replaceAll(`{${key}}`, String(replacement)),
    value,
  );
};
