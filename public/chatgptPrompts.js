// Montagem local dos roteiros ChatGPT por SKU. Sem chave API e sem conexão a contas pessoais.
// Cenas com enquadramentos e benefícios distintos; não repetir a fotografia em outro fundo.
export const CHATGPT_IMAGE_SCENES=Object.freeze([
 {label:"01 · Capa",guide:"Imagem 01 — Capa: produto original ocupando aproximadamente 85% a 90% da imagem, fundo limpo e apresentação profissional. imagem com fundo ambientado"},
 {label:"02 · Uso real",guide:"Imagem 02 — Uso real: mostrar o produto em um ambiente cotidiano de utilização, com composição diferente da capa. imagem com fundo ambientado"},
 {label:"03 · Especificações",guide:"Imagem 03 — Especificações: apresentar as dimensões e características reais confirmadas. imagem com fundo ambientado"},
 {label:"04 · Benefícios",guide:"Imagem 04 — Benefícios: demonstrar visualmente as principais vantagens do produto. imagem com fundo ambientado"},
 {label:"05 · Dor e solução",guide:"Imagem 05 — Dor e solução: representar uma necessidade do comprador e como o produto atende a essa necessidade. imagem com fundo ambientado"},
 {label:"06 · Persuasão",guide:"Imagem 06 — Persuasão: destacar um diferencial real com apresentação comercial. imagem com fundo ambientado"},
 {label:"07 · Transformação",guide:"Imagem 07 — Transformação: demonstrar a experiência proporcionada pelo produto. imagem com fundo ambientado"},
 {label:"08 · Quebra de objeções",guide:"Imagem 08 — Quebra de objeções: responder visualmente às três principais dúvidas do comprador, sem poluir a composição. imagem com fundo ambientado"},
 {label:"09 · Mockup e confiança",guide:"Imagem 09 — Mockup e confiança: apresentar o produto em cenário profissional com os três selos da loja: Compra Segura, Entrega Rápida e Atendimento Online. imagem com fundo ambientado"},
]);
function sceneSelection(){ return CHATGPT_IMAGE_SCENES; }
const asText=(value,max=10000)=>String(value||'').normalize('NFC').slice(0,max);
// Cada elemento de CHATGPT_IMAGE_SCENES é um comando AUTÔNOMO.
// Não enviar histórico, logs, dados de catálogo irrelevantes, regras duplicadas
// ou as outras oito cenas para o ChatGPT.
export function createChatGptPrompts({sku='',title='',imageNotes={},imagePrompts={},imageUrls=[]}={}){
 const original=(Array.isArray(imageUrls)?imageUrls:[]).find(x=>/^https:\/\//i.test(String(x||'')))||'';
 const scenes=CHATGPT_IMAGE_SCENES;
 const prompts=scenes.map((scene,index)=>{
  const slot=String(index+1).padStart(2,'0');
  const note=asText(imageNotes?.[index+1],500).trim();
  const compact=[
   'REDE ACHADOS BR — SKU '+asText(sku,120)+' | IMAGEM '+slot+'/09',
   'Produto: '+asText(title,260)+'.',
   'Use a foto original anexada como referência obrigatória. Se não estiver anexada, não gere.',
   'Preserve exatamente o mesmo produto, suas cores, geometria e peças reais. Não invente acessórios, funções ou embalagem.',
   scene.guide,
   ...(index===2?[
    'ATENÇÃO: esta é a base fotográfica de uma FICHA DE ESPECIFICAÇÕES, NÃO uma segunda foto de uso real.',
    'Fotografe apenas o produto real em destaque na parte superior e central (aprox. 75% do quadro), com fundo ambientado discreto e área inferior livre para a ficha técnica que o Shopee Manager acrescentará depois da geração.',
    'Não adicione pessoas, brinquedos extras, gráficos, números ou textos na FOTO BASE. O Manager imprimirá as dimensões e o material verificados na imagem final.',
    String(sku)==='303448'?'Mostrar exatamente 1 caminhão dinossauro verde e 3 mini carrinhos, sem uma quarta miniatura.':'Não adicionar peças além das comprovadas na foto original.'
   ]:[]),
   index===8?'Somente os três selos solicitados, sem outros textos ou preços.':index===2
    ?'Os textos técnicos e as medidas serão aplicados AUTOMATICAMENTE no arquivo final pelo Manager; preservar espaço para eles.'
    :'Sem títulos, subtítulos, frases ou preços.',
   'Uma única imagem quadrada, fotorrealista, composição para 1200 × 1200 pixels. Não crie outras posições.'
  ];
  if(note)compact.push('Alteração solicitada para esta imagem: '+note);
  return compact.join('\n');
 });
 // Apenas o prompt COMPLETO que o vendedor salvou explicitamente pode
 // substituir a orientação padrão de uma posição específica.
 for(let i=0;i<9;i++){
  const custom=asText(imagePrompts?.[i+1],16000).trim();
  if(custom)prompts[i]=custom;
 }
 return {batch:prompts[0]||'',prompts,scenes,original};
}
export function assignChatGptFiles(files,{startSlot=1}={}){
 const incoming=Array.from(files||[]);
 if(incoming.length===0||incoming.length>9)throw Error('Selecione de 1 a 9 arquivos de imagem.');
 if(!Number.isInteger(Number(startSlot))||Number(startSlot)<1||Number(startSlot)>9)throw Error('Posição inicial inválida.');
 const parsed=incoming.map(file=>{
  const name=String(file.name||'');
  const match=name.match(/^(?:imagem|image|foto|chatgpt[-_ ]?image)?[-_ ]?0?([1-9])(?:[-_. ()]|$)/i);
  return {file,slot:match?Number(match[1]):null};
 });
 const found=parsed.filter(x=>x.slot!==null);
 if(found.length===incoming.length){
  const numbers=parsed.map(x=>x.slot);
  if(new Set(numbers).size!==numbers.length)throw Error('Há arquivos com posições repetidas. Renomeie para 01.png até 09.png.');
  return parsed.sort((a,b)=>a.slot-b.slot);
 }
 if(found.length>0)throw Error('Apenas parte dos arquivos tem numeração. Renomeie todos para 01.png, 02.png... ou remova a numeração de todos.');
 if(Number(startSlot)+incoming.length-1>9)throw Error('Os arquivos ultrapassam a posição 09.');
 return incoming.map((file,i)=>({file,slot:Number(startSlot)+i}));
}
