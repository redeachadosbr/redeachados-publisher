# V5.5.13 — Native Story Bridge

## Objetivo
Abrir diretamente o editor de Stories do Instagram no iPhone com o vídeo do Publisher carregado, sem usar a folha genérica de compartilhamento do Safari.

## Alterações
- A página do QR Code não usa mais `navigator.share()` como fluxo principal.
- Novo botão **Abrir direto no Story do Instagram**.
- O botão chama `redeachados://story` e entrega host + token temporário ao auxiliar iOS.
- `/api/story-share/info` agora também retorna `metaAppId` (somente App ID público; nenhum segredo é exposto).
- Incluído projeto SwiftUI em `ios-native-helper/RedeAchadosStoryBridge.xcodeproj`.
- O auxiliar baixa o MP4 temporário, usa `UIPasteboard` com `com.instagram.sharedSticker.backgroundVideo` e abre `instagram-stories://share`.
- O link Shopee é enviado também em `contentURL`, `linkURL` e `linkText`; se o Instagram não o exibir, a página mantém o botão de copiar link como fallback.
- Story automático oficial pela Graph API permanece sem alteração.

## Importante
O aplicativo auxiliar precisa ser assinado e instalado no iPhone. O ZIP do Publisher não consegue produzir um IPA assinado sem uma conta/certificado Apple.
