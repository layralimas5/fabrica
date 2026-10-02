import clsx from 'clsx';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useAssets, useBrandKits, useCarousels } from '../app/data';
import { useServices } from '../app/services';
import type { RenderContext } from '../app/slideRendering';
import { errorMessage } from '../app/useResource';
import { isPhotoLike, type Asset } from '../domain/asset';
import {
  defaultBrandKit,
  EMPTY_PRODUCT,
  FONT_CHOICES,
  PHOTO_TEXT_STYLE_LABELS,
  PHOTO_TEXT_STYLES,
  photoTextOf,
  TIKTOK_STARTER,
  type PhotoText,
  type PhotoTextPosition,
  type PhotoTextStyle,
  VISUAL_STYLE_LABELS,
  type BrandColors,
  type BrandKit,
  type BrandKitInput,
  type BrandProduct,
  type Spacing,
} from '../domain/brandKit';
import { DEFAULT_SLIDE_STYLE, type Slide } from '../domain/carousel';
import { Alert, Button, Dialog, EmptyState, Field, Input, PageHeader, Select, Spinner, Textarea } from '../ui/primitives';
import { SlideCanvas } from '../ui/SlideCanvas';
import { StylePicker } from '../brand/StylePicker';

const COLOR_FIELDS: { key: keyof BrandColors; label: string }[] = [
  { key: 'primary', label: 'Principal' },
  { key: 'secondary', label: 'Destaque' },
  { key: 'background', label: 'Fundo' },
  { key: 'surface', label: 'Superfície' },
  { key: 'text', label: 'Texto' },
  { key: 'muted', label: 'Texto secundário' },
];

