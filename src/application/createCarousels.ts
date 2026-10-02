import { inFolders, isAppImage, type Asset } from '../domain/asset';
import type { CarouselDraft } from '../domain/aiContract';
import { productOf, VISUAL_STYLE_LABELS, type BrandKit, type BrandProduct, type VisualStyle } from '../domain/brandKit';
import type { Carousel, CarouselFormat, CopyMode, ExperimentRef, Platform, ProductDisplay, Slide, TextStyle } from '../domain/carousel';
import { composeSlides, slidesWantingImages, slideText } from '../domain/composeCarousel';
import { isPhotoLike } from '../domain/asset';
import type { ContentCategory, ContentType, Objective, SlideCountOption } from '../domain/content';
import { hasNumberedSlides, marksProductSlide, parseScript } from '../domain/script';
import type { ImageShade } from '../domain/shade';
import type { ContentOrigin } from '../domain/winners/record';
import { distributeDates, type SchedulePlan } from '../domain/schedule';
import { recentPhotoUsage } from '../domain/photoHistory';
import { limitWords, stripTrailingPeriod } from '../domain/text';
import { brandContext } from './brandContext';
import type { Services } from './ports';

const ASSET_CONTEXT_LIMIT = 400;
export const MAX_TEST_VARIANTS = 4;

export interface CreateRequest {
  platform: Platform;
  /** Account posting the carousel; its name, @ and photo go in the post-style header. */
  accountId: string | null;
  format: CarouselFormat;
  brand: BrandKit;
  library: Asset[];
  mode: CopyMode;
  /** One entry per copy box. Each written script may hold several carousels; each loose copy becomes one. */
  texts: string[];
  /** Batch defaults: used by every copy that has no choice of its own. */
  contentType: ContentType;
  objective: Objective;
  /** Per copy box, same order as texts. Null fields fall back to the batch defaults. */
  copySettings?: CopySetting[];
  slideCount: SlideCountOption;
  folders: string[];
  /** One style = regular creation. Two or more = a format test with one variant per style. */
  styles: VisualStyle[];
  /** Manual mode only: append the objective CTA as a last slide. */
  addCta: boolean;
  /** Darkening applied to every photo of every carousel created. */
  shade: ImageShade;
  /** Post model only: false keeps the text alone in the center, under the profile header. */
  postWithImages: boolean;
  /** Text size, width and line spacing for every slide. */
  textStyle: TextStyle;
  /** Where the carousels are filed in Projetos. */
  project: string;
  folder: string;
  /** Spreads the carousels over days; variants of a format test share their day. Null leaves them unscheduled. */
  schedule: SchedulePlan | null;
  /** Show the brand's product in one slide: placed by the AI, or the slide marked PRODUTO in a written script. */
  includeProduct: boolean;
  /** Image for the product slide picked at creation time. Undefined keeps the one saved in the brand kit. */
  productImageAssetId?: string | null;
  /** Print filling the product slide, or a cut-out card over a photo. */
  productDisplay?: ProductDisplay;
  /** Set when the copies were created from a winner, so they show up in its family. */
  origin?: ContentOrigin | null;
  /** Planned on the calendar: theme, category and time go with every carousel of the request. */
  plan?: { theme?: string; category?: ContentCategory; scheduledTime?: string | null };
  /** Joins every carousel to an experiment under this variant name. */
  experiment?: ExperimentRef | null;
}

/** Objective and type picked for one copy box. */
export interface CopySetting {
  objective: Objective | null;
  contentType: ContentType | null;
  /** Slide model of this copy (from the Analytics plan); ignored in a format test. */
  style?: VisualStyle | null;
  slideCount?: SlideCountOption | null;
  /** Direction for the writing AI, e.g. the account's winning hooks. */
  guidance?: string | null;
  /** App or product image of this copy alone; wins over the batch image in its product slide. */
  productImageAssetId?: string | null;
}

export interface CreateResult {
  carousels: Carousel[];
  experimentIds: string[];
}

interface PreparedCopy {
  draft: CarouselDraft;
  caption: string;
  copy: string;
  /** 'manual' keeps every word as written; 'ai' was structured by the engine. */
  mode: CopyMode;
  objective: Objective;
  contentType: ContentType;
  /** Slide model chosen for this copy alone, when not testing formats. */
  style?: VisualStyle;
  /** Image the product slide shows; null leaves the copy without one. */
  productImageId: string | null;
  /** Position of the copy box, for error messages. */
  copyNumber: number;
}

