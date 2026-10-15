/**
 * A brand or app of our own (Momentumm, Lumad, Aura...). Accounts and carousels point to it by name
 * (their `project` field), so everything made before projects existed is already grouped correctly.
 */
export interface Project {
  id: string;
  name: string;
  description: string;
  /** Visual identity used when creating for this project. */
  brandKitId: string | null;
  landingUrl: string;
  conversionGoal: ConversionGoal;
  /** Hex color that tells the projects apart in pickers and charts. */
  color: string;
  status: ProjectStatus;
  /**
   * Public key the landing page snippet sends with every event, like an analytics measurement id.
   * It is not a secret: it only says which project an event belongs to.
   */
  trackingKey: string;
  /** Sites allowed to send events with the tracking key, e.g. "https://momentumm.app". */
  allowedOrigins: string[];
  createdAt: string;
  updatedAt: string;
}

export type ProjectInput = Omit<Project, 'id' | 'createdAt' | 'updatedAt'>;

export const PROJECT_STATUSES = ['active', 'paused'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/** The funnel step that counts as a conversion for the project. */
export const CONVERSION_GOALS = ['signup', 'trial_start', 'subscription', 'quiz_complete', 'lp_view'] as const;
export type ConversionGoal = (typeof CONVERSION_GOALS)[number];
export const CONVERSION_GOAL_LABELS: Record<ConversionGoal, string> = {
  signup: 'Cadastro',
  trial_start: 'Início de teste grátis',
  subscription: 'Assinatura',
  quiz_complete: 'Conclusão do quiz',
  lp_view: 'Visita à landing page',
};

export const PROJECT_LIMITS = { name: 60, description: 500, url: 300, origins: 10 } as const;

/** The three apps the Fábrica was built for; offered as a one-click start. */
export const STARTER_PROJECTS: { name: string; color: string; description: string }[] = [
  { name: 'Momentumm', color: '#7c5cff', description: 'App de metas, rotina e constância.' },
  { name: 'Lumad', color: '#0ea5a4', description: 'App de viagem solo.' },
  { name: 'Aura', color: '#e8799f', description: '' },
];

const HEX = /^#[0-9a-f]{6}$/i;
const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/** Random, URL-safe and long enough not to be guessed by accident. */
export function newTrackingKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return `pk_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

/** "momentumm.app/" → "https://momentumm.app"; anything that is not a web address is dropped. */
export function normalizeOrigin(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function normalizeUrl(raw: unknown): string {
  const value = text(raw, PROJECT_LIMITS.url);
  if (!value) return '';
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : '';
  } catch {
    return '';
  }
}

export function emptyProject(name = ''): ProjectInput {
  return {
    name,
    description: '',
    brandKitId: null,
    landingUrl: '',
    conversionGoal: 'signup',
    color: '#5b4bff',
    status: 'active',
    trackingKey: newTrackingKey(),
    allowedOrigins: [],
  };
}

export function sanitizeProjectInput(raw: Partial<ProjectInput>): ProjectInput {
  const base = emptyProject();
  const landingUrl = normalizeUrl(raw.landingUrl);
  const origins = new Set<string>();
  for (const origin of Array.isArray(raw.allowedOrigins) ? raw.allowedOrigins : []) {
    const clean = typeof origin === 'string' ? normalizeOrigin(origin) : null;
    if (clean) origins.add(clean);
  }
  // The landing page itself is always allowed to send events.
  const landingOrigin = landingUrl ? normalizeOrigin(landingUrl) : null;
  if (landingOrigin) origins.add(landingOrigin);
  return {
    name: text(raw.name, PROJECT_LIMITS.name),
    description: text(raw.description, PROJECT_LIMITS.description),
    brandKitId: typeof raw.brandKitId === 'string' && raw.brandKitId ? raw.brandKitId : null,
    landingUrl,
    conversionGoal: CONVERSION_GOALS.includes(raw.conversionGoal as ConversionGoal) ? (raw.conversionGoal as ConversionGoal) : base.conversionGoal,
    color: typeof raw.color === 'string' && HEX.test(raw.color) ? raw.color.toLowerCase() : base.color,
    status: raw.status === 'paused' ? 'paused' : 'active',
    trackingKey: typeof raw.trackingKey === 'string' && /^pk_[0-9a-f]{24}$/.test(raw.trackingKey) ? raw.trackingKey : base.trackingKey,
    allowedOrigins: [...origins].slice(0, PROJECT_LIMITS.origins),
  };
}

export function toProjectInput(project: Project): ProjectInput {
  const { id: _id, createdAt: _c, updatedAt: _u, ...input } = project;
  return input;
}

/** Project names are compared without case or surrounding spaces: "momentumm " is Momentumm. */
export function sameProject(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function projectNamed(projects: Project[], name: string): Project | null {
  return name.trim() ? (projects.find((project) => sameProject(project.name, name)) ?? null) : null;
}

/**
 * Names already typed in accounts and carousels that have no project yet: offered to become projects,
 * so the history made before this screen existed joins its brand with one click.
 */
export function unregisteredProjectNames(projects: Project[], usedNames: string[]): string[] {
  const seen = new Map<string, string>();
  for (const raw of usedNames) {
    const name = raw.trim();
    if (!name || projectNamed(projects, name)) continue;
    const key = name.toLowerCase();
    if (!seen.has(key)) seen.set(key, name);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

/** Name is required and unique among the user's projects. */
export function validateProject(input: ProjectInput, projects: Project[], editingId: string | null): string | null {
  if (!input.name) return 'Dá um nome ao projeto.';
  const clash = projects.find((project) => project.id !== editingId && sameProject(project.name, input.name));
  return clash ? `Já existe um projeto chamado ${clash.name}.` : null;
}
