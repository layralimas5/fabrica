import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { randomToken, safeEqual, sha256Hex } from '../_shared/crypto.ts';
import { HttpError, json, logError, readJson, requireUser, serviceClient } from '../_shared/http.ts';
import { cleanEvents, isBot, MAX_BODY_BYTES, originAllowed, RateLimiter } from '../_shared/tracking/ingest.ts';

/**
 * Conversion tracking of our own landing pages and apps.
 *   GET  /track/go/<slug>          → records the click (people only, previews of links are ignored) and redirects
 *   POST /track/event              → events from the snippet: project key + allowed origin
 *   POST /track/event + x-fabrica-secret → events from the app's server (confirmed sign-ups and subscriptions)
 *   POST /track {action:'rotate-secret', projectId} with the user's JWT → new server secret, shown once
 * Deploy with --no-verify-jwt: visitors have no JWT; each route checks its own credential.
 */

const eventLimiter = new RateLimiter(120, 60_000);
const clickLimiter = new RateLimiter(60, 60_000);

function clientKey(request: Request): string {
  return (request.headers.get('x-forwarded-for') ?? request.headers.get('cf-connecting-ip') ?? 'unknown').split(',')[0].trim();
}

function browserCors(origin: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin ?? '*',
    'Access-Control-Allow-Headers': 'content-type, x-fabrica-secret, authorization, apikey, x-client-info',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin');
  const cors = browserCors(origin);
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const db = serviceClient();
  const url = new URL(request.url);

  try {
    const go = url.pathname.match(/\/go\/([a-z0-9]{6,16})\/?$/);
    if (request.method === 'GET' && go) return await redirect(db, go[1], request);

    if (request.method !== 'POST') throw new HttpError(405, 'Método não permitido.');
    if (Number(request.headers.get('content-length') ?? '0') > MAX_BODY_BYTES) throw new HttpError(413, 'Requisição grande demais.');

    if (url.pathname.endsWith('/event')) {
      if (!eventLimiter.allow(clientKey(request))) throw new HttpError(429, 'Eventos demais em pouco tempo.');
      const body = await readJson(request);
      return json(await ingest(db, body, origin, request.headers.get('x-fabrica-secret')), 202, cors);
    }

    const user = await requireUser(request, db);
    const body = await readJson(request);
    if (body.action !== 'rotate-secret' || typeof body.projectId !== 'string') throw new HttpError(400, 'Ação desconhecida.');
    const { data: project } = await db.from('projects').select('id').eq('id', body.projectId).eq('user_id', user.id).maybeSingle();
    if (!project) throw new HttpError(404, 'Projeto não encontrado.');
    const secret = `sk_${randomToken(24)}`;
    const { error } = await db.from('project_secrets').upsert({ project_id: project.id, secret_hash: await sha256Hex(secret), rotated_at: new Date().toISOString() });
    if (error) throw new HttpError(500, 'Não consegui gerar o segredo.');
    return json({ secret }, 200, cors);
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status, cors);
    logError('track', error);
    return json({ error: 'Erro inesperado.' }, 500, cors);
  }
});

async function redirect(db: SupabaseClient, slug: string, request: Request): Promise<Response> {
  const { data: link } = await db.from('tracking_links').select('id, user_id, project_id, destination, data').eq('slug', slug).maybeSingle();
  if (!link) return new Response('Link não encontrado.', { status: 404 });

  const target = new URL(link.destination);
  const utm = (link.data?.utm ?? {}) as Record<string, string>;
  for (const [key, value] of Object.entries({ utm_source: utm.source, utm_medium: utm.medium, utm_campaign: utm.campaign, utm_content: utm.content, utm_term: utm.term, fab_l: slug })) {
    if (value) target.searchParams.set(key, value);
  }

  // Previews of the link (WhatsApp, Instagram...) are not people: they are sent on without counting a click.
  if (!isBot(request.headers.get('user-agent')) && clickLimiter.allow(`${clientKey(request)}:${slug}`)) {
    const eventId = randomToken(12);
    target.searchParams.set('fab_c', eventId);
    const { error } = await db.from('tracking_events').insert({
      user_id: link.user_id,
      project_id: link.project_id,
      event_id: eventId,
      name: 'click',
      link_id: link.id,
      first_touch: { source: utm.source ?? null, medium: utm.medium ?? null, campaign: utm.campaign ?? null, content: utm.content ?? null, link: slug, at: new Date().toISOString() },
      occurred_at: new Date().toISOString(),
    });
    if (error) logError('click insert', error);
  }
  return new Response(null, { status: 302, headers: { Location: target.toString(), 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer-when-downgrade' } });
}

async function ingest(db: SupabaseClient, body: Record<string, unknown>, origin: string | null, secret: string | null) {
  const key = typeof body.key === 'string' ? body.key : '';
  const { data: project } = await db.from('projects').select('id, user_id, data').eq('tracking_key', key).maybeSingle();
  if (!project) throw new HttpError(404, 'Projeto desconhecido.');

  let verified = false;
  if (secret !== null) {
    const { data: stored } = await db.from('project_secrets').select('secret_hash').eq('project_id', project.id).maybeSingle();
    if (!stored || !safeEqual(stored.secret_hash, await sha256Hex(secret))) throw new HttpError(401, 'Segredo do projeto inválido.');
    verified = true;
  } else if (!originAllowed(origin, project.data?.allowedOrigins)) {
    throw new HttpError(403, 'Site não autorizado a enviar eventos deste projeto.');
  }

  const { events, rejected } = cleanEvents(body.events, new Date());
  if (events.length === 0) return { accepted: 0, rejected };

  const slugs = [...new Set(events.map((event) => event.linkSlug).filter((slug): slug is string => Boolean(slug)))];
  const { data: links } = slugs.length ? await db.from('tracking_links').select('id, slug').eq('project_id', project.id).in('slug', slugs) : { data: [] };
  const linkBySlug = new Map((links ?? []).map((link: { id: string; slug: string }) => [link.slug, link.id]));

  // A slug that is not a link of this project is dropped from the touches, so no event is credited to another project.
  const ownLink = <T extends { link: string | null }>(touch: T | null): T | null => (touch && touch.link && !linkBySlug.has(touch.link) ? { ...touch, link: null } : touch);
  const rows = events.map((event) => ({
    user_id: project.user_id,
    project_id: project.id,
    event_id: event.eventId,
    name: event.name,
    // Conversions from the browser are kept, but only the ones sent by the app's server are "confirmed".
    verified,
    consent: event.consent || verified,
    visitor_id: event.visitorId,
    session_id: event.sessionId,
    first_touch: ownLink(event.firstTouch),
    last_touch: ownLink(event.lastTouch),
    page_path: event.pagePath,
    occurred_at: event.occurredAt,
  }));
  const { error } = await db.from('tracking_events').upsert(rows, { onConflict: 'project_id,event_id', ignoreDuplicates: true });
  if (error) throw new HttpError(500, 'Não consegui guardar os eventos.');
  return { accepted: rows.length, rejected };
}
