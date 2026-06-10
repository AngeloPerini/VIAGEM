import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

type AppErrorBoundaryProps = {
  children: ReactNode;
};

type AppErrorBoundaryState = {
  hasError: boolean;
  message: string;
};

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    hasError: false,
    message: '',
  };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || 'O app encontrou um erro inesperado.',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Erro capturado pela tela de seguranca:', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="flex min-h-screen items-center justify-center bg-[#eef5f3] px-4 py-10 text-slate-950 dark:bg-slate-950 dark:text-slate-50">
        <section className="w-full max-w-lg rounded-[2rem] border border-white/80 bg-white/90 p-7 text-center shadow-2xl shadow-slate-900/10 dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/30 md:p-10">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
            <AlertTriangle className="h-8 w-8" />
          </div>
          <p className="mt-7 text-sm font-black uppercase tracking-[0.22em] text-rose-700 dark:text-rose-300">
            Erro ao carregar
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight md:text-4xl">
            Nao foi possivel abrir o app agora
          </h1>
          <p className="mt-4 leading-7 text-slate-600 dark:text-slate-300">{this.state.message}</p>
          <button
            type="button"
            onClick={() => window.location.assign('/')}
            className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-2xl bg-slate-950 px-5 font-black text-white transition hover:bg-teal-700 dark:bg-emerald-400 dark:text-emerald-950 dark:hover:bg-emerald-300"
          >
            Recarregar site
          </button>
        </section>
      </main>
    );
  }
}
