import { AnimatePresence, motion } from 'framer-motion';
import { Clock, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

type TimePickerModalProps = {
  isOpen: boolean;
  value: string;
  onClose: () => void;
  onConfirm: (time: string) => void;
};

const parseTime = (value: string) => {
  const match = value.match(/^(\d{1,2})[:h](\d{2})$/i);
  return {
    hour: match ? Math.min(23, Number(match[1])) : 9,
    minute: match ? Math.min(59, Number(match[2])) : 0,
  };
};

const formatTime = (hour: number, minute: number) =>
  `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

export function TimePickerModal({ isOpen, value, onClose, onConfirm }: TimePickerModalProps) {
  const initial = useMemo(() => parseTime(value), [value]);
  const [hour, setHour] = useState(initial.hour);
  const [minute, setMinute] = useState(initial.minute);
  const [mode, setMode] = useState<'hour' | 'minute'>('hour');

  useEffect(() => {
    if (!isOpen) return;
    setHour(initial.hour);
    setMinute(initial.minute);
    setMode('hour');
  }, [initial.hour, initial.minute, isOpen]);

  const hourOptions = Array.from({ length: 24 }, (_, index) => index);
  const minuteOptions = Array.from({ length: 12 }, (_, index) => index * 5);

  return (
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/45 p-3 backdrop-blur-sm md:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={onClose}
        >
          <motion.section
            className="w-full max-w-md rounded-[2rem] bg-white p-5 shadow-2xl shadow-slate-950/30 dark:border dark:border-slate-700 dark:bg-slate-900"
            initial={{ opacity: 0, y: 42, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 28, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">Horario</p>
                <h2 className="text-3xl font-black text-slate-950 dark:text-slate-50">{formatTime(hour, minute)}</h2>
              </div>
              <button type="button" onClick={onClose} className="rounded-2xl border border-slate-200 p-3 text-slate-500 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800" aria-label="Fechar seletor de horario">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mb-5 grid grid-cols-2 rounded-2xl bg-slate-100 p-1 dark:bg-slate-800">
              {(['hour', 'minute'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setMode(option)}
                  className={`h-10 rounded-xl text-sm font-black transition ${
                    mode === option ? 'bg-white text-slate-950 shadow-sm dark:bg-slate-950 dark:text-slate-50' : 'text-slate-500 dark:text-slate-300'
                  }`}
                >
                  {option === 'hour' ? 'Horas' : 'Minutos'}
                </button>
              ))}
            </div>

            <div className="relative mx-auto mb-6 flex aspect-square max-h-80 max-w-80 items-center justify-center rounded-full border border-slate-200 bg-gradient-to-br from-slate-50 to-white shadow-inner dark:border-slate-700 dark:from-slate-800 dark:to-slate-900">
              <Clock className="absolute h-12 w-12 text-slate-100 dark:text-slate-700" />
              <div className="grid w-full grid-cols-4 gap-2 p-6">
                {(mode === 'hour' ? hourOptions : minuteOptions).map((option) => {
                  const active = mode === 'hour' ? option === hour : option === minute;
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => {
                        if (mode === 'hour') {
                          setHour(option);
                          setMode('minute');
                        } else {
                          setMinute(option);
                        }
                      }}
                      className={`relative z-10 h-11 rounded-2xl text-sm font-black transition ${
                        active
                          ? 'bg-teal-600 text-white shadow-lg shadow-teal-700/20 dark:bg-emerald-400 dark:text-emerald-950'
                          : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-teal-50 hover:text-teal-700 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-700 dark:hover:text-emerald-300'
                      }`}
                    >
                      {String(option).padStart(2, '0')}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={onClose} className="h-12 rounded-2xl border border-slate-200 px-5 font-bold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                Cancelar
              </button>
              <button type="button" onClick={() => onConfirm(formatTime(hour, minute))} className="h-12 rounded-2xl bg-slate-950 px-5 font-bold text-white shadow-xl shadow-slate-900/20 transition hover:bg-teal-700 dark:bg-emerald-400 dark:text-emerald-950 dark:hover:bg-emerald-300">
                Confirmar
              </button>
            </div>
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
