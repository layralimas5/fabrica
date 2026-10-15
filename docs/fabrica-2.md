# Fábrica 2.0

Central de criação, distribuição e análise dos conteúdos das nossas marcas (Momentumm, Lumad, Aura e as próximas).
Tudo o que já existia continua igual; os módulos novos se ligam a ele.

## O que entrou

| Módulo | Onde | O que faz |
| --- | --- | --- |
| Projetos | `/projetos` | Marcas próprias com descrição, Brand Kit, landing page, objetivo de conversão, chave de rastreamento e sites autorizados. Contas e carrosséis se ligam pelo nome do projeto (o histórico entra sozinho). O seletor **Projeto** no topo filtra todas as telas. |
| Conteúdos | `/conteudos` | A antiga tela Projetos: filtros Criados/Agendados/Publicados, duplicar, **Vincular publicação** (URL ou id do post, inclusive de fora da Fábrica) e **Gerar em lote**. O editor ganhou **Versões** e **Publicar**. |
| Contas conectadas | `/conexoes` | Instagram (API com Login do Instagram), páginas do Facebook (Graph API) e TikTok (Display API) por OAuth oficial. Mostra status, última sincronização, permissões, validade da autorização, cota da API, histórico e Reconectar/Sincronizar/Desconectar. |
| Painel | `/painel` | Analytics real: filtros por projeto, rede, conta e período (7/30/90/personalizado), KPIs com fonte e cobertura, evolução, comparação por rede e formato, ranking, tabela e detalhe de cada post. |
| Conversões | `/conversoes` | Links rastreáveis (UTM + link curto que conta clique), funil conteúdo → clique → LP → quiz → cadastro → assinatura, atribuição por origem inicial ou última, guia de instalação do snippet e do evento de servidor. |
| Inteligência | `/inteligencia` | Rankings (engajamento, cliques, cadastros), comparação de ganchos/CTAs/assuntos/formatos, achados com evidência, resumo semanal, leitura opcional do Claude, **Gerar novas versões** e **Gerar lote com base nos resultados**. |
| Calendário | `/calendario` | Novos estados Aguardando aprovação e Falha, filtro por projeto, **Fila de publicação** e botão Publicar (automático no Instagram/Facebook, assistido no TikTok). |
| Grupos do Facebook | `/grupos` | Distribuição assistida: cadastro dos grupos com regras, uma versão por grupo, link rastreável por grupo, checklist/calendário e resultados anotados à mão. |

## Regras que o código garante

- **Nenhum número inventado.** Métrica que a rede não entrega fica ausente (nunca zero). Cada KPI diz em quantos posts existe. Crescimento só aparece com base no período anterior. Um post sincronizado usa os números da API; os lançados à mão só valem quando não há sync (nunca os dois somados).
- **Visualização, alcance e impressão não se misturam.** Cada card explica o que a métrica é em cada rede (ícone de informação).
- **Taxa de engajamento** = (curtidas + comentários + compartilhamentos + salvamentos) ÷ visualizações, somando os posts com visualizações e pelo menos uma interação. Salvamentos só entram onde a rede informa (Instagram). No ranking, só entram posts com 100+ visualizações.
- **Clique não é visita.** Clique = link curto aberto por uma pessoa (prévias de WhatsApp/Instagram/Facebook não contam). Visita = snippet carregado na landing page.
- **Pessoas no funil:** a mesma pessoa conta uma vez por etapa quando deu consentimento; eventos anônimos contam um a um. A "maior perda" compara só etapas de pessoas (visualização → clique é taxa de clique, outra unidade).
- **Nada é publicado sem aprovação explícita.** O agendamento nasce "Aguardando aprovação"; aprovar gera as imagens e entra na fila; só o servidor publica.
- **TikTok:** na hora agendada, o carrossel vai para os **rascunhos** da conta (Content Posting API, modo upload); a dona abre o app, escolhe a música e publica. O post direto exige auditoria do TikTok e não está ligado. O TikTok limita os rascunhos pendentes por conta: se estourar, a fila espera 1 hora e tenta de novo.
- **Grupos do Facebook:** nada publica nem lê métricas (a Groups API foi descontinuada).
- **A IA só lê o que foi medido.** O briefing da Inteligência leva só os números da tela; o prompt proíbe inventar dados, benchmarks e previsões.

