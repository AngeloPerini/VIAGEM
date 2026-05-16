import { motion } from 'framer-motion';
import { BarChart3, Camera, Coins, LayoutDashboard, Map } from 'lucide-react';

export type AppView = 'dashboard' | 'expenses' | 'itinerary' | 'attractions' | 'quote';

type NavbarProps = {
  activeView: AppView;
  onNavigate: (view: AppView) => void;
};

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'expenses', label: 'Gastos', icon: BarChart3 },
  { id: 'itinerary', label: 'Roteiro', icon: Map },
  { id: 'attractions', label: 'Pontos Turísticos', icon: Camera },
  { id: 'quote', label: 'Cotacao', icon: Coins },
] as const;

export function Navbar({ activeView, onNavigate }: NavbarProps) {
  return (
    <motion.nav
      className="sticky top-3 z-30 mx-auto flex w-full max-w-7xl items-center justify-between rounded-3xl border border-white/70 bg-white/80 p-2 shadow-xl shadow-slate-900/10 backdrop-blur-xl"
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <button
        type="button"
        onClick={() => onNavigate('dashboard')}
        className="px-3 text-left text-sm font-black tracking-tight text-slate-950 md:px-5 md:text-base"
      >
        Europa Budget
      </button>

      <div className="flex gap-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = activeView === item.id;

          return (
            <a
              key={item.id}
              onClick={() => onNavigate(item.id)}
              href={item.id === 'dashboard' ? '#' : `#${item.id}`}
              className={`relative inline-flex h-11 items-center justify-center gap-2 rounded-2xl px-3 text-sm font-bold transition md:px-4 ${
                active ? 'text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-950'
              }`}
            >
              {active ? (
                <motion.span
                  layoutId="active-nav"
                  className="absolute inset-0 rounded-2xl bg-slate-950"
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                />
              ) : null}
              <Icon className="relative h-4 w-4" />
              <span className="relative hidden sm:inline">{item.label}</span>
            </a>
          );
        })}
      </div>
    </motion.nav>
  );
}
