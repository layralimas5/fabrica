-- Modelos Vencedores: resultados de cada conteúdo publicado e o vínculo das variações com o vencedor de origem.
create table public.content_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  carousel_id uuid references public.carousels (id) on delete set null,
  winner boolean not null default true,
  published_at date,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index content_records_user_id_idx on public.content_records (user_id);
create index content_records_carousel_id_idx on public.content_records (carousel_id);
create index content_records_user_winner_idx on public.content_records (user_id, winner, published_at desc);
create trigger content_records_touch before update on public.content_records
  for each row execute function public.touch_updated_at();

alter table public.content_records enable row level security;
create policy "content_records_owner_select" on public.content_records for select using (user_id = (select auth.uid()));
create policy "content_records_owner_insert" on public.content_records for insert with check (user_id = (select auth.uid()));
create policy "content_records_owner_update" on public.content_records for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "content_records_owner_delete" on public.content_records for delete using (user_id = (select auth.uid()));

-- Carrosséis criados a partir de um vencedor (modelo, variação ou família).
alter table public.carousels add column origin jsonb;
create index carousels_origin_model_idx on public.carousels ((origin ->> 'modelId')) where origin is not null;
