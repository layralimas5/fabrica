import { inFolders, type Asset } from '../domain/asset';
import type { CarouselDraft } from '../domain/aiContract';
import { productOf, VISUAL_STYLE_LABELS, type BrandKit, type BrandProduct, type VisualStyle } from '../domain/brandKit';
import type { Carousel, CarouselFormat, CopyMode, ExperimentRef, Platform, Slide } from '../domain/carousel';
import { composeSlides, slidesWantingImages, slideText } from '../domain/composeCarousel';
import { isPhotoLike } from '../domain/asset';
import type { ContentType, Objective, SlideCountOption } from '../domain/content';
import { hasNumberedSlides, parseScript } from '../domain/script';
import type { ImageShade } from '../domain/shade';
import { distributeDates, type SchedulePlan } from '../domain/schedule';
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
  contentType: ContentType;
  objective: Objective;
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
  /** Where the carousels are filed in Projetos. */
  project: string;
  folder: string;
  /** Spreads the carousels over days; variants of a format test share their day. Null leaves them unscheduled. */
  schedule: SchedulePlan | null;
  /** Show the brand's product in one slide: placed by the AI, or the slide marked PRODUTO in a written script. */
  includeProduct: boolean;
  /** Image for the product slide picked at creation time. Undefined keeps the one saved in the brand kit. */
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
}

/** Creates every carousel the request implies: one per script block (batch) times one per style (format test). */
export async function createCarousels(services: Services, request: CreateRequest): Promise<CreateResult> {
  const styles = [...new Set(request.styles)].slice(0, MAX_TEST_VARIANTS);
  if (styles.length === 0) throw new Error('Escolha pelo menos um estilo visual.');

  const product = request.includeProduct ? productForRequest(request) : null;
  const brandOnly = new Set([request.brand.logoAssetId, request.brand.avatarAssetId, product?.imageAssetId].filter(Boolean));
  const assets = request.library.filter((asset) => !brandOnly.has(asset.id) && inFolders(asset, request.folders));
  const copies: PreparedCopy[] = [];
  for (const text of request.texts.map((item) => item.trim()).filter(Boolean)) {
    // Numbered slides mean the user already split the copy: keep their slides even in AI mode.
    if (request.mode === 'manual' || hasNumberedSlides(text)) copies.push(...manualCopies(text));
    else copies.push(await aiCopy(services, request, text, styles[0], assets, product));
  }
  if (copies.length === 0) throw new Error('Escreva pelo menos uma linha de texto.');

  const isTest = styles.length > 1;
  const carousels: Carousel[] = [];
  const experimentIds: string[] = [];
  const dates = request.schedule ? distributeDates(copies.length, request.schedule) : [];
  const textOnly = (style: VisualStyle) => style === 'post' && !request.postWithImages;
  // Shared by the whole batch: each copy gets photos the others have not used yet.
  const usage: PhotoUsage = new Map();

  for (const [position, prepared] of copies.entries()) {
    const { caption, copy } = prepared;
    const photoStyles = styles.filter((style) => !textOnly(style));
    const draft = await withMatchedPhotos(services, prepared.draft, assets, photoStyles, request.folders.length > 0, product?.imageAssetId ?? null, usage);
    const experimentId = isTest ? crypto.randomUUID() : null;
    if (experimentId) experimentIds.push(experimentId);
    let previous: Slide[] | null = null;

    for (const style of styles) {
      // Variants share the images already picked so the test isolates the format, not the photo.
      const shared: CarouselDraft = previous
        ? { ...draft, slides: draft.slides.map((slide, index) => ({ ...slide, assetId: previous?.[index]?.assetId ?? slide.assetId })) }
        : draft;
      const slides = composeSlides(shared, {
        objective: request.objective,
        assets,
        visualStyle: style,
        preserveText: prepared.mode === 'manual',
        addCta: prepared.mode === 'ai' || request.addCta,
        productAssetId: product?.imageAssetId ?? null,
        autoMatch: false,
        textOnly: textOnly(style),
      });
      previous = slides;

      const experiment: ExperimentRef | null = experimentId ? { id: experimentId, name: draft.title, variant: VISUAL_STYLE_LABELS[style] } : null;
      carousels.push(
        await services.carousels.create({
          brandKitId: request.brand.id,
          title: isTest ? `${draft.title} · ${VISUAL_STYLE_LABELS[style]}` : draft.title,
          status: 'draft',
          format: request.format,
          source: {
            copy,
            contentType: request.contentType,
            objective: request.objective,
            visualStyle: style,
            slideCount: request.slideCount,
            folders: request.folders,
            copyMode: prepared.mode,
            shade: request.shade,
            accountId: request.accountId,
          },
          slides,
          caption,
          experiment,
          metrics: null,
          project: request.project.trim(),
          folder: request.folder.trim(),
          scheduledFor: dates[position] ?? null,
        }),
      );
    }
    // Format test variants reuse the same photos on purpose, so they count once.
    for (const slide of previous ?? []) if (slide.assetId) usage.set(slide.assetId, (usage.get(slide.assetId) ?? 0) + 1);
  }

  return { carousels, experimentIds };
}

