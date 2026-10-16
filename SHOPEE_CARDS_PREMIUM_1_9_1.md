# Rede Achados BR Shopee Manager 1.9.1 — acabamento profissional compacto

## Pedido do lojista
No print de 16/10/2026, o novo layout por páginas estava operacional, mas os quadros internos pareciam grandes e sem profundidade. Pedido: acabamento mais premium e tridimensional, interações reais, dimensões menores, identidade da **logo azul Rede Achados BR** e laranja Shopee.

## Implementação
- **Logo original azul** enviada pelo usuário (mascote, RA, Rede Achados BR e sacola azul) incorporada como `public/brand-logo.svg` autocontido, com miniatura WebP original embutida, otimizada para sidebar e cartões pequenos. Não depende de URL privada de conversa.
- Aparece na sidebar, cabeçalho, login, destaque do painel inicial e favicon.
- Identificador visual da **integração Shopee** no topbar, com sacola laranja e S, em posição secundária; identidade principal do app continua Rede Achados BR.
- Cores: navy/azul RA, superfícies brancas e laranja Shopee `#EE4D2D` em botões e seleção.
- Painel inicial mais compacto (hero ~198px, KPIs ~122px e atalhos ~138px), em vez de blocos exageradamente grandes e estáticos.
- **Quatro indicadores clicáveis**, usando o roteamento já existente, para configurações e fornecedor; não são apenas decoração.
- Quatro atalhos existentes continuam navegáveis. Todos os oito cartões recebem sombra suave em camadas, bordas claras, detalhe de luz, elevação no hover e **microinclinação máxima ~2°** acompanhando o ponteiro.
- O efeito 3D funciona apenas em dispositivos com mouse e hover; respeita `prefers-reduced-motion`, funciona sem mouse e possui foco visível de teclado. O conteúdo fica normal caso a animação não seja suportada.
- Tabelas, formulários e cards das demais páginas recebem iluminação/sombra homogênea, sem esconder dados, mudar métricas ou efeitos automáticos invasivos.
- Mantém rotas, APIs, autenticação, dados Supabase e todas as funcionalidades do serviço exclusivo **Shopee**. Sem alteração de Mercado Livre.

## Conferência
1. Abrir `/app/inicio` e forçar atualização com Ctrl+F5.
2. Ver logo azul RA no topo da sidebar, avatar no topo e hero; Shopee pequena no cabeçalho.
3. Passar o mouse sobre KPI e atalhos: elevação suave/inclinação leve; clicar: abre setor correto.
4. Verificar navegação pelo teclado (Tab/Enter), celular e opção de movimento reduzido.
5. Navegar por Produtos, Pedidos, Envios, Ads, WeDrop, Financeiro e Configurações sem perder ações.

A versão 1.9.1 trata exclusivamente de refinamento visual e navegação; não promete novos indicadores financeiros ou altera preços.
