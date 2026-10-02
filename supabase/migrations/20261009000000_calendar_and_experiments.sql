-- Controle de Testes: experimentos com hipótese, variável e aprendizado.
create table public.experiments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index experiments_user_id_idx on public.experiments (user_id);
create trigger experiments_touch before update on public.experiments for each row execute function public.touch_updated_at();
alter table public.experiments enable row level security;
create policy "experiments_owner_select" on public.experiments for select using (user_id = (select auth.uid()));
create policy "experiments_owner_insert" on public.experiments for insert with check (user_id = (select auth.uid()));
create policy "experiments_owner_update" on public.experiments for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "experiments_owner_delete" on public.experiments for delete using (user_id = (select auth.uid()));

-- Calendário Editorial: conteúdos planejados que ainda não são carrosséis da Fábrica (vídeo, UGC, Reels, ideias).
create table public.calendar_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index calendar_entries_user_date_idx on public.calendar_entries (user_id, date);
create trigger calendar_entries_touch before update on public.calendar_entries for each row execute function public.touch_updated_at();
alter table public.calendar_entries enable row level security;
create policy "calendar_entries_owner_select" on public.calendar_entries for select using (user_id = (select auth.uid()));
create policy "calendar_entries_owner_insert" on public.calendar_entries for insert with check (user_id = (select auth.uid()));
create policy "calendar_entries_owner_update" on public.calendar_entries for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "calendar_entries_owner_delete" on public.calendar_entries for delete using (user_id = (select auth.uid()));
