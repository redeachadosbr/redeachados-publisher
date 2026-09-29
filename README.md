# REDEACHADOS BR Publisher V5.5.11


Esta versão preserva a V5.5.5 e adiciona a rota `POST /api/instagram/webhook` para o fluxo Meta → Cloudflare → Render → Supabase. Ela contorna o erro Cloudflare 530 / 1016 que ocorreu quando o Worker tentou acessar diretamente o Supabase. A política pública `/privacy` e `/data-deletion` continuam disponíveis.


## V5.5.11 — Compartilhamento imediato no iPhone

- Novo fluxo **Continuar Story no iPhone**: gera QR Code temporário no computador e abre no iPhone uma página com vídeo + link Shopee.
- No iPhone: copie o link, compartilhe o vídeo para o Instagram e adicione o adesivo Link.
- QR Code assinado e com expiração de 30 minutos.
- Nova página pública em `/privacy`, sem exigir login do Publisher.
- Aliases `/privacy-policy` e `/data-deletion`.
- Link de Privacidade no rodapé.
- Preserva integralmente a sincronização Supabase/Instagram da V5.5.4.

**URL para a Meta:** `https://redeachados-publisher.onrender.com/privacy`

**Destaques:** resultados de vídeo compactos em accordion, “Ver mais”, botões TikTok/Instagram premium e estados de autenticação/publicação mais claros.

## Novidade — venda direto do Reel

- Direct automático por comentário: o cliente comenta **QUERO** e recebe o link Shopee associado àquele Reel.
- Resposta pública opcional confirmando o envio no Direct.
- Criação opcional de anúncio a partir do Reel publicado, com CTA **Comprar agora** para o link Shopee.
- Anúncios são criados **PAUSADOS por padrão** para revisão antes de gastar.
- O Reel continua publicado mesmo se a criação do anúncio falhar.
- Configuração e diagnóstico de Webhook e Meta Ads dentro do Publisher.

**Configuração completa:** leia `META_COMMERCE_SETUP.md`.

Testes locais: `npm test`. Sintaxe: `npm run check`.

---

# Interface Studio · atualização visual da V5.4.14

Nota histórica da atualização visual: a versão V5.4.15 também corrige a leitura de SKUs no servidor. Siga **ATUALIZACAO.md** para instalar o pacote atual.

---

# REDEACHADOS BR Publisher Web V5.4.14

## Novidade V5.4.14 — manutenção automática do token Meta/Instagram

- Converte automaticamente um token curto válido da Meta para um token de longa duração quando `META_APP_ID` e `META_APP_SECRET` estão configurados.
- Verifica a validade do token antes das chamadas de publicação no Instagram.
- Mostra a data de expiração no Publisher.
- Quando faltar menos de 7 dias, tenta uma extensão automática no máximo uma vez por dia.
- Inclui botão **Verificar / prolongar token agora** nas Configurações.
- Se a Meta revogar a sessão ou exigir nova autorização, o Publisher mostra o aviso claramente; nenhuma integração web consegue garantir renovação indefinida sem nova autorização em todos os cenários.

### Variáveis novas no Render

```env
META_APP_ID=1113447937922102
META_APP_SECRET=SEU_APP_SECRET_DA_META
```

Mantenha também `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_USER_ID` e `META_GRAPH_VERSION`. Não exponha `META_APP_SECRET` em prints, GitHub ou no navegador.

---

# REDEACHADOS BR Publisher Web V5.4.13

## Novidade V5.4.13

- Upload manual de vídeo destacado na tela inicial.
- Seleção de MP4, MOV ou WebM diretamente do computador ou iPhone.
- O vídeo manual segue o mesmo fluxo de análise por IA, legenda TikTok, legenda Instagram, rascunho TikTok e Reel automático no Instagram.

# REDEACHADOS BR Publisher Web V5.4.12

## Novo: publicação automática de Reels no Instagram

- Publica o mesmo vídeo selecionado no Instagram como Reel usando a Graph API da Meta.
- Usa a legenda completa do Instagram já gerada pelo Publisher.
- Suporta vídeo WeDrop sem download no iPhone: a Meta recebe uma URL pública temporária e assinada do Render.
- Para vídeo local, cria uma URL temporária assinada enquanto a Meta processa o arquivo.
- Cria o container do Reel, acompanha o processamento e chama `media_publish` automaticamente.
- Conta configurada: `@redeachadosbr` / Instagram Business Account ID `17841480462088551`.
- Permissões necessárias no token: `instagram_basic`, `instagram_content_publish`, `pages_show_list`, `pages_read_engagement`.

