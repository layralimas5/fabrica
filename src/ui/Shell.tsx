import clsx from 'clsx';
import { BarChart3, CalendarDays, FlaskConical, FolderKanban, Images, Palette, Plus, Settings, Sparkles, Trophy, UsersRound } from 'lucide-react';
import { AccountScopeProvider } from '../app/accountScope';
import { AccountSwitcher } from './AccountSwitcher';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useServices } from '../app/services';
import { Badge, Button } from './primitives';

const NAV = [
  { to: '/criar', label: 'Criar', icon: Sparkles },
  { to: '/agenda', label: 'Agenda', icon: CalendarDays },
  { to: '/projetos', label: 'Projetos', icon: FolderKanban },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/vencedores', label: 'Modelos Vencedores', icon: Trophy },
  { to: '/testes', label: 'Testes', icon: FlaskConical },
  { to: '/contas', label: 'Contas', icon: UsersRound },
  { to: '/biblioteca', label: 'Biblioteca', icon: Images },
  { to: '/marcas', label: 'Brand Kits', icon: Palette },
  { to: '/configuracoes', label: 'Configurações', icon: Settings },
];

export function Shell() {
  return (
    <AccountScopeProvider>
      <ShellLayout />
    </AccountScopeProvider>
  );
}

function ShellLayout() {
  const navigate = useNavigate();
  const { auth, ai } = useServices();

  return (
    <div className="min-h-dvh bg-canvas lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">
        Pular para o conteúdo
      </a>

      <aside className="sticky top-0 z-20 border-b border-line bg-canvas/85 backdrop-blur lg:h-dvh lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between gap-3 px-4 py-3 lg:flex-col lg:items-stretch lg:gap-6 lg:px-4 lg:py-6">
          <div className="flex items-center gap-2.5 lg:px-2">
            <span className="grid size-7 place-items-center rounded-lg bg-ink text-[13px] font-bold text-canvas" aria-hidden>
              F
            </span>
            <span className="text-sm font-semibold tracking-tight text-ink">Fábrica</span>
          </div>
          <Button variant="primary" size="md" className="lg:w-full" onClick={() => navigate('/criar')}>
            <Plus className="size-4" aria-hidden /> <span className="hidden sm:inline">Novo carrossel</span>
          </Button>
        </div>

        <div className="px-4 pb-3 lg:px-4 lg:pb-4">
          <AccountSwitcher />
        </div>

        <nav aria-label="Principal" className="flex gap-1 overflow-x-auto px-3 pb-2 lg:flex-col lg:px-3 lg:pb-0">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                clsx(
                  'flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                  isActive ? 'bg-surface font-medium text-ink shadow-sm ring-1 ring-line' : 'text-muted hover:bg-subtle hover:text-ink',
                )
              }
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="hidden px-5 pb-6 lg:absolute lg:bottom-0 lg:block">
          {auth.mode === 'local' && <Badge tone="neutral">Salvo neste navegador</Badge>}
          {auth.mode === 'supabase' && ai.engine === 'heuristic' && <Badge tone="warning">IA local</Badge>}
        </div>
      </aside>

      <main id="conteudo" className="min-w-0 px-4 py-8 sm:px-8 lg:px-12 lg:py-12">
        <Outlet />
      </main>
    </div>
  );
}
