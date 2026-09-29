# Atualização V5.5.2 · UI compacta de vídeos + botões sociais premium

## Melhorias desta versão

- Resultados de vídeo agora usam cards compactos em accordion; apenas um detalhe fica aberto por vez.
- Exibe 3 resultados inicialmente, com botão “Ver mais / Mostrar menos” e rolagem interna quando necessário.
- Melhor resultado recebe selo discreto “MELHOR OPÇÃO”.
- Botões de TikTok e Instagram foram redesenhados com identidade visual própria, hover, loading e feedback de estado.
- Erro de autorização TikTok inválida/expirada agora vira estado visual “Reconectar TikTok” sem bloquear a publicação no Instagram.
- Mantidas todas as correções V5.5.1 de link Shopee por SKU e gravação Supabase.

---


## Correções V5.5.2

- **Link Shopee protegido pela SKU:** ao selecionar um vídeo via SKU/WeDrop, o anúncio escolhido no catálogo passa a ser a fonte autoritativa. A IA não pode mais substituir o link por outro produto visualmente parecido.
- **Produto escolhido lembrado:** quando uma SKU aparece em mais de um anúncio e você escolhe o correto, o Publisher memoriza o ID para as próximas buscas.
- **Contexto do catálogo enviado à IA:** a geração de título/descrição recebe o produto confirmado para reduzir identificação errada.
- **Sincronização Supabase:** após obter o `IG_MEDIA_ID`, o Publisher faz upsert em `reel_links`, permitindo que o webhook hospedado no Supabase encontre o link correto de cada Reel.
- **SKU persistida com a regra:** a linha em `reel_links` recebe SKU, produto, URL, palavra-chave, templates e flags.

No Render, adicione `SUPABASE_URL` e `SUPABASE_SECRET_KEY` (ou a chave legada `SUPABASE_SERVICE_ROLE_KEY`). A chave fica apenas no backend do Render.

# Atualização V5.5.2 · Instagram Commerce

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

Substitua os arquivos do projeto pela V5.5.2. Em produção, preserve seus dados e segredos existentes:

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
