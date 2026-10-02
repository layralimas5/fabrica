import clsx from 'clsx';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, FlaskConical, ImageIcon, Sparkles, Upload } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAccounts, useAssets, useBrandKits } from '../app/data';
import { useServices } from '../app/services';
import { errorMessage } from '../app/useResource';
import { createCarousels, MAX_TEST_VARIANTS } from '../application/createCarousels';
import { ShadePicker } from '../brand/ShadePicker';
import { StylePicker } from '../brand/StylePicker';
import type { RenderContext } from '../app/slideRendering';
import { DEFAULT_SHADE, type ImageShade } from '../domain/shade';
import { ImagePickerDialog } from '../editor/ImagePickerDialog';
import { AssetThumb } from '../ui/AssetThumb';
import { ACCEPTED_IMAGE_TYPES, inFolders, isAcceptedImage, isPhotoLike, PRODUCT_FOLDER, UPLOAD_RULES_MESSAGE } from '../domain/asset';
import { MOMENTUMM_STARTER, photoFoldersOf, productOf, type VisualStyle } from '../domain/brandKit';
import { accountsFor, identityOf } from '../domain/account';
import {
  CAROUSEL_FORMATS,
  defaultFormatFor,
  FORMAT_SIZES,
  formatFitsPlatform,
  formatSizeLabel,
  PLATFORM_FORMAT_OPTIONS,
  PLATFORM_LABELS,
  PLATFORMS,
  type CarouselFormat,
  type CopyMode,
  type Platform,
} from '../domain/carousel';
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
import { hasNumberedSlides, parseScript, scriptStats } from '../domain/script';
import { FolderPicker } from '../ui/FolderPicker';
import { Alert, Button, Field, Select, Spinner, Textarea } from '../ui/primitives';

const AI_STEPS = ['Analisando a copy', 'Encontrando o gancho', 'Estruturando os slides', 'Escolhendo imagens da biblioteca', 'Montando o design'];
const MANUAL_STEPS = ['Lendo seus textos', 'Escolhendo imagens da biblioteca', 'Montando os slides'];
const MIN_AI_COPY_LENGTH = 20;
const AI_PLACEHOLDER = 'Cole sua copy ou só o tema. Ex: Metas sem sistema são só desejos com prazo.';
const MODE_STORAGE_KEY = 'fabrica:copy-mode';
const PLATFORM_STORAGE_KEY = 'fabrica:platform';
const FORMAT_STORAGE_KEY = 'fabrica:format';
const ACCOUNT_STORAGE_KEY = 'fabrica:account';
const PLATFORM_DETAILS: Record<Platform, string> = { instagram: 'Feed, perfil, stories', tiktok: 'Carrossel de fotos' };

const MANUAL_PLACEHOLDER = `Tema do carrossel: Rotina que sobrevive ao dia ruim
Slide 1, ninguém te conta isso sobre disciplina
Slide 2, você não precisa de motivação // precisa de rotina
Slide 3, comece com 10 minutos por dia
Legenda: salva pra lembrar amanhã #rotina
---
Slide 1, 3 hábitos que mudaram minha manhã
Slide 2, acordar sem celular`;

function readStored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    return allowed.find((item) => item === stored) ?? fallback;
  } catch {
    return fallback;
  }
}

function readStoredText(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function rememberText(key: string, value: string | null): void {
  if (value) remember(key, value);
  else {
    try {
      localStorage.removeItem(key);
    } catch {
      // Remembering a choice is a convenience; the page works without storage.
    }
  }
}

function remember(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Remembering a choice is a convenience; the page works without storage.
  }
}

