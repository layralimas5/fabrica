import clsx from 'clsx';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, FlaskConical, ImageIcon, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAssets, useBrandKits } from '../app/data';
import { useServices } from '../app/services';
import { errorMessage } from '../app/useResource';
import { createCarousels, MAX_TEST_VARIANTS } from '../application/createCarousels';
import { StylePicker } from '../brand/StylePicker';
import { ImagePickerDialog } from '../editor/ImagePickerDialog';
import { AssetThumb } from '../ui/AssetThumb';
import { inFolders, isPhotoLike } from '../domain/asset';
import { MOMENTUMM_STARTER, productOf, type VisualStyle } from '../domain/brandKit';
import type { CopyMode } from '../domain/carousel';
import {
  CONTENT_TYPE_LABELS,
  CONTENT_TYPES,
  OBJECTIVE_LABELS,
  OBJECTIVES,
  SLIDE_COUNT_OPTIONS,
  type ContentType,
  type Objective,
  type SlideCountOption,
} from '../domain/content';
import { parseScript, scriptStats } from '../domain/script';
import { FolderPicker } from '../ui/FolderPicker';
import { Alert, Button, Field, Select, Spinner, Textarea } from '../ui/primitives';

const AI_STEPS = ['Analisando a copy', 'Encontrando o gancho', 'Estruturando os slides', 'Escolhendo imagens da biblioteca', 'Montando o design'];
const MANUAL_STEPS = ['Lendo seus textos', 'Escolhendo imagens da biblioteca', 'Montando os slides'];
const MIN_AI_COPY_LENGTH = 20;
const AI_PLACEHOLDER = 'Cole sua copy ou só o tema. Ex: Metas sem sistema são só desejos com prazo.';
const MODE_STORAGE_KEY = 'fabrica:copy-mode';

const MANUAL_PLACEHOLDER = `ninguém te conta isso sobre disciplina
você não precisa de motivação // precisa de rotina
comece com 10 minutos por dia
legenda: salva pra lembrar amanhã #rotina
---
3 hábitos que mudaram minha manhã
acordar sem celular
água antes do café`;

function readStoredMode(): CopyMode {
  try {
    return localStorage.getItem(MODE_STORAGE_KEY) === 'ai' ? 'ai' : 'manual';
  } catch {
    return 'manual';
  }
}

