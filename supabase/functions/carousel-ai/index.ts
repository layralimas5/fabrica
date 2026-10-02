import Anthropic from 'npm:@anthropic-ai/sdk';
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { ZodType } from 'npm:zod@4';
import {
  DRAFT_JSON_SCHEMA,
  HOOKS_JSON_SCHEMA,
  MATCH_JSON_SCHEMA,
  SLIDE_TEXT_JSON_SCHEMA,
  TAGS_JSON_SCHEMA,
  draftRequest,
  draftResponse,
  hooksRequest,
  hooksResponse,
  matchRequest,
  matchResponse,
  rewriteRequest,
  rewriteResponse,
  tagImageRequest,
  tagImageResponse,
} from '../_shared/contract.ts';
import { HOOKS_INSTRUCTIONS, MATCH_SYSTEM_PROMPT, REWRITE_INSTRUCTIONS, SYSTEM_PROMPT, TAG_SYSTEM_PROMPT } from '../_shared/prompts.ts';

const MODEL = 'claude-opus-5-5';
const HOURLY_LIMIT = Number(Deno.env.get('AI_HOURLY_LIMIT') ?? '120');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const anthropic = new Anthropic();

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

type Action = 'draft' | 'rewrite' | 'hooks' | 'tag' | 'match';

type UserContent =
  | string
  | Array<{ type: 'text'; text: string } | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }>;

interface CallSpec<T> {
  effort: 'low' | 'medium' | 'high';
  schema: object;
  validator: ZodType<T>;
  userContent: UserContent;
  /** Defaults to the carousel system prompt. */
  system?: string;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  try {
    const supabase = userClient(request);
    await enforceRateLimit(supabase);

    const body = await request.json().catch(() => {
      throw new HttpError(400, 'Corpo da requisição não é JSON.');
    });
    const action = body?.action as Action;
    const spec = buildCall(action, body?.payload);
    const result = await callClaude(spec);

    const { error } = await supabase.from('ai_usage').insert({ action });
    if (error) console.error('ai_usage insert failed', error.message);
    return json(result, 200);
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    if (error instanceof Anthropic.RateLimitError) return json({ error: 'A IA está sobrecarregada. Tenta de novo em instantes.' }, 429);
    if (error instanceof Anthropic.APIError) {
      console.error('anthropic error', error.status, error.message);
      return json({ error: 'A IA falhou ao responder.' }, 502);
    }
    console.error('unexpected error', error);
    return json({ error: 'Erro inesperado.' }, 500);
  }
});

function userClient(request: Request): SupabaseClient {
  const authorization = request.headers.get('Authorization');
  if (!authorization) throw new HttpError(401, 'Faça login para usar a IA.');
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authorization } },
  });
}

async function enforceRateLimit(supabase: SupabaseClient): Promise<void> {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) throw new HttpError(401, 'Sessão inválida. Entra de novo.');

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase.from('ai_usage').select('id', { count: 'exact', head: true }).gte('created_at', since);
  if (error) throw new HttpError(500, 'Não consegui verificar o limite de uso.');
  if ((count ?? 0) >= HOURLY_LIMIT) throw new HttpError(429, 'Limite de gerações por hora atingido. Tenta mais tarde.');
}

function buildCall(action: Action, payload: unknown): CallSpec<unknown> {
  switch (action) {
    case 'draft': {
      const input = parse(draftRequest, payload);
      return {
        effort: 'medium',
        schema: DRAFT_JSON_SCHEMA,
        validator: draftResponse,
        userContent: [
          'Monte o carrossel a partir deste pedido.',
          input.slideCount ? `Use exatamente ${input.slideCount} slides, contando o CTA.` : 'Escolha a quantidade de slides (entre 7 e 9) que a narrativa pedir.',
          input.product
            ? `Inclua exatamente um slide role=product mostrando o ${input.product.name}, na posição que o tipo de carrossel pede.`
            : 'Não inclua slide de produto nem mencione produto.',
          `<pedido>${JSON.stringify(input)}</pedido>`,
        ].join('\n'),
      };
    }
    case 'rewrite': {
      const input = parse(rewriteRequest, payload);
      return {
        effort: 'low',
        schema: SLIDE_TEXT_JSON_SCHEMA,
        validator: rewriteResponse,
        userContent: `${REWRITE_INSTRUCTIONS[input.mode]}\n<pedido>${JSON.stringify(input)}</pedido>`,
      };
    }
    case 'hooks': {
      const input = parse(hooksRequest, payload);
      return {
        effort: 'low',
        schema: HOOKS_JSON_SCHEMA,
        validator: hooksResponse,
        userContent: `${HOOKS_INSTRUCTIONS}\nGere exatamente ${input.count} ganchos.\n<pedido>${JSON.stringify(input)}</pedido>`,
      };
    }
    case 'tag': {
      const input = parse(tagImageRequest, payload);
      return {
        effort: 'low',
        schema: TAGS_JSON_SCHEMA,
        validator: tagImageResponse,
        system: TAG_SYSTEM_PROMPT,
        userContent: [
          { type: 'image', source: { type: 'base64', media_type: input.mediaType, data: input.image } },
          { type: 'text', text: `Dica: ${input.hint || 'nenhuma'}` },
        ],
      };
    }
    case 'match': {
      const input = parse(matchRequest, payload);
      return {
        effort: 'medium',
        schema: MATCH_JSON_SCHEMA,
        validator: matchResponse,
        system: MATCH_SYSTEM_PROMPT,
        userContent: `Escolha a foto de cada um dos ${input.slides.length} slides.\n<pedido>${JSON.stringify(input)}</pedido>`,
      };
    }
    default:
      throw new HttpError(400, 'Ação desconhecida.');
  }
}

function parse<T>(schema: ZodType<T>, payload: unknown): T {
  const result = schema.safeParse(payload);
  if (!result.success) throw new HttpError(400, 'Dados inválidos para a IA.');
  return result.data;
}

async function callClaude<T>(spec: CallSpec<T>): Promise<T> {
  // Server-side fallback: if Opus 5.5 declines, the API re-runs the request on a fallback model in the same call.
  const params = {
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: spec.effort, format: { type: 'json_schema', schema: spec.schema } },
    system: [{ type: 'text', text: spec.system ?? SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: spec.userContent }],
  };
  // deno-lint-ignore no-explicit-any -- `fallbacks: "default"` is newer than some SDK type releases
  const response = await anthropic.beta.messages.create(params as any);

  if (response.stop_reason === 'refusal') throw new HttpError(422, 'A IA recusou esse conteúdo. Ajusta a copy e tenta de novo.');
  if (response.stop_reason === 'max_tokens') throw new HttpError(502, 'A resposta da IA ficou grande demais. Tenta com menos slides.');

  const text = response.content.find((block: { type: string }) => block.type === 'text') as { text: string } | undefined;
  if (!text) throw new HttpError(502, 'A IA não devolveu conteúdo.');

  let parsed: unknown;
  try {
    parsed = JSON.parse(text.text);
  } catch {
    throw new HttpError(502, 'A IA devolveu JSON inválido.');
  }
  const validated = spec.validator.safeParse(parsed);
  if (!validated.success) throw new HttpError(502, 'A IA devolveu um formato inesperado.');
  return validated.data;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
}
