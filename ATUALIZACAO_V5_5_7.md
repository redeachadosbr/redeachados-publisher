# REDE ACHADOS BR Publisher V5.5.7 — Stories

## O que entrou

- Mantido o fluxo V5.5.6: Reel automático no Instagram, comentário **QUERO** → Direct com link da Shopee, sincronização Supabase/Render/Cloudflare e Meta Ads opcional.
- Novo **Story com link da Shopee (assistido)**: copia o link automaticamente e tenta abrir o compartilhamento nativo do celular com o vídeo. No Instagram, basta escolher Story e adicionar o adesivo **Link**.
- Novo **Story automático via API oficial**: publica o vídeo como `media_type=STORIES`, sem adesivo de link. Pela integração com Facebook Login, a Meta restringe Stories a contas Instagram Business.
- Histórico registra Stories automáticos separadamente como `instagram-story`.

## Importante

A API oficial de publicação não oferece neste fluxo um parâmetro para inserir o adesivo clicável **Link** no Story. Por isso, o modo de venda recomendado é **Story com link da Shopee**, que deixa o endereço copiado e entrega o vídeo ao compartilhamento do celular para finalização no Instagram.

A alternativa não oficial com login automatizado do Instagram não foi incorporada à versão principal para evitar dependência de sessão/senha e risco de interrupções por verificação de login.
