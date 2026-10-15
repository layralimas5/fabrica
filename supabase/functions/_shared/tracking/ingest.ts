/**
 * Validation of the events the landing pages and apps send. Pure, so it is unit tested from the app.
 * Keep the names in sync with src/domain/tracking/tracking.ts and public/t.js.
 */

export const BROWSER_EVENTS = ['lp_view', 'quiz_start', 'quiz_complete', 'signup', 'trial_start', 'subscription'] as const;
export type IngestEventName = (typeof BROWSER_EVENTS)[number];

export const MAX_EVENTS_PER_REQUEST = 20;
export const MAX_BODY_BYTES = 16_384;
/** Events older than this are refused: a queue replayed weeks later would distort the funnel. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_FUTURE_MS = 5 * 60 * 1000;

export interface CleanTouch {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  link: string | null;
  at: string | null;
}

export interface CleanEvent {
  eventId: string;
  name: IngestEventName;
  visitorId: string | null;
  sessionId: string | null;
  consent: boolean;
  firstTouch: CleanTouch | null;
  lastTouch: CleanTouch | null;
  pagePath: string | null;
  occurredAt: string;
  /** Slug of the tracked link carried in the touch, resolved to the link row by the function. */
  linkSlug: string | null;
}

const ID = /^[A-Za-z0-9_-]{8,64}$/;
const SLUG = /^[a-z0-9]{6,16}$/;

function text(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
}

function touch(raw: unknown): CleanTouch | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const link = text(value.link, 16);
  const at = text(value.at, 40);
  const clean = {
    source: text(value.source, 80),
    medium: text(value.medium, 80),
    campaign: text(value.campaign, 120),
    content: text(value.content, 120),
    link: link && SLUG.test(link) ? link : null,
    at: at && !Number.isNaN(Date.parse(at)) ? new Date(at).toISOString() : null,
  };
  return clean.source || clean.medium || clean.campaign || clean.content || clean.link ? clean : null;
}

/** Only the path: query strings can carry e-mails or tokens of the page, and are never stored. */
function pathOnly(raw: unknown): string | null {
  const value = text(raw, 300);
  if (!value) return null;
  return value.split(/[?#]/)[0].slice(0, 300) || '/';
}

export interface IngestResult {
  events: CleanEvent[];
  rejected: number;
}

export function cleanEvents(raw: unknown, now: Date): IngestResult {
  const list = Array.isArray(raw) ? raw.slice(0, MAX_EVENTS_PER_REQUEST) : [];
  const events: CleanEvent[] = [];
  let rejected = Array.isArray(raw) ? Math.max(0, raw.length - MAX_EVENTS_PER_REQUEST) : 1;
  for (const item of list) {
    if (!item || typeof item !== 'object') {
      rejected += 1;
      continue;
    }
    const value = item as Record<string, unknown>;
    const name = value.name as IngestEventName;
    const eventId = typeof value.id === 'string' && ID.test(value.id) ? value.id : null;
    const occurred = typeof value.occurredAt === 'string' ? Date.parse(value.occurredAt) : now.getTime();
    if (!BROWSER_EVENTS.includes(name) || !eventId || Number.isNaN(occurred) || occurred < now.getTime() - MAX_AGE_MS || occurred > now.getTime() + MAX_FUTURE_MS) {
      rejected += 1;
      continue;
    }
    const consent = value.consent === true;
    const firstTouch = touch(value.firstTouch);
    const lastTouch = touch(value.lastTouch);
    events.push({
      eventId,
      name,
      // Without consent nothing that identifies the browser is kept, only the anonymous count.
      visitorId: consent && typeof value.visitorId === 'string' && ID.test(value.visitorId) ? value.visitorId : null,
      sessionId: consent && typeof value.sessionId === 'string' && ID.test(value.sessionId) ? value.sessionId : null,
      consent,
      firstTouch,
      lastTouch,
      pagePath: pathOnly(value.path),
      occurredAt: new Date(occurred).toISOString(),
      linkSlug: lastTouch?.link ?? firstTouch?.link ?? null,
    });
  }
  return { events, rejected };
}

/** Exact origin match against the project's allowed sites ("https://momentumm.app"). */
export function originAllowed(origin: string | null, allowed: unknown): boolean {
  if (!origin || !Array.isArray(allowed)) return false;
  return allowed.some((item) => typeof item === 'string' && item === origin);
}

/** Link previews (WhatsApp, Instagram, Facebook, Slack...) open the short link without a person behind them. */
const BOT_AGENTS = /bot|crawl|spider|slurp|facebookexternalhit|facebookcatalog|meta-externalagent|whatsapp|telegram|discord|slack|skype|preview|headless|curl|wget|python-requests|go-http-client/i;

export function isBot(userAgent: string | null): boolean {
  return !userAgent || BOT_AGENTS.test(userAgent);
}

/** Simple fixed-window limiter, per isolate: enough to stop a loop or a flood from one address. */
export class RateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  allow(key: string, now = Date.now()): boolean {
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      if (this.hits.size > 10_000) this.hits.clear();
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    entry.count += 1;
    return entry.count <= this.limit;
  }
}
