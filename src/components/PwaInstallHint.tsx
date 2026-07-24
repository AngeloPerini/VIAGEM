import { motion } from 'framer-motion';
import { Share2, X } from 'lucide-react';
import { useEffect, useState } from 'react';

const PWA_INSTALL_HINT_DISMISSED_KEY = 'tripflow:pwa-install-hint-dismissed';

const isRunningStandalone = () => {
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || navigatorWithStandalone.standalone === true;
};

const isIosSafari = () => {
  const userAgent = window.navigator.userAgent;
  const isIos =
    /iPad|iPhone|iPod/.test(userAgent) ||
    (userAgent.includes('Macintosh') && window.navigator.maxTouchPoints > 1);
  const isSafari = /Safari/.test(userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS|Chrome|Android/.test(userAgent);

  return isIos && isSafari;
};

const hasDismissedInstallHint = () => {
  try {
    return window.localStorage.getItem(PWA_INSTALL_HINT_DISMISSED_KEY) === 'true';
  } catch {
    return false;
  }
};

const dismissInstallHint = () => {
  try {
    window.localStorage.setItem(PWA_INSTALL_HINT_DISMISSED_KEY, 'true');
  } catch {
    // Ignore storage failures in private browsing; hiding for this session is enough.
  }
};

export function PwaInstallHint() {
  const [shouldShow, setShouldShow] = useState(false);

  useEffect(() => {
    if (!isIosSafari() || isRunningStandalone()) return;
    if (hasDismissedInstallHint()) return;

    setShouldShow(true);
  }, []);

  if (!shouldShow) return null;

  return (
    <motion.aside
      role="note"
      aria-label="Instalar TripFlow no iPhone"
      className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-[70] mx-auto max-w-md rounded-2xl border border-[#bfe8de] bg-white/95 p-4 text-[#0b1326] shadow-2xl shadow-slate-950/18 backdrop-blur-xl dark:border-emerald-400/30 dark:bg-slate-900/95 dark:text-slate-100"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 280, damping: 24 }}
    >
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#e8f8f4] text-[#007c68] dark:bg-emerald-400/15 dark:text-emerald-300">
          <Share2 className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black">Instale o TripFlow no iPhone</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-[#45464d] dark:text-slate-300">
            No Safari, toque em Compartilhar e escolha Adicionar à Tela de Início.
          </p>
        </div>
        <button
          type="button"
          aria-label="Ocultar instrução de instalação"
          onClick={() => {
            dismissInstallHint();
            setShouldShow(false);
          }}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[#667085] transition hover:bg-[#eef8f6] hover:text-[#007c68] dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-emerald-300"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </motion.aside>
  );
}
