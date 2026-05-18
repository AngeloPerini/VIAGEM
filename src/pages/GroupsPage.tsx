import { motion } from 'framer-motion';
import { CheckCircle2, Copy, Link2, Plus, Send, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useGroup } from '../contexts/GroupContext';

type GroupsPageProps = {
  inviteToken?: string | null;
};

const parseInviteToken = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '';

  try {
    const url = new URL(trimmed);
    return url.pathname.split('/').filter(Boolean).at(-1) ?? '';
  } catch {
    return trimmed.split('/').filter(Boolean).at(-1) ?? trimmed;
  }
};

export function GroupsPage({ inviteToken }: GroupsPageProps) {
  const { user } = useAuth();
  const {
    activeGroup,
    acceptInvite,
    createGroup,
    error,
    inviteMember,
    loading,
    setActiveGroup,
    userGroups,
  } = useGroup();
  const [name, setName] = useState('Viagem Europa');
  const [description, setDescription] = useState('');
  const [inviteInput, setInviteInput] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [generatedInvite, setGeneratedInvite] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const displayName = useMemo(
    () => user?.user_metadata?.full_name ?? user?.user_metadata?.name ?? user?.email ?? 'viajante',
    [user],
  );

  useEffect(() => {
    if (!inviteToken) return;

    let active = true;
    setStatus('Aceitando convite...');
    setFormError(null);

    void acceptInvite(inviteToken)
      .then(() => {
        if (!active) return;
        setStatus('Convite aceito. Abrindo a viagem...');
        window.setTimeout(() => window.location.replace('/'), 650);
      })
      .catch((caughtError) => {
        if (!active) return;
        setStatus(null);
        setFormError(caughtError instanceof Error ? caughtError.message : 'Nao foi possivel aceitar o convite.');
      });

    return () => {
      active = false;
    };
  }, [acceptInvite, inviteToken]);

  const handleCreateGroup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setIsSubmitting(true);

    try {
      await createGroup(name, description);
      setStatus('Viagem criada.');
    } catch (caughtError) {
      setFormError(caughtError instanceof Error ? caughtError.message : 'Nao foi possivel criar a viagem.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAcceptInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const token = parseInviteToken(inviteInput);
    if (!token) return;
    setFormError(null);
    setIsSubmitting(true);

    try {
      await acceptInvite(token);
      setStatus('Convite aceito.');
      window.setTimeout(() => window.location.replace('/'), 650);
    } catch (caughtError) {
      setFormError(caughtError instanceof Error ? caughtError.message : 'Nao foi possivel aceitar o convite.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setIsSubmitting(true);

    try {
      const link = await inviteMember(inviteEmail);
      setGeneratedInvite(link);
      setStatus('Convite criado.');
    } catch (caughtError) {
      setFormError(caughtError instanceof Error ? caughtError.message : 'Nao foi possivel criar o convite.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#eef5f3] px-4 py-8 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <motion.header
          className="rounded-[2rem] border border-white/80 bg-white/85 p-6 shadow-xl shadow-slate-900/10 backdrop-blur md:p-8"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <p className="text-sm font-black uppercase tracking-[0.22em] text-teal-700">Ola, {displayName}</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight md:text-5xl">
            Crie uma viagem ou entre por convite
          </h1>
          <p className="mt-4 max-w-3xl leading-7 text-slate-600">
            Gastos, roteiro, pontos turisticos, fotos e dashboard so aparecem para membros do grupo ativo.
          </p>
        </motion.header>

        {(error || formError || status || loading) ? (
          <p className="rounded-2xl border border-white/80 bg-white/85 px-4 py-3 text-sm font-bold text-slate-600 shadow-lg shadow-slate-900/5">
            {loading ? 'Carregando viagens...' : formError ?? error ?? status}
          </p>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
          <motion.form
            onSubmit={handleCreateGroup}
            className="rounded-[2rem] border border-white/80 bg-white/90 p-6 shadow-xl shadow-slate-900/10 md:p-8"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
          >
            <div className="mb-6 flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white">
                <Plus className="h-6 w-6" />
              </span>
              <div>
                <p className="text-sm font-black uppercase tracking-[0.18em] text-slate-400">Nova viagem</p>
                <h2 className="text-2xl font-black">Criar viagem</h2>
              </div>
            </div>

            <label>
              <span className="mb-2 block text-sm font-bold text-slate-600">Nome da viagem</span>
              <input
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="h-12 w-full rounded-2xl border border-slate-200 px-4 font-semibold outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
              />
            </label>
            <label className="mt-4 block">
              <span className="mb-2 block text-sm font-bold text-slate-600">Descricao opcional</span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={4}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
              />
            </label>
            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 font-black text-white shadow-xl shadow-slate-900/20 transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <Plus className="h-5 w-5" />
              Criar nova viagem
            </button>
          </motion.form>

          <motion.section
            className="rounded-[2rem] border border-white/80 bg-white/90 p-6 shadow-xl shadow-slate-900/10 md:p-8"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <div className="mb-6 flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-600 text-white">
                <Link2 className="h-6 w-6" />
              </span>
              <div>
                <p className="text-sm font-black uppercase tracking-[0.18em] text-slate-400">Convite</p>
                <h2 className="text-2xl font-black">Entrar em uma viagem</h2>
              </div>
            </div>

            <form onSubmit={handleAcceptInvite}>
              <label>
                <span className="mb-2 block text-sm font-bold text-slate-600">Link ou token do convite</span>
                <input
                  value={inviteInput}
                  onChange={(event) => setInviteInput(event.target.value)}
                  className="h-12 w-full rounded-2xl border border-slate-200 px-4 font-semibold outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                />
              </label>
              <button
                type="submit"
                disabled={isSubmitting || !inviteInput.trim()}
                className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 font-black text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <CheckCircle2 className="h-5 w-5" />
                Entrar com convite
              </button>
            </form>

            {activeGroup?.role === 'owner' ? (
              <form onSubmit={handleCreateInvite} className="mt-8 border-t border-slate-100 pt-6">
                <label>
                  <span className="mb-2 block text-sm font-bold text-slate-600">Convidar e-mail opcional</span>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    className="h-12 w-full rounded-2xl border border-slate-200 px-4 font-semibold outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                  />
                </label>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 font-black text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <Send className="h-5 w-5" />
                  Gerar convite
                </button>
                {generatedInvite ? (
                  <button
                    type="button"
                    onClick={() => void navigator.clipboard.writeText(generatedInvite)}
                    className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-teal-50 px-4 py-3 text-sm font-bold text-teal-800"
                  >
                    <Copy className="h-4 w-4" />
                    {generatedInvite}
                  </button>
                ) : null}
              </form>
            ) : null}
          </motion.section>
        </div>

        {userGroups.length ? (
          <motion.section
            className="rounded-[2rem] border border-white/80 bg-white/85 p-6 shadow-xl shadow-slate-900/10 md:p-8"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
          >
            <div className="mb-5 flex items-center gap-3">
              <Users className="h-5 w-5 text-teal-700" />
              <h2 className="text-2xl font-black">Suas viagens</h2>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {userGroups.map((group) => (
                <button
                  type="button"
                  key={group.id}
                  onClick={() => setActiveGroup(group)}
                  className="rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-teal-300 hover:bg-teal-50"
                >
                  <span className="text-lg font-black text-slate-950">{group.name}</span>
                  <span className="mt-1 block text-sm font-bold text-slate-500">
                    {group.role === 'owner' ? 'Owner' : 'Membro'}
                  </span>
                </button>
              ))}
            </div>
          </motion.section>
        ) : null}
      </div>
    </main>
  );
}
