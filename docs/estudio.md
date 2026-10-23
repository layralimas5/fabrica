# Estúdio de vídeos e YouTube

A Fábrica guarda a pauta, a revisão e a publicação dos vídeos; o estúdio no PC
(`pessoais/estudio-videos`) roteiriza, renderiza e devolve os arquivos. O YouTube entrou como rede
conectada, com métricas no Painel e envio de vídeo pelo estúdio.

## O que entrou

| Peça | Onde | O que faz |
| --- | --- | --- |
| Tela Estúdio | `/estudio` | Novo vídeo (canal, projeto, briefing ou composição, formatos), andamento ao vivo, revisão com prévia, edição de título e legenda, **Aprovar e agendar** por conta, chave do estúdio. |
| Pedidos | tabela `video_jobs` | Fila do estúdio. A dona cria, edita, cancela e refaz; arquivos, progresso e erros só o estúdio escreve (gatilho `video_jobs_owner_transition` + grants por coluna). |
| Chave do estúdio | tabela `studio_keys` | Uma por dona, só o hash fica guardado. Trocar desliga a anterior. |
| Arquivos | bucket `studio-media` | Vertical (até 48 MB), prévia 480p do longo e capas. Privado; o estúdio sobe por link assinado. |
| Função `studio` | `supabase/functions/studio` | Ponte com o estúdio (chave no header `x-studio-key`): pegar pedido, progresso, upload, entregar, falhar, e os envios aprovados para o YouTube. |
| Publicação de vídeo | `publish-worker` | Reels no Instagram, vídeo em página do Facebook e rascunho de vídeo no TikTok. Vídeo ainda processando espera sem gastar tentativa (`processing`), por até 60 minutos. |
| YouTube | `_shared/social/youtube.ts` | OAuth do Google, canal, inscritos, vídeos com visualizações, gostei e comentários. |

## Regras que o código garante

- **Nada sai sem aprovação.** "Aprovar e agendar" cria o job e aprova na mesma ação; a fila só
  publica job aprovado.
- **O longo nunca passa pelo Storage.** Ele fica no PC e vai só para o YouTube, enviado pelo estúdio.
  Instagram, TikTok e Shorts recebem o vertical.
- **Sem vídeo duplicado.** Reels guarda o container, TikTok o publish id, Facebook confere a descrição
  dos vídeos recentes e o YouTube guarda a sessão do upload retomável.
- **Pedido abandonado volta para a fila** depois de 20 minutos sem notícia do estúdio, até 3 vezes.
- **O roteiro só vê números medidos.** O estúdio recebe os 5 melhores e piores posts por visualização
  do projeto (120 dias); com menos de 3 posts medidos, não compara nada.
- Link do YouTube vira sempre `https://www.youtube.com/watch?v=<id>` (nos dois espelhos do
  `normalizePermalink`).

## Como ligar

### 1. Banco

```bash
npx supabase login
npx supabase link --project-ref rvizhshxcrfhdgfpennu
npx supabase db push          # aplica 20261016000000_video_studio.sql
```

### 2. Funções

```bash
npx supabase functions deploy studio --no-verify-jwt
npx supabase functions deploy publish-worker --no-verify-jwt
npx supabase functions deploy social-oauth --no-verify-jwt
npx supabase functions deploy social-sync --no-verify-jwt
```

O cron não muda: a fila de publicação já roda a cada 5 minutos e a sincronização a cada 3 horas.

### 3. YouTube (Google Cloud)

1. Em console.cloud.google.com, crie um projeto (ou use um existente) e ative a **YouTube Data API v3**.
2. Tela de consentimento OAuth: tipo **Externo**, adicione os escopos `youtube.readonly` e
   `youtube.upload`, e o seu Gmail em **Usuários de teste**.
3. Credenciais > Criar ID do cliente OAuth > **Aplicativo da Web**, com o URI de redirecionamento
   `https://rvizhshxcrfhdgfpennu.supabase.co/functions/v1/social-oauth/callback/youtube`.
4. `npx supabase secrets set YOUTUBE_CLIENT_ID=... YOUTUBE_CLIENT_SECRET=...`
5. Na Fábrica, Contas conectadas > YouTube > Conectar, e escolha o canal (Nivora, por exemplo).

Limites do Google enquanto o app estiver em teste: a autorização vence em **7 dias** (reconectar) e
vídeo enviado pela API fica **privado** até o projeto passar pela auditoria do YouTube. Para tirar os
dois: publicar o app de consentimento e pedir a auditoria em
https://support.google.com/youtube/contact/yt_api_form.

### 4. Netlify

O `public/_redirects` ganhou `/v/*` (vídeos do estúdio para o TikTok, que só baixa de site
verificado). Basta publicar o site.

### 5. Estúdio no PC

Ver `pessoais/estudio-videos/README.md`: gerar a chave na tela Estúdio, preencher o `.env`,
`npm run check` e `npm run estudio`.

## Limites conhecidos

- O PC precisa estar ligado para o pedido andar e para o envio ao YouTube. Desligado, tudo espera na
  fila; nada se perde.
- O TikTok recebe vídeo só nos rascunhos (a legenda é escrita no app), igual ao carrossel.
- A Data API não diz se um vídeo é Short: no Painel todo vídeo do YouTube aparece como "Vídeo".
- Nada disso foi testado contra as APIs reais nesta entrega: faltam as credenciais do Google e as
  aprovações da Meta. As chamadas foram testadas com respostas simuladas (`npm test`), a tela no
  navegador com o Supabase simulado e o estúdio com uma Fábrica falsa e render real no Remotion.
