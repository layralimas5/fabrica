import { isIsoDate } from '../domain/schedule';
import { accountLabel, identityOf, isActiveAccount, type Account } from '../domain/account';
import { CAROUSEL_FORMATS, formatSizeLabel, PLATFORM_LABELS } from '../domain/carousel';
import { shadeOf } from '../domain/shade';
import { ArrowLeft, BarChart3, Check, CloudOff, Eye, FolderDown, Loader2, Star, Wand2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAccounts, useAssets, useBrandKits, useCarousels, useContentRecords } from '../app/data';
import { SimilarityNotice, TestPanel } from '../editor/EditorPanels';
import { CONTENT_CATEGORIES, CONTENT_CATEGORY_LABELS, type ContentCategory } from '../domain/content';
import { SaveToFolderDialog } from '../editor/SaveToFolderDialog';
import { useServices } from '../app/services';
import type { RenderContext } from '../app/slideRendering';
import { errorMessage } from '../app/useResource';
import { brandContext } from '../application/brandContext';
import type { Asset } from '../domain/asset';
import { brandForCarousel, type BrandKit } from '../domain/brandKit';
import { CAROUSEL_STATUSES, categoryOf, DEFAULT_CARD, isPosted, nextToReview, normalizeTags, STATUS_LABELS, type Carousel, type CarouselFormat, type CarouselStatus } from '../domain/carousel';
import { layoutWithImage } from '../domain/layouts';
import { ExportMenu } from '../editor/ExportMenu';
import { Filmstrip } from '../editor/Filmstrip';
import { HooksDialog } from '../editor/HooksDialog';
import { ImagePickerDialog } from '../editor/ImagePickerDialog';
import { Inspector } from '../editor/Inspector';
import { SlideStage } from '../editor/SlideStage';
import { useCarouselEditor, type SaveState } from '../editor/useCarouselEditor';
import { CarouselViewer } from '../ui/CarouselViewer';
import { Alert, Button, EmptyState, Field, Input, Select, Spinner, Textarea } from '../ui/primitives';
import { useMarkWinner } from '../winners/useMarkWinner';
import { useAddMetrics } from '../winners/useAddMetrics';

export function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const { carousels } = useServices();
  const brands = useBrandKits();
  const assets = useAssets();
  const accounts = useAccounts();
  const [carousel, setCarousel] = useState<Carousel | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    carousels
      .get(id)
      .then(setCarousel)
      .catch((cause: unknown) => setError(errorMessage(cause)));
  }, [carousels, id]);

  if (error) return <Alert>{error}</Alert>;
  if (carousel === undefined || brands.loading || assets.loading || accounts.loading) return <Spinner label="Abrindo o carrossel" />;
  if (carousel === null) return <EmptyState title="Carrossel não encontrado" description="Ele pode ter sido excluído." action={<Link to="/projetos" className="text-sm text-accent underline">Ver projetos</Link>} />;

  const brand = brandForCarousel(carousel, brands.data, accounts.data);
  if (!brand) return <Alert>Nenhum Brand Kit cadastrado. Crie uma marca pra editar esse carrossel.</Alert>;

  return <Editor key={carousel.id} initial={carousel} brand={brand} assets={assets.data} accounts={accounts.data} />;
}

