import { LogOut } from 'lucide-react';
import { useState } from 'react';
import { useServices, useSession } from '../app/services';
import { errorMessage } from '../app/useResource';
import { Alert, Badge, Button, PageHeader } from '../ui/primitives';

export function SettingsPage() {
  const { auth, ai } = useServices();
  const { user } = useSession();
  const [error, setError] = useState<string | null>(null);

  const rows = [
    { label: 'Conta', value: user?.email ?? '—' },
    { label: 'Armazenamento', value: auth.mode === 'supabase' ? 'Supabase (nuvem)' : 'Neste navegador (modo demo)' },
    { label: 'Motor de IA', value: ai.engine === 'claude' ? 'Claude (Anthropic)' : 'Local, sem IA generativa' },
    { label: 'Formato de exportação', value: '1080×1350 (padrão) ou 1080×1920 por carrossel' },
  ];

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Configurações" />
      <dl className="divide-y divide-line rounded-2xl border border-line bg-surface">
        {rows.map((row) => (
          <div key={row.label} className="flex flex-wrap items-center justify-between gap-2 px-5 py-4">
            <dt className="text-sm text-muted">{row.label}</dt>
            <dd className="text-sm font-medium text-ink">{row.value}</dd>
          </div>
        ))}
      </dl>

      {auth.mode === 'demo' && (
        <div className="mt-4">
          <Alert tone="info">
            Modo demo: tudo fica salvo só neste navegador e a IA é local. Pra usar a Claude e acessar de qualquer lugar, conecta o Supabase (veja o README).
          </Alert>
        </div>
      )}
      {ai.engine === 'heuristic' && auth.mode === 'supabase' && <Badge tone="warning">IA local ativa (VITE_AI_ENGINE=heuristic)</Badge>}

      <div className="mt-8">
        <Button
          variant="secondary"
          onClick={() =>
            auth.signOut().catch((cause: unknown) => {
              setError(errorMessage(cause));
            })
          }
        >
          <LogOut className="size-4" aria-hidden /> Sair
        </Button>
        {error && <div className="mt-3"><Alert>{error}</Alert></div>}
      </div>
    </div>
  );
}
