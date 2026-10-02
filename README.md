# Fábrica

Onde eu aplico minhas ideias de conteúdo: cola a copy, escolhe a conta e recebe o carrossel pronto, com as fotos certas em cada slide.

Fluxo: **plataforma → copy → formatação → fotos da biblioteca → slides → revisão → exportação**.

Serve pra qualquer conta: cada uma é um Brand Kit com tom de voz, produto opcional e as pastas de fotos dela.

Fotos com contexto: a IA analisa cada foto ao subir (tags do que aparece e dos temas que ela ilustra) e, ao gerar, escolhe a foto que faz sentido pra cada frase. Slide sem foto que combine sai só com texto.

## Modelos Vencedores

Transforma resultado em inteligência de criação: **não copia o conteúdo vencedor, copia o mecanismo que fez ele funcionar**.

- **⭐ Marcar como vencedor** no editor ou no card de Projetos; conteúdo feito fora (UGC, POV, vídeo) entra por "Conteúdo de fora". Métrica vazia conta como "não medido", não como zero.
- **DNA**: análise automática da estrutura (tipo de gancho, função de cada slide, ritmo, texto por slide, CTA, posição do produto, tom, retenção). Roda sem rede e pode ser ajustada à mão.
- **Usar como modelo, Criar variações (3/5/10) e Família de conteúdos**: com Claude ligado, gera direto; no modo local, entrega o prompt pronto com o DNA e lê a resposta colada no formato `CARROSSEL N / Slide 1,`. Tudo cai na tela Criar, e os carrosséis ficam ligados ao vencedor de origem (`origin`) pra comparar a família depois.
- **Content Score** (0–100) relativo à própria biblioteca, com perfis de peso (equilibrado, awareness, conversão, personalizado). Atenção e conversão são ordenadas separadamente.
- **Insights** só aparecem com pelo menos 3 conteúdos medidos de cada lado da comparação e diferença acima de 25%.

## Rodar local

```bash
npm install
npm run dev      # http://localhost:5320
npm test         # testes do domínio
npm run build
```

Sem `.env` o app roda em **modo demo**: login local, dados no IndexedDB do navegador e motor de IA heurístico (reorganiza a sua copy seguindo as estruturas narrativas, sem inventar texto). Serve pra testar tudo sem custo.

## Ligar Supabase + Claude (produção)

1. Crie um projeto no Supabase e copie `.env.example` para `.env` com `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
2. Aplique o schema (tabelas, RLS e bucket privado `assets`):
   ```bash
   supabase link --project-ref <ref>
   supabase db push
   ```
3. Publique a função de IA e guarde a chave da Anthropic só no servidor:
   ```bash
   supabase secrets set ANTHROPIC_API_KEY=<chave> ALLOWED_ORIGIN=https://<seu-dominio>
   supabase functions deploy carousel-ai
   ```
   Opcional: `AI_HOURLY_LIMIT` (padrão 120 chamadas por usuário por hora).

A função usa `claude-opus-5-5` com saída estruturada (JSON Schema) e fallback automático do lado do servidor caso o modelo recuse um pedido. O app valida toda resposta com zod antes de usar.

## Arquitetura

```
src/
  domain/        regras puras: Brand Kit, slides, estruturas narrativas, layouts,
                 seleção de imagem por tags, legibilidade, contrato da IA (zod)
  application/   portas (AuthService, repositórios, AiService) e caso de uso de geração
  infra/         adaptadores: supabase/, demo/ (IndexedDB), ai/claudeAi + ai/heuristicAi
  render/        renderizador em canvas (8 layouts). A prévia e a exportação usam o mesmo código
  app/           contexto React, cache de imagens, exportação PNG/JPG/ZIP/PDF
  editor/        editor de carrossel
  pages/         Criar, Editor, Projetos, Biblioteca, Brand Kits, Configurações
supabase/
  migrations/    schema com RLS (dono = auth.uid()) e políticas do storage
  functions/     carousel-ai (draft, rewrite, hooks) + contrato espelhado
```

- Tenancy por usuário: toda tabela tem `user_id` com RLS. O bucket `assets` é privado, cada usuário só acessa `<uid>/`.
- A IA nunca recebe chave no cliente: o front chama a Edge Function com o JWT do usuário, e a função aplica rate limit (`ai_usage`).
- `src/domain/aiContract.ts` e `supabase/functions/_shared/contract.ts` precisam ficar em sincronia.

## Fora do MVP (já previsto na arquitetura)

- **Content Batch:** caso de uso novo chamando `draftCarousel` N vezes com `contentType` diferente.
- **Variações A/B/C:** mesma ideia, gerando carrosséis irmãos a partir da mesma `source`.
- **Performance:** tabela `carousel_metrics (carousel_id, views, likes, comments, shares, saves, followers)` ligada a `carousels`; os slides já guardam `role` e `layout`, que são as variáveis a correlacionar.
