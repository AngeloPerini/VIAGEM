import { motion } from 'framer-motion';
import { countries } from '../data/countries';
import type { CountryFilterId } from '../types';

type CountryFilterProps = {
  value: CountryFilterId;
  onChange: (country: CountryFilterId) => void;
  label?: string;
};

export function CountryFilter({ value, onChange, label = 'Filtro por pais' }: CountryFilterProps) {
  return (
    <section className="rounded-[2rem] border border-white/70 bg-white/80 p-4 shadow-xl shadow-slate-900/10 backdrop-blur-xl md:p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-400">
            {label}
          </p>
          <p className="mt-1 font-semibold text-slate-600">
            Os totais e listas acompanham o pais selecionado.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1 sm:grid-cols-4">
          {countries.map((country) => {
            const active = value === country.id;

            return (
              <button
                key={country.id}
                type="button"
                onClick={() => onChange(country.id)}
                className={`relative h-11 rounded-xl px-3 text-sm font-black transition ${
                  active ? 'text-white' : 'text-slate-500 hover:text-slate-950'
                }`}
              >
                {active ? (
                  <motion.span
                    layoutId="country-filter-pill"
                    className="absolute inset-0 rounded-xl"
                    style={{ backgroundColor: country.accent }}
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  />
                ) : null}
                <span className="relative">{country.shortName}</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
