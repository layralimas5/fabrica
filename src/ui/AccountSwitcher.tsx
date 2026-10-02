import { UserRound } from 'lucide-react';
import { useAccountScope } from '../app/accountScope';
import { accountLabel } from '../domain/account';
import { PLATFORM_LABELS, PLATFORMS } from '../domain/carousel';

/** "Conta atual" at the top: Projetos, Agenda, Vencedores, Analytics and Criar follow it. */
export function AccountSwitcher() {
  const { active, current, setCurrent, loading } = useAccountScope();
  if (loading || active.length === 0) return null;

  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-faint">
        <UserRound className="size-3" aria-hidden /> Conta atual
      </span>
      <select
        value={current?.id ?? ''}
        onChange={(e) => setCurrent(e.target.value || null)}
        className="h-9 w-full min-w-0 cursor-pointer truncate rounded-lg border border-line bg-surface px-2.5 text-sm font-medium text-ink outline-none transition-colors hover:border-faint focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/25"
      >
        <option value="">Todas as contas</option>
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
  );
}
