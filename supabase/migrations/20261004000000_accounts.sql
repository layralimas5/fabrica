-- Contas (perfis de Instagram/TikTok) que aparecem no cabeçalho dos slides estilo post.
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index accounts_user_id_idx on public.accounts (user_id);
create trigger accounts_touch before update on public.accounts
  for each row execute function public.touch_updated_at();

alter table public.accounts enable row level security;
create policy "accounts_owner_select" on public.accounts for select using (user_id = (select auth.uid()));
create policy "accounts_owner_insert" on public.accounts for insert with check (user_id = (select auth.uid()));
create policy "accounts_owner_update" on public.accounts for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "accounts_owner_delete" on public.accounts for delete using (user_id = (select auth.uid()));
