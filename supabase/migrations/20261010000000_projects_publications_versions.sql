-- Fábrica 2.0, fase 1: projetos (marcas próprias), publicações externas ligadas aos conteúdos e versões de carrossel.
-- Contas e carrosséis continuam apontando para o projeto pelo nome (coluna/campo `project`), então nada muda neles.

-- Projetos ---------------------------------------------------------------------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  -- Chave pública que o snippet da landing page envia; não é segredo, só identifica o projeto.
  tracking_key text not null unique check (tracking_key ~ '^pk_[0-9a-f]{24}$'),
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index projects_user_name_idx on public.projects (user_id, lower(name));
create trigger projects_touch before update on public.projects for each row execute function public.touch_updated_at();

alter table public.projects enable row level security;
create policy "projects_owner_select" on public.projects for select using (user_id = (select auth.uid()));
create policy "projects_owner_insert" on public.projects for insert with check (user_id = (select auth.uid()));
create policy "projects_owner_update" on public.projects for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "projects_owner_delete" on public.projects for delete using (user_id = (select auth.uid()));

-- Publicações: posts que estão no ar, lidos da API ou ligados à mão ------------
create table public.publications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  platform text not null check (platform in ('instagram', 'facebook', 'tiktok')),
  external_id text check (external_id is null or char_length(external_id) between 1 and 80),
  permalink text check (permalink is null or char_length(permalink) <= 500),
  -- A conexão é criada na fase 2; a FK entra naquela migration.
  connection_id uuid,
  carousel_id uuid references public.carousels (id) on delete set null,
  record_id uuid references public.content_records (id) on delete set null,
  published_at timestamptz,
  source text not null default 'manual' check (source in ('sync', 'manual')),
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index publications_external_idx on public.publications (user_id, platform, external_id) where external_id is not null;
create index publications_permalink_idx on public.publications (user_id, permalink) where permalink is not null;
create index publications_carousel_idx on public.publications (carousel_id) where carousel_id is not null;
create index publications_record_idx on public.publications (record_id) where record_id is not null;
create index publications_user_published_idx on public.publications (user_id, published_at desc);
create trigger publications_touch before update on public.publications for each row execute function public.touch_updated_at();

alter table public.publications enable row level security;
create policy "publications_owner_select" on public.publications for select using (user_id = (select auth.uid()));
create policy "publications_owner_insert" on public.publications for insert with check (user_id = (select auth.uid()));
create policy "publications_owner_update" on public.publications for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "publications_owner_delete" on public.publications for delete using (user_id = (select auth.uid()));

-- Versões de carrossel ----------------------------------------------------------
create table public.content_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  carousel_id uuid not null references public.carousels (id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index content_versions_carousel_idx on public.content_versions (carousel_id, created_at desc);
create trigger content_versions_touch before update on public.content_versions for each row execute function public.touch_updated_at();

alter table public.content_versions enable row level security;
create policy "content_versions_owner_select" on public.content_versions for select using (user_id = (select auth.uid()));
create policy "content_versions_owner_insert" on public.content_versions for insert
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.carousels c where c.id = carousel_id and c.user_id = (select auth.uid()))
  );
create policy "content_versions_owner_delete" on public.content_versions for delete using (user_id = (select auth.uid()));
