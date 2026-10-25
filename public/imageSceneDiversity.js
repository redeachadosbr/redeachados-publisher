// Diretor de arte por posição. Garante instruções DIVERSAS até quando
// cada foto for gerada em um chat novo (sem acesso às imagens anteriores).
// Mudam somente câmera, iluminação, cenografia e pessoas; produto real imutável.
const cameras=Object.freeze([
 'Fotografia de produto em 3/4 frontal pela esquerda, câmera na altura do objeto, enquadramento vertical central amplo.',
 'Câmera lateral dinâmica ao nível do uso, plano médio horizontal, assunto principal à direita do quadro.',
 'Enquadramento lateral completo, câmera perpendicular ao produto, distância suficiente para ver suas extremidades e futuras cotas.',
 'Close editorial oblíquo de cima, câmera alta a 45 graus, revelando somente detalhes realmente visíveis do produto.',
 'Plano médio de trás em 3/4 pela direita, perspectiva documental e contexto de uso legível.',
 'Câmera baixa em 3/4 frontal pela direita, composição premium com profundidade e produto em primeiro plano.',
 'Plano geral cinematográfico em diagonal, câmera distante e ambiente mais amplo do que nas imagens anteriores.',
 'Enquadramento técnico quase de cima, camera elevada do lado oposto à foto 04, atenção aos detalhes reais.',
 'Câmera frontal simétrica de exposição, iluminação de estúdio profissional, produto inteiro com espaço reservado para os três selos da loja.'
]);
const people=Object.freeze([
 'Sem personagens ou mãos.',
 'Se o produto exigir pessoa em uso, mostrar um usuário A vestido com roupas de cores frias; não copiar pessoas da referência.',
 'Sem personagens: priorizar visibilidade do produto e margens livres para cotas.',
 'Sem personagens: os detalhes visíveis do produto são o protagonista.',
 'Se houver pessoa necessária, mostrar usuário B diferente do A, com roupa de cores terrosas e enquadramento que não esconda o produto.',
 'Sem personagens: apresentação exclusiva do produto.',
 'Se houver pessoa, mostrar usuário C diferente de A e B, roupa de cores contrastantes, cabelo e aparência diferentes; não repetir o personagem da foto 02.',
 'Quando útil, mostrar um adulto D diferente das pessoas anteriores interagindo apenas de modo compatível com o produto; caso contrário, nenhuma pessoa.',
 'Sem personagens; apenas produto e os selos aprovados para a imagem 09.'
]);
const light=Object.freeze([
 'Luz difusa suave de estúdio, branco quente.',
 'Luz natural clara de manhã, sombras suaves.',
 'Luz neutra homogênea, sem reflexos que escondam partes.',
 'Luz lateral de janela com textura e profundidade.',
 'Luz ensolarada da tarde em contexto realista.',
 'Iluminação arquitetônica controlada com reflexos sutis.',
 'Fim de tarde quente, ângulo amplo e contraste equilibrado.',
 'Luz técnica clara sem sombras que ocultem o produto.',
 'Luz premium uniforme e fundo elegante discreto.'
]);
const places=Object.freeze({
 bicycle:[
  'Garagem residencial moderna bem iluminada, piso claro e parede arquitetônica neutra; bicicleta sozinha.',
  'Calçadão arborizado junto a uma praça aberta, com uma criança A usando capacete claro e roupa azul, em situação tranquila e segura.',
  'Pátio contemporâneo de paredes claras e piso uniforme, sem outras bicicletas, com espaço para as três cotas.',
  'Terraço residencial com jardim vertical e luz lateral, sem pessoas; destacar acabamento visível da bicicleta sem alterar componentes.',
  'Quadra recreativa pavimentada junto a um centro comunitário, com criança B de aparência diferente, capacete amarelo e roupa verde.',
  'Entrada de uma casa moderna com piso de pedra e arquitetura minimalista, bicicleta sozinha, sem parque ao fundo.',
  'Passeio pavimentado de bairro junto a fachadas coloridas, com criança C diferente das demais, capacete escuro e roupa laranja.',
  'Garagem familiar organizada com luz entrando pela porta, adulto D distinto das crianças, somente observando a bicicleta.',
  'Showroom elegante de bicicletas com fundo neutro e iluminação premium, sem personagens nem outras bicicletas em destaque.'
 ],
 kitchen:[
  'Estúdio de produto sobre bancada clara, fundo arquitetônico limpo sem pessoas.',
  'Cozinha residencial contemporânea com luz matinal, usuário A em atividade real compatível com o produto.',
  'Bancada lisa de cozinha minimalista clara sem mãos nem alimentos inventados.',
  'Bancada de pedra ao lado de janela em cozinha diferente, close dos detalhes reais do produto.',
  'Área de refeições compacta de apartamento, usuário B distinto do anterior usando o produto apenas como previsto.',
  'Cenário de exposição elegante de utensílios com fundo bege, sem pessoas.',
  'Sala de refeições contemporânea com mesa posta discretamente, usuário C diferente dos anteriores se o uso for compatível.',
  'Ilha de cozinha limpa vista quase de cima, mãos de adulto D somente se necessário.',
  'Fotografia publicitária em fundo premium neutro, sem pessoas.'
 ],
 home:[
  'Ambiente minimalista claro de exposição com produto em destaque sozinho.',
  'Cômodo residencial real de uso adequado à função do produto, pessoa A se necessária.',
  'Parede lisa com piso uniforme e luz neutra, produto inteiro para medidas.',
  'Interior de apartamento iluminado lateralmente por janela, close real de acabamento.',
  'Segundo cômodo doméstico de uso coerente com a função, pessoa B diferente da foto 02 se útil.',
  'Espaço contemporâneo organizado com pedra e madeira, produto como protagonista sem pessoas.',
  'Ambiente doméstico acolhedor totalmente diferente dos anteriores, pessoa C distinta apenas se natural.',
  'Bancada ou nicho neutro com luz técnica, vista superior para mostrar características comprovadas.',
  'Showroom de decoração premium com fundo limpo, apenas produto e espaço para selos.'
 ],
 tools:[
  'Estúdio profissional claro com produto isolado em bancada lisa.',
  'Oficina doméstica organizada com usuário A em atividade compatível com a ferramenta.',
  'Bancada técnica de trabalho clara, ferramenta inteira em vista lateral sem mãos.',
  'Mesa de trabalho com luz lateral e close do acabamento real da ferramenta.',
  'Área de manutenção residencial diferente da oficina inicial, usuário B com roupas distintas.',
  'Expositor profissional de ferramentas elegante sem pessoas nem ferramentas adicionais aparentes.',
  'Área de trabalho externa coberta, usuário C diferente, sem demonstrar uso perigoso.',
  'Mesa de inspeção técnica limpa em vista superior, sem acessórios não comprovados.',
  'Exposição premium neutra de produto, sem pessoas.'
 ],
 toys:[
  'Estúdio alegre porém limpo, produto sozinho em piso claro.',
  'Sala de brincar residencial iluminada pela manhã, criança A adequada ao produto e supervisionada se necessário.',
  'Piso neutro liso com fundo claro para mostrar o produto inteiro sem personagens.',
  'Cantinho de brincar com tapete liso e luz lateral, detalhe real do produto sem mãos.',
  'Espaço infantil comunitário diferente da sala inicial, criança B de aparência e roupa diferentes, uso apropriado.',
  'Estúdio colorido de apresentação do produto sem personagens.',
  'Quintal doméstico seguro e diferente dos outros cenários, criança C diferente quando adequado ao brinquedo.',
  'Sala familiar organizada vista de cima, adulto D apenas se ajudar a mostrar fato confirmado.',
  'Cenário de showroom infantil discreto com produto sozinho e espaço para três selos.'
 ],
 general:[
  'Estúdio comercial neutro com textura arquitetônica discreta e produto sozinho.',
  'Ambiente real coerente com o uso do produto, usuário A se apropriado.',
  'Superfície lisa neutra com espaço livre ao redor do produto para cotas.',
  'Ambiente claro com janela lateral, close editorial do acabamento real.',
  'Segundo ambiente de uso diferente da foto 02, usuário B se necessário.',
  'Cenário elegante de exposição profissional, produto sozinho.',
  'Terceiro ambiente funcional realmente diferente, usuário C diferente quando relevante.',
  'Mesa ou apoio neutro sob iluminação técnica, visão superior do produto.',
  'Fundo premium de estúdio, produto sozinho com área livre para três selos.'
 ]
});
const normalized=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function imageProductFamily(title=''){
 const t=normalized(title).slice(0,320);
 if(/biciclet|bike infantil|aro\s*(?:12|14|16|20|24|26|29)\b|velocipede|triciclo/.test(t))return 'bicycle';
 if(/cafeteira|panela|travessa|copo|garrafa termica|liquidificador|talher|cozinha|temperos|assador|frigideira|prato|caneca/.test(t))return 'kitchen';
 if(/banheiro|porta shampoo|lixeira|organizador|suporte|tapete|prateleira|decora[cç]ao|cabide|cesto|saboneteira/.test(t))return 'home';
 if(/ferrament|furadeira|parafusadeira|jogo de chaves|alicate|martelo|lixadeira|serra|oficina/.test(t))return 'tools';
 if(/brinquedo|bloco de montar|piscina infantil|boneca|pelucia|jogo infantil|kit educativo/.test(t))return 'toys';
 return 'general';
}
export function imageSceneDirection({slot,title=''}={}){
 const pos=Number(slot);
 if(!Number.isInteger(pos)||pos<1||pos>9)throw Error('Posição de imagem inválida.');
 const family=imageProductFamily(title),i=pos-1;
 return {
  slot:pos,family,environment:places[family][i],camera:cameras[i],
  people:family==='bicycle'&&[2,5,7].includes(pos)?
   [
    '','Criança A com capacete claro e roupa azul; não repetir modelo ou rosto da foto original.',
    '','','Criança B com capacete amarelo e roupa verde; distinta da criança A.',
    '','Criança C com capacete escuro e roupa laranja; diferente das crianças A e B.'
   ][i]:people[i],
  light:light[i]
 };
}
// Hierarquia visual compartilhada pelo ChatGPT e pelo gerador via API.
const premiumCopyRules=Object.freeze([
 'CAPA SEM TEXTO: produto original ocupa aproximadamente 85% a 90% da foto; fundo ambientado sofisticado, limpo e sem tarjas.',
 'USO REAL: no máximo UMA frase curta de 2 a 5 palavras; tipografia pequena e elegante, sem outros blocos.',
 'ESPECIFICAÇÕES: mostrar apenas medidas do PRODUTO comprovadas e, quando autorizado, setas finas junto a ele. Sem peso logístico, aro inferido, tabelas ou lista de características.',
 'BENEFÍCIOS: no máximo UMA frase de 2 a 5 palavras; apresentar vantagens principalmente pela fotografia.',
 'DOR E SOLUÇÃO: no máximo UMA frase de 2 a 5 palavras em canto discreto, sem caixas, listas ou painel comparativo.',
 'PERSUASÃO: no máximo UMA frase de 2 a 5 palavras, texto secundário e produto dominante.',
 'TRANSFORMAÇÃO: no máximo UMA frase de 2 a 5 palavras, sem títulos grandes ou sobreposições.',
 'OBJEÇÕES: no máximo TRÊS microetiquetas de 1 a 3 palavras baseadas em fatos reais, sem perguntas completas ou parágrafos.',
 'CONFIANÇA: somente os três pequenos selos Compra Segura, Entrega Rápida e Atendimento Online em uma linha discreta no rodapé; sem outros textos.'
]);
export function imageScenePrompt({slot,title=''}={}){
 const s=imageSceneDirection({slot,title});
 return [
  'DIVERSIDADE OBRIGATÓRIA — CENA ÚNICA '+String(s.slot).padStart(2,'0')+'/09:',
  'AMBIENTE EXCLUSIVO: '+s.environment,
  'ÂNGULO E ENQUADRAMENTO: '+s.camera,
  'PERSONAGEM: '+s.people,
  'ILUMINAÇÃO: '+s.light,
  'DIREÇÃO DE ARTE PREMIUM: produto é o protagonista, ambientação contemporânea, cores harmoniosas, acabamento de campanha publicitária. Textos sempre ocupam no máximo 10% da foto; tipografia discreta com boa legibilidade. Nunca preencher a imagem com blocos, tarjas, tópicos, emojis ou características empilhadas.',
  'TEXTO PERMITIDO NESTA POSIÇÃO: '+premiumCopyRules[s.slot-1],
  'Imagem comercial sofisticada: manter área de respiro nas bordas, sem sobrepor texto ao produto; não adicionar textos apenas para decorar.',
  'Não reutilize o mesmo fundo, parque, jardim, rua, roupa, pessoa, pose, direção da câmera ou enquadramento das outras imagens desta série.',
  'A FOTO DE REFERÊNCIA serve apenas para preservar o PRODUTO EXATO: mesma cor, peças, formato, marca, adesivos, proporções e acessórios realmente presentes. Não copie o cenário nem a pessoa da referência.',
  'Não inventar componentes, medidas, certificações ou alegações. Se a cena prevista não for compatível com o uso real do produto, adapte apenas o ambiente a outro local apropriado mantendo o ângulo e a distinção visual.',
  'Preserve 1200×1200, produto principal em foco e apresentação comercial realista.'
 ].join('\n');
}
