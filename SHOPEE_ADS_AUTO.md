# Shopee Ads — consulta automática de anúncios de produtos (v1.4.0)

## Objetivo
O vendedor não precisa copiar Campaign IDs. O painel chama a API oficial V2:
- `GET /api/v2/ads/get_product_level_campaign_id_list`: campanha de produtos com `ad_type=all`, `limit=50`, `offset` paginado enquanto `has_next_page=true`.
- `GET /api/v2/ads/get_product_campaign_daily_performance`: consulta desempenho em lotes de até 100 campanhas, com `start_date`, `end_date` e `campaign_id_list`.

Referência API:
https://open.shopee.com/documents/v2/v2.ads.get_product_level_campaign_id_list?module=117&type=1
https://open.shopee.com/documents/v2/v2.ads.get_product_campaign_daily_performance?module=117&type=1

## Resultado
- Campanhas encontradas; gasto em Ads `expense`; GMV amplo `broad_gmv`; GMV direto `direct_gmv`; impressões e cliques.
- ROAS = GMV amplo / gasto. ACOS = gasto / GMV amplo * 100; se o denominador for zero, exibir traço, não um indicador artificial.
- GMV direto é subconjunto atribuído ao item promovido e **não deve ser somado ao amplo**.
- Tabela com campanhas ordenadas por gasto e cálculo agregado corretamente.
- Período máximo de 30 dias na mesma chamada, datas no máximo 6 meses atrás; data inicial deve anteceder a final (limitação da API).
- O endpoint requer acesso específico à API Ads. A categoria Seller In House System não garante todas as permissões; se a Shopee negar, apresentar `error_api_permission` ou erro real, não declarar que existem zero campanhas.
- A descoberta consulta as campanhas de **anúncios de produtos**; outras modalidades eventualmente presentes no Seller Center não devem ser consideradas cobertas por esta consulta.

## Limites e próximos incrementos
- Não ajustar orçamentos nem pausar anúncios automaticamente.
- `ROAS`, `ACOS` e GMV são métricas de publicidade. Não são **lucro líquido**. Para esse cálculo: cruzar pedidos, custo WeDrop, taxas, abatimentos reais e gastos Ads sem deduplicar erroneamente despesas.
- Consulta totalmente autenticada pelo próprio painel; não retornar tokens, assinatura ou Partner Key.
- Se permissões de Ads não forem concedidas pelo aplicativo, verifique os módulos autorizados no console da Shopee, ou use exportação de relatório oficial para análise financeira offline.
- Status de leitura da API real exige clique do usuário em **Localizar campanhas e analisar** no ambiente de produção.
- O código do Mercado Livre não é alterado.

## Teste após deploy
Abra `https://redeachados-shopee.onrender.com`, Ctrl+F5, Ads → selecione início/fim → Localizar campanhas e analisar. Se aparecer erro, envie somente a mensagem de erro e request_id, nunca tokens.
