import { FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js';
import type { ZodType } from 'zod';
import type { AiService } from '../../application/ports';
import {
  carouselDraftSchema,
  hooksResponseSchema,
  matchResponseSchema,
  slideTextSchema,
  tagImageResponseSchema,
  type CarouselDraft,
  type DraftRequest,
  type HooksRequest,
  type MatchRequest,
  type RewriteRequest,
  type SlideText,
  type TagImageRequest,
} from '../../domain/aiContract';

const FUNCTION_NAME = 'carousel-ai';

/** Calls the `carousel-ai` Edge Function, which holds the Anthropic key server-side. */
export class ClaudeAi implements AiService {
  readonly engine = 'claude' as const;

  constructor(private readonly client: SupabaseClient) {}

  draftCarousel(request: DraftRequest): Promise<CarouselDraft> {
    return this.call('draft', request, carouselDraftSchema);
  }

  rewriteSlide(request: RewriteRequest): Promise<SlideText> {
    return this.call('rewrite', request, slideTextSchema);
  }

  async generateHooks(request: HooksRequest): Promise<string[]> {
    return (await this.call('hooks', request, hooksResponseSchema)).hooks;
  }

  visionReady(): boolean {
    return true;
  }

  async tagImage(request: TagImageRequest): Promise<string[]> {
    return (await this.call('tag', request, tagImageResponseSchema)).tags;
  }

  async matchImages(request: MatchRequest): Promise<(string | null)[]> {
    const { assetIds } = await this.call('match', request, matchResponseSchema);
    const known = new Set(request.assets.map((asset) => asset.id));
    // Never trust ids blindly: unknown ids and missing entries become "no photo".
    return request.slides.map((_, index) => {
      const id = assetIds[index] ?? null;
      return id && known.has(id) ? id : null;
    });
  }

  private async call<T>(action: string, payload: unknown, schema: ZodType<T>): Promise<T> {
    const { data, error } = await this.client.functions.invoke(FUNCTION_NAME, { body: { action, payload } });
    if (error instanceof FunctionsHttpError) {
      const body: unknown = await error.context.json().catch(() => null);
      const message = body && typeof body === 'object' && 'error' in body ? String(body.error) : error.message;
      throw new Error(message);
    }
    if (error) throw new Error(`A IA não respondeu: ${error.message}`);
    const parsed = schema.safeParse(data);
    if (!parsed.success) throw new Error('A IA respondeu num formato inesperado. Tenta de novo.');
    return parsed.data;
  }
}
