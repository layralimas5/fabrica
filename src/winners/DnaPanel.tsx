import { Pencil, RefreshCw } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import {
  CTA_STYLE_LABELS,
  CTA_STYLES,
  narrativeLabel,
  PRODUCT_PLACEMENT_LABELS,
  PRODUCT_PLACEMENTS,
  RHYTHM_LABELS,
  RHYTHMS,
  TEXT_DENSITIES,
  TEXT_DENSITY_LABELS,
  type ContentDna,
} from '../domain/winners/dna';
import { HOOK_TYPE_LABELS, HOOK_TYPES, type ScriptBeat } from '../domain/winners/record';
import { Alert, Button, EmptyState, Field, Input, Select } from '../ui/primitives';

interface DnaPanelProps {
  dna: ContentDna | null;
  script: ScriptBeat[];
  onSave: (dna: ContentDna) => Promise<void>;
  onReanalyze: () => Promise<void>;
}

const MAX_FIELD = 200;

export function DnaPanel({ dna, script, onSave, onReanalyze }: DnaPanelProps) {
  const [editing, setEditing] = useState<ContentDna | null>(null);
  const [pending, setPending] = useState<'save' | 'analyze' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (kind: 'save' | 'analyze', task: () => Promise<void>) => {
    setPending(kind);
    setError(null);
    try {
      await task();
      setEditing(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setPending(null);
    }
  };

  const reanalyze = () => {
    if (dna?.source === 'edited' && !window.confirm('Você editou essa estrutura. Refazer a análise apaga suas mudanças. Continuar?')) return;
    void run('analyze', onReanalyze);
  };

  if (!dna) {
    return (
      <EmptyState
        title="Sem estrutura pra analisar"
        description={script.length ? 'Toca em analisar pra ler o DNA desse conteúdo.' : 'Edita o conteúdo e cola o roteiro (um slide ou cena por linha) pra ler o DNA.'}
        action={script.length ? <Button variant="primary" loading={pending === 'analyze'} onClick={reanalyze}>Analisar estrutura</Button> : undefined}
      />
    );
  }

  if (editing) return <DnaEditor dna={editing} onChange={setEditing} onCancel={() => setEditing(null)} onSave={() => void run('save', () => onSave({ ...editing, source: 'edited' }))} pending={pending === 'save'} error={error} />;

  const rows: [string, ReactNode][] = [
    ['Gancho', HOOK_TYPE_LABELS[dna.hookType]],
    ['Emoção', dna.emotion],
    ['Slides', dna.slideCount],
    ['Quantidade de texto', `${TEXT_DENSITY_LABELS[dna.textDensity]} (~${dna.avgWords} palavras/slide)`],
    ['Ritmo', RHYTHM_LABELS[dna.rhythm]],
    ['CTA', CTA_STYLE_LABELS[dna.cta]],
    ['Produto', PRODUCT_PLACEMENT_LABELS[dna.productPlacement]],
    ['Tom', dna.tone],
    ['Estilo de copy', dna.copyStyle],
    ['Conclusão', dna.conclusion],
    ...(dna.visualStyle ? ([['Estilo visual', dna.visualStyle]] as [string, ReactNode][]) : []),
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-faint">
          {dna.source === 'edited' ? 'Estrutura ajustada por você' : 'Análise automática da estrutura'} · {new Date(dna.analyzedAt).toLocaleDateString('pt-BR')}
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" loading={pending === 'analyze'} onClick={reanalyze} disabled={script.length === 0}>
            {pending !== 'analyze' && <RefreshCw className="size-3.5" aria-hidden />} Reanalisar
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setEditing(dna)}>
            <Pencil className="size-3.5" aria-hidden /> Ajustar
          </Button>
        </div>
      </div>
      {error && <Alert>{error}</Alert>}

      <div className="rounded-2xl bg-subtle p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-faint">Estrutura</p>
        <p className="mt-1 text-pretty text-base font-medium text-ink">{narrativeLabel(dna)}</p>
        <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-faint">Mecanismo de retenção</p>
        <p className="mt-1 text-sm text-ink">{dna.retention}</p>
      </div>

      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-3 border-b border-line pb-2">
            <dt className="text-xs text-muted">{label}</dt>
            <dd className="text-right text-sm font-medium text-ink">{value}</dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="dna-beats">
        <h3 id="dna-beats" className="mb-3 text-sm font-semibold text-ink">
          Estrutura do conteúdo
        </h3>
        <ol className="flex flex-col gap-2">
          {dna.beats.map((beat, index) => (
            <li key={index} className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-3 rounded-xl border border-line px-3.5 py-2.5">
              <span className="text-xs font-medium tabular-nums text-faint">Slide {index + 1}</span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">{beat.purpose}</p>
                {script[index] && <p className="mt-0.5 line-clamp-1 text-xs text-faint">{script[index].text}</p>}
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

interface DnaEditorProps {
  dna: ContentDna;
  onChange: (dna: ContentDna) => void;
  onCancel: () => void;
  onSave: () => void;
  pending: boolean;
  error: string | null;
}

function DnaEditor({ dna, onChange, onCancel, onSave, pending, error }: DnaEditorProps) {
  const set = (patch: Partial<ContentDna>) => onChange({ ...dna, ...patch });
  const text = (key: 'emotion' | 'tone' | 'copyStyle' | 'conclusion' | 'retention', label: string) => (
    <Field label={label} htmlFor={`dna-${key}`}>
      <Input id={`dna-${key}`} value={dna[key]} maxLength={MAX_FIELD} onChange={(e) => set({ [key]: e.target.value })} />
    </Field>
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Gancho" htmlFor="dna-hook">
          <Select id="dna-hook" value={dna.hookType} onChange={(e) => set({ hookType: e.target.value as ContentDna['hookType'] })}>
            {HOOK_TYPES.map((item) => (
              <option key={item} value={item}>
                {HOOK_TYPE_LABELS[item]}
              </option>
            ))}
          </Select>
        </Field>
        {text('emotion', 'Emoção principal')}
        <Field label="Estrutura" htmlFor="dna-narrative" hint="Separe as etapas com →" className="sm:col-span-2">
          <Input
            id="dna-narrative"
            value={dna.narrative.join(' → ')}
            maxLength={MAX_FIELD}
            onChange={(e) => set({ narrative: e.target.value.split(/\s*(?:→|->)\s*/).filter(Boolean) })}
          />
        </Field>
        <Field label="Quantidade de texto" htmlFor="dna-density">
          <Select id="dna-density" value={dna.textDensity} onChange={(e) => set({ textDensity: e.target.value as ContentDna['textDensity'] })}>
            {TEXT_DENSITIES.map((item) => (
              <option key={item} value={item}>
                {TEXT_DENSITY_LABELS[item]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Ritmo" htmlFor="dna-rhythm">
          <Select id="dna-rhythm" value={dna.rhythm} onChange={(e) => set({ rhythm: e.target.value as ContentDna['rhythm'] })}>
            {RHYTHMS.map((item) => (
              <option key={item} value={item}>
                {RHYTHM_LABELS[item]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="CTA" htmlFor="dna-cta">
          <Select id="dna-cta" value={dna.cta} onChange={(e) => set({ cta: e.target.value as ContentDna['cta'] })}>
            {CTA_STYLES.map((item) => (
              <option key={item} value={item}>
                {CTA_STYLE_LABELS[item]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Produto" htmlFor="dna-product">
          <Select id="dna-product" value={dna.productPlacement} onChange={(e) => set({ productPlacement: e.target.value as ContentDna['productPlacement'] })}>
            {PRODUCT_PLACEMENTS.map((item) => (
              <option key={item} value={item}>
                {PRODUCT_PLACEMENT_LABELS[item]}
              </option>
            ))}
          </Select>
        </Field>
        {text('tone', 'Tom')}
        {text('copyStyle', 'Estilo de copy')}
        {text('conclusion', 'Forma de conclusão')}
        {text('retention', 'Mecanismo de retenção')}
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold text-ink">Função de cada slide</legend>
        {dna.beats.map((beat, index) => (
          <Field key={index} label={`Slide ${index + 1}`} htmlFor={`dna-beat-${index}`}>
            <Input
              id={`dna-beat-${index}`}
              value={beat.purpose}
              maxLength={MAX_FIELD}
              onChange={(e) => set({ beats: dna.beats.map((item, position) => (position === index ? { ...item, purpose: e.target.value } : item)) })}
            />
          </Field>
        ))}
      </fieldset>

      {error && <Alert>{error}</Alert>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button variant="primary" loading={pending} onClick={onSave}>
          Salvar estrutura
        </Button>
      </div>
    </div>
  );
}
