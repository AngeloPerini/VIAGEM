import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

type HeaderProps = {
  onAdd: () => void;
};

export function Header({ onAdd }: HeaderProps) {
  const { t } = useLanguage();

  return (
    <motion.header
      className="flex flex-col gap-6 rounded-[2rem] border border-white/60 bg-white/75 p-6 shadow-2xl shadow-slate-900/10 backdrop-blur-xl dark:border-slate-700 dark:bg-slate-900/85 dark:shadow-black/30 md:flex-row md:items-center md:justify-between md:p-8"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="max-w-3xl">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-sm font-semibold text-teal-800 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200">
          <img src="/logo.png" alt="TripFlow" className="h-5 w-5 rounded-md object-contain" />
          {t('app.brand')}
        </div>
        <h1 className="text-4xl font-black tracking-tight text-slate-950 dark:text-slate-50 md:text-6xl">
          {t('dashboard.headerTitle')}
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600 dark:text-slate-300 md:text-lg">
          {t('dashboard.headerDescription')}
        </p>
      </div>

      <motion.button
        type="button"
        onClick={onAdd}
        className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-6 font-bold text-white shadow-xl shadow-slate-900/25 transition hover:bg-teal-700 focus:outline-none focus:ring-4 focus:ring-teal-200 dark:bg-emerald-400 dark:text-emerald-950 dark:hover:bg-emerald-300 dark:focus:ring-emerald-400/20"
        whileHover={{ scale: 1.03, y: -2 }}
        whileTap={{ scale: 0.98 }}
      >
        <Plus className="h-5 w-5" />
        {t('dashboard.newExpense')}
      </motion.button>
    </motion.header>
  );
}
