import { Layers, UserRound } from 'lucide-react';
import { useAccountScope } from '../app/accountScope';
import { accountLabel } from '../domain/account';
import { PLATFORM_LABELS, PLATFORMS } from '../domain/carousel';

const SELECT_CLASS =
  'h-9 w-full min-w-0 cursor-pointer truncate rounded-lg border border-line bg-surface px-2.5 text-sm font-medium text-ink outline-none transition-colors hover:border-faint focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/25';

/** "Projeto" and "Conta atual" at the top: every screen follows them. */
export function AccountSwitcher() {
  const { active, current, setCurrent, projects, project, setProject, loading } = useAccountScope();
  if (loading) return null;
  const activeProjects = projects.filter((item) => item.status === 'active' || item.id === project?.id);

  return (
    <div className="flex min-w-0 gap-2 lg:flex-col">
      {activeProjects.length > 0 && (
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-faint">
            <Layers className="size-3" aria-hidden /> Projeto
          </span>
          <select value={project?.id ?? ''} onChange={(e) => setProject(e.target.value || null)} className={SELECT_CLASS}>
            <option value="">Todos os projetos</option>
            {activeProjects.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {active.length > 0 && (
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-faint">
            <UserRound className="size-3" aria-hidden /> Conta atual
          </span>
          <select value={current?.id ?? ''} onChange={(e) => setCurrent(e.target.value || null)} className={SELECT_CLASS}>
            <option value="">{project ? `Todas de ${project.name}` : 'Todas as contas'}</option>
            {PLATFORMS.map((platform) => {
              const items = active.filter((account) => account.platform === platform);
              if (items.length === 0) return null;
              return (
                <optgroup key={platform} label={PLATFORM_LABELS[platform]}>
                  {items.map((account) => (
                    <option key={account.id} value={account.id}>
                      {accountLabel(account)} · {PLATFORM_LABELS[platform]}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        </label>
      )}
    </div>
  );
}
