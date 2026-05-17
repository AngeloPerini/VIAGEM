import { Plus, Trash2 } from 'lucide-react';
import type { LinkItem } from '../types';
import { hasInvalidLinks } from '../utils/links';

type LinksEditorProps = {
  links: LinkItem[];
  onChange: (links: LinkItem[]) => void;
};

export function LinksEditor({ links, onChange }: LinksEditorProps) {
  const updateLink = (index: number, patch: Partial<LinkItem>) => {
    onChange(links.map((link, currentIndex) => (currentIndex === index ? { ...link, ...patch } : link)));
  };

  return (
    <section className="md:col-span-2">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-black text-slate-700">Links úteis</p>
          <p className="text-xs font-semibold text-slate-400">Google Maps, reservas, ingressos ou rotas.</p>
        </div>
        <button
          type="button"
          onClick={() => onChange([...links, { label: '', url: '' }])}
          className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
        >
          <Plus className="h-4 w-4" />
          Link
        </button>
      </div>

      <div className="space-y-3">
        {links.length === 0 ? (
          <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-400">
            Nenhum link cadastrado.
          </div>
        ) : null}

        {links.map((link, index) => (
          <div key={index} className="grid gap-3 rounded-2xl border border-slate-200 p-3 md:grid-cols-[0.8fr_1fr_auto]">
            <input
              value={link.label}
              onChange={(event) => updateLink(index, { label: event.target.value })}
              placeholder="Nome do link"
              className="h-11 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
            />
            <input
              value={link.url}
              onChange={(event) => updateLink(index, { url: event.target.value })}
              placeholder="https://maps.google.com/..."
              className="h-11 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
            />
            <button
              type="button"
              aria-label="Remover link"
              onClick={() => onChange(links.filter((_, currentIndex) => currentIndex !== index))}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 px-3 text-slate-500 transition hover:bg-rose-50 hover:text-rose-700"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      {hasInvalidLinks(links) ? (
        <p className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          Use nome e URL com http://, https://, maps:// ou geo:.
        </p>
      ) : null}
    </section>
  );
}
