-- Agendamentos da Fábrica 2.0 (rodar UMA vez no SQL Editor do Supabase, depois do `supabase db push`).
-- Não é migration porque leva o segredo do cron, que não pode ir para o git.
-- Antes: Database > Extensions > ativar pg_cron e pg_net.

-- 1. Guarda o mesmo valor do secret CRON_SECRET das funções (troque o texto abaixo).
select vault.create_secret('COLE_AQUI_O_MESMO_CRON_SECRET', 'fabrica_cron_secret');

-- 2. Sincronização das contas conectadas: a cada 3 horas (a função só lê as que passaram de SYNC_INTERVAL_HOURS).
select cron.schedule(
  'fabrica-social-sync',
  '0 */3 * * *',
  $$
  select net.http_post(
    url := 'https://rvizhshxcrfhdgfpennu.supabase.co/functions/v1/social-sync',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'fabrica_cron_secret')),
    body := '{}'::jsonb
  );
  $$
);

-- 3. Fila de publicação: a cada 5 minutos publica o que já foi aprovado e venceu.
select cron.schedule(
  'fabrica-publish-worker',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://rvizhshxcrfhdgfpennu.supabase.co/functions/v1/publish-worker',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'fabrica_cron_secret')),
    body := '{}'::jsonb
  );
  $$
);

-- 4. Retenção mínima dos eventos de rastreamento (13 meses), todo dia às 4h de Brasília (7h UTC).
select cron.schedule('fabrica-tracking-retention', '0 7 * * *', $$ select public.purge_old_tracking_events(); $$);

-- Para conferir: select * from cron.job;  Para parar um: select cron.unschedule('fabrica-publish-worker');