### Configuração recomendada no Render

```env
INSTAGRAM_ACCESS_TOKEN=SEU_NOVO_TOKEN
INSTAGRAM_USER_ID=17841480462088551
META_GRAPH_VERSION=v26.0
```

**Importante:** gere um token novo para uso no Render. Tokens exibidos em prints devem ser considerados expostos.

## V5.4.10 — correção de CTA duplicado

- Corrige frases como `Garanta o seu na REDE ACHADOS BR na REDE ACHADOS BR`.
- Reconhece o nome da loja mesmo quando aparece com ou sem espaço (`REDEACHADOS BR` / `REDE ACHADOS BR`).
- Mantém o link direto da Shopee na legenda.
- Mantém o catálogo Shopee fixado, com atualização apenas quando uma nova planilha for enviada.
- Mantém busca WeDrop, proxy de vídeo para iPhone e análise no servidor.

Commit sugerido: `Update V5.4.10 fix duplicated CTA`


Esta versão corrige a análise de vídeo no servidor para iPhone/Chrome iOS.

### Correção principal
- Remove a dependência `ffmpeg-static`, que pode falhar em imagens Alpine no Render.
- O Docker agora usa `node:20-bookworm-slim` e instala o FFmpeg do sistema com `apt-get`.
- O servidor usa `/usr/bin/ffmpeg` (ou `FFMPEG_PATH`, se configurado).
- Mantém a busca de vídeos WeDrop, proxy do Google Drive e análise no servidor.
- Mensagens de erro do FFmpeg ficaram mais claras.

### Deploy
Envie os arquivos ao GitHub e aguarde o Auto-Deploy do Render. O primeiro build pode demorar um pouco mais porque instala o FFmpeg.

Commit sugerido: `Update V5.4.8 Render FFmpeg fix`


## V5.4.8 — link Shopee + catálogo fixado

- O link direto do produto Shopee volta a aparecer automaticamente na prévia da legenda, antes das hashtags.
- O catálogo Shopee permanece carregado no Publisher e não precisa ser reenviado no uso diário.
- Em Configurações, a planilha passa a ser tratada somente como atualização do catálogo quando houver produtos novos ou alterações.
- O pacote já inclui o catálogo atual da REDE ACHADOS BR com 459 produtos, ID da loja 852701218.

## V5.4.10

- Mantém o link direto do produto Shopee na legenda.
- Gera automaticamente um comentário de compra separado com o link direto do produto.
- Adiciona botões para copiar e restaurar o comentário.
- O comentário é colado manualmente no TikTok após a publicação; a API oficial usada pelo Publisher não publica comentários automaticamente.

## Commit sugerido

`Update V5.4.12 automatic Instagram Reels publishing`


## V5.5.9 — compartilhamento no iPhone
A página do QR pré-carrega o vídeo antes de liberar o botão Compartilhar. Assim, no toque, o iOS recebe imediatamente a chamada de compartilhamento. Se o navegador não aceitar o arquivo, use **Salvar vídeo no iPhone** como fallback.


## V5.5.13 — Story Bridge nativo para iPhone

O fluxo assistido de Story agora oferece um botão `Abrir direto no Story do Instagram` que chama o esquema `redeachados://story`. Para funcionar, instale o auxiliar nativo incluído em `ios-native-helper/`. O auxiliar baixa a cópia temporária do vídeo, grava os dados no UIPasteboard e abre o editor de Instagram Stories. O Story automático oficial via Graph API continua disponível separadamente.

## V5.5.14 — UI Compact Pro

Atualização visual focada no uso diário do Publisher em desktop e celular. A lógica de catálogo, WeDrop, TikTok, Instagram, Direct, Stories, Supabase e Render foi preservada.

Principais mudanças: lista de vídeos mais compacta, comparação por compatibilidade, seleção única visível, painel de busca automática condensado, botões e ícones com contraste maior, sidebar e coluna de status menores, atividade recente compacta e redução geral de espaços vazios.
