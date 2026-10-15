import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { isActiveAccount, type Account } from '../domain/account';
import { sameProject, type Project } from '../domain/project';
import { useAccounts, useProjects } from './data';

const ACCOUNT_KEY = 'fabrica:current-account';
const PROJECT_KEY = 'fabrica:current-project';

interface AccountScope {
  /** Every account, paused ones included (history and analytics still show them). */
  accounts: Account[];
  /** Accounts offered in pickers: the active ones of the current project (all projects when none is picked). */
  active: Account[];
  /** Null means "Todas as contas". */
  current: Account | null;
  setCurrent: (accountId: string | null) => void;
  projects: Project[];
  /** Null means "Todos os projetos". */
  project: Project | null;
  setProject: (projectId: string | null) => void;
  /** True when something of this account belongs to the current scope (project and account). */
  matches: (accountId: string | null | undefined) => boolean;
  /** Same as `matches`, for things that also carry the project name (carousels). */
  matchesContent: (content: { accountId: string | null | undefined; project?: string | null }) => boolean;
  reload: () => Promise<void>;
  loading: boolean;
}

const AccountScopeContext = createContext<AccountScope | null>(null);

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function store(key: string, value: string | null): void {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // The current scope is a per-browser convenience; everything works with "Todas".
  }
}

/** "Projeto" and "Conta atual": picked once at the top and followed by every screen. */
export function AccountScopeProvider({ children }: { children: ReactNode }) {
  const accounts = useAccounts();
  const projects = useProjects();
  const [currentId, setCurrentId] = useState<string | null>(() => readStored(ACCOUNT_KEY));
  const [projectId, setProjectId] = useState<string | null>(() => readStored(PROJECT_KEY));
  const project = projects.data.find((item) => item.id === projectId) ?? null;
  const inProject = useCallback((account: Account) => !project || sameProject(account.project, project.name), [project]);
  const picked = accounts.data.find((account) => account.id === currentId) ?? null;
  // An account of another project is not "current" while a project is picked.
  const current = picked && inProject(picked) ? picked : null;

  const setCurrent = useCallback((accountId: string | null) => {
    setCurrentId(accountId);
    store(ACCOUNT_KEY, accountId);
  }, []);

  const setProject = useCallback((id: string | null) => {
    setProjectId(id);
    store(PROJECT_KEY, id);
  }, []);

  const reloadAll = accounts.reload;
  const reloadProjects = projects.reload;
  const reload = useCallback(async () => {
    await Promise.all([reloadAll(), reloadProjects()]);
  }, [reloadAll, reloadProjects]);

  const value = useMemo<AccountScope>(() => {
    const projectAccountIds = new Set(accounts.data.filter(inProject).map((account) => account.id));
    const matches = (accountId: string | null | undefined) => {
      if (current) return accountId === current.id;
      if (!project) return true;
      return Boolean(accountId && projectAccountIds.has(accountId));
    };
    return {
      accounts: accounts.data,
      active: accounts.data.filter((account) => isActiveAccount(account) && inProject(account)),
      current,
      setCurrent,
      projects: projects.data,
      project,
      setProject,
      matches,
      matchesContent: ({ accountId, project: name }) => {
        if (current || !project) return matches(accountId);
        return matches(accountId) || Boolean(name && sameProject(name, project.name));
      },
      reload,
      loading: accounts.loading || projects.loading,
    };
  }, [accounts.data, accounts.loading, projects.data, projects.loading, current, project, inProject, setCurrent, setProject, reload]);

  return <AccountScopeContext.Provider value={value}>{children}</AccountScopeContext.Provider>;
}

export function useAccountScope(): AccountScope {
  const scope = useContext(AccountScopeContext);
  if (!scope) throw new Error('useAccountScope fora do AccountScopeProvider.');
  return scope;
}