export function CreatePage() {
  const services = useServices();
  const navigate = useNavigate();
  const brands = useBrandKits();
  const assets = useAssets();

  const [mode, setMode] = useState<CopyMode>(readStoredMode);
  const [text, setText] = useState('');
  const [brandId, setBrandId] = useState('');
  const [contentType, setContentType] = useState<ContentType>('auto');
  const [slideCount, setSlideCount] = useState<SlideCountOption>('auto');
  const [styles, setStyles] = useState<VisualStyle[]>(['minimalista']);
  const [testing, setTesting] = useState(false);
  const [objective, setObjective] = useState<Objective>('engajamento');
  const [addCta, setAddCta] = useState(false);
  const [includeProduct, setIncludeProduct] = useState(true);
  const [productImageId, setProductImageId] = useState<string | null>(null);
  const [pickingProductImage, setPickingProductImage] = useState(false);
  const [folders, setFolders] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creatingStarter, setCreatingStarter] = useState(false);

  const brand = brands.data.find((kit) => kit.id === brandId) ?? brands.data[0];
  const product = brand ? productOf(brand) : null;
  const folderCounts = useMemo(() => countByFolder(assets.data), [assets.data]);
  const availableImages = assets.data.filter((asset) => inFolders(asset, folders)).length;
  const stats = useMemo(() => scriptStats(parseScript(text)), [text]);
  const blocks = mode === 'manual' ? stats.carousels : text.trim() ? 1 : 0;
  const total = blocks * styles.length;

  useEffect(() => {
    if (!brand) return;
    setBrandId(brand.id);
    setStyles([brand.visualStyle]);
    setTesting(false);
    setProductImageId(productOf(brand)?.imageAssetId ?? null);
  }, [brand?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const changeMode = (next: CopyMode) => {
    setMode(next);
    try {
      localStorage.setItem(MODE_STORAGE_KEY, next);
    } catch {
      // Remembering the mode is a convenience; the page works without storage.
    }
  };

  const toggleTesting = (enabled: boolean) => {
    setTesting(enabled);
    setStyles((current) => (enabled ? current : current.slice(0, 1)));
  };

  const toggleStyle = (style: VisualStyle) => {
    if (!testing) return setStyles([style]);
    setStyles((current) => {
      if (current.includes(style)) return current.length > 1 ? current.filter((item) => item !== style) : current;
      return current.length >= MAX_TEST_VARIANTS ? current : [...current, style];
    });
  };

  const createStarterBrand = async () => {
    setCreatingStarter(true);
    try {
      const created = await services.brandKits.create(MOMENTUMM_STARTER);
      brands.setData((current) => [...current, created]);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setCreatingStarter(false);
    }
  };

  const generate = async () => {
    if (!brand) return;
    setGenerating(true);
    setError(null);
    try {
      const result = await createCarousels(services, {
        brand,
        library: assets.data,
        mode,
        text: text.trim(),
        contentType,
        objective,
        slideCount,
        folders,
        styles,
        addCta,
        includeProduct: product !== null && includeProduct,
        productImageAssetId: productImageId,
      });
      if (result.experimentIds.length === 1) navigate(`/testes/${result.experimentIds[0]}`);
      else if (result.experimentIds.length > 1) navigate('/testes', { state: { created: result.carousels.length } });
      else if (result.carousels.length === 1) navigate(`/carrossel/${result.carousels[0].id}`);
      else navigate('/projetos', { state: { created: result.carousels.length } });
    } catch (cause) {
      setError(errorMessage(cause));
      setGenerating(false);
    }
  };

  if (brands.loading) return <Spinner />;

  const ready = mode === 'manual' ? stats.slides > 0 : text.trim().length >= MIN_AI_COPY_LENGTH;
  const photo = assets.data.find((asset) => isPhotoLike(asset) && asset.id !== productImageId);
  const productImage = assets.data.find((asset) => asset.id === productImageId);

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-8 text-center sm:mb-10">
        <h1 className="text-balance text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Cole seus textos. Receba os carrosséis prontos.</h1>
        <p className="mt-3 text-pretty text-sm text-muted sm:text-base">Você escreve, a ferramenta monta os slides com as suas fotos e a identidade da marca.</p>
      </header>

      {brands.error && <Alert>{brands.error}</Alert>}

      {brands.data.length === 0 || !brand ? (
        <div className="rounded-2xl border border-line bg-surface p-8 text-center shadow-sm">
          <p className="text-sm font-semibold text-ink">Primeiro, uma marca</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">Todo carrossel segue um Brand Kit: cores, fontes e estilo. Começa com o do Momentumm ou cria o seu.</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button variant="primary" loading={creatingStarter} onClick={() => void createStarterBrand()}>
              Usar o kit Momentumm
            </Button>
            <Link to="/marcas" className="inline-flex h-10 items-center rounded-xl border border-line bg-surface px-3.5 text-sm font-medium text-ink hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
              Criar do zero
            </Link>
          </div>
        </div>
      ) : (
        <div className="rounded-3xl border border-line bg-surface p-2 shadow-sm">
          <div role="radiogroup" aria-label="Como a copy entra nos slides" className="m-2 grid grid-cols-2 gap-1 rounded-2xl bg-subtle p-1">
            <ModeOption active={mode === 'manual'} onClick={() => changeMode('manual')} title="Meu texto" detail="Você escreve, a ferramenta só monta" />
            <ModeOption active={mode === 'ai'} onClick={() => changeMode('ai')} title="IA estrutura" detail="Cola uma copy solta e a IA divide" />
          </div>

          <label htmlFor="copy" className="sr-only">
            {mode === 'manual' ? 'Textos dos carrosséis' : 'Copy ou ideia'}
          </label>
          <Textarea
            id="copy"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={mode === 'manual' ? MANUAL_PLACEHOLDER : AI_PLACEHOLDER}
            rows={11}
            className={clsx('min-h-60 border-0 bg-transparent px-4 py-3 text-base focus-visible:ring-0', mode === 'manual' && 'font-mono text-[14px]')}
            disabled={generating}
          />

          {mode === 'manual' && (
            <div className="flex flex-col gap-1 px-4 pb-3 text-xs text-faint sm:flex-row sm:items-center sm:justify-between">
              <p>
                Uma linha = um slide · <code className="text-muted">//</code> quebra a linha · <code className="text-muted">---</code> separa carrosséis · <code className="text-muted">legenda:</code> vira a legenda
              </p>
              <p className="shrink-0 font-medium text-muted" aria-live="polite">
                {stats.carousels} carrossé{stats.carousels === 1 ? 'l' : 'is'} · {stats.slides} slides
              </p>
            </div>
          )}

          <div className="grid gap-3 border-t border-line p-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Marca" htmlFor="brand">
              <Select id="brand" value={brand.id} onChange={(e) => setBrandId(e.target.value)} disabled={generating}>
                {brands.data.map((kit) => (
                  <option key={kit.id} value={kit.id}>
                    {kit.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Objetivo" htmlFor="objective">
              <Select id="objective" value={objective} onChange={(e) => setObjective(e.target.value as Objective)} disabled={generating}>
                {OBJECTIVES.map((item) => (
                  <option key={item} value={item}>
                    {OBJECTIVE_LABELS[item]}
                  </option>
                ))}
              </Select>
            </Field>
            {mode === 'ai' ? (
              <>
                <Field label="Tipo de carrossel" htmlFor="type">
                  <Select id="type" value={contentType} onChange={(e) => setContentType(e.target.value as ContentType)} disabled={generating}>
                    {CONTENT_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {CONTENT_TYPE_LABELS[type]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Slides" htmlFor="count">
                  <Select id="count" value={String(slideCount)} onChange={(e) => setSlideCount(e.target.value === 'auto' ? 'auto' : (Number(e.target.value) as SlideCountOption))} disabled={generating}>
                    {SLIDE_COUNT_OPTIONS.map((count) => (
                      <option key={count} value={String(count)}>
                        {count === 'auto' ? 'Automático' : count}
                      </option>
                    ))}
                  </Select>
                </Field>
              </>
            ) : (
              <label className="flex items-center gap-2 self-end pb-2.5 text-sm text-ink sm:col-span-2">
                <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={addCta} onChange={(e) => setAddCta(e.target.checked)} disabled={generating} />
                Adicionar no fim o CTA do objetivo
              </label>
            )}
          </div>

          {mode === 'ai' && product && (
            <div className="border-t border-line p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <label className="flex items-start gap-2 text-sm text-ink">
                  <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]" checked={includeProduct} onChange={(e) => setIncludeProduct(e.target.checked)} disabled={generating} />
                  <span>
                    Mostrar o {product.name} num slide, como parte da solução
                    <span className="block text-xs text-faint">Um slide só, com a imagem do produto. As outras fotos nunca repetem ela.</span>
                  </span>
                </label>
                {includeProduct && (
                  <div className="flex items-center gap-3 pl-6 sm:pl-0">
                    {productImage ? (
                      <AssetThumb asset={productImage} className="size-14 shrink-0 rounded-lg ring-1 ring-line" />
                    ) : (
                      <span className="grid size-14 shrink-0 place-items-center rounded-lg bg-subtle text-faint ring-1 ring-line" aria-hidden>
                        <ImageIcon className="size-5" />
                      </span>
                    )}
                    <div className="flex flex-col items-start gap-1">
                      <Button size="sm" variant="secondary" onClick={() => setPickingProductImage(true)} disabled={generating || assets.data.length === 0}>
                        {productImage ? 'Trocar imagem do produto' : 'Escolher imagem do produto'}
                      </Button>
                      {assets.data.length === 0 && <span className="text-xs text-faint">Suba o print na Biblioteca primeiro.</span>}
                    </div>
                  </div>
                )}
              </div>
              <ImagePickerDialog
                open={pickingProductImage}
                title={`Imagem do ${product.name}`}
                assets={assets.data}
                currentId={productImageId}
                slideText={`${product.name} ${product.pitch} app tela print produto`}
                carouselFolders={[]}
                onPick={(id) => {
                  setProductImageId(id);
                  setPickingProductImage(false);
                }}
                onClose={() => setPickingProductImage(false)}
              />
            </div>
          )}

          {folderCounts.size > 0 && (
            <div className="border-t border-line p-4">
              <FolderPicker label="Fotos de quais pastas" counts={folderCounts} selected={folders} onChange={setFolders} disabled={generating} />
            </div>
          )}

          <div className="border-t border-line p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs font-medium text-muted">{testing ? `Formatos do teste (${styles.length} de até ${MAX_TEST_VARIANTS})` : 'Estilo visual'}</p>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={testing} onChange={(e) => toggleTesting(e.target.checked)} disabled={generating} />
                <FlaskConical className="size-4 text-accent" aria-hidden />
                Testar formatos
              </label>
            </div>
            {testing && <p className="mb-3 text-xs text-faint">Marque de 2 a 4 estilos. Cada um vira uma versão com o mesmo texto e as mesmas fotos, pra você postar e comparar na área Testes.</p>}
            <StylePicker
              label={testing ? 'Formatos do teste' : 'Estilo visual'}
              draft={brand}
              photo={photo}
              assets={assets.data}
              selected={styles}
              onToggle={toggleStyle}
              multiple={testing}
              disabled={generating}
            />
          </div>

          <div className="flex flex-col gap-3 border-t border-line p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-faint">
              {assets.data.length > 0 ? `${availableImages} imagens disponíveis` : 'Sem imagens na biblioteca: os slides saem só com texto.'}
              {mode === 'ai' && services.ai.engine === 'heuristic' && ' · IA local (sem Claude)'}
              {total > 1 && ` · vai criar ${total} carrosséis`}
            </p>
            <Button variant="primary" size="lg" disabled={!ready || (testing && styles.length < 2)} loading={generating} onClick={() => void generate()}>
              {!generating && <Sparkles className="size-4" aria-hidden />}
              {testing ? 'Gerar teste' : total > 1 ? `Gerar ${total} carrosséis` : 'Gerar carrossel'}
              {!generating && <ArrowRight className="size-4" aria-hidden />}
            </Button>
          </div>
        </div>
      )}

      <div className="mt-4 min-h-12">
        {error && <Alert>{error}</Alert>}
        <AnimatePresence>{generating && <GenerationSteps steps={mode === 'ai' ? AI_STEPS : MANUAL_STEPS} />}</AnimatePresence>
      </div>
    </div>
  );
}

function ModeOption({ active, onClick, title, detail }: { active: boolean; onClick: () => void; title: string; detail: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={clsx(
        'rounded-xl px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        active ? 'bg-surface shadow-sm ring-1 ring-line' : 'hover:bg-surface/60',
      )}
    >
      <span className={clsx('block text-sm font-medium', active ? 'text-ink' : 'text-muted')}>{title}</span>
      <span className="block text-xs text-faint">{detail}</span>
    </button>
  );
}

function GenerationSteps({ steps }: { steps: string[] }) {
  const [step, setStep] = useState(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const timer = setInterval(() => setStep((current) => Math.min(current + 1, steps.length - 1)), 1200);
    return () => clearInterval(timer);
  }, [steps.length]);

  return (
    <motion.ol
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs"
      aria-live="polite"
    >
      {steps.map((label, index) => (
        <li key={label} className={index <= step ? 'text-ink' : 'text-faint'}>
          {index < step ? '✓ ' : index === step ? '• ' : ''}
          {label}
        </li>
      ))}
    </motion.ol>
  );
}

function countByFolder(assets: { folder: string }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const asset of assets) counts.set(asset.folder, (counts.get(asset.folder) ?? 0) + 1);
  return new Map([...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])));
}