export function CreatePage() {
  const services = useServices();
  const navigate = useNavigate();
  const brands = useBrandKits();
  const assets = useAssets();
  const accounts = useAccounts();

  const [platform, setPlatform] = useState<Platform>(() => readStored(PLATFORM_STORAGE_KEY, PLATFORMS, 'instagram'));
  const [format, setFormat] = useState<CarouselFormat>(() => {
    const stored = readStored(FORMAT_STORAGE_KEY, CAROUSEL_FORMATS, defaultFormatFor(platform));
    return formatFitsPlatform(stored, platform) ? stored : defaultFormatFor(platform);
  });
  const [mode, setMode] = useState<CopyMode>(() => readStored(MODE_STORAGE_KEY, ['manual', 'ai'] as const, 'manual'));
  const [text, setText] = useState('');
  const [brandId, setBrandId] = useState('');
  const [accountId, setAccountId] = useState<string | null>(() => readStoredText(ACCOUNT_STORAGE_KEY));
  const [contentType, setContentType] = useState<ContentType>('auto');
  const [slideCount, setSlideCount] = useState<SlideCountOption>('auto');
  const [styles, setStyles] = useState<VisualStyle[]>(['minimalista']);
  const [testing, setTesting] = useState(false);
  const [objective, setObjective] = useState<Objective>('engajamento');
  const [addCta, setAddCta] = useState(false);
  const [includeProduct, setIncludeProduct] = useState(true);
  const [productImageId, setProductImageId] = useState<string | null>(null);
  const [pickingProductImage, setPickingProductImage] = useState(false);
  const [uploadingProductImage, setUploadingProductImage] = useState(false);
  const productFileInput = useRef<HTMLInputElement>(null);
  const [folders, setFolders] = useState<string[]>([]);
  const [shade, setShade] = useState<ImageShade>(DEFAULT_SHADE);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creatingStarter, setCreatingStarter] = useState(false);

  const brand = brands.data.find((kit) => kit.id === brandId) ?? brands.data[0];
  const platformAccounts = accountsFor(accounts.data, platform);
  const account = platformAccounts.find((item) => item.id === accountId) ?? platformAccounts[0] ?? null;
  const accountIdentity = useMemo(() => (account ? identityOf(account) : null), [account]);
  const product = brand ? productOf(brand) : null;
  const folderCounts = useMemo(() => countByFolder(assets.data), [assets.data]);
  const availableImages = assets.data.filter((asset) => inFolders(asset, folders)).length;
  const stats = useMemo(() => scriptStats(parseScript(text)), [text]);
  const numbered = useMemo(() => hasNumberedSlides(text), [text]);
  const blocks = mode === 'manual' || numbered ? stats.carousels : text.trim() ? 1 : 0;
  const total = blocks * styles.length;

  useEffect(() => {
    if (!brand) return;
    setBrandId(brand.id);
    setStyles([brand.visualStyle]);
    setTesting(false);
    setProductImageId(productOf(brand)?.imageAssetId ?? null);
    setFolders(photoFoldersOf(brand));
  }, [brand?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const chooseAccount = (id: string | null) => {
    setAccountId(id);
    rememberText(ACCOUNT_STORAGE_KEY, id);
    const chosen = accounts.data.find((item) => item.id === id);
    if (chosen?.brandKitId && brands.data.some((kit) => kit.id === chosen.brandKitId)) setBrandId(chosen.brandKitId);
  };

  // The account's brand comes along when the account is picked or changes with the network.
  useEffect(() => {
    if (account?.brandKitId && brands.data.some((kit) => kit.id === account.brandKitId)) setBrandId(account.brandKitId);
  }, [account?.id, brands.data.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const changeMode = (next: CopyMode) => {
    setMode(next);
    remember(MODE_STORAGE_KEY, next);
  };

  const changePlatform = (next: Platform) => {
    setPlatform(next);
    remember(PLATFORM_STORAGE_KEY, next);
    if (!formatFitsPlatform(format, next)) changeFormat(defaultFormatFor(next));
  };

  const changeFormat = (next: CarouselFormat) => {
    setFormat(next);
    remember(FORMAT_STORAGE_KEY, next);
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

  const uploadProductImage = async (file: File | undefined) => {
    if (!file || !brand || !product) return;
    if (!isAcceptedImage(file)) return setError(`Esse arquivo não serve: ${UPLOAD_RULES_MESSAGE}.`);
    setUploadingProductImage(true);
    setError(null);
    try {
      const asset = await services.assets.upload({ file, folder: PRODUCT_FOLDER, kind: 'screenshot', tags: ['app', 'tela', 'produto'] });
      assets.setData((current) => [asset, ...current]);
      setProductImageId(asset.id);
      // The first print sent becomes the brand default, so next time it is already selected.
      if (!product.imageAssetId) {
        const { id: _id, createdAt: _c, updatedAt: _u, ...input } = brand;
        const saved = await services.brandKits.update(brand.id, { ...input, product: { ...product, imageAssetId: asset.id } });
        brands.setData((current) => current.map((kit) => (kit.id === saved.id ? saved : kit)));
      }
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setUploadingProductImage(false);
    }
  };

  const generate = async () => {
    if (!brand) return;
    setGenerating(true);
    setError(null);
    try {
      const result = await createCarousels(services, {
        platform,
        accountId: account?.id ?? null,
        format,
        brand,
        library: assets.data,
        mode,
        text: text.trim(),
        contentType,
        objective,
        slideCount,
        folders,
        styles,
        shade,
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

  const previewStyle = styles[0] ?? brand?.visualStyle ?? 'minimalista';
  const shadeContext: Omit<RenderContext, 'shade'> | null = useMemo(
    () => (brand ? { brand, assets: assets.data, repo: services.assets, format, visualStyle: previewStyle, total: 1, account: accountIdentity } : null),
    [brand, assets.data, services.assets, format, previewStyle, accountIdentity],
  );

  if (brands.loading) return <Spinner />;

  const ready = mode === 'manual' ? stats.slides > 0 : text.trim().length >= MIN_AI_COPY_LENGTH;
  const photo = assets.data.find((asset) => isPhotoLike(asset) && asset.id !== productImageId);
  const productImage = assets.data.find((asset) => asset.id === productImageId);

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-8 text-center sm:mb-10">
        <h1 className="text-balance text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Cole a copy. Receba os carrosséis prontos.</h1>
        <p className="mt-3 text-pretty text-sm text-muted sm:text-base">Você escolhe onde vai postar, o texto, a formatação e as fotos. A ferramenta coloca cada frase e cada foto no slide certo.</p>
      </header>

      {brands.error && <Alert>{brands.error}</Alert>}

      {brands.data.length === 0 || !brand ? (
        <div className="rounded-2xl border border-line bg-surface p-8 text-center shadow-sm">
          <p className="text-sm font-semibold text-ink">Primeiro, uma conta</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">Cada conta que você produz tem um Brand Kit: cores, fontes, tom de voz, produto e pastas de fotos. Cria o primeiro ou começa por um modelo.</p>
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
        <div className="rounded-3xl border border-line bg-surface shadow-sm">
          <Step number={1} title="Onde vai postar">
            <div role="radiogroup" aria-label="Rede social" className="grid grid-cols-2 gap-1 rounded-2xl bg-subtle p-1">
              {PLATFORMS.map((item) => (
                <ChoiceCard key={item} active={platform === item} onClick={() => changePlatform(item)} title={PLATFORM_LABELS[item]} detail={PLATFORM_DETAILS[item]} />
              ))}
            </div>
            <p className="mb-2 mt-4 text-xs font-medium text-muted">Proporção</p>
            <div role="radiogroup" aria-label="Proporção" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {PLATFORM_FORMAT_OPTIONS[platform].map((option) => (
                <FormatCard key={option.format} format={option.format} use={option.use} active={format === option.format} onClick={() => changeFormat(option.format)} disabled={generating} />
              ))}
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              {platformAccounts.length > 0 ? (
                <Field label={`Conta do ${PLATFORM_LABELS[platform]}`} htmlFor="account" className="sm:w-80">
                  <Select id="account" value={account?.id ?? ''} onChange={(e) => chooseAccount(e.target.value || null)} disabled={generating}>
                    {platformAccounts.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} · @{item.handle}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : (
                <p className="text-xs text-faint">Nenhuma conta do {PLATFORM_LABELS[platform]} ainda. No modelo Post, o topo dos slides mostra o nome da marca.</p>
              )}
              <Link to="/contas" className="text-xs font-medium text-muted underline underline-offset-4 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                {platformAccounts.length > 0 ? 'Gerenciar contas' : 'Cadastrar conta'}
              </Link>
            </div>
          </Step>

          <Step number={2} title="A copy">
            <div role="radiogroup" aria-label="Como a copy entra nos slides" className="mb-3 grid grid-cols-2 gap-1 rounded-2xl bg-subtle p-1">
              <ChoiceCard active={mode === 'ai'} onClick={() => changeMode('ai')} title="Separar pra mim" detail="Cola a copy inteira e a ferramenta divide nos slides" />
              <ChoiceCard active={mode === 'manual'} onClick={() => changeMode('manual')} title="Já separei" detail="Slide 1, texto · Slide 2, texto, sem mudar nenhuma palavra" />
            </div>
            <div className="rounded-2xl border border-line">
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

              {(mode === 'manual' || numbered) && (
                <div className="flex flex-col gap-1 px-4 pb-3 text-xs text-faint sm:flex-row sm:items-center sm:justify-between">
                  <p>
                    {mode === 'ai' ? (
                      <span className="font-medium text-ink">Você já numerou os slides, então a ferramenta respeita a sua divisão e não muda o texto. </span>
                    ) : null}
                    <code className="text-muted">Slide 1</code> começa o slide 1 (só o texto aparece) · <code className="text-muted">SLIDE 6 — PRODUTO</code> recebe o print · linha em branco vira espaço entre parágrafos · sem "Slide N", cada linha é um slide · <code className="text-muted">Legenda:</code> e <code className="text-muted">Tema do carrossel:</code> são lidos à parte
                  </p>
                  <p className="shrink-0 font-medium text-muted" aria-live="polite">
                    {stats.carousels} {stats.carousels === 1 ? 'carrossel' : 'carrosséis'} · {stats.slides} slides
                  </p>
                </div>
              )}

            </div>
          </Step>

          <Step number={3} title="A formatação">
            <div className="flex flex-col gap-5">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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

              <div>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs font-medium text-muted">{testing ? `Formatos do teste (${styles.length} de até ${MAX_TEST_VARIANTS})` : 'Modelo dos slides'}</p>
                  <label className="flex items-center gap-2 text-sm text-ink">
                    <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={testing} onChange={(e) => toggleTesting(e.target.checked)} disabled={generating} />
                    <FlaskConical className="size-4 text-accent" aria-hidden />
                    Testar formatos
                  </label>
                </div>
                {testing && <p className="mb-3 text-xs text-faint">Marque de 2 a 4 estilos. Cada um vira uma versão com o mesmo texto e as mesmas fotos, pra você postar e comparar na área Testes.</p>}
                <StylePicker
                  label={testing ? 'Formatos do teste' : 'Modelo dos slides'}
                  draft={brand}
                  photo={photo}
                  assets={assets.data}
                  selected={styles}
                  onToggle={toggleStyle}
                  multiple={testing}
                  disabled={generating}
                  shade={shade}
                  account={accountIdentity}
                />
              </div>
              <div>
                <p className="mb-3 text-xs font-medium text-muted">Sombreamento das fotos (vale pra todas)</p>
                {shadeContext && <ShadePicker context={shadeContext} photo={photo} value={shade} onChange={setShade} disabled={generating} />}
              </div>

              {product && (
                <div className="rounded-2xl border border-line p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <label className="flex items-start gap-2 text-sm text-ink">
                      <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]" checked={includeProduct} onChange={(e) => setIncludeProduct(e.target.checked)} disabled={generating} />
                      <span>
                        Mostrar o {product.name} num slide, como parte da solução
                        <span className="block text-xs text-faint">
                        {mode === 'ai' && !numbered
                          ? 'A IA coloca um slide com a imagem do produto. As outras fotos nunca repetem ela.'
                          : 'A imagem entra no slide marcado como PRODUTO (ex: SLIDE 6 — PRODUTO) ou com [INSERIR PRINT].'}
                      </span>
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
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="secondary" loading={uploadingProductImage} onClick={() => productFileInput.current?.click()} disabled={generating}>
                            {!uploadingProductImage && <Upload className="size-4" aria-hidden />}
                            Enviar print
                          </Button>
                          {assets.data.length > 0 && (
                            <Button size="sm" variant="secondary" onClick={() => setPickingProductImage(true)} disabled={generating || uploadingProductImage}>
                              {productImage ? 'Trocar' : 'Escolher da biblioteca'}
                            </Button>
                          )}
                        </div>
                        <input
                          ref={productFileInput}
                          type="file"
                          accept={ACCEPTED_IMAGE_TYPES.join(',')}
                          className="hidden"
                          aria-label={`Enviar print do ${product.name}`}
                          onChange={(event) => {
                            void uploadProductImage(event.target.files?.[0]);
                            event.target.value = '';
                          }}
                        />
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

            </div>
          </Step>

          <Step number={4} title="As fotos do carrossel">
            {folderCounts.size > 0 ? (
              <FolderPicker label="De quais pastas da biblioteca" counts={folderCounts} selected={folders} onChange={setFolders} disabled={generating} />
            ) : (
              <p className="text-sm text-muted">
                Sua biblioteca está vazia, então os slides saem só com texto.{' '}
                <Link to="/biblioteca" className="font-medium text-ink underline underline-offset-4 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                  Subir fotos na Biblioteca
                </Link>
              </p>
            )}
            {folderCounts.size > 0 && (
              <p className="mt-2 text-xs text-faint">
                {folders.length > 0
                  ? 'Cada slide ganha uma foto das pastas marcadas: primeiro a que combina com a frase pelas tags, senão outra da pasta, sem repetir. Depois dá pra trocar qualquer uma no editor.'
                  : 'Com "Todas", só entra foto cuja tag combine com a frase; o resto sai só com texto. Pra ter foto em todo slide (como a Ella), marque a pasta das fotos dessa conta.'}
              </p>
            )}
          </Step>

          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:p-5 sm:items-center sm:justify-between">
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

function Step({ number, title, children }: { number: number; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`step-${number}`} className="border-b border-line p-4 last:border-b-0 sm:p-5">
      <h2 id={`step-${number}`} className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
        <span className="grid size-6 place-items-center rounded-full bg-ink text-xs font-semibold text-surface" aria-hidden>
          {number}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function FormatCard({ format, use, active, onClick, disabled }: { format: CarouselFormat; use: string; active: boolean; onClick: () => void; disabled: boolean }) {
  const { width, height } = FORMAT_SIZES[format];
  const iconHeight = 28;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60',
        active ? 'bg-accent/10 ring-2 ring-accent' : 'ring-1 ring-line hover:ring-faint',
      )}
    >
      <span className="grid w-7 shrink-0 place-items-center" aria-hidden>
        <span className={clsx('block rounded-[3px] border-2', active ? 'border-accent' : 'border-faint')} style={{ height: iconHeight * Math.min(1, height / width / 1.78) + 8, aspectRatio: `${width} / ${height}` }} />
      </span>
      <span className="min-w-0">
        <span className={clsx('block text-sm font-semibold', active ? 'text-ink' : 'text-muted')}>{format}</span>
        <span className="block truncate text-xs text-faint">{use}</span>
        <span className="block text-[11px] text-faint">{formatSizeLabel(format)}</span>
      </span>
    </button>
  );
}

function ChoiceCard({ active, onClick, title, detail }: { active: boolean; onClick: () => void; title: string; detail: string }) {
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
