import { FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js';
import type { ZodType } from 'zod';
import type { AiService } from '../../application/ports';
import {
  carouselDraftSchema,
  hooksResponseSchema,
  slideTextSchema,
  type CarouselDraft,
  type DraftRequest,
  type HooksRequest,
  type RewriteRequest,
  type SlideText,
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
