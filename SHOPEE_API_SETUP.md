# Integração Shopee — Rede Achados BR Integrador

Este módulo é **exclusivo da Shopee**. Não acessar nem modificar o projeto separado do Mercado Livre.

## Estado do desenvolvimento
- App Shopee Open Platform em modo Online (conforme console apresentado).
- App `Seller In House System`: confirmar permissões consultando a documentação e testando endpoints permitidos.
- Nesta etapa: autenticação Open API V2, renovação manual de token, status sem exposição de segredos e teste da loja.
- Ainda não há publicação de produtos, sincronização contínua, Ads nem promoções por API nesta entrega.

## Configuração no Render (Environment)

Definir os valores diretamente na área privada do serviço; **não guardar segredos no GitHub, prints ou chat**:

```env
SHOPEE_ENV=live
SHOPEE_PARTNER_ID=2047694
SHOPEE_PARTNER_KEY=<Live API Partner Key completa, exatamente como aparece no Console>
SHOPEE_REDIRECT_URI=https://redeachados-publisher.onrender.com/auth/shopee/callback
SESSION_SECRET=<segredo aleatório forte e fixo, protegido no Render>
```

O aplicativo deve utilizar a **Live Partner Key correspondente ao Partner ID 2047694**, jamais a chave Sandbox/Partner ID 1247051 em produção.

## Teste de autorização após a publicação controlada

1. Abra o Publisher, autentique-se pela senha já existente.
2. Abra `/api/shopee/status` e confirme que `configured: true`, `mode: live`, `partnerId: 2047694` e `connected: false` antes de conectar.
3. Na mesma sessão, abra `/auth/shopee/start`. O servidor gerará uma URL Shopee V2 com `partner_id`, `timestamp`, `sign` e `redirect`.
4. Faça login no site oficial Shopee e autorize a **própria loja**. O link expira após 5 minutos, portanto inicie sempre pelo endpoint start.
5. O callback recebe `code` e `shop_id`, valida um cookie assinado de estado (não depende de a Shopee devolver `state`), troca o `code` por tokens e mostra a confirmação.
6. Abra `/api/shopee/status` e confira `connected: true` e `shopId`. Nunca imprima ou compartilhe tokens.
7. Abra `/api/shopee/test-shop` para validar leitura de dados da loja.
8. Para teste manual de renovação, `POST /api/shopee/refresh` (com sessão autenticada). O token de acesso expira em cerca de quatro horas; refresh token dura cerca de 30 dias. A renovação automática ainda precisa ser implementada.

## Limitações antes de ativar monitoramento 24/7

- O protótipo armazena tokens em `data/store.json`; verificar persistência do serviço Render e proteção do armazenamento **antes** de usar continuamente. Nenhuma operação de atualização de anúncio pode ser habilitada nesta etapa.
- As permissões dependem da categoria do aplicativo na Shopee; não assumir liberação de Ads, descontos, ou catálogo.
- A configuração do serviço e o teste em produção dependem de autorização para acesso ao workspace correto do Render.
- Se ocorrer `Wrong sign`, conferir correspondência entre Partner ID/Key e ambiente, hora do servidor e assinatura de `partner_id + path + timestamp` para endpoints públicos. Nunca colar Partner Key em chat ou tickets.
- O cookie de autenticação é HttpOnly, com escopo `/auth/shopee`, `SameSite=Lax`, e validade 10 minutos.

Referências:
- https://open.shopee.com/developer-guide/20
- https://open.shopee.com/developer-guide/736
