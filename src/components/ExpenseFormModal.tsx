import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { buildCountryOptions, normalizeCountryId } from '../data/countries';
import {
  currencyNames,
  getRateForCurrency,
  TRAVEL_CURRENCIES,
} from '../services/currencyService';
import type { CategoryMeta, CountryId, CountryMeta, ExchangeRateMap, Expense, LinkItem, TravelCurrencyCode } from '../types';
import { hasInvalidLinks, normalizeLinks } from '../utils/links';
import {
  convertCurrencyRange,
  formatMoney,
  getConversionTargetCurrency,
  isValidAmountInput,
  parseAmountInput,
  stringifyAmountForInput,
} from '../utils/money';
import { LinksEditor } from './LinksEditor';

type ExpenseFormModalProps = {
  categories: CategoryMeta[];
  expense?: Expense | null;
  isOpen: boolean;
  countryOptions: CountryMeta[];
  exchangeRates: ExchangeRateMap;
  defaultCurrency?: TravelCurrencyCode;
  errorMessage?: string | null;
  isSaving?: boolean;
  onClose: () => void;
  onSave: (expense: Expense) => void;
};

const getDefaultCountry = (countryOptions: CountryMeta[]) =>
  countryOptions.find((country) => country.id !== 'all')?.id ?? 'international';

const getDefaultCategory = (categories: CategoryMeta[]) =>
  categories[0]?.id ?? 'Outros';

const getDefaultCurrencyForCountry = (country: CountryId): TravelCurrencyCode => {
  const normalized = normalizeCountryId(country);

  if (['england', 'scotland', 'united_kingdom', 'great_britain'].includes(normalized)) return 'GBP';
  if (normalized === 'switzerland') return 'CHF';
  if (normalized === 'japan') return 'JPY';
  if (normalized === 'united_states') return 'USD';
  if (normalized === 'brazil') return 'BRL';
  return 'EUR';
};

const createBlankExpense = (
  category: string,
  country: CountryId,
  defaultCurrency?: TravelCurrencyCode,
): Expense => ({
  id: crypto.randomUUID(),
  category,
  country,
  title: '',
  detail: '',
  currency: defaultCurrency ?? getDefaultCurrencyForCountry(country),
  amount: 0,
  euro: { min: 0, max: 0 },
  real: { min: 0, max: 0 },
  links: [],
});

