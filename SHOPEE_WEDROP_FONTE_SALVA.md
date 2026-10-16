# Shopee WeDrop — Fonte persistente (1.7.2)

## Solicitação resolvida
Ao abrir a aba **WeDrop e custos**, o navegador limpava o campo de arquivo CSV, mostrando a mensagem "Aguardando um CSV" apesar de a importação já ter sido salva no Supabase. Isso sugeria falsamente que o catálogo havia desaparecido.

### Situação real conferida em 16/10/2026
- Loja Shopee 852701218.
- Tabela `shopee_wedrop_costs`: 5.339 registros de SKU e custo.
- `shopee_wedrop_sync_state`: status success, nome `produtos-catalogo.csv`, última sincronização registrada.
- Catálogo Shopee: 730 registros com correspondência de custo e 7 pendentes.
- O input nativo de upload do navegador **não pode** permanecer preenchido após atualizar a página. Isso não significa perda de custos.

### Nova experiência
- Ao abrir, consultar estado da loja autorizada na rota `/api/shopee/wedrop/auto/status`, incluindo **contagem real** do banco, data e nome da última origem.
- Se houver custos, apresentar primeiro **Catálogo salvo no Supabase** e o botão **Atualizar vínculos com catálogo salvo**. O botão recalcula correspondências e métricas usando os registros permanentes, sem precisar anexar CSV.
- Deixar a seção **Enviar nova versão do CSV** recolhida. Usá-la somente para incorporar uma nova exportação; o upload atualiza somente custos novos/alterados.
- Se não houver custos, abrir automaticamente a seção de importação inicial.
- Se a API de status falhar, informar que não foi possível verificar, **nunca alegar que os dados foram perdidos**.
- Os custos e o nome/hash da origem estão salvos, **não o arquivo CSV bruto com todas as 16 colunas**. Não afirmar que o arquivo binário foi armazenado; a funcionalidade de precificação utiliza SKU e custo efetivamente persistidos.
- A comparação com SKUs da Shopee usa o banco a cada atualização e reconhece novos anúncios se estiverem no cache. Não exige reaproveitar a seleção do input de arquivo.
- A detecção externa de **novas versões publicadas pela WeDrop** ainda requer feed/API autorizados. Sem isso, o sistema conserva e usa os dados atuais, mas não tem como saber automaticamente quando a página privada do fornecedor mudar.
- Nunca altera Mercado Livre, anúncios, frete, descontos ou preços de venda.

## Teste
1. Login → WeDrop e custos → tela mostra "Catálogo salvo no Supabase", nome e quantidade.
2. Recarregue o navegador; o card permanece, mesmo com o input de arquivo vazio na seção opcional.
3. Clique em "Atualizar vínculos com catálogo salvo". Confirme 730 registros vinculados e 7 pendentes, dependendo das alterações recentes.
4. Apenas quando tiver novo catálogo, abra "Enviar nova versão" e selecione CSV.
