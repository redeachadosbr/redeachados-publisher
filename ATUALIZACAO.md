# Atualização V5.5.0 · Instagram Commerce

Esta versão parte da V5.4.15 e **preserva a correção de SKUs, catálogo, interface Studio, TikTok, IA e publicação de Reels**.

## Novidades

- Comentário `QUERO` → Direct automático com o link Shopee do produto daquele Reel.
- Palavra-chave, mensagem do Direct e resposta pública configuráveis.
- Persistência de regra por `IG_MEDIA_ID`, evitando cruzar links entre produtos.
- Histórico de envios e deduplicação por comentário.
- Webhook público para receber comentários do Instagram.
- Validação opcional da assinatura do webhook com `META_APP_SECRET`.
- Criação opcional de anúncio usando o Reel publicado.
- CTA `SHOP_NOW / Comprar agora` apontando para o link direto Shopee.
- Uso de Ad Set existente para preservar público, orçamento, objetivo e otimização definidos no Gerenciador.
- Anúncios `PAUSED` por padrão; publicação do Reel não falha se Ads falhar.
- Tela de Configurações ampliada com Page ID, Ad Account ID, Ad Set ID, token de Ads e teste de conexão.

## Como atualizar

Substitua os arquivos do projeto pela V5.5.0. Em produção, preserve seus dados e segredos existentes:

- `data/store.json`
- `uploads/`
- `.env`
- variáveis de ambiente do Render

O `data/catalog.json` desta versão mantém o catálogo e vínculos da V5.4.15.

Depois do deploy, siga **META_COMMERCE_SETUP.md** para configurar o webhook e a Marketing API.

## Verificação desta entrega

- `npm run check`
- `npm test`
- verificação estática das novas rotas de health/config/status, webhook, Direct e Meta Ads
- validação dos IDs/controles novos na interface
- inspeção do ZIP final

Chamadas reais de publicação, Direct e criação de anúncios dependem dos tokens/ativos da conta Meta e devem ser validadas no ambiente de produção após o deploy.
