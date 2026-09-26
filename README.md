# REDEACHADOS BR Publisher Web V5.4.1

Versão mobile + integração experimental com a galeria de vídeos WeDrop.

## Novidades
- Layout otimizado para iPhone 17 Pro Max e Safari mobile.
- Pode ser adicionado à Tela de Início como web app.
- Campo **SKU WeDrop** e botão **Buscar vídeo**.
- Busca primeiro a SKU no catálogo Shopee importado.
- Consulta experimental da galeria pública `drive-vid-gallery.lovable.app` e tenta localizar links diretos de vídeo.
- Quando encontra um vídeo direto, o Publisher baixa o arquivo no servidor, carrega no fluxo e inicia a análise automática.
- Se a galeria mudar a estrutura ou esconder os arquivos atrás de autenticação, o app abre a galeria e copia o nome do produto como fallback.
- Mantém V5.3: Gemini, catálogo Shopee, legenda editável, cópia de legenda, persistência de configurações, reconexão TikTok sem perder texto e envio para rascunho do TikTok.

## Variáveis recomendadas no Render
`SHOPEE_STORE_URL`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`.
Opcional: `WEDROP_GALLERY_URL` (padrão: `https://drive-vid-gallery.lovable.app/`).

## Observação sobre WeDrop
O painel `dash.wedrop.com.br` exige sessão/login. A V5.4.1 não pede nem armazena senha WeDrop. Para SKUs que não coincidam com a SKU do catálogo Shopee, a busca automática depende de o nome/SKU estar exposto na galeria pública. Se a WeDrop disponibilizar API oficial ou endpoint de catálogo, ele poderá ser conectado na próxima evolução sem mudar o fluxo do usuário.


## Busca progressiva WeDrop — V5.4.1

A busca por SKU agora reproduz o procedimento manual da galeria: o Publisher tenta o título completo e, quando não encontra correspondência forte, remove palavras do final progressivamente até localizar candidatos. As tentativas aparecem na tela.

Quando uma busca encontra o vídeo correto e o usuário seleciona **USAR ESTE VÍDEO**, a expressão que funcionou é associada à SKU e reutilizada nas próximas buscas. Também existe um campo **Busca manual** para casos em que seja necessário encurtar o título de outra forma.

Por segurança, a busca não continua indefinidamente até palavras genéricas; são exigidos termos significativos para reduzir o risco de selecionar vídeo de outro produto.
