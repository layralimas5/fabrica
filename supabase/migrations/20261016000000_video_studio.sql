-- Estúdio de vídeos: a Fábrica guarda a pauta, a aprovação e a publicação; o estúdio local (no PC da dona)
-- pega os pedidos da fila, roteiriza, renderiza no Remotion e devolve os arquivos.
-- O estúdio entra com uma chave própria (só o hash fica aqui) e fala apenas com a Edge Function studio.
-- Também entra o YouTube como rede conectada (Data API v3, OAuth do Google).

-- YouTube nas redes conectadas -----------------------------------------------------
alter table public.social_connections drop constraint social_connections_platform_check;
alter table public.social_connections add constraint social_connections_platform_check check (platform in ('instagram', 'facebook', 'tiktok', 'youtube'));
alter table public.oauth_states drop constraint oauth_states_platform_check;
alter table public.oauth_states add constraint oauth_states_platform_check check (platform in ('instagram', 'facebook', 'tiktok', 'youtube'));
alter table public.publications drop constraint publications_platform_check;
alter table public.publications add constraint publications_platform_check check (platform in ('instagram', 'facebook', 'tiktok', 'youtube'));
alter table public.tracking_links drop constraint tracking_links_platform_check;
alter table public.tracking_links add constraint tracking_links_platform_check check (platform is null or platform in ('instagram', 'facebook', 'tiktok', 'youtube', 'outros'));

-- Pedidos de vídeo ------------------------------------------------------------------
create table public.video_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  -- Canal do estúdio (nivora, lumo, omnxdepp, ohlayralm...): o estúdio sabe qual projeto e skill cada um usa.
  channel text not null check (channel ~ '^[a-z0-9-]{1,40}$'),
  -- create: o estúdio escreve e monta o vídeo a partir do briefing; render: a composição já existe, só renderiza.
  mode text not null check (mode in ('create', 'render')),
  title text not null check (char_length(title) between 1 and 120),
  brief text not null default '' check (char_length(brief) <= 4000),
  formats text[] not null check (cardinality(formats) between 1 and 2 and formats <@ array['long', 'vertical']),
  -- Composições do Remotion por formato ({"long": "TutorialCanal", "vertical": "TutorialCanalReels"}).
  compositions jsonb not null default '{}' check (jsonb_typeof(compositions) = 'object'),
  status text not null default 'queued' check (status in ('queued', 'working', 'ready', 'failed', 'cancelled')),
  step text check (step is null or char_length(step) <= 120),
  progress integer not null default 0 check (progress between 0 and 100),
  attempts integer not null default 0 check (attempts between 0 and 10),
  worker text check (worker is null or char_length(worker) <= 80),
  claimed_at timestamptz,
  heartbeat_at timestamptz,
  -- Arquivos devolvidos pelo estúdio (caminhos no bucket studio-media e o arquivo longo que fica no PC).
  outputs jsonb not null default '{}' check (jsonb_typeof(outputs) = 'object'),
  -- Legenda/descrição sugerida pelo estúdio; a dona edita antes de publicar.
  caption text not null default '' check (char_length(caption) <= 5000),
  last_error text check (last_error is null or char_length(last_error) <= 500),
  log text not null default '' check (char_length(log) <= 20000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index video_jobs_user_idx on public.video_jobs (user_id, created_at desc);
create index video_jobs_queue_idx on public.video_jobs (user_id, created_at) where status = 'queued';
create trigger video_jobs_touch before update on public.video_jobs for each row execute function public.touch_updated_at();

alter table public.video_jobs enable row level security;
create policy "video_jobs_owner_select" on public.video_jobs for select using (user_id = (select auth.uid()));
create policy "video_jobs_owner_insert" on public.video_jobs for insert
  with check (
    user_id = (select auth.uid())
    and status = 'queued'
    and attempts = 0
    and outputs = '{}'::jsonb
    and (project_id is null or exists (select 1 from public.projects p where p.id = project_id and p.user_id = (select auth.uid())))
  );
create policy "video_jobs_owner_update" on public.video_jobs for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "video_jobs_owner_delete" on public.video_jobs for delete using (user_id = (select auth.uid()) and status <> 'working');
-- A dona edita o pedido e muda o estado; arquivos, progresso e erros são do estúdio (service role).
revoke update on public.video_jobs from authenticated;
grant update (title, brief, caption, formats, compositions, project_id, status) on public.video_jobs to authenticated;

-- Transições que a dona pode fazer: cancelar, devolver para a fila (refazer) e editar sem mudar de estado.
create or replace function public.video_jobs_owner_transition()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (select auth.role()) <> 'authenticated' then
    return new;
  end if;
  -- Cancelar vale até com o estúdio trabalhando: no próximo aviso de progresso ele vê e para.
  if new.status = 'cancelled' and old.status in ('queued', 'working', 'ready', 'failed') then
    return new;
  end if;
  if old.status = 'working' then
    raise exception 'O estúdio está trabalhando nesse vídeo. Espera terminar ou cancela.';
  end if;
  if new.status = old.status then
    return new;
  end if;
  if new.status = 'queued' and old.status in ('ready', 'failed', 'cancelled') then
    new.attempts := 0;
    new.progress := 0;
    new.step := null;
    new.last_error := null;
    new.worker := null;
    new.claimed_at := null;
    new.heartbeat_at := null;
    return new;
  end if;
  raise exception 'Mudança de estado não permitida: % para %.', old.status, new.status;
end;
$$;
create trigger video_jobs_owner_transition before update on public.video_jobs for each row execute function public.video_jobs_owner_transition();

-- Chave do estúdio local: uma por dona, só o hash fica guardado (a chave aparece uma vez na tela).
create table public.studio_keys (
  user_id uuid primary key references auth.users (id) on delete cascade,
  secret_hash text not null unique check (char_length(secret_hash) = 64),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  -- O que o estúdio contou de si no último contato (nome da máquina, canais, versão).
  worker_info jsonb
);
alter table public.studio_keys enable row level security;
create policy "studio_keys_owner_select" on public.studio_keys for select using (user_id = (select auth.uid()));
revoke select on public.studio_keys from authenticated;
grant select (user_id, created_at, last_seen_at, worker_info) on public.studio_keys to authenticated;

-- Publicação de vídeo pela fila -------------------------------------------------------
alter table public.publishing_jobs add column video_job_id uuid references public.video_jobs (id) on delete set null;
create index publishing_jobs_video_idx on public.publishing_jobs (video_job_id) where video_job_id is not null;
-- Vídeo e carrossel nunca no mesmo job.
alter table public.publishing_jobs add constraint publishing_jobs_one_source check (carousel_id is null or video_job_id is null);

-- Vídeos renderizados: privados; as redes recebem links assinados que vencem em 1 hora.
-- 50 MB é o teto de arquivo do plano gratuito do Supabase; o estúdio comprime o vertical para caber
-- e o vídeo longo vai do PC direto para o YouTube (aqui fica só a prévia).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('studio-media', 'studio-media', false, 52428800, array['video/mp4', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy "studio_media_owner_select" on storage.objects for select
  using (bucket_id = 'studio-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "studio_media_owner_delete" on storage.objects for delete
  using (bucket_id = 'studio-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
-- Sem insert para a dona: só o estúdio envia, por link de upload assinado que a função studio gera.
