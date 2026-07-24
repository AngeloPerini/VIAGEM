import { AnimatePresence, motion } from 'framer-motion';
import { Mail, X } from 'lucide-react';
import { useEffect, useState } from 'react';

type LegalPanelKey = 'terms' | 'privacy' | 'support';

type LegalPanel = {
  label: string;
  title: string;
  intro?: string;
  paragraphs: string[];
};

const SUPPORT_EMAIL = 'r.perini351@gmail.com';
const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Suporte TripFlow')}`;

// Textos legais iniciais. Recomenda-se revisão jurídica antes de uso comercial amplo.
const legalPanels: Record<LegalPanelKey, LegalPanel> = {
  terms: {
    label: 'Termos de Uso',
    title: 'Termos de Uso',
    paragraphs: [
      'Ao utilizar o TripFlow, o usuário concorda em usar a plataforma para fins lícitos e relacionados ao planejamento e organização de viagens.',
      'O TripFlow permite organizar roteiros, gastos, documentos, checklist, pontos turísticos, cotações, mapa e informações da viagem. Algumas funcionalidades podem utilizar inteligência artificial para sugerir roteiros, atividades, documentos e estimativas.',
      'As sugestões geradas por inteligência artificial são auxiliares e podem conter erros ou informações desatualizadas. O usuário deve revisar todas as informações antes de tomar decisões, realizar reservas, comprar passagens, contratar serviços ou viajar.',
      'O TripFlow não substitui fontes oficiais, consulados, embaixadas, companhias aéreas, hotéis, órgãos públicos, prestadores de serviço ou profissionais especializados.',
      'O usuário é responsável pelas informações cadastradas, pela segurança da conta e pela verificação de documentos, vistos, vacinas, reservas, custos e demais exigências da viagem.',
      'O TripFlow poderá passar por manutenções, atualizações ou instabilidades temporárias. Os termos podem ser atualizados periodicamente.',
    ],
  },
  privacy: {
    label: 'Política de Privacidade',
    title: 'Política de Privacidade',
    paragraphs: [
      'O TripFlow coleta e utiliza dados necessários para o funcionamento da plataforma, como nome, e-mail, foto de perfil, informações de autenticação, viagens criadas, destinos, datas, roteiros, gastos, documentos, checklist, pontos turísticos, preferências de tema/moeda e dados técnicos de uso.',
      'Essas informações são utilizadas para criar e gerenciar a conta do usuário, organizar viagens, exibir dashboards, salvar roteiros, controlar gastos, sincronizar dados do grupo, gerar sugestões com inteligência artificial quando solicitado e melhorar a experiência na plataforma.',
      'Quando o usuário utiliza recursos de inteligência artificial, informações relacionadas à viagem podem ser enviadas ao provedor de IA para processamento da solicitação. O usuário não deve inserir senhas, dados bancários ou informações sensíveis desnecessárias nos campos de descrição.',
      'O TripFlow pode utilizar serviços de terceiros necessários ao funcionamento da plataforma, como autenticação, banco de dados, hospedagem e provedores de inteligência artificial.',
      'A plataforma adota mecanismos de autenticação, controle de acesso e políticas de segurança para proteger os dados. O usuário pode solicitar acesso, correção ou exclusão de dados conforme a legislação aplicável.',
    ],
  },
  support: {
    label: 'Suporte',
    title: 'Suporte',
    intro: 'Precisa de ajuda com sua conta ou com o uso do TripFlow?',
    paragraphs: [
      'Entre em contato para relatar problemas, dúvidas, sugestões de melhoria ou dificuldades com login, roteiro, gastos, documentos, IA, mapa, cotações ou funcionalidades do aplicativo.',
      `Canal de suporte: ${SUPPORT_EMAIL}`,
    ],
  },
};

const footerLinks: LegalPanelKey[] = ['terms', 'privacy', 'support'];

type AppFooterProps = {
  className?: string;
  compact?: boolean;
};

export function AppFooter({ className = '', compact = false }: AppFooterProps) {
  const [activePanel, setActivePanel] = useState<LegalPanelKey | null>(null);
  const currentYear = new Date().getFullYear();
  const panel = activePanel ? legalPanels[activePanel] : null;

  useEffect(() => {
    if (!activePanel) return undefined;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActivePanel(null);
    };

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [activePanel]);

  return (
    <>
      <footer
        aria-label="Rodapé institucional"
        className={`w-full border-t border-[#dfe5ee]/80 px-1 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-5 text-[#667085] dark:border-slate-800 dark:text-slate-400 ${className}`}
      >
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 text-center lg:flex-row lg:text-left">
          <div className="min-w-0">
            <p className="text-sm font-black text-[#0b1326] dark:text-slate-100">TripFlow</p>
            {compact ? null : (
              <p className="mt-1 max-w-2xl text-sm font-semibold leading-6">
                Planeje sua viagem com roteiro, gastos, documentos e cotações em um só lugar.
              </p>
            )}
            <p className="mt-1 text-xs font-semibold">© {currentYear} TripFlow. Todos os direitos reservados.</p>
          </div>

          <nav
            aria-label="Links legais do TripFlow"
            className="flex max-w-full flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs font-black"
          >
            {footerLinks.map((linkKey) => (
              <button
                key={linkKey}
                type="button"
                aria-haspopup="dialog"
                onClick={() => setActivePanel(linkKey)}
                className="rounded-md text-[#007c68] transition hover:text-[#004638] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-400 dark:text-emerald-300 dark:hover:text-emerald-200"
              >
                {legalPanels[linkKey].label}
              </button>
            ))}
          </nav>
        </div>
      </footer>

      <AnimatePresence>
        {panel ? (
          <motion.div
            className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/50 p-3 backdrop-blur-sm sm:items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={() => setActivePanel(null)}
          >
            <motion.section
              role="dialog"
              aria-modal="true"
              aria-labelledby="tripflow-legal-modal-title"
              className="w-full max-w-2xl rounded-[1.75rem] border border-white/80 bg-white p-5 text-[#0b1326] shadow-2xl shadow-slate-950/25 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 sm:p-6"
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 260, damping: 24 }}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-[#007c68] dark:text-emerald-300">
                    TripFlow
                  </p>
                  <h2 id="tripflow-legal-modal-title" className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
                    {panel.title}
                  </h2>
                  {panel.intro ? (
                    <p className="mt-2 text-sm font-semibold leading-6 text-[#45464d] dark:text-slate-300">
                      {panel.intro}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  aria-label={`Fechar ${panel.title}`}
                  onClick={() => setActivePanel(null)}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[#667085] transition hover:bg-[#eef8f6] hover:text-[#007c68] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-emerald-300"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-5 max-h-[min(58svh,26rem)] space-y-4 overflow-y-auto pr-1 text-sm font-semibold leading-7 text-[#45464d] dark:text-slate-300">
                {panel.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>

              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setActivePanel(null)}
                  className="min-h-11 rounded-xl border border-[#dfe5ee] px-5 py-2.5 text-sm font-black text-[#45464d] transition hover:bg-[#f8fafc] dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Fechar
                </button>
                {activePanel === 'support' ? (
                  <a
                    href={SUPPORT_MAILTO}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#007c68] px-5 py-2.5 text-sm font-black text-white transition hover:bg-[#006b57] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 dark:bg-emerald-400 dark:text-emerald-950 dark:hover:bg-emerald-300"
                  >
                    <Mail className="h-4 w-4" />
                    Enviar e-mail
                  </a>
                ) : null}
              </div>
            </motion.section>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
