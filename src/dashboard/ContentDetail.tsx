import { ExternalLink, PenLine, Sparkles, Wand2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LineChart } from '../charts/LineChart';
import type { Account } from '../domain/account';
import type { Asset } from '../domain/asset';
import type { BrandKit } from '../domain/brandKit';
import type { Carousel } from '../domain/carousel';
import { compactNumber, percent } from '../domain/dashboard/dashboard';
import { DASH_PLATFORM_LABELS, itemEngagement, type DashItem } from '../domain/dashboard/items';
import { timeAgo } from '../domain/social/connection';
import { METRIC_MEANING, POST_METRIC_KEYS, POST_METRIC_LABELS } from '../domain/social/metrics';
import { Drawer } from '../ui/Drawer';
import { Button } from '../ui/primitives';
import { ContentThumb, SourceBadge } from './parts';

interface Props {
  item: DashItem | null;
  onClose: () => void;
  carousels: Carousel[];
  brands: BrandKit[];
  assets: Asset[];
  accounts: Account[];
  /** Tracked links and conversions of this content (filled by the tracking module). */
  conversions?: ReactNode;
  /** Reuses what made this post work in new content: one from it as a model, or a set of variations. */
  onReapply?: (mode: 'model' | 'variations') => void;
  reapplying?: boolean;
}

export function ContentDetail({ item, onClose, carousels, brands, assets, accounts, conversions, onReapply, reapplying = false }: Props) {
  if (!item) return null;
  const engagement = itemEngagement(item.metrics);
  const viewsHistory = item.history.filter((entry) => entry.metrics.views !== undefined);

  return (
    <Drawer open title={item.title} onClose={onClose}>
      <div className="flex flex-col gap-6">
        <div className="flex gap-4">
          <ContentThumb item={item} carousels={carousels} brands={brands} assets={assets} accounts={accounts} className="size-24" />
          <dl className="grid min-w-0 flex-1 grid-cols-2 gap-x-3 gap-y-2 text-xs">
            <div>
              <dt className="text-faint">Rede</dt>
              <dd className="font-medium text-ink">{DASH_PLATFORM_LABELS[item.platform]}</dd>
            </div>
            <div>
              <dt className="text-faint">Publicado</dt>
              <dd className="font-medium text-ink">{item.publishedDay ? new Date(`${item.publishedDay}T12:00:00`).toLocaleDateString('pt-BR') : '—'}</dd>
            </div>
            <div>
              <dt className="text-faint">Formato</dt>
              <dd className="font-medium text-ink">{item.formatLabel}</dd>
            </div>
            <div>
              <dt className="text-faint">Fonte</dt>
              <dd className="flex items-center gap-1.5">
                <SourceBadge source={item.source} />
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-faint">Última leitura</dt>
              <dd className="font-medium text-ink">{item.lastReadAt ? `${new Date(item.lastReadAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} (${timeAgo(item.lastReadAt, new Date())})` : '—'}</dd>
            </div>
          </dl>
        </div>

        <div className="flex flex-wrap gap-2">
          {item.permalink && (
            <a href={item.permalink} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-line px-2.5 text-xs font-medium text-ink hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
              <ExternalLink className="size-3.5" aria-hidden /> Abrir o post
            </a>
          )}
          {item.carouselId && carousels.some((carousel) => carousel.id === item.carouselId) && (
            <Link to={`/carrossel/${item.carouselId}`} className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-line px-2.5 text-xs font-medium text-ink hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
              <PenLine className="size-3.5" aria-hidden /> Abrir no editor
            </Link>
          )}
        </div>

        {onReapply && (
          <section className="rounded-2xl border border-line p-4">
            <h3 className="text-sm font-semibold text-ink">Reaplicar o que funcionou</h3>
            <p className="mt-1 text-xs text-muted">Leva a estrutura deste post (gancho, ritmo, CTA) para um conteúdo novo, sem copiar o texto.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="primary" size="sm" loading={reapplying} onClick={() => onReapply('model')}>
                <Sparkles className="size-3.5" aria-hidden /> Usar como modelo
              </Button>
              <Button variant="secondary" size="sm" disabled={reapplying} onClick={() => onReapply('variations')}>
                <Wand2 className="size-3.5" aria-hidden /> Gerar variações
              </Button>
            </div>
          </section>
        )}

        {item.caption && (
          <section>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-faint">Legenda</h3>
            <p className="line-clamp-6 whitespace-pre-line text-sm text-muted">{item.caption}</p>
          </section>
        )}

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">Métricas</h3>
          <dl className="grid grid-cols-2 gap-2">
            {POST_METRIC_KEYS.map((key) => {
              const value = item.metrics[key];
              const meaning = item.platform === 'outros' ? null : METRIC_MEANING[key][item.platform];
              return (
                <div key={key} className="rounded-xl bg-subtle px-3 py-2" title={meaning ?? 'Essa rede não informa essa métrica pela API oficial.'}>
                  <dt className="text-[11px] text-muted">{POST_METRIC_LABELS[key]}</dt>
                  <dd className={value === undefined ? 'text-xs text-faint' : 'text-base font-semibold tabular-nums text-ink'}>
                    {value === undefined ? (meaning === null ? 'a rede não informa' : 'indisponível') : value.toLocaleString('pt-BR')}
                  </dd>
                </div>
              );
            })}
            <div className="col-span-2 rounded-xl bg-subtle px-3 py-2">
              <dt className="text-[11px] text-muted">Taxa de engajamento (interações ÷ visualizações)</dt>
              <dd className={engagement === null ? 'text-xs text-faint' : 'text-base font-semibold tabular-nums text-ink'}>{engagement === null ? 'sem visualizações para calcular' : percent(engagement, 2)}</dd>
            </div>
          </dl>
          {item.manualConversions && (
            <p className="mt-2 text-xs text-muted">
              Lançado à mão: {item.manualConversions.clicks ?? '—'} cliques, {item.manualConversions.signups ?? '—'} cadastros.
            </p>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">Histórico de visualizações</h3>
          {viewsHistory.length >= 2 ? (
            <LineChart points={viewsHistory.map((entry) => ({ day: entry.day, value: entry.metrics.views ?? null }))} label="Visualizações" format={compactNumber} height={160} />
          ) : (
            <p className="text-sm text-muted">{viewsHistory.length === 1 ? 'Só uma leitura até agora. A linha aparece a partir da segunda.' : 'Sem leituras de visualizações.'}</p>
          )}
        </section>

        {conversions}
      </div>
    </Drawer>
  );
}
