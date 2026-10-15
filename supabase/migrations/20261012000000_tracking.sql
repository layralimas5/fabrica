-- Fábrica 2.0, fase 4: links rastreáveis, eventos das landing pages/apps e funil de conversão.
-- Eventos entram só pela Edge Function `track` (chave pública do projeto + origem permitida, ou segredo do servidor).
-- Nada de IP, e-mail ou nome: o visitante é um id aleatório criado no navegador depois do consentimento.

create table public.tracking_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9]{6,16}$'),
  destination text not null check (destination ~ '^https://' and char_length(destination) <= 1000),
  platform text check (platform is null or platform in ('instagram', 'facebook', 'tiktok', 'outros')),
  carousel_id uuid references public.carousels (id) on delete set null,
  record_id uuid references public.content_records (id) on delete set null,
  publication_id uuid references public.publications (id) on delete set null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tracking_links_user_idx on public.tracking_links (user_id, created_at desc);
create index tracking_links_project_idx on public.tracking_links (project_id);
create trigger tracking_links_touch before update on public.tracking_links for each row execute function public.touch_updated_at();

alter table public.tracking_links enable row level security;
create policy "tracking_links_owner_select" on public.tracking_links for select using (user_id = (select auth.uid()));
create policy "tracking_links_owner_insert" on public.tracking_links for insert
  with check (user_id = (select auth.uid()) and exists (select 1 from public.projects p where p.id = project_id and p.user_id = (select auth.uid())));
create policy "tracking_links_owner_update" on public.tracking_links for update using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and exists (select 1 from public.projects p where p.id = project_id and p.user_id = (select auth.uid())));
create policy "tracking_links_owner_delete" on public.tracking_links for delete using (user_id = (select auth.uid()));

create table public.tracking_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  -- Id gerado por quem envia: o mesmo evento enviado duas vezes conta uma vez.
  event_id text not null check (char_length(event_id) between 8 and 64),
  name text not null check (name in ('click', 'lp_view', 'quiz_start', 'quiz_complete', 'signup', 'trial_start', 'subscription')),
  link_id uuid references public.tracking_links (id) on delete set null,
  visitor_id text check (visitor_id is null or char_length(visitor_id) between 8 and 64),
  session_id text check (session_id is null or char_length(session_id) between 8 and 64),
  -- true quando veio do servidor do app com o segredo do projeto (cadastro e assinatura confirmados).
  verified boolean not null default false,
  consent boolean not null default false,
  first_touch jsonb,
  last_touch jsonb,
  page_path text check (page_path is null or char_length(page_path) <= 300),
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  unique (project_id, event_id)
);
create index tracking_events_project_time_idx on public.tracking_events (project_id, occurred_at desc);
create index tracking_events_user_time_idx on public.tracking_events (user_id, occurred_at desc);
create index tracking_events_link_idx on public.tracking_events (link_id) where link_id is not null;

alter table public.tracking_events enable row level security;
create policy "tracking_events_owner_select" on public.tracking_events for select using (user_id = (select auth.uid()));
-- O dono pode apagar eventos (pedido de exclusão, LGPD).
create policy "tracking_events_owner_delete" on public.tracking_events for delete using (user_id = (select auth.uid()));

-- Segredo para eventos enviados pelo servidor do app; só o hash fica guardado.
create table public.project_secrets (
  project_id uuid primary key references public.projects (id) on delete cascade,
  secret_hash text not null check (char_length(secret_hash) = 64),
  rotated_at timestamptz not null default now()
);
alter table public.project_secrets enable row level security;

-- Retenção: eventos com mais de 13 meses saem (dá pra comparar o mesmo mês do ano anterior).
create or replace function public.purge_old_tracking_events()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.tracking_events where occurred_at < now() - interval '13 months';
$$;
revoke execute on function public.purge_old_tracking_events() from public, anon, authenticated;
grant execute on function public.purge_old_tracking_events() to service_role;
