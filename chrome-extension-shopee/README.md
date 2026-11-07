# Ponte Chrome Rede Achados BR — 1.2.8

Atualização obrigatória: baixe o ZIP no menu Curvas A/B, extraia e carregue
novamente a pasta redeachados-shopee-chrome em chrome://extensions.

Versão 1.2.8: lê quantidade e Vendido/Mês nos campos renderizados de cada
cartão, inclusive quando innerText omite o rodapé ou junta nota e vendas.
Normaliza acentos, espaços e separadores Unicode. A importação aceita o
número encostado no rótulo (866Vendido/Mês), sem descartar a prova mensal.
Preserva evidências nas releituras e restaura páginas parcialmente carregadas.
Falha de captura é informada como pendência, nunca como prova de que a
Shopee não exibe o indicador. A versão anterior não inicia novas pesquisas.
Depois de substituir os arquivos, clique em Recarregar na extensão e
recarregue a página Curvas A e B antes de refazer a pesquisa.

A pesquisa considera todas as SKUs da categoria WeDrop, inclusive não
publicadas na loja. Uma busca com anúncios não mensais, página sem cartões ou
falha isolada não interrompe a categoria: registra o item pendente e avança.
Preserva anúncios parcialmente coletados. A pesquisa continua automaticamente
até atingir a quantidade de SKUs solicitadas, percorrer o catálogo ou haver bloqueio real.

A Shopee Em Destaque é aberta em uma única janela auxiliar reutilizada.
Quando necessário, a própria janela é restaurada para leitura visual.
CAPTCHA, bloqueio real ou verificação de acesso interrompem a pesquisa, sem
contornar proteção. A classificação A/B (900+ ou 700–899 vendas em 30 dias)
exige vendas/mês explícitas de 2 a 5 lojas; médias de preço usam 2 a 10 anúncios distintos do mesmo produto, inclusive da mesma loja.
Reconhece indicadores como "1mil+ Vendido/Mês" e "952 Vendido/Mês".
Sem evidência mensal não há classificação, e nenhum anúncio é criado.

A versão 1.2.4 aguarda o rótulo Vendido/Mês dos cartões carregados,
procura o indicador no ancestral do MESMO anúncio sem misturar cartões,
e impede comparar utensílio manual com processador elétrico.

Versão 1.2.5: distingue rótulos mensais visíveis de volumes vinculados,
repete uma leitura na mesma janela para recuperar a vitrine e informa a
causa quando uma consulta não traz dados mensais. Não estima vendas.

Versão 1.2.6: a extensão percorre a vitrine na mesma aba e reúne preços
e vendas mensais dos cartões carregados por rolagem, inclusive de linhas
que não estavam no DOM ao carregar. Se a janela minimizada apresentar
menos de oito cartões ou menos de dois rótulos mensais, restaura
automaticamente a mesma janela sem foco, recarrega e agrega os anúncios
por shopId:itemId, preservando o dado mensal mais completo. Não usa números
inventados nem contorna CAPTCHA.

Versão 1.2.7: a pesquisa maximiza a amostra de 2 a 10 anúncios
comparáveis e não encerra só por localizar duas vendas mensais. Percorre
até 9 páginas da mesma janela quando os resultados forem insuficientes,
acumula cartões sem perder preços quando uma releitura encontra o selo
Vendido/Mês e prioriza anúncios semelhantes para o limite de importação.
Cada nova pesquisa começa com preços e evidências limpos; captura e análise
continuam separadas e não inventam volumes.

