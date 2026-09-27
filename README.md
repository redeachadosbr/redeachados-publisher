# REDEACHADOS BR Publisher Web V5.4.4

Atualização da busca automática de vídeos WeDrop.

## Novidade principal

A V5.4.4 corrige a descoberta do catálogo quando a Lovable não coloca `routes-*.js` diretamente no HTML. O servidor lê o HTML, encontra os assets iniciais, percorre recursivamente os chunks/imports JavaScript até localizar o `routes-*.js`, extrai os registros `id + title` e cria um índice temporário para pesquisa.

Fluxo: **SKU → produto no catálogo Shopee → nome do produto → índice da galeria → vídeo(s) compatível(is) → USAR ESTE VÍDEO**.

### Incluído

- descoberta recursiva de `index-*.js`, chunks e `routes-*.js`, mesmo quando o hash/nome mudar;
- leitura de `script src`, `modulepreload` e imports dinâmicos gerados pela Lovable/Vite;
- diagnóstico detalhado quando HTML/bundle não puder ser lido ou nenhum registro for extraído;
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

`Update V5.4.4 recursive WeDrop bundle discovery`

Descrição opcional:

`Discovers Lovable JavaScript chunks recursively, locates the dynamic WeDrop routes bundle, indexes Google Drive video IDs and titles, and reports detailed diagnostics when discovery fails.`

## Segurança

Não publique Client Secret, Gemini API Key ou tokens dentro do repositório. Mantenha credenciais nas Environment Variables do Render.
