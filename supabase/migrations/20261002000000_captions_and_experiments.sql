-- Legenda do post, testes de formato (variantes ligadas por experiment.id) e métricas lançadas à mão.
alter table public.carousels
  add column caption text not null default '' check (char_length(caption) <= 2200),
  add column experiment jsonb check (experiment is null or (experiment ? 'id' and experiment ? 'variant')),
  add column metrics jsonb check (
    metrics is null
    or (
      (metrics->>'views')::bigint >= 0 and (metrics->>'likes')::bigint >= 0 and (metrics->>'comments')::bigint >= 0
      and (metrics->>'shares')::bigint >= 0 and (metrics->>'saves')::bigint >= 0 and (metrics->>'follows')::bigint >= 0
    )
  );

create index carousels_experiment_idx on public.carousels ((experiment->>'id')) where experiment is not null;
