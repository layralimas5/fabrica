-- Fábrica de Carrosséis: schema inicial.
-- Tenancy = usuário (cada linha pertence a auth.uid()); RLS em todas as tabelas e no bucket.

create extension if not exists pgcrypto;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Brand kits -----------------------------------------------------------------
create table public.brand_kits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index brand_kits_user_id_idx on public.brand_kits (user_id);
create trigger brand_kits_touch before update on public.brand_kits
  for each row execute function public.touch_updated_at();

alter table public.brand_kits enable row level security;
create policy "brand_kits_owner_select" on public.brand_kits for select using (user_id = (select auth.uid()));
create policy "brand_kits_owner_insert" on public.brand_kits for insert with check (user_id = (select auth.uid()));
create policy "brand_kits_owner_update" on public.brand_kits for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "brand_kits_owner_delete" on public.brand_kits for delete using (user_id = (select auth.uid()));

-- Biblioteca -----------------------------------------------------------------
create table public.assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  folder text not null default 'Geral' check (char_length(folder) between 1 and 60),
  kind text not null default 'foto'
    check (kind in ('foto', 'mockup', 'screenshot', 'textura', 'fundo', 'lifestyle', 'produto', 'ilustracao', 'icone', 'logo')),
  tags text[] not null default '{}' check (cardinality(tags) <= 30),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  mime_type text not null check (mime_type like 'image/%'),
  storage_path text not null unique,
  created_at timestamptz not null default now()
);

create index assets_user_id_created_idx on public.assets (user_id, created_at desc);
create index assets_tags_idx on public.assets using gin (tags);

alter table public.assets enable row level security;
create policy "assets_owner_select" on public.assets for select using (user_id = (select auth.uid()));
create policy "assets_owner_insert" on public.assets for insert
  with check (user_id = (select auth.uid()) and storage_path like (select auth.uid())::text || '/%');
create policy "assets_owner_update" on public.assets for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "assets_owner_delete" on public.assets for delete using (user_id = (select auth.uid()));

-- Carrosséis (área de Projetos) ---------------------------------------------
create table public.carousels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  brand_kit_id uuid not null references public.brand_kits (id) on delete restrict,
  title text not null check (char_length(title) between 1 and 200),
  status text not null default 'draft' check (status in ('draft', 'editing', 'ready', 'published')),
  format text not null default '4:5' check (format in ('4:5', '9:16')),
  source jsonb not null,
  slides jsonb not null check (jsonb_typeof(slides) = 'array' and jsonb_array_length(slides) between 1 and 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index carousels_user_updated_idx on public.carousels (user_id, updated_at desc);
create index carousels_brand_kit_idx on public.carousels (brand_kit_id);
create trigger carousels_touch before update on public.carousels
  for each row execute function public.touch_updated_at();

alter table public.carousels enable row level security;
create policy "carousels_owner_select" on public.carousels for select using (user_id = (select auth.uid()));
create policy "carousels_owner_insert" on public.carousels for insert
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.brand_kits b where b.id = brand_kit_id and b.user_id = (select auth.uid()))
  );
create policy "carousels_owner_update" on public.carousels for update
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.brand_kits b where b.id = brand_kit_id and b.user_id = (select auth.uid()))
  );
create policy "carousels_owner_delete" on public.carousels for delete using (user_id = (select auth.uid()));

-- Uso de IA (rate limit da Edge Function) ------------------------------------
create table public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  action text not null check (action in ('draft', 'rewrite', 'hooks')),
  created_at timestamptz not null default now()
);

create index ai_usage_user_created_idx on public.ai_usage (user_id, created_at desc);

alter table public.ai_usage enable row level security;
create policy "ai_usage_owner_select" on public.ai_usage for select using (user_id = (select auth.uid()));
create policy "ai_usage_owner_insert" on public.ai_usage for insert with check (user_id = (select auth.uid()));

-- Storage: bucket privado, cada usuário só mexe na própria pasta <uid>/ -------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('assets', 'assets', false, 15728640, array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'])
on conflict (id) do nothing;

create policy "assets_bucket_owner_select" on storage.objects for select
  using (bucket_id = 'assets' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "assets_bucket_owner_insert" on storage.objects for insert
  with check (bucket_id = 'assets' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "assets_bucket_owner_update" on storage.objects for update
  using (bucket_id = 'assets' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "assets_bucket_owner_delete" on storage.objects for delete
  using (bucket_id = 'assets' and (storage.foldername(name))[1] = (select auth.uid())::text);
