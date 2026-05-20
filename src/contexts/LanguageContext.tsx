import { createContext, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  detectPreferredLanguage,
  getDetectedLanguageLabel,
  interpolate,
  languageOptions,
  translations,
  type LanguageCode,
  type TranslationKey,
} from '../i18n';

type LanguageContextValue = {
  language: LanguageCode;
  setLanguage: (language: LanguageCode) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
};

const LANGUAGE_STORAGE_KEY = 'tripflow-language-v1';
const LANGUAGE_PROMPT_STORAGE_KEY = 'tripflow-language-prompt-v1';

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

const getStoredLanguage = (): LanguageCode | null => {
  const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return stored && stored in translations ? stored as LanguageCode : null;
};

const getBrowserLanguages = () =>
  typeof navigator === 'undefined'
    ? []
    : navigator.languages?.length
      ? navigator.languages
      : [navigator.language].filter(Boolean);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const detectedLanguage = useMemo(() => detectPreferredLanguage(getBrowserLanguages()), []);
  const [language, setLanguageState] = useState<LanguageCode>(() => getStoredLanguage() ?? 'pt-BR');
  const [showPrompt, setShowPrompt] = useState(
    () => !getStoredLanguage() && detectedLanguage !== 'pt-BR' && localStorage.getItem(LANGUAGE_PROMPT_STORAGE_KEY) !== 'dismissed',
  );

  const setLanguage = (nextLanguage: LanguageCode) => {
    setLanguageState(nextLanguage);
    localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
    localStorage.setItem(LANGUAGE_PROMPT_STORAGE_KEY, 'dismissed');
    setShowPrompt(false);
  };

  const value = useMemo<LanguageContextValue>(() => ({
    language,
    setLanguage,
    t: (key, params) => interpolate(translations[language][key] ?? translations['pt-BR'][key], params),
  }), [language]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
      {showPrompt ? (
        <div className="fixed inset-x-3 bottom-3 z-[80] mx-auto max-w-3xl rounded-[1.5rem] border border-slate-200 bg-white/95 p-4 shadow-2xl shadow-slate-950/20 backdrop-blur">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <p className="text-sm font-bold leading-6 text-slate-700">
              {interpolate(translations['pt-BR']['language.banner'], {
                language: getDetectedLanguageLabel(detectedLanguage),
              })}
            </p>
            <div className="grid gap-2 sm:grid-cols-2 md:min-w-[19rem]">
              <button
                type="button"
                onClick={() => setLanguage(detectedLanguage)}
                className="inline-flex h-10 items-center justify-center rounded-2xl bg-slate-950 px-4 text-sm font-black text-white transition hover:bg-teal-700"
              >
                {translations['pt-BR']['actions.translate']}
              </button>
              <button
                type="button"
                onClick={() => setLanguage('pt-BR')}
                className="inline-flex h-10 items-center justify-center rounded-2xl bg-slate-100 px-4 text-sm font-black text-slate-700 transition hover:bg-slate-200"
              >
                {translations['pt-BR']['actions.keepPortuguese']}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage deve ser usado dentro de LanguageProvider.');
  return context;
}

export { languageOptions };
