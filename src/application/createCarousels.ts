import { inFolders, type Asset } from '../domain/asset';
import type { CarouselDraft } from '../domain/aiContract';
import { productOf, VISUAL_STYLE_LABELS, type BrandKit, type BrandProduct, type VisualStyle } from '../domain/brandKit';
import type { Carousel, CarouselFormat, CopyMode, ExperimentRef, Platform, Slide } from '../domain/carousel';
import { composeSlides, slidesWantingImages, slideText } from '../domain/composeCarousel';
import { isPhotoLike } from '../domain/asset';
import type { ContentType, Objective, SlideCountOption } from '../domain/content';
import { hasNumberedSlides, parseScript } from '../domain/script';
import type { ImageShade } from '../domain/shade';
import { limitWords, stripTrailingPeriod } from '../domain/text';
import { brandContext } from './brandContext';
import type { Services } from './ports';

const ASSET_CONTEXT_LIMIT = 400;
export const MAX_TEST_VARIANTS = 4;

export interface CreateRequest {
  platform: Platform;
  format: CarouselFormat;
  brand: BrandKit;
  library: Asset[];
  mode: CopyMode;
  text: string;
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
}

/** Creates every carousel the request implies: one per script block (batch) times one per style (format test). */
export async function createCarousels(services: Services, request: CreateRequest): Promise<CreateResult> {
  const styles = [...new Set(request.styles)].slice(0, MAX_TEST_VARIANTS);
  if (styles.length === 0) throw new Error('Escolha pelo menos um estilo visual.');

  // Numbered slides mean the user already split the copy: keep their slides even in AI mode.
  const mode: CopyMode = request.mode === 'manual' || hasNumberedSlides(request.text) ? 'manual' : 'ai';
  const product = request.includeProduct ? productForRequest(request) : null;
  const brandOnly = new Set([request.brand.logoAssetId, request.brand.avatarAssetId, product?.imageAssetId].filter(Boolean));
  const assets = request.library.filter((asset) => !brandOnly.has(asset.id) && inFolders(asset, request.folders));
  const copies = mode === 'manual' ? manualCopies(request.text) : [await aiCopy(services, request, styles[0], assets, product)];
  if (copies.length === 0) throw new Error('Escreva pelo menos uma linha de texto.');

  const isTest = styles.length > 1;
  const carousels: Carousel[] = [];
  const experimentIds: string[] = [];

  for (const prepared of copies) {
    const { caption, copy } = prepared;
    const draft = await withMatchedPhotos(services, prepared.draft, assets, styles, request.folders.length > 0, product?.imageAssetId ?? null);
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
        preserveText: mode === 'manual',
        addCta: mode === 'ai' || request.addCta,
        productAssetId: product?.imageAssetId ?? null,
        autoMatch: false,
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
            copyMode: mode,
            shade: request.shade,
          },
          slides,
          caption,
          experiment,
          metrics: null,
        }),
      );
    }
  }

  return { carousels, experimentIds };
}

/**
 * Every slide that wants a photo (in any of the chosen styles) gets one that fits its text.
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
): Promise<CarouselDraft> {
  const photos = assets.filter(isPhotoLike);
  const known = new Set(photos.map((asset) => asset.id));
  const wants = styles.map((style) => slidesWantingImages(draft, style));
  const pending = draft.slides
    .map((slide, index) => ({ slide, index }))
    // The product slide shows the product image; without one it is a regular slide.
    .filter(({ slide, index }) => !(slide.role === 'product' && productAssetId) && wants.some((list) => list[index]) && !(slide.assetId && known.has(slide.assetId)));
  if (pending.length === 0 || photos.length === 0) return draft;

  const alreadyUsed = new Set(draft.slides.map((slide) => slide.assetId).filter(Boolean));
  const candidates = photos.filter((asset) => !alreadyUsed.has(asset.id));
  if (candidates.length === 0) return draft;

  const matched = await services.ai.matchImages({
    slides: pending.map(({ slide }) => ({ text: slideText(slide) })),
    assets: candidates.slice(0, ASSET_CONTEXT_LIMIT).map(({ id, name, folder, kind, tags }) => ({ id, name, folder, kind, tags })),
  });
  const slides = draft.slides.map((slide) => ({ ...slide }));
  pending.forEach(({ index }, position) => {
    slides[index].assetId = matched[position] ?? null;
  });
  if (folderIsContext) fillFromFolder(slides, pending.map(({ index }) => index), candidates);
  for (const slide of slides) if (slide.assetId) slide.wantsImage = true;
  return { ...draft, slides };
}

/** Gives every still empty slide a photo from the chosen folders, using each photo once before repeating. */
function fillFromFolder(slides: CarouselDraft['slides'], indexes: number[], photos: Asset[]): void {
  const uses = new Map(photos.map((photo) => [photo.id, slides.filter((slide) => slide.assetId === photo.id).length]));
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
  style: VisualStyle,
  assets: Asset[],
  product: BrandProduct | null,
): Promise<PreparedCopy> {
  const draft = await services.ai.draftCarousel({
    copy: request.text,
    contentType: request.contentType,
    objective: request.objective,
    visualStyle: style,
    slideCount: request.slideCount === 'auto' ? null : request.slideCount,
    brand: brandContext(request.brand),
    product: product ? { name: product.name.trim(), pitch: product.pitch.trim(), hasImage: product.imageAssetId !== null } : null,
    assets: assets.slice(0, ASSET_CONTEXT_LIMIT).map(({ id, name, folder, kind, tags }) => ({ id, name, folder, kind, tags })),
  });
  return { draft: { ...draft, title: draft.title || draft.slides[0].title }, caption: draft.caption, copy: request.text };
}
