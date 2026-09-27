# REDEACHADOS BR Publisher Web V5.4.6

## V5.4.6 — análise de vídeo no servidor para iPhone

- Mantém a busca automática da galeria WeDrop e o proxy de vídeo da V5.4.5.
- Para vídeos escolhidos da WeDrop, o iPhone não precisa mais capturar frames no navegador.
- O Render baixa temporariamente o vídeo, usa FFmpeg para extrair frames em 15%, 50% e 85% e envia esses frames ao Gemini.
- Produto identificado, chamada, descrição, CTA e hashtags voltam preenchidos mesmo quando o iOS não consegue fazer seek/canvas de vídeo remoto.
- O arquivo de vídeo e os frames temporários são apagados após a análise.
- O selo visual agora mostra V5.4.6.

Commit sugerido: `Update V5.4.6 server-side video analysis for iPhone`

---


Atualização da busca automática de vídeos WeDrop.

## Novidade principal

A V5.4.5 corrige a descoberta do catálogo quando a Lovable não coloca `routes-*.js` diretamente no HTML. O servidor lê o HTML, encontra os assets iniciais, percorre recursivamente os chunks/imports JavaScript até localizar o `routes-*.js`, extrai os registros `id + title` e cria um índice temporário para pesquisa.

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

`Update V5.4.5 recursive WeDrop bundle discovery`

Descrição opcional:

`Discovers Lovable JavaScript chunks recursively, locates the dynamic WeDrop routes bundle, indexes Google Drive video IDs and titles, and reports detailed diagnostics when discovery fails.`

## Segurança

Não publique Client Secret, Gemini API Key ou tokens dentro do repositório. Mantenha credenciais nas Environment Variables do Render.


## V5.4.5 — Proxy de vídeo para iPhone
- O vídeo da galeria WeDrop é transmitido pelo Render com suporte a `Range`, em vez de ser aberto diretamente pelo Google Drive no iPhone.
- O iPhone analisa o vídeo pela URL do próprio Publisher, reduzindo falhas `Load Failed`.
- Ao enviar o rascunho ao TikTok, o Render baixa o vídeo diretamente do Drive e envia ao TikTok; o iPhone não precisa manter o arquivo inteiro em memória.