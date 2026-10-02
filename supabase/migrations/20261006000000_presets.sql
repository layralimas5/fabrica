-- Predefinições da tela Criar: todas as escolhas de uma produção, salvas com um nome.
create table public.presets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index presets_user_id_idx on public.presets (user_id);
create trigger presets_touch before update on public.presets
  for each row execute function public.touch_updated_at();

alter table public.presets enable row level security;
create policy "presets_owner_select" on public.presets for select using (user_id = (select auth.uid()));
create policy "presets_owner_insert" on public.presets for insert with check (user_id = (select auth.uid()));
create policy "presets_owner_update" on public.presets for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "presets_owner_delete" on public.presets for delete using (user_id = (select auth.uid()));
