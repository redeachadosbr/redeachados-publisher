# REDE ACHADOS BR · Story Bridge para iPhone

Este auxiliar existe porque o Safari não consegue gravar o vídeo nos tipos privados de UIPasteboard usados pelo editor de Stories do Instagram. O Publisher abre este app pelo esquema `redeachados://story`.

## O que ele faz

1. Recebe o host do Publisher + token temporário do QR Code.
2. Busca `/api/story-share/info`.
3. Baixa a cópia temporária MP4 preparada pelo Publisher.
4. Grava o vídeo no `UIPasteboard` usando `com.instagram.sharedSticker.backgroundVideo`.
5. Envia também `linkURL`, `linkText` e `contentURL` com o link da Shopee quando disponíveis.
6. Abre `instagram-stories://share?source_application=<META_APP_ID>`.

## Instalação

O projeto está pronto para Xcode em `RedeAchadosStoryBridge.xcodeproj`.

- Requer iPhone físico com iOS 16 ou superior.
- Abra o projeto em um Mac com Xcode.
- Em **Signing & Capabilities**, selecione sua equipe Apple.
- Conecte o iPhone, selecione-o como destino e pressione Run.
- Na primeira instalação, o iPhone pode pedir confirmação do desenvolvedor em Ajustes.

Um `.ipa` instalável não pode ser gerado sem assinatura Apple/certificado de desenvolvimento ou distribuição. O Publisher no Render não consegue assinar um aplicativo iOS.

## Uso

Depois de instalado:

1. No Publisher, gere o QR Code em **Abrir Story no iPhone**.
2. Leia o QR no iPhone.
3. Toque em **Abrir direto no Story do Instagram**.
4. O Story Bridge abre, baixa o vídeo e abre o editor de Stories do Instagram.
5. Revise e publique.

O envio de `linkURL`/`linkText` é uma tentativa compatível com implementações atuais de compartilhamento para Instagram Stories no iOS, mas a Meta pode alterar esse comportamento. Caso o link não apareça, volte à página do QR, copie o link da Shopee e adicione o adesivo Link manualmente.
