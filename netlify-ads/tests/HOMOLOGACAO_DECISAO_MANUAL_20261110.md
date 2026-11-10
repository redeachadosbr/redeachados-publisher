# Homologação de testes — Decisão Ads simplificada (10/11/2026)

Branch de homologação: `test/ads-manual-only-no-campaign-panel-20261110`.

**Não publicada no Netlify.** As alterações foram implementadas e verificadas por testes de unidade e integração simulada com dados fictícios. Não houve chamada autenticada à conta Shopee, alteração de campanha, publicação ou atualização do Google Drive.

## Escopo testado

1. Remover o painel independente “Selecione sua campanha Shopee”, removendo seleção duplicada e período rápido 7/14/30 dias.
2. Manter escolha manual das datas inicial/final no formulário principal e o botão único **Consultar e analisar**.
3. Consulta Ads de um SKU e uma campanha; caso existam várias, abrir seletor já existente para confirmação; não misturar campanhas.
4. Inserir **lucro dos pedidos antes de Ads** manualmente e calcular **resultado acumulado = lucro informado − gasto Ads API desde o início conhecido da campanha**.
5. Persistir a entrada por `SKU|ID da campanha|início|fim do período acumulado`, apenas em armazenamento local deste navegador.
6. Não usar dados de Payment/Returns da API financeira neste bloco, nem presumir custo/lucro por SKU.
7. Manter recomendações curtas baseadas nos cenários existentes (20% nos cenários 01–04, 10% somente quando permitido pela Regra 05), evidência de capa/título e informação detalhada em “Ver todas as métricas”.
8. Preservar as quatro regras Ads e a Regra 05 sem bloquear a decisão por alerta financeiro.

## Verificações concluídas — dados simulados

| Área | Situação |
| --- | --- |
| Sintaxe dos scripts JS alterados | Aprovado |
| Painel de campanha duplicado realmente removido | Aprovado |
| Datas manuais preservadas em consultas da API | Aprovado |
| Várias campanhas exigem confirmação sem somar IDs distintos | Aprovado |
| API deslocando datas mostra erro em vez de alterar o intervalo | Aprovado |
| Diagnóstico provisório funciona sem o painel rápido | Aprovado |
| Financeiro acessível mesmo com cenário Ads incompleto | Aprovado |
| API Ads única fonte automática de gasto, sem chamada a Payment | Aprovado |
| Lucro informado R$ 20,00 − Ads R$ 35,00 = −R$ 15,00 | Aprovado |
| Lucro informado R$ 80,00 − Ads R$ 35,00 = +R$ 45,00 | Aprovado |
| Lucro informado R$ 35,00 − Ads R$ 35,00 = R$ 0,00 | Aprovado |
| Entrada negativa, invalidada, vazia e armazenamento por janela | Aprovado |
| API de Ads com janela incompleta não gera resultado final | Aprovado |
| Cenários 01–04 continuam iguais e geram ações curtas | Aprovado |
| Regra 05: redução de 10% somente quando cálculo permitir | Aprovado |
| Capa/título apenas com diagnóstico e período confiável | Aprovado |
| Alerta financeiro não altera recomendações | Aprovado |

## Limites e cuidados

- A fonte de lucro é **manual**, não é comprovada automaticamente. A pessoa deve informar o lucro de todos os pedidos do SKU/campanha para o mesmo intervalo acumulado e **antes de descontar Ads**, já deduzidos custos de produto e taxas pertinentes.
- O investimento Ads vai **até ontem**, excluindo o dia atual incompleto. O lucro manual precisa corresponder ao mesmo intervalo. A entrada é armazenada apenas neste navegador, não sincronizada ao Google Drive.
- Se faltar a data real de início de campanha no histórico ou um bloco de Ads não for confirmado, o aplicativo não inventa um saldo.
- Ajustes de 15% não foram introduzidos: a regra original é de 20% nos cenários de orçamento e a Regra 05 pode oferecer 10%, conforme seus próprios critérios. O cálculo não deve inventar percentuais.
- **A homologação visual no navegador real e a validação com a API autenticada da loja ainda não foram realizadas nesta branch.** São próximas etapas, somente após autorização de uma publicação de teste/produção, considerando os créditos Netlify.

## Verificação de regressão

A seção de código de `validate()`, `analyze()` e demais cálculos das cinco regras na página foi comparada com a versão publicada e permaneceu idêntica. Nenhuma ação da Shopee é executada automaticamente.

**Status: implementação na branch de testes concluída; testes simulados aprovados; não publicar sem aprovação explícita.**
