import { motion } from 'framer-motion';
import { Plane, Plus } from 'lucide-react';

type HeaderProps = {
  onAdd: () => void;
};

export function Header({ onAdd }: HeaderProps) {
  return (
    <motion.header
      className="flex flex-col gap-6 rounded-[2rem] border border-white/60 bg-white/75 p-6 shadow-2xl shadow-slate-900/10 backdrop-blur-xl md:flex-row md:items-center md:justify-between md:p-8"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="max-w-3xl">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-sm font-semibold text-teal-800">
          <Plane className="h-4 w-4" />
          Europa Budget
        </div>
        <h1 className="text-4xl font-black tracking-tight text-slate-950 md:text-6xl">
          Controle premium dos gastos da viagem.
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600 md:text-lg">
          Hospedagens, transportes e passeios com valores em euro e real,
          intervalos de custo e sincronizacao por grupo no Supabase.
        </p>
      </div>

      <motion.button
        type="button"
        onClick={onAdd}
        className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-6 font-bold text-white shadow-xl shadow-slate-900/25 transition hover:bg-teal-700 focus:outline-none focus:ring-4 focus:ring-teal-200"
        whileHover={{ scale: 1.03, y: -2 }}
        whileTap={{ scale: 0.98 }}
      >
        <Plus className="h-5 w-5" />
        Novo gasto
      </motion.button>
    </motion.header>
  );
}