export function ExpenseFormModal({
  categories,
  expense,
  isOpen,
  countryOptions,
  exchangeRates,
  defaultCurrency,
  errorMessage,
  isSaving = false,
  onClose,
  onSave,
}: ExpenseFormModalProps) {
  const selectableCountryOptions = useMemo(
    () =>
      countryOptions.some((item) => item.id !== 'all')
        ? countryOptions
        : buildCountryOptions(['international'], [], { includeInternational: true }),
    [countryOptions],
  );
  const [category, setCategory] = useState('lodging');
  const [country, setCountry] = useState<CountryId>(() => getDefaultCountry(selectableCountryOptions));
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [currency, setCurrency] = useState<TravelCurrencyCode>('EUR');
  const [amount, setAmount] = useState('');
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    const defaultCountry = getDefaultCountry(selectableCountryOptions);
    const defaultCategory = getDefaultCategory(categories);
    const source = expense ?? createBlankExpense(defaultCategory, defaultCountry, defaultCurrency);
    setCategory(source.category);
    setCountry(normalizeCountryId(source.country ?? defaultCountry));
    setTitle(source.title);
    setDetail(source.detail ?? '');
    setCurrency(source.currency ?? defaultCurrency ?? getDefaultCurrencyForCountry(source.country ?? defaultCountry));
    setAmount(stringifyAmountForInput(source.amount ?? source.euro.min ?? source.real.min));
    setLinks(source.links ?? []);
    setValidationError(null);
  }, [categories, defaultCurrency, selectableCountryOptions, expense, isOpen]);

  const isAmountValid = isValidAmountInput(amount);
  const numericAmount = isAmountValid ? parseAmountInput(amount) : 0;
  const amountRange = { min: numericAmount, max: numericAmount };
  const realRange = convertCurrencyRange(amountRange, currency, 'BRL', exchangeRates, expense?.real);
  const euroRange = convertCurrencyRange(amountRange, currency, 'EUR', exchangeRates, expense?.euro);
  const conversionTargetCurrency = getConversionTargetCurrency(currency);
  const convertedEstimate = conversionTargetCurrency === 'BRL' ? realRange : euroRange;
  const hasRateForCurrency = (targetCurrency: TravelCurrencyCode) =>
    Boolean(getRateForCurrency(targetCurrency, exchangeRates));
  const isConversionRateMissing =
    currency !== conversionTargetCurrency &&
    (!hasRateForCurrency(currency) || !hasRateForCurrency(conversionTargetCurrency));
  const displayedError = validationError ?? errorMessage;

  const handleCountryChange = (nextCountry: CountryId) => {
    setCountry(nextCountry);
    if (!expense) setCurrency(defaultCurrency ?? getDefaultCurrencyForCountry(nextCountry));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setValidationError(null);

    if (!category) {
      setValidationError('Selecione uma categoria para o gasto.');
      return;
    }

    if (!country) {
      setValidationError('Selecione um pais para o gasto.');
      return;
    }

    if (!title.trim()) {
      setValidationError('Informe um nome para o gasto.');
      return;
    }

    if (!currency) {
      setValidationError('Selecione uma moeda para o gasto.');
      return;
    }

    if (!isAmountValid) {
      setValidationError('Informe um valor valido, maior ou igual a zero.');
      return;
    }

    if (hasInvalidLinks(links)) {
      setValidationError('Revise os links uteis antes de salvar.');
      return;
    }

    onSave({
      id: expense?.id ?? crypto.randomUUID(),
      category,
      country,
      title: title.trim(),
      detail: detail.trim(),
      currency,
      amount: numericAmount,
      euro: euroRange,
      real: realRange,
      links: normalizeLinks(links),
    });
  };

  return (
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-3 backdrop-blur-sm md:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={onClose}
        >
          <motion.form
            onSubmit={handleSubmit}
            className="w-full max-w-2xl rounded-[2rem] bg-white p-5 shadow-2xl shadow-slate-950/30 dark:border dark:border-slate-700 dark:bg-slate-900 md:p-7"
            initial={{ opacity: 0, y: 40, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                  {expense ? 'Editar gasto' : 'Novo gasto'}
                </p>
                <h2 className="mt-1 text-2xl font-black text-slate-950 dark:text-slate-50">
                  Atualize o roteiro financeiro
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar"
                className="rounded-2xl border border-slate-200 p-3 text-slate-500 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {displayedError ? (
              <p className="mb-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700 dark:bg-rose-500/10 dark:text-rose-200">
                {displayedError}
              </p>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <label>
                <span className="mb-2 block text-sm font-bold text-slate-600 dark:text-slate-300">Categoria</span>
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  required
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 font-semibold text-slate-900 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/20"
                >
                  {categories.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span className="mb-2 block text-sm font-bold text-slate-600 dark:text-slate-300">Pais</span>
                <select
                  value={country}
                  onChange={(event) => handleCountryChange(event.target.value as CountryId)}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 font-semibold text-slate-900 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/20"
                >
                  {selectableCountryOptions
                    .filter((item) => item.id !== 'all')
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </select>
              </label>

              <label>
                <span className="mb-2 block text-sm font-bold text-slate-600 dark:text-slate-300">Nome</span>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  required
                  placeholder="Ex: Roma"
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-400 focus:ring-4 focus:ring-teal-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/20"
                />
              </label>

              <label>
                <span className="mb-2 block text-sm font-bold text-slate-600 dark:text-slate-300">Detalhe</span>
                <input
                  value={detail}
                  onChange={(event) => setDetail(event.target.value)}
                  placeholder="Ex: 16 -> 17"
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-400 focus:ring-4 focus:ring-teal-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/20"
                />
              </label>

              <label>
                <span className="mb-2 block text-sm font-bold text-slate-600 dark:text-slate-300">Moeda</span>
                <select
                  value={currency}
                  onChange={(event) => setCurrency(event.target.value as TravelCurrencyCode)}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 font-semibold text-slate-900 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/20"
                >
                  {TRAVEL_CURRENCIES.map((item) => (
                    <option key={item} value={item}>
                      {item} - {currencyNames[item]}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span className="mb-2 block text-sm font-bold text-slate-600 dark:text-slate-300">Valor</span>
                <input
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  required
                  placeholder="100"
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-400 focus:ring-4 focus:ring-teal-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/20"
                />
              </label>

              <div className="rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-800 md:col-span-2">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">Conversão estimada</p>
                <p className="mt-2 text-lg font-black text-slate-950 dark:text-slate-50">
                  {formatMoney(numericAmount, currency)} ≈ {formatMoney(convertedEstimate.min, conversionTargetCurrency)}
                </p>
                {isConversionRateMissing ? (
                  <p className="mt-1 text-sm font-bold text-amber-700 dark:text-amber-200">
                    Cotação indisponível. A conversão para {conversionTargetCurrency} será mantida pelo último dado salvo, se houver.
                  </p>
                ) : null}
              </div>
              <LinksEditor links={links} onChange={setLinks} />
            </div>

            <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                className="h-12 rounded-2xl border border-slate-200 px-5 font-bold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="h-12 rounded-2xl bg-slate-950 px-6 font-bold text-white shadow-xl shadow-slate-900/20 transition hover:bg-teal-700 dark:bg-emerald-400 dark:text-emerald-950 dark:hover:bg-emerald-300"
              >
                {isSaving ? 'Salvando...' : 'Salvar gasto'}
              </button>
            </div>
          </motion.form>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
