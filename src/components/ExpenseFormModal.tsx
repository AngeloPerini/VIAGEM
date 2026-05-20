import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { buildCountryOptions, normalizeCountryId } from '../data/countries';
import {
  currencyNames,
  currencySymbols,
  getRateForCurrency,
  TRAVEL_CURRENCIES,
} from '../services/currencyService';
import type { CategoryMeta, CountryId, CountryMeta, ExchangeRateMap, Expense, LinkItem, TravelCurrencyCode } from '../types';
import { hasInvalidLinks, normalizeLinks } from '../utils/links';
import {
  convertCurrencyRangeToReal,
  formatMoney,
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
  onClose: () => void;
  onSave: (expense: Expense) => void;
};

const getDefaultCountry = (countryOptions: CountryMeta[]) =>
  countryOptions.find((country) => country.id !== 'all')?.id ?? 'international';

const getDefaultCurrencyForCountry = (country: CountryId): TravelCurrencyCode => {
  const normalized = normalizeCountryId(country);

  if (['england', 'scotland', 'united_kingdom', 'great_britain'].includes(normalized)) return 'GBP';
  if (normalized === 'switzerland') return 'CHF';
  if (normalized === 'japan') return 'JPY';
  if (normalized === 'united_states') return 'USD';
  if (normalized === 'brazil') return 'BRL';
  return 'EUR';
};

const createBlankExpense = (category: string, country: CountryId): Expense => ({
  id: crypto.randomUUID(),
  category,
  country,
  title: '',
  detail: '',
  currency: getDefaultCurrencyForCountry(country),
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

  useEffect(() => {
    const defaultCountry = getDefaultCountry(selectableCountryOptions);
    const source = expense ?? createBlankExpense('lodging', defaultCountry);
    setCategory(source.category);
    setCountry(normalizeCountryId(source.country ?? defaultCountry));
    setTitle(source.title);
    setDetail(source.detail ?? '');
    setCurrency(source.currency ?? getDefaultCurrencyForCountry(source.country ?? defaultCountry));
    setAmount(stringifyAmountForInput(source.amount ?? source.euro.min ?? source.real.min));
    setLinks(source.links ?? []);
  }, [selectableCountryOptions, expense, isOpen]);

  const numericAmount = parseAmountInput(amount);
  const amountRange = { min: numericAmount, max: numericAmount };
  const convertedReal = convertCurrencyRangeToReal(amountRange, currency, exchangeRates, expense?.real);
  const eurRate = getRateForCurrency('EUR', exchangeRates);
  const currentRate = getRateForCurrency(currency, exchangeRates);
  const euroRange = currency === 'EUR'
    ? amountRange
    : eurRate && currentRate
      ? {
          min: convertedReal.min / eurRate,
          max: convertedReal.max / eurRate,
        }
      : expense?.euro ?? { min: 0, max: 0 };

  const handleCountryChange = (nextCountry: CountryId) => {
    setCountry(nextCountry);
    if (!expense) setCurrency(getDefaultCurrencyForCountry(nextCountry));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (hasInvalidLinks(links)) return;

    onSave({
      id: expense?.id ?? crypto.randomUUID(),
      category,
      country,
      title: title.trim(),
      detail: detail.trim(),
      currency,
      amount: numericAmount,
      euro: euroRange,
      real: convertedReal,
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
            className="w-full max-w-2xl rounded-[2rem] bg-white p-5 shadow-2xl shadow-slate-950/30 md:p-7"
            initial={{ opacity: 0, y: 40, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-400">
                  {expense ? 'Editar gasto' : 'Novo gasto'}
                </p>
                <h2 className="mt-1 text-2xl font-black text-slate-950">
                  Atualize o roteiro financeiro
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar"
                className="rounded-2xl border border-slate-200 p-3 text-slate-500 transition hover:bg-slate-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label>
                <span className="mb-2 block text-sm font-bold text-slate-600">Categoria</span>
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  required
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 font-semibold text-slate-900 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                >
                  {categories.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span className="mb-2 block text-sm font-bold text-slate-600">Pais</span>
                <select
                  value={country}
                  onChange={(event) => handleCountryChange(event.target.value as CountryId)}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 font-semibold text-slate-900 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
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
                <span className="mb-2 block text-sm font-bold text-slate-600">Nome</span>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  required
                  placeholder="Ex: Roma"
                  className="h-12 w-full rounded-2xl border border-slate-200 px-4 font-semibold text-slate-900 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                />
              </label>

              <label>
                <span className="mb-2 block text-sm font-bold text-slate-600">Detalhe</span>
                <input
                  value={detail}
                  onChange={(event) => setDetail(event.target.value)}
                  placeholder="Ex: 16 -> 17"
                  className="h-12 w-full rounded-2xl border border-slate-200 px-4 font-semibold text-slate-900 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                />
              </label>

              <label>
                <span className="mb-2 block text-sm font-bold text-slate-600">Moeda</span>
                <select
                  value={currency}
                  onChange={(event) => setCurrency(event.target.value as TravelCurrencyCode)}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 font-semibold text-slate-900 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                >
                  {TRAVEL_CURRENCIES.map((item) => (
                    <option key={item} value={item}>
                      {item} - {currencyNames[item]}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span className="mb-2 block text-sm font-bold text-slate-600">Valor</span>
                <input
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  required
                  placeholder="100"
                  className="h-12 w-full rounded-2xl border border-slate-200 px-4 font-semibold text-slate-900 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                />
              </label>

              <div className="rounded-2xl bg-slate-50 px-4 py-3 md:col-span-2">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Conversão estimada</p>
                <p className="mt-2 text-lg font-black text-slate-950">
                  {currencySymbols[currency]} {amount || '0'} ≈ {formatMoney(convertedReal.min, 'BRL')}
                </p>
                {currency !== 'BRL' && !currentRate ? (
                  <p className="mt-1 text-sm font-bold text-amber-700">
                    Cotação indisponível. O valor em BRL será mantido pelo último dado salvo, se houver.
                  </p>
                ) : null}
              </div>
              <LinksEditor links={links} onChange={setLinks} />
            </div>

            <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                className="h-12 rounded-2xl border border-slate-200 px-5 font-bold text-slate-600 transition hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="h-12 rounded-2xl bg-slate-950 px-6 font-bold text-white shadow-xl shadow-slate-900/20 transition hover:bg-teal-700"
              >
                Salvar gasto
              </button>
            </div>
          </motion.form>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
