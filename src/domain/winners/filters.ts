import { CONTENT_TYPE_LABELS, OBJECTIVE_LABELS, type ContentType, type Objective } from '../content';
import { narrativeLabel } from './dna';
import {
  accountKey,
  CONTENT_FORMAT_LABELS,
  conversionRate,
  HOOK_TYPE_LABELS,
  PILLAR_LABELS,
  recordDay,
  type ContentFormat,
  type ContentPlatform,
  type ContentRecord,
  type HookType,
  type PerformanceKey,
  type PerformanceMetrics,
  type Pillar,
  type ProductPresence,
  type WinnerType,
} from './record';

export const PERIODS = ['all', 'today', '7', '14', '30', '90', 'custom'] as const;
export type Period = (typeof PERIODS)[number];
export const PERIOD_LABELS: Record<Period, string> = {
  all: 'Todo o período',
  today: 'Hoje',
  '7': 'Últimos 7 dias',
  '14': 'Últimos 14 dias',
  '30': 'Últimos 30 dias',
  '90': 'Últimos 90 dias',
  custom: 'Personalizado',
};

/** "Produto aparece" covers every way of showing it; the demonstration options are narrower. */
export const PRODUCT_FILTERS = ['aparece', 'nao_aparece', 'demo_direta', 'demo_indireta'] as const;
export type ProductFilter = (typeof PRODUCT_FILTERS)[number];
export const PRODUCT_FILTER_LABELS: Record<ProductFilter, string> = {
  aparece: 'Produto aparece',
  nao_aparece: 'Produto não aparece',
  demo_direta: 'Demonstração direta',
  demo_indireta: 'Demonstração indireta',
};

export interface WinnerFilters {
  query: string;
  platforms: ContentPlatform[];
  /** Keys from accountKey(). */
  accounts: string[];
  formats: ContentFormat[];
  pillars: Pillar[];
  objectives: Objective[];
  contentTypes: Exclude<ContentType, 'auto'>[];
  hookTypes: HookType[];
  themes: string[];
  products: ProductFilter[];
  winnerTypes: WinnerType[];
  period: Period;
  /** 'YYYY-MM-DD', used with the custom period. */
  from: string;
  to: string;
  onlyFavorites: boolean;
  onlyMainModels: boolean;
}

export const EMPTY_FILTERS: WinnerFilters = {
  query: '',
  platforms: [],
  accounts: [],
  formats: [],
  pillars: [],
  objectives: [],
  contentTypes: [],
  hookTypes: [],
  themes: [],
  products: [],
  winnerTypes: [],
  period: 'all',
  from: '',
  to: '',
  onlyFavorites: false,
  onlyMainModels: false,
};

export function activeFilterCount(filters: WinnerFilters): number {
  const lists = [filters.platforms, filters.accounts, filters.formats, filters.pillars, filters.objectives, filters.contentTypes, filters.hookTypes, filters.themes, filters.products, filters.winnerTypes];
  return lists.reduce((sum, list) => sum + list.length, 0) + (filters.period !== 'all' ? 1 : 0) + Number(filters.onlyFavorites) + Number(filters.onlyMainModels);
}

const fold = (value: string) => value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Every text the global search looks into: title, hook, theme, copy, categories and structure. */
export function searchableText(record: ContentRecord): string {
  return fold(
    [
      record.title,
      record.hook,
      record.theme,
      record.notes,
      record.accountLabel,
      ...record.script.map((beat) => beat.text),
      CONTENT_FORMAT_LABELS[record.format],
      record.pillar ? PILLAR_LABELS[record.pillar] : '',
      record.objective ? OBJECTIVE_LABELS[record.objective] : '',
      record.contentType ? CONTENT_TYPE_LABELS[record.contentType] : '',
      record.hookType ? HOOK_TYPE_LABELS[record.hookType] : '',
      record.dna ? `${narrativeLabel(record.dna)} ${record.dna.tone} ${record.dna.emotion} ${record.dna.copyStyle}` : '',
    ].join(' '),
  );
}