/** Creates every carousel the request implies: one per script block (batch) times one per style (format test). */
export async function createCarousels(services: Services, request: CreateRequest): Promise<CreateResult> {
  const styles = [...new Set(request.styles)].slice(0, MAX_TEST_VARIANTS);
  if (styles.length === 0) throw new Error('Escolha pelo menos um estilo visual.');

  const product = request.includeProduct ? productForRequest(request) : null;
  const copyImages = (request.copySettings ?? []).map((setting) => setting?.productImageAssetId ?? null);
  const brandOnly = new Set([request.brand.logoAssetId, request.brand.avatarAssetId, product?.imageAssetId, ...copyImages].filter(Boolean));
  // App prints and mockups only go in the slide the copy marks as APP or PRODUTO.
  const assets = request.library.filter((asset) => !brandOnly.has(asset.id) && inFolders(asset, request.folders) && !isAppImage(asset));
  const copies: PreparedCopy[] = [];
  for (const [index, raw] of request.texts.entries()) {
    const text = raw.trim();
    if (!text) continue;
    const setting = request.copySettings?.[index];
    const defaults = { objective: setting?.objective ?? request.objective, contentType: setting?.contentType ?? request.contentType };
    const style = styles.length === 1 ? (setting?.style ?? undefined) : undefined;
    const tuning = { slideCount: setting?.slideCount ?? request.slideCount, guidance: setting?.guidance ?? null };
    const productImageId = copyImages[index] ?? product?.imageAssetId ?? null;
    // The product only shows where the copy asks for it (SLIDE - APP, SLIDE 6 — PRODUTO).
    const copyProduct = product && marksProductSlide(text) ? { ...product, imageAssetId: productImageId } : null;
    // Numbered slides mean the user already split the copy: keep their slides even in AI mode.
    const prepared = request.mode === 'manual' || hasNumberedSlides(text) ? manualCopies(text, defaults) : [await aiCopy(services, request, text, style ?? styles[0], assets, copyProduct, defaults, tuning)];
    copies.push(...prepared.map((copy) => ({ ...copy, style, productImageId, copyNumber: index + 1 })));
  }
  if (copies.length === 0) throw new Error('Escreva pelo menos uma linha de texto.');
  assertAppSlidesHaveImage(copies);

  const isTest = styles.length > 1;
  const carousels: Carousel[] = [];
  const experimentIds: string[] = [];
  const dates = request.schedule ? distributeDates(copies.length, request.schedule) : [];
  const textOnly = (style: VisualStyle) => style === 'post' && !request.postWithImages;
  // Shared by the whole batch and seeded with the account's recent posts: each copy gets photos
  // neither the other copies nor last weeks' carousels used yet.
  const usage: PhotoUsage = recentPhotoUsage(await services.carousels.list(), { brandKitId: request.brand.id, accountId: request.accountId });

  for (const [position, prepared] of copies.entries()) {
    const { caption, copy } = prepared;
    // A format test makes one variant per style; otherwise the copy may have its own style.
    const copyStyles = isTest ? styles : [prepared.style ?? styles[0]];
    const photoStyles = copyStyles.filter((style) => !textOnly(style));
    // As a card, the product slide needs a background photo like any other slide.
    const fullPrint = request.productDisplay === 'card' ? null : prepared.productImageId;
    const draft = await withMatchedPhotos(services, prepared.draft, assets, photoStyles, fullPrint, usage);
    const experimentId = isTest ? crypto.randomUUID() : null;
    if (experimentId) experimentIds.push(experimentId);
    let previous: Slide[] | null = null;

    for (const style of copyStyles) {
      // Variants share the images already picked so the test isolates the format, not the photo.
      const shared: CarouselDraft = previous
        ? { ...draft, slides: draft.slides.map((slide, index) => ({ ...slide, assetId: previous?.[index]?.assetId ?? slide.assetId })) }
        : draft;
      const slides = composeSlides(shared, {
        objective: prepared.objective,
        assets,
        visualStyle: style,
        preserveText: prepared.mode === 'manual',
        addCta: prepared.mode === 'ai' || request.addCta,
        productAssetId: prepared.productImageId,
        productDisplay: request.productDisplay ?? 'full',
        autoMatch: false,
        textOnly: textOnly(style),
        textStyle: request.textStyle,
      });
      previous = slides;

      const experiment: ExperimentRef | null = experimentId ? { id: experimentId, name: draft.title, variant: VISUAL_STYLE_LABELS[style] } : (request.experiment ?? null);
      carousels.push(
        await services.carousels.create({
          brandKitId: request.brand.id,
          title: isTest ? `${draft.title} · ${VISUAL_STYLE_LABELS[style]}` : draft.title,
          status: 'draft',
          format: request.format,
          source: {
            copy,
            contentType: prepared.contentType,
            objective: prepared.objective,
            visualStyle: style,
            slideCount: request.slideCount,
            folders: request.folders,
            copyMode: prepared.mode,
            shade: request.shade,
            accountId: request.accountId,
            ...(request.plan ?? {}),
          },
          slides,
          caption,
          experiment,
          metrics: null,
          project: request.project.trim(),
          folder: request.folder.trim(),
          scheduledFor: dates[position] ?? null,
          origin: request.origin ?? null,
        }),
      );
    }
    // Format test variants reuse the same photos on purpose, so they count once.
    for (const slide of previous ?? []) if (slide.assetId) usage.set(slide.assetId, (usage.get(slide.assetId) ?? 0) + 1);
  }

  return { carousels, experimentIds };
}

