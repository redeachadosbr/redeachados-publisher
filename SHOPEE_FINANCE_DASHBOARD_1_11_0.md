# Financeiro Shopee 1.11.0 — Dashboard compacto por SKU

Aprovado pelo lojista após receber o mockup visual. Implementado no serviço exclusivo da Shopee, com marca Rede Achados BR e integração Shopee.

## Interface
- Layout compacto com filtros de últimos **3, 7 ou 15 dias**, busca por SKU/nome e botão **Atualizar financeiro**.
- Seis mini indicadores: pedidos verificados, repasse Shopee, custos WeDrop, saldo antes de Ads, Ads por SKU (pendente), lucro líquido final (não apurado).
- Lista com miniatura e título do anúncio real (origem: cache oficial do catálogo Shopee), SKU, quantidade vendida verificada, repasse, custo, saldo após repasse e WeDrop, Ads, lucro líquido e situação.
- Filtros: Todos, Vendas verificadas, Sem venda verificada, Pendências. Pesquisa e botão Mostrar mais (36 itens por lote).
- Os valores financeiros da lista só aparecem **após consulta oficial** e para pedidos COMPLETED com repasse Payment, custo WeDrop e SKU único identificado. Sem venda verificada significa apenas ausência de resultado na consulta, não ausência absoluta de vendas.
- Botão Ver pedido abre a auditoria por pedido, com comissão/serviço/frete, sem descontá-las novamente; botão Ver produto navega ao catálogo e preenche a pesquisa.
- Auditoria detalhada de pedidos e tabela de correspondência/custos ficam recolhidas, evitando página gigante.
- Tabelas compactas com rolagem horizontal **contida no próprio componente** e mobile responsivo. Não cortar botões ou a página.
- Dados de buyer, endereço, telefone e outras PII nunca são retornados.

## Cálculo / precisão
- **Saldo antes Ads = repasse Shopee após ajustes - (custo WeDrop × quantidade).**
- O repasse Shopee informado já incorpora os encargos e descontos da plataforma; taxas e frete na auditoria são informativos, não subtraídos duas vezes.
- Costos corrigidos manualmente pelo vínculo SKU aprovado por shop/item/model só são usados quando a variação e o SKU ainda coincidirem exatamente.
- Pedido com vários SKUs: saldo no nível de pedido; não dividir repasse entre produtos arbitrariamente.
- **Lucro líquido final e margem final não são demonstráveis até conciliar Ads realmente atribuíveis, tributos e demais despesas externas.** O design mostra '—' / pendente em lugar de valores simulados.
- O exemplo visual da imagem aprovada era **ilustrativo**, não os valores reais da loja. Nenhum número do mockup foi inserido no banco nem na aplicação.
- Limite oficial implementado: 35 pedidos concluídos criados até 15 dias por consulta. A interface informa quando a análise cobre apenas uma amostra. Não é DRE mensal nem comprovante de depósito bancário.

## QA
1. Acessar `/app/financeiro` e forçar Ctrl+F5.
2. Ver KPIs vazios antes da consulta; clique Atualizar financeiro.
3. Conferir alguns pedidos COMPLETED, repasse e custo WeDrop no Seller Center, incluindo SKU com variação.
4. Ver fotos pequenas, filtros, paginação e botão Ver pedido.
5. Se a API Payment não autorizar, verificar alerta de permissão e campos de lucro em branco, sem qualquer cálculo fictício.
6. Checar no mobile e testar navegação de produtos, pedidos, Ads, monitor, WeDrop.

A versão **não toca no Mercado Livre** nem altera anúncios ou valores Shopee.
