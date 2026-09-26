# REDEACHADOS BR Publisher Web V4

Aplicativo web privado para o fluxo diário: **escolher vídeo -> analisar -> gerar legenda -> publicar no TikTok**.

## O que a V4 faz

- Recebe MP4, MOV ou WebM.
- O navegador extrai 3 frames do vídeo automaticamente (15%, 50% e 85%).
- A IA identifica o produto visualmente e gera: nome provável, chamada, descrição, CTA e hashtags.
- Adiciona o link padrão da Shopee configurado uma vez.
- Monta a legenda respeitando o limite de 2.200 caracteres do Direct Post do TikTok.
- Consulta as opções de privacidade da conta TikTok antes da publicação.
- Faz upload do vídeo pelo Content Posting API / Direct Post.
- Mantém histórico das últimas publicações.
- Marca a publicação como promoção da própria empresa (`brand_organic_toggle=true`).
- Permite marcar `is_aigc` quando o **vídeo** foi gerado por IA.

## Importante sobre “só colocar o vídeo”

No uso diário é isso mesmo: você escolhe o vídeo, espera a análise e clica em **PUBLICAR NO TIKTOK**. Existe apenas uma configuração inicial, porque TikTok e IA exigem credenciais próprias.

Se a chave Gemini não estiver configurada, o app usa um modo básico baseado no nome do arquivo. Para reconhecer o produto olhando o vídeo, configure uma Gemini API Key.

## Publicação pública no TikTok

O TikTok exige um aplicativo no TikTok for Developers, o produto **Content Posting API** e autorização para o escopo `video.publish`. Clientes ainda não auditados ficam restritos a `SELF_ONLY` durante testes. O app mostra o Redirect URI exato que precisa ser cadastrado no painel do TikTok.

## Como colocar online (forma simples)

Este projeto inclui `Dockerfile` e `render.yaml` para hospedagem. Em um serviço como Render:

1. Crie um novo Web Service usando este projeto/repositório.
2. Defina `APP_PASSWORD` com uma senha sua.
3. O serviço fornecerá um endereço HTTPS.
4. Abra o endereço, entre com sua senha e vá em **Configurações**.
5. Cole sua Gemini API Key, Client Key e Client Secret do TikTok.
6. Copie o Redirect URI mostrado pelo próprio app e cadastre-o no TikTok Developers.
7. Clique em **Conectar TikTok**.

### Observação sobre hospedagem gratuita

Hospedagens gratuitas podem suspender o serviço por inatividade ou apagar o armazenamento local em reinicializações. Para uso comercial contínuo, use armazenamento persistente ou plano que ofereça disco persistente.

## Rodar localmente, se quiser testar

```bash
npm install
APP_PASSWORD=minhasenha SESSION_SECRET=outra-chave npm start
```

Depois abra `http://localhost:3000`.

## Segurança

Este é um app privado. Não publique Client Secret ou API Key em repositório público. Use uma senha forte em `APP_PASSWORD` e HTTPS em produção.
