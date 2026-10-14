-- Fábrica 2.0, fase 2: contas conectadas por OAuth oficial e métricas sincronizadas.
-- Tokens ficam numa tabela sem nenhuma policy: só as Edge Functions (service role) leem e escrevem,
-- e sempre criptografados (AES-GCM com TOKEN_ENCRYPTION_KEY, que só existe nos secrets das funções).

-- Conexões -------------------------------------------------------------------
create table public.social_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null check (platform in ('instagram', 'facebook', 'tiktok')),
  external_id text not null check (char_length(external_id) between 1 and 80),
  username text not null default '',
  display_name text not null default '',
  avatar_url text,
  -- Conta da Fábrica (cabeçalho dos slides) e projeto a que a conexão pertence; opcionais.
  account_id uuid references public.accounts (id) on delete set null,
  project_id uuid references public.projects (id) on delete set null,
  scopes text[] not null default '{}',
  status text not null default 'connected' check (status in ('connected', 'expired', 'revoked', 'error')),
  token_expires_at timestamptz,
  refresh_expires_at timestamptz,
  last_sync_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 500),
  -- Último uso de cota informado pela API (cabeçalhos X-App-Usage da Meta, 429 do TikTok).
  rate_limit jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, platform, external_id)
);

create index social_connections_user_idx on public.social_connections (user_id);
create trigger social_connections_touch before update on public.social_connections for each row execute function public.touch_updated_at();

alter table public.social_connections enable row level security;
create policy "social_connections_owner_select" on public.social_connections for select using (user_id = (select auth.uid()));
-- O dono só pode trocar o vínculo com conta/projeto; status, tokens e sync são do servidor.
create policy "social_connections_owner_update" on public.social_connections for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke update on public.social_connections from authenticated;
grant update (account_id, project_id) on public.social_connections to authenticated;

create table public.social_tokens (
  connection_id uuid primary key references public.social_connections (id) on delete cascade,
  access_token_enc text not null,
  refresh_token_enc text,
  updated_at timestamptz not null default now()
);
alter table public.social_tokens enable row level security;
-- Sem policies de propósito: nenhum usuário lê token, nem o próprio dono.

-- State do OAuth: uso único, expira em 10 minutos.
create table public.oauth_states (
  state text primary key check (char_length(state) between 32 and 128),
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null check (platform in ('instagram', 'facebook', 'tiktok')),
  project_id uuid references public.projects (id) on delete set null,
  code_verifier text,
  return_to text not null default '/contas',
  expires_at timestamptz not null default now() + interval '10 minutes'
);
alter table public.oauth_states enable row level security;

alter table public.publications
  add constraint publications_connection_fk foreign key (connection_id) references public.social_connections (id) on delete set null;

-- Métricas por publicação: uma leitura por dia, o último número do dia vence ---------------
create table public.publication_metrics (
  publication_id uuid not null references public.publications (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  captured_on date not null,
  -- Só as métricas que a API devolveu. Ausente = indisponível, nunca zero.
  metrics jsonb not null check (jsonb_typeof(metrics) = 'object'),
  captured_at timestamptz not null default now(),
  primary key (publication_id, captured_on)
);
create index publication_metrics_user_day_idx on public.publication_metrics (user_id, captured_on);
alter table public.publication_metrics enable row level security;
create policy "publication_metrics_owner_select" on public.publication_metrics for select using (user_id = (select auth.uid()));

-- Métricas da conta (seguidores, alcance do dia) ----------------------------
create table public.account_metrics (
  connection_id uuid not null references public.social_connections (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  captured_on date not null,
  metrics jsonb not null check (jsonb_typeof(metrics) = 'object'),
  captured_at timestamptz not null default now(),
  primary key (connection_id, captured_on)
);
create index account_metrics_user_day_idx on public.account_metrics (user_id, captured_on);
alter table public.account_metrics enable row level security;
create policy "account_metrics_owner_select" on public.account_metrics for select using (user_id = (select auth.uid()));

-- Registro de cada sincronização (manual ou agendada) ----------------------------------
create table public.sync_runs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  connection_id uuid not null references public.social_connections (id) on delete cascade,
  trigger text not null check (trigger in ('manual', 'schedule')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'ok', 'partial', 'error', 'rate_limited')),
  publications integer not null default 0,
  error text check (error is null or char_length(error) <= 500),
  rate_limit jsonb
);
create index sync_runs_connection_idx on public.sync_runs (connection_id, started_at desc);
alter table public.sync_runs enable row level security;
create policy "sync_runs_owner_select" on public.sync_runs for select using (user_id = (select auth.uid()));

-- Retenção mínima: logs de sync com mais de 90 dias e states vencidos saem.
create or replace function public.purge_sync_housekeeping()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.sync_runs where started_at < now() - interval '90 days';
  delete from public.oauth_states where expires_at < now();
$$;
revoke execute on function public.purge_sync_housekeeping() from public, anon, authenticated;
grant execute on function public.purge_sync_housekeeping() to service_role;
