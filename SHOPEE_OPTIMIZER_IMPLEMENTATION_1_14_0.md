# Shopee — Otimização de Anúncios 1.14.0 (fase 1)

## Escopo implementado
- Menu lateral próprio `/app/otimizacao`.
- Busca exata de SKU em `shopee_catalog_items` e `shopee_catalog_models`, com confirmação de Item ID.
- Auditoria **read-only** de `v2.product.get_item_base_info`, `v2.product.get_attribute_tree` para a categoria real e `v2.product.get_model_list` quando aplicável.
- Lista de atributos com `attribute_id`, `mandatory`, `attribute_info.input_type`, `format_type`, unidades permitidas, opções/value_ids disponíveis e valor atual; apontamentos específicos como 0 mAh, consumo 0 W, dimensões em texto, tipo de plugue a confirmar.
- Prompt de imagens e orientações fiscais salvos permanentemente por `shop_id` no Supabase, sem guardar credenciais, fotos ou vídeos.
- Resumo visual dos atributos obrigatórios ausentes, avisos para conferir, imagens atuais e status de vídeo sem fingir que a API comprovou a ausência.
- Passos futuros explícitos e bloqueados até que estejam prontos.

## Regras obrigatórias para a fase 2
1. Associar Item ID/SKU/model_id exatos; não modificar anúncio se SKU mudou, se nome diverge ou se há variação ambígua.
2. Guardar snapshot de mídia e atributos originais e permitir restaurar; gerar **nove** imagens via provedor de geração com API autorizada, após o proprietário colar o prompt completo. ChatGPT Plus isoladamente não fornece uma credencial de API.
3. Revisar as imagens, dimensões apenas de fabricante, mesma variante da foto principal; enviar mídia para Shopee e aguardar identificação/checagem das nove. Só então substituir imagens do anúncio. Respeitar limites por categoria.
4. Vídeo: detectar vídeo atual de forma confiável; aceitar upload MP4 manual, integração de fonte autorizada e busca externa licenciada; checar status final de processamento. MarketPro depende de conector e permissão; não é prova de que vídeo está liberado para republicação.
5. SEO: título de até **120 caracteres**, dois emojis quando aceitos; obedecer restrições efetivas da Shopee e priorizar palavras-chave comprovadas. Sem inventar volume de busca.
6. Categoria: consultar a vigente e recomendar mudança apenas com evidência; preservar EAN/GTIN verdadeiro (não inventar EAN).
7. Ficha técnica: cruzar esquema Shopee com **evidências WeDrop/fabricante**, mandar `attribute_id` + `value_id`/unidade válidos. **NÃO** converter "sem informação" em "Não aplicável" se a opção não é aceita; obrigatórios sem evidência precisam de revisão humana. Preservar atributos técnicos existentes que não podem ser validados.
8. Descrição: entrada curta, benefícios, características, por que comprar e CTA, com emojis legíveis. Toda afirmação precisa de suporte técnico.
9. Variações: cor, tamanho, imagens e vínculo `model_id` sem trocar fotos de modelos ou modificar estoque/preço.
10. Fiscal: NCM, CEST, origem, CFOP, CSOSN, unidade e alíquotas só conforme natureza fiscal confirmada, sem herdar valores arbitrários entre produtos.
11. Mostrar diff antes/depois; exigir aprovação do lote; executar cada chamada via API oficial e reler `get_item_base_info`/modelos ao final. Não desfazer edição de terceiros e respeitar campanhas que bloqueiam campos.
12. Retentativas limitadas, logs de erro por etapa, reprocessamento de SKU, sem atualização de preço/estoque automaticamente.

## Limitações desta versão
**Nenhum envio de imagem, vídeo, atualização de título, descrição, atributos, fiscal, categoria ou variação foi implementado nesta fase**. O módulo mostra somente dados lidos, oferece busca exata e salva regras. O feed WeDrop armazenado atualmente contempla custos por SKU, não um catálogo completo e verificado de medidas/bateria/GTIN, portanto falta fonte técnica para uma otimização 100% automática. Não fazer writes silenciosos para fingir conclusão.
