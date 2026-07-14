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
import {
  getStayNightCount,
  getTodayDateInputValue,
  isAccommodationCategory,
  isValidDateInput,
  toDateInputValue,
} from '../utils/expenseDates';
import { LinksEditor } from './LinksEditor';

type ExpenseFormModalProps = {
  categories: CategoryMeta[];
  expense?: Expense | null;
  isOpen: boolean;
  countryOptions: CountryMeta[];
  exchangeRates: ExchangeRateMap;
  defaultCurrency?: TravelCurrencyCode;
  tripStartDate?: string;
  tripEndDate?: string;
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
  isPaid: false,
  paidAt: null,
  expenseDate: getTodayDateInputValue(),
  checkInDate: null,
  checkOutDate: null,
});

export function ExpenseFormModal({
  categories,
  expense,
  isOpen,
  countryOptions,
  exchangeRates,
  defaultCurrency,
  tripStartDate,
  tripEndDate,
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
  const [isPaid, setIsPaid] = useState(false);
  const [expenseDate, setExpenseDate] = useState(getTodayDateInputValue());
  const [checkInDate, setCheckInDate] = useState('');
  const [checkOutDate, setCheckOutDate] = useState('');
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
    setIsPaid(Boolean(source.isPaid));
    setExpenseDate(toDateInputValue(source.expenseDate) || getTodayDateInputValue());
    setCheckInDate(toDateInputValue(source.checkInDate) || (!expense && isAccommodationCategory(source.category, categories) ? toDateInputValue(tripStartDate) : ''));
    setCheckOutDate(toDateInputValue(source.checkOutDate) || (!expense && isAccommodationCategory(source.category, categories) ? toDateInputValue(tripEndDate) : ''));
    setValidationError(null);
  }, [categories, defaultCurrency, selectableCountryOptions, expense, isOpen, tripEndDate, tripStartDate]);

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
  const isAccommodation = isAccommodationCategory(category, categories);
  const nights = getStayNightCount(checkInDate, checkOutDate);
  const averageNightAmount = nights ? numericAmount / nights : null;
  const displayedError = validationError ?? errorMessage;

  const handleCategoryChange = (nextCategory: string) => {
    const wasAccommodation = isAccommodationCategory(category, categories);
    const willBeAccommodation = isAccommodationCategory(nextCategory, categories);
    setCategory(nextCategory);

    if (!wasAccommodation && willBeAccommodation) {
      if (!checkInDate) setCheckInDate(toDateInputValue(tripStartDate));
      if (!checkOutDate) setCheckOutDate(toDateInputValue(tripEndDate));
    }
  };

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

    const normalizedExpenseDate = toDateInputValue(expenseDate) || getTodayDateInputValue();
    if (!isValidDateInput(normalizedExpenseDate)) {
      setValidationError('Informe uma data valida para o gasto.');
      return;
    }

    const normalizedCheckInDate = toDateInputValue(checkInDate);
    const normalizedCheckOutDate = toDateInputValue(checkOutDate);
    if (isAccommodation) {
      if (!normalizedCheckInDate || !normalizedCheckOutDate) {
        setValidationError('Informe a data de entrada e saida da hospedagem.');
        return;
      }

      if (!getStayNightCount(normalizedCheckInDate, normalizedCheckOutDate)) {
        setValidationError('A data de saida nao pode ser anterior a data de entrada.');
        return;
      }
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
      isPaid,
      paidAt: isPaid ? expense?.paidAt ?? null : null,
      expenseDate: normalizedExpenseDate,
      checkInDate: normalizedCheckInDate || expense?.checkInDate || null,
      checkOutDate: normalizedCheckOutDate || expense?.checkOutDate || null,
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
            className="max-h-[calc(100svh-1.5rem)] w-full max-w-2xl overflow-y-auto rounded-[2rem] bg-white p-5 shadow-2xl shadow-slate-950/30 dark:border dark:border-slate-700 dark:bg-slate-900 md:p-7"
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
                  onChange={(event) => handleCategoryChange(event.target.value)}
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
                <span className="mb-2 block text-sm font-bold text-slate-600 dark:text-slate-300">Data do gasto</span>
                <input
                  type="date"
                  value={expenseDate}
                  onChange={(event) => setExpenseDate(event.target.value)}
                  onInput={(event) => setExpenseDate(event.currentTarget.value)}
                  required
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 font-semibold text-slate-900 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/20"
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

              {isAccommodation ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/70 md:col-span-2">
                  <div className="grid gap-4 md:grid-cols-2">
                    <label>
                      <span className="mb-2 block text-sm font-bold text-slate-600 dark:text-slate-300">Check-in</span>
                      <input
                        type="date"
                        value={checkInDate}
                        onChange={(event) => setCheckInDate(event.target.value)}
                        onInput={(event) => setCheckInDate(event.currentTarget.value)}
                        required={isAccommodation}
                        className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 font-semibold text-slate-900 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/20"
                      />
                    </label>
                    <label>
                      <span className="mb-2 block text-sm font-bold text-slate-600 dark:text-slate-300">Check-out</span>
                      <input
                        type="date"
                        value={checkOutDate}
                        onChange={(event) => setCheckOutDate(event.target.value)}
                        onInput={(event) => setCheckOutDate(event.currentTarget.value)}
                        required={isAccommodation}
                        className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 font-semibold text-slate-900 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/20"
                      />
                    </label>
                  </div>
                  <p className="mt-3 text-sm font-black text-slate-700 dark:text-slate-200">
                    {nights
                      ? `${nights} ${nights === 1 ? 'noite' : 'noites'}${averageNightAmount !== null ? ` · media ${formatMoney(averageNightAmount, currency)} por noite` : ''}`
                      : 'Informe entrada e saida para calcular as noites.'}
                  </p>
                </div>
              ) : null}

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

              <label className="flex min-h-14 items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-800 md:col-span-2">
                <span className="min-w-0">
                  <span className="block text-sm font-black text-slate-700 dark:text-slate-200">Gasto comprado</span>
                  <span className="mt-0.5 block text-xs font-semibold text-slate-400 dark:text-slate-500">
                    Marcado como comprado entra no Progresso do Orçamento.
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={isPaid}
                  onChange={(event) => setIsPaid(event.target.checked)}
                  className="h-5 w-5 shrink-0 accent-teal-700 dark:accent-emerald-400"
                />
              </label>
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
