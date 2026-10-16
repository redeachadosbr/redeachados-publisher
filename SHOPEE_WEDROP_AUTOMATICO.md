# WeDrop — custos automáticos por SKU (Shopee v1.7.0)

## Origem efetivamente validada
Arquivo de referência do usuário: `produtos-catalogo(20261016-144428).csv`, com 5.341 linhas, 5.339 SKUs distintos, sem preço vazio. O layout **específico** de 16 colunas é:
`SKU,Nome do Produto,Marca,Categoria,Fornecedor,Estado do Fornecedor,Preço,EAN,NCM,CEST,Peso (kg),Largura (cm),Altura (cm),Comprimento (cm),Peso da Caixa (kg),Imagem Principal`.
O campo `Preço` desse layout é tratado como custo do fornecedor. Em CSV genérico, `Preço` não deve ser adivinhado como custo; o reconhecimento automático exige campo explícito `Custo`/`Custo WeDrop` etc.

## Novo processo
- Selecionar CSV na aba **WeDrop e custos** inicia automaticamente a leitura, validação e importação via endpoint autenticado. Sem clique em "Conferir colunas" e sem importar manualmente.
- Checagem obrigatória de correspondência exata de SKU com catálogo Shopee previamente sincronizado. Se 0 correspondências, abortar; não importar a partir de EAN ou NCM.
- Duplicatas com preço idêntico são consolidadas; divergências de preço por SKU abortam importação.
- Custos novos são adicionados, custos alterados são atualizados, custos idênticos são preservados. **Nunca deletar SKUs apenas por não aparecerem no novo arquivo** (podem permanecer no estoque de pedidos históricos).
- Após importação, atualizar cards e cruzamento financeiro; hash SHA-256, origem, quantidade e data ficam em `shopee_wedrop_sync_state` (RLS).
- Nunca alterar anúncios ou preços de venda Shopee, nem o publisher Mercado Livre.

## Atualização do fornecedor sem anexar novo arquivo
Para o servidor detectar automaticamente quando a WeDrop atualiza o catálogo, é preciso acesso autorizado a um endereço **direto, seguro e consultável** do CSV, API ou arquivo publicado. Não inferir link interno da sessão do navegador, inventar API ou coletar cookies do usuário.
Na Render Shopee, informar *somente se já existir feed autorizado*:
- `WEDROP_CATALOG_FEED_URL` — URL HTTPS do CSV disponibilizado pelo fornecedor
- `WEDROP_CATALOG_FEED_HOST` — host exato autorizado do feed
- `WEDROP_CATALOG_SHOP_ID` — Shop ID 852701218 (conferir antes de ativar)
- `WEDROP_CATALOG_FEED_TOKEN` — opcional, token do fornecedor (se ele permitir)
- `WEDROP_CATALOG_REFRESH_MINUTES` — intervalo (padrão 360 minutos)
O aplicativo lê automaticamente o feed ao iniciar e no intervalo quando em execução, compara o hash antes de gravar e persiste novos custos sem intervenção. Sem feed informado, continua disponível o processamento automático **de cada novo CSV anexado**. Não prometer atualização externa espontânea quando a WeDrop altera catálogo numa página autenticada.
Em Render Free, o processo pode hibernar; polling em memória não garante periodicidade. Para garantia 24/7 usar execução contínua ou agendador externo autenticado.

## Validação
`npm run check && npm test`. No painel: WeDrop e custos → escolher novo CSV → aguardar "Atualização concluída" → conferir último sync, 5.339 SKUs e correspondências com Shopee. Arquivos maiores de 4 MB ou acima de 15.000 linhas exigem divisão/adaptação.

## Correção 1.7.1 — apresentação de vínculos
- Confirmado no banco da Shopee: **737 linhas com SKU**, das quais **730 têm custo associado por chave exata** e **7 não têm**; 686 chaves distintas entre os vinculados.
- A listagem anterior ordenava `false` antes de `true` em `costMatched`; portanto os sete pendentes apareciam primeiro e causavam a impressão de que a importação falhou.
- A tabela tem agora **Com custo vinculado (padrão)**, **Pendentes** e **Todos**, com contagens e paginação de 500 registros. O resumo explica que catálogo geral WeDrop não anunciado não é falha.
- Não vincular custos de SKU divergente automaticamente. Exemplos: `991-B` Shopee vs `991-b` fornecedor; `964517` vs `CO6964517`; `894939 - 48` vs `894939`. Exigem verificação de produto/variação.
- Não altera cadastro de fornecedor, anúncios da Shopee, preços nem publisher Mercado Livre.
