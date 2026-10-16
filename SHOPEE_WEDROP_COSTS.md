# WeDrop + Custos — Rede Achados BR Shopee 1.6.0

## Finalidade
Importação dos custos de aquisição de SKUs do fornecedor WeDrop, com vínculo à cópia do catálogo Shopee no Supabase. **Somente Shopee** (Shop ID fornecido pela autenticação). Mercado Livre permanece intacto.

## Processo de importação
1. Exportar arquivo **CSV** no fornecedor WeDrop, contendo colunas reais de **SKU** e **custo de aquisição unitário**. Neste estágio arquivos Excel XLSX não são suportados: exportar CSV.
2. No aplicativo Shopee, abrir **WeDrop e custos**, selecionar arquivo CSV UTF-8 de até 4 MB.
3. **Conferir colunas do CSV**, inspecionar prévia das primeiras cinco linhas e **escolher manualmente** qual coluna é SKU e qual é custo de aquisição (R$). O importador não assume por nome, nem confunde custo com preço de anúncio.
4. **Confirmar importação dos custos**. Por padrão, custos existentes são preservados. Marcar **Atualizar custos já cadastrados** somente para substituir valores existentes.
5. Linhas com custos zero, negativos, malformados ou SKU vazio são rejeitadas. Somente com **Ignorar linhas inválidas** marcado podem ser descartadas e quantificadas.
6. SKUs repetidos com custo diferente no mesmo CSV bloqueiam a importação inteira. Repetidos de mesmo custo são deduplicados.
7. O histórico é gravado no Supabase com a chave protegida do backend, na tabela `shopee_wedrop_costs` (RLS).
8. **Atualizar cruzamento** para comparar custos com os SKUs de produtos/variações já sincronizados. Sem produto na cópia do catálogo, nenhum vínculo automático é inventado.

## Resultados
- Contagem de SKUs Shopee comparados, com custo vinculado, sem custo, modelos ainda não sincronizados e custos importados.
- Lista priorizando SKUs sem custos.
- `Preço catálogo - Custo WeDrop = Diferença bruta` quando os dois valores estiverem confirmados.
- Nada é apresentado como **lucro líquido**, valor a receber ou margem líquida: isso exige taxas, logística, preços finais (inclusive promoção) e despesas reais de Ads por SKU.
- A importação jamais executa alterações de preços, campanhas, estoque nem promoções na Shopee.

## Controles
- Protegido por senha administrativa `APP_PASSWORD` e sessão autenticada. Sem senha configurada, importação e consulta de custos são bloqueadas.
- CSV e mapeamento processados no backend; o conteúdo do arquivo não é salvo no banco. Gravam-se apenas pares SKU e custo, nome do arquivo e data.
- Limites por arquivo: até 4 milhões de caracteres (máximo 15.000 linhas), dados JSON até 6 MB, importação em lotes idempotentes. Se um lote falhar, a tela informa que a gravação foi parcial e como retomar.
- Títulos e SKUs exibidos com `textContent`, impedindo interpretação de HTML.
- Não contém integração privada com API WeDrop: custo só vem do CSV fornecido pelo titular.
- Relação por SKU é exata após remoção de espaços nas extremidades; não há vínculo fuzzy que misture variantes diferentes.
- A importação não é executada automaticamente no deploy; só após ação explícita do usuário.

## Testes
- Testes CSV BRL/USA, aspas e ponto e vírgula; formatos inválidos; duplicados conflitantes; custo zero; modelos sem preço.
- Testes de catálogo já existentes permanecem ativos.
- Teste de produção: login → WeDrop e custos → prévia do CSV → escolher SKU e custo → confirmar → atualizar cruzamento. Enviar somente print do resultado, nunca senha nem chaves.

## Próxima etapa
1. Validar uma exportação real WeDrop (nomes de coluna e SKU).
2. Importar produtos com variações para o cache e validar taxa de correspondência.
3. Criar conciliação financeira com **valores líquidos efetivos** por pedido, taxas, descontos, frete, devoluções e Ads de modo deduplicado; só então habilitar cálculo de lucro e simulações de preço.
4. Implementar prévia + **Executar** para promoções/descontos apenas quando API e margem forem confirmadas e com aprovação.

## Correções 1.6.1 — 16/10/2026
- Resolve o problema visual de checkboxes que herdavam `input { width: 100% }`, empurrando as legendas para a margem direita e criando uma faixa horizontal de rolagem. Caixas passam a medir 18 × 18 px ao lado da explicação.
- Tabela de prévia de 5 linhas continua horizontalmente rolável **somente dentro da área de dados**, com altura máxima de 230 px, sem expandir o formulário.
- O botão **Confirmar importação dos custos** permanece desativado até clicar em **Validar SKUs e custos antes de importar**.
- A pré-validação lê o CSV, exige selecionar as duas colunas e calcula correspondência **exata** entre SKUs da WeDrop e SKUs armazenados do catálogo Shopee, sem eliminar zeros à esquerda.
- Se houver 0 correspondências, exibir risco de EAN/NCM versus SKU e exigir autorização específica para prosseguir; a rota do servidor bloqueia importação sem tal aprovação.
- Nunca atualizar custo já salvo automaticamente: seleção de substituição continua desmarcada por padrão.
- O bloco de variações conta com **Sincronizar variações pendentes**, solicita até dez itens por lote da API oficial `get_model_list`, armazena no Supabase, atualiza as métricas e permite Interromper/Retomar.
- Lotes falhos mantêm dados salvos; falhas de API são exibidas por item, sem inventar SKUs.
- Contagem de 404 SKUs sem custo era válida antes da importação. A prévia do CSV não grava dados. Os 117 anúncios com variações faltantes serão tratados pela sincronização em lote.
- Nada altera preços, Ads, pedidos ou serviço Mercado Livre.

## Ajuste 1.6.2 — custo ausente não é erro e não gera tabela vazia
- Enquanto `shopee_wedrop_costs` não tiver custos para a loja, a central exibirá exclusivamente totais úteis do catálogo (anúncios, SKUs, variações), e o aviso **Nenhum custo WeDrop importado**.
- As colunas e a tabela **Custo WeDrop / Diferença bruta / Situação financeira** e os cartões de custo vinculado/sem custo ficarão ocultos; não exibir 500 linhas inúteis com custo em branco.
- O backend também não transmite a amostra financeira enquanto a tabela de custos estiver vazia. Nenhum anúncio, SKU ou custo é apagado.
- Após importar algum custo válido, a análise por SKU e as colunas financeiras reaparecem; SKUs restantes sem vínculo continuam sinalizados apenas nessa fase de conciliação.
- Correção na pré-validação: a mensagem de correspondência agora verifica `comparison.matchedCount`, não uma variável inexistente que causava erro.
- Situação validada no banco em 16/10/2026: 521 anúncios, 355 modelos, 0 variações pendentes e **0 custos importados**. Esses dados não são automaticamente alterados pelo deploy.
