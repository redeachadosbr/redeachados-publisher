# REDEACHADOS BR Publisher V5.5.2 — Instagram Commerce + Supabase

## Arquitetura usada nesta versão

```text
REDEACHADOS PUBLISH (Render)
        │ publica Reel
        │ recebe IG_MEDIA_ID
        │
        ├── grava regra em Supabase / reel_links
        │      IG_MEDIA_ID + SKU + produto + link Shopee + palavra QUERO
        │
        └── Instagram publica o Reel

Comentário no Reel
        ↓
Meta Webhook
        ↓
Cloudflare Worker (workers.dev)
        ↓
Supabase Edge Function instagram-commerce
        ↓
consulta reel_links pelo IG_MEDIA_ID
        ↓
Direct com o link correto + resposta pública opcional
```

## Correção principal da V5.5.2

Quando o vídeo é escolhido por **SKU/WeDrop**, o produto selecionado no catálogo Shopee passa a ser **autoritativo**. A IA pode gerar título, descrição e hashtags, mas não pode mais trocar o anúncio nem substituir o link por outro produto visualmente parecido.

Para a SKU `NTM3001127V`, a correção confirmada é:

- ID Shopee: `22699708957`
- URL: `https://shopee.com.br/product/852701218/22699708957/`

A V5.5.2 também lembra a escolha do anúncio quando a mesma SKU aparece em mais de um item.

## Render — variáveis novas obrigatórias para o fluxo Supabase

Adicione em **Environment**:

```env
SUPABASE_URL=https://vcpqjkxvoqswhcqtlhtz.supabase.co
SUPABASE_SECRET_KEY=COLE_A_SECRET_KEY_DO_PROJETO
```

A chave é server-side. **Nunca coloque a Secret key no navegador, JavaScript público ou GitHub.**

Compatibilidade: se o projeto ainda usa uma chave legada, também é aceito `SUPABASE_SERVICE_ROLE_KEY`.

## Supabase

As tabelas esperadas são `reel_links` e `dm_log`. O arquivo `SUPABASE_SCHEMA.sql` acompanha esta versão para referência/recriação.

Após o Reel terminar de publicar e o Instagram retornar o `IG_MEDIA_ID`, o Publisher faz **upsert** em `reel_links` usando `instagram_media_id` como chave única. São salvos:

- `instagram_media_id`
- `sku`
- `product_name`
- `product_url`
- `keyword`
- `auto_dm_enabled`
- `public_reply_enabled`
- `public_reply_text`
- `dm_message_template`
- `active`

## Meta / Cloudflare

O callback do objeto Instagram deve continuar apontando para o **Cloudflare Worker** que já foi validado com o retorno do `hub.challenge`.

No app da Meta, a assinatura do objeto `instagram` deve mostrar:

- `active: true`
- campo `comments`
- callback URL do Worker `workers.dev`

O Worker apenas recebe o GET de verificação e encaminha os POSTs reais para a Edge Function do Supabase.

## Secrets da Edge Function Supabase

A função `instagram-commerce` usa os Secrets configurados no Supabase, entre eles:

```text
META_VERIFY_TOKEN
META_APP_SECRET
META_PAGE_ACCESS_TOKEN
META_IG_USER_ID
META_API_VERSION
```

Não copie esses valores para o frontend.

## Teste correto depois do deploy

1. Abra o Publisher e busque a SKU `NTM3001127V`.
2. Confirme que o produto mostrado é a **Rena Natal LED com Movimento**.
3. Confirme que o Link do produto é `https://shopee.com.br/product/852701218/22699708957/`.
4. Deixe **Direct automático** marcado e palavra-chave `QUERO`.
5. Publique o Reel no Instagram.
6. No Supabase, abra `Table Editor > reel_links` e confirme que apareceu uma linha com o `IG_MEDIA_ID` e o link correto.
7. Só então, de outra conta autorizada para teste, comente `QUERO` no Reel.
8. Confira `dm_log` e o Direct recebido.

## Segurança contra links errados

A V5.5.2 aplica três proteções:

1. O link da SKU selecionada sobrescreve qualquer tentativa de troca feita pela IA.
2. A URL autoritativa continua sendo usada na legenda e no payload da publicação mesmo se houver valor antigo no formulário.
3. O fuzzy match de vídeo enviado manualmente ficou mais rígido; um nome genérico não deve mais vincular automaticamente um anúncio com baixa similaridade.
