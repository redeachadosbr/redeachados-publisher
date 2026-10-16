# Rede Achados BR — Shopee Manager 1.9.0

## Mudança de arquitetura visual
A interface anterior concentrava operação e financeiro em abas horizontais e páginas muito longas. A versão 1.9.0 transforma o aplicativo em um **workspace SaaS com menu lateral fixo e oito páginas lógicas com URL própria**. O backend, autenticação, APIs Shopee, Supabase e dados existentes permanecem inalterados.

### Páginas e endereços
- `/app/inicio` — Painel inicial, estado da loja e atalhos operacionais
- `/app/produtos` — Produtos, pesquisa, variações, estoque, sincronização e CSV
- `/app/pedidos` — Pedidos e vendas
- `/app/envios` — Monitor de prazos, prioridade, avisos e notificações do navegador
- `/app/ads` — Shopee Ads: campanhas ativas/pausadas, impressões, cliques, CTR, GMV, ROAS/ACOS
- `/app/wedrop` — Fornecedor: CSV e custos persistidos, variações, vínculos SKU
- `/app/financeiro` — Financeiro: consulta de pedidos concluídos e repasses Shopee; custos reais; tabela por SKU. Resultado antes de Ads não é lucro líquido final.
- `/app/configuracoes` — Conexão Shopee, renovar token, testar loja, diagnosticar assinatura e diagnóstico técnico

### UX
- Sidebar escura com marca RA, grupos por área, item ativo e contador de alertas.
- Topbar fixa com seção ativa, estado da API e saída de sessão.
- Página inicial com KPIs de autenticação e atalhos de ação.
- Layout responsivo: no celular/tablet, a sidebar abre via botão de menu; fechar tocando no fundo ou tecla Escape.
- URLs podem ser copiadas/recarregadas. Navegação via `history.pushState`, suporte a Voltar/Avançar; cada rota conhecida serve o mesmo shell autenticado pelas APIs. A interface é SPA mantendo DOM das seções: tarefas em andamento não são desmontadas.
- Todos os IDs da aplicação original foram preservados para que eventos e estados de produtos, Ads, finance, WeDrop e monitor não percam suas ligações.
- Nenhum dado financeiro, SKU, Ads ou produto é alterado por esta migração visual. Nenhuma mudança Mercado Livre.
- `Ctrl+F5` pode ajudar usuários com CSS/JS armazenado em cache, e URLs de assets incluem `v=1.9.0`.

### Limites
- Páginas são rotas lógicas independentes dentro do mesmo frontend (navegação client-side), não aplicativos instaláveis separados nem microserviços independentes.
- Indicadores financeiros seguem reais e parciais conforme permissões Payment e atribuição de Ads, sem inferir lucro líquido.
- O menu e os atalhos não executam alterações de anúncios; só abrem os setores.

## QA
`npm run check && npm test`

Testar desktop e celular:
1. Acessar `/app/inicio`; confirmar sidebar e métricas.
2. Clique em Financeiro; o formulário `Consultar vendas e repasses reais` deve estar na página própria.
3. WeDrop deve mostrar catálogo salvo e histórico sem pedir upload novamente.
4. No monitor, testar avisos e contador sem afetar as outras páginas.
5. Abrir `/app/ads` por URL direta, atualizar, Voltar e Avançar.
6. Em celular, abrir menu, selecionar página e fechar via Escape/fundo.
7. Conferir Configurações: Testar loja, Renovar token, Diagnosticar assinatura.
