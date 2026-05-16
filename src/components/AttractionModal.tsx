import { AnimatePresence, motion } from 'framer-motion';
import { Camera, CheckCircle2, Edit3, ImagePlus, Trash2, X } from 'lucide-react';
import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { countryNames } from '../data/countries';
import type { Attraction, AttractionState } from '../types';
import { compressImageToBase64 } from '../utils/imageCompression';

type AttractionModalProps = {
  attraction: Attraction | null;
  state?: AttractionState;
  onClose: () => void;
  onChange: (id: string, nextState: AttractionState) => void;
  onEdit: (attraction: Attraction) => void;
  onDelete: (id: string) => void;
};

export function AttractionModal({ attraction, state, onClose, onChange, onEdit, onDelete }: AttractionModalProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const currentState = state ?? { visited: false };

  const updateState = (patch: Partial<AttractionState>) => {
    if (!attraction) return;
    onChange(attraction.id, {
      ...currentState,
      ...patch,
      updatedAt: Date.now(),
    });
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setWarning(null);
    setIsProcessing(true);

    try {
      const photo = await compressImageToBase64(file);
      updateState({ photo });
    } catch (error) {
      setWarning(error instanceof Error ? error.message : 'Nao foi possivel salvar a imagem.');
    } finally {
      setIsProcessing(false);
      event.target.value = '';
    }
  };

  return (
    <AnimatePresence>
      {attraction ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-3 backdrop-blur-sm md:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={onClose}
        >
          <motion.section
            className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[2rem] bg-white p-5 shadow-2xl shadow-slate-950/30 md:p-7"
            initial={{ opacity: 0, y: 42, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-400">
                  Ponto turistico
                </p>
                <h2 className="mt-1 text-3xl font-black text-slate-950">
                  {attraction.name}
                </h2>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onEdit(attraction)}
                  aria-label={`Editar ${attraction.name}`}
                  className="rounded-2xl border border-slate-200 p-3 text-slate-500 transition hover:bg-teal-50 hover:text-teal-700"
                >
                  <Edit3 className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(attraction.id)}
                  aria-label={`Excluir ${attraction.name}`}
                  className="rounded-2xl border border-slate-200 p-3 text-slate-500 transition hover:bg-rose-50 hover:text-rose-700"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Fechar"
                  className="rounded-2xl border border-slate-200 p-3 text-slate-500 transition hover:bg-slate-50"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-[1fr_0.9fr]">
              <div className="overflow-hidden rounded-3xl bg-slate-100">
                {currentState.photo ? (
                  <img
                    src={currentState.photo}
                    alt={`Foto de ${attraction.name}`}
                    className="aspect-[4/3] h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex aspect-[4/3] items-center justify-center bg-gradient-to-br from-teal-50 via-sky-50 to-rose-50">
                    <Camera className="h-14 w-14 text-slate-300" />
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
                    {countryNames[attraction.country]}
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
                    {attraction.city}
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
                    {attraction.day}
                    {attraction.time ? ` - ${attraction.time}` : ''}
                  </span>
                </div>

                <p className="leading-7 text-slate-600">{attraction.description}</p>

                <button
                  type="button"
                  onClick={() => updateState({ visited: !currentState.visited })}
                  className={`inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl px-5 font-bold transition ${
                    currentState.visited
                      ? 'bg-teal-600 text-white shadow-xl shadow-teal-700/20'
                      : 'bg-slate-950 text-white shadow-xl shadow-slate-900/20 hover:bg-teal-700'
                  }`}
                >
                  <motion.span
                    animate={currentState.visited ? { scale: [1, 1.25, 1] } : { scale: 1 }}
                    transition={{ duration: 0.35 }}
                  >
                    <CheckCircle2 className="h-5 w-5" />
                  </motion.span>
                  {currentState.visited ? 'Visita confirmada' : 'Marcar visita confirmada'}
                </button>

                <input
                  ref={inputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileChange}
                />

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    disabled={isProcessing}
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <ImagePlus className="h-5 w-5" />
                    {currentState.photo ? 'Trocar foto' : 'Anexar foto'}
                  </button>
                  <button
                    type="button"
                    onClick={() => updateState({ photo: undefined })}
                    disabled={!currentState.photo}
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 font-bold text-slate-700 transition hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <Trash2 className="h-5 w-5" />
                    Remover foto
                  </button>
                </div>

                {warning ? (
                  <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                    {warning}
                  </p>
                ) : null}

                {isProcessing ? (
                  <p className="text-sm font-semibold text-slate-500">
                    Preparando imagem para salvar...
                  </p>
                ) : null}
              </div>
            </div>
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
