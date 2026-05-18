import { motion } from 'framer-motion';
import { LogIn, Plane } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

export function LoginPage() {
  const { signIn } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSignIn = async () => {
    setError(null);
    setIsSubmitting(true);

    try {
      await signIn();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Nao foi possivel iniciar o login.');
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#eef5f3] px-4 py-10 text-slate-950">
      <motion.section
        className="w-full max-w-xl rounded-[2rem] border border-white/80 bg-white/90 p-7 shadow-2xl shadow-slate-900/10 backdrop-blur md:p-10"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
      >
        <div className="mb-7 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950 text-white">
          <Plane className="h-7 w-7" />
        </div>
        <p className="text-sm font-black uppercase tracking-[0.22em] text-teal-700">Viagem compartilhada</p>
        <h1 className="mt-3 text-4xl font-black tracking-tight md:text-5xl">Minha Viagem Europa</h1>
        <p className="mt-4 text-lg leading-8 text-slate-600">
          Entre para sincronizar gastos, roteiro e fotos entre seus dispositivos.
        </p>

        <button
          type="button"
          onClick={() => void handleSignIn()}
          disabled={isSubmitting}
          className="mt-8 inline-flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-slate-950 px-5 font-black text-white shadow-xl shadow-slate-900/20 transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-70"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-sm font-black text-slate-950">
            G
          </span>
          {isSubmitting ? 'Abrindo Google...' : 'Entrar com Google'}
          <LogIn className="h-5 w-5" />
        </button>

        {error ? (
          <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{error}</p>
        ) : null}
      </motion.section>
    </main>
  );
}
