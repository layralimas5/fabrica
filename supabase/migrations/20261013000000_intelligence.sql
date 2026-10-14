-- Fábrica 2.0, fase 5: Inteligência de Conteúdo.

-- O limite de uso da IA só aceitava draft/rewrite/hooks: tag, match e remix falhavam ao registrar
-- (e não contavam no limite por hora). Agora todas as ações contam.
alter table public.ai_usage drop constraint if exists ai_usage_action_check;
alter table public.ai_usage add constraint ai_usage_action_check check (action in ('draft', 'rewrite', 'hooks', 'tag', 'match', 'remix', 'analyze'));

-- Análises guardadas (leitura do Claude sobre os números medidos de um projeto num período).
create table public.ai_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ai_insights_user_idx on public.ai_insights (user_id, created_at desc);
create trigger ai_insights_touch before update on public.ai_insights for each row execute function public.touch_updated_at();

alter table public.ai_insights enable row level security;
create policy "ai_insights_owner_select" on public.ai_insights for select using (user_id = (select auth.uid()));
create policy "ai_insights_owner_insert" on public.ai_insights for insert with check (user_id = (select auth.uid()));
create policy "ai_insights_owner_update" on public.ai_insights for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "ai_insights_owner_delete" on public.ai_insights for delete using (user_id = (select auth.uid()));
