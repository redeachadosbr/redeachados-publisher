# Rede Achados BR — Shopee

Serviço separado para integração oficial com a Shopee Open Platform.

## Ambiente Render
- APP_PASSWORD
- SESSION_SECRET
- PUBLIC_BASE_URL
- SHOPEE_ENV=sandbox
- SHOPEE_PARTNER_ID=1247051
- SHOPEE_PARTNER_KEY=<Test API Partner Key>
- SHOPEE_REDIRECT_URI=https://SEU-SERVICO.onrender.com/auth/shopee/callback

## Rotas
- /api/health
- /auth/shopee/start
- /auth/shopee/callback
- /api/shopee/status
- /api/shopee/test-shop
- /api/shopee/refresh

Sandbox V2 já validado com autorização e chamada get_shop_info.
