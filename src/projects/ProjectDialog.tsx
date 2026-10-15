import { useState } from 'react';
import { errorMessage } from '../app/useResource';
import type { BrandKit } from '../domain/brandKit';
import { CONVERSION_GOAL_LABELS, CONVERSION_GOALS, PROJECT_LIMITS, type ConversionGoal, type Project, type ProjectInput } from '../domain/project';
import { Alert, Button, Dialog, Field, Input, Select, Textarea } from '../ui/primitives';

interface Props {
  initial: ProjectInput;
  editing: Project | null;
  brands: BrandKit[];
  onClose: () => void;
  onSave: (input: ProjectInput) => Promise<void>;
  onDelete?: () => Promise<void>;
}

export function ProjectDialog({ initial, editing, brands, onClose, onSave, onDelete }: Props) {
  const [input, setInput] = useState<ProjectInput>(initial);
  const [origins, setOrigins] = useState(initial.allowedOrigins.join('\n'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<ProjectInput>) => setInput((current) => ({ ...current, ...patch }));

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(errorMessage(cause));
      setBusy(false);
    }
  };

  const remove = () => {
    if (!onDelete || !editing) return;
    if (!window.confirm(`Excluir o projeto ${editing.name}? As contas e os conteúdos continuam, só deixam de estar ligados a ele. Os links rastreáveis e os eventos de conversão do projeto são apagados.`)) return;
    void run(onDelete);
  };

  return (
    <Dialog
      open
      size="lg"
      title={editing ? `Editar ${editing.name}` : 'Novo projeto'}
      onClose={onClose}
      footer={
        <>
          {onDelete && (
            <Button variant="danger" className="mr-auto" disabled={busy} onClick={remove}>
              Excluir projeto
            </Button>
          )}
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="primary" loading={busy} onClick={() => void run(() => onSave({ ...input, allowedOrigins: origins.split(/\s+/).filter(Boolean) }))}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome" htmlFor="project-name" hint={editing ? 'Renomear muda o projeto em todas as contas e carrosséis dele.' : undefined}>
          <Input id="project-name" value={input.name} maxLength={PROJECT_LIMITS.name} onChange={(e) => set({ name: e.target.value })} placeholder="Momentumm" />
        </Field>
        <Field label="Cor" htmlFor="project-color">
          <div className="flex items-center gap-2">
            <input id="project-color" type="color" value={input.color} onChange={(e) => set({ color: e.target.value })} className="h-10 w-14 cursor-pointer rounded-lg border border-line bg-surface p-1" />
            <span className="text-sm text-muted">{input.color}</span>
          </div>
        </Field>
        <Field label="Descrição" htmlFor="project-description" className="sm:col-span-2">
          <Textarea id="project-description" rows={2} value={input.description} maxLength={PROJECT_LIMITS.description} onChange={(e) => set({ description: e.target.value })} />
        </Field>
        <Field label="Landing page" htmlFor="project-landing" hint="Pra onde os links rastreáveis levam.">
          <Input id="project-landing" type="url" inputMode="url" value={input.landingUrl} onChange={(e) => set({ landingUrl: e.target.value })} placeholder="https://…" />
        </Field>
        <Field label="Objetivo de conversão" htmlFor="project-goal">
          <Select id="project-goal" value={input.conversionGoal} onChange={(e) => set({ conversionGoal: e.target.value as ConversionGoal })}>
            {CONVERSION_GOALS.map((goal) => (
              <option key={goal} value={goal}>
                {CONVERSION_GOAL_LABELS[goal]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Identidade visual (Brand Kit)" htmlFor="project-brand">
          <Select id="project-brand" value={input.brandKitId ?? ''} onChange={(e) => set({ brandKitId: e.target.value || null })}>
            <option value="">Nenhuma</option>
            {brands.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status" htmlFor="project-status">
          <Select id="project-status" value={input.status} onChange={(e) => set({ status: e.target.value === 'paused' ? 'paused' : 'active' })}>
            <option value="active">Ativo</option>
            <option value="paused">Pausado</option>
          </Select>
        </Field>
        <Field
          label="Sites que podem enviar eventos"
          htmlFor="project-origins"
          hint="Um por linha (ex.: https://app.momentumm.com). A landing page já entra sozinha. Eventos de outros sites são recusados."
          className="sm:col-span-2"
        >
          <Textarea id="project-origins" rows={2} value={origins} onChange={(e) => setOrigins(e.target.value)} placeholder="https://quiz.momentumm.com" />
        </Field>
      </div>
      {error && (
        <div className="mt-4">
          <Alert>{error}</Alert>
        </div>
      )}
    </Dialog>
  );
}
