# REDEACHADOS BR Publisher V5.5.0 — Instagram Commerce

Esta versão adiciona dois caminhos de conversão aos Reels publicados pelo Publisher:

1. **Comentário → Direct:** o cliente comenta uma palavra, por padrão `QUERO`, e recebe por mensagem privada o link Shopee associado àquele Reel.
2. **Reel → anúncio:** opcionalmente o Publisher cria um anúncio a partir do Reel publicado, com CTA `SHOP_NOW / Comprar agora`, usando o conjunto de anúncios configurado.

## 1. O que já está pronto no aplicativo

- O link Shopee é salvo junto com o `IG_MEDIA_ID` do Reel.
- A legenda orgânica passa a convidar o cliente a comentar a palavra-chave, em vez de depender do URL não clicável da legenda.
- Cada Reel recebe sua própria regra de Direct para evitar enviar o link de outro produto.
- O webhook ignora comentários que não contenham a palavra configurada.
- Há deduplicação para não enviar duas respostas privadas para o mesmo comentário.
- A resposta pública é opcional.
- A criação do anúncio é independente da publicação: se a Marketing API falhar, o Reel continua publicado.
- O anúncio é criado **PAUSADO por padrão**. Só use `ACTIVE` se quiser ativação imediata.
- O anúncio usa um Ad Set já existente; orçamento, público, posicionamentos e otimização continuam definidos nesse conjunto.

## 2. Configurar o webhook do Instagram

No Render, mantenha `PUBLIC_BASE_URL` apontando para a URL pública do Publisher. A URL de callback exibida em **Configurações > Instagram / Meta** será:

`https://redeachados-publisher.onrender.com/webhooks/meta/instagram`

Defina um valor secreto para `META_WEBHOOK_VERIFY_TOKEN`, por exemplo uma sequência longa aleatória. Use **o mesmo valor** ao cadastrar o callback no painel Meta for Developers.

No aplicativo Meta usado pela conta `@redeachadosbr`:

1. Abra a configuração de Webhooks/Instagram.
2. Cadastre a Callback URL acima.
3. Informe o mesmo Verify Token.
4. Assine o campo de comentários (`comments`) da conta profissional.
5. Confirme que o token usado pelo Publisher possui as permissões necessárias para ler/gerenciar comentários da conta profissional.

Se `META_APP_SECRET` estiver configurado, o Publisher também valida a assinatura `X-Hub-Signature-256` das notificações recebidas.

## 3. Direct automático

Na tela de publicação:

- Marque **Direct automático**.
- Palavra padrão: `QUERO`.
- Informe o link direto do produto Shopee.
- Opcionalmente mantenha **Responder o comentário** ativado.

Mensagem padrão:

`Oi! 👋 Aqui está o link do produto que você pediu: {link}`

Placeholders disponíveis:

- `{link}` — URL Shopee daquele Reel.
- `{product}` — nome do produto.
- `{keyword}` — palavra de disparo.

A automação responde somente aos comentários do Reel que estiver associado à regra salva pelo Publisher.

## 4. Configurar Meta Ads

Em **Configurações > Instagram / Meta**, informe:

- **Facebook Page ID** — página vinculada ao Instagram profissional.
- **Ad Account ID** — pode ser `act_123...` ou somente o número.
- **Ad Set ID** — conjunto de anúncios que receberá os anúncios criados.
- **Token da Marketing API** — opcional se o token principal já tiver acesso à conta de anúncios e `ads_management`.

O botão **Testar conexão com Meta Ads** consulta a conta e o Ad Set sem criar anúncio.

### Importante sobre o Ad Set

A V5.5.0 não cria campanha nem conjunto de anúncios automaticamente. Isso é intencional: o Ad Set existente controla orçamento, público, objetivo, posicionamentos, calendário e otimização. O Publisher somente cria o criativo a partir do Reel e o adiciona a esse Ad Set.

Recomendação inicial: deixar `META_AD_DEFAULT_STATUS=PAUSED` para revisar cada anúncio no Gerenciador antes de gastar.

## 5. Variáveis opcionais do Render

```env
INSTAGRAM_DM_ENABLED=true
INSTAGRAM_DM_KEYWORD=QUERO
INSTAGRAM_DM_TEMPLATE=Oi! Aqui está o link do produto que você pediu: {link}
INSTAGRAM_PUBLIC_REPLY_ENABLED=true
INSTAGRAM_PUBLIC_REPLY_TEMPLATE=Enviei o link no seu Direct ✅
META_WEBHOOK_VERIFY_TOKEN=SEU_TOKEN_SECRETO

META_PAGE_ID=SEU_PAGE_ID
META_AD_ACCOUNT_ID=act_SEU_AD_ACCOUNT_ID
META_AD_SET_ID=SEU_AD_SET_ID
META_ADS_ACCESS_TOKEN=SEU_TOKEN_MARKETING_API
META_CREATE_AD_DEFAULT=false
META_AD_DEFAULT_STATUS=PAUSED
```

Esses campos também podem ser salvos pela interface. Variáveis do Render têm prioridade sobre valores locais do `data/store.json`.

## 6. Fluxo final

```text
REDEACHADOS PUBLISH
        ↓
Publica Reel
        ↓
Salva IG_MEDIA_ID + produto + link Shopee
        ├───────────────┐
        ↓               ↓
Cliente comenta QUERO  Criar anúncio (opcional)
        ↓               ↓
Webhook Meta           Marketing API
        ↓               ↓
Direct com link        Reel + COMPRAR AGORA
```

## 7. Teste recomendado após o deploy

1. Salve a configuração Meta no Publisher.
2. Verifique se **Automação de Direct** aparece configurada.
3. Clique em **Testar conexão com Meta Ads**.
4. Publique um Reel de teste com um link Shopee válido e deixe o anúncio desmarcado.
5. De outra conta, comente `QUERO` no Reel.
6. Confirme o recebimento da mensagem privada e da resposta pública.
7. Só depois teste **Criar anúncio**, mantendo o status inicial `PAUSED`.
8. Abra o Gerenciador de Anúncios e confira criativo, URL de destino, CTA, público e orçamento antes de ativar.

## 8. Limites da Meta relevantes

A resposta privada de comentário é uma mensagem única vinculada ao comentário. A Meta aplica janela e elegibilidade próprias; falhas são registradas no log da automação e não impedem a publicação do Reel.

A criação do anúncio depende das permissões do token, vínculo entre Página/Instagram/conta de anúncios, elegibilidade do Reel e compatibilidade do Ad Set. Se a Meta rejeitar o anúncio, o Publisher mantém o Reel publicado e mostra o erro para correção.
