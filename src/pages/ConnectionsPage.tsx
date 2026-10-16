import { AlertTriangle, CheckCircle2, ExternalLink, Link2, PlugZap, RefreshCw, Unplug } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAccountScope } from '../app/accountScope';
import { errorMessage } from '../app/useResource';
import { useConnections, type ConfigState } from '../connections/useConnections';
import { accountLabel } from '../domain/account';
import {
  CONNECTION_STATUS_INFO,
  daysUntilExpiry,
  expiresSoon,
  needsReconnect,
  PLATFORM_SETUP_INFO,
  readConnectionNotice,
  SYNC_STATUS_LABELS,
  timeAgo,
  type SocialConnection,
} from '../domain/social/connection';
import { SOCIAL_PLATFORM_LABELS, SOCIAL_PLATFORMS, type SocialPlatform } from '../domain/social/publication';
import { Alert, Badge, Button, Dialog, EmptyState, PageHeader, Select, Spinner } from '../ui/primitives';

export function ConnectionsPage() {
  const { social, config, connections, runs, loading, error, setError, reload } = useConnections();
  const scope = useAccountScope();
  const location = useLocation();
  const navigate = useNavigate();
  const notice = useMemo(() => readConnectionNotice(location.search), [location.search]);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<SocialConnection | null>(null);
  const now = new Date();

  // The callback query is read once, then cleaned so a reload does not show it again.
  useEffect(() => {
    if (notice) navigate('/conexoes', { replace: true, state: { notice } });
  }, [notice, navigate]);
  const shownNotice = notice ?? (location.state as { notice?: ReturnType<typeof readConnectionNotice> } | null)?.notice ?? null;

  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    setMessage(null);
    try {
      await action();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  const connect = (platform: SocialPlatform) =>
    run(`connect:${platform}`, async () => {
      window.location.assign(await social.startConnection(platform, scope.project?.id ?? null));
    });

  const sync = (connection: SocialConnection) =>
    run(`sync:${connection.id}`, async () => {
      const result = await social.sync(connection.id);
      setMessage(result.error ? `${SYNC_STATUS_LABELS[result.status]}: ${result.error}` : `Sincronizado: ${result.publications} ${result.publications === 1 ? 'post lido' : 'posts lidos'}.`);
      await reload();
    });

  const relink = (connection: SocialConnection, links: { accountId: string | null; projectId: string | null }) =>
    run(`link:${connection.id}`, async () => {
      await social.updateLinks(connection.id, links);
      await reload();
    });

  const visible = connections.filter((connection) => !scope.project || connection.projectId === scope.project.id);
  const hiddenCount = connections.length - visible.length;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Contas conectadas" description="Instagram, páginas do Facebook e TikTok pelos logins oficiais. A Fábrica nunca pede nem guarda a sua senha das redes." />

      <div className="mb-6 flex flex-col gap-3 empty:hidden">
        {shownNotice?.ok && (
          <Alert tone="success">
            {shownNotice.count > 1 ? `${shownNotice.count} contas conectadas` : 'Conta conectada'}
            {shownNotice.platform ? ` no ${SOCIAL_PLATFORM_LABELS[shownNotice.platform]}` : ''}. Clica em "Sincronizar agora" pra ler os posts.
          </Alert>
        )}
        {shownNotice && !shownNotice.ok && <Alert>Não conectou{shownNotice.platform ? ` o ${SOCIAL_PLATFORM_LABELS[shownNotice.platform]}` : ''}: {shownNotice.reason ?? 'tenta de novo.'}</Alert>}
        {message && <Alert tone="info">{message}</Alert>}
        {error && <Alert>{error}</Alert>}
      </div>

      <ConfigNotice state={config} />

      <section aria-labelledby="networks-title" className="mb-10">
        <h2 id="networks-title" className="mb-3 text-xs font-semibold uppercase tracking-wider text-faint">
          Conectar uma conta{scope.project ? ` de ${scope.project.name}` : ''}
        </h2>
        <ul className="grid gap-3 md:grid-cols-3">
          {SOCIAL_PLATFORMS.map((platform) => (
            <li key={platform}>
              <PlatformCard platform={platform} config={config} busy={busy === `connect:${platform}`} onConnect={() => void connect(platform)} />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="connected-title">
        <h2 id="connected-title" className="mb-3 text-xs font-semibold uppercase tracking-wider text-faint">
          Conectadas
        </h2>
        {!loading && hiddenCount > 0 && scope.project && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-subtle px-4 py-3 text-sm text-muted">
            <span>
              Mostrando só as de {scope.project.name}. {hiddenCount === 1 ? 'Outra conta está' : `Outras ${hiddenCount} contas estão`} em outros projetos ou sem projeto.
            </span>
            <Button variant="secondary" size="sm" onClick={() => scope.setProject(null)}>
              Ver todas
            </Button>
          </div>
        )}
        {loading ? (
          <Spinner />
        ) : visible.length === 0 ? (
          <EmptyState
            title={hiddenCount > 0 ? `Nenhuma conta conectada em ${scope.project?.name ?? 'neste projeto'}` : 'Nenhuma conta conectada ainda'}
            description={social.available ? 'Conecta uma conta acima. As métricas só aparecem no Painel depois da primeira sincronização.' : 'No modo local não há conexões. As métricas lançadas à mão continuam no Painel.'}
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {visible.map((connection) => {
              const lastRuns = runs.filter((item) => item.connectionId === connection.id).slice(0, 3);
              return (
                <li key={connection.id}>
                  <ConnectionCard
                    connection={connection}
                    now={now}
                    lastRuns={lastRuns}
                    busy={busy}
                    accounts={scope.accounts.filter((account) => account.platform === connection.platform || connection.platform === 'facebook')}
                    projects={scope.projects}
                    onSync={() => void sync(connection)}
                    onReconnect={() => void connect(connection.platform)}
                    onDisconnect={() => setDisconnecting(connection)}
                    onRelink={(links) => void relink(connection, links)}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {disconnecting && (
        <DisconnectDialog
          connection={disconnecting}
          onClose={() => setDisconnecting(null)}
          onConfirm={(deleteData) =>
            run(`disconnect:${disconnecting.id}`, async () => {
              await social.disconnect(disconnecting.id, deleteData);
              setDisconnecting(null);
              setMessage(deleteData ? 'Conta desconectada e posts sincronizados apagados.' : 'Conta desconectada. Os posts já lidos continuam no histórico.');
              await reload();
            })
          }
          busy={busy === `disconnect:${disconnecting.id}`}
        />
      )}
    </div>
  );
}

function ConfigNotice({ state }: { state: ConfigState }) {
  if (state.kind === 'local')
    return (
      <div className="mb-8">
        <Alert tone="info">
          Você está no modo local (dados só neste navegador). As conexões oficiais precisam do modo com login, onde os tokens ficam criptografados no servidor. O passo a passo está em docs/fabrica-2.md.
        </Alert>
      </div>
    );
  if (state.kind === 'missing')
    return (
      <div className="mb-8">
        <Alert tone="info">Configuração pendente: {state.message} As funções social-oauth e social-sync precisam ser publicadas (docs/fabrica-2.md).</Alert>
      </div>
    );
  return null;
}

function PlatformCard({ platform, config, busy, onConnect }: { platform: SocialPlatform; config: ConfigState; busy: boolean; onConnect: () => void }) {
  const info = PLATFORM_SETUP_INFO[platform];
  const setup = config.kind === 'ready' ? config.config[platform] : null;
  const status = config.kind === 'loading' ? 'loading' : setup?.configured ? 'ready' : 'pending';

  return (
    <article className="flex h-full flex-col rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">{SOCIAL_PLATFORM_LABELS[platform]}</h3>
        {status === 'ready' && <Badge tone="success">Pronto para conectar</Badge>}
        {status === 'pending' && <Badge tone="warning">Configuração pendente</Badge>}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted">{info.reads}</p>
      <details className="mt-3 text-xs text-muted">
        <summary className="cursor-pointer select-none font-medium text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">O que precisa</summary>
        <p className="mt-2 leading-relaxed">{info.requires}</p>
        {setup && setup.missing.length > 0 && <p className="mt-2">Faltam no Supabase: <code className="break-all text-ink">{setup.missing.join(', ')}</code></p>}
        {config.kind === 'ready' && (
          <p className="mt-2">
            URL de retorno para cadastrar no app: <code className="break-all text-ink">{config.config.redirectUris[platform]}</code>
          </p>
        )}
        <a href={info.docs} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-accent hover:underline">
          Documentação oficial <ExternalLink className="size-3" aria-hidden />
        </a>
      </details>
      <div className="mt-auto pt-4">
        <Button variant={status === 'ready' ? 'primary' : 'secondary'} size="sm" className="w-full" loading={busy} disabled={status !== 'ready'} onClick={onConnect}>
          <PlugZap className="size-4" aria-hidden /> Conectar {SOCIAL_PLATFORM_LABELS[platform]}
        </Button>
      </div>
    </article>
  );
}

interface ConnectionCardProps {
  connection: SocialConnection;
  now: Date;
  lastRuns: ReturnType<typeof useConnections>['runs'];
  busy: string | null;
  accounts: ReturnType<typeof useAccountScope>['accounts'];
  projects: ReturnType<typeof useAccountScope>['projects'];
  onSync: () => void;
  onReconnect: () => void;
  onDisconnect: () => void;
  onRelink: (links: { accountId: string | null; projectId: string | null }) => void;
}

function ConnectionCard({ connection, now, lastRuns, busy, accounts, projects, onSync, onReconnect, onDisconnect, onRelink }: ConnectionCardProps) {
  const status = CONNECTION_STATUS_INFO[connection.status];
  const soon = expiresSoon(connection, now);
  const days = daysUntilExpiry(connection, now);
  const name = connection.username ? `@${connection.username}` : connection.displayName || connection.externalId;

  return (
    <article className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start gap-4">
        {connection.avatarUrl ? (
          <img src={connection.avatarUrl} alt="" width={44} height={44} className="size-11 rounded-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
        ) : (
          <span className="grid size-11 place-items-center rounded-full bg-subtle text-sm font-semibold text-muted" aria-hidden>
            {name.replace('@', '').slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-ink">{name}</h3>
            <Badge>{SOCIAL_PLATFORM_LABELS[connection.platform]}</Badge>
            <Badge tone={status.tone}>{status.label}</Badge>
            {soon && <Badge tone="warning">Autorização vence em {days} {days === 1 ? 'dia' : 'dias'}</Badge>}
          </div>
          {connection.displayName && connection.username && <p className="truncate text-xs text-muted">{connection.displayName}</p>}
          <p className="mt-1 text-xs text-muted">
            Última sincronização: {timeAgo(connection.lastSyncAt, now)}
            {connection.rateLimit?.percent != null && ` · cota da API usada: ${connection.rateLimit.percent}%`}
            {connection.rateLimit?.limited && ' · limite atingido na última leitura'}
          </p>
          {connection.lastError && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {connection.lastError}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {needsReconnect(connection) || soon ? (
            <Button variant="primary" size="sm" onClick={onReconnect} loading={busy === `connect:${connection.platform}`}>
              <Link2 className="size-3.5" aria-hidden /> Reconectar
            </Button>
          ) : (
            <Button variant="secondary" size="sm" onClick={onSync} loading={busy === `sync:${connection.id}`} disabled={connection.status !== 'connected'}>
              <RefreshCw className="size-3.5" aria-hidden /> Sincronizar agora
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onDisconnect} aria-label={`Desconectar ${name}`}>
            <Unplug className="size-3.5" aria-hidden /> Desconectar
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Projeto
          <Select value={connection.projectId ?? ''} disabled={busy === `link:${connection.id}`} onChange={(e) => onRelink({ accountId: connection.accountId, projectId: e.target.value || null })}>
            <option value="">Sem projeto</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Conta da Fábrica (cabeçalho dos slides)
          <Select value={connection.accountId ?? ''} disabled={busy === `link:${connection.id}`} onChange={(e) => onRelink({ accountId: e.target.value || null, projectId: connection.projectId })}>
            <option value="">Nenhuma</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {accountLabel(account)}
              </option>
            ))}
          </Select>
        </label>
      </div>

      <details className="mt-3 text-xs text-muted">
        <summary className="cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">Permissões e histórico</summary>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {connection.scopes.length ? connection.scopes.map((scope) => <Badge key={scope}>{scope}</Badge>) : <span>A rede não informou as permissões concedidas.</span>}
        </div>
        <ul className="mt-3 flex flex-col gap-1">
          {lastRuns.length === 0 && <li>Nenhuma sincronização ainda.</li>}
          {lastRuns.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-2">
              {item.status === 'ok' ? <CheckCircle2 className="size-3.5 text-emerald-600" aria-hidden /> : <AlertTriangle className="size-3.5 text-amber-600" aria-hidden />}
              {new Date(item.startedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} · {item.trigger === 'manual' ? 'manual' : 'agendada'} · {SYNC_STATUS_LABELS[item.status]} · {item.publications} posts
              {item.error && <span className="text-faint">({item.error})</span>}
            </li>
          ))}
        </ul>
      </details>
    </article>
  );
}

function DisconnectDialog({ connection, onClose, onConfirm, busy }: { connection: SocialConnection; onClose: () => void; onConfirm: (deleteData: boolean) => void; busy: boolean }) {
  const [deleteData, setDeleteData] = useState(false);
  return (
    <Dialog
      open
      title="Desconectar conta"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="primary" loading={busy} onClick={() => onConfirm(deleteData)}>
            Desconectar
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted">
        Os tokens de @{connection.username || connection.externalId} são apagados do servidor e a Fábrica para de ler essa conta.
        {connection.platform === 'tiktok' ? ' O TikTok também é avisado para revogar o acesso.' : ' Para encerrar o acesso também na Meta, remova o app em Configurações > Apps e sites da conta.'}
      </p>
      <label className="mt-4 flex items-start gap-2 text-sm text-ink">
        <input type="checkbox" checked={deleteData} onChange={(e) => setDeleteData(e.target.checked)} className="mt-1 size-4 accent-[var(--accent)]" />
        Apagar também os posts e métricas sincronizados dessa conta (não dá pra desfazer).
      </label>
    </Dialog>
  );
}
