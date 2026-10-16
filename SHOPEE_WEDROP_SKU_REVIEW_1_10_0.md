# Central WeDrop — Revisão inteligente de SKUs e layout compacto (1.10.0)

## Solicitação
O usuário observou em 16/10/2026 que os quadros da página WeDrop eram grandes e desproporcionais, e que os **7 anúncios/variações sem correspondência exata de custo** precisavam de caminhos para resolver, não somente a estatística.

## Resultado
- Cinco indicadores compactos e responsivos no início da página (sem páginas gigantes): SKUs Shopee, variações pendentes, custos WeDrop salvos, vinculados e pendências.
- Bloco **Conferência inteligente de SKUs** com os anúncios sem custo, foto quando devolvida pelo catálogo, título, item ID, model ID, SKU da Shopee e motivo do impedimento.
- Recomendações calculadas pela similaridade **do código**, com evidência: variação de caixa, separadores, possíveis prefixos e pequenos erros de digitação. São apenas **candidatos**, nunca correções automáticas.
- Busca manual por SKU ou trecho no catálogo de custos persistido no Supabase.
- Botão **Confirmar vínculo** com confirmação explícita. Persistência por `shop_id + item_id + model_id` e `shopee_sku` original na tabela `shopee_wedrop_sku_links`, relacionando um SKU de fornecedor com o anúncio/variação. Não altera o SKU na Shopee nem seus preços.
- Ao vincular, custo passa a ser usado no cruzamento, mantendo a fonte do catálogo. Ao clicar **Desfazer vínculo**, retorna a pendência quando não houver correspondência exata.
- Se o SKU do item ou modelo for alterado na Shopee, o vínculo anterior não será usado silenciosamente; exige revisão.
- Somente acesso autenticado com APP_PASSWORD e autorização Shop ID. Mutações verificam Origin e disponibilidade real do SKU WeDrop. Não divulga senhas nem tokens.
- Não há títulos e fotos dos produtos WeDrop no banco de custos (apenas SKU e valor). Sem inventar nomes e sem permitir vínculo automático puramente por semelhança. Para confirmação, conferir o produto no catálogo WeDrop antes do clique.
- Indicadores existentes atualizados com novos vínculos; histórico de confirmações pode ser revisado e desfeito.
- Nenhuma alteração Mercado Livre.

## Dados de referência da migração
A base tinha **737 registros SKU** (730 vinculados, 7 pendentes) e **5.339 SKUs de custos**. Os sete códigos pendentes eram:
`1792-UNI`, `806567`, `894939 - 48`, `964517`, `991-B`, `ar0789`, `ct0003`.
Três eram variações identificadas por model ID (verificar no banco para contar). Essa listagem é dinâmica: se a loja editar itens ou confirmar links, os números mudam.

## Verificação
1. Entrar em /app/wedrop e atualizar com Ctrl+F5.
2. Ver **Revisar SKUs pendentes** e o quadro de fotos/nomes; não deve exibir informações inventadas.
3. Abrir um card, selecionar candidato ou pesquisar por SKU, conferir manualmente no fornecedor.
4. Confirmar vinculação e conferir que o registro vai para "Vínculos de custo confirmados", que pode ser desfeito.
5. Conferir que o total de pendências cai e de vinculados aumenta (desde que o cadastro Shopee não tenha sido atualizado).
6. Conferir os módulos Ads, Pedidos, Financeiro e Monitor sem alterações.

Obs.: A tabela SQL é uma migração aditiva separada, já aplicada ao Supabase da Central Shopee; não é necessário reanexar o CSV salvo.
