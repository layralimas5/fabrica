import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Services, User } from '../application/ports';

const ServicesContext = createContext<Services | null>(null);
const SessionContext = createContext<{ user: User | null; loading: boolean }>({ user: null, loading: true });

export function AppProviders({ services, children }: { services: Services; children: ReactNode }) {
  const [session, setSession] = useState<{ user: User | null; loading: boolean }>({ user: null, loading: true });

  useEffect(() => {
    let active = true;
    services.auth
      .currentUser()
      .then((user) => active && setSession({ user, loading: false }))
      .catch((error: unknown) => {
        console.error('Falha ao ler a sessão', error);
        if (active) setSession({ user: null, loading: false });
      });
    const unsubscribe = services.auth.onChange((user) => setSession({ user, loading: false }));
    return () => {
      active = false;
      unsubscribe();
    };
  }, [services]);

  return (
    <ServicesContext.Provider value={services}>
      <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
    </ServicesContext.Provider>
  );
}

export function useServices(): Services {
  const services = useContext(ServicesContext);
  if (!services) throw new Error('useServices fora do AppProviders.');
  return services;
}

export function useSession() {
  return useContext(SessionContext);
}
