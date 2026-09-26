# REDEACHADOS BR Publisher Web V5.3

Fluxo principal: escolher vídeo → IA identifica o produto → catálogo localiza o link Shopee → legenda editável → enviar como **rascunho para o TikTok** → finalizar no aplicativo TikTok.

## Novidades da V5.3

- Mantém as melhorias das versões anteriores: catálogo Shopee atualizável, link direto do produto, Gemini 3.5 Flash Lite, emojis por categoria, CTA mais natural, legenda editável e botão para restaurar a legenda da IA.
- Credenciais e configurações podem ser mantidas no Render por Environment Variables, evitando preencher tudo novamente após reinicializações.
- Ao conectar/reconectar o TikTok, o fluxo abre em outra aba e o rascunho dos campos permanece no navegador.
- Novo modo **Upload/Rascunho** usando o endpoint oficial `/v2/post/publish/inbox/video/init/` com escopo `video.upload`.
- O botão principal agora envia o vídeo à caixa de entrada do TikTok; a publicação final é feita dentro do TikTok.
- A legenda fica pronta para copiar, mas o link Shopee não é inserido automaticamente no envio via API.
- Erros do TikTok exibem código e log quando fornecidos pela API.

## Variáveis recomendadas no Render

```env
APP_PASSWORD=...
SESSION_SECRET=...
PUBLIC_BASE_URL=https://redeachados-publisher.onrender.com
SHOPEE_STORE_URL=https://shopee.com.br/redeachadosbr
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-3.5-flash-lite
TIKTOK_CLIENT_KEY=...
TIKTOK_CLIENT_SECRET=...
```

## TikTok Developers

Habilite **Content Posting API** e autorize os escopos:

- `user.info.basic`
- `video.upload` — necessário para enviar rascunhos
- `video.publish` — mantido para futura publicação direta após revisão/auditoria

Redirect URI:

```text
https://redeachados-publisher.onrender.com/auth/tiktok/callback
```

Após mudar os escopos, reconecte a conta TikTok para gerar um novo token contendo `video.upload`.

## Como usar

1. Escolha o vídeo.
2. Aguarde a análise da IA.
3. Revise produto, link Shopee, chamada, descrição, CTA e hashtags.
4. Edite a prévia da legenda se quiser e use **Copiar legenda**.
5. Clique **ENVIAR RASCUNHO AO TIKTOK**.
6. Abra o TikTok, toque na notificação recebida, finalize a edição e publique.


## Novidades da V5.2.2

- A **Prévia da legenda agora é editável** antes da publicação.
- O texto editado manualmente é enviado ao TikTok exatamente como aparece na prévia, respeitando o limite de 2.200 caracteres.
- Novo botão **“Restaurar legenda gerada pela IA”** para voltar rapidamente ao texto montado a partir de chamada, descrição, CTA, link e hashtags.
- A edição manual da legenda é preservada no rascunho do navegador junto com os demais campos.

# REDEACHADOS BR Publisher Web V5.2.1

## Novidades
- Credenciais e configurações podem ficar persistentes nas **Environment Variables do Render**.
- O app deixa de pedir Gemini/TikTok novamente quando as variáveis estão configuradas.
- CTA mais natural, mencionando a REDE ACHADOS BR.
- Emojis por categoria melhorados; produtos de cozinha infantil/avental usam 👩‍🍳 em vez de 🎁.
- Catálogo Shopee continua atualizável por planilha e gera link direto do produto.
- Modelo padrão: `gemini-3.5-flash-lite`.

## Variáveis recomendadas no Render
Configure em **Render > redeachados-publisher > Environment**:

```env
APP_PASSWORD=sua-senha
SESSION_SECRET=uma-chave-longa
PUBLIC_BASE_URL=https://redeachados-publisher.onrender.com
BRAND_NAME=REDEACHADOS BR
SHOPEE_STORE_URL=https://shopee.com.br/redeachadosbr
GEMINI_API_KEY=sua-chave-gemini
GEMINI_MODEL=gemini-3.5-flash-lite
TIKTOK_CLIENT_KEY=sua-client-key
TIKTOK_CLIENT_SECRET=seu-client-secret
DEFAULT_PRIVACY=SELF_ONLY
```

As variáveis do Render têm prioridade sobre valores locais. Assim, reinicializações/deploys não obrigam você a preencher essas credenciais de novo.

> Observação: token de autorização do TikTok, histórico e arquivos locais ainda vivem no armazenamento local do serviço. Em hospedagem gratuita, um restart/redeploy pode exigir reconectar o TikTok ou reimportar o catálogo. Para persistência total, use disco persistente ou banco externo.

## Atualização do catálogo
No app: **Configurações > Atualizar catálogo com planilha da Shopee**. Baixe uma nova planilha em Shopee Seller Center quando entrarem produtos novos e importe-a ali.

## Segurança
Nunca coloque chaves secretas diretamente no GitHub público. Use Environment Variables no Render.


## V5.2.1 — reconexão TikTok sem perder o trabalho

- Conectar/Reconectar TikTok abre a autorização em outra aba, preservando o vídeo e os campos já preenchidos na aba original.
- Rascunho de produto, link, chamada, descrição, CTA, hashtags e opções de publicação também é salvo no navegador como proteção extra.
- Ao voltar para a aba original, o status da conexão TikTok é atualizado automaticamente.
- Por segurança do navegador, um arquivo de vídeo não pode ser restaurado após fechar/recarregar a aba; por isso a autorização em nova aba é a proteção principal.
