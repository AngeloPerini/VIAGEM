import { motion } from 'framer-motion';
import { Camera, CheckCircle2, Clock, MapPin } from 'lucide-react';
import { countryNames } from '../data/countries';
import type { Attraction, AttractionState } from '../types';
import { LinksMenu } from './LinksMenu';

type AttractionCardProps = {
  attraction: Attraction;
  state?: AttractionState;
  onClick: (attraction: Attraction) => void;
};

export function AttractionCard({ attraction, state, onClick }: AttractionCardProps) {
  const visited = state?.visited ?? false;

  return (
    <motion.article
      role="button"
      tabIndex={0}
      layout
      onClick={() => onClick(attraction)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onClick(attraction);
      }}
      className="group overflow-hidden rounded-[1.75rem] border border-white/70 bg-white/85 text-left shadow-xl shadow-slate-900/10 backdrop-blur-xl transition hover:-translate-y-1 hover:shadow-2xl hover:shadow-slate-900/15"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      whileTap={{ scale: 0.98 }}
    >
      <div className="relative aspect-[4/3] bg-slate-100">
        {state?.photo ? (
          <img
            src={state.photo}
            alt={`Foto de ${attraction.name}`}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-teal-50 via-sky-50 to-rose-50">
            <Camera className="h-10 w-10 text-slate-300" />
          </div>
        )}
        <span
          className={`absolute left-4 top-4 inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-black shadow-lg ${
            visited ? 'bg-teal-600 text-white' : 'bg-white/90 text-slate-600'
          }`}
        >
          {visited ? <CheckCircle2 className="h-4 w-4" /> : null}
          {visited ? 'Visitado' : 'Pendente'}
        </span>
      </div>

      <div className="p-5">
        <div className="mb-3 flex flex-wrap gap-2">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
            {countryNames[attraction.country]}
          </span>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-400 ring-1 ring-slate-200">
            {attraction.day}
          </span>
        </div>
        <h3 className="text-xl font-black text-slate-950">{attraction.name}</h3>
        <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-slate-500">
          <MapPin className="h-4 w-4" />
          {attraction.city}
        </p>
        {attraction.time ? (
          <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-slate-500">
            <Clock className="h-4 w-4" />
            {attraction.time}
          </p>
        ) : null}
        <p className="mt-4 line-clamp-2 text-sm leading-6 text-slate-600">
          {attraction.description}
        </p>
        <div className="mt-4">
          <LinksMenu links={attraction.links} />
        </div>
      </div>
    </motion.article>
  );
}
