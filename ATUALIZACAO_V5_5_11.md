# V5.5.11 — Compartilhamento imediato no iPhone

- O botão do fluxo assistido agora chama imediatamente a folha nativa de compartilhamento do iOS via Web Share API.
- Não há pré-carregamento nem etapa “Preparando vídeo”.
- O compartilhamento usa a URL temporária do vídeo do Story, válida pelo tempo do QR Code.
- Mantido o botão de download como fallback caso o Instagram/iOS não aceite a URL como mídia para Stories.
- O link da Shopee continua sendo copiado separadamente para uso no adesivo Link do Instagram.

Observação: por limitação do navegador, o site não consegue obrigar o iOS a selecionar Instagram Stories nem transformar uma URL em arquivo de vídeo dentro do compartilhamento sem baixar os bytes.
