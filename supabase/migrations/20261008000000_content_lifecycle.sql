-- Ciclo de vida completo do conteúdo: depois de publicado ele é analisado e classificado (vencedor, fraco) ou arquivado.
alter table public.carousels drop constraint if exists carousels_status_check;
alter table public.carousels add constraint carousels_status_check
  check (status in ('draft', 'editing', 'ready', 'published', 'analyzing', 'winner', 'weak', 'archived'));

-- Analytics filtra por conta e período: a conta mora em source->>'accountId'.
create index if not exists carousels_account_idx on public.carousels ((source ->> 'accountId'));
