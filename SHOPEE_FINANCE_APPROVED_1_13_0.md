# Shopee Finance 1.13.0 — Layout aprovado e conciliação por período

**Objetivo:** aplicar o mockup aprovado da Central Financeiro Shopee Rede Achados BR, removendo sobreposições da listagem, cartões mais equilibrados, prejuízos visíveis e só vendas do período escolhido.

## Funcionalidade
- Cabeçalho com status de seleção, painel de explicação e cartões compactos.
- Períodos: **7, 15, 30 dias civis no fuso America/Sao_Paulo**, ou intervalo personalizado de até 30 dias; a mesma seleção alimenta Order List, Payment e Ads.
- Order List consulta pedidos CRIADOS no intervalo e já **COMPLETED**; não representa todas as entregas concluídas no período caso o pedido tenha sido criado antes. A seleção temporal e essa limitação aparecem na interface.
- Para 30 dias, segmentar consulta em janelas <=14 dias e paginar cada segmento. Até **100 pedidos COMPLETED por consulta** para controlar o volume; se exceder, valores parciais ficam sinalizados e não declarados totais definitivos.
- A tabela principal exibe **apenas SKU com venda real verificada** por padrão; pendências de pedidos daquele intervalo aparecem em filtro à parte. Os demais anúncios do catálogo não são misturados na lista. As fotos são reais do catálogo armazenado.
- Tabela principal com **8 colunas** e min 935px em rolagem horizontal local quando necessário. Valores monetários não quebram; título do produto usa no máximo duas linhas com detalhes abríveis. SKU/quantidade na mesma coluna, não existe botão espremido com letras quebradas.
- Botão **Ver detalhes** mostra repasse, custo, saldo antes Ads, campanha relacionada, resultado após Ads e order_sn de cada SKU; auditoria de pedidos continua disponível.
- Indicador **Resultado após Ads — loja**: `saldo antes Ads dos pedidos verificados - TODOS os gastos de Ads informados pela API no período`. Dessa forma a publicidade sem conversão não é descartada do resultado da loja. Quando negativo, apresentar valor `-R$...` em vermelho, sem omiti-lo.
- Atribuição por SKU permanece conservadora: só vincula gasto da campanha a um único item/SKU identificado e vendido; campanhas sem conversão são despesas globais, não custos artificiais de uma venda.
- **Lucro líquido fiscal final permanece como 'Em apuração'** enquanto tributos e despesas externas não estão conciliados. KPI negativo é resultado OPERACIONAL após Ads, não lucro final inventado.
- Filtros de data removem imediatamente dados anteriores, exigindo atualização para o novo período.
- Mantém Shopee Ads, Pedidos, WeDrop e monitor sem alteração e não toca Mercado Livre.

## Verificação
1. Abrir `https://redeachados-shopee.onrender.com/app/financeiro`, Ctrl+F5, selecionar 15 dias e **Atualizar financeiro**.
2. Revisar quantidade de vendas verificadas e comparar com pedidos COMPLETED **criados** no intervalo; não exibir os 693 produtos não vendidos por padrão.
3. Verificar negativo no card de **Resultado após Ads** em vermelho, com despesas Ads totais do período.
4. Em linhas do SKU, clicar **Ver detalhes** e conferir repasse - WeDrop - Ads vinculado sem deduzir taxas duplicadas.
5. Conferir 7, 30 dias e personalizado e avaliar divergência entre criação e conclusão, campanhas multi-SKU e cobertura de Ads.
