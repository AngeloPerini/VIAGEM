import { AnimatePresence, motion } from 'framer-motion';
import { ExternalLink, Link as LinkIcon } from 'lucide-react';
import { useState } from 'react';
import type { LinkItem } from '../types';

type LinksMenuProps = {
  links?: LinkItem[];
  align?: 'left' | 'right';
};

export function LinksMenu({ links = [], align = 'left' }: LinksMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const validLinks = links.filter((link) => link.label && link.url);

  if (validLinks.length === 0) return null;

  return (
    <div className="relative inline-flex">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setIsOpen((current) => !current);
        }}
        className="inline-flex h-9 items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 text-xs font-black text-slate-600 shadow-sm transition hover:bg-teal-50 hover:text-teal-700 dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-emerald-300"
      >
        <LinkIcon className="h-4 w-4" />
        Links
      </button>

      <AnimatePresence>
        {isOpen ? (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            className={`absolute top-11 z-20 w-64 rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl shadow-slate-900/15 dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/30 ${
              align === 'right' ? 'right-0' : 'left-0'
            }`}
            onClick={(event) => event.stopPropagation()}
          >
            {validLinks.map((link, index) => (
              <a
                key={`${link.url}-${index}`}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50 hover:text-teal-700 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-emerald-300"
              >
                <span className="min-w-0 truncate">{link.label}</span>
                <ExternalLink className="h-4 w-4 shrink-0" />
              </a>
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
