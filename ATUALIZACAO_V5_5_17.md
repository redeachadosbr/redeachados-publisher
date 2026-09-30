# V5.5.17 — Notificações visíveis + diagnóstico do catálogo

- Todas as notificações `toast` passam a usar a camada superior do navegador (`popover`) quando disponível, evitando ficarem atrás da tela de Configurações.
- Compatibilidade de fallback: em navegadores sem `popover`, a área de notificações é movida para dentro do diálogo aberto.
- Erros de importação do catálogo agora também aparecem dentro da própria seção **Catálogo Shopee**.
- A mensagem de planilha incompatível explica que é necessário usar **Central do Vendedor > Meus Produtos > Editar em massa > Informações básicas**.
- Uma importação com erro não substitui nem apaga o catálogo já salvo.
- Mantida a persistência de rascunho/vídeo da V5.5.16, inclusive a mesma base IndexedDB para não perder o rascunho durante a atualização.