export function BrandKitsPage() {
  const services = useServices();
  const brands = useBrandKits();
  const carousels = useCarousels();
  const assets = useAssets();
  const [editing, setEditing] = useState<{ id: string | null; input: BrandKitInput } | null>(null);

  if (brands.loading) return <Spinner />;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Brand Kits"
        description="Cores, fontes e estilo de cada marca. Todo carrossel gerado segue o kit escolhido."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setEditing({ id: null, input: { ...TIKTOK_STARTER } })}>
              Modelo TikTok
            </Button>
            <Button variant="primary" onClick={() => setEditing({ id: null, input: defaultBrandKit() })}>
              <Plus className="size-4" aria-hidden /> Nova marca
            </Button>
          </div>
        }
      />
      {brands.error && <Alert>{brands.error}</Alert>}

      {brands.data.length === 0 ? (
        <EmptyState title="Nenhuma marca" description="Cria o primeiro Brand Kit pra começar a gerar carrosséis." />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {brands.data.map((brand) => (
            <li key={brand.id}>
              <button
                type="button"
                onClick={() => setEditing({ id: brand.id, input: toInput(brand) })}
                className="w-full rounded-2xl border border-line bg-surface p-5 text-left transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <div className="flex gap-1.5" aria-hidden>
                  {Object.values(brand.colors).map((color, index) => (
                    <span key={index} className="size-6 rounded-full ring-1 ring-black/10" style={{ background: color }} />
                  ))}
                </div>
                <p className="mt-4 text-base font-semibold text-ink" style={{ fontFamily: brand.typography.headingFont }}>
                  {brand.name}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {VISUAL_STYLE_LABELS[brand.visualStyle]} · {brand.typography.headingFont} / {brand.typography.bodyFont}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <BrandKitEditor
          key={editing.id ?? 'new'}
          id={editing.id}
          initial={editing.input}
          assets={assets.data}
          inUse={editing.id ? carousels.data.some((carousel) => carousel.brandKitId === editing.id) : false}
          onClose={() => setEditing(null)}
          onSave={async (input) => {
            const saved = editing.id ? await services.brandKits.update(editing.id, input) : await services.brandKits.create(input);
            brands.setData((current) => (editing.id ? current.map((brand) => (brand.id === saved.id ? saved : brand)) : [...current, saved]));
          }}
          onDelete={async () => {
            if (!editing.id) return;
            await services.brandKits.remove(editing.id);
            brands.setData((current) => current.filter((brand) => brand.id !== editing.id));
          }}
        />
      )}
    </div>
  );
}

function toInput(brand: BrandKit): BrandKitInput {
  const { id: _id, createdAt: _c, updatedAt: _u, ...input } = brand;
  return { ...input, avatarAssetId: input.avatarAssetId ?? null, photoText: photoTextOf(input), product: input.product ?? { ...EMPTY_PRODUCT } };
}

interface BrandKitEditorProps {
  id: string | null;
  initial: BrandKitInput;
  assets: Asset[];
  inUse: boolean;
  onClose: () => void;
  onSave: (input: BrandKitInput) => Promise<void>;
  onDelete: () => Promise<void>;
}

function BrandKitEditor({ id, initial, assets, inUse, onClose, onSave, onDelete }: BrandKitEditorProps) {
  const [draft, setDraft] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const patch = <K extends keyof BrandKitInput>(key: K, value: BrandKitInput[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const patchColor = (key: keyof BrandColors, value: string) => setDraft((current) => ({ ...current, colors: { ...current.colors, [key]: value } }));
  const patchProduct = (patchValue: Partial<BrandProduct>) => setDraft((current) => ({ ...current, product: { ...current.product, ...patchValue } }));
  const patchPhotoText = (patchValue: Partial<PhotoText>) => setDraft((current) => ({ ...current, photoText: { ...current.photoText, ...patchValue } }));
  const patchType = <K extends keyof BrandKitInput['typography']>(key: K, value: BrandKitInput['typography'][K]) =>
    setDraft((current) => ({ ...current, typography: { ...current.typography, [key]: value } }));

  const run = async (action: () => Promise<void>) => {
    setPending(true);
    setError(null);
    try {
      await action();
      onClose();
    } catch (cause) {
      setError(errorMessage(cause));
      setPending(false);
    }
  };

  const logos = assets.filter((asset) => asset.kind === 'logo');

  return (
    <Dialog
      title={id ? `Editar ${initial.name}` : 'Nova marca'}
      open
      onClose={onClose}
      size="xl"
      footer={
        <>
          {id && (
            <Button
              variant="danger"
              className="mr-auto"
              disabled={pending || inUse}
              title={inUse ? 'Existem carrosséis usando essa marca' : undefined}
              onClick={() => window.confirm('Excluir essa marca?') && void run(onDelete)}
            >
              {inUse ? 'Em uso por carrosséis' : 'Excluir marca'}
            </Button>
          )}
          <Button variant="primary" loading={pending} disabled={!draft.name.trim()} onClick={() => void run(() => onSave({ ...draft, name: draft.name.trim() }))}>
            Salvar marca
          </Button>
        </>
      }
    >
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col gap-6">
          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="mb-3 text-xs font-semibold uppercase tracking-wider text-faint">Identidade</legend>
            <Field label="Nome da marca" htmlFor="bk-name">
              <Input id="bk-name" value={draft.name} onChange={(e) => patch('name', e.target.value)} maxLength={80} />
            </Field>
            <Field label="@ ou assinatura" htmlFor="bk-handle">
              <Input id="bk-handle" value={draft.handle} onChange={(e) => patch('handle', e.target.value)} placeholder="@suamarca" />
            </Field>
            <Field label="Logo" htmlFor="bk-logo" hint={logos.length === 0 ? 'Suba o logo na Biblioteca com o tipo "logo".' : undefined}>
              <Select id="bk-logo" value={draft.logoAssetId ?? ''} onChange={(e) => patch('logoAssetId', e.target.value || null)}>
                <option value="">Sem logo</option>
                {logos.map((logo) => (
                  <option key={logo.id} value={logo.id}>
                    {logo.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Foto de perfil" htmlFor="bk-avatar" hint="Aparece no estilo Post (estilo tweet), com o nome e o @.">
              <Select id="bk-avatar" value={draft.avatarAssetId ?? ''} onChange={(e) => patch('avatarAssetId', e.target.value || null)}>
                <option value="">Inicial da marca</option>
                {assets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <p className="text-xs font-medium text-muted">Estilo visual padrão</p>
              <StylePicker label="Estilo visual padrão" draft={draft} photo={assets.find(isPhotoLike)} assets={assets} selected={[draft.visualStyle]} onToggle={(style) => patch('visualStyle', style)} />
            </div>
            <Field label="Tom e características" htmlFor="bk-voice" hint="A IA usa isso pra escrever no tom da marca." className="sm:col-span-2">
              <Textarea id="bk-voice" rows={3} value={draft.voice} onChange={(e) => patch('voice', e.target.value)} placeholder="Minimalista, moderno, pouco texto, forte contraste…" />
            </Field>
          </fieldset>

          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="mb-3 text-xs font-semibold uppercase tracking-wider text-faint">Produto (opcional)</legend>
            <Field label="Nome do produto" htmlFor="bk-product-name" hint="Deixe vazio se a marca não tem produto pra mostrar.">
              <Input id="bk-product-name" value={draft.product.name} onChange={(e) => patchProduct({ name: e.target.value })} maxLength={80} placeholder="Ex: Momentumm" />
            </Field>
            <Field label="Print ou foto do produto" htmlFor="bk-product-image" hint="Entra no slide de produto dos carrosséis com IA.">
              <Select id="bk-product-image" value={draft.product.imageAssetId ?? ''} onChange={(e) => patchProduct({ imageAssetId: e.target.value || null })}>
                <option value="">Escolher depois</option>
                {assets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="O que ele resolve" htmlFor="bk-product-pitch" hint="A IA só usa o que está aqui pra falar do produto, sem inventar funções." className="sm:col-span-2">
              <Textarea id="bk-product-pitch" rows={3} maxLength={1000} value={draft.product.pitch} onChange={(e) => patchProduct({ pitch: e.target.value })} placeholder="Pra quem é, que dor resolve e como, em 2 ou 3 frases." />
            </Field>
          </fieldset>

          <fieldset>
            <legend className="mb-3 text-xs font-semibold uppercase tracking-wider text-faint">Cores</legend>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {COLOR_FIELDS.map(({ key, label }) => (
                <Field key={key} label={label} htmlFor={`bk-color-${key}`}>
                  <div className="flex items-center gap-2">
                    <input id={`bk-color-${key}`} type="color" value={draft.colors[key]} onChange={(e) => patchColor(key, e.target.value)} className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-line bg-surface p-1" />
                    <Input aria-label={`${label} em hexadecimal`} value={draft.colors[key]} onChange={(e) => /^#[0-9a-f]{0,6}$/i.test(e.target.value) && patchColor(key, e.target.value)} className="font-mono text-xs" />
                  </div>
                </Field>
              ))}
            </div>
          </fieldset>

          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="mb-3 text-xs font-semibold uppercase tracking-wider text-faint">Tipografia</legend>
            <Field label="Fonte dos títulos" htmlFor="bk-heading">
              <Select id="bk-heading" value={draft.typography.headingFont} onChange={(e) => patchType('headingFont', e.target.value)}>
                {FONT_CHOICES.map((font) => <option key={font}>{font}</option>)}
              </Select>
            </Field>
            <Field label="Fonte dos textos" htmlFor="bk-body">
              <Select id="bk-body" value={draft.typography.bodyFont} onChange={(e) => patchType('bodyFont', e.target.value)}>
                {FONT_CHOICES.map((font) => <option key={font}>{font}</option>)}
              </Select>
            </Field>
            <Field label="Peso dos títulos" htmlFor="bk-hweight">
              <Select id="bk-hweight" value={draft.typography.headingWeight} onChange={(e) => patchType('headingWeight', Number(e.target.value))}>
                {[500, 600, 700, 800, 900].map((weight) => <option key={weight} value={weight}>{weight}</option>)}
              </Select>
            </Field>
            <Field label="Peso dos textos" htmlFor="bk-bweight">
              <Select id="bk-bweight" value={draft.typography.bodyWeight} onChange={(e) => patchType('bodyWeight', Number(e.target.value))}>
                {[400, 500, 600].map((weight) => <option key={weight} value={weight}>{weight}</option>)}
              </Select>
            </Field>
            <Field label={`Espaço entre letras do título: ${draft.typography.headingTracking.toFixed(2)}em`} htmlFor="bk-tracking">
              <input id="bk-tracking" type="range" min={-0.06} max={0.08} step={0.005} value={draft.typography.headingTracking} onChange={(e) => patchType('headingTracking', Number(e.target.value))} className="accent-[var(--accent)]" />
            </Field>
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-ink">
              <input type="checkbox" checked={draft.typography.headingUppercase} onChange={(e) => patchType('headingUppercase', e.target.checked)} className="size-4 accent-[var(--accent)]" />
              Títulos em caixa alta
            </label>
          </fieldset>

          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="mb-3 text-xs font-semibold uppercase tracking-wider text-faint">Layout e imagens</legend>
            <Field label="Espaçamento" htmlFor="bk-spacing">
              <Select id="bk-spacing" value={draft.spacing} onChange={(e) => patch('spacing', e.target.value as Spacing)}>
                <option value="compact">Compacto</option>
                <option value="normal">Normal</option>
                <option value="airy">Arejado</option>
              </Select>
            </Field>
            <Field label={`Bordas: ${draft.radius}px`} htmlFor="bk-radius">
              <input id="bk-radius" type="range" min={0} max={64} step={2} value={draft.radius} onChange={(e) => patch('radius', Number(e.target.value))} className="accent-[var(--accent)]" />
            </Field>
            <Field label={`Escurecer imagens: ${draft.imageOverlay}%`} htmlFor="bk-overlay">
              <input id="bk-overlay" type="range" min={0} max={80} step={5} value={draft.imageOverlay} onChange={(e) => patch('imageOverlay', Number(e.target.value))} className="accent-[var(--accent)]" />
            </Field>
            <div className="flex flex-col justify-end gap-2 pb-1">
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={draft.shadow} onChange={(e) => patch('shadow', e.target.checked)} className="size-4 accent-[var(--accent)]" />
                Sombra nas imagens
              </label>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={draft.imageGrayscale} onChange={(e) => patch('imageGrayscale', e.target.checked)} className="size-4 accent-[var(--accent)]" />
                Imagens em preto e branco
              </label>
            </div>
          </fieldset>
          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="mb-3 text-xs font-semibold uppercase tracking-wider text-faint">Texto sobre a foto (estilo TikTok)</legend>
            <Field label="Efeito do texto" htmlFor="bk-photo-style">
              <Select id="bk-photo-style" value={draft.photoText.style} onChange={(e) => patchPhotoText({ style: e.target.value as PhotoTextStyle })}>
                {PHOTO_TEXT_STYLES.map((style) => (
                  <option key={style} value={style}>
                    {PHOTO_TEXT_STYLE_LABELS[style]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Posição" htmlFor="bk-photo-position">
              <Select id="bk-photo-position" value={draft.photoText.position} onChange={(e) => patchPhotoText({ position: e.target.value as PhotoTextPosition })}>
                <option value="top">Em cima</option>
                <option value="center">Meio</option>
                <option value="bottom">Embaixo</option>
              </Select>
            </Field>
            <Field label={`Tamanho da letra: ${draft.photoText.size}px`} htmlFor="bk-photo-size" hint="Medido no slide de 1080 de largura. Compare com um post seu e ajuste olhando a prévia.">
              <input id="bk-photo-size" type="range" min={18} max={120} step={1} value={draft.photoText.size} onChange={(e) => patchPhotoText({ size: Number(e.target.value) })} className="accent-[var(--accent)]" />
            </Field>
            <Field label="Cor da letra" htmlFor="bk-photo-color">
              <input id="bk-photo-color" type="color" value={draft.photoText.color} onChange={(e) => patchPhotoText({ color: e.target.value })} className="h-10 w-12 cursor-pointer rounded-lg border border-line bg-surface p-1" />
            </Field>
          </fieldset>
          {error && <Alert>{error}</Alert>}
        </div>

        <BrandPreview draft={draft} assets={assets} />
      </div>
    </Dialog>
  );
}

const SAMPLE_SLIDES: Slide[] = [
  { id: 'sample-hook', role: 'hook', title: 'Você não precisa de mais motivação.', subtitle: null, body: null, bullets: [], assetId: null, layout: 'text_center', style: DEFAULT_SLIDE_STYLE },
  { id: 'sample-image', role: 'context', title: 'Motivação funciona quando tudo vai bem.', subtitle: 'O problema aparece nos dias ruins.', body: null, bullets: [], assetId: null, layout: 'image_top_text_bottom', style: DEFAULT_SLIDE_STYLE },
  { id: 'sample-list', role: 'item', title: 'O que funciona de verdade', subtitle: null, body: null, bullets: ['Rotina pequena', 'Ambiente pronto', 'Começar antes de ter vontade'], assetId: null, layout: 'list', style: DEFAULT_SLIDE_STYLE },
];

function BrandPreview({ draft, assets }: { draft: BrandKitInput; assets: Asset[] }) {
  const { assets: repo } = useServices();
  const visualStyle = draft.visualStyle;
  const photo = assets.find(isPhotoLike);
  const tall = visualStyle === 'tiktok';
  const context: RenderContext = useMemo(
    () => ({ brand: { ...draft, id: 'preview', createdAt: '', updatedAt: '' }, assets, repo, format: visualStyle === 'tiktok' ? '9:16' : '4:5', visualStyle, total: SAMPLE_SLIDES.length }),
    [draft, assets, repo, visualStyle],
  );
  const slides = useMemo(() => {
    if (visualStyle === 'tiktok') {
      return SAMPLE_SLIDES.map((slide) => ({ ...slide, subtitle: null, bullets: [], assetId: photo?.id ?? null, layout: photo ? 'native_photo' : 'big_statement' }));
    }
    if (visualStyle === 'post') {
      return SAMPLE_SLIDES.map((slide, index) => ({ ...slide, subtitle: null, bullets: [], assetId: index > 0 ? null : (photo?.id ?? null), layout: index === 0 && photo ? 'post_image' : 'post_text' }));
    }
    return SAMPLE_SLIDES.map((slide) => (slide.layout === 'image_top_text_bottom' ? { ...slide, assetId: photo?.id ?? null, layout: photo ? slide.layout : 'text_side' } : slide));
  }, [photo, visualStyle]) as Slide[];

  return (
    <aside className="flex flex-col gap-3 lg:sticky lg:top-0">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-faint">Prévia</p>
        <span className="text-xs text-muted" aria-live="polite">{VISUAL_STYLE_LABELS[visualStyle]}</span>
      </div>
      <div className={clsx('grid gap-2', tall ? 'grid-cols-3' : 'grid-cols-2')}>
        {slides.map((slide, index) => (
          <SlideCanvas key={slide.id} context={context} slide={slide} index={index} scale={0.3} label={`Prévia ${index + 1}`} className={clsx('ring-1 ring-line', index === 0 && !tall ? 'col-span-2 rounded-xl' : 'rounded-lg')} />
        ))}
      </div>
    </aside>
  );
}
