import { Download, LogOut, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { useServices, useSession } from '../app/services';
import { errorMessage } from '../app/useResource';
import type { BackupService } from '../application/ports';
import { Alert, Badge, Button, PageHeader } from '../ui/primitives';

export function SettingsPage() {
  const { auth, ai, backup } = useServices();
  const { user } = useSession();
  const [error, setError] = useState<string | null>(null);

  const rows = [
    { label: 'Onde os dados ficam', value: auth.mode === 'supabase' ? `Nuvem (Supabase) · ${user?.email ?? '—'}` : 'Neste navegador, neste endereço' },
    { label: 'Motor de IA', value: ai.engine === 'claude' ? 'Claude (Anthropic)' : 'Local, sem IA generativa' },
    { label: 'Proporções', value: '4:5, 3:4, 1:1 e 9:16, escolhidas em cada carrossel' },
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

      {backup && <BackupSection backup={backup} />}
      {ai.engine === 'heuristic' && auth.mode === 'supabase' && <Badge tone="warning">IA local ativa (VITE_AI_ENGINE=heuristic)</Badge>}

      {auth.mode === 'supabase' && (
        <div className="mt-8">
          <Button variant="secondary" onClick={() => auth.signOut().catch((cause: unknown) => setError(errorMessage(cause)))}>
            <LogOut className="size-4" aria-hidden /> Sair
          </Button>
          {error && <div className="mt-3"><Alert>{error}</Alert></div>}
        </div>
      )}
    </div>
  );
}

function BackupSection({ backup }: { backup: BackupService }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'export' | 'import' | null>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const download = async () => {
    setBusy('export');
    setMessage(null);
    try {
      const blob = await backup.exportAll();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `fabrica-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage({ tone: 'success', text: 'Backup baixado. Guarda esse arquivo num lugar seguro (Drive, OneDrive).' });
    } catch (cause) {
      setMessage({ tone: 'error', text: errorMessage(cause) });
    } finally {
      setBusy(null);
    }
  };

  const restore = async (file: File | undefined) => {
    if (!file) return;
    setBusy('import');
    setMessage(null);
    try {
      const summary = await backup.importAll(file);
      setMessage({
        tone: 'success',
        text: `Restaurado: ${summary.presets} predefinições, ${summary.accounts} contas, ${summary.brandKits} marcas, ${summary.assets} fotos e ${summary.carousels} carrosséis. Recarregando…`,
      });
      setTimeout(() => window.location.reload(), 1200);
    } catch (cause) {
      setMessage({ tone: 'error', text: errorMessage(cause) });
      setBusy(null);
    }
  };

  return (
    <section aria-labelledby="backup-title" className="mt-6 rounded-2xl border border-line bg-surface p-5">
      <h2 id="backup-title" className="text-sm font-semibold text-ink">Backup</h2>
      <p className="mt-1 text-sm text-muted">
        Tudo fica salvo neste navegador, sem login. Baixe um backup de vez em quando: com ele você recupera predefinições, contas, marcas, fotos e carrosséis em outro navegador, outro computador
        ou outro endereço da Fábrica. Limpar os dados do navegador apaga o que não estiver no backup.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="primary" loading={busy === 'export'} disabled={busy !== null} onClick={() => void download()}>
          {busy !== 'export' && <Download className="size-4" aria-hidden />} Baixar backup
        </Button>
        <Button variant="secondary" loading={busy === 'import'} disabled={busy !== null} onClick={() => fileInput.current?.click()}>
          {busy !== 'import' && <Upload className="size-4" aria-hidden />} Restaurar backup
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          aria-label="Arquivo de backup da Fábrica"
          onChange={(event) => {
            void restore(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
      </div>
      <p className="mt-3 text-xs text-faint">Restaurar soma o backup ao que já existe aqui; itens iguais ficam com a versão do backup.</p>
      {message && <div className="mt-3"><Alert tone={message.tone}>{message.text}</Alert></div>}
    </section>
  );
}
