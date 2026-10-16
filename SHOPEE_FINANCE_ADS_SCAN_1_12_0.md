# Shopee Finance 1.12.0: varredura Ads + pedido + custo WeDrop

## Pedido
A loja pediu que o gasto Shopee Ads fosse considerado junto das vendas e descontado do resultado de cada SKU quando houvesse venda atribuída à campanha. Quando não houver conversão atribuída, não associar Ads à venda, porém registrar essa despesa para auditoria da loja.

## Fontes
1. API Shopee Payment e pedidos `COMPLETED`, com repasse e custo real WeDrop (já implementados, limitados a 35 pedidos por intervalo de 3, 7 ou 15 dias).
2. API Ads V2 `get_product_level_campaign_id_list`, `get_product_level_campaign_setting_info` com `common_info.item_id_list`, e `get_product_campaign_daily_performance` com `expense` e `direct_order`.
3. Catálogo Shopee com `item_id` e SKU: requer um item_id e apenas um SKU por campanha para correspondência inequívoca.

## Procedimento
- Na operação **Atualizar financeiro**, faz consulta Payment + Ads em paralelo, sem exigir acionamento manual de outra aba.
- Campanha com `direct_order > 0`, apenas um `item_id` oficial, SKU único no catálogo e saldo de pedido COMPLETED verificado no mesmo período → custo total da campanha daquele período é associado ao *resultado operacional por SKU*, não a um pedido específico. Diversas campanhas vinculadas ao mesmo SKU são somadas uma vez cada.
- `direct_order = 0` comprovado → gasto aparece em "Ads sem conversão", NÃO é debitado na venda SKU. É uma despesa real do período da loja; não desaparece da contabilidade.
- Campanha com vários produtos, variações múltiplas, SKU repetido, conversão Ads sem pedido COMPLETED no recorte, ou métrica ausente → gasto registrado como "Ads pendentes de atribuição" sem rateio fictício.
- Se API Ads indisponível: indicar o erro; NÃO considerar R$ 0 como custo.
- Data Ads por dia civil (America/Sao_Paulo); vendas por janela móvel de criação; Shopee usa janela de atribuição de até sete dias após clique. Portanto *não há prova de atribuição a um order_sn específico*.
- Compreender `saldo após Ads` como **comparativo parcial por SKU/período**, não lucro líquido fiscal, lucro por pedido, nem repasse líquido bancário. Tributos, GMS/shop ads e outras despesas ainda pendentes.
- Sem alteração de campanha, gastos, pedidos, preços, SKUs, catálogo, estoque ou app Mercado Livre.

## Validação
1. Em `/app/financeiro` com Ctrl+F5, clicar **Atualizar financeiro**.
2. Verificar **Ads com conversão / SKU**, **Ads sem conversão** e **Ads total**. Não informar zero se a consulta falhar.
3. Inspecionar um produto que teve venda Ads confirmada: saldo = repasse - custos WeDrop - gasto de campanha vinculada; validar contra a Shopee Ads por período.
4. Inspecionar campanhas sem conversão e de vários produtos, que devem aparecer na aba "Campanhas sem venda ou sem vínculo seguro".
5. Não chamar o saldo de "lucro líquido final".
6. Verificar testes e implantação exclusiva Shopee.
