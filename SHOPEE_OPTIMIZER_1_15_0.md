# Shopee Manager 1.15.0 — execução das alterações revisadas

Continuação da v1.14.8 exclusivamente na branch `shopee-service` e no serviço Render `redeachados-shopee`. Preserva a integração financeira de publicidade e carteira. Não altera o aplicativo Mercado Livre.

## Problema corrigido

`checkedWorkflowAudit` carregava `cfg`, mas não o devolvia à pré-execução. A leitura seguinte falhava como configuração ausente mesmo com a conexão presente. Um teste HTTP autenticado com chamadas externas simuladas cobre esta regressão.

## Operação

1. Localizar a SKU exata e carregar a auditoria.
2. Importar vídeo MP4/MOV/WebM (10–60 segundos, até 30 MB). O servidor valida com ffprobe e converte quando necessário. O arquivo permanece privado, vinculado à loja/item/modelo/SKU.
3. Importar as nove imagens aprovadas (JPG/PNG 1200 × 1200, até 10 MB cada), revisar título/descrição, selecionar atributos oficiais com fonte e confirmar os dados fiscais por SKU.
4. Registrar a revisão de cada etapa desejada. A aprovação das mídias fica vinculada aos hashes dos arquivos.
5. Conferir a prévia atual/proposta, marcar a autorização e digitar `EXECUTAR SKU`. Apenas essa ação autenticada inicia as alterações.
6. Acompanhar a fila, upload, processamento e conferência. O progresso é persistido; uma reinicialização retoma a etapa salva. Em um serviço que esteja suspenso, a retomada depende de sua reativação.

O executor envia imagens e vídeo antes de atualizar o anúncio-pai. Campos do anúncio-pai afetam todas as suas variações. Antes da escrita, verifica novamente a identidade e possíveis alterações desde a prévia. Depois da escrita, lê o anúncio e compara os campos e as mídias esperados.

Em resultado incerto, não repete `update_item` automaticamente. O botão **Conferir resultado na Shopee** faz nova leitura. Uma nova preparação só é liberada após confirmação dos valores anteriores; atualização parcial exige conferência do anúncio.

## Persistência e limites

- Migrações aplicadas: `20261017143626_shopee_optimizer_durable_execution_lease` e `20261017144212_shopee_optimizer_prepared_images`.
- Tabelas privadas com RLS, sem acesso anônimo; bucket de imagens privado. Tokens/segredos não são incluídos no plano.
- Bloqueio por anúncio-pai impede execuções concorrentes de suas variações. Intenção de escrita é registrada antes da chamada externa.
- Preços, estoque, campanhas, categoria, GTIN e estrutura das variações são preservados por este executor.
- A geração automática das nove imagens, a pesquisa automática de vídeos e a obtenção de informações técnicas/fiscais do fornecedor ainda dependem de integrações e fontes adicionais. Esta versão executa conteúdo e mídias preparados e revisados; não inventa dados do produto.
- `99` é o código CST PIS/COFINS informado no histórico, não uma alíquota de 99%.
- Publicação real de mídia depende de a conta Shopee conceder os endpoints de Media Space e Product. Os testes locais usam respostas simuladas e não provam autorização em produção.

## Validação

`npm run check` e `npm test`: inclui regressão HTTP, assinatura de mídia pública, upload em partes de 4 MiB, transcodificação, leitura após escrita, retomada sem repetir atualização, arquivo divergente, anúncio alterado, seleção de atributos e confirmação fiscal. A conversão WebM/MP4 usa ffmpeg real no teste quando disponível; Docker instala ffmpeg.

Nenhum anúncio real foi alterado durante os testes de desenvolvimento.
