-- Fábrica 2.0, fase 6: fila de publicação pelas APIs oficiais (Instagram e páginas do Facebook).
-- Nada é publicado sem aprovação explícita: o job nasce "awaiting_approval", só o dono aprova,
-- e só a Edge Function publish-worker (service role) marca como publicando/publicado/falha.

create table public.publishing_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  connection_id uuid not null references public.social_connections (id) on delete cascade,
  carousel_id uuid references public.carousels (id) on delete set null,
  status text not null default 'awaiting_approval'
    check (status in ('awaiting_approval', 'scheduled', 'publishing', 'published', 'failed', 'cancelled')),
  scheduled_at timestamptz not null,
  -- Mesmo carrossel, mesma conta e mesmo horário: um job só, nunca dois posts iguais.
  idempotency_key text not null unique check (char_length(idempotency_key) <= 200),
  attempts integer not null default 0 check (attempts between 0 and 10),
  next_attempt_at timestamptz,
  approved_at timestamptz,
  external_id text,
  permalink text,
  last_error text check (last_error is null or char_length(last_error) <= 500),
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index publishing_jobs_user_idx on public.publishing_jobs (user_id, scheduled_at desc);
create index publishing_jobs_due_idx on public.publishing_jobs (status, coalesce(next_attempt_at, scheduled_at)) where status = 'scheduled';
create trigger publishing_jobs_touch before update on public.publishing_jobs for each row execute function public.touch_updated_at();

alter table public.publishing_jobs enable row level security;
create policy "publishing_jobs_owner_select" on public.publishing_jobs for select using (user_id = (select auth.uid()));
create policy "publishing_jobs_owner_insert" on public.publishing_jobs for insert
  with check (
    user_id = (select auth.uid())
    and status = 'awaiting_approval'
    and attempts = 0
    and external_id is null
    and exists (select 1 from public.social_connections c where c.id = connection_id and c.user_id = (select auth.uid()))
  );
-- O dono só pode aprovar (scheduled), cancelar ou devolver para aprovação; resultado de publicação é do servidor.
create policy "publishing_jobs_owner_update" on public.publishing_jobs for update
  using (user_id = (select auth.uid()) and status in ('awaiting_approval', 'scheduled', 'failed', 'cancelled'))
  with check (user_id = (select auth.uid()) and status in ('awaiting_approval', 'scheduled', 'cancelled') and external_id is null);
create policy "publishing_jobs_owner_delete" on public.publishing_jobs for delete using (user_id = (select auth.uid()) and status <> 'publishing');

-- Imagens aprovadas para publicar: privadas; a Meta recebe links assinados que vencem em 1 hora.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('publish-media', 'publish-media', false, 8388608, array['image/jpeg'])
on conflict (id) do nothing;

create policy "publish_media_owner_select" on storage.objects for select
  using (bucket_id = 'publish-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "publish_media_owner_insert" on storage.objects for insert
  with check (bucket_id = 'publish-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "publish_media_owner_delete" on storage.objects for delete
  using (bucket_id = 'publish-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
