# REDEACHADOS BR Publisher Web V5.4.3

Atualização da busca automática de vídeos WeDrop.

## Novidade principal

A V5.4.3 não tenta mais descobrir os vídeos apenas pelo HTML visual da galeria. Ela localiza o bundle dinâmico `routes-*.js` publicado pela galeria WeDrop/Lovable, extrai os registros `id + title` dos vídeos e cria um índice temporário para pesquisa.

Fluxo: **SKU → produto no catálogo Shopee → nome do produto → índice da galeria → vídeo(s) compatível(is) → USAR ESTE VÍDEO**.

### Incluído

- leitura automática do `routes-*.js`, mesmo quando o hash/nome do arquivo mudar;
- extração do ID do Google Drive, título e duração quando disponível;
- cache do índice por 10 minutos;
- busca por similaridade e encurtamento progressivo do título;
- exibição de várias opções quando existem vários vídeos compatíveis;
- botão **USAR ESTE VÍDEO** para baixar pelo ID do Google Drive e carregar no Publisher;
- fallback para abrir a galeria caso a fonte externa mude;
- catálogo Shopee e fluxo de rascunho TikTok preservados;
- interface responsiva para desktop e iPhone.

## Atualização

Suba os arquivos desta versão no mesmo repositório GitHub, substituindo os arquivos existentes, e faça commit direto na `main`. O Render com Auto-Deploy fará o rebuild automaticamente.

Commit sugerido:

`Update V5.4.3 direct WeDrop gallery index`

Descrição opcional:

`Reads the dynamic WeDrop routes bundle, indexes Google Drive video IDs and titles, improves SKU matching, and loads selected videos directly into the Publisher.`

## Segurança

Não publique Client Secret, Gemini API Key ou tokens dentro do repositório. Mantenha credenciais nas Environment Variables do Render.