/** How many carousels of the current batch already use each photo. */
type PhotoUsage = Map<string, number>;

/**
 * Every slide that wants a photo (in any of the chosen styles) gets one that fits its text.
 * Photos not used by earlier carousels of the batch come first, so different copies get different photos;
 * a photo repeats only when the library runs out, and then the least used one goes.
 * When the user picked specific folders, those folders are the context: slides no photo matched by text
 * get a photo from them. With every folder selected, an unmatched slide stays text-only.
 * Photos the AI already picked while drafting are kept.
 */
async function withMatchedPhotos(
  services: Services,
  draft: CarouselDraft,
  assets: Asset[],
  styles: VisualStyle[],
  folderIsContext: boolean,
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
  if (folderIsContext) fillFromFolder(slides, pending.map(({ index }) => index), candidates, usage);
  for (const slide of slides) if (slide.assetId) slide.wantsImage = true;
  return { ...draft, slides };
}

/** Gives every still empty slide a photo from the chosen folders: unused in the whole batch first, least used when they run out. */
function fillFromFolder(slides: CarouselDraft['slides'], indexes: number[], photos: Asset[], usage: PhotoUsage): void {
  const uses = new Map(photos.map((photo) => [photo.id, (usage.get(photo.id) ?? 0) + slides.filter((slide) => slide.assetId === photo.id).length]));
  for (const index of indexes) {
    if (slides[index].assetId) continue;
    const leastUsed = Math.min(...uses.values());
    const options = photos.filter((photo) => uses.get(photo.id) === leastUsed);
    const chosen = options[Math.floor(Math.random() * options.length)];
    slides[index].assetId = chosen.id;
    uses.set(chosen.id, leastUsed + 1);
  }
}

function productForRequest(request: CreateRequest): BrandProduct | null {
  const product = productOf(request.brand);
  if (!product || request.productImageAssetId === undefined) return product;
  return { ...product, imageAssetId: request.productImageAssetId };
}

function manualCopies(text: string): PreparedCopy[] {
  return parseScript(text).map((block) => ({
    mode: 'manual' as const,
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
): Promise<PreparedCopy> {
  const draft = await services.ai.draftCarousel({
    copy: text,
    contentType: request.contentType,
    objective: request.objective,
    visualStyle: style,
    slideCount: request.slideCount === 'auto' ? null : request.slideCount,
    brand: brandContext(request.brand),
    product: product ? { name: product.name.trim(), pitch: product.pitch.trim(), hasImage: product.imageAssetId !== null } : null,
    assets: assets.slice(0, ASSET_CONTEXT_LIMIT).map(({ id, name, folder, kind, tags }) => ({ id, name, folder, kind, tags })),
  });
  return { mode: 'ai', draft: { ...draft, title: draft.title || draft.slides[0].title }, caption: draft.caption, copy: text };
}
