import test from 'node:test';
import assert from 'node:assert/strict';
import {CHATGPT_IMAGE_SCENES,createChatGptPrompts} from '../public/chatgptPrompts.js';

const approved=[
'Imagem 01 — Capa: produto original ocupando aproximadamente 85% a 90% da imagem, fundo limpo e apresentação profissional. imagem com fundo ambientado',
'Imagem 02 — Uso real: mostrar o produto em um ambiente cotidiano de utilização, com composição diferente da capa. imagem com fundo ambientado. FRASES CURTAS DE CONVERSÃO',
'Imagem 03 — Especificações: apresentar SOMENTE as dimensões reais do produto ao lado dele, com setas discretas e fundo ambientado. Sem títulos, subtítulos, selos ou características adicionais.',
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
test('o Motor Matriz muda somente a imagem 03 e usa o texto colado da WeDrop',()=>{
 const supplierSourceText=['ALTURA','66cm','LARGURA','100cm','COMPRIMENTO','27cm',
  'Especificações:', 'Dimensões: 75cm altura x 63cm largura x 117cm comprimento'].join('\n');
 const result=createChatGptPrompts({
  sku:'2392',title:'Bicicleta Infantil Moto Cross Rosa',
  imageUrls:['https://cf.shopee.com.br/file/reference'],
  imageNotes:{3:'INJETAR_NOTA'},imagePrompts:{1:'INJETAR_CUSTOM'},
  masterPrompt:'INJETAR_PROMPT_MESTRE',supplierSourceText
 });
 assert.equal(result.original,'https://cf.shopee.com.br/file/reference');
 assert.equal(result.prompts.length,9);
 for(let i=0;i<9;i++){
  assert.ok(result.prompts[i].startsWith(approved[i]),'roteiro original preservado na posição '+(i+1));
  assert.match(result.prompts[i],/DIVERSIDADE OBRIGATÓRIA — CENA ÚNICA/);
  assert.match(result.prompts[i],/ÂNGULO E ENQUADRAMENTO:/);
  assert.match(result.prompts[i],/A FOTO DE REFERÊNCIA serve apenas para preservar o PRODUTO EXATO/);
 }
 assert.equal(result.batch,result.prompts[0]);
 const environments=result.prompts.map(p=>p.match(/AMBIENTE EXCLUSIVO: ([^\n]+)/)?.[1]);
 assert.equal(new Set(environments).size,9,'as nove cenas devem ter cenários distintos');
 assert.match(result.prompts[1],/criança A|Criança A/);
 assert.match(result.prompts[4],/Criança B/);
 assert.match(result.prompts[6],/Criança C/);
 assert.match(result.prompts[2],/Sem personagens/);
 const p=result.prompts[2];
 for(const expected of ['ALTURA: 75 cm','LARGURA: 63 cm','COMPRIMENTO: 117 cm','SOMENTE'])
  assert.match(p,new RegExp(expected));
 for(const disallowed of ['INJETAR_', '66 cm','100 cm','27 cm','selim 48'])
  assert(!p.includes(disallowed));
 assert.match(p,/NÃO escreva nenhuma palavra, número, unidade/);
});
test('sem medidas confirmadas a foto 03 não pode inferir dimensões',()=>{
 const {prompts,confirmedDimensions}=createChatGptPrompts({
  sku:'2392',supplierSourceText:'ALTURA\n66cm\nLARGURA\n100cm\nCOMPRIMENTO\n27cm'
 });
 assert.equal(confirmedDimensions,null);
 assert.match(prompts[2],/NÃO HÁ MEDIDAS DO PRODUTO CONFIRMADAS/);
 assert(!prompts[2].includes('66 cm'));
});
