# Financeiro Shopee — auditoria de repasse, custos e saldo antes de Ads (1.8.0)

## Fontes oficiais
- Pedidos: `GET /api/v2/order/get_order_list` (paginação de 50, período de até 15 dias por consulta) e `GET /api/v2/order/get_order_detail` (itens reais, SKUs e quantidades).
- Pagamento: `GET /api/v2/payment/get_escrow_detail`, somente para pedidos com status **COMPLETED**.
- Custos: `shopee_wedrop_costs` no Supabase Shopee, por SKU textual e Shop ID autenticado.
- A Shopee informa `order_income.escrow_amount` e `escrow_amount_after_adjustment`. Esse repasse **já inclui** os abatimentos feitos pela plataforma (taxas, frete, cupons, ajustes). Não deduzir comissão, serviço, transação, vouchers ou frete mais uma vez.
- Colunas de taxas e frete são para inspeção, não novas despesas adicionais.
- Não presumir que `escrow_amount` seja depósito já efetuado no banco: é valor informado no detalhe financeiro do pedido, que pode mudar antes da conclusão.

## Como funciona
1. Na aba WeDrop e custos, seção Financeiro Shopee, selecionar últimos 3, 7 ou 15 dias e clicar **Consultar vendas e repasses reais**.
2. Consultar pedidos, filtrar os `COMPLETED`; obter detalhes e escrows; consultar os custos WeDrop para cada SKU/quantidade. Limite inicial de 35 pedidos COMPLETED por consulta para proteger a API; se houver mais, avisar que período está incompleto.
3. Calcular `saldo antes Ads = repasse Shopee - soma(quantidade × custo WeDrop)`, usando sempre os valores reais da API; `margem antes Ads = saldo antes Ads / repasse` se positivo. Esses números não são lucro líquido/margem líquida final porque faltam Ads atribuídos, tributos e despesas externas.
4. Para cada pedido de **um único SKU**, permitir o subtotal por SKU no cruzamento do catálogo; para pedidos multi-SKU, mostrar resultado no nível do pedido e **não ratear arbitrariamente** a receita, taxas ou anúncios.
5. Se houver devolução, kit com custo complexo, SKU de variação ausente, custo WeDrop não encontrado, quantidade inconsistente ou repasse não retornado, sinalizar **Cálculo incompleto**, sem lucro ou margem artificiais.
6. A coluna antiga **Diferença bruta** foi substituída por **Saldo por venda antes Ads**, que só aparece após uma consulta com dados reais; sem vendas verificadas, mostrar traço.
7. A coluna **Lucro líquido final** no detalhamento permanece `— (Ads não conciliados)`, nunca supor Ads zero. Futuramente integrar gasto por pedido/SKU comprovado e verificar despesas já incorporadas no repasse (p.ex. ads escrow), sem duplo desconto.
8. A função só lê dados da Shopee e do Supabase. Não altera preços, campanhas, anúncio ou o sistema Mercado Livre.
9. Não retornar buyer_username, endereço, telefone ou dados sensíveis do detalhe dos pedidos. A API devolve apenas números e códigos operacionais para a tela.

## Limitações e próxima etapa
- Permissão `Payment/get_escrow_detail` deve existir para a loja; ao negar, mostrar claramente e manter resultados incompletos.
- Ads existente é métrica agregada por campanha, não se pode atribuir `broad_gmv` ou `expense` arbitrariamente a cada pedido. Em particular, GMV amplo e direto não devem ser somados.
- Sem atribuição comprovada de Ads e despesas externas, o sistema **não exibirá lucro líquido final ou margem líquida final**. A estimativa antes de Ads pode ser exibida e auditada sem inventar comissão, taxa ou frete.
- Pedidos criados fora do período, ainda que concluídos dentro, não aparecem na consulta de criação. Não tratar este relatório como demonstração financeira do mês fechado.
- Informar amostra parcial se ultrapassar 35 pedidos concluídos; não extrapolar o valor da amostra para toda a loja.
- Os encargos exibidos são os valores devolvidos pela API por pedido; campos indisponíveis permanecem em branco e não devem ser estimados.

## Validação
No app exclusivo Shopee: Ctrl+F5 → WeDrop e custos → Consultar vendas e repasses reais. Confira ao menos um pedido concluído com SKU e custo existente no painel, comparando repasse com Seller Center.
