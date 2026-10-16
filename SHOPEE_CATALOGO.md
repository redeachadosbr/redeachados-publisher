# Shopee — Catálogo integral e estoque (versão 1.5.0)

## O que foi implementado
- Aba **Produtos** carrega anúncios da API V2 `get_item_list` de forma paginada por `NORMAL`, `UNLIST`, `BANNED` e `REVIEWING` (50 por chamada), em sequência.
- Para cada página consulta `get_item_base_info` para nome, SKU do item, preço disponível, estoque, foto, indicação de variação e de promoção.
- Não interpretar **estoque desconhecido como zero**. Produtos com `has_model=true` mostram "Ver variações" e a consulta sob demanda usa `get_model_list` para SKUs de variações, preço e estoque.
- Busca por título/SKU/Item ID, filtro por status, ordenação por atualização/nome/preço/estoque.
- Contadores de anúncios ativos, inativos, sem SKU, com estoque zero. Exportação CSV do conjunto filtrado, com proteção contra fórmulas no CSV.
- Visualização de 150 registros por vez com "Mostrar mais" para evitar lentidão em milhares de anúncios.
- Progresso de sincronização na tela, botão Interromper e botão para Continuar do ponto em que parou. Erros mantêm dados já carregados e não geram um falso total completo. É possível atualizar tudo novamente depois.
- **Somente leitura**. Não altera preços, estoque, catálogo nem anúncios existentes.

## Observações importantes
- A sincronização é **pela página aberta**: se fechar o navegador antes de concluir, ainda não fica salvo no Supabase. O próximo incremento será um catálogo persistente para cruzar com os custos WeDrop e monitorar divergências.
- Status de anúncio inválido/sem permissão ou detalhes com erro ficam explicitamente sinalizados como incompletos. Não contar como catálogo 100% sincronizado.
- Para anúncio com variações, a API base pode não fornecer preço/estoque do item pai; consultar os modelos para dados por SKU.
- Não usar custo WeDrop estimado nem presumir estoque do fornecedor. Integração e conciliação dependem de dados reais.
- Os endereços de imagem são da CDN fornecida pelo retorno oficial, sem dados de comprador.
- O app está na branch exclusiva `shopee-service` e **não altera o Mercado Livre**.

## Como validar no aplicativo
Abra `https://redeachados-shopee.onrender.com`, Ctrl+F5, aba Produtos e clique **Sincronizar catálogo**. Verifique que ultrapassa a antiga limitação de 50, filtre e teste um anúncio com variações e um sem SKU. Se surgir aviso, copie somente a mensagem. Nenhuma chave/token precisa ser enviada.

Referências: Shopee Open Platform v2.product.get_item_list, get_item_base_info e get_model_list. 

## Cache persistente — versão 1.5.1
- O backend grava páginas confirmadas na tabela `shopee_catalog_items`, por `shop_id + item_id`.
- Variações consultadas pelo botão Detalhes são gravadas em `shopee_catalog_models`, por `shop_id + item_id + model_id`.
- Ambos têm RLS ativada: acesso somente pela chave do backend; sem exposição pública de dados pessoais ou chaves OAuth.
- Ao entrar no painel, a aba Produtos recupera o último catálogo salvo no Supabase. Exibe aviso de histórico, pois dados antigos **não são estoque atualizado**.
- Cada consulta direta à Shopee atualiza a cópia armazenada. Caso o Supabase falhe, a leitura Shopee continua e um aviso é exibido.
- Dados de base ausentes não apagam valores previamente confirmados. Estoque/preço desconhecidos continuam nulos.
- O cache não equivale à sincronização completa: precisa percorrer todos os status, sem falhas.
- Esse armazenamento permitirá relacionar os SKUs com os custos WeDrop e guardar comparativos de margem sem alterar o anúncio automaticamente.
