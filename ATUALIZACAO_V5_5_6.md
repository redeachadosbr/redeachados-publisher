# Atualização V5.5.6 · Ponte Cloudflare → Render → Supabase

## Objetivo

Corrigir o bloqueio observado no webhook do Instagram quando o Cloudflare Worker tentava acessar diretamente o Supabase e recebia:

```text
HTTP 530
Cloudflare error code: 1016
```

## Nova arquitetura

```text
Meta / Instagram
      ↓
Cloudflare Worker (callback já validado)
      ↓
https://redeachados-publisher.onrender.com/api/instagram/webhook
      ↓
Supabase Edge Function /functions/v1/instagram-commerce
      ↓
reel_links + dm_log + Direct/resposta pública
```

## O que mudou

- Adicionada rota pública `POST /api/instagram/webhook` no Render.
- A rota preserva o corpo bruto (`rawBody`) e os headers `X-Hub-Signature` e `X-Hub-Signature-256` da Meta.
- A assinatura Meta é validada no Render quando `META_APP_SECRET` está configurado.
- O Render encaminha o POST à Edge Function `instagram-commerce` usando `SUPABASE_URL` já existente.
- Foi adicionado suporte opcional a `SUPABASE_INSTAGRAM_WEBHOOK_URL` para sobrescrever o destino sem editar código.
- O Worker de referência agora aponta para o Render, não diretamente para o Supabase.
- O callback cadastrado na Meta continua sendo o Worker; não é necessário alterar a URL na Meta.

## Deploy

1. Substitua os arquivos no GitHub pelos desta versão e aguarde o deploy do Render.
2. Preserve todas as variáveis de ambiente atuais.
3. Não é necessário preencher `SUPABASE_INSTAGRAM_WEBHOOK_URL` se `SUPABASE_URL` já estiver correto.
4. No Cloudflare Worker, substitua o código pelo conteúdo de `CLOUDFLARE_WORKER_REFERENCE.js` e clique em **Deploy**.
5. Na Meta, execute `Webhooks > Instagram > comments > Testar > Enviar para meu servidor`.
6. Verifique:
   - Cloudflare: `Resposta Render: 2xx`.
   - Render Logs: `[instagram-webhook-bridge] Supabase HTTP 2xx`.
   - Supabase `instagram-commerce > Invocations`: nova execução.
7. Só depois faça um novo comentário `QUERO` no Reel real.

## Observação sobre Render Free

O plano gratuito pode hibernar após inatividade. O primeiro webhook depois de um período parado pode demorar mais; a Meta pode reenviar webhooks que não recebam sucesso. Para uso comercial contínuo, mantenha monitoramento dos logs ou use uma instância que não hiberne.
