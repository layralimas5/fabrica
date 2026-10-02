import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { isActiveAccount, type Account } from '../domain/account';
import { useAccounts } from './data';

const STORAGE_KEY = 'fabrica:current-account';

interface AccountScope {
  /** Every account, paused ones included (history and analytics still show them). */
  accounts: Account[];
  /** Accounts offered in pickers: the active ones. */
  active: Account[];
  /** Null means "Todas as contas". */
  current: Account | null;
  setCurrent: (accountId: string | null) => void;
  /** True when something of this account belongs to the current scope. */
  matches: (accountId: string | null | undefined) => boolean;
  reload: () => Promise<void>;
  loading: boolean;
}

const AccountScopeContext = createContext<AccountScope | null>(null);

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function store(accountId: string | null): void {
  try {
    if (accountId) localStorage.setItem(STORAGE_KEY, accountId);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // The current account is a per-browser convenience; everything works with "Todas".
  }
}

/** "Conta atual": picked once at the top and followed by every screen. */
export function AccountScopeProvider({ children }: { children: ReactNode }) {
  const accounts = useAccounts();
  const [currentId, setCurrentId] = useState<string | null>(readStored);
  const current = accounts.data.find((account) => account.id === currentId) ?? null;

  const setCurrent = useCallback((accountId: string | null) => {
    setCurrentId(accountId);
    store(accountId);
  }, []);

  const value = useMemo<AccountScope>(
    () => ({
      accounts: accounts.data,
      active: accounts.data.filter(isActiveAccount),
      current,
      setCurrent,
      matches: (accountId) => !current || accountId === current.id,
      reload: accounts.reload,
      loading: accounts.loading,
    }),
    [accounts.data, accounts.reload, accounts.loading, current, setCurrent],
  );

  return <AccountScopeContext.Provider value={value}>{children}</AccountScopeContext.Provider>;
}

export function useAccountScope(): AccountScope {
  const scope = useContext(AccountScopeContext);
  if (!scope) throw new Error('useAccountScope fora do AccountScopeProvider.');
  return scope;
}

