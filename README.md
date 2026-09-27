# REDEACHADOS BR Publisher Web V5.4.8

## V5.4.8 — correção do FFmpeg no Render

Esta versão corrige a análise de vídeo no servidor para iPhone/Chrome iOS.

### Correção principal
- Remove a dependência `ffmpeg-static`, que pode falhar em imagens Alpine no Render.
- O Docker agora usa `node:20-bookworm-slim` e instala o FFmpeg do sistema com `apt-get`.
- O servidor usa `/usr/bin/ffmpeg` (ou `FFMPEG_PATH`, se configurado).
- Mantém a busca de vídeos WeDrop, proxy do Google Drive e análise no servidor.
- Mensagens de erro do FFmpeg ficaram mais claras.

### Deploy
Envie os arquivos ao GitHub e aguarde o Auto-Deploy do Render. O primeiro build pode demorar um pouco mais porque instala o FFmpeg.

Commit sugerido: `Update V5.4.8 Render FFmpeg fix`


## V5.4.8 — link Shopee + catálogo fixado

- O link direto do produto Shopee volta a aparecer automaticamente na prévia da legenda, antes das hashtags.
- O catálogo Shopee permanece carregado no Publisher e não precisa ser reenviado no uso diário.
- Em Configurações, a planilha passa a ser tratada somente como atualização do catálogo quando houver produtos novos ou alterações.
- O pacote já inclui o catálogo atual da REDE ACHADOS BR com 459 produtos, ID da loja 852701218.
