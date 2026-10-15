import { KeyRound, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { TrackingService } from '../application/ports';
import { errorMessage } from '../app/useResource';
import type { Project } from '../domain/project';
import { Alert, Button } from '../ui/primitives';
import { CopyField } from './CopyField';

/** How to install the snippet on the landing page, quiz and app, and how the app's server confirms conversions. */
export function InstallGuide({ project, tracking, onEventsDeleted }: { project: Project; tracking: TrackingService; onEventsDeleted: () => void }) {
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState<'secret' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const endpoint = tracking.endpoint ?? 'https://<projeto>.supabase.co/functions/v1/track';
  const snippet = `<script src="${tracking.shortLinkBase}/t.js"\n  data-key="${project.trackingKey}"\n  data-endpoint="${endpoint}"\n  data-consent="required"\n  data-decorate="${project.landingUrl ? new URL(project.landingUrl).hostname : 'app.seudominio.com'}"\n  async></script>`;
  const events = `<script>\n  // No banner de cookies, quando a pessoa aceitar:\n  fabrica.consent(true);\n  // No quiz:\n  fabrica.track('quiz_start');\n  fabrica.track('quiz_complete');\n  // No cadastro, envie a origem junto com o formulário para o seu servidor:\n  const origem = fabrica.attribution();\n</script>`;
  const server = `// No servidor do app, depois de criar a conta (nunca no navegador):\nawait fetch('${endpoint}/event', {\n  method: 'POST',\n  headers: { 'Content-Type': 'application/json', 'x-fabrica-secret': process.env.FABRICA_SECRET },\n  body: JSON.stringify({\n    key: '${project.trackingKey}',\n    events: [{ id: crypto.randomUUID(), name: 'signup', occurredAt: new Date().toISOString(),\n      consent: origem.visitorId !== null, visitorId: origem.visitorId,\n      firstTouch: origem.firstTouch, lastTouch: origem.lastTouch }],\n  }),\n});`;

  const rotate = async () => {
    if (secret === null && !window.confirm('Gerar um segredo novo? O anterior para de funcionar na hora.')) return;
    setBusy('secret');
    setError(null);
    try {
      setSecret(await tracking.rotateSecret(project.id));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  const removeEvents = async () => {
    if (!window.confirm(`Apagar todos os eventos rastreados de ${project.name}? Os links continuam. Não dá pra desfazer.`)) return;
    setBusy('delete');
    setError(null);
    try {
      await tracking.deleteEvents(project.id);
      onEventsDeleted();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-5 text-sm">
      {!tracking.available && <Alert tone="info">No modo local os links funcionam com UTM, mas nenhum evento chega: a função track roda no Supabase.</Alert>}
      <ol className="flex list-decimal flex-col gap-5 pl-5 marker:text-faint">
        <li>
          <p className="mb-2 text-muted">Cole antes de &lt;/body&gt; na landing page, no quiz e no app. No quiz e no app, troque para <code>data-pageview="off"</code> pra não contar como visita à LP.</p>
          <CopyField label="Snippet" value={snippet} multiline />
        </li>
        <li>
          <p className="mb-2 text-muted">
            Sem consentimento os eventos contam, mas anônimos (sem id de visitante e nada guardado no navegador). Com <code>fabrica.consent(true)</code>, a mesma pessoa conta uma vez por etapa e a origem acompanha
            até o cadastro.
          </p>
          <CopyField label="Eventos do quiz e do cadastro" value={events} multiline />
        </li>
        <li>
          <p className="mb-2 text-muted">Cadastro, teste grátis e assinatura confirmados vêm do servidor do app, com o segredo do projeto. Ele fica só nas variáveis de ambiente do app (FABRICA_SECRET), nunca no navegador.</p>
          <CopyField label="Evento do servidor" value={server} multiline />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" loading={busy === 'secret'} onClick={() => void rotate()} disabled={!tracking.available}>
              <KeyRound className="size-3.5" aria-hidden /> {secret ? 'Gerar outro segredo' : 'Gerar segredo do servidor'}
            </Button>
          </div>
          {secret && (
            <div className="mt-3">
              <Alert tone="success">Guarde agora: o segredo aparece só desta vez.</Alert>
              <div className="mt-2">
                <CopyField label="FABRICA_SECRET" value={secret} />
              </div>
            </div>
          )}
        </li>
      </ol>
      <div className="border-t border-line pt-4">
        <p className="text-xs text-muted">Privacidade: nada de IP, e-mail, nome ou query string é guardado. Eventos com mais de 13 meses são apagados automaticamente.</p>
        <Button variant="danger" size="sm" className="mt-2" loading={busy === 'delete'} disabled={!tracking.available} onClick={() => void removeEvents()}>
          <Trash2 className="size-3.5" aria-hidden /> Apagar eventos de {project.name}
        </Button>
      </div>
      {error && <Alert>{error}</Alert>}
    </div>
  );
}
