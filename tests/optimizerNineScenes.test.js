import test from 'node:test';
import assert from 'node:assert/strict';
import {CHATGPT_IMAGE_SCENES,createChatGptPrompts} from '../public/chatgptPrompts.js';

const exact=[
'Imagem 01 — Capa: produto original ocupando aproximadamente 85% a 90% da imagem, fundo limpo e apresentação profissional. imagem com fundo ambientado',
'Imagem 02 — Uso real: mostrar o produto em um ambiente cotidiano de utilização, com composição diferente da capa. imagem com fundo ambientado',
'Imagem 03 — Especificações: apresentar as dimensões e características reais confirmadas. imagem com fundo ambientado',
'Imagem 04 — Benefícios: demonstrar visualmente as principais vantagens do produto. imagem com fundo ambientado',
'Imagem 05 — Dor e solução: representar uma necessidade do comprador e como o produto atende a essa necessidade. imagem com fundo ambientado',
'Imagem 06 — Persuasão: destacar um diferencial real com apresentação comercial. imagem com fundo ambientado',
'Imagem 07 — Transformação: demonstrar a experiência proporcionada pelo produto. imagem com fundo ambientado',
'Imagem 08 — Quebra de objeções: responder visualmente às três principais dúvidas do comprador, sem poluir a composição. imagem com fundo ambientado',
'Imagem 09 — Mockup e confiança: apresentar o produto em cenário profissional com os três selos da loja: Compra Segura, Entrega Rápida e Atendimento Online. imagem com fundo ambientado'
];

test('nove cenas exatamente conforme aprovação do vendedor',()=>{
 assert.deepEqual(CHATGPT_IMAGE_SCENES.map(x=>x.guide),exact);
});

test('nove comandos enxutos, distintos e exclusivos por posição, sem contexto da automação',()=>{
 const out=createChatGptPrompts({
  sku:'303448',title:'Caminhão Dinossauro com 3 Mini Carrinhos - Verde',
  masterPrompt:'SEQUÊNCIA DAS NOVE IMAGENS\n'+exact.join('\n'),
  imageUrls:['https://cf.shopee.com.br/file/reference'],
  supplierSourceText:'WeDrop CSV linha 57',supplierMetrics:[{name:'Dimensões',value:'16x9x35'}]
 });
 assert.equal(out.prompts.length,9);
 assert.equal(out.original,'https://cf.shopee.com.br/file/reference');
 for(let i=0;i<9;i++){
  const p=out.prompts[i];
  assert(p.includes(exact[i]),'faltou comando '+(i+1));
  assert(p.includes('SKU 303448'),'faltou SKU');
  assert(p.includes('IMAGEM '+String(i+1).padStart(2,'0')+'/09'),'posição incorreta');
  assert(p.length<1000,'prompt longo demais na posição '+(i+1));
  assert.equal(p.split(exact[i]).length-1,1,'cena duplicada');
  for(let j=0;j<9;j++)if(i!==j)assert(!p.includes(exact[j]),'contém outra cena '+(j+1));
  for(const extra of ['FONTE WE DROP','Identificador da solicitação','CONTEXTO DO PRODUTO E FOTO REAL','ROTEIRO APROVADO','INSTRUÇÃO EXCLUSIVA DA IMAGEM','SEQUÊNCIA DAS NOVE IMAGENS'])
   assert(!p.includes(extra),'metadado indevido: '+extra);
 }
});

test('observação individual não contamina outros comandos',()=>{
 const out=createChatGptPrompts({sku:'303448',title:'Brinquedo',imageNotes:{3:'Usar somente medidas comprovadas'}});
 assert(out.prompts[2].includes('Usar somente medidas comprovadas'));
 assert(!out.prompts[0].includes('Usar somente medidas comprovadas'));
});

test('prompt integral editado intencionalmente só substitui sua posição',()=>{
 const edited='Cena personalizada da imagem 05 para este produto, mantendo a foto real e as peças, com fundo ambientado. Uma imagem quadrada.';
 const out=createChatGptPrompts({sku:'303448',title:'Brinquedo',imagePrompts:{5:edited}});
 assert.equal(out.prompts[4],edited);
 assert(out.prompts[0].includes(exact[0]));
});
