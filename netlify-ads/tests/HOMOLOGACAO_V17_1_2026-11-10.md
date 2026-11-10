# Homologação técnica — Rede Achados BR Ads V17.1 (pré-publicação)
Data da avaliação: 10/11/2026. Ambiente: branch de testes isolada `test/ads-v17-1-homologacao-20261110`. Nenhuma alteração manual foi realizada nos anúncios Shopee; não foi solicitado deploy de produção no Netlify.

## Escopo
- Preservar seleção manual das datas na aba Decisão atual.
- Preservar 4 cenários e Regra 05; o alerta financeiro não impede reduzir o ROAS quando a regra indicar isso.
- Somar Ads por ID de campanha desde o início conhecido no histórico, até o último dia completo (ontem).
- Confrontar com lucros operacionais antes de Ads, sem retirar comissões já embutidas no repasse.
- Priorizar repasses ajustados da Shopee Payment e custos efetivos WeDrop; XLSX apenas quando declarar explicitamente lucro anterior a Ads e houver cobertura completa.
- Não inventar resultado quando a API, devoluções, SKU, custos ou histórico forem insuficientes.

## Testes simulados executados
| Área | Casos aprovados |
| --- | ---: |
| Núcleo financeiro, datas e somatórios acumulados | 11/11 |
| API Ads com seleção manual, 2 blocos, dados ausentes e datas deslocadas | 3/3 |
| Proxy Netlify–Render, autorização, validação de parâmetros e falhas de permissão | 7/7 |
| Cenários Ads (1–4, ilimitado, período aberto, verba instável, risco de prejuízo) | 9/9 |
| Interface financeira (prejuízo, cancelamento, XLSX, permissões, Ads ausente, início ausente) | 6/6 |
| **Total de simulações sobre o código de teste** | **36/36** |

Testes auxiliares: sintaxe dos módulos JS; importação XLSX com pedidos duplicados, cancelados e múltiplos SKUs; coluna ambígua de “Lucro Líquido” corretamente rejeitada como base para subtrair Ads. Validados com cenários construídos para teste; **não são provas de repasses ou autorização da loja em produção**.

## Pendências para homologação real
1. **Não houve chamada real à API Shopee da conta.** Verificar permissão `Payment/get_escrow_detail`, `Returns/get_return_list`, limites e tempo de resposta do servidor Render.
2. **Cancelamentos após pagamento:** a API de pedidos informa status atual; o backend financeiro ainda não preserva integralmente a contagem de pedidos historicamente pagos que foram depois cancelados. Para não criar lucro falso, quando a consulta revela cancelamentos sem conciliação por SKU, o diagnóstico fica **pendente**.
3. **Dados WeDrop reais por pedido:** o custo cadastrado no catálogo é estimado; só confirmar o resultado depois do custo efetivo registrado e repasse ajustado.
4. **Planilha XLSX:** usar lucro antes de Ads apenas se a coluna tiver base inequívoca. Uma coluna genérica “Lucro Líquido” não indica se Ads já foram descontados e não autoriza dupla subtração.
5. **Data de início:** buscar registro “Campanha iniciada” no histórico do SKU. Se não houver, não inferir uma data.
6. **Hoje:** o cálculo acumulado encerra no último dia completo; anúncios/pedidos de hoje não entram como resultado final.
7. **Produção:** integrar e testar esta branch com serviço Finance do Render em homologação e verificar configuração de branch deploys do Netlify; não executar deploy de produção antes de aprovação.

## Comportamento esperado
- Os cinco cenários/recomendações permanecem independentes do resultado financeiro.
- Quando o cenário indicar reduzir ROAS, exibir alerta financeiro de possível aumento de gasto/prejuízo **sem bloquear ou substituir a recomendação**.
- Gasto Ads é somado por campanha em datas disjuntas; nunca somar campanhas diferentes.
- Pedidos com mais de um SKU não recebem lucro individual inventado.
- Sem dados suficientes, mostrar “resultado pendente” no lugar de um número estimado como fato.

**Status:** homologação simulada aprovada; homologação com dados reais e implantação ainda pendentes. A branch de produção permanece inalterada.