/** How many carousels (recent ones of the account plus the current batch) already use each photo. */
type PhotoUsage = Map<string, number>;

/**
 * Every slide that wants a photo (in any of the chosen styles) gets one that fits its text.
 * Photos not used by earlier carousels of the batch come first, so different copies get different photos;
 * a photo repeats only when the library runs out, and then the least used one goes.
 * Slides no photo matched by text still get one from the chosen folders, so no slide is left empty.
 * A photo never repeats inside the same carousel: when the library runs out, the remaining slides stay text-only.
 * Photos the AI already picked while drafting are kept.
 */
/** The slide marked APP or PRODUTO in a written copy shows the app image: never a random photo, so creation stops when it has none. */
function assertAppSlidesHaveImage(copies: PreparedCopy[]): void {
  const missing = [...new Set(copies.filter((copy) => copy.mode === 'manual' && !copy.productImageId && copy.draft.slides.some((slide) => slide.role === 'product')).map((copy) => copy.copyNumber))];
  if (missing.length === 0) return;
  const which = missing.length === 1 ? `A copy ${missing[0]} tem` : `As copys ${missing.join(', ')} têm`;
  throw new Error(`${which} slide do app, mas nenhuma imagem do app foi escolhida. Use "Enviar" ou "Biblioteca" embaixo da copy.`);
}

/** A copy as written or drafted, before the batch gives it its number and app image. */
type DraftedCopy = Omit<PreparedCopy, 'productImageId' | 'copyNumber'>;

async function withMatchedPhotos(
  services: Services,
  draft: CarouselDraft,
  assets: Asset[],
  styles: VisualStyle[],
  productAssetId: string | null,
  usage: PhotoUsage,
): Promise<CarouselDraft> {
  const photos = assets.filter(isPhotoLike);
  const known = new Set(photos.map((asset) => asset.id));
  const wants = styles.map((style) => slidesWantingImages(draft, style));
  const pending = draft.slides
    .map((slide, index) => ({ slide, index }))
    // The product slide shows the product image; without one it is a regular slide.
    .filter(({ slide, index }) => !(slide.role === 'product' && productAssetId) && wants.some((list) => list[index]) && !(slide.assetId && known.has(slide.assetId)));
  if (styles.length === 0 || pending.length === 0 || photos.length === 0) return draft;

  const alreadyUsed = new Set(draft.slides.map((slide) => slide.assetId).filter(Boolean));
  const candidates = photos.filter((asset) => !alreadyUsed.has(asset.id));
  if (candidates.length === 0) return draft;

  const slides = draft.slides.map((slide) => ({ ...slide }));
  const fresh = candidates.filter((asset) => !usage.get(asset.id));
  const used = candidates.filter((asset) => usage.get(asset.id));
  // First only photos no other copy used; then, for slides still empty, photos that fit even if already used.
  for (const pool of [fresh, used]) {
    const open = pending.filter(({ index }) => !slides[index].assetId);
    const unpicked = pool.filter((asset) => !slides.some((slide) => slide.assetId === asset.id));
    if (open.length === 0 || unpicked.length === 0) continue;
    const matched = await services.ai.matchImages({
      slides: open.map(({ slide }) => ({ text: slideText(slide) })),
      assets: unpicked.slice(0, ASSET_CONTEXT_LIMIT).map(({ id, name, folder, kind, tags }) => ({ id, name, folder, kind, tags })),
    });
    open.forEach(({ index }, position) => {
      slides[index].assetId = matched[position] ?? null;
    });
  }
  fillFromFolder(slides, pending.map(({ index }) => index), candidates, usage);
  for (const slide of slides) if (slide.assetId) slide.wantsImage = true;
  return { ...draft, slides };
}