## Banco (migrations novas)

`20261010` projetos, publicações, versões · `20261011` conexões, tokens, métricas sincronizadas, log de sync · `20261012` links e eventos de rastreamento, segredo de servidor por projeto · `20261013` análises da IA (e corrige o limite de uso da IA, que não contava tag/match/remix) · `20261014` fila de publicação e bucket `publish-media` · `20261015` grupos e divulgações.

Todas com RLS por `user_id`. Tokens OAuth ficam em `social_tokens` **sem nenhuma policy** (só as funções leem), criptografados com AES-256-GCM. Eventos, métricas sincronizadas e resultados de publicação só são escritos pelas funções (service role).

## Como ligar (passo a passo)

### 1. Banco

```bash
npx supabase login            # a CLI estava deslogada em 14/10
npx supabase link --project-ref rvizhshxcrfhdgfpennu
npx supabase db push          # aplica 20261010 a 20261015
```

Não colar as migrations no SQL Editor (o histórico de migrations precisa saber que foram aplicadas).

### 2. Secrets das funções

```bash
npx supabase secrets set \
  TOKEN_ENCRYPTION_KEY="$(openssl rand -base64 32)" \
  CRON_SECRET="$(openssl rand -hex 32)" \
  APP_URL=https://fabrica-s.netlify.app \
  ALLOWED_ORIGIN=https://fabrica-s.netlify.app,http://localhost:5320
```

Guarde o `CRON_SECRET` (vai no passo 5). **Nunca troque o `TOKEN_ENCRYPTION_KEY` depois de conectar contas**: os tokens guardados deixam de abrir e todas as contas precisam ser reconectadas.

Por rede (só as que for usar; sem elas a tela mostra "Configuração pendente"):

| Secret | De onde vem |
| --- | --- |
| `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET` | Meta for Developers > app > Instagram > API com Login do Instagram |
| `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET` | Meta for Developers > app > Configurações > Básico |
| `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` | TikTok for Developers > app > Credentials |

Opcionais: `META_GRAPH_VERSION` (padrão `v23.0`), `SYNC_INTERVAL_HOURS` (padrão 6), `OAUTH_REDIRECT_BASE` (domínio próprio para o retorno do OAuth), `AI_HOURLY_LIMIT`.

### 3. Funções

```bash
npx supabase functions deploy social-oauth --no-verify-jwt
npx supabase functions deploy social-sync --no-verify-jwt
npx supabase functions deploy track --no-verify-jwt
npx supabase functions deploy publish-worker --no-verify-jwt
npx supabase functions deploy carousel-ai            # novas ações analyze e batch
```

`--no-verify-jwt` é necessário porque o retorno do OAuth, os visitantes das landing pages e o cron não têm JWT. Cada função confere a própria credencial (JWT do usuário, chave pública + origem, segredo do projeto ou `CRON_SECRET`).

Para conferir os tipos antes do deploy: `npm run typecheck:functions`.

### 4. Netlify

Variável nova: `VITE_APP_URL=https://fabrica-s.netlify.app` (base dos links curtos). O `public/_redirects` já manda `/l/*` para a função `track`, e `/t.js` é o snippet.

### 5. Agendamentos

Ativar `pg_cron` e `pg_net` em Database > Extensions e rodar `supabase/cron.sql` uma vez no SQL Editor, trocando o texto pelo `CRON_SECRET`. Ele agenda a sincronização (a cada 3 h), a fila de publicação (a cada 5 min) e a retenção dos eventos.

### 6. Apps nas redes

