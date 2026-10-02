import { inFolders, type Asset } from '../domain/asset';
import type { CarouselDraft } from '../domain/aiContract';
import { productOf, VISUAL_STYLE_LABELS, type BrandKit, type BrandProduct, type VisualStyle } from '../domain/brandKit';
import type { Carousel, CarouselFormat, CopyMode, ExperimentRef, Slide } from '../domain/carousel';
import { composeSlides } from '../domain/composeCarousel';
import type { ContentType, Objective, SlideCountOption } from '../domain/content';
import { parseScript } from '../domain/script';
import { limitWords, stripTrailingPeriod } from '../domain/text';
import { brandContext } from './brandContext';
import type { Services } from './ports';

const ASSET_CONTEXT_LIMIT = 400;
export const MAX_TEST_VARIANTS = 4;

export interface CreateRequest {
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
  /** AI mode only: show the brand's product in one slide. */
  includeProduct: boolean;
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

export const formatForStyle = (style: VisualStyle): CarouselFormat => (style === 'tiktok' ? '9:16' : '4:5');

/** Creates every carousel the request implies: one per script block (batch) times one per style (format test). */
export async function createCarousels(services: Services, request: CreateRequest): Promise<CreateResult> {
  const styles = [...new Set(request.styles)].slice(0, MAX_TEST_VARIANTS);
  if (styles.length === 0) throw new Error('Escolha pelo menos um estilo visual.');

  const product = request.mode === 'ai' && request.includeProduct ? productOf(request.brand) : null;
  const brandOnly = new Set([request.brand.logoAssetId, request.brand.avatarAssetId, product?.imageAssetId].filter(Boolean));
  const assets = request.library.filter((asset) => !brandOnly.has(asset.id) && inFolders(asset, request.folders));
  const copies = request.mode === 'manual' ? manualCopies(request.text) : [await aiCopy(services, request, styles[0], assets, product)];
  if (copies.length === 0) throw new Error('Escreva pelo menos uma linha de texto.');

  const isTest = styles.length > 1;
  const carousels: Carousel[] = [];
  const experimentIds: string[] = [];

  for (const { draft, caption, copy } of copies) {
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
        preserveText: request.mode === 'manual',
        addCta: request.mode === 'ai' || request.addCta,
        productAssetId: product?.imageAssetId ?? null,
      });
      previous = slides;

      const experiment: ExperimentRef | null = experimentId ? { id: experimentId, name: draft.title, variant: VISUAL_STYLE_LABELS[style] } : null;
      carousels.push(
        await services.carousels.create({
          brandKitId: request.brand.id,
          title: isTest ? `${draft.title} · ${VISUAL_STYLE_LABELS[style]}` : draft.title,
          status: 'draft',
          format: formatForStyle(style),
          source: {
            copy,
            contentType: request.contentType,
            objective: request.objective,
            visualStyle: style,
            slideCount: request.slideCount,
            folders: request.folders,
            copyMode: request.mode,
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

function manualCopies(text: string): PreparedCopy[] {
  return parseScript(text).map((block) => ({
    caption: block.caption,
    copy: block.slides.join('\n'),
    draft: {
      title: limitWords(stripTrailingPeriod(block.slides[0].replace(/\n/g, ' ')), 8),
      caption: block.caption,
      slides: block.slides.map((line, index) => ({
        role: index === 0 ? 'hook' : 'point',
        title: line,
        subtitle: null,
        body: null,
        bullets: [],
        assetId: null,
        layout: null,
        wantsImage: index % 2 === 0,
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
