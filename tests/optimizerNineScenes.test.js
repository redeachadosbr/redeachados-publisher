import test from 'node:test';
import assert from 'node:assert/strict';
import {CHATGPT_IMAGE_SCENES,createChatGptPrompts} from '../public/chatgptPrompts.js';

const approved=[
'Imagem 01 — Capa: produto original ocupando aproximadamente 85% a 90% da imagem, fundo limpo e apresentação profissional. imagem com fundo ambientado',
'Imagem 02 — Uso real: mostrar o produto em um ambiente cotidiano de utilização, com composição diferente da capa. imagem com fundo ambientado. FRASES CURTAS DE CONVERSÃO',
'Imagem 03 — Especificações: apresentar as dimensões e características reais confirmadas. imagem com fundo ambientado',
'Imagem 04 — Benefícios: demonstrar visualmente as principais vantagens do produto. imagem com fundo ambientado. FRASES CURTAS DE BENEFICIO',
'Imagem 05 — Dor e solução: representar uma necessidade do comprador e como o produto atende a essa necessidade. imagem com fundo ambientado FRASE CURTA',
'Imagem 06 — Persuasão: destacar um diferencial real com apresentação comercial. imagem com fundo ambientado. FRASE DE CONVERSÃO',
'Imagem 07 — Transformação: demonstrar a experiência proporcionada pelo produto. imagem com fundo ambientado. FRASE DE CONVERSÃO',
'Imagem 08 — Quebra de objeções: responder visualmente às três principais dúvidas do comprador, sem poluir a composição. imagem com fundo ambientado. FRASES CURTAS',
'Imagem 09 — Mockup e confiança: apresentar o produto em cenário profissional com os três selos da loja: Compra Segura, Entrega Rápida e Atendimento Online. imagem com fundo ambientado'
];

test('os 9 comandos são literalmente os 9 textos aprovados',()=>{
 assert.deepEqual(CHATGPT_IMAGE_SCENES.map(x=>x.guide),approved);
});
test('envia a cena e SOMENTE a cena: sem SKU, título, notas, dimensões ou texto operacional',()=>{
 const result=createChatGptPrompts({
  sku:'303448',title:'Caminhão Dinossauro com 3 Mini Carrinhos - Verde',
  imageUrls:['https://cf.shopee.com.br/file/reference'],
  imageNotes:{3:'INJETAR_NOTA'},imagePrompts:{1:'INJETAR_CUSTOM'},
  masterPrompt:'INJETAR_PROMPT_MESTRE',
  supplierSourceText:'INJETAR_WEDROP',supplierMetrics:[{name:'altura',value:99}]
 });
 assert.equal(result.original,'https://cf.shopee.com.br/file/reference');
 assert.deepEqual(result.prompts,approved);
 assert.equal(result.batch,approved[0]);
 for(const p of result.prompts){
  assert(p.length<330,'prompt precisa ser conciso e exato');
  for(const item of ['REDE ACHADOS BR — SKU','Produto:', 'INJETAR_', '1200','Faça uma imagem','SEQUÊNCIA DAS NOVE IMAGENS'])assert(!p.includes(item));
 }
});
test('o sistema gera apenas a cena solicitada por posição, sem qualquer outra instrução',()=>{
 const {prompts}=createChatGptPrompts({sku:'303448'});
 assert.equal(prompts.length,9);
 for(let i=0;i<9;i++){
  assert.equal(prompts[i],approved[i]);
  approved.forEach((x,j)=>{if(i!==j)assert(!prompts[i].includes(x));});
 }
});
