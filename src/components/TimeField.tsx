import { Clock } from 'lucide-react';
import { useState } from 'react';
import { TimePickerModal } from './TimePickerModal';

type TimeFieldProps = {
  value: string;
  onChange: (value: string) => void;
  label: string;
};

export function TimeField({ value, onChange, label }: TimeFieldProps) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  return (
    <label>
      <span className="mb-2 block text-sm font-bold text-slate-600 dark:text-slate-300">{label}</span>
      <div className="flex h-12 overflow-hidden rounded-2xl border border-slate-200 bg-white focus-within:border-teal-400 focus-within:ring-4 focus-within:ring-teal-100 dark:border-slate-700 dark:bg-slate-800 dark:focus-within:border-emerald-400 dark:focus-within:ring-emerald-400/20">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onFocus={() => setIsPickerOpen(true)}
          placeholder="09:00 ou texto livre"
          className="min-w-0 flex-1 bg-transparent px-4 font-semibold text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-50 dark:placeholder:text-slate-500"
        />
        <button
          type="button"
          onClick={() => setIsPickerOpen(true)}
          className="flex w-12 items-center justify-center border-l border-slate-200 text-slate-500 transition hover:bg-teal-50 hover:text-teal-700 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-emerald-300"
          aria-label="Abrir seletor de horario"
        >
          <Clock className="h-5 w-5" />
        </button>
      </div>
      <TimePickerModal
        isOpen={isPickerOpen}
        value={value}
        onClose={() => setIsPickerOpen(false)}
        onConfirm={(time) => {
          onChange(time);
          setIsPickerOpen(false);
        }}
      />
    </label>
  );
}
