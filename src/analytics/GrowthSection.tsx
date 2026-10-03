import clsx from 'clsx';
import { LineChart, Plus } from 'lucide-react';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { AGE_MARKS, ageRanking, growthRanking, historyOf, measurementSteps, momentumOf, type AgeMark } from '../domain/analytics/growth';
import type { AnalyticsItem } from '../domain/analytics/items';
import { formatPercent } from '../domain/winners/record';
import { Button, Select } from '../ui/primitives';
import { Chip } from '../winners/chips';
import { formatDayBr } from '../winners/WinnerCard';
import { MeasurementTable, MomentumBadge, ViewsChart } from './MeasurementHistory';
import { SectionTitle } from './sections';

interface GrowthSectionProps {
  /** Published content of the account and filters, any publication day: an old post can still be growing. */
  items: AnalyticsItem[];
  today: string;
  accountLabel: (item: AnalyticsItem) => string;
  onMeasure: (item: AnalyticsItem) => void;
}

const GROWTH_WINDOW = 7;
const LIST_SIZE = 5;

const nameOf = (item: AnalyticsItem) => item.record.hook || item.record.title || 'Sem título';
const lastMeasured = (item: AnalyticsItem) => historyOf(item.record).at(-1)?.day ?? '';
const compact = (value: number) => value.toLocaleString('pt-BR', { notation: value >= 10_000 ? 'compact' : 'standard', maximumFractionDigits: 1 });

