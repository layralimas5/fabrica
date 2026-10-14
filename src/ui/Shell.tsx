import clsx from 'clsx';
import { BarChart3, LayoutDashboard, CalendarDays, Clapperboard, FlaskConical, FolderKanban, Images, Layers, Palette, PlugZap, Plus, Settings, Sparkles, Trophy, UsersRound, type LucideIcon } from 'lucide-react';
import { AccountScopeProvider } from '../app/accountScope';
import { BackupReminder } from './BackupReminder';
import { AccountSwitcher } from './AccountSwitcher';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useServices } from '../app/services';
import { Badge, Button } from './primitives';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

/** Grouped by the cycle: create, analyse, distribute, then the setup that rarely changes. */
const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Criar',
    items: [
      { to: '/criar', label: 'Criar', icon: Sparkles },
      { to: '/videos', label: 'Vídeos', icon: Clapperboard },
      { to: '/conteudos', label: 'Conteúdos', icon: FolderKanban },
      { to: '/calendario', label: 'Calendário', icon: CalendarDays },
    ],
  },
  {
    title: 'Analisar',
    items: [
      { to: '/painel', label: 'Painel', icon: LayoutDashboard },
      { to: '/analytics', label: 'Analytics', icon: BarChart3 },
      { to: '/vencedores', label: 'Modelos Vencedores', icon: Trophy },
      { to: '/testes', label: 'Testes', icon: FlaskConical },
    ],
  },
  {
    title: 'Configurar',
    items: [
      { to: '/projetos', label: 'Projetos', icon: Layers },
      { to: '/contas', label: 'Contas', icon: UsersRound },
      { to: '/conexoes', label: 'Contas conectadas', icon: PlugZap },
      { to: '/biblioteca', label: 'Biblioteca', icon: Images },
      { to: '/marcas', label: 'Brand Kits', icon: Palette },
      { to: '/configuracoes', label: 'Configurações', icon: Settings },
    ],
  },
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

      <aside className="sticky top-0 z-20 border-b border-line bg-canvas/85 backdrop-blur lg:flex lg:h-dvh lg:flex-col lg:border-b-0 lg:border-r">
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

        <nav aria-label="Principal" className="flex gap-1 overflow-x-auto px-3 pb-2 lg:min-h-0 lg:flex-1 lg:flex-col lg:gap-4 lg:overflow-y-auto lg:px-3 lg:pb-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.title} role="group" aria-label={group.title} className="flex gap-1 lg:flex-col lg:gap-0.5">
              <p className="hidden px-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-faint lg:block">{group.title}</p>
              {group.items.map(({ to, label, icon: Icon }) => (
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
            </div>
          ))}
        </nav>

        <div className="hidden px-5 pb-6 empty:hidden lg:block">
          {auth.mode === 'local' && <Badge tone="neutral">Salvo neste navegador</Badge>}
          {auth.mode === 'supabase' && ai.engine === 'heuristic' && <Badge tone="warning">IA local</Badge>}
        </div>
      </aside>

      <main id="conteudo" className="min-w-0 px-4 py-8 sm:px-8 lg:px-12 lg:py-12">
        <BackupReminder />
        <Outlet />
      </main>
    </div>
  );
}
