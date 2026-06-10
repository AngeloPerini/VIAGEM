import { motion } from 'framer-motion';
import { ArrowRight, CheckCircle2, Loader2, Ticket, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useGroup } from '../contexts/GroupContext';
import { clearPendingInviteToken, normalizeInviteToken } from '../services/groupsService';

type InvitePageProps = {
  token: string;
  onDone: () => void;
};

export function InvitePage({ token, onDone }: InvitePageProps) {
  const { acceptInvite } = useGroup();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Aceitando convite...');
  const normalizedToken = normalizeInviteToken(token);

  useEffect(() => {
    let active = true;

    if (!normalizedToken) {
      setStatus('error');
      setMessage('Convite invalido.');
      return undefined;
    }

    setStatus('loading');
    setMessage('Aceitando convite...');

    void acceptInvite(normalizedToken)
      .then((group) => {
        if (!active) return;
        clearPendingInviteToken();
        setStatus('success');
        setMessage(`Voce entrou em ${group.name}. Abrindo dashboard...`);
        window.setTimeout(() => {
          window.history.replaceState(null, '', '/dashboard');
          onDone();
        }, 850);
      })
      .catch((caughtError) => {
        if (!active) return;
        setStatus('error');
        setMessage(caughtError instanceof Error ? caughtError.message : 'Nao foi possivel aceitar o convite.');
      });

    return () => {
      active = false;
    };
  }, [acceptInvite, normalizedToken, onDone]);

  const Icon = status === 'success' ? CheckCircle2 : status === 'error' ? XCircle : Loader2;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#eef5f3] px-4 py-10 text-slate-950 dark:bg-slate-950 dark:text-slate-50">
      <motion.section
        className="w-full max-w-lg rounded-[2rem] border border-white/80 bg-white/90 p-7 text-center shadow-2xl shadow-slate-900/10 dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/30 md:p-10"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-950 text-white dark:bg-emerald-400 dark:text-emerald-950">
          <Icon className={`h-8 w-8 ${status === 'loading' ? 'animate-spin' : ''}`} />
        </div>
        <p className="mt-7 text-sm font-black uppercase tracking-[0.22em] text-teal-700 dark:text-emerald-300">Convite</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight md:text-4xl">
          {status === 'success' ? 'Convite aceito' : status === 'error' ? 'Convite nao aceito' : 'Entrando na viagem'}
        </h1>
        <p className="mt-4 leading-7 text-slate-600 dark:text-slate-300">{message}</p>
        <div className="mt-6 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-black text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          <Ticket className="mr-2 inline h-4 w-4" />
          {normalizedToken || 'Sem codigo'}
        </div>
        {status === 'error' ? (
          <button
            type="button"
            onClick={() => {
              clearPendingInviteToken();
              window.history.replaceState(null, '', '/');
              onDone();
            }}
            className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 font-black text-white transition hover:bg-teal-700 dark:bg-emerald-400 dark:text-emerald-950 dark:hover:bg-emerald-300"
          >
            Voltar
            <ArrowRight className="h-5 w-5" />
          </button>
        ) : null}
      </motion.section>
    </main>
  );
}