function shiftDay(today: string, days: number): string {
  const date = new Date(`${today}T12:00:00`);
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

export function periodRange(filters: Pick<WinnerFilters, 'period' | 'from' | 'to'>, today: string): { from: string | null; to: string | null } {
  switch (filters.period) {
    case 'all':
      return { from: null, to: null };
    case 'today':
      return { from: today, to: today };
    case 'custom':
      return { from: filters.from || null, to: filters.to || null };
    default:
      // "Últimos 7 dias" includes today: today and the 6 days before.
      return { from: shiftDay(today, Number(filters.period) - 1), to: today };
  }
}

function matchesProduct(presence: ProductPresence | null, wanted: ProductFilter[]): boolean {
  if (wanted.length === 0) return true;
  if (!presence) return false;
  return wanted.some((filter) => (filter === 'aparece' ? presence !== 'nao_aparece' : presence === filter));
}

const inList = <T>(list: T[], value: T | null) => list.length === 0 || (value !== null && list.includes(value));

/** Every filter combines with the others (AND); options inside one filter combine with OR. */
export function applyFilters(records: ContentRecord[], filters: WinnerFilters, today: string): ContentRecord[] {
  const terms = fold(filters.query).split(/\s+/).filter(Boolean);
  const { from, to } = periodRange(filters, today);
  const themes = filters.themes.map(fold);
  return records.filter((record) => {
    const day = recordDay(record);
    if (from && day < from) return false;
    if (to && day > to) return false;
    if (!inList(filters.platforms, record.platform)) return false;
    if (!inList(filters.accounts, accountKey(record))) return false;
    if (!inList(filters.formats, record.format)) return false;
    if (!inList(filters.pillars, record.pillar)) return false;
    if (!inList(filters.objectives, record.objective)) return false;
    if (!inList(filters.contentTypes, record.contentType)) return false;
    if (!inList(filters.hookTypes, record.hookType)) return false;
    if (!inList(themes, record.theme ? fold(record.theme) : null)) return false;
    if (!matchesProduct(record.productPresence, filters.products)) return false;
    if (filters.winnerTypes.length > 0 && !filters.winnerTypes.some((type) => record.winnerTypes.includes(type))) return false;
    if (filters.onlyFavorites && !record.favorite) return false;
    if (filters.onlyMainModels && !record.mainModel) return false;
    if (terms.length > 0) {
      const haystack = searchableText(record);
      if (!terms.every((term) => haystack.includes(term))) return false;
    }
    return true;
  });
}

export const SORT_OPTIONS = [
  'recentes',
  'antigos',
  'score',
  'views',
  'likes',
  'comments',
  'shares',
  'saves',
  'follows',
  'profileVisits',
  'clicks',
  'leads',
  'signups',
  'trials',
  'sales',
  'revenue',
  'conversionRate',
] as const;
export type SortOption = (typeof SORT_OPTIONS)[number];

export const SORT_LABELS: Record<SortOption, string> = {
  recentes: 'Mais recentes',
  antigos: 'Mais antigos',
  score: 'Maior Performance Score',
  views: 'Mais visualizações',
  likes: 'Mais curtidas',
  comments: 'Mais comentários',
  shares: 'Mais compartilhamentos',
  saves: 'Mais salvamentos',
  follows: 'Mais seguidores',
  profileVisits: 'Mais visitas ao perfil',
  leads: 'Mais leads',
  clicks: 'Mais cliques',
  signups: 'Mais cadastros',
  trials: 'Mais trials',
  sales: 'Mais vendas',
  revenue: 'Maior receita',
  conversionRate: 'Maior taxa de conversão',
};

/** Groups of the sort menu: attention and conversion are read separately, never mixed into "best". */
export const SORT_GROUPS: { label: string; options: SortOption[] }[] = [
  { label: 'Data', options: ['recentes', 'antigos'] },
  { label: 'Geral', options: ['score'] },
  { label: 'Atenção', options: ['views', 'likes', 'comments', 'shares', 'saves', 'follows'] },
  { label: 'Interesse', options: ['profileVisits', 'clicks'] },
  { label: 'Conversão', options: ['leads', 'signups', 'trials', 'sales', 'revenue', 'conversionRate'] },
];

/**
 * Sorts by the chosen metric. Contents without that metric go last (not measured is not zero),
 * ties keep the most recent first.
 */
export function sortRecords(records: ContentRecord[], sort: SortOption, scoreOf: (metrics: PerformanceMetrics, account: string | null) => number | null): ContentRecord[] {
  const byDate = (a: ContentRecord, b: ContentRecord) => recordDay(b).localeCompare(recordDay(a)) || b.createdAt.localeCompare(a.createdAt);
  if (sort === 'recentes') return [...records].sort(byDate);
  if (sort === 'antigos') return [...records].sort((a, b) => byDate(b, a));
  const valueOf = (record: ContentRecord): number | null =>
    sort === 'score' ? scoreOf(record.metrics, accountKey(record)) : sort === 'conversionRate' ? conversionRate(record.metrics) : record.metrics[sort as PerformanceKey];
  return [...records].sort((a, b) => {
    const left = valueOf(a);
    const right = valueOf(b);
    if (left === null && right === null) return byDate(a, b);
    if (left === null) return 1;
    if (right === null) return -1;
    return right - left || byDate(a, b);
  });
}
