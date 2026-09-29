# REDE ACHADOS BR Publisher V5.5.8 — Story no iPhone

## Alteração principal

O antigo botão assistido que abria o compartilhamento do Windows foi substituído por **Continuar Story no iPhone**.

1. No computador, selecione o produto/vídeo e clique em **Continuar Story no iPhone**.
2. O Publisher gera um QR Code temporário válido por 30 minutos.
3. Escaneie com a câmera do iPhone.
4. No iPhone, toque em **Copiar link da Shopee**.
5. Toque em **Compartilhar vídeo** e escolha Instagram.
6. No editor do Story, adicione o adesivo **Link**, cole o endereço e publique.

O botão **Publicar Story automático** continua funcionando separadamente pela API oficial e continua sem adesivo de link.

## Segurança

O QR Code usa um token assinado e temporário. Em produção, pode ser definida a variável `STORY_SHARE_SECRET` no Render; se ela não existir, o app usa `SESSION_SECRET`.
