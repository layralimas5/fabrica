import clsx from 'clsx';
import { BarChart3, Brain, Filter, Megaphone, LayoutDashboard, CalendarDays, Clapperboard, FlaskConical, FolderKanban, Images, Layers, Palette, PanelLeftClose, PanelLeftOpen, PlugZap, Plus, Settings, Sparkles, UsersRound, type LucideIcon } from 'lucide-react';
import { AccountScopeProvider } from '../app/accountScope';
import { BackupReminder } from './BackupReminder';
import { AccountSwitcher } from './AccountSwitcher';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useServices } from '../app/services';
import { useFailedPublications } from '../publishing/useFailedPublications';
import { Badge, Button } from './primitives';
import { useSidebarCollapsed } from './useSidebarCollapsed';

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
      { to: '/conversoes', label: 'Conversões', icon: Filter },
      { to: '/inteligencia', label: 'Inteligência', icon: Brain },
      { to: '/analytics', label: 'Analytics', icon: BarChart3 },
      { to: '/testes', label: 'Testes', icon: FlaskConical },
    ],
  },
  {
    title: 'Distribuir',
    items: [{ to: '/grupos', label: 'Grupos do Facebook', icon: Megaphone }],
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
  const failed = useFailedPublications();
  const { collapsed, toggle } = useSidebarCollapsed();
  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;
  const toggleLabel = collapsed ? 'Expandir menu' : 'Recolher menu';

  return (
    <div
      className={clsx(
        'min-h-dvh bg-canvas lg:grid lg:transition-[grid-template-columns] lg:duration-200 lg:ease-out motion-reduce:transition-none',
        collapsed ? 'lg:grid-cols-[72px_minmax(0,1fr)]' : 'lg:grid-cols-[240px_minmax(0,1fr)]',
      )}
    >
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">
        Pular para o conteúdo
      </a>

      <aside className="sticky top-0 z-20 border-b border-line bg-canvas/85 backdrop-blur lg:flex lg:h-dvh lg:flex-col lg:overflow-hidden lg:border-b-0 lg:border-r">
        <div className={clsx('flex items-center justify-between gap-3 px-4 py-3 lg:flex-col lg:items-stretch lg:py-6', collapsed ? 'lg:gap-3 lg:px-3' : 'lg:gap-6 lg:px-4')}>
          <div className={clsx('flex items-center gap-2.5', collapsed ? 'lg:flex-col lg:gap-3' : 'lg:justify-between lg:pl-2')}>
            <div className="flex items-center gap-2.5">
              <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-ink text-[13px] font-bold text-canvas" aria-hidden>
                F
              </span>
              <span className={clsx('text-sm font-semibold tracking-tight text-ink', collapsed && 'lg:sr-only')}>Fábrica</span>
            </div>
            <button
              type="button"
              onClick={toggle}
              aria-label={toggleLabel}
              aria-expanded={!collapsed}
              title={`${toggleLabel} (Ctrl+B)`}
              className="hidden size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-subtle hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent lg:grid"
            >
              <ToggleIcon className="size-4" aria-hidden />
            </button>
          </div>
          <Button
            variant="primary"
            size="md"
            className={clsx('lg:w-full', collapsed && 'lg:px-0')}
            onClick={() => navigate('/criar')}
            aria-label={collapsed ? 'Novo carrossel' : undefined}
            title={collapsed ? 'Novo carrossel' : undefined}
          >
            <Plus className="size-4 shrink-0" aria-hidden /> <span className={clsx('hidden sm:inline', collapsed && 'lg:hidden')}>Novo carrossel</span>
          </Button>
        </div>

        <div className={clsx('px-4 pb-3 lg:px-4 lg:pb-4', collapsed && 'lg:hidden')}>
          <AccountSwitcher />
        </div>

        <nav
          aria-label="Principal"
          className={clsx('flex gap-1 overflow-x-auto px-3 pb-2 lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden lg:px-3 lg:pb-4', collapsed ? 'lg:gap-2' : 'lg:gap-4')}
        >
          {NAV_GROUPS.map((group, index) => (
            <div
              key={group.title}
              role="group"
              aria-label={group.title}
              className={clsx('flex gap-1 lg:flex-col lg:gap-0.5', collapsed && index > 0 && 'lg:border-t lg:border-line lg:pt-2')}
            >
              <p className={clsx('hidden px-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-faint', !collapsed && 'lg:block')}>{group.title}</p>
              {group.items.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  title={collapsed ? label : undefined}
                  className={({ isActive }) =>
                    clsx(
                      'relative flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                      collapsed && 'lg:justify-center lg:px-0',
                      isActive ? 'bg-surface font-medium text-ink shadow-sm ring-1 ring-line' : 'text-muted hover:bg-subtle hover:text-ink',
                    )
                  }
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  <span className={clsx('truncate', collapsed && 'lg:sr-only')}>{label}</span>
                  {to === '/calendario' && failed > 0 && (
                    <span
                      className={clsx(
                        'ml-auto rounded-full bg-red-600 px-1.5 text-[10px] font-semibold text-white',
                        collapsed && 'lg:absolute lg:right-1 lg:top-0.5 lg:ml-0 lg:px-1 lg:leading-4',
                      )}
                      title={`${failed} publicação(ões) com falha`}
                    >
                      {failed}
                      <span className="sr-only"> publicações com falha</span>
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className={clsx('hidden px-5 pb-6 empty:hidden', !collapsed && 'lg:block')}>
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
