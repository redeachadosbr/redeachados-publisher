# Shopee 1.14.1 — Correção do localizador por SKU

## Comportamento
- O vendedor digita APENAS o SKU, por exemplo `429229`.
- O sistema busca esse SKU **exato** no catálogo Shopee salvo (incluindo `model_sku` das variações). Obtém Item ID internamente; não exige preenchimento manual de Item ID.
- Ao encontrar uma única correspondência, consulta automaticamente o anúncio e a ficha técnica oficial.
- Mais de uma correspondência: apresenta miniaturas e nomes para escolher. Nada é alterado até confirmação.
- Antes de confiar no cache, a consulta Shopee compara o SKU atual com o anúncio/modelo para impedir uma correspondência errada.

## Correções dos erros capturados no print
1. A API Shopee `v2.product.get_attribute_tree` requer `category_id_list`, e não `category_id`. A resposta real usa `response.list[]` por categoria, contendo `attribute_tree`. Parser revisado; atributos filhos dependem do `value_id` pai selecionado e não contam como obrigatórios ausentes quando inativos.
2. A tabela `public.shopee_optimizer_settings` no Supabase estava sem `SELECT/INSERT/UPDATE` para `service_role`, gerando HTTP 403. Autorizações corrigidas pelo administrador do projeto. `anon` e `authenticated` continuam sem acesso; somente backend usa a credencial de serviço.

## Segurança
Tudo segue **somente leitura no anúncio da Shopee**. O prompt salvo permanece no Supabase. Fotos/vídeos, SEO, descrição, ficha fiscal e demais alterações automáticas ainda aguardam os fluxos de mídia e validação já definidos; nenhum campo é inventado para passar na API.

## Teste
Abrir `/app/otimizacao`, atualizar (Ctrl+F5), informar SKU `429229` e clicar **Localizar e analisar**. Se o cache foi sincronizado anteriormente, a ficha deverá abrir diretamente. Em caso de SKU ausente, sincronizar o catálogo no menu Produtos e anúncios, sem precisar digitar Item ID.
