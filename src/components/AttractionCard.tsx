import { motion } from 'framer-motion';
import { Camera, CheckCircle2, Clock, ImagePlus, MapPin, Pencil, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import type { ChangeEvent, MouseEvent } from 'react';
import { countryNames } from '../data/countries';
import type { Attraction, AttractionState } from '../types';
import { LinksMenu } from './LinksMenu';

type AttractionCardProps = {
  attraction: Attraction;
  state?: AttractionState;
  isUploading?: boolean;
  onOpen: (attraction: Attraction) => void;
  onEdit: (attraction: Attraction) => void;
  onDelete: (id: string) => void;
  onToggleVisited: (id: string, nextState: AttractionState) => void;
  onPhotoUpload: (id: string, file: File) => Promise<void>;
};

const fallbackThemes = [
  'from-[#0f766e] via-[#7dd3fc] to-[#f8fafc]',
  'from-[#111827] via-[#0f766e] to-[#dbeafe]',
  'from-[#0c4a6e] via-[#38bdf8] to-[#fef3c7]',
  'from-[#312e81] via-[#14b8a6] to-[#ecfeff]',
  'from-[#064e3b] via-[#0ea5e9] to-[#f8fafc]',
];

const themeIndex = (id: string) =>
  [...id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % fallbackThemes.length;

export function AttractionCard({
  attraction,
  state,
  isUploading = false,
  onOpen,
  onEdit,
  onDelete,
  onToggleVisited,
  onPhotoUpload,
}: AttractionCardProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const currentState = state ?? { visited: false };
  const visited = currentState.visited ?? false;
  const hasPhoto = Boolean(currentState.photo);
  const country = countryNames[attraction.country];

  const stop = (event: MouseEvent) => {
    event.stopPropagation();
  };

  const handlePhotoChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setWarning(null);
    try {
      await onPhotoUpload(attraction.id, file);
    } catch (error) {
      setWarning(error instanceof Error ? error.message : 'Nao foi possivel anexar a foto.');
    } finally {
      event.target.value = '';
    }
  };

  return (
    <motion.article
      layout
      className={`group overflow-hidden rounded-2xl border bg-white text-left shadow-[0_14px_34px_rgba(15,23,42,0.06)] transition hover:-translate-y-1 hover:shadow-[0_20px_42px_rgba(15,23,42,0.1)] ${
        visited ? 'border-[#b7efe4]' : 'border-[#dfe5ee]'
      }`}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      whileTap={{ scale: 0.98 }}
    >
      <button
        type="button"
        onClick={() => onOpen(attraction)}
        className="relative block aspect-[16/10] w-full overflow-hidden bg-slate-100 text-left"
      >
        {currentState.photo ? (
          <img
            src={currentState.photo}
            alt={`Foto de ${attraction.name}`}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div className={`relative flex h-full w-full items-center justify-center bg-gradient-to-br ${fallbackThemes[themeIndex(attraction.id)]}`}>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(255,255,255,0.55),transparent_24%),radial-gradient(circle_at_75%_80%,rgba(15,23,42,0.2),transparent_28%)]" />
            <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/35 to-transparent" />
            <Camera className="relative h-10 w-10 text-white/80" />
          </div>
        )}
        <span
          className={`absolute left-4 top-4 inline-flex items-center gap-1 rounded-full px-3 py-1 text-[0.68rem] font-black uppercase tracking-[0.06em] shadow-lg ${
            visited ? 'bg-[#007c68] text-white' : 'bg-[#111827] text-white'
          }`}
        >
          {visited ? <CheckCircle2 className="h-4 w-4" /> : null}
          {visited ? 'Visitado' : 'Pendente'}
        </span>
        {hasPhoto ? (
          <span className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full bg-white/90 px-3 py-1 text-[0.68rem] font-black uppercase tracking-[0.06em] text-[#007c68] shadow-lg">
            <Camera className="h-3.5 w-3.5" />
            Foto
          </span>
        ) : null}
      </button>

      <div className="flex min-h-[17rem] flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <button type="button" onClick={() => onOpen(attraction)} className="min-w-0 flex-1 text-left">
            <h3 className="truncate text-xl font-black leading-tight text-[#0b1326]">{attraction.name}</h3>
          </button>
          {attraction.time ? (
            <span className="shrink-0 text-base font-semibold text-[#45464d]">{attraction.time}</span>
          ) : null}
        </div>

        <p className="mt-2 flex min-w-0 items-center gap-2 text-sm font-semibold text-[#667085]">
          <MapPin className="h-4 w-4" />
          <span className="truncate">{attraction.city}, {country}</span>
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-[0.08em] text-[#8c97a8]">
          {attraction.day ? <span>{attraction.day}</span> : null}
          {attraction.time ? (
            <span className="inline-flex items-center gap-1">
            <Clock className="h-4 w-4" />
            {attraction.time}
            </span>
          ) : null}
        </div>

        <p className="mt-4 line-clamp-3 text-sm leading-6 text-[#45464d]">
          {attraction.description}
        </p>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handlePhotoChange}
        />

        {warning ? (
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
            {warning}
          </p>
        ) : null}

        <div className="mt-auto pt-5">
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
            <button
              type="button"
              onClick={(event) => {
                stop(event);
                inputRef.current?.click();
              }}
              disabled={isUploading}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#dfe5ee] bg-white px-3 text-sm font-black text-[#007c68] transition hover:border-[#007c68] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <ImagePlus className="h-4 w-4" />
              {hasPhoto ? 'Trocar foto' : 'Anexar'}
            </button>
            <button
              type="button"
              onClick={(event) => {
                stop(event);
                onToggleVisited(attraction.id, {
                  ...currentState,
                  visited: !visited,
                  updatedAt: Date.now(),
                });
              }}
              className={`inline-flex h-11 items-center justify-center rounded-xl px-3 text-sm font-black transition ${
                visited
                  ? 'bg-[#eef4ff] text-[#45464d] hover:bg-[#e1e9f8]'
                  : 'bg-[#007c68] text-white hover:bg-[#005d50]'
              }`}
            >
              {visited ? 'Desmarcar' : 'Visitar'}
            </button>
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
          <LinksMenu links={attraction.links} />
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={(event) => {
                  stop(event);
                  onEdit(attraction);
                }}
                aria-label={`Editar ${attraction.name}`}
                className="grid h-9 w-9 place-items-center rounded-xl border border-[#dfe5ee] text-[#667085] transition hover:border-[#007c68] hover:text-[#007c68]"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={(event) => {
                  stop(event);
                  onDelete(attraction.id);
                }}
                aria-label={`Excluir ${attraction.name}`}
                className="grid h-9 w-9 place-items-center rounded-xl border border-[#dfe5ee] text-[#667085] transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </motion.article>
  );
}
