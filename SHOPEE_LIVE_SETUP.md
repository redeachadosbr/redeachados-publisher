# Integração Shopee — passagem de Sandbox para produção

**Serviço correto:** `redeachados-shopee` no workspace Render `My Workspace`  
**URL:** https://redeachados-shopee.onrender.com  
**Branch implantada:** `shopee-service` do repositório `redeachadosbr/redeachados-publisher`.

O outro serviço `redeachados-publisher` é o Publisher de mídias e usa branch `main`. **Não alterar o serviço de Mercado Livre `redeachados-ml-publisher`.**

## O que já existe
- Dashboard próprio com abas Produtos, Pedidos e Ads.
- OAuth, teste de loja, leitura das listas de itens e pedidos e consulta de campanhas (somente APIs autorizadas).
- Proxy Oracle opcional, teste de IP de saída.
- Persistência de token com Supabase se `SUPABASE_URL` e `SUPABASE_SECRET_KEY` estiverem configuradas.
- Atualização de `access_token` sob demanda antes de chamadas quando sua validade está perto de expirar. Renovação automática em background 24/7 **ainda não implementada**.

## Correções nesta branch
- URL de autorização V2 com assinatura HMAC-SHA256 no endpoint `/api/v2/shop/auth_partner`.
- Parâmetros `partner_id`, `timestamp`, `sign`, `redirect` gerados ao clicar em Conectar.
- Cookie de estado assinado, HttpOnly, SameSite=Lax, válido por dez minutos e removido no callback.
- Não pressupor que o parâmetro `state` seja devolvido pela Shopee.
- Não usar autorização Sandbox como se fosse Live; não apagar `refresh_token` se a API omiti-lo no refresh.
- Timeout HTTP de 15 segundos para chamadas Shopee, com e sem proxy.

## Configuração de produção — executar apenas no serviço `redeachados-shopee`

Conferir no Render > serviço `redeachados-shopee` > Environment (valores de segredo **não devem ser divulgados**).

| Variável | Valor necessário |
| --- | --- |
| `SHOPEE_ENV` | `live` |
| `SHOPEE_PARTNER_ID` | `2047694` |
| `SHOPEE_PARTNER_KEY` | **Live API Partner Key** correspondente ao Partner ID de produção. Não é a Test Partner Key. |
| `SHOPEE_REDIRECT_URI` | `https://redeachados-shopee.onrender.com/auth/shopee/callback` |
| `PUBLIC_BASE_URL` | `https://redeachados-shopee.onrender.com` |
| `SESSION_SECRET` | segredo longo e estável; nunca informar seu valor no chat |
| `APP_PASSWORD` | senha privada do painel, manter |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | manter se existentes, para persistência de tokens |
| `SHOPEE_PROXY_HOST`, `SHOPEE_PROXY_PORT`, `SHOPEE_PROXY_USER`, `SHOPEE_PROXY_PASSWORD` | manter somente se já configurados e funcionando |

**Não atualizar apenas PARTNER_ID e SHOPEE_ENV sem instalar a Live Partner Key correspondente.** O contrário produz erro de assinatura. O usuário deve colar a Partner Key no Environment privado do Render e jamais no chat, GitHub ou capturas de tela.

## Procedimento pós-implantação

1. No painel `https://redeachados-shopee.onrender.com`, autenticar-se com a senha do próprio aplicativo.
2. Verificar `/api/shopee/status`: `mode=live`, `partnerId=2047694`, `configured=true`, `oauthSecurity.sessionSecretConfigured=true`.
3. Confirmar `storage.backend=supabase+local-backup` para evitar perda de tokens em reinicializações de serviço.
4. Se IP Whitelist estiver exigida, executar `/api/shopee/proxy-test` e conferir IP público autorizado no Console Shopee.
5. Clicar **Conectar Shopee**; não reutilizar link antigo porque o `timestamp` vence em cinco minutos. Autorizar sua loja no site oficial.
6. Aguardar o callback e conferir `/api/shopee/status`: conectado, `shopId` correto. Não expor tokens.
7. Testar **Testar loja**, depois **Carregar produtos**, **Carregar pedidos** e **Ads** conforme acesso habilitado.
8. Se a API disser `permission denied`, registrar erro e revisar as permissões da categoria `Seller In House System`; não presumir acesso automático a Ads ou promoções.

## Segurança e limitações
- A leitura no Render connector não inclui valores das variáveis do Environment. Não podemos confirmar o segredo sem que a configuração seja testada pelo usuário, portanto não dar status de produção como conectado sem validar.
- Nesta etapa **nenhuma operação de edição de anúncio, preço, promoção ou Ads foi ativada**.
- Antes de qualquer motor 24/7, implementar tratamento de refresh token vencido e reconexão explícita.
- A validade de autorização da loja é configurada pelo seller (até 365 dias); token de acesso aproximadamente 4 horas e refresh token aproximadamente 30 dias.

Documentação oficial: https://open.shopee.com/developer-guide/20 e https://open.shopee.com/developer-guide/736
