// Montagem local dos roteiros ChatGPT por SKU. Sem chave API e sem conexão a contas pessoais.
import {confirmedProductDimensionsFromWeDrop,confirmedProductSideFactsFromWeDrop} from './productDimensions.js';
import {imageScenePrompt} from './imageSceneDiversity.js';
// Cenas com enquadramentos e benefícios distintos; não repetir a fotografia em outro fundo.
// As nove instruções autorizadas pelo vendedor — NÃO acrescentar texto,
// SKU, informações de catálogo, cabeçalho, notas, outro prompt ou rodapé.
// O formato 1200 x 1200 e os fatos WeDrop são tratados pelo Manager,
// fora do campo de mensagem do ChatGPT.
export const CHATGPT_IMAGE_SCENES=Object.freeze([
 {label:"01 · Capa",guide:"Imagem 01 — Capa: produto original ocupando aproximadamente 85% a 90% da imagem, fundo limpo e apresentação profissional. imagem com fundo ambientado"},
 {label:"02 · Uso real",guide:"Imagem 02 — Uso real: mostrar o produto em um ambiente cotidiano de utilização, com composição diferente da capa. imagem com fundo ambientado. FRASES CURTAS DE CONVERSÃO"},
 {label:"03 · Especificações",guide:"Imagem 03 — Medidas reais: destacar as dimensões confirmadas SOBRE O CONTORNO DO PRODUTO com setas finas, e, quando confirmadas na WeDrop da SKU, microinformações laterais de capacidade e peso. Fundo ambientado moderno e nítido em HD. Sem título ESPECIFICAÇÕES, sem tabelas, faixas opacas nem excesso de textos."},
 {label:"04 · Benefícios",guide:"Imagem 04 — Benefícios: demonstrar visualmente as principais vantagens do produto. imagem com fundo ambientado. FRASES CURTAS DE BENEFICIO"},
 {label:"05 · Dor e solução",guide:"Imagem 05 — Dor e solução: representar uma necessidade do comprador e como o produto atende a essa necessidade. imagem com fundo ambientado FRASE CURTA"},
 {label:"06 · Persuasão",guide:"Imagem 06 — Persuasão: destacar um diferencial real com apresentação comercial. imagem com fundo ambientado. FRASE DE CONVERSÃO"},
 {label:"07 · Transformação",guide:"Imagem 07 — Transformação: demonstrar a experiência proporcionada pelo produto. imagem com fundo ambientado. FRASE DE CONVERSÃO"},
 {label:"08 · Quebra de objeções",guide:"Imagem 08 — Quebra de objeções: responder visualmente às três principais dúvidas do comprador, sem poluir a composição. imagem com fundo ambientado. FRASES CURTAS"},
 {label:"09 · Mockup e confiança",guide:"Imagem 09 — Mockup e confiança: apresentar o produto em cenário profissional com os três selos da loja: Compra Segura, Entrega Rápida e Atendimento Online. imagem com fundo ambientado"}
]);
export function createChatGptPrompts({imageUrls=[],supplierSourceText='',title='',imageNotes={},imagePrompts={},masterPrompt=''}={}){
 const original=(Array.isArray(imageUrls)?imageUrls:[]).find(x=>/^https:\/\//i.test(String(x||'')))||'';
 const scenes=CHATGPT_IMAGE_SCENES;
 // Cada slot leva seu próprio roteiro visual. Funciona em chat novo ou no
 // mesmo chat, sem depender da memória das imagens geradas anteriormente.
 const prompts=scenes.map(({guide},i)=>{
  const slot=i+1;
  // Priorizar a orientação específica salva da SKU (antes ignorada pelo motor).
  const customized=String(imagePrompts?.[slot]||'').trim().slice(0,15000);
  const note=String(imageNotes?.[slot]||'').trim().slice(0,500);
  const storeRule=String(masterPrompt||'').trim().slice(0,4500);
  const mandatory=[
   'REGRA ATUAL DA REDE ACHADOS BR (prevalece sobre roteiros antigos e orientações gerais): imagem única 1200×1200, foto realista fiel ao produto original; fundo ambientado moderno, nítido e visível em HD, com luz, ângulo e ambiente diferentes em cada uma das 9 posições. Nunca repetir personagens, poses e composição.',
   'Produto prioritário, tipografia discreta e sofisticada, frases curtas de conversão quando previstas; sem excesso de textos, painéis, números inventados ou títulos grandes. Imagem 01 com produto 85%–90%; imagem 09 com os três selos discretos.'
  ].join('\\n');
  return [
   customized||guide,
   imageScenePrompt({slot,title}),
   storeRule?'REGRAS DA LOJA (apenas se compatíveis com as instruções atuais): '+storeRule:'',
   note?'AJUSTE SALVO ESPECÍFICO DESTA IMAGEM: '+note:'',
   mandatory
  ].filter(Boolean).join('\\n\\n');
 });
 const dims=confirmedProductDimensionsFromWeDrop(supplierSourceText);
 const facts=confirmedProductSideFactsFromWeDrop(supplierSourceText);
 // A imagem gerada no ChatGPT deve ser uma BASE limpa: o Manager insere
 // SOMENTE os números exatos da WeDrop na imagem final. Não confiar em
 // letras/números que o modelo possa inventar, nem usar peso da caixa.
 prompts[2]=[
  prompts[2],
  dims?('MEDIDAS DO PRODUTO CONFIRMADAS NO TEXTO WEDROP DA SKU: '+
   dims.measurements.map(x=>x.label+': '+x.value).join('; ')+'.'):
   'NÃO HÁ MEDIDAS DO PRODUTO CONFIRMADAS NO TEXTO WEDROP DESTA SKU.',
  facts.length?'DADOS LATERAIS DISCRETOS CONFIRMADOS NA MESMA SKU: '+facts.map(x=>x.label+': '+x.value).join('; ')+'.':'NÃO adicionar informações laterais sem comprovação.',
  'IMPORTANTE: gere somente a fotografia original fiel do produto, com fundo moderno visível e nítido, e pequena área nas bordas para setas finas sobre o contorno.'+
  ' NÃO escreva nenhuma palavra, número, unidade, título, etiqueta, selo ou medida na foto gerada.'+
  ' O Manager adicionará setas finas, medidas sobre o contorno e dados laterais discretos verificados DEPOIS da geração.'+
  ' NUNCA estimar altura do selim, altura do guidão, tamanho/diâmetro da roda, largura ou comprimento por aparência.'+
  ' Não copiar dimensões de embalagem, frete ou campos isolados sem a indicação de dimensões do produto. Fundo em alta definição com arquitetura e detalhes reconhecíveis, sem aparência desfocada ou lavada.'
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