**URLs de retorno** (aparecem prontas na tela Contas conectadas, em "O que precisa"):
`https://rvizhshxcrfhdgfpennu.supabase.co/functions/v1/social-oauth/callback/instagram` (e `/facebook`, `/tiktok`).

- **Instagram:** criar app do tipo Empresa na Meta, adicionar o produto Instagram > "API com Login do Instagram", cadastrar a URL de retorno e as permissões `instagram_business_basic`, `instagram_business_manage_insights` e `instagram_business_content_publish`. A conta precisa ser **profissional** (empresa ou criador). Em modo de desenvolvimento, só as contas adicionadas como testadoras conectam; para o modo ativo, as permissões passam pela revisão da Meta.
- **Páginas do Facebook:** no mesmo app, Login do Facebook para Empresas com `pages_show_list`, `pages_read_engagement`, `read_insights` e `pages_manage_posts`. Quem conecta precisa administrar a página.
- **TikTok:** app no TikTok for Developers com Login Kit (Web), Display API e Content Posting API, escopos `user.info.basic`, `user.info.profile`, `user.info.stats`, `video.list` e `video.upload`, e a URL de retorno. Em sandbox, só contas em Target users conectam; fora dele, o TikTok precisa aprovar o app. O site `https://fabrica-s.netlify.app/` precisa estar verificado (prefixo de URL) no app: o TikTok só baixa imagens de site verificado, e as imagens aprovadas saem por `/m/*` (proxy para o link assinado do Storage, em `public/_redirects`).

Nenhuma integração foi testada contra as APIs reais nesta entrega: faltam as credenciais e aprovações acima. O código foi testado com respostas simuladas de cada API (`npm test`) e as telas, no navegador, em modo local.

### 7. Rastreamento nas landing pages e apps

Em Conversões > Instalar nas páginas, cada projeto mostra o snippet pronto com a chave dele. Resumo:

1. Cadastrar a landing page e os outros domínios (quiz, app) no projeto, em "Sites que podem enviar eventos".
2. Colar o snippet antes de `</body>` na LP; no quiz e no app, com `data-pageview="off"`.
3. No banner de cookies: `fabrica.consent(true)` quando a pessoa aceitar. Sem consentimento os eventos contam, mas anônimos (nada é guardado no navegador).
4. No quiz: `fabrica.track('quiz_start')` e `fabrica.track('quiz_complete')`.
5. No cadastro: o formulário envia `fabrica.attribution()` para o servidor do app, e o servidor manda o evento `signup` (ou `trial_start`, `subscription`) para a função `track` com o header `x-fabrica-secret`. O segredo é gerado na mesma tela (aparece uma vez) e fica só nas variáveis do app.

Os links internos para os domínios em `data-decorate` levam a origem junto (LP → quiz → app), então o cadastro sabe de qual post a pessoa veio.

## Privacidade (LGPD)

- Nada de senha das redes: só OAuth oficial. Tokens criptografados, invisíveis até para o dono no banco.
- Eventos sem IP, e-mail, nome ou query string. Id de visitante aleatório só depois do consentimento.
- Retenção: eventos com mais de 13 meses e logs de sync com mais de 90 dias são apagados pelos agendamentos.
- Exclusão: "Desconectar" apaga os tokens (e, se marcado, os posts sincronizados); "Apagar eventos" em Conversões > Instalar apaga o rastreamento de um projeto; excluir um projeto apaga links e eventos dele.

## Limites conhecidos

- Miniaturas do Instagram e do TikTok vêm de links da CDN que vencem; a próxima sincronização renova.
- O Facebook trocou as métricas de impressão por "media view" em 2025: a Fábrica tenta as novas e cai para as antigas. Se a Meta recusar as duas, visualizações e alcance da página ficam indisponíveis (curtidas, comentários e compartilhamentos continuam).
- Seguidores só aparecem para contas conectadas, a partir da primeira sincronização (não há histórico anterior pela API).
- Links rastreáveis não entram no arquivo de backup (ficam no Supabase); grupos, divulgações, projetos e publicações vinculadas entram.