function Editor({ initial, brand, assets, accounts }: { initial: Carousel; brand: BrandKit; assets: Asset[]; accounts: Account[] }) {
  const services = useServices();
  const editor = useCarouselEditor(services.carousels, initial);
  const { carousel } = editor;
  const account = accounts.find((item) => item.id === carousel.source.accountId);
  /** Which image the picker is choosing: the slide photo or the app cut-out over it. */
  const [picking, setPicking] = useState<'photo' | 'card' | null>(null);
  const [hooksOpen, setHooksOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [folderOpen, setFolderOpen] = useState(false);
  const allCarousels = useCarousels();
  const records = useContentRecords();
  const navigate = useNavigate();
  const next = useMemo(() => nextToReview(carousel, allCarousels.data), [carousel, allCarousels.data]);
  const [aiBusy, setAiBusy] = useState<'shorten' | 'variation' | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  // A posted carousel marked as a winner gets the "Vencedor" status too.
  const winner = useMarkWinner((marked) => isPosted(marked) && editor.setStatus('winner'));
  const [tagsDraft, setTagsDraft] = useState<string | null>(null);
  const tagsText = tagsDraft ?? (carousel.source.tags ?? []).join(', ');
  // After the first numbers, a posted carousel moves to "Em análise".
  const metrics = useAddMetrics(() => carousel.status === 'published' && editor.setStatus('analyzing'));

  const index = Math.max(0, carousel.slides.findIndex((slide) => slide.id === editor.selectedId));
  const slide = carousel.slides[index];

  const context: RenderContext = useMemo(
    () => ({
      brand,
      assets,
      repo: services.assets,
      format: carousel.format,
      visualStyle: carousel.source.visualStyle,
      total: carousel.slides.length,
      shade: shadeOf(carousel.source),
      account: account ? identityOf(account) : null,
    }),
    [brand, assets, services.assets, carousel.format, carousel.source.visualStyle, carousel.slides.length, carousel.source.shade, account],
  );

  const rewrite = useCallback(
    async (mode: 'shorten' | 'variation') => {
      setAiBusy(mode);
      setAiError(null);
      try {
        const text = await services.ai.rewriteSlide({
          mode,
          role: slide.role,
          slide: { title: slide.title, subtitle: slide.subtitle, body: slide.body, bullets: slide.bullets },
          copy: carousel.source.copy,
          brand: brandContext(brand),
        });
        editor.updateSlide(slide.id, text);
      } catch (cause) {
        setAiError(errorMessage(cause));
      } finally {
        setAiBusy(null);
      }
    },
    [services.ai, slide, carousel.source.copy, brand, editor],
  );

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-6 flex flex-wrap items-center gap-3">
        <Link to="/projetos" aria-label="Voltar para projetos" className="grid size-10 place-items-center rounded-xl text-muted hover:bg-subtle hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
          <ArrowLeft className="size-4" aria-hidden />
        </Link>
        <label htmlFor="carousel-title" className="sr-only">
          Título do carrossel
        </label>
        <input
          id="carousel-title"
          value={carousel.title}
          onChange={(e) => editor.setTitle(e.target.value)}
          className="min-w-0 flex-1 rounded-lg bg-transparent px-2 py-1 text-lg font-semibold tracking-tight text-ink outline-none hover:bg-subtle focus-visible:bg-surface focus-visible:ring-2 focus-visible:ring-accent"
        />
        <SaveIndicator state={editor.saveState} />
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="carousel-format" className="sr-only">Formato</label>
          <Select id="carousel-format" value={carousel.format} onChange={(e) => editor.setFormat(e.target.value as CarouselFormat)} className="!w-auto">
            {CAROUSEL_FORMATS.map((format) => (
              <option key={format} value={format}>
                {format} · {formatSizeLabel(format)}
              </option>
            ))}
          </Select>
          {accounts.length > 0 && (
            <>
              <label htmlFor="carousel-account" className="sr-only">Conta</label>
              <Select id="carousel-account" value={carousel.source.accountId ?? ''} onChange={(e) => editor.setAccount(e.target.value || null)} className="!w-auto">
                {!carousel.source.accountId && <option value="">Sem conta ({brand.name})</option>}
                {accounts.filter((item) => isActiveAccount(item) || item.id === carousel.source.accountId).map((item) => (
                  <option key={item.id} value={item.id}>
                    {accountLabel(item)} · {PLATFORM_LABELS[item.platform]}
                  </option>
                ))}
              </Select>
            </>
          )}
          <label htmlFor="carousel-status" className="sr-only">Status</label>
          <Select id="carousel-status" value={carousel.status} onChange={(e) => editor.setStatus(e.target.value as CarouselStatus)} className="!w-auto">
            {CAROUSEL_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </Select>
          <Button variant="secondary" onClick={() => setPreviewOpen(true)}>
            <Eye className="size-4" aria-hidden /> Ver prévia
          </Button>
          <Button variant="secondary" onClick={() => setHooksOpen(true)}>
            <Wand2 className="size-4" aria-hidden /> Novos ganchos
          </Button>
          {isPosted(carousel) && (
            <Button variant="secondary" disabled={!metrics.ready} onClick={() => metrics.open(carousel)}>
              <BarChart3 className="size-4" aria-hidden /> {metrics.recordOf(carousel)?.metricsUpdatedAt || carousel.metrics ? 'Atualizar métricas' : 'Adicionar métricas'}
            </Button>
          )}
          <Button variant="secondary" disabled={!winner.ready} onClick={() => winner.mark(carousel)}>
            <Star className={winner.isWinner(carousel) ? 'size-4 fill-amber-400 text-amber-500' : 'size-4'} aria-hidden />
            {winner.isWinner(carousel) ? 'Vencedor' : 'Marcar como vencedor'}
          </Button>
          <Button variant="primary" onClick={() => setFolderOpen(true)}>
            <FolderDown className="size-4" aria-hidden /> OK, salvar na pasta
          </Button>
          <ExportMenu context={context} carousel={carousel} selectedIndex={index} onExported={() => carousel.status !== 'published' && editor.setStatus('ready')} />
        </div>
      </header>

      <div className="mb-4 empty:hidden">
        <SimilarityNotice carousel={carousel} carousels={allCarousels.data} records={records.data} />
      </div>

      {editor.saveError && (
        <div className="mb-4">
          <Alert>Não salvou: {editor.saveError}</Alert>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-8">
          <SlideStage context={context} slide={slide} index={index} onMove={(offsetX, offsetY) => editor.updateSlide(slide.id, { style: { ...slide.style, offsetX, offsetY } })} />
          <Filmstrip context={context} slides={carousel.slides} selectedId={slide.id} onSelect={editor.setSelectedId} onReorder={editor.reorder} onAdd={() => editor.addSlide(slide.id)} />
          <Field label="Legenda do post" htmlFor="carousel-caption" hint="Vai junto no ZIP como legenda.txt.">
            <Textarea id="carousel-caption" rows={3} value={carousel.caption} onChange={(e) => editor.setCaption(e.target.value)} maxLength={2200} placeholder="Escreva a legenda e as hashtags…" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Projeto" htmlFor="carousel-project">
              <Input id="carousel-project" value={carousel.project} onChange={(e) => editor.setPlan({ project: e.target.value })} maxLength={60} placeholder="Sem projeto" />
            </Field>
            <Field label="Pasta" htmlFor="carousel-folder">
              <Input id="carousel-folder" value={carousel.folder} onChange={(e) => editor.setPlan({ folder: e.target.value })} maxLength={60} placeholder="Sem pasta" />
            </Field>
            <Field label="Dia de postar" htmlFor="carousel-date" hint="Aparece no Calendário.">
              <Input id="carousel-date" type="date" value={carousel.scheduledFor ?? ''} onChange={(e) => editor.setPlan({ scheduledFor: isIsoDate(e.target.value) ? e.target.value : null })} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Tema" htmlFor="carousel-theme" hint="Ex.: constância. Aparece em Temas vencedores.">
              <Input id="carousel-theme" value={carousel.source.theme ?? ''} onChange={(e) => editor.setLabels({ theme: e.target.value.slice(0, 60) })} placeholder="Sem tema" />
            </Field>
            <Field label="Tags" htmlFor="carousel-tags" hint="Separadas por vírgula: dor, identificação, ugc." className="sm:col-span-2">
              <Input
                id="carousel-tags"
                value={tagsText}
                onChange={(e) => {
                  setTagsDraft(e.target.value);
                  editor.setLabels({ tags: normalizeTags(e.target.value) });
                }}
                placeholder="#dor, #identificação"
              />
            </Field>
            <Field label="Categoria" htmlFor="carousel-category">
              <Select id="carousel-category" value={categoryOf(carousel.source)} onChange={(e) => editor.setSchedule({ category: e.target.value as ContentCategory })}>
                {CONTENT_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {CONTENT_CATEGORY_LABELS[category]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Horário" htmlFor="carousel-time" hint="Com horário, aparece como Agendado.">
              <Input id="carousel-time" type="time" value={carousel.source.scheduledTime ?? ''} onChange={(e) => editor.setSchedule({ scheduledTime: e.target.value || null })} />
            </Field>
          </div>
          <TestPanel carousel={carousel} onChange={editor.setExperiment} />
        </div>

        <aside className="rounded-2xl border border-line bg-surface p-5 lg:sticky lg:top-8 lg:max-h-[calc(100dvh-4rem)] lg:overflow-y-auto">
          <Inspector
            key={slide.id}
            slide={slide}
            index={index}
            total={carousel.slides.length}
            assets={assets}
            defaultHeadingFont={brand.typography.headingFont}
            aiBusy={aiBusy}
            aiError={aiError}
            onChange={(patch) => editor.updateSlide(slide.id, patch)}
            onTextStyleForAll={editor.setTextStyleForAll}
            shadeContext={context}
            onShadeChange={editor.setShade}
            onPickImage={() => setPicking('photo')}
            onPickCard={() => setPicking('card')}
            onRewrite={(mode) => void rewrite(mode)}
            onDuplicate={() => editor.duplicate(slide.id)}
            onDelete={() => editor.removeSlide(slide.id)}
            onMove={(direction) => editor.move(slide.id, direction)}
          />
        </aside>
      </div>

      <ImagePickerDialog
        open={picking !== null}
        title={picking === 'card' ? 'Recorte do app' : undefined}
        assets={assets}
        currentId={picking === 'card' ? (slide.card?.assetId ?? null) : slide.assetId}
        carouselFolders={carousel.source.folders ?? []}
        slideText={[slide.title, slide.subtitle, slide.body, ...slide.bullets].filter(Boolean).join(' ')}
        onClose={() => setPicking(null)}
        onPick={(assetId) => {
          if (picking === 'card') editor.updateSlide(slide.id, { card: { ...DEFAULT_CARD, ...slide.card, assetId } });
          else editor.updateSlide(slide.id, { assetId, layout: layoutWithImage(slide.layout, carousel.source.visualStyle, Boolean(slide.card)) });
          setPicking(null);
        }}
      />
      {winner.dialog}
      {metrics.dialog}
      <SaveToFolderDialog
        open={folderOpen}
        onClose={() => setFolderOpen(false)}
        context={context}
        carousel={carousel}
        next={next}
        onSaved={() => carousel.status !== 'published' && editor.setStatus('ready')}
        onNext={(item) => navigate(`/carrossel/${item.id}`)}
      />
      <CarouselViewer open={previewOpen} onClose={() => setPreviewOpen(false)} context={context} carousel={carousel} />
      <HooksDialog
        open={hooksOpen}
        hook={carousel.slides[0].title}
        copy={carousel.source.copy}
        brand={brand}
        onClose={() => setHooksOpen(false)}
        onPick={(hook) => {
          editor.updateSlide(carousel.slides[0].id, { title: hook });
          editor.setSelectedId(carousel.slides[0].id);
          setHooksOpen(false);
        }}
      />
    </div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  const content: Record<SaveState, { icon: React.ReactNode; label: string }> = {
    saved: { icon: <Check className="size-3.5" aria-hidden />, label: 'Salvo' },
    pending: { icon: <Loader2 className="size-3.5 animate-spin" aria-hidden />, label: 'Salvando…' },
    saving: { icon: <Loader2 className="size-3.5 animate-spin" aria-hidden />, label: 'Salvando…' },
    error: { icon: <CloudOff className="size-3.5" aria-hidden />, label: 'Não salvo' },
  };
  return (
    <span className="flex items-center gap-1.5 text-xs text-faint" aria-live="polite">
      {content[state].icon}
      {content[state].label}
    </span>
  );
}
