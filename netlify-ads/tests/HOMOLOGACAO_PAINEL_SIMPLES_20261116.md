# Homologação — Painel simples e lucro por SKU (16/11/2026)

## Objetivo
Usar o aplicativo somente para: **Painel geral**, **Produtos** e **Alterações**. A análise estratégica dos Ads continua sob responsabilidade do operador.

## O que mudou
- Criado `site/simple-dashboard.js`, sem apagar o módulo antigo.
- Modo simples é padrão. **Modo completo** reabre as funcionalidades anteriores quando necessário.
- A aba Alterações continua registrando capa, título, preço, ROAS alvo, orçamento e impulsão com data e hora de Brasília.
- Novo livro financeiro de períodos por SKU com **receita líquida Shopee**, **custo efetivo WeDrop**, **investimento Ads** e **outras despesas externas**.
- O resultado é receita líquida − custo WeDrop − Ads − despesas externas.
- Dados do livro financeiro usam a coleção `history` existente, com `data.kind = 'simple_finance_v1'`, e por isso usam backup/sincronização Google Drive já existentes. Nenhum endpoint ou segredo novo.
- O histórico legado não exclui nem exporta registros financeiros por engano.
- Não executa alterações em campanhas Shopee.

## Regras de segurança financeira
1. Somente lançamentos marcados como **conferidos manualmente** entram no painel financeiro.
2. Produto sem lançamento ou com parte do período não conferida aparece **Pendente**/**Parcial**, nunca lucro zero.
3. Não pode lançar períodos sobrepostos para o mesmo SKU, evitando dupla contagem.
4. Filtros mensais/7 dias/30 dias usam **lançamentos completos contidos na janela**, sem rateio.
5. Pedidos multissku não têm lucro automaticamente rateado; o operador precisa fornecer valores conciliados.
6. `Receita líquida Shopee` já inclui tarifas e descontos retidos; não descontá-los novamente.
7. Os dados são **informados/conferidos pelo usuário**, não auditados automaticamente pela Shopee.

## Testes locais de código
- Validação de sintaxe: `simple-dashboard.js` e script inline principal do `index.html`: passaram.
- Arquivos originais de catálogo, sincronização, finanças e histórico: preservados.
- Mudanças estão somente na branch `feat/ads-painel-simples-lucro-historico-20261116`. **Não publicado**.

## Checklist manual antes de publicar
- [ ] Fazer backup JSON no app atual e confirmar arquivo do Google Drive atualizado.
- [ ] Em ambiente de teste, abrir modo simples e verificar 3 abas.
- [ ] Criar dois lançamentos não sobrepostos do mesmo SKU; verificar soma.
- [ ] Tentar salvar lançamento sobreposto; deve bloquear.
- [ ] Salvar lançamento sem conferência; deve ficar pendente, fora do lucro apurado.
- [ ] Corrigir e excluir lançamento; confirmar alteração após atualizar a página.
- [ ] Verificar em outro navegador se o Google Drive sincronizou.
- [ ] Corrigir SKU e verificar se histórico financeiro acompanhou a mudança.
- [ ] Clicar em apagar análises antigas no modo completo e confirmar que os lançamentos financeiros permanecem.
- [ ] Verificar console e integração Netlify Functions em ambiente de teste.

## Limitação intencional
A apuração nova recebe valores financeiros manualmente, incluindo o gasto Ads da mesma janela. Ainda não importa automaticamente repasses completos por pedido ou gasto Ads para alimentar o livro financeiro. Isso evita apresentar como lucro real dados incompletos.

## Publicação
Não mesclar nem trocar a branch do Netlify até concluir o checklist e o ciclo de créditos/deploy permitir testes.
