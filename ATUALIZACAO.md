# V5.5.19 — Compatibilidade de vídeo mais rígida

## Corrigido
- A busca automática não considera mais consultas amplas demais como suficientes para sugerir qualquer vídeo.
- Consultas genéricas como “mini” agora são tratadas como insuficientes e pedem refinamento.
- O ranking penaliza vídeos de famílias incompatíveis com o produto (ex.: bateria/tambores x carro/bike/quadriciclo).
- Para consultas com várias palavras específicas, o vídeo agora precisa compartilhar os termos principais do produto para aparecer como candidato.

## Resultado esperado
- SKU/produto de **mini bateria** não deve mais sugerir **mini carro**, **bike** ou similares como melhores opções.
- Quando a busca estiver ampla demais, o Publisher mostra a orientação certa em vez de sugerir o vídeo errado.
