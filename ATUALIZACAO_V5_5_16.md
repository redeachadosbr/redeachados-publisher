# V5.5.16 — Rascunho persistente + reconexão TikTok

## Correção principal
- SKU, vídeo, textos, legendas e opções ficam salvos automaticamente enquanto a publicação está em andamento.
- Atualizar a página ou sair e voltar não deve apagar a publicação atual.
- Vídeo manual é guardado no IndexedDB; vídeo WeDrop é restaurado pelo ID remoto.

## TikTok
- A autenticação continua abrindo em outra aba.
- Ao terminar a autorização, a aba de retorno envia um evento para a aba original e tenta fechar automaticamente.
- A aba original atualiza o status do TikTok sem apagar ou recarregar a publicação.
- O foco da janela continua como fallback para conferir a conexão.

## Regra de limpeza
- Enviar ao TikTok NÃO limpa mais o formulário.
- Uma nova busca com SKU diferente inicia um novo rascunho e limpa a publicação anterior.
- O novo botão **Limpar publicação** permite zerar manualmente com confirmação.

## Compatibilidade
- Mantidos Instagram Reels, Stories, Direct automático, Meta Ads, Supabase, catálogo e WeDrop.
