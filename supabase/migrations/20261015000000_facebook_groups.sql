-- Fábrica 2.0, fase 7: distribuição assistida em grupos do Facebook (de terceiros).
-- A Groups API foi descontinuada: nada aqui publica nem lê métricas dos grupos. Tudo é cadastrado e marcado à mão.

create table public.facebook_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index facebook_groups_user_idx on public.facebook_groups (user_id);
create trigger facebook_groups_touch before update on public.facebook_groups for each row execute function public.touch_updated_at();
alter table public.facebook_groups enable row level security;
create policy "facebook_groups_owner_select" on public.facebook_groups for select using (user_id = (select auth.uid()));
create policy "facebook_groups_owner_insert" on public.facebook_groups for insert with check (user_id = (select auth.uid()));
create policy "facebook_groups_owner_update" on public.facebook_groups for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "facebook_groups_owner_delete" on public.facebook_groups for delete using (user_id = (select auth.uid()));

create table public.group_distributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  group_id uuid not null references public.facebook_groups (id) on delete cascade,
  date date,
  status text not null default 'pending' check (status in ('pending', 'published', 'not_allowed')),
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index group_distributions_user_date_idx on public.group_distributions (user_id, date);
create index group_distributions_group_idx on public.group_distributions (group_id);
create trigger group_distributions_touch before update on public.group_distributions for each row execute function public.touch_updated_at();
alter table public.group_distributions enable row level security;
create policy "group_distributions_owner_select" on public.group_distributions for select using (user_id = (select auth.uid()));
create policy "group_distributions_owner_insert" on public.group_distributions for insert
  with check (user_id = (select auth.uid()) and exists (select 1 from public.facebook_groups g where g.id = group_id and g.user_id = (select auth.uid())));
create policy "group_distributions_owner_update" on public.group_distributions for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "group_distributions_owner_delete" on public.group_distributions for delete using (user_id = (select auth.uid()));
