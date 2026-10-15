import { useState } from 'react';
import { errorMessage } from '../app/useResource';
import { GROUP_POLICIES, GROUP_POLICY_LABELS, sanitizeGroupInput, validateGroup, type FacebookGroup, type FacebookGroupInput, type GroupPolicy } from '../domain/groups/groups';
import type { Project } from '../domain/project';
import { Alert, Button, Dialog, Field, Input, Select, Textarea } from '../ui/primitives';

interface Props {
  initial: FacebookGroupInput;
  editing: FacebookGroup | null;
  projects: Project[];
  onClose: () => void;
  onSave: (input: FacebookGroupInput) => Promise<void>;
  onDelete?: () => Promise<void>;
}

export function GroupDialog({ initial, editing, projects, onClose, onSave, onDelete }: Props) {
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<FacebookGroupInput>) => setDraft((current) => ({ ...current, ...patch }));

  const save = async () => {
    const clean = sanitizeGroupInput(draft);
    const problem = validateGroup(clean);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      await onSave(clean);
    } catch (cause) {
      setError(errorMessage(cause));
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      size="lg"
      title={editing ? `Editar ${editing.name}` : 'Novo grupo'}
      onClose={onClose}
      footer={
        <>
          {onDelete && (
            <Button
              variant="danger"
              className="mr-auto"
              disabled={busy}
              onClick={() => window.confirm('Excluir o grupo e o histórico de divulgações nele?') && void onDelete().catch((cause: unknown) => setError(errorMessage(cause)))}
            >
              Excluir
            </Button>
          )}
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="primary" loading={busy} onClick={() => void save()}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome do grupo" htmlFor="group-name">
          <Input id="group-name" value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="Mochileiras do Brasil" />
        </Field>
        <Field label="Endereço" htmlFor="group-url">
          <Input id="group-url" type="url" value={draft.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://www.facebook.com/groups/..." />
        </Field>
        <Field label="Categoria" htmlFor="group-category">
          <Input id="group-category" value={draft.category} onChange={(e) => set({ category: e.target.value })} placeholder="Viagem solo, mochilão, intercâmbio…" />
        </Field>
        <Field label="Tema (vira a abertura do texto)" htmlFor="group-theme">
          <Input id="group-theme" value={draft.theme} onChange={(e) => set({ theme: e.target.value })} placeholder="viagem solo feminina" />
        </Field>
        <Field label="Projeto" htmlFor="group-project">
          <Select id="group-project" value={draft.projectId ?? ''} onChange={(e) => set({ projectId: e.target.value || null })}>
            <option value="">Sem projeto</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Divulgação" htmlFor="group-policy">
          <Select id="group-policy" value={draft.policy} onChange={(e) => set({ policy: e.target.value as GroupPolicy })}>
            {GROUP_POLICIES.map((policy) => (
              <option key={policy} value={policy}>
                {GROUP_POLICY_LABELS[policy]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Regras de divulgação do grupo" htmlFor="group-rules" className="sm:col-span-2" hint="Cola as regras como os admins escreveram. Elas aparecem ao lado de cada versão.">
          <Textarea id="group-rules" rows={3} value={draft.rules} onChange={(e) => set({ rules: e.target.value })} />
        </Field>
        <Field label="Dias mínimos entre posts nossos" htmlFor="group-days">
          <Input id="group-days" type="number" min={1} max={90} value={draft.minDaysBetween} onChange={(e) => set({ minDaysBetween: Number(e.target.value) })} />
        </Field>
        <label className="flex items-center gap-2 self-end pb-2 text-sm text-ink">
          <input type="checkbox" checked={draft.linkInComments} onChange={(e) => set({ linkInComments: e.target.checked })} className="size-4 accent-[var(--accent)]" />
          Link só nos comentários
        </label>
        <Field label="Observações" htmlFor="group-notes" className="sm:col-span-2">
          <Textarea id="group-notes" rows={2} value={draft.notes} onChange={(e) => set({ notes: e.target.value })} />
        </Field>
        {editing && (
          <label className="flex items-center gap-2 text-sm text-muted sm:col-span-2">
            <input type="checkbox" checked={draft.archived} onChange={(e) => set({ archived: e.target.checked })} className="size-4 accent-[var(--accent)]" />
            Arquivar (sai da seleção, o histórico fica)
          </label>
        )}
      </div>
      {error && (
        <div className="mt-4">
          <Alert>{error}</Alert>
        </div>
      )}
    </Dialog>
  );
}
