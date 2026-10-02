import clsx from 'clsx';
import { NavLink } from 'react-router-dom';

const TABS = [
  { to: '/vencedores', label: 'Biblioteca', end: true },
  { to: '/vencedores/analise', label: 'Análise', end: false },
];

export function WinnersTabs() {
  return (
    <nav aria-label="Modelos Vencedores" className="mb-6 flex gap-1 border-b border-line">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) =>
            clsx(
              '-mb-px border-b-2 px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              isActive ? 'border-ink font-medium text-ink' : 'border-transparent text-muted hover:text-ink',
            )
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
