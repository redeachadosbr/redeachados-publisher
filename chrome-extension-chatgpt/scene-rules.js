/* Rede Achados BR v1.0.63 — cada chamada deve conter SOMENTE a cena atual. */
(function(root){
 'use strict';
 const roles=Object.freeze([
  'Imagem 01 — Capa: foto ambientada clean, produto real ocupando 85% a 90% da imagem. Sem texto, títulos, tarjas ou selos; iluminação profissional e fundo minimalista. imagem com fundo ambientado',
  'Imagem 02 — Uso real: cena cotidiana em ambiente diferente da capa, com produto em destaque. No máximo UMA frase de conversão de 2 a 5 palavras, discreta, pequena e com bastante espaço vazio. Sem listas. imagem com fundo ambientado',
  'Imagem 03 — Especificações: foto ambientada do produto inteiro, vista lateral, composição limpa e margens livres. SEM texto, setas, números, medidas, aro, peso, selos ou outros dados na geração: o Shopee Manager adicionará somente dimensões WeDrop confirmadas depois. imagem com fundo ambientado',
  'Imagem 04 — Benefícios: cena ambientada com produto em destaque. Detalhar 2 ou 3 benefícios REAIS e distintos com microfrases naturais de 3 a 7 palavras cada, fonte bonita, moderna, pequena e bem distribuída nas margens livres. Texto total no máximo 10% da foto, sem tarjas, listas ou cobrir o produto. imagem com fundo ambientado',
  'Imagem 05 — Dor e solução: foto do produto INTEIRO DE CIMA, câmera superior perpendicular a 90 graus (top-down / flat lay), com ambiente real coerente. Uma frase curta de 4 a 8 palavras explicando a solução prática que o produto oferece, tipografia sutil na margem sem cobrir o objeto. Não inventar capacidades. imagem com fundo ambientado',
  'Imagem 06 — Persuasão: fotografia premium de ZOOM MACRO em UM ou DOIS detalhes reais do produto, como textura, encaixe, acabamento ou estrutura comprovada, mantendo parte suficiente do produto reconhecível em uma cena única sem mosaico. Adicionar 1 ou 2 microdescrições de 3 a 7 palavras cada próximas aos detalhes, pequenas e elegantes, texto total <=10%, sem inventar materiais. imagem com fundo ambientado',
  'Imagem 07 — Transformação: experiência real com produto fiel e cenário diferente. No máximo UMA frase curta de 2 a 5 palavras, baixa interferência visual, sem títulos ou blocos. imagem com fundo ambientado',
  'Imagem 08 — Quebra de objeções: imagem ambientada elegante focada no produto. Criar DUAS perguntas reais do comprador e respostas curtas comprovadas, até três pares somente quando houver evidência e espaço. Pares discretos Pergunta? / Resposta em tipografia fina nas margens, texto no máximo 10% da foto, sem painéis e sem esconder o produto. imagem com fundo ambientado',
  'Imagem 09 — Mockup e confiança: cenário premium novo, produto como protagonista. Somente três pequenos selos discretos alinhados no rodapé: Compra Segura, Entrega Rápida e Atendimento Online. Sem outros textos ou tarjas. imagem com fundo ambientado.'
 ]);
 // Os prompts das posições 03–08 podem chegar completos e personalizados
 // pelo Manager desta loja, mas precisam conter os marcadores da cena exata.
 // Instruções genéricas/antigas continuam substituídas pelo roteiro local.
 function validatedManagerPrompt(prompt,slot){
  const source=String(prompt||'').trim();
  if(slot<3||slot>8||source.length<320||source.length>19000)return null;
  const tag='DIVERSIDADE OBRIGATÓRIA — CENA ÚNICA '+String(slot).padStart(2,'0')+'/09:';
  if(!source.includes(tag)||
     !source.includes('TEXTO PERMITIDO NESTA POSIÇÃO:')||
     !source.includes('A FOTO DE REFERÊNCIA serve apenas para preservar o PRODUTO EXATO'))return null;
  const scenes=[...source.matchAll(/DIVERSIDADE OBRIGATÓRIA — CENA ÚNICA\s+([0-9]{2}\/09):/g)];
  if(scenes.length!==1||scenes[0][1]!==String(slot).padStart(2,'0')+'/09')return null;
  if(slot===3){
   if(!source.includes('FOTOGRAFIA BASE SEM QUALQUER TEXTO'))return null;
  }else if(!source.includes('REGRA ATUAL DA REDE ACHADOS BR'))return null;
  return source;
 }
 function enhance({sku,slot,prompt='',imageMode='',kitMode=false}){
  const index=Number(slot)-1;
  if(!Number.isInteger(index)||index<0||index>=9)throw Error('Posição comercial inválida.');
  // Modo KIT: o prompt exclusivo de cada posição vem integralmente do Prompt Mestre
  // do Shopee Manager. Jamais substituir por cena de produto individual.
  if(kitMode){
   const original=String(prompt||'').trim();
   if(imageMode||original.length<100||!original.includes('SKU ')||
      !original.includes('JUNTOS na MESMA CENA'))
    throw Error('Prompt Mestre do kit incompleto ou misturado com edição individual.');
   return original;
  }
  // Modo NORMAL: priorizar o prompt por SKU e por cena APROVADO pelo Manager,
  // para que benefícios/detalhes e perguntas usem fatos da ficha correta.
  // Sem marcadores confiáveis, usar o roteiro de fallback da extensão.
  if(!imageMode)return validatedManagerPrompt(prompt,Number(slot))||roles[index];
  // Comandos de edição solicitados explicitamente são fluxos independentes.
  const source=String(prompt||'').trim();
  if(imageMode==='custom'&&source)return source;
  if(imageMode==='white-bg')return /BRANCO PURO/.test(source)&&/NÃO usar fundo ambientado/.test(source)?source:'Editar a foto anexada: remover fundo atual e usar BRANCO PURO (#FFFFFF). Preservar produto e peças. NÃO usar fundo ambientado.';
  if(imageMode==='improve')return source.includes('ângulo de câmera novo')||source.includes('ângulo de câmera claramente diferente')?source:source+'\nEditar foto atual com ângulo de câmera novo, iluminação e apresentação sofisticada, preservando o produto real.';
  return source||roles[index];
 }
 const sequence=roles.map((role,i)=>String(i+1).padStart(2,'0')+'/09 '+role).join('\n');
 root.BridgeSceneRules=Object.freeze({enhance,roles,sequence});
 if(typeof module!=='undefined'&&module.exports)module.exports=root.BridgeSceneRules;
})(globalThis);
