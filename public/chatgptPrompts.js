// Montagem local dos roteiros ChatGPT por SKU. Sem chave API e sem conexão a contas pessoais.
import {confirmedProductDimensionsFromWeDrop} from './productDimensions.js';
// Cenas com enquadramentos e benefícios distintos; não repetir a fotografia em outro fundo.
// As nove instruções autorizadas pelo vendedor — NÃO acrescentar texto,
// SKU, informações de catálogo, cabeçalho, notas, outro prompt ou rodapé.
// O formato 1200 x 1200 e os fatos WeDrop são tratados pelo Manager,
// fora do campo de mensagem do ChatGPT.
export const CHATGPT_IMAGE_SCENES=Object.freeze([
 {label:"01 · Capa",guide:"Imagem 01 — Capa: produto original ocupando aproximadamente 85% a 90% da imagem, fundo limpo e apresentação profissional. imagem com fundo ambientado"},
 {label:"02 · Uso real",guide:"Imagem 02 — Uso real: mostrar o produto em um ambiente cotidiano de utilização, com composição diferente da capa. imagem com fundo ambientado. FRASES CURTAS DE CONVERSÃO"},
 {label:"03 · Especificações",guide:"Imagem 03 — Especificações: apresentar SOMENTE as dimensões reais do produto ao lado dele, com setas discretas e fundo ambientado. Sem títulos, subtítulos, selos ou características adicionais."},
 {label:"04 · Benefícios",guide:"Imagem 04 — Benefícios: demonstrar visualmente as principais vantagens do produto. imagem com fundo ambientado. FRASES CURTAS DE BENEFICIO"},
 {label:"05 · Dor e solução",guide:"Imagem 05 — Dor e solução: representar uma necessidade do comprador e como o produto atende a essa necessidade. imagem com fundo ambientado FRASE CURTA"},
 {label:"06 · Persuasão",guide:"Imagem 06 — Persuasão: destacar um diferencial real com apresentação comercial. imagem com fundo ambientado. FRASE DE CONVERSÃO"},
 {label:"07 · Transformação",guide:"Imagem 07 — Transformação: demonstrar a experiência proporcionada pelo produto. imagem com fundo ambientado. FRASE DE CONVERSÃO"},
 {label:"08 · Quebra de objeções",guide:"Imagem 08 — Quebra de objeções: responder visualmente às três principais dúvidas do comprador, sem poluir a composição. imagem com fundo ambientado. FRASES CURTAS"},
 {label:"09 · Mockup e confiança",guide:"Imagem 09 — Mockup e confiança: apresentar o produto em cenário profissional com os três selos da loja: Compra Segura, Entrega Rápida e Atendimento Online. imagem com fundo ambientado"}
]);
export function createChatGptPrompts({imageUrls=[],supplierSourceText=''}={}){
 const original=(Array.isArray(imageUrls)?imageUrls:[]).find(x=>/^https:\/\//i.test(String(x||'')))||'';
 const scenes=CHATGPT_IMAGE_SCENES;
 const prompts=scenes.map(({guide})=>guide);
 const dims=confirmedProductDimensionsFromWeDrop(supplierSourceText);
 // A imagem gerada no ChatGPT deve ser uma BASE limpa: o Manager insere
 // SOMENTE os números exatos da WeDrop na imagem final. Não confiar em
 // letras/números que o modelo possa inventar, nem usar peso da caixa.
 prompts[2]=[
  scenes[2].guide,
  dims?('MEDIDAS DO PRODUTO CONFIRMADAS NO TEXTO WEDROP DA SKU: '+
   dims.measurements.map(x=>x.label+': '+x.value).join('; ')+'.'):
   'NÃO HÁ MEDIDAS DO PRODUTO CONFIRMADAS NO TEXTO WEDROP DESTA SKU.',
  'IMPORTANTE: gere somente a fotografia original fiel do produto, com espaço nas bordas para as setas.'+
  ' NÃO escreva nenhuma palavra, número, unidade, título, etiqueta, selo ou medida na foto gerada.'+
  ' O Manager adicionará as setas e as medidas verificadas DEPOIS da geração.'+
  ' NUNCA estimar altura do selim, altura do guidão, tamanho/diâmetro da roda, largura ou comprimento por aparência.'+
  ' Não copiar dimensões de embalagem, frete ou campos isolados sem a indicação de dimensões do produto.'
 ].join(' ');
 return {batch:prompts[0],prompts,scenes,original,confirmedDimensions:dims};
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
