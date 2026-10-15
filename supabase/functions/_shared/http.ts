import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2';

/** Shared by the Fábrica's functions (Deno). */

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = Deno.env.get('ALLOWED_ORIGIN') ?? '*';
  const list = allowed.split(',').map((item) => item.trim());
  const value = allowed === '*' ? '*' : origin && list.includes(origin) ? origin : list[0];
  return {
    'Access-Control-Allow-Origin': value,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    Vary: 'Origin',
  };
}

export function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
}

/** Service role: bypasses RLS, so every query below filters by the user it validated. */
export function serviceClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
}

/** The user behind the JWT of the request. These functions are deployed with --no-verify-jwt, so this check is the gate. */
export async function requireUser(request: Request, service: SupabaseClient): Promise<User> {
  const authorization = request.headers.get('Authorization') ?? '';
  const token = authorization.replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'Faça login na Fábrica.');
  const { data, error } = await service.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'Sessão inválida. Entra de novo.');
  return data.user;
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const body = await request.json().catch(() => {
    throw new HttpError(400, 'Corpo da requisição não é JSON.');
  });
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Corpo da requisição inválido.');
  return body as Record<string, unknown>;
}

/** Logs without tokens, codes or e-mails: only the error class and a short message. */
export function logError(context: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(context, message.replace(/(access_token|code|client_secret|refresh_token)=[^&\s]+/gi, '$1=[redacted]').slice(0, 300));
}