/** Gives every still empty slide a photo the carousel does not show yet: unused in the whole batch first, least used when they run out. */
function fillFromFolder(slides: CarouselDraft['slides'], indexes: number[], photos: Asset[], usage: PhotoUsage): void {
  for (const index of indexes) {
    if (slides[index].assetId) continue;
    const inCarousel = new Set(slides.map((slide) => slide.assetId).filter(Boolean));
    const options = photos.filter((photo) => !inCarousel.has(photo.id));
    if (options.length === 0) return;
    const leastUsed = Math.min(...options.map((photo) => usage.get(photo.id) ?? 0));
    const tied = options.filter((photo) => (usage.get(photo.id) ?? 0) === leastUsed);
    slides[index].assetId = tied[Math.floor(Math.random() * tied.length)].id;
  }
}

function productForRequest(request: CreateRequest): BrandProduct | null {
  const product = productOf(request.brand);
  if (!product || request.productImageAssetId === undefined) return product;
  return { ...product, imageAssetId: request.productImageAssetId };
}

/** Written scripts: an "Objetivo:" or "Tipo:" line inside a carousel wins over the screen choice. */
function manualCopies(text: string, defaults: Pick<PreparedCopy, 'objective' | 'contentType'>): DraftedCopy[] {
  return parseScript(text).map((block) => ({
    mode: 'manual' as const,
    objective: block.objective ?? defaults.objective,
    contentType: block.contentType ?? defaults.contentType,
    caption: block.caption,
    copy: block.slides.join('\n'),
    draft: {
      title: block.title || limitWords(stripTrailingPeriod(block.slides[0].replace(/\n/g, ' ')), 8),
      caption: block.caption,
      slides: block.slides.map((line, index) => ({
        role: index === block.productIndex ? 'product' : index === 0 ? 'hook' : 'point',
        title: line,
        subtitle: null,
        body: null,
        bullets: [],
        assetId: null,
        layout: null,
        wantsImage: index === block.productIndex || index % 2 === 0,
      })),
    },
  }));
}

async function aiCopy(
  services: Services,
  request: CreateRequest,
  text: string,
  style: VisualStyle,
  assets: Asset[],
  product: BrandProduct | null,
  { objective, contentType }: Pick<PreparedCopy, 'objective' | 'contentType'>,
  { slideCount, guidance }: { slideCount: SlideCountOption; guidance: string | null },
): Promise<DraftedCopy> {
  const draft = await services.ai.draftCarousel({
    copy: text,
    contentType,
    objective,
    visualStyle: style,
    slideCount: slideCount === 'auto' ? null : slideCount,
    guidance,
    brand: brandContext(request.brand),
    product: product ? { name: product.name.trim(), pitch: product.pitch.trim(), hasImage: product.imageAssetId !== null } : null,
    assets: assets.slice(0, ASSET_CONTEXT_LIMIT).map(({ id, name, folder, kind, tags }) => ({ id, name, folder, kind, tags })),
  });
  // Without a marked slide the model may still call one "product": it stays a regular slide, without the print.
  const slides = product ? draft.slides : draft.slides.map((slide) => (slide.role === 'product' ? { ...slide, role: 'point' as const } : slide));
  return { mode: 'ai', objective, contentType, draft: { ...draft, slides, title: draft.title || draft.slides[0].title }, caption: draft.caption, copy: text };
}