/** Measurements over time: how each post grew, who is still growing, and who did best at the same age. */
export function GrowthSection({ items, today, accountLabel, onMeasure }: GrowthSectionProps) {
  const measured = useMemo(() => items.filter((item) => historyOf(item.record).length > 0).sort((a, b) => lastMeasured(b).localeCompare(lastMeasured(a))), [items]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [age, setAge] = useState<AgeMark>(7);
  const detailRef = useRef<HTMLDivElement>(null);
  const growth = useMemo(() => growthRanking(measured, today, GROWTH_WINDOW), [measured, today]);
  const atAge = useMemo(() => ageRanking(measured, age), [measured, age]);

  const selected = measured.find((item) => item.record.id === selectedId) ?? growth[0]?.item ?? measured[0] ?? null;
  const select = (item: AnalyticsItem) => {
    setSelectedId(item.record.id);
    detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    detailRef.current?.focus({ preventScroll: true });
  };

  return (
    <section aria-labelledby="growth-title">
      <SectionTitle hint="Cada vez que você mede um post, a data fica guardada. Daqui sai quanto ele cresceu entre uma medição e outra, e quem foi melhor com a mesma idade.">
        <span id="growth-title">Evolução dos posts</span>
      </SectionTitle>

      {measured.length === 0 ? (
        <p className="text-sm text-faint">Nenhum post medido ainda. Use “Métricas” no ranking abaixo e volte a medir nos dias seguintes.</p>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <div ref={detailRef} tabIndex={-1} className="flex min-w-0 flex-col gap-4 rounded-2xl border border-line bg-surface p-4 outline-none sm:p-5 focus-visible:ring-2 focus-visible:ring-accent/30">
            <div className="flex flex-wrap items-end gap-3">
              <label htmlFor="growth-post" className="flex min-w-[12rem] flex-1 flex-col gap-1.5">
                <span className="text-xs font-medium text-muted">Post</span>
                <Select id="growth-post" className="w-full min-w-0" value={selected?.record.id ?? ''} onChange={(e) => setSelectedId(e.target.value)}>
                  {measured.map((item) => (
                    <option key={item.record.id} value={item.record.id}>
                      {nameOf(item).slice(0, 70)} · {accountLabel(item)}
                    </option>
                  ))}
                </Select>
              </label>
              {selected && (
                <Button variant="primary" onClick={() => onMeasure(selected)}>
                  <Plus className="size-4" aria-hidden /> Nova medição
                </Button>
              )}
            </div>
            {selected && <PostEvolution item={selected} />}
          </div>

          <div className="flex min-w-0 flex-col gap-5">
            <div className="rounded-2xl border border-line bg-surface p-5">
              <h3 className="text-sm font-semibold text-ink">Quem mais cresceu nos últimos {GROWTH_WINDOW} dias</h3>
              <p className="mt-0.5 text-xs text-faint">Views ganhas entre a medição de antes da semana (ou a postagem) e a mais recente.</p>
              {growth.length === 0 ? (
                <p className="mt-3 text-sm text-faint">Meça os posts de novo nessa semana pra ver quem ainda está ganhando alcance.</p>
              ) : (
                <ol className="mt-3 flex flex-col gap-1">
                  {growth.slice(0, LIST_SIZE).map((entry, index) => (
                    <RankRow
                      key={entry.item.record.id}
                      position={index + 1}
                      title={nameOf(entry.item)}
                      detail={`${Math.round(entry.viewsPerDay).toLocaleString('pt-BR')} views/dia · ${formatDayBr(entry.from)} a ${formatDayBr(entry.to)}`}
                      value={`+${compact(entry.gained.views ?? 0)}`}
                      active={entry.item.record.id === selected?.record.id}
                      onClick={() => select(entry.item)}
                      badge={<MomentumBadge momentum={entry.momentum} />}
                    />
                  ))}
                </ol>
              )}
            </div>

            <div className="rounded-2xl border border-line bg-surface p-5">
              <h3 className="text-sm font-semibold text-ink">Comparação na mesma idade</h3>
              <p className="mt-0.5 text-xs text-faint">Views de cada post quando tinha a mesma quantidade de dias, pra não comparar post de ontem com post do mês passado.</p>
              <div role="group" aria-label="Dias de vida" className="mt-3 flex flex-wrap gap-1.5">
                {AGE_MARKS.map((mark) => (
                  <Chip key={mark} active={age === mark} onClick={() => setAge(mark)}>
                    {mark === 1 ? '1 dia' : `${mark} dias`}
                  </Chip>
                ))}
              </div>
              {atAge.length === 0 ? (
                <p className="mt-3 text-sm text-faint">Nenhum post foi medido com {age} {age === 1 ? 'dia' : 'dias'} de vida ou depois disso.</p>
              ) : (
                <ol className="mt-3 flex flex-col gap-1">
                  {atAge.slice(0, LIST_SIZE).map((entry, index) => {
                    const views = entry.metrics.views ?? 0;
                    const kept = (entry.metrics.saves ?? 0) + (entry.metrics.shares ?? 0);
                    const hasKept = entry.metrics.saves !== null || entry.metrics.shares !== null;
                    return (
                      <RankRow
                        key={entry.item.record.id}
                        position={index + 1}
                        title={nameOf(entry.item)}
                        detail={`${hasKept ? `${formatPercent(kept / views)} salvos + compart.` : accountLabel(entry.item)}${entry.estimated ? ' · estimado entre medições' : ''}`}
                        value={compact(views)}
                        active={entry.item.record.id === selected?.record.id}
                        onClick={() => select(entry.item)}
                      />
                    );
                  })}
                </ol>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function PostEvolution({ item }: { item: AnalyticsItem }) {
  const steps = measurementSteps(item.record);
  const momentum = momentumOf(item.record);
  const latest = steps.at(-1);
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <MomentumBadge momentum={momentum} />
        {item.record.publishedAt && <span>Publicado em {formatDayBr(item.record.publishedAt)}</span>}
        <span>
          {steps.length} {steps.length === 1 ? 'medição' : 'medições'}
        </span>
        {latest?.metrics.views != null && <span className="font-medium text-ink">{latest.metrics.views.toLocaleString('pt-BR')} views agora</span>}
      </div>
      {steps.length === 1 && !item.record.publishedAt ? (
        <p className="flex items-center gap-2 rounded-xl bg-subtle px-3 py-2.5 text-xs text-muted">
          <LineChart className="size-4 shrink-0" aria-hidden /> Com a data de publicação ou mais uma medição, o gráfico mostra o ritmo do post.
        </p>
      ) : (
        <ViewsChart steps={steps} publishedAt={item.record.publishedAt} />
      )}
      <MeasurementTable steps={steps} />
    </>
  );
}

interface RankRowProps {
  position: number;
  title: string;
  detail: string;
  value: string;
  active: boolean;
  onClick: () => void;
  badge?: ReactNode;
}

function RankRow({ position, title, detail, value, active, onClick, badge }: RankRowProps) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-current={active || undefined}
        className={clsx(
          'flex w-full cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
          active ? 'bg-subtle' : 'hover:bg-subtle',
        )}
      >
        <span className="w-4 shrink-0 text-xs tabular-nums text-faint">{position}</span>
        <span className="min-w-0 flex-1">
          <span className="line-clamp-1 text-sm font-medium text-ink">“{title}”</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-faint">
            {badge}
            {detail}
          </span>
        </span>
        <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">{value}</span>
      </button>
    </li>
  );
}
