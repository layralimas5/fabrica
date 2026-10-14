import { ProviderError, type FetchFn, type RateUsage } from './types.ts';

/** Graph API version for Instagram and Facebook; META_GRAPH_VERSION overrides it when Meta retires this one. */
export const DEFAULT_GRAPH_VERSION = 'v23.0';

/** Meta error codes that mean "too many calls": app, user, page and business use case limits. */
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613, 80001, 80002, 80003, 80004, 80005, 80006, 80008, 80014]);
/** 190 = token invalid or expired; 102 = session expired. */
const AUTH_CODES = new Set([102, 190]);
/** 10 and 200-299 = permission not granted. */
const isPermissionCode = (code: number) => code === 10 || (code >= 200 && code < 300);

interface MetaErrorBody {
  error?: { message?: string; code?: number; error_subcode?: number; type?: string };
}

/** Keeps the highest usage percentage Meta reports in its headers, so sync can slow down before being blocked. */
export class MetaClient {
  private usagePercent: number | null = null;
  private limited = false;

  constructor(
    private readonly fetchFn: FetchFn,
    private readonly now: () => Date = () => new Date(),
  ) {}

  usage(): RateUsage {
    return { percent: this.usagePercent, limited: this.limited, checkedAt: this.now().toISOString() };
  }

  async get<T>(url: string): Promise<T> {
    return this.call<T>(url, { method: 'GET' });
  }

  async post<T>(url: string, body: URLSearchParams): Promise<T> {
    return this.call<T>(url, { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  }

  async delete<T>(url: string): Promise<T> {
    return this.call<T>(url, { method: 'DELETE' });
  }

  private async call<T>(url: string, init: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchFn(url, init);
    } catch {
      throw new ProviderError('unavailable', 'A Meta não respondeu. Tenta de novo em alguns minutos.');
    }
    this.readUsage(response.headers);
    const body = (await response.json().catch(() => ({}))) as T & MetaErrorBody;
    if (response.ok && !body.error) return body;
    throw this.translate(response.status, body.error);
  }

  private readUsage(headers: Headers): void {
    const values: number[] = [];
    for (const name of ['x-app-usage', 'x-business-use-case-usage', 'x-ad-account-usage']) {
      const raw = headers.get(name);
      if (raw) values.push(...usagePercents(raw));
    }
    if (values.length) this.usagePercent = Math.max(this.usagePercent ?? 0, ...values);
  }

  private translate(status: number, error: MetaErrorBody['error']): ProviderError {
    const code = error?.code ?? 0;
    // Meta's messages can echo request details; only the code and a fixed sentence are kept.
    if (RATE_LIMIT_CODES.has(code) || status === 429) {
      this.limited = true;
      return new ProviderError('rate_limit', `Limite de chamadas da Meta atingido (código ${code || status}). A próxima sincronização tenta de novo.`);
    }
    if (AUTH_CODES.has(code) || status === 401) return new ProviderError('auth', 'A autorização expirou ou foi removida. Reconecta a conta.');
    if (isPermissionCode(code) || status === 403) return new ProviderError('permission', `Permissão não concedida pela Meta (código ${code}). Reconecta e aceita todas as permissões pedidas.`);
    if (code === 100) return new ProviderError('permission', 'A Meta recusou um campo ou métrica para essa conta (código 100).');
    return new ProviderError('unavailable', `A Meta recusou a chamada (HTTP ${status}${code ? `, código ${code}` : ''}).`);
  }
}

/** Reads every number in a usage header, flat ({"call_count":12}) or per business id ({"123":[{"call_count":80}]}). */
export function usagePercents(raw: string): number[] {
  try {
    const found: number[] = [];
    const walk = (value: unknown) => {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') {
        for (const [key, inner] of Object.entries(value)) {
          if (typeof inner === 'number' && /call_count|total_time|total_cputime|acc_id_util_pct/.test(key)) found.push(inner);
          else walk(inner);
        }
      }
    };
    walk(JSON.parse(raw));
    return found;
  } catch {
    return [];
  }
}

/** Values of an insights response: lifetime metrics come in `values[0].value` or `total_value.value`. */
export function insightValues(body: { data?: { name: string; values?: { value: unknown }[]; total_value?: { value: unknown } }[] }): Record<string, number> {
  const result: Record<string, number> = {};
  for (const metric of body.data ?? []) {
    const raw = metric.total_value?.value ?? metric.values?.[metric.values.length - 1]?.value;
    if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) result[metric.name] = raw;
  }
  return result;
}

export function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== '') search.set(key, String(value));
  return search.toString();
}

export function expiryFrom(seconds: unknown, now: Date): Date | null {
  return typeof seconds === 'number' && seconds > 0 ? new Date(now.getTime() + seconds * 1000) : null;
}
